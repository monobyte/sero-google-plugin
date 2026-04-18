/**
 * useGoogleApi — hook for Google auth + data fetching.
 *
 * Auth: calls window.sero.google.login() for OAuth2 sign-in
 * Data: calls window.sero.google.execute() for gogcli commands
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  applyCalendarCalendarsResult,
  applyCalendarEventsResult,
  applyGmailSearchResult,
  applyGmailThreadResult,
} from '../../shared/google-state';
import type { GoogleAppState } from '../../shared/types';

type StateUpdater = (fn: (prev: GoogleAppState) => GoogleAppState) => void;

interface SeroGoogleBridge {
  execute: (service: string, args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  authStatus: () => Promise<{ configured: boolean; authenticated: boolean; email?: string }>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  onAuthEvent: (cb: (event: { type: string; message: string; email?: string }) => void) => () => void;
}

interface SeroPluginConfigBridge {
  read: (pluginId: string) => Promise<Record<string, unknown> | null>;
  write: (pluginId: string, config: Record<string, unknown>) => Promise<{ ok: boolean }>;
}

const PLUGIN_ID = 'sero-google-plugin';

interface GooglePluginWindow extends Window {
  sero?: {
    google?: SeroGoogleBridge;
    pluginConfig?: SeroPluginConfigBridge;
  };
}

function getSeroWindow(): GooglePluginWindow {
  return window as GooglePluginWindow;
}

function getSeroGoogle(): SeroGoogleBridge | null {
  return getSeroWindow().sero?.google ?? null;
}

function getPluginConfig(): SeroPluginConfigBridge | null {
  return getSeroWindow().sero?.pluginConfig ?? null;
}

// ── Auth types ───────────────────────────────────────────────

export type AuthStatus = 'unknown' | 'checking' | 'not-configured' | 'signed-out' | 'signing-in' | 'authenticated' | 'expired';

export interface AuthInfo {
  status: AuthStatus;
  email: string | null;
  error: string | null;
}

// ── API interface ────────────────────────────────────────────

export interface GoogleApi {
  loading: boolean;
  error: string | null;
  auth: AuthInfo;
  checkAuth: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  saveConfig: (clientId: string, clientSecret: string) => Promise<boolean>;
  fetchInbox: (query: string, max?: number) => Promise<void>;
  fetchThread: (threadId: string) => Promise<void>;
  fetchEvents: (view: 'today' | 'week') => Promise<void>;
  fetchEventsRange: (from: string, to: string) => Promise<void>;
  fetchCalendars: () => Promise<void>;
  sendEmail: (to: string, subject: string, body: string) => Promise<boolean>;
  archiveThread: (threadId: string) => Promise<boolean>;
}

const AUTH_ERROR_PATTERN = /401|unauthorized|token.*expired|token.*revoked|invalid.*credentials/i;

// ── Hook ─────────────────────────────────────────────────────

export function useGoogleApi(updateState: StateUpdater): GoogleApi {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthInfo>({ status: 'unknown', email: null, error: null });

  // Subscribe to auth progress events
  useEffect(() => {
    const api = getSeroGoogle();
    if (!api) return;
    const unsub = api.onAuthEvent((event) => {
      if (event.type === 'success') {
        setAuth({ status: 'authenticated', email: event.email ?? null, error: null });
      } else if (event.type === 'error') {
        setAuth((a) => ({ ...a, status: 'signed-out', error: event.message }));
      }
    });
    return unsub;
  }, []);

  // ── Auth ───────────────────────────────────────────────────

  const checkAuth = useCallback(async () => {
    setAuth((a) => ({ ...a, status: 'checking', error: null }));
    const api = getSeroGoogle();
    if (!api) { setAuth({ status: 'unknown', email: null, error: 'Bridge unavailable' }); return; }

    try {
      const status = await api.authStatus();
      if (!status.configured) {
        setAuth({ status: 'not-configured', email: null, error: null });
      } else if (status.authenticated) {
        setAuth({ status: 'authenticated', email: status.email ?? null, error: null });
        updateState((prev) => ({ ...prev, activeAccount: status.email ?? null }));
      } else {
        setAuth({ status: 'signed-out', email: null, error: null });
      }
    } catch (err) {
      setAuth({ status: 'unknown', email: null, error: String(err) });
    }
  }, [updateState]);

  const signIn = useCallback(async () => {
    const api = getSeroGoogle();
    if (!api) return;
    setAuth((a) => ({ ...a, status: 'signing-in', error: null }));
    try {
      await api.login();
      // Success handled by onAuthEvent listener
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuth((a) => ({ ...a, status: 'signed-out', error: msg }));
    }
  }, []);

  const signOut = useCallback(async () => {
    const api = getSeroGoogle();
    if (!api) return;
    await api.logout();
    setAuth({ status: 'signed-out', email: null, error: null });
    updateState((prev) => ({ ...prev, activeAccount: null }));
  }, [updateState]);

  const saveConfig = useCallback(async (clientId: string, clientSecret: string): Promise<boolean> => {
    const cfg = getPluginConfig();
    if (!cfg) return false;
    const result = await cfg.write(PLUGIN_ID, { clientId, clientSecret });
    if (result.ok) {
      await checkAuth();
    }
    return result.ok;
  }, [checkAuth]);

  // ── Data command executor ──────────────────────────────────

  const exec = useCallback(async (service: string, args: string[]): Promise<unknown | null> => {
    setLoading(true);
    setError(null);
    try {
      const api = getSeroGoogle();
      if (!api) { setError('Bridge unavailable'); return null; }
      const result = await api.execute(service, args);
      if (result.exitCode === 127) { setError('gogcli not found'); return null; }
      if (result.exitCode !== 0) {
        const msg = result.stderr.trim() || result.stdout.trim() || 'Command failed';

        // Detect auth-related failures and transition to expired state
        if (AUTH_ERROR_PATTERN.test(msg)) {
          setAuth((prev) => ({
            status: 'expired',
            email: prev.email,
            error: null,
          }));
        }

        setError(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
        return null;
      }
      try { return JSON.parse(result.stdout) as unknown; } catch { return result.stdout.trim(); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Data fetchers ──────────────────────────────────────────

  const fetchInbox = useCallback(async (query: string, max = 15) => {
    const data = await exec('gmail', ['search', query, '--max', String(max)]);
    if (!data) return;
    updateState((prev) => applyGmailSearchResult(prev, data, query));
  }, [exec, updateState]);

  const fetchThread = useCallback(async (threadId: string) => {
    const data = await exec('gmail', ['thread', 'get', threadId]);
    if (!data) return;
    updateState((prev) => applyGmailThreadResult(prev, data, threadId));
  }, [exec, updateState]);

  const fetchEvents = useCallback(async (view: 'today' | 'week') => {
    const flag = view === 'today' ? '--today' : '--week';
    const data = await exec('calendar', ['events', 'primary', flag]);
    if (!data) return;
    updateState((prev) => applyCalendarEventsResult(prev, data, {
      calendarId: 'primary',
      view,
    }));
  }, [exec, updateState]);

  const fetchEventsRange = useCallback(async (from: string, to: string) => {
    const data = await exec('calendar', ['events', 'primary', '--from', from, '--to', to, '--max', '50']);
    if (!data) return;
    updateState((prev) => applyCalendarEventsResult(prev, data, {
      calendarId: 'primary',
    }));
  }, [exec, updateState]);

  const fetchCalendars = useCallback(async () => {
    const data = await exec('calendar', ['calendars']);
    if (!data) return;
    updateState((prev) => applyCalendarCalendarsResult(prev, data));
  }, [exec, updateState]);

  const sendEmail = useCallback(async (to: string, subject: string, body: string): Promise<boolean> => {
    return (await exec('gmail', ['send', '--to', to, '--subject', subject, '--body', body])) !== null;
  }, [exec]);

  const archiveThread = useCallback(async (threadId: string): Promise<boolean> => {
    return (await exec('gmail', ['labels', 'modify', threadId, '--remove', 'INBOX'])) !== null;
  }, [exec]);

  return useMemo(() => ({
    loading, error, auth, checkAuth, signIn, signOut, saveConfig,
    fetchInbox, fetchThread, fetchEvents, fetchEventsRange, fetchCalendars, sendEmail, archiveThread,
  }), [loading, error, auth, checkAuth, signIn, signOut, saveConfig,
    fetchInbox, fetchThread, fetchEvents, fetchEventsRange, fetchCalendars, sendEmail, archiveThread]);
}

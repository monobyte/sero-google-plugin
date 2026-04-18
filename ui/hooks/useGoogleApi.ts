/**
 * useGoogleApi — hook for Google auth + data fetching.
 *
 * UI actions run through the generic app-tool bridge. The plugin-owned
 * extension tools remain the source of truth for auth/runtime behavior and
 * app-state writes, while the UI consumes the resulting state via useAppState().
 */

import { useCallback, useContext, useMemo, useState } from 'react';
import { AppContext, getSeroApi } from '@sero-ai/app-runtime';
import type { GoogleAppState } from '../../shared/types';

type StateUpdater = (fn: (prev: GoogleAppState) => GoogleAppState) => void;

interface AppToolResult {
  text: string;
  details: Record<string, unknown> | null;
  isError: boolean;
}

interface AppAgentToolInvoker {
  invokeTool(
    appId: string,
    workspaceId: string,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<AppToolResult>;
}

const GOOGLE_AUTH_TOOL = 'google_auth';
const AUTH_ERROR_PATTERN = /401|unauthorized|token.*expired|token.*revoked|invalid.*credentials/i;

interface GoogleAuthToolDetails {
  configured?: boolean;
  authenticated?: boolean;
  email?: string;
}

function readAuthDetails(result: AppToolResult): GoogleAuthToolDetails | null {
  const details = result.details;
  if (!details) return null;

  const configured = typeof details.configured === 'boolean' ? details.configured : undefined;
  const authenticated = typeof details.authenticated === 'boolean' ? details.authenticated : undefined;
  const email = typeof details.email === 'string' ? details.email : undefined;

  if (configured === undefined || authenticated === undefined) {
    return null;
  }

  return { configured, authenticated, email };
}

function getToolError(result: AppToolResult): string | null {
  if (!result.isError) return null;
  const message = result.text.trim();
  return message.startsWith('Error:') ? message.slice('Error:'.length).trim() : message;
}

function formatToolError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function isAppAgentToolInvoker(value: unknown): value is AppAgentToolInvoker {
  return typeof value === 'object'
    && value !== null
    && typeof Reflect.get(value, 'invokeTool') === 'function';
}

function truncateError(message: string): string {
  return message.length > 120 ? `${message.slice(0, 120)}…` : message;
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

// ── Hook ─────────────────────────────────────────────────────

export function useGoogleApi(updateState: StateUpdater): GoogleApi {
  const ctx = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthInfo>({ status: 'unknown', email: null, error: null });

  const syncActiveAccount = useCallback((email: string | null) => {
    updateState((prev) => ({ ...prev, activeAccount: email }));
  }, [updateState]);

  const runTool = useCallback(async (toolName: string, params: Record<string, unknown>): Promise<AppToolResult> => {
    if (!ctx?.appId || !ctx?.workspaceId) {
      throw new Error('[useGoogleApi] No app context — must be used inside a Sero app');
    }

    const { appAgent } = getSeroApi();
    if (!isAppAgentToolInvoker(appAgent)) {
      throw new Error('[useGoogleApi] App tool bridge unavailable');
    }

    return appAgent.invokeTool(ctx.appId, ctx.workspaceId, toolName, params);
  }, [ctx]);

  const applyAuthStatus = useCallback((status: GoogleAuthToolDetails) => {
    if (!status.configured) {
      syncActiveAccount(null);
      setAuth({ status: 'not-configured', email: null, error: null });
      return;
    }

    if (status.authenticated) {
      const email = status.email ?? null;
      syncActiveAccount(email);
      setAuth({ status: 'authenticated', email, error: null });
      return;
    }

    syncActiveAccount(null);
    setAuth({ status: 'signed-out', email: null, error: null });
  }, [syncActiveAccount]);

  const checkAuth = useCallback(async () => {
    setAuth((current) => ({ ...current, status: 'checking', error: null }));

    try {
      const result = await runTool(GOOGLE_AUTH_TOOL, { action: 'status' });
      const toolError = getToolError(result);
      if (toolError) {
        setAuth({ status: 'unknown', email: null, error: toolError });
        return;
      }

      const status = readAuthDetails(result);
      if (!status) {
        setAuth({ status: 'unknown', email: null, error: 'Auth status unavailable' });
        return;
      }

      applyAuthStatus(status);
    } catch (toolError) {
      setAuth({ status: 'unknown', email: null, error: formatToolError(toolError) });
    }
  }, [applyAuthStatus, runTool]);

  const signIn = useCallback(async () => {
    setAuth((current) => ({ ...current, status: 'signing-in', error: null }));

    try {
      const result = await runTool(GOOGLE_AUTH_TOOL, { action: 'login' });
      const toolError = getToolError(result);
      if (toolError) {
        setAuth((current) => ({
          status: 'signed-out',
          email: current.email,
          error: toolError,
        }));
        return;
      }

      const status = readAuthDetails(result);
      if (status) {
        applyAuthStatus(status);
        return;
      }

      await checkAuth();
    } catch (toolError) {
      setAuth((current) => ({
        status: 'signed-out',
        email: current.email,
        error: formatToolError(toolError),
      }));
    }
  }, [applyAuthStatus, checkAuth, runTool]);

  const signOut = useCallback(async () => {
    try {
      const result = await runTool(GOOGLE_AUTH_TOOL, { action: 'logout' });
      const toolError = getToolError(result);
      if (toolError) {
        setAuth((current) => ({ ...current, error: toolError }));
        return;
      }

      syncActiveAccount(null);
      setAuth({ status: 'signed-out', email: null, error: null });
    } catch (toolError) {
      setAuth((current) => ({ ...current, error: formatToolError(toolError) }));
    }
  }, [runTool, syncActiveAccount]);

  const saveConfig = useCallback(async (clientId: string, clientSecret: string): Promise<boolean> => {
    try {
      const result = await runTool(GOOGLE_AUTH_TOOL, {
        action: 'save_config',
        client_id: clientId,
        client_secret: clientSecret,
      });
      const toolError = getToolError(result);
      if (toolError) {
        return false;
      }

      await checkAuth();
      return true;
    } catch {
      return false;
    }
  }, [checkAuth, runTool]);

  const runDataTool = useCallback(async (
    toolName: 'gmail' | 'gcal',
    params: Record<string, unknown>,
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const result = await runTool(toolName, params);
      const toolError = getToolError(result);
      if (toolError) {
        if (AUTH_ERROR_PATTERN.test(toolError)) {
          setAuth((current) => ({
            status: 'expired',
            email: current.email,
            error: null,
          }));
        }

        setError(truncateError(toolError));
        return false;
      }

      return true;
    } catch (toolError) {
      setError(formatToolError(toolError));
      return false;
    } finally {
      setLoading(false);
    }
  }, [runTool]);

  const fetchInbox = useCallback(async (query: string, max = 15) => {
    await runDataTool('gmail', { action: 'search', query, max });
  }, [runDataTool]);

  const fetchThread = useCallback(async (threadId: string) => {
    await runDataTool('gmail', { action: 'read_thread', thread_id: threadId });
  }, [runDataTool]);

  const fetchEvents = useCallback(async (view: 'today' | 'week') => {
    await runDataTool('gcal', { action: view, calendar_id: 'primary' });
  }, [runDataTool]);

  const fetchEventsRange = useCallback(async (from: string, to: string) => {
    await runDataTool('gcal', {
      action: 'range',
      calendar_id: 'primary',
      from,
      to,
      max: 50,
    });
  }, [runDataTool]);

  const fetchCalendars = useCallback(async () => {
    await runDataTool('gcal', { action: 'calendars' });
  }, [runDataTool]);

  const sendEmail = useCallback(async (to: string, subject: string, body: string): Promise<boolean> => {
    return runDataTool('gmail', { action: 'send', to, subject, body });
  }, [runDataTool]);

  const archiveThread = useCallback(async (threadId: string): Promise<boolean> => {
    return runDataTool('gmail', { action: 'archive', thread_id: threadId });
  }, [runDataTool]);

  return useMemo(() => ({
    loading,
    error,
    auth,
    checkAuth,
    signIn,
    signOut,
    saveConfig,
    fetchInbox,
    fetchThread,
    fetchEvents,
    fetchEventsRange,
    fetchCalendars,
    sendEmail,
    archiveThread,
  }), [
    loading,
    error,
    auth,
    checkAuth,
    signIn,
    signOut,
    saveConfig,
    fetchInbox,
    fetchThread,
    fetchEvents,
    fetchEventsRange,
    fetchCalendars,
    sendEmail,
    archiveThread,
  ]);
}

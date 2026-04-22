// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_GOOGLE_STATE, type GoogleAppState } from '../../shared/types';
import { useGoogleApi } from './useGoogleApi';

const runMock = vi.fn();

vi.mock('@sero-ai/app-runtime', async () => {
  const React = await import('react');
  return {
    AppContext: React.createContext({
      appId: 'google',
      workspaceId: 'global',
      workspacePath: '/workspace',
      stateFilePath: '/workspace/.sero/apps/google/state.json',
    }),
    getSeroApi: () => ({
      appAgent: {
        invokeTool: runMock,
      },
    }),
  };
});

interface ToolResultOptions {
  text: string;
  details?: Record<string, unknown> | null;
  isError?: boolean;
}

function makeToolResult({ text, details = null, isError = false }: ToolResultOptions) {
  return {
    text,
    content: [{ type: 'text' as const, text }],
    details,
    isError,
  };
}

function makeAuthResult(configured: boolean, authenticated: boolean, email?: string) {
  return makeToolResult({
    text: authenticated ? `Signed in as ${email}` : configured ? 'Signed out' : 'Google OAuth is not configured',
    details: email ? { configured, authenticated, email } : { configured, authenticated },
  });
}

function makeErrorResult(message: string) {
  return makeToolResult({
    text: `Error: ${message}`,
    isError: true,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createStateHarness(initialState: GoogleAppState = structuredClone(DEFAULT_GOOGLE_STATE)) {
  let state = initialState;
  const updateState = (fn: (prev: GoogleAppState) => GoogleAppState) => {
    state = fn(state);
  };
  return {
    updateState,
    getState: () => state,
  };
}

describe('useGoogleApi', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('keeps the sign-in UI transitions while using the generic app-tool bridge', async () => {
    const stateHarness = createStateHarness();
    const login = createDeferred<ReturnType<typeof makeToolResult>>();
    runMock.mockReturnValueOnce(login.promise);

    const { result } = renderHook(() => useGoogleApi(stateHarness.updateState));

    let signInPromise!: Promise<void>;
    act(() => {
      signInPromise = result.current.signIn();
    });

    expect(runMock).toHaveBeenCalledWith('google', 'global', 'google_auth', { action: 'login' });
    expect(result.current.auth).toEqual({
      status: 'signing-in',
      email: null,
      error: null,
    });

    login.resolve(makeAuthResult(true, true, 'alice@example.com'));

    await act(async () => {
      await signInPromise;
    });

    expect(result.current.auth).toEqual({
      status: 'authenticated',
      email: 'alice@example.com',
      error: null,
    });
    expect(stateHarness.getState().activeAccount).toBe('alice@example.com');
  });

  it('transitions to expired and recovers through plugin-owned auth actions', async () => {
    const stateHarness = createStateHarness();
    runMock
      .mockResolvedValueOnce(makeAuthResult(true, true, 'alice@example.com'))
      .mockResolvedValueOnce(makeErrorResult('401 unauthorized'))
      .mockResolvedValueOnce(makeAuthResult(true, true, 'alice@example.com'));

    const { result } = renderHook(() => useGoogleApi(stateHarness.updateState));

    await act(async () => {
      await result.current.checkAuth();
    });
    expect(result.current.auth.status).toBe('authenticated');

    await act(async () => {
      await result.current.fetchInbox('newer_than:7d');
    });

    expect(runMock).toHaveBeenNthCalledWith(2, 'google', 'global', 'gmail', {
      action: 'search',
      query: 'newer_than:7d',
      max: 15,
    });
    expect(result.current.auth).toEqual({
      status: 'expired',
      email: 'alice@example.com',
      error: null,
    });
    expect(result.current.error).toBe('401 unauthorized');

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.auth).toEqual({
      status: 'authenticated',
      email: 'alice@example.com',
      error: null,
    });
  });

  it('routes inbox and thread fetches through plugin tools instead of a bespoke Google bridge', async () => {
    const stateHarness = createStateHarness();

    runMock.mockImplementation(async (_appId: string, _workspaceId: string, toolName: string, params: Record<string, unknown>) => {
      if (toolName === 'gmail' && params.action === 'search') {
        stateHarness.updateState((prev) => ({
          ...prev,
          gmail: {
            ...prev.gmail,
            lastQuery: String(params.query),
            lastFetchedAt: '2026-04-18T10:00:00.000Z',
            threads: [{
              id: 'thread-1',
              snippet: 'Build is green.',
              subject: 'Release update',
              from: 'Alice <alice@example.com>',
              date: '2026-04-18T10:00:00.000Z',
              labelIds: ['INBOX'],
              isUnread: true,
              messageCount: 2,
            }],
          },
        }));
        return makeToolResult({ text: 'Fetched inbox' });
      }

      if (toolName === 'gmail' && params.action === 'read_thread') {
        stateHarness.updateState((prev) => ({
          ...prev,
          gmail: {
            ...prev.gmail,
            selectedThreadId: String(params.thread_id),
            selectedMessages: [{
              id: 'msg-1',
              threadId: String(params.thread_id),
              from: 'Alice <alice@example.com>',
              to: 'me@example.com',
              subject: 'Release update',
              date: '2026-04-18T10:02:00.000Z',
              body: 'Build is green.',
              bodyHtml: '<p>Build is <strong>green</strong>.</p>',
              snippet: 'Build is green.',
            }],
          },
        }));
        return makeToolResult({ text: 'Fetched thread' });
      }

      throw new Error(`Unexpected tool call: ${toolName}`);
    });

    const { result } = renderHook(() => useGoogleApi(stateHarness.updateState));

    await act(async () => {
      await result.current.fetchInbox('label:inbox', 5);
    });

    expect(runMock).toHaveBeenNthCalledWith(1, 'google', 'global', 'gmail', {
      action: 'search',
      query: 'label:inbox',
      max: 5,
    });
    expect(stateHarness.getState().gmail.threads).toHaveLength(1);
    expect(stateHarness.getState().gmail.lastQuery).toBe('label:inbox');

    await act(async () => {
      await result.current.fetchThread('thread-1');
    });

    expect(runMock).toHaveBeenNthCalledWith(2, 'google', 'global', 'gmail', {
      action: 'read_thread',
      thread_id: 'thread-1',
    });
    expect(stateHarness.getState().gmail.selectedThreadId).toBe('thread-1');
    expect(stateHarness.getState().gmail.selectedMessages[0]?.bodyHtml).toContain('<strong>green</strong>');
    expect(result.current.error).toBeNull();
  });

  it('routes calendar fetches through plugin tools and preserves rich event detail state', async () => {
    const stateHarness = createStateHarness({
      ...structuredClone(DEFAULT_GOOGLE_STATE),
      activeTab: 'calendar',
    });

    runMock.mockImplementation(async (_appId: string, _workspaceId: string, toolName: string, params: Record<string, unknown>) => {
      if (toolName !== 'gcal') {
        throw new Error(`Unexpected tool call: ${toolName}`);
      }

      if (params.action === 'today') {
        stateHarness.updateState((prev) => ({
          ...prev,
          calendar: {
            ...prev.calendar,
            view: 'today',
            lastFetchedAt: '2026-04-18T11:00:00.000Z',
          },
        }));
        return makeToolResult({ text: 'Fetched today' });
      }

      if (params.action === 'range') {
        stateHarness.updateState((prev) => ({
          ...prev,
          calendar: {
            ...prev.calendar,
            lastFetchedAt: '2026-04-18T11:05:00.000Z',
            events: [{
              id: 'event-1',
              calendarId: 'primary',
              summary: 'Team Sync',
              start: '2026-04-18T15:00:00.000Z',
              end: '2026-04-18T15:30:00.000Z',
              location: 'Conference Room A',
              description: 'Quarterly planning review',
              attendees: ['alice@example.com (accepted)', 'bob@example.com (tentative)'],
              isAllDay: false,
              status: 'confirmed',
              htmlLink: 'https://calendar.google.com/event?eid=event-1',
              visibility: 'private',
              eventType: 'default',
              sourceUrl: 'https://mail.google.com/mail/u/0/#inbox',
              reminders: [{ method: 'popup', minutes: 10 }],
              created: '2026-04-17T12:00:00.000Z',
              updated: '2026-04-18T10:30:00.000Z',
            }],
          },
        }));
        return makeToolResult({ text: 'Fetched range' });
      }

      if (params.action === 'calendars') {
        stateHarness.updateState((prev) => ({
          ...prev,
          calendar: {
            ...prev.calendar,
            calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
          },
        }));
        return makeToolResult({ text: 'Fetched calendars' });
      }

      throw new Error(`Unexpected gcal action: ${String(params.action)}`);
    });

    const { result } = renderHook(() => useGoogleApi(stateHarness.updateState));

    await act(async () => {
      await result.current.fetchEvents('today');
      await result.current.fetchEventsRange('2026-04-01', '2026-05-01');
      await result.current.fetchEventsDate('2026-04-18');
      await result.current.fetchCalendars();
    });

    expect(runMock).toHaveBeenNthCalledWith(1, 'google', 'global', 'gcal', {
      action: 'today',
      calendar_id: 'primary',
    });
    expect(runMock).toHaveBeenNthCalledWith(2, 'google', 'global', 'gcal', {
      action: 'range',
      calendar_id: 'primary',
      from: '2026-04-01',
      to: '2026-05-01',
      max: 50,
    });
    expect(runMock).toHaveBeenNthCalledWith(3, 'google', 'global', 'gcal', {
      action: 'range',
      calendar_id: 'primary',
      from: '2026-04-18',
      to: '2026-04-19',
      max: 50,
      merge: true,
    });
    expect(runMock).toHaveBeenNthCalledWith(4, 'google', 'global', 'gcal', { action: 'calendars' });

    expect(stateHarness.getState().calendar.calendars).toEqual([
      { id: 'primary', summary: 'Primary', primary: true },
    ]);
    expect(stateHarness.getState().calendar.events[0]).toMatchObject({
      summary: 'Team Sync',
      location: 'Conference Room A',
      visibility: 'private',
      reminders: [{ method: 'popup', minutes: 10 }],
    });
  });
});

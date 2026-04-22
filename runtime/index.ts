import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeModule,
} from '@sero-ai/common';

import { runGogJson } from '../extension/gogcli';
import { getGoogleAuthManager } from '../extension/google/auth';
import { applyGmailSearchResult } from '../shared/google-state';
import {
  DEFAULT_GOOGLE_STATE,
  normalizeGoogleState,
  type GoogleAppState,
} from '../shared/types';

const DEFAULT_INBOX_QUERY = 'newer_than:3d';
const INBOX_MAX_RESULTS = 15;
const MINUTE_MS = 60_000;

interface GmailSearchResponse {
  threads?: unknown[];
}

function extractSenderName(from: string): string {
  if (!from) return 'someone';

  const match = from.match(/^(.+?)\s*<.+>$/);
  if (match?.[1]) {
    return match[1].replace(/^["']|["']$/g, '').trim();
  }

  if (from.includes('@')) {
    return from.split('@')[0] || from;
  }

  return from;
}

function isNewUnreadActivity(
  previousThread: GoogleAppState['gmail']['threads'][number] | undefined,
  nextThread: GoogleAppState['gmail']['threads'][number],
): boolean {
  if (!nextThread.isUnread) return false;
  if (!previousThread) return true;

  return !previousThread.isUnread
    || previousThread.messageCount !== nextThread.messageCount
    || previousThread.date !== nextThread.date
    || previousThread.snippet !== nextThread.snippet;
}

function getRefreshIntervalMs(state: GoogleAppState): number {
  const minutes = state.gmail.autoRefreshIntervalMinutes;
  return Number.isFinite(minutes) && minutes > 0
    ? minutes * MINUTE_MS
    : DEFAULT_GOOGLE_STATE.gmail.autoRefreshIntervalMinutes * MINUTE_MS;
}

function shouldRefreshInbox(state: GoogleAppState, nowMs: number = Date.now()): boolean {
  if (!state.gmail.lastFetchedAt) return true;
  const fetchedAtMs = new Date(state.gmail.lastFetchedAt).getTime();
  if (Number.isNaN(fetchedAtMs)) return true;
  return nowMs - fetchedAtMs >= getRefreshIntervalMs(state);
}

export class GoogleRuntime implements AppRuntime {
  private currentState = structuredClone(DEFAULT_GOOGLE_STATE);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private syncPromise: Promise<void> | null = null;

  constructor(private readonly ctx: AppRuntimeContext) {}

  async start(): Promise<void> {
    const state = await this.ctx.host.appState.read<GoogleAppState>(this.ctx.stateFilePath);
    if (state) {
      this.currentState = normalizeGoogleState(state);
    }

    this.scheduleRefreshTimer();
    await this.syncInboxIfNeeded();
  }

  async handleStateChange(state: unknown): Promise<void> {
    const previousState = this.currentState;
    this.currentState = normalizeGoogleState(state);

    if (getRefreshIntervalMs(previousState) !== getRefreshIntervalMs(this.currentState)) {
      this.scheduleRefreshTimer();
      await this.syncInboxIfNeeded(true);
      return;
    }

    if (!previousState.activeAccount && this.currentState.activeAccount) {
      await this.syncInboxIfNeeded(true);
    }
  }

  async dispose(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    await this.syncPromise;
  }

  private scheduleRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    const intervalMs = getRefreshIntervalMs(this.currentState);
    this.refreshTimer = setInterval(() => {
      this.syncInboxIfNeeded().catch((error) => {
        console.warn('[google-runtime] scheduled inbox sync failed:', error);
      });
    }, intervalMs);
  }

  private async syncInboxIfNeeded(force = false): Promise<void> {
    if (this.syncPromise) {
      return this.syncPromise;
    }
    if (!force && !shouldRefreshInbox(this.currentState)) {
      return;
    }

    const query = this.currentState.gmail.lastQuery || DEFAULT_INBOX_QUERY;
    this.syncPromise = this.syncInbox(query);

    try {
      await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  private async syncInbox(query: string): Promise<void> {
    const auth = getGoogleAuthManager();
    const status = await auth.getStatus();
    if (!status.configured || !status.authenticated) {
      return;
    }

    const { data, error } = await runGogJson<GmailSearchResponse>([
      'gmail',
      'search',
      query,
      '--max',
      String(INBOX_MAX_RESULTS),
    ]);
    if (error || !data?.threads) {
      if (error) {
        console.warn('[google-runtime] background inbox sync failed:', error);
      } else {
        console.warn('[google-runtime] sync-missing-thread-data');
      }
      return;
    }

    let previousState = this.currentState;
    let nextState = this.currentState;

    await this.ctx.host.appState.update<GoogleAppState>(this.ctx.stateFilePath, (current) => {
      previousState = normalizeGoogleState(current);
      nextState = applyGmailSearchResult(previousState, data, query);
      this.currentState = nextState;
      return nextState;
    });

    this.notifyAboutNewMail(previousState, nextState);
  }

  private notifyAboutNewMail(previousState: GoogleAppState, nextState: GoogleAppState): void {
    if (!nextState.gmail.notificationsEnabled) {
      return;
    }
    if (!previousState.gmail.lastFetchedAt) {
      return;
    }

    const previousThreadsById = new Map(previousState.gmail.threads.map((thread) => [thread.id, thread]));
    const changedUnreadThreads = nextState.gmail.threads.filter((thread) => (
      isNewUnreadActivity(previousThreadsById.get(thread.id), thread)
    ));

    if (changedUnreadThreads.length === 0) {
      return;
    }

    if (changedUnreadThreads.length === 1) {
      const [thread] = changedUnreadThreads;
      this.ctx.host.notifications.notify({
        message: `New mail from ${extractSenderName(thread.from)}`,
        subtitle: thread.subject,
        source: 'Google Mail',
        type: 'info',
        sound: true,
      });
      return;
    }

    this.ctx.host.notifications.notify({
      message: `${changedUnreadThreads.length} new emails received`,
      subtitle: changedUnreadThreads[0]?.subject,
      source: 'Google Mail',
      type: 'info',
      sound: true,
    });
  }
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  return new GoogleRuntime(ctx);
}

export default {
  createAppRuntime,
} satisfies AppRuntimeModule;

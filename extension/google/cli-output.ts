import type { GogResult } from './cli-runtime';
import { gogResultToCliResult } from './cli-runtime';
import type { GoogleCliResult } from './cli-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getStringArray(value: unknown): string[] {
  return getArray(value)
    .map((entry) => getString(entry))
    .filter(Boolean);
}

function formatHeader(title: string, count: number): string {
  return `${title} (${count})`;
}

function truncateLine(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function summarizeGmailThreads(parsed: Record<string, unknown>): string | null {
  const threads = getArray(parsed.threads);
  if (threads.length === 0) return 'No Gmail threads found.';

  const lines = [formatHeader('Gmail threads', threads.length)];
  for (const threadValue of threads.slice(0, 8)) {
    const thread = getRecord(threadValue) ?? {};
    const firstMessage = getRecord(getArray(thread.messages)[0]) ?? {};
    const labels = getStringArray(firstMessage.labels).length > 0
      ? getStringArray(firstMessage.labels)
      : getStringArray(thread.labelIds);
    const unread = labels.includes('UNREAD') ? ' [unread]' : '';
    const subject = getString(firstMessage.subject) || getString(thread.subject) || '(no subject)';
    const from = getString(firstMessage.from) || getString(thread.from);
    const date = getString(firstMessage.date) || getString(thread.date);
    const summary = [truncateLine(subject), from, date].filter(Boolean).join(' — ');
    lines.push(`• ${summary}${unread}`);

    const snippet = getString(thread.snippet);
    if (snippet) {
      lines.push(`  ${truncateLine(snippet, 140)}`);
    }
  }

  if (threads.length > 8) {
    lines.push(`… ${threads.length - 8} more thread(s)`);
  }

  return lines.join('\n');
}

function resolveEventStart(event: Record<string, unknown>): string {
  const start = getRecord(event.start);
  return getString(start?.dateTime)
    || getString(start?.date)
    || getString(event.startLocal)
    || '(unscheduled)';
}

function summarizeCalendarEvents(parsed: Record<string, unknown>): string | null {
  const events = getArray(parsed.events);
  if (events.length === 0) return 'No calendar events found.';

  const lines = [formatHeader('Calendar events', events.length)];
  for (const eventValue of events.slice(0, 10)) {
    const event = getRecord(eventValue) ?? {};
    const start = resolveEventStart(event);
    const summary = getString(event.summary) || '(no title)';
    const location = getString(event.location);
    const detail = [start, truncateLine(summary), location].filter(Boolean).join(' — ');
    lines.push(`• ${detail}`);
  }

  if (events.length > 10) {
    lines.push(`… ${events.length - 10} more event(s)`);
  }

  return lines.join('\n');
}

function summarizeCalendars(parsed: Record<string, unknown>): string | null {
  const calendars = getArray(parsed.calendars);
  if (calendars.length === 0) return 'No Google calendars found.';

  const lines = [formatHeader('Google calendars', calendars.length)];
  for (const calendarValue of calendars) {
    const calendar = getRecord(calendarValue) ?? {};
    const summary = getString(calendar.summary) || getString(calendar.id) || '(unnamed calendar)';
    const primary = calendar.primary === true ? ' [primary]' : '';
    lines.push(`• ${truncateLine(summary)}${primary}`);
  }
  return lines.join('\n');
}

function summarizeGmailThread(parsed: Record<string, unknown>): string | null {
  const thread = getRecord(parsed.thread);
  const messages = thread ? getArray(thread.messages) : getArray(parsed.messages);
  if (messages.length === 0) return null;

  const lines = [formatHeader('Gmail messages', messages.length)];
  for (const messageValue of messages.slice(0, 8)) {
    const message = getRecord(messageValue) ?? {};
    const subject = getString(message.subject) || '(no subject)';
    const from = getString(message.from);
    const date = getString(message.date);
    const summary = [truncateLine(subject), from, date].filter(Boolean).join(' — ');
    lines.push(`• ${summary}`);

    const snippet = getString(message.snippet);
    if (snippet) {
      lines.push(`  ${truncateLine(snippet, 140)}`);
    }
  }
  return lines.join('\n');
}

function summarizeGoogleJson(
  service: string,
  action: string,
  parsed: Record<string, unknown>,
): string | null {
  if (service === 'gmail' && action === 'search') return summarizeGmailThreads(parsed);
  if (service === 'gmail' && (action === 'thread' || action === 'get')) return summarizeGmailThread(parsed);
  if (service === 'calendar' && (action === 'events' || action === 'search' || action === 'conflicts')) {
    return summarizeCalendarEvents(parsed);
  }
  if (service === 'calendar' && action === 'calendars') return summarizeCalendars(parsed);
  return null;
}

export function formatGoogleCliResult(
  service: string,
  action: string,
  result: GogResult,
): GoogleCliResult {
  const base = gogResultToCliResult(result);
  if (base.exitCode !== 0) return base;

  const stdout = result.stdout.trim();
  if (!stdout.startsWith('{') && !stdout.startsWith('[')) {
    return base;
  }

  try {
    const parsed = JSON.parse(stdout) as unknown;
    const record = getRecord(parsed);
    if (!record) {
      return {
        ...base,
        details: { rawOutput: stdout },
      };
    }

    const summary = summarizeGoogleJson(service, action, record);
    if (!summary) {
      return {
        ...base,
        details: { rawOutput: stdout },
      };
    }

    return {
      output: summary,
      exitCode: 0,
      details: {
        rawOutput: stdout,
        summaryType: `${service}:${action}`,
      },
    };
  } catch {
    return base;
  }
}

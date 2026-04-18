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

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getHeaderValue(headers: unknown, name: string): string {
  const target = name.toLowerCase();
  for (const headerValue of getArray(headers)) {
    const header = getRecord(headerValue);
    if (!header) continue;
    if (getString(header.name).toLowerCase() !== target) continue;
    return getString(header.value);
  }
  return '';
}

function formatHeader(title: string, count: number): string {
  return `${title} (${count})`;
}

function truncateLine(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

interface GmailMessageFields {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
}

function extractGmailMessageFields(messageValue: unknown): GmailMessageFields {
  const message = getRecord(messageValue) ?? {};
  const payload = getRecord(message.payload);
  const headers = payload?.headers;

  return {
    id: getString(message.id),
    threadId: getString(message.threadId),
    subject: getString(message.subject) || getHeaderValue(headers, 'Subject') || '(no subject)',
    from: getString(message.from) || getHeaderValue(headers, 'From'),
    to: getString(message.to) || getHeaderValue(headers, 'To'),
    date: getString(message.date) || getHeaderValue(headers, 'Date'),
    snippet: getString(message.snippet),
  };
}

function summarizeGmailThreads(parsed: Record<string, unknown>): string | null {
  const threads = getArray(parsed.threads);
  if (threads.length === 0) return 'No Gmail threads found.';

  const lines = [formatHeader('Gmail threads', threads.length)];
  for (const threadValue of threads.slice(0, 8)) {
    const thread = getRecord(threadValue) ?? {};
    const firstMessage = extractGmailMessageFields(getArray(thread.messages)[0]);
    const labels = getStringArray(getRecord(getArray(thread.messages)[0])?.labels).length > 0
      ? getStringArray(getRecord(getArray(thread.messages)[0])?.labels)
      : getStringArray(thread.labelIds);
    const unread = labels.includes('UNREAD') ? ' [unread]' : '';
    const subject = firstMessage.subject || getString(thread.subject) || '(no subject)';
    const from = firstMessage.from || getString(thread.from);
    const date = firstMessage.date || getString(thread.date);
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

function summarizeGmailMessages(parsed: Record<string, unknown>): string | null {
  const thread = getRecord(parsed.thread);
  const messages = thread ? getArray(thread.messages) : getArray(parsed.messages);
  if (messages.length === 0) return null;

  const lines = [formatHeader('Gmail messages', messages.length)];
  for (const messageValue of messages.slice(0, 8)) {
    const message = extractGmailMessageFields(messageValue);
    const summary = [truncateLine(message.subject), message.from || message.to, message.date]
      .filter(Boolean)
      .join(' — ');
    lines.push(`• ${summary}`);

    if (message.snippet) {
      lines.push(`  ${truncateLine(message.snippet, 140)}`);
    }
  }
  return lines.join('\n');
}

function summarizeGmailLabelList(parsed: Record<string, unknown>): string | null {
  const labels = getArray(parsed.labels);
  if (labels.length === 0) return 'No Gmail labels found.';

  const lines = [formatHeader('Gmail labels', labels.length)];
  for (const labelValue of labels.slice(0, 20)) {
    const label = getRecord(labelValue) ?? {};
    const name = getString(label.name) || getString(label.id) || '(unnamed label)';
    const type = getString(label.type);
    const threadsTotal = getNumber(label.threadsTotal);
    const messagesTotal = getNumber(label.messagesTotal);
    const metadata = [
      type && `[${type.toLowerCase()}]`,
      threadsTotal !== null ? `${threadsTotal} thread(s)` : '',
      messagesTotal !== null ? `${messagesTotal} message(s)` : '',
    ].filter(Boolean).join(' — ');
    lines.push(metadata ? `• ${truncateLine(name)} ${metadata}` : `• ${truncateLine(name)}`);
  }

  if (labels.length > 20) {
    lines.push(`… ${labels.length - 20} more label(s)`);
  }

  return lines.join('\n');
}

function summarizeGmailLabelMutation(prefix: string, parsed: Record<string, unknown>): string | null {
  const label = getRecord(parsed.label) ?? parsed;
  const name = getString(label.name);
  const labelId = getString(label.id);
  const threadId = getString(parsed.threadId);
  const labelIds = getStringArray(parsed.labelIds);

  const lines = [prefix];
  const detail = [
    name || labelId ? `${name || labelId}` : '',
    threadId ? `thread ${threadId}` : '',
    labelIds.length > 0 ? `labels: ${labelIds.join(', ')}` : '',
  ].filter(Boolean).join(' — ');

  if (detail) lines.push(`• ${truncateLine(detail, 160)}`);
  return lines.join('\n');
}

function summarizeDrafts(parsed: Record<string, unknown>): string | null {
  const drafts = getArray(parsed.drafts);
  if (drafts.length === 0) return 'No Gmail drafts found.';

  const lines = [formatHeader('Gmail drafts', drafts.length)];
  for (const draftValue of drafts.slice(0, 10)) {
    const draft = getRecord(draftValue) ?? {};
    const draftId = getString(draft.id);
    const message = extractGmailMessageFields(draft.message);
    const summary = [truncateLine(message.subject), message.to || message.from, message.date]
      .filter(Boolean)
      .join(' — ');
    lines.push(`• ${summary || `(draft ${draftId || 'unknown'})`}`);
    if (draftId) {
      lines.push(`  id: ${draftId}`);
    }
    if (message.snippet) {
      lines.push(`  ${truncateLine(message.snippet, 140)}`);
    }
  }

  if (drafts.length > 10) {
    lines.push(`… ${drafts.length - 10} more draft(s)`);
  }

  return lines.join('\n');
}

function summarizeDraftMutation(prefix: string, parsed: Record<string, unknown>): string | null {
  const draft = getRecord(parsed.draft) ?? parsed;
  const draftId = getString(draft.id) || getString(parsed.id);
  const message = extractGmailMessageFields(draft.message ?? parsed.message ?? parsed);
  const lines = [prefix];
  const summary = [truncateLine(message.subject), message.to || message.from, message.date]
    .filter(Boolean)
    .join(' — ');

  if (summary) lines.push(`• ${summary}`);
  if (draftId) lines.push(`• id: ${draftId}`);
  if (message.threadId) lines.push(`• thread: ${message.threadId}`);
  return lines.join('\n');
}

function summarizeGmailSend(parsed: Record<string, unknown>): string | null {
  const message = extractGmailMessageFields(parsed.message ?? parsed);
  const lines = ['Gmail message sent'];
  const summary = [truncateLine(message.subject), message.to || message.from, message.date]
    .filter(Boolean)
    .join(' — ');
  if (summary) lines.push(`• ${summary}`);
  if (message.id) lines.push(`• id: ${message.id}`);
  if (message.threadId) lines.push(`• thread: ${message.threadId}`);
  return lines.join('\n');
}

function resolveEventStart(event: Record<string, unknown>): string {
  const start = getRecord(event.start);
  return getString(start?.dateTime)
    || getString(start?.date)
    || getString(event.startLocal)
    || '(unscheduled)';
}

function extractCalendarEvent(parsed: Record<string, unknown>): Record<string, unknown> | null {
  const event = getRecord(parsed.event);
  if (event) return event;
  if ('summary' in parsed || 'start' in parsed || 'htmlLink' in parsed) return parsed;
  return null;
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

function summarizeSingleCalendarEvent(prefix: string, parsed: Record<string, unknown>): string | null {
  const event = extractCalendarEvent(parsed);
  if (!event) return null;

  const start = resolveEventStart(event);
  const summary = getString(event.summary) || '(no title)';
  const location = getString(event.location);
  const eventId = getString(event.id);
  const lines = [prefix, `• ${[start, truncateLine(summary), location].filter(Boolean).join(' — ')}`];
  if (eventId) lines.push(`• id: ${eventId}`);
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

function summarizeFreeBusy(parsed: Record<string, unknown>): string | null {
  const calendars = getRecord(parsed.calendars);
  if (!calendars) return null;

  const entries = Object.entries(calendars);
  if (entries.length === 0) return 'No free/busy calendar data returned.';

  const lines = [formatHeader('Google free/busy', entries.length)];
  for (const [calendarId, availabilityValue] of entries.slice(0, 10)) {
    const availability = getRecord(availabilityValue) ?? {};
    const busyBlocks = getArray(availability.busy);
    if (busyBlocks.length === 0) {
      lines.push(`• ${calendarId} — free`);
      continue;
    }

    lines.push(`• ${calendarId} — busy ${busyBlocks.length} block(s)`);
    for (const busyValue of busyBlocks.slice(0, 3)) {
      const busy = getRecord(busyValue) ?? {};
      const start = getString(busy.start) || '(start unknown)';
      const end = getString(busy.end) || '(end unknown)';
      lines.push(`  ${start} → ${end}`);
    }
    if (busyBlocks.length > 3) {
      lines.push(`  … ${busyBlocks.length - 3} more block(s)`);
    }
  }

  if (entries.length > 10) {
    lines.push(`… ${entries.length - 10} more calendar(s)`);
  }

  return lines.join('\n');
}

function summarizeGoogleJson(
  service: string,
  action: string,
  parsed: Record<string, unknown>,
): string | null {
  if (service === 'gmail' && action === 'search') return summarizeGmailThreads(parsed);
  if (service === 'gmail' && (action === 'thread' || action === 'get')) return summarizeGmailMessages(parsed);
  if (service === 'gmail' && action === 'send') return summarizeGmailSend(parsed);
  if (service === 'gmail' && action === 'labels:list') return summarizeGmailLabelList(parsed);
  if (service === 'gmail' && action === 'labels:modify') return summarizeGmailLabelMutation('Updated Gmail labels', parsed);
  if (service === 'gmail' && action === 'labels:create') return summarizeGmailLabelMutation('Created Gmail label', parsed);
  if (service === 'gmail' && action === 'drafts:list') return summarizeDrafts(parsed);
  if (service === 'gmail' && action === 'drafts:create') return summarizeDraftMutation('Created Gmail draft', parsed);
  if (service === 'gmail' && action === 'drafts:send') return summarizeDraftMutation('Sent Gmail draft', parsed);
  if (service === 'calendar' && (action === 'events' || action === 'search' || action === 'conflicts')) {
    return summarizeCalendarEvents(parsed);
  }
  if (service === 'calendar' && action === 'calendars') return summarizeCalendars(parsed);
  if (service === 'calendar' && action === 'event') return summarizeSingleCalendarEvent('Calendar event', parsed);
  if (service === 'calendar' && action === 'create') return summarizeSingleCalendarEvent('Created calendar event', parsed);
  if (service === 'calendar' && action === 'update') return summarizeSingleCalendarEvent('Updated calendar event', parsed);
  if (service === 'calendar' && action === 'respond') return summarizeSingleCalendarEvent('Updated calendar RSVP', parsed);
  if (service === 'calendar' && action === 'freebusy') return summarizeFreeBusy(parsed);
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

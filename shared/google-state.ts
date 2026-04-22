import type {
  CalendarEvent,
  CalendarInfo,
  CalendarViewFilter,
  GmailMessage,
  GmailThread,
  GoogleAppState,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getStringArray(value: unknown): string[] {
  return getArray(value)
    .map((entry) => (typeof entry === 'string' ? entry : ''))
    .filter(Boolean);
}

function getHeaderValue(headers: unknown, name: string): string {
  const headerName = name.toLowerCase();
  for (const entry of getArray(headers)) {
    const header = getRecord(entry);
    if (!header) continue;
    if (getString(header.name).toLowerCase() !== headerName) continue;
    return getString(header.value);
  }
  return '';
}

function decodeBase64Url(data: string): string {
  try {
    const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function findBodyParts(payload: unknown): { text: string; html: string } {
  const record = getRecord(payload);
  if (!record) return { text: '', html: '' };

  const mimeType = getString(record.mimeType);
  const body = getRecord(record.body);
  const bodyData = getString(body?.data);

  if (bodyData) {
    const decoded = decodeBase64Url(bodyData);
    if (mimeType === 'text/html') return { text: '', html: decoded };
    if (mimeType === 'text/plain') return { text: decoded, html: '' };
    return { text: '', html: '' };
  }

  const result = { text: '', html: '' };
  for (const part of getArray(record.parts)) {
    const mapped = findBodyParts(part);
    if (!result.html && mapped.html) result.html = mapped.html;
    if (!result.text && mapped.text) result.text = mapped.text;
  }
  return result;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function mapGmailThread(threadValue: unknown): GmailThread {
  const thread = getRecord(threadValue) ?? {};
  const firstMessage = getRecord(getArray(thread.messages)[0]) ?? {};
  const labelIds = Array.from(new Set([
    ...getStringArray(thread.labelIds),
    ...getStringArray(thread.labels),
    ...getStringArray(firstMessage.labelIds),
    ...getStringArray(firstMessage.labels),
  ]));

  return {
    id: getString(thread.id),
    snippet: getString(thread.snippet),
    subject: getString(firstMessage.subject) || getString(thread.subject) || '(no subject)',
    from: getString(firstMessage.from) || getString(thread.from),
    date: getString(firstMessage.date) || getString(thread.date),
    labelIds,
    isUnread: labelIds.includes('UNREAD'),
    messageCount: getArray(thread.messages).length || Number(thread.messageCount ?? 1) || 1,
  };
}

function markThreadRead(thread: GmailThread): GmailThread {
  if (!thread.isUnread && !thread.labelIds.includes('UNREAD')) {
    return thread;
  }

  return {
    ...thread,
    labelIds: thread.labelIds.filter((label) => label !== 'UNREAD'),
    isUnread: false,
  };
}

export function parseGmailMessage(rawMessage: unknown, fallbackThreadId: string): GmailMessage {
  const message = getRecord(rawMessage) ?? {};
  const payload = getRecord(message.payload);
  const headers = payload?.headers;
  const bodyParts = findBodyParts(payload);
  const snippet = decodeHtmlEntities(getString(message.snippet));

  return {
    id: getString(message.id),
    threadId: getString(message.threadId) || fallbackThreadId,
    from: getHeaderValue(headers, 'From'),
    to: getHeaderValue(headers, 'To'),
    subject: getHeaderValue(headers, 'Subject'),
    date: getHeaderValue(headers, 'Date'),
    body: bodyParts.text || snippet,
    bodyHtml: bodyParts.html,
    snippet,
  };
}

function extractGmailMessages(response: unknown): unknown[] | null {
  const record = getRecord(response);
  if (!record) return null;

  const thread = getRecord(record.thread);
  if (thread && Array.isArray(thread.messages)) {
    return thread.messages;
  }
  if (Array.isArray(record.messages)) {
    return record.messages;
  }
  return null;
}

function mapCalendarAttendeeLabel(attendeeValue: unknown): string {
  if (typeof attendeeValue === 'string') return attendeeValue;
  const attendee = getRecord(attendeeValue);
  if (!attendee) return '';

  const name = getString(attendee.displayName) || getString(attendee.email);
  if (!name) return '';

  const responseStatus = getString(attendee.responseStatus);
  const statusSuffix = responseStatus ? ` (${responseStatus})` : '';
  const selfSuffix = getBoolean(attendee.self) ? ' — you' : '';
  return `${name}${statusSuffix}${selfSuffix}`;
}

function mapCalendarReminders(event: Record<string, unknown>): CalendarEvent['reminders'] {
  const reminders = getRecord(event.reminders);
  const overrides = getArray(reminders?.overrides);
  return overrides.map((entry) => {
    const reminder = getRecord(entry) ?? {};
    return {
      method: getString(reminder.method) || 'popup',
      minutes: typeof reminder.minutes === 'number' ? reminder.minutes : 0,
    };
  });
}

function mapCalendarEvent(eventValue: unknown, fallbackCalendarId: string): CalendarEvent {
  const event = getRecord(eventValue) ?? {};
  const start = getRecord(event.start);
  const end = getRecord(event.end);
  const organizer = getRecord(event.organizer);
  const source = getRecord(event.source);

  const attendees = getArray(event.attendees)
    .map(mapCalendarAttendeeLabel)
    .filter(Boolean);

  return {
    id: getString(event.id),
    calendarId: getString(event.calendarId)
      || getString(organizer?.email)
      || getString(organizer?.displayName)
      || fallbackCalendarId,
    summary: getString(event.summary) || '(no title)',
    start: getString(start?.dateTime) || getString(start?.date) || getString(event.startLocal),
    end: getString(end?.dateTime) || getString(end?.date) || getString(event.endLocal),
    startLocal: getString(event.startLocal),
    endLocal: getString(event.endLocal),
    location: getString(event.location),
    description: getString(event.description),
    attendees,
    isAllDay: Boolean(getString(start?.date) && !getString(start?.dateTime)),
    status: getString(event.status),
    htmlLink: getString(event.htmlLink),
    visibility: getString(event.visibility),
    eventType: getString(event.eventType),
    sourceUrl: getString(source?.url),
    reminders: mapCalendarReminders(event),
    created: getString(event.created),
    updated: getString(event.updated),
  };
}

function extractNamedArray(response: unknown, key: string): unknown[] | null {
  const record = getRecord(response);
  if (!record || !(key in record)) return null;
  return Array.isArray(record[key]) ? record[key] : null;
}

export function applyGmailSearchResult(
  previousState: GoogleAppState,
  response: unknown,
  query: string,
  fetchedAt: string = new Date().toISOString(),
): GoogleAppState {
  const threads = extractNamedArray(response, 'threads');
  if (!threads) return previousState;

  return {
    ...previousState,
    gmail: {
      ...previousState.gmail,
      threads: threads.map(mapGmailThread),
      lastQuery: query,
      lastFetchedAt: fetchedAt,
    },
  };
}

export function applyGmailThreadResult(
  previousState: GoogleAppState,
  response: unknown,
  threadId: string,
): GoogleAppState {
  const messages = extractGmailMessages(response);
  if (!messages) return previousState;

  return {
    ...previousState,
    gmail: {
      ...previousState.gmail,
      threads: previousState.gmail.threads.map((thread) => (
        thread.id === threadId ? markThreadRead(thread) : thread
      )),
      selectedThreadId: threadId,
      selectedMessages: messages.map((message) => parseGmailMessage(message, threadId)),
    },
  };
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseCalendarDate(value: string): Date | null {
  if (!value) return null;

  if (isDateOnly(value)) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCalendarEventTime(event: CalendarEvent, edge: 'start' | 'end'): number | null {
  const localValue = edge === 'start' ? event.startLocal : event.endLocal;
  const rawValue = edge === 'start' ? event.start : event.end;
  const date = parseCalendarDate(localValue || rawValue);
  return date ? date.getTime() : null;
}

function eventOverlapsRange(event: CalendarEvent, from: string, to: string): boolean {
  const rangeStart = parseCalendarDate(from);
  const rangeEnd = parseCalendarDate(to);
  const eventStart = getCalendarEventTime(event, 'start');
  const eventEnd = getCalendarEventTime(event, 'end') ?? eventStart;

  if (!rangeStart || !rangeEnd || eventStart === null || eventEnd === null) {
    return false;
  }

  const safeEventEnd = eventEnd > eventStart ? eventEnd : eventStart + 1;
  const safeRangeEnd = rangeEnd.getTime() > rangeStart.getTime()
    ? rangeEnd.getTime()
    : rangeStart.getTime() + 1;

  return eventStart < safeRangeEnd && safeEventEnd > rangeStart.getTime();
}

function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const leftStart = getCalendarEventTime(left, 'start') ?? Number.MAX_SAFE_INTEGER;
    const rightStart = getCalendarEventTime(right, 'start') ?? Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) return leftStart - rightStart;
    return left.summary.localeCompare(right.summary);
  });
}

export interface ApplyCalendarEventsOptions {
  calendarId?: string;
  fetchedAt?: string;
  view?: CalendarViewFilter;
  mergeRange?: { from: string; to: string };
}

export function applyCalendarEventsResult(
  previousState: GoogleAppState,
  response: unknown,
  options: ApplyCalendarEventsOptions = {},
): GoogleAppState {
  const events = extractNamedArray(response, 'events');
  if (!events) return previousState;

  const mappedEvents = events.map((event) => mapCalendarEvent(event, options.calendarId ?? 'primary'));
  const nextEvents = options.mergeRange
    ? sortCalendarEvents([
      ...previousState.calendar.events.filter(
        (event) => !eventOverlapsRange(event, options.mergeRange?.from ?? '', options.mergeRange?.to ?? ''),
      ),
      ...mappedEvents,
    ])
    : sortCalendarEvents(mappedEvents);

  return {
    ...previousState,
    calendar: {
      ...previousState.calendar,
      events: nextEvents,
      view: options.view ?? previousState.calendar.view,
      lastFetchedAt: options.fetchedAt ?? new Date().toISOString(),
    },
  };
}

function mapCalendarInfo(calendarValue: unknown): CalendarInfo {
  const calendar = getRecord(calendarValue) ?? {};
  return {
    id: getString(calendar.id),
    summary: getString(calendar.summary) || getString(calendar.id),
    primary: getBoolean(calendar.primary),
  };
}

export function applyCalendarCalendarsResult(
  previousState: GoogleAppState,
  response: unknown,
): GoogleAppState {
  const calendars = extractNamedArray(response, 'calendars');
  if (!calendars) return previousState;

  return {
    ...previousState,
    calendar: {
      ...previousState.calendar,
      calendars: calendars.map(mapCalendarInfo),
    },
  };
}

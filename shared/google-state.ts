import type {
  CalendarEvent,
  CalendarInfo,
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
  const labelIds = getStringArray(firstMessage.labels).length > 0
    ? getStringArray(firstMessage.labels)
    : getStringArray(thread.labelIds);

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
      selectedThreadId: threadId,
      selectedMessages: messages.map((message) => parseGmailMessage(message, threadId)),
    },
  };
}

export interface ApplyCalendarEventsOptions {
  calendarId?: string;
  fetchedAt?: string;
  view?: 'today' | 'week';
}

export function applyCalendarEventsResult(
  previousState: GoogleAppState,
  response: unknown,
  options: ApplyCalendarEventsOptions = {},
): GoogleAppState {
  const events = extractNamedArray(response, 'events');
  if (!events) return previousState;

  return {
    ...previousState,
    calendar: {
      ...previousState.calendar,
      events: events.map((event) => mapCalendarEvent(event, options.calendarId ?? 'primary')),
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

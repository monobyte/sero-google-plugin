import { describe, expect, it } from 'vitest';

import {
  applyCalendarCalendarsResult,
  applyCalendarEventsResult,
  applyGmailSearchResult,
  applyGmailThreadResult,
} from '../../shared/google-state';
import { DEFAULT_GOOGLE_STATE } from '../../shared/types';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('canonical Google state shaping', () => {
  it('maps Gmail search results into the shared thread state shape', () => {
    const nextState = applyGmailSearchResult(
      DEFAULT_GOOGLE_STATE,
      {
        threads: [
          {
            id: 'thread-1',
            snippet: 'Latest snippet',
            subject: 'Fallback subject',
            from: 'fallback@example.com',
            date: 'fallback-date',
            messageCount: 3,
            labelIds: ['UNREAD'],
            messages: [
              {
                subject: 'Inbox subject',
                from: 'Ada Lovelace <ada@example.com>',
                date: '2026-04-18T10:00:00Z',
                labels: ['UNREAD', 'IMPORTANT'],
              },
            ],
          },
        ],
      },
      'label:inbox',
      '2026-04-18T10:30:00Z',
    );

    expect(nextState.gmail).toMatchObject({
      lastQuery: 'label:inbox',
      lastFetchedAt: '2026-04-18T10:30:00Z',
      threads: [
        {
          id: 'thread-1',
          subject: 'Inbox subject',
          from: 'Ada Lovelace <ada@example.com>',
          date: '2026-04-18T10:00:00Z',
          labelIds: ['UNREAD', 'IMPORTANT'],
          isUnread: true,
          messageCount: 1,
        },
      ],
    });
  });

  it('maps Gmail thread payloads with both plain text and HTML bodies', () => {
    const nextState = applyGmailThreadResult(
      DEFAULT_GOOGLE_STATE,
      {
        thread: {
          messages: [
            {
              id: 'message-1',
              threadId: 'thread-1',
              snippet: 'Hi &amp; welcome',
              payload: {
                headers: [
                  { name: 'From', value: 'Ada Lovelace <ada@example.com>' },
                  { name: 'To', value: 'Charles Babbage <charles@example.com>' },
                  { name: 'Subject', value: 'Analytical Engine' },
                  { name: 'Date', value: 'Fri, 18 Apr 2026 10:00:00 +0000' },
                ],
                parts: [
                  {
                    mimeType: 'text/plain',
                    body: { data: toBase64Url('Hello from plain text') },
                  },
                  {
                    mimeType: 'text/html',
                    body: { data: toBase64Url('<p><strong>Hello</strong> from HTML</p>') },
                  },
                ],
              },
            },
          ],
        },
      },
      'thread-1',
    );

    expect(nextState.gmail.selectedThreadId).toBe('thread-1');
    expect(nextState.gmail.selectedMessages).toEqual([
      {
        id: 'message-1',
        threadId: 'thread-1',
        from: 'Ada Lovelace <ada@example.com>',
        to: 'Charles Babbage <charles@example.com>',
        subject: 'Analytical Engine',
        date: 'Fri, 18 Apr 2026 10:00:00 +0000',
        body: 'Hello from plain text',
        bodyHtml: '<p><strong>Hello</strong> from HTML</p>',
        snippet: 'Hi & welcome',
      },
    ]);
  });

  it('maps calendar events with reminders, links, visibility, and attendee status details', () => {
    const nextState = applyCalendarEventsResult(
      DEFAULT_GOOGLE_STATE,
      {
        events: [
          {
            id: 'event-1',
            summary: 'Design review',
            start: { dateTime: '2026-04-18T13:00:00Z' },
            end: { dateTime: '2026-04-18T14:00:00Z' },
            startLocal: '2026-04-18T14:00:00+01:00',
            endLocal: '2026-04-18T15:00:00+01:00',
            location: 'Room 1',
            description: 'Review the canonical mapper plan',
            organizer: { email: 'team-calendar@example.com', displayName: 'Team Calendar' },
            attendees: [
              { displayName: 'Ada', email: 'ada@example.com', responseStatus: 'accepted', self: true },
              { email: 'charles@example.com', responseStatus: 'tentative' },
            ],
            reminders: {
              overrides: [
                { method: 'email', minutes: 60 },
                { method: 'popup', minutes: 10 },
              ],
            },
            status: 'confirmed',
            htmlLink: 'https://calendar.google.com/event?eid=123',
            visibility: 'private',
            eventType: 'fromGmail',
            source: { url: 'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc' },
            created: '2026-04-16T09:00:00Z',
            updated: '2026-04-17T11:00:00Z',
          },
        ],
      },
      {
        calendarId: 'primary',
        view: 'week',
        fetchedAt: '2026-04-18T12:00:00Z',
      },
    );

    expect(nextState.calendar).toMatchObject({
      view: 'week',
      lastFetchedAt: '2026-04-18T12:00:00Z',
      events: [
        {
          id: 'event-1',
          calendarId: 'team-calendar@example.com',
          summary: 'Design review',
          location: 'Room 1',
          description: 'Review the canonical mapper plan',
          attendees: ['Ada (accepted) — you', 'charles@example.com (tentative)'],
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=123',
          visibility: 'private',
          eventType: 'fromGmail',
          sourceUrl: 'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc',
          reminders: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 10 },
          ],
          created: '2026-04-16T09:00:00Z',
          updated: '2026-04-17T11:00:00Z',
        },
      ],
    });
  });

  it('maps calendar list responses into the shared state contract', () => {
    const nextState = applyCalendarCalendarsResult(DEFAULT_GOOGLE_STATE, {
      calendars: [
        { id: 'primary', summary: 'Primary', primary: true },
        { id: 'team@example.com', summary: 'Team', primary: false },
      ],
    });

    expect(nextState.calendar.calendars).toEqual([
      { id: 'primary', summary: 'Primary', primary: true },
      { id: 'team@example.com', summary: 'Team', primary: false },
    ]);
  });
});

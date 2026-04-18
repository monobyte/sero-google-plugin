import { describe, expect, it } from 'vitest';

import { formatGoogleCliResult } from '../google/cli-output';

describe('formatGoogleCliResult', () => {
  it('summarizes gmail search output into agent-readable text while preserving raw JSON in details', () => {
    const result = formatGoogleCliResult('gmail', 'search', {
      stdout: JSON.stringify({
        threads: [
          {
            id: 'thread-1',
            snippet: 'Build is green and deploy is ready.',
            messages: [
              {
                subject: 'Release update',
                from: 'Alice <alice@example.com>',
                date: '2026-04-18T10:00:00Z',
                labels: ['UNREAD'],
              },
            ],
          },
        ],
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toContain('Gmail threads (1)');
    expect(result.output).toContain('Release update — Alice <alice@example.com> — 2026-04-18T10:00:00Z [unread]');
    expect(result.output).toContain('Build is green and deploy is ready.');
    expect(result.details).toEqual({
      rawOutput: JSON.stringify({
        threads: [
          {
            id: 'thread-1',
            snippet: 'Build is green and deploy is ready.',
            messages: [
              {
                subject: 'Release update',
                from: 'Alice <alice@example.com>',
                date: '2026-04-18T10:00:00Z',
                labels: ['UNREAD'],
              },
            ],
          },
        ],
      }),
      summaryType: 'gmail:search',
    });
  });

  it('summarizes calendar event listings into readable text', () => {
    const result = formatGoogleCliResult('calendar', 'events', {
      stdout: JSON.stringify({
        events: [
          {
            id: 'event-1',
            summary: 'Team Sync',
            start: { dateTime: '2026-04-18T15:00:00Z' },
            location: 'Conference Room A',
          },
        ],
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toBe('Calendar events (1)\n• 2026-04-18T15:00:00Z — Team Sync — Conference Room A');
    expect(result.details).toEqual({
      rawOutput: JSON.stringify({
        events: [
          {
            id: 'event-1',
            summary: 'Team Sync',
            start: { dateTime: '2026-04-18T15:00:00Z' },
            location: 'Conference Room A',
          },
        ],
      }),
      summaryType: 'calendar:events',
    });
  });

  it('summarizes gmail labels into readable text', () => {
    const result = formatGoogleCliResult('gmail', 'labels:list', {
      stdout: JSON.stringify({
        labels: [
          {
            id: 'INBOX',
            name: 'INBOX',
            type: 'SYSTEM',
            threadsTotal: 12,
            messagesTotal: 19,
          },
          {
            id: 'Label_123',
            name: 'Shipping',
            type: 'USER',
            threadsTotal: 2,
            messagesTotal: 5,
          },
        ],
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toContain('Gmail labels (2)');
    expect(result.output).toContain('• INBOX [system] — 12 thread(s) — 19 message(s)');
    expect(result.output).toContain('• Shipping [user] — 2 thread(s) — 5 message(s)');
  });

  it('summarizes gmail draft creation into readable text', () => {
    const result = formatGoogleCliResult('gmail', 'drafts:create', {
      stdout: JSON.stringify({
        draft: {
          id: 'draft-1',
          message: {
            threadId: 'thread-1',
            payload: {
              headers: [
                { name: 'Subject', value: 'Follow up' },
                { name: 'To', value: 'ops@example.com' },
                { name: 'Date', value: '2026-04-18T16:00:00Z' },
              ],
            },
          },
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toContain('Created Gmail draft');
    expect(result.output).toContain('• Follow up — ops@example.com — 2026-04-18T16:00:00Z');
    expect(result.output).toContain('• id: draft-1');
    expect(result.output).toContain('• thread: thread-1');
  });

  it('summarizes gmail send responses into readable text', () => {
    const result = formatGoogleCliResult('gmail', 'send', {
      stdout: JSON.stringify({
        message: {
          id: 'msg-1',
          threadId: 'thread-1',
          payload: {
            headers: [
              { name: 'Subject', value: 'Status update' },
              { name: 'To', value: 'team@example.com' },
            ],
          },
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toContain('Gmail message sent');
    expect(result.output).toContain('• Status update — team@example.com');
    expect(result.output).toContain('• id: msg-1');
    expect(result.output).toContain('• thread: thread-1');
  });

  it('summarizes calendar freebusy responses into readable text', () => {
    const result = formatGoogleCliResult('calendar', 'freebusy', {
      stdout: JSON.stringify({
        calendars: {
          primary: {
            busy: [
              { start: '2026-04-18T09:00:00Z', end: '2026-04-18T09:30:00Z' },
              { start: '2026-04-18T12:00:00Z', end: '2026-04-18T12:30:00Z' },
            ],
          },
          'team@example.com': {
            busy: [],
          },
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toContain('Google free/busy (2)');
    expect(result.output).toContain('• primary — busy 2 block(s)');
    expect(result.output).toContain('2026-04-18T09:00:00Z → 2026-04-18T09:30:00Z');
    expect(result.output).toContain('• team@example.com — free');
  });

  it('summarizes single calendar event mutations into readable text', () => {
    const result = formatGoogleCliResult('calendar', 'create', {
      stdout: JSON.stringify({
        event: {
          id: 'event-1',
          summary: 'Standup',
          start: { dateTime: '2026-04-18T15:00:00Z' },
          location: 'Zoom',
        },
      }),
      stderr: '',
      exitCode: 0,
    });

    expect(result.output).toContain('Created calendar event');
    expect(result.output).toContain('• 2026-04-18T15:00:00Z — Standup — Zoom');
    expect(result.output).toContain('• id: event-1');
  });

  it('falls back to the generic gog output for non-json success responses', () => {
    const result = formatGoogleCliResult('gmail', 'url', {
      stdout: 'https://mail.google.com/mail/u/0/#inbox/thread-1',
      stderr: '',
      exitCode: 0,
    });

    expect(result).toEqual({
      output: 'https://mail.google.com/mail/u/0/#inbox/thread-1',
      exitCode: 0,
    });
  });
});

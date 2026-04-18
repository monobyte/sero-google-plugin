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

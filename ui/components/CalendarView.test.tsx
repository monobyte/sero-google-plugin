// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GOOGLE_STATE, type GoogleAppState } from '../../shared/types';
import { CalendarView } from './CalendarView';

function createGoogleApiStub() {
  return {
    loading: false,
    error: null,
    auth: { status: 'authenticated', email: 'alice@example.com', error: null } as const,
    checkAuth: vi.fn(async () => {}),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    saveConfig: vi.fn(async () => true),
    fetchInbox: vi.fn(async () => {}),
    fetchThread: vi.fn(async () => {}),
    fetchEvents: vi.fn(async () => {}),
    fetchEventsRange: vi.fn(async () => {}),
    fetchCalendars: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => true),
    archiveThread: vi.fn(async () => true),
  };
}

describe('CalendarView', () => {
  it('keeps the calendar detail panel behavior unchanged after the bridge rebase', async () => {
    const google = createGoogleApiStub();
    const state: GoogleAppState = {
      ...structuredClone(DEFAULT_GOOGLE_STATE),
      activeTab: 'calendar',
      calendar: {
        events: [{
          id: 'event-1',
          calendarId: 'primary',
          summary: 'Team Sync',
          start: '2026-04-18T15:00:00.000Z',
          end: '2026-04-18T15:30:00.000Z',
          location: 'Conference Room A',
          description: 'Quarterly planning review',
          attendees: ['alice@example.com (accepted)'],
          isAllDay: false,
          status: 'confirmed',
          htmlLink: 'https://calendar.google.com/event?eid=event-1',
          visibility: 'private',
          eventType: 'default',
          reminders: [{ method: 'popup', minutes: 10 }],
        }],
        calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
        view: 'today',
        lastFetchedAt: '2026-04-18T11:05:00.000Z',
      },
    };

    render(
      <CalendarView
        state={state}
        updateState={(fn) => {
          fn(state);
        }}
        google={google}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Team Sync/i }));

    expect(screen.getByText('Conference Room A')).toBeTruthy();
    expect(screen.getByText('Notification: 10 minutes before')).toBeTruthy();
    expect(screen.getByText('Open in Google Calendar')).toBeTruthy();
  });
});

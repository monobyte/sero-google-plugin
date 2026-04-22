// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    fetchEventsDate: vi.fn(async () => {}),
    fetchCalendars: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => true),
    archiveThread: vi.fn(async () => true),
  };
}

function CalendarHarness({ initialState, google }: { initialState: GoogleAppState; google: ReturnType<typeof createGoogleApiStub> }) {
  const [state, setState] = useState(initialState);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());

  return (
    <CalendarView
      state={state}
      updateState={(fn) => {
        setState(fn);
      }}
      google={google}
      visibleMonth={visibleMonth}
      onVisibleMonthChange={setVisibleMonth}
    />
  );
}

function findDateOutsideCurrentWeekInSameMonth(anchor: Date): Date {
  const today = new Date(anchor);
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  const weekday = (today.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - weekday);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const candidates = [
    new Date(today.getFullYear(), today.getMonth(), 1),
    new Date(today.getFullYear(), today.getMonth() + 1, 0),
  ];

  return candidates.find((candidate) => candidate < startOfWeek || candidate >= endOfWeek) ?? candidates[0];
}

function toIsoWindow(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setHours(15, 0, 0, 0);

  const end = new Date(date);
  end.setHours(15, 30, 0, 0);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

afterEach(() => {
  cleanup();
});

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
        view: 'all',
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
        visibleMonth={new Date()}
        onVisibleMonthChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Team Sync/i }));

    expect(screen.getByText('Conference Room A')).toBeTruthy();
    expect(screen.getByText('Notification: 10 minutes before')).toBeTruthy();
    expect(screen.getByText('Open in Google Calendar')).toBeTruthy();
  });

  it('keeps mini-calendar dots for the month when list filters are toggled', () => {
    const google = createGoogleApiStub();
    const today = new Date();
    const outsideWeekDate = findDateOutsideCurrentWeekInSameMonth(today);
    const todayWindow = toIsoWindow(today);
    const outsideWeekWindow = toIsoWindow(outsideWeekDate);

    const state: GoogleAppState = {
      ...structuredClone(DEFAULT_GOOGLE_STATE),
      activeTab: 'calendar',
      calendar: {
        events: [
          {
            id: 'event-this-week',
            calendarId: 'primary',
            summary: 'This Week Event',
            start: todayWindow.start,
            end: todayWindow.end,
            isAllDay: false,
          },
          {
            id: 'event-month',
            calendarId: 'primary',
            summary: 'Later This Month',
            start: outsideWeekWindow.start,
            end: outsideWeekWindow.end,
            isAllDay: false,
          },
        ],
        calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
        view: 'all',
        lastFetchedAt: '2026-04-18T11:05:00.000Z',
      },
    };

    const view = render(<CalendarHarness initialState={state} google={google} />);

    const getOutsideMonthButton = () => view
      .getAllByRole('button', { name: String(outsideWeekDate.getDate()) })
      .find((button) => button.querySelector('span'));

    expect(view.getByRole('button', { name: /This Week Event/i })).toBeTruthy();
    expect(view.getByRole('button', { name: /Later This Month/i })).toBeTruthy();
    expect(getOutsideMonthButton()).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: 'This Week' }));

    expect(google.fetchEvents).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: /This Week Event/i })).toBeTruthy();
    expect(view.queryByRole('button', { name: /Later This Month/i })).toBeNull();
    expect(getOutsideMonthButton()).toBeTruthy();
  });

  it('refreshes the selected date without clearing the month cache UI affordance', () => {
    const google = createGoogleApiStub();
    const today = new Date();
    const todayWindow = toIsoWindow(today);
    const dayLabel = String(today.getDate());
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const state: GoogleAppState = {
      ...structuredClone(DEFAULT_GOOGLE_STATE),
      activeTab: 'calendar',
      calendar: {
        events: [{
          id: 'event-today',
          calendarId: 'primary',
          summary: 'Today Event',
          start: todayWindow.start,
          end: todayWindow.end,
          isAllDay: false,
        }],
        calendars: [{ id: 'primary', summary: 'Primary', primary: true }],
        view: 'all',
        lastFetchedAt: '2026-04-18T11:05:00.000Z',
      },
    };

    const view = render(<CalendarHarness initialState={state} google={google} />);

    fireEvent.click(view.getAllByRole('button', { name: dayLabel })[0]);
    fireEvent.click(view.getByRole('button', { name: /Refresh events for/i }));

    expect(google.fetchEventsDate).toHaveBeenCalledWith(dateKey);
    expect(view.getByRole('button', { name: 'Clear selected date' })).toBeTruthy();
  });
});

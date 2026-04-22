/**
 * CalendarView — Google Calendar with mini calendar + event list + detail panel.
 *
 * Layout: mini calendar on the left, event list in the center.
 * Clicking an event opens its detail view in place of the list.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Clock, MapPin, Users, CalendarDays, RefreshCw, X } from 'lucide-react';
import type { GoogleAppState, CalendarEvent, CalendarViewFilter } from '../../shared/types';
import type { GoogleApi } from '../hooks/useGoogleApi';
import {
  formatRelativeDate,
  formatTimeRange,
  groupEventsByDay,
  getEventDateKey,
  getMonthRange,
  toDateKey,
} from './format-utils';
import { MiniCalendar } from './MiniCalendar';
import { EventDetail } from './EventDetail';

type StateUpdater = (fn: (prev: GoogleAppState) => GoogleAppState) => void;

interface CalendarViewProps {
  state: GoogleAppState;
  updateState: StateUpdater;
  google: GoogleApi;
  visibleMonth: Date;
  onVisibleMonthChange: (month: Date) => void;
}

function filterEventsByView(events: CalendarEvent[], view: CalendarViewFilter): CalendarEvent[] {
  if (view === 'all') return events;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (view === 'today') {
    const todayKey = toDateKey(today);
    return events.filter((event) => getEventDateKey(event) === todayKey);
  }

  const startOfWeek = new Date(today);
  const weekday = (today.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - weekday);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return events.filter((event) => {
    const eventDateKey = getEventDateKey(event);
    if (!eventDateKey) return false;

    const eventDate = new Date(`${eventDateKey}T00:00:00`);
    return eventDate >= startOfWeek && eventDate < endOfWeek;
  });
}

export function CalendarView({ state, updateState, google, visibleMonth, onVisibleMonthChange }: CalendarViewProps) {
  const { events, view, lastFetchedAt } = state.calendar;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const setView = useCallback((nextView: CalendarViewFilter) => {
    updateState((prev) => ({
      ...prev,
      calendar: {
        ...prev.calendar,
        view: prev.calendar.view === nextView ? 'all' : nextView,
      },
    }));
    setSelectedEvent(null);
  }, [updateState]);

  // Dates that have events (for mini calendar dots)
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    for (const event of events) {
      const eventDateKey = getEventDateKey(event);
      if (eventDateKey) dates.add(eventDateKey);
    }
    return dates;
  }, [events]);

  // Selecting a specific day overrides the list filter.
  const displayEvents = useMemo(() => {
    if (selectedDate) {
      return events.filter((event) => getEventDateKey(event) === selectedDate);
    }
    return filterEventsByView(events, view);
  }, [events, selectedDate, view]);

  const groupedEvents = useMemo(() => groupEventsByDay(displayEvents), [displayEvents]);
  const selectedDateLabel = useMemo(() => (
    selectedDate
      ? new Date(`${selectedDate}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : ''
  ), [selectedDate]);

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
    setSelectedEvent(null);
  }, []);

  const handleChangeMonth = useCallback((delta: number) => {
    const next = new Date(visibleMonth);
    next.setMonth(next.getMonth() + delta);
    onVisibleMonthChange(next);
  }, [onVisibleMonthChange, visibleMonth]);

  const handleRefreshSelectedDate = useCallback(() => {
    if (!selectedDate) return;
    setSelectedEvent(null);
    google.fetchEventsDate(selectedDate);
  }, [google, selectedDate]);

  const handleClearSelectedDate = useCallback(() => {
    setSelectedDate(null);
    setSelectedEvent(null);
  }, []);

  // Fetch events for the visible month when it changes.
  const lastFetchedMonth = useRef('');
  useEffect(() => {
    const key = `${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}`;
    if (key === lastFetchedMonth.current) return;
    lastFetchedMonth.current = key;

    const { from, to } = getMonthRange(visibleMonth);
    google.fetchEventsRange(from, to);
  }, [google, visibleMonth]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* View toggle bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border-subtle)] px-3 py-1.5">
        <ViewToggle active={view === 'today'} label="Today" onClick={() => setView('today')} />
        <ViewToggle active={view === 'week'} label="This Week" onClick={() => setView('week')} />
        {selectedDate && (
          <div className="ml-1 flex items-center gap-1">
            <button
              onClick={handleRefreshSelectedDate}
              disabled={google.loading}
              aria-label={`Refresh events for ${selectedDateLabel}`}
              className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
            >
              <RefreshCw className={`size-2.5 ${google.loading ? 'animate-spin' : ''}`} />
              {selectedDateLabel}
            </button>
            <button
              onClick={handleClearSelectedDate}
              aria-label="Clear selected date"
              className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="size-2.5" />
            </button>
          </div>
        )}
        <div className="flex-1" />
        {lastFetchedAt && (
          <span className="text-[10px] text-[var(--text-muted)]">{formatRelativeDate(lastFetchedAt)}</span>
        )}
      </div>

      {/* Main area: mini calendar + events/detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mini calendar sidebar */}
        <div className="w-[180px] shrink-0 border-r border-[var(--border-subtle)] p-2">
          <MiniCalendar
            month={visibleMonth}
            selectedDate={selectedDate}
            eventDates={eventDates}
            onSelectDate={handleSelectDate}
            onChangeMonth={handleChangeMonth}
          />
        </div>

        {/* Events or detail */}
        <div className="flex-1 overflow-hidden">
          {selectedEvent ? (
            <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          ) : displayEvents.length === 0 ? (
            <EmptyCalendar loading={google.loading} error={google.error} />
          ) : (
            <div className="h-full space-y-3 overflow-y-auto p-2">
              {groupedEvents.map(([dayLabel, dayEvents]) => (
                <DayGroup key={dayLabel} label={dayLabel} events={dayEvents} onSelect={setSelectedEvent} />
              ))}
              <div className="px-1 pb-1 text-[10px] text-[var(--text-muted)]">
                {displayEvents.length} event{displayEvents.length !== 1 ? 's' : ''}
                {' · last synced '}
                {formatRelativeDate(lastFetchedAt || '')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────

function ViewToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-secondary)]'
      }`}
    >
      {label}
    </button>
  );
}

function DayGroup({ label, events, onSelect }: { label: string; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  return (
    <div>
      <div className="mb-1 px-1 text-[11px] font-medium text-[var(--text-muted)]">{label}</div>
      <div className="space-y-1">
        {events.map((event, i) => (
          <EventCard key={event.id} event={event} index={i} onClick={() => onSelect(event)} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ event, index, onClick }: { event: CalendarEvent; index: number; onClick: () => void }) {
  const timeRange = formatTimeRange(event.start, event.end, event.isAllDay);
  const isPast = !event.isAllDay && new Date(event.end) < new Date();

  return (
    <button
      onClick={onClick}
      className={`animate-g-fade-in w-full overflow-hidden rounded-lg border text-left transition-colors hover:border-blue-500/30 ${
        isPast
          ? 'border-[var(--border-subtle)]/50 bg-[var(--bg-elevated)]/25'
          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50'
      }`}
      style={{ animationDelay: `${index * 20}ms` }}
    >
      <div className="flex items-start gap-2.5 px-3 py-2">
        <div className="mt-1 flex shrink-0 flex-col items-center">
          <span className={`size-1.5 rounded-full ${event.isAllDay ? 'bg-blue-400' : isPast ? 'bg-[var(--text-muted)]/40' : 'bg-emerald-500'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <span className={`text-[12px] font-medium ${isPast ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
            {event.summary}
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <Clock className="size-2.5" />
              {timeRange}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <MapPin className="size-2.5" />
                <span className="max-w-[150px] truncate">{event.location}</span>
              </span>
            )}
            {event.attendees && event.attendees.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Users className="size-2.5" />
                {event.attendees.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyCalendar({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {loading ? (
        <>
          <div className="mb-3 size-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-blue-500" />
          <p className="text-[12px] text-[var(--text-muted)]">Fetching events…</p>
        </>
      ) : error ? (
        <>
          <CalendarDays className="mb-3 size-6 text-red-400/60" />
          <p className="text-[12px] text-red-400">{error}</p>
        </>
      ) : (
        <>
          <CalendarDays className="mb-3 size-6 text-[var(--text-muted)]/40" />
          <p className="text-[12px] text-[var(--text-muted)]">No events</p>
        </>
      )}
    </div>
  );
}

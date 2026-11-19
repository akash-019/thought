/**
 * File: src/professionals/SlotPicker.tsx
 *
 * The booking calendar: the next 4 weeks of a professional's free slots, laid out in the
 * member's timezone. Pick a day, then a time. Each time shows the member's clock first and
 * the professional's local clock under it, so nobody has to do timezone maths.
 * Used for booking and for rescheduling.
 */
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { SlotsResponse } from '../api/types';
import { ErrorNote, Loading } from '../components/States';
import { cityOf, formatLongDate, formatTime, theirDateIfDifferent } from '../lib/time';
import { useLoad } from '../lib/useLoad';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  professionalId: string;
  professionalName: string;
  /** Change this number to reload the slots (e.g. after "slot just taken"). */
  refreshKey?: number;
  selected: string | null;
  onSelect: (startAt: string | null) => void;
}

export function SlotPicker({ professionalId, professionalName, refreshKey = 0, selected, onSelect }: Props) {
  const { data, error, loading, reload } = useLoad(
    () => api<SlotsResponse>(`/professionals/${professionalId}/slots`),
    [professionalId, refreshKey],
  );
  const [day, setDay] = useState<string | null>(null);

  const slotsByDate = useMemo(() => new Map(data?.days.map((d) => [d.date, d.slots]) ?? []), [data]);

  // Open the first day that has a free time.
  useEffect(() => {
    if (data && (!day || !slotsByDate.has(day))) setDay(data.days[0]?.date ?? null);
  }, [data, day, slotsByDate]);

  if (loading && !data) return <Loading label="Finding free times…" />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  if (data.days.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">No free times in the next 4 weeks</p>
        <p>{professionalName} is fully booked or hasn’t set working hours yet. Try another professional.</p>
      </div>
    );
  }

  const zone = data.timezone;
  const sameClock = data.professionalTimezone === zone;
  const weeks = calendarWeeks(zone, data.days.at(-1)!.date);
  const daySlots = day ? (slotsByDate.get(day) ?? []) : [];
  const today = DateTime.now().setZone(zone).toISODate();

  return (
    <div className="picker">
      <div className="calendar" aria-label="Choose a day">
        <p className="calendar-month">{monthLabel(weeks)}</p>
        <div className="calendar-grid" role="grid">
          {WEEKDAYS.map((w) => (
            <span key={w} className="calendar-weekday" aria-hidden="true">
              {w}
            </span>
          ))}
          {weeks.flat().map((date) => {
            const count = slotsByDate.get(date)?.length ?? 0;
            const isSelected = date === day;
            const isToday = date === today;

            const classes = ['calendar-day'];
            if (count) classes.push('has-slots');
            if (isSelected) classes.push('selected');
            if (isToday) classes.push('today');

            // Read out by screen readers, e.g. "Today, Thursday 19 November, 3 free times".
            let label = formatLongDate(date);
            if (isToday) label = `Today, ${label}`;
            label += count === 0 ? ', no free times' : `, ${count} free time${count === 1 ? '' : 's'}`;

            return (
              <button
                key={date}
                type="button"
                className={classes.join(' ')}
                disabled={!count}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                aria-label={label}
                onClick={() => {
                  setDay(date);
                  onSelect(null);
                }}
              >
                {DateTime.fromISO(date).day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="day-slots">
        {day && (
          <h3 className="day-slots-title">
            {formatLongDate(day)}
            <span className="day-slots-count">
              {daySlots.length} free time{daySlots.length === 1 ? '' : 's'}
            </span>
          </h3>
        )}
        <p className="muted small">
          Times in your timezone ({cityOf(zone)}). Each session lasts 50 minutes.
        </p>
        <div className="slot-list" role="radiogroup" aria-label="Choose a time">
          {daySlots.map((slot) => {
            const theirDate = theirDateIfDifferent(slot.startAt, data.professionalTimezone, zone);
            const isSelected = slot.startAt === selected;
            return (
              <button
                key={slot.startAt}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={isSelected ? 'slot selected' : 'slot'}
                onClick={() => onSelect(isSelected ? null : slot.startAt)}
              >
                <span className="slot-time">{slot.localTime}</span>
                {!sameClock && (
                  <span className="slot-their-time">
                    {formatTime(slot.startAt, data.professionalTimezone)} in {cityOf(data.professionalTimezone)}
                    {theirDate && <span className="slot-their-date">{theirDate}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Weeks (Monday to Sunday) from this week until the week of the last free day, as YYYY-MM-DD. */
function calendarWeeks(zone: string, lastDate: string): string[][] {
  const weeks: string[][] = [];
  let monday = DateTime.now().setZone(zone).startOf('week');
  const end = DateTime.fromISO(lastDate, { zone });
  while (monday <= end) {
    weeks.push(Array.from({ length: 7 }, (_, i) => monday.plus({ days: i }).toISODate()!));
    monday = monday.plus({ weeks: 1 });
  }
  return weeks;
}

/** "January 2027" or "January – February 2027" */
function monthLabel(weeks: string[][]): string {
  const first = DateTime.fromISO(weeks[0]![0]!);
  const last = DateTime.fromISO(weeks.at(-1)!.at(-1)!);
  if (first.month === last.month) return first.toFormat('LLLL yyyy');
  if (first.year === last.year) return `${first.toFormat('LLLL')} – ${last.toFormat('LLLL yyyy')}`;
  return `${first.toFormat('LLLL yyyy')} – ${last.toFormat('LLLL yyyy')}`;
}

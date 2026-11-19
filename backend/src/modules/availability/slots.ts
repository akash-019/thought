/**
 * File: src/modules/availability/slots.ts
 *
 * Slot generation: turns a professional's weekly hours into bookable 50-minute slots.
 *
 * How slots are laid out: starting at the beginning of each working range, one slot every
 * 60 minutes (50-minute session + 10-minute break for the professional). The last slot must
 * finish by the end of the range. Example: Monday 09:00-12:00 -> 09:00, 10:00, 11:00.
 *
 * Slots are built on the professional's local clock and only then converted to exact UTC
 * instants, so "Monday 09:00" stays 09:00 local all year, even when daylight saving changes.
 * Pure functions (no database), so they are unit tested heavily.
 */
import { DateTime } from 'luxon';
import { toMinutes, type WeeklyRule } from './weekly-hours.js';
import { MINUTE_MS } from '../../common/clock.js';

const SESSION_MINUTES = 50;
const SLOT_STEP_MINUTES = 60;
export const BOOKING_WINDOW_DAYS = 28; // members can book up to 4 weeks ahead

interface TimeRange {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  rules: WeeklyRule[]; // the professional's weekly hours
  timezone: string; // the professional's timezone
  blockedDates?: string[]; // days off, "YYYY-MM-DD" in the professional's timezone
  busy?: TimeRange[]; // already-booked sessions; overlapping slots are hidden
  from: Date; // return slots starting at or after this...
  to: Date; // ...and before this
  earliestStart: Date; // never offer anything earlier (now, or now + minimum notice)
}

/**
 * The exact instant of a local clock time on a local day, e.g. "2027-03-14 at 09:00 in New York".
 *
 * Daylight saving makes two cases tricky:
 * - Clocks jump forward: some times never happen (02:30 on the March change in New York).
 *   We return null, so no slot is offered at a time that does not exist.
 * - Clocks go back: some times happen twice (01:30 on the November change).
 *   We use the first one, i.e. the first moment a wall clock shows that time.
 */
export function localTimeToInstant(day: DateTime, minutes: number): DateTime | null {
  if (minutes === 24 * 60) return localTimeToInstant(day.plus({ days: 1 }), 0); // "24:00" = next midnight

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const time = DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour, minute }, { zone: day.zone });

  // Luxon moves non-existent times forward (02:30 -> 03:30). If the clock time changed, it did not exist.
  if (time.hour !== hour || time.minute !== minute) return null;

  // If the same clock time also happened one hour earlier, the clocks went back: use the earlier one.
  const hourEarlier = time.minus({ hours: 1 });
  if (hourEarlier.hour === hour && hourEarlier.minute === minute) return hourEarlier;

  return time;
}

/** All free slot start times (UTC, earliest first) for one professional between `from` and `to`. */
export function generateSlots(query: SlotQuery): Date[] {
  const slots: Date[] = [];

  // Walk the professional's local calendar days. Start a day early and end a day late because
  // the edges of a UTC window can fall on a different local date (e.g. in Auckland or Los Angeles).
  let day = DateTime.fromJSDate(query.from, { zone: query.timezone }).startOf('day').minus({ days: 1 });
  const lastDay = DateTime.fromJSDate(query.to, { zone: query.timezone }).startOf('day').plus({ days: 1 });

  for (; day <= lastDay; day = day.plus({ days: 1 })) {
    if (query.blockedDates?.includes(day.toISODate()!)) continue;

    for (const rule of query.rules.filter((r) => r.weekday === day.weekday)) {
      const rangeStart = toMinutes(rule.start)!;
      const rangeEnd = toMinutes(rule.end)!;
      const rangeEndInstant = localTimeToInstant(day, rangeEnd);

      for (let minutes = rangeStart; minutes + SESSION_MINUTES <= rangeEnd; minutes += SLOT_STEP_MINUTES) {
        const start = localTimeToInstant(day, minutes)?.toJSDate();
        if (!start) continue; // this local time does not exist today (daylight saving)
        const end = sessionEnd(start);

        if (rangeEndInstant && end > rangeEndInstant.toJSDate()) continue; // DST day: range is shorter in real time
        if (start < query.from || start >= query.to || start < query.earliestStart) continue;
        if (query.busy?.some((b) => start < b.end && b.start < end)) continue; // overlaps a booking

        slots.push(start);
      }
    }
  }
  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/** True if `start` is exactly one of the slots the professional offers. Used to validate bookings. */
export function isOfferedSlot(query: Omit<SlotQuery, 'from' | 'to'>, start: Date): boolean {
  const oneMinuteLater = new Date(start.getTime() + MINUTE_MS);
  return generateSlots({ ...query, from: start, to: oneMinuteLater }).some((s) => s.getTime() === start.getTime());
}

export function sessionEnd(start: Date): Date {
  return new Date(start.getTime() + SESSION_MINUTES * MINUTE_MS);
}

/**
 * Groups slots by calendar date in the viewer's timezone, for the booking calendar:
 * [{ date: '2027-01-04', slots: [{ startAt: '2027-01-04T03:30:00.000Z', localTime: '09:00' }] }]
 */
export function groupByLocalDate(slots: Date[], viewerTimezone: string) {
  const days: { date: string; slots: { startAt: string; localTime: string }[] }[] = [];
  for (const slot of slots) {
    const local = DateTime.fromJSDate(slot, { zone: viewerTimezone });
    const date = local.toISODate()!;
    if (days.at(-1)?.date !== date) days.push({ date, slots: [] });
    days.at(-1)!.slots.push({ startAt: slot.toISOString(), localTime: local.toFormat('HH:mm') });
  }
  return days;
}

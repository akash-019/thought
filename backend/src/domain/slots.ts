import { DateTime } from 'luxon';
import { parseHHMM, type WeeklyRule } from './availability.js';

/** Every session is exactly 50 minutes. */
export const SESSION_MINUTES = 50;
/**
 * Slots start every 60 minutes from the start of each working range: a 50-minute session
 * plus a 10-minute gap for the professional to write notes and reset before the next person.
 */
export const SLOT_STEP_MINUTES = 60;
/** Members can book up to 4 weeks ahead. */
export const BOOKING_WINDOW_DAYS = 28;

const MINUTE_MS = 60_000;

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotQuery {
  /** The professional's weekly hours, as wall-clock times in `timezone`. */
  rules: WeeklyRule[];
  /** The professional's IANA timezone. */
  timezone: string;
  /** Dates the professional is off ("YYYY-MM-DD" in their timezone). */
  blockedDates?: readonly string[];
  /** The professional's already-booked sessions. Any slot overlapping one is removed. */
  busy?: readonly Interval[];
  /** Only slots starting in [from, to) are returned. */
  from: Date;
  to: Date;
  /** Slots starting before this instant are never offered (now, or now + minimum notice). */
  earliestStart: Date;
}

/**
 * Turns a wall-clock time on a calendar date in `zone` into an instant.
 *
 * Daylight saving makes this ambiguous in two ways:
 * - Spring forward: some local times never happen (e.g. 02:30 in New York on the March change).
 *   We return null, so no slot is offered at a time that does not exist.
 * - Fall back: some local times happen twice (01:30 in New York on the November change).
 *   Luxon picks the second one; we deliberately pick the first, i.e. the moment a wall clock
 *   in that city first shows that time.
 */
export function localTimeToInstant(
  date: { year: number; month: number; day: number },
  minutesOfDay: number,
  zone: string,
): DateTime | null {
  if (minutesOfDay === 24 * 60) {
    // "24:00" means midnight at the start of the next day.
    const next = DateTime.fromObject(date, { zone }).plus({ days: 1 });
    return localTimeToInstant({ year: next.year, month: next.month, day: next.day }, 0, zone);
  }
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const dt = DateTime.fromObject({ ...date, hour, minute }, { zone });
  if (!dt.isValid) return null;
  if (dt.day !== date.day || dt.hour !== hour || dt.minute !== minute) return null; // fell in a DST gap

  // If the UTC offset was larger a few hours earlier, clocks went back recently and this wall
  // time may also have happened once before. Prefer that earlier instant when it exists.
  const earlierOffset = dt.minus({ hours: 6 }).offset;
  if (earlierOffset > dt.offset) {
    const alt = dt.minus({ minutes: earlierOffset - dt.offset });
    if (alt.day === date.day && alt.hour === hour && alt.minute === minute) return alt;
  }
  return dt;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/**
 * Available session start times (UTC, ascending) for one professional.
 *
 * Works on the professional's local calendar: for every local date that could touch the
 * requested window, it lays slots on that date's working ranges in wall-clock time and only
 * then converts each start to an instant. That keeps "Monday 09:00" at 09:00 local all year,
 * whatever daylight saving does, and the caller can display the instants in any timezone.
 */
export function generateSlots(q: SlotQuery): Date[] {
  if (q.to <= q.from) return [];
  const zone = q.timezone;
  const blocked = new Set(q.blockedDates ?? []);
  const busy = q.busy ?? [];
  const from = q.from.getTime();
  const to = q.to.getTime();
  const earliest = q.earliestStart.getTime();

  const rulesByWeekday = new Map<number, { startMin: number; endMin: number }[]>();
  for (const r of q.rules) {
    const startMin = parseHHMM(r.start);
    const endMin = parseHHMM(r.end);
    if (startMin === null || endMin === null || endMin <= startMin) continue;
    const list = rulesByWeekday.get(r.weekday) ?? [];
    list.push({ startMin, endMin });
    rulesByWeekday.set(r.weekday, list);
  }

  const result = new Set<number>();
  // One extra local day on each side: a UTC window edge can fall on a different local date.
  let day = DateTime.fromJSDate(q.from, { zone }).startOf('day').minus({ days: 1 });
  const lastDay = DateTime.fromJSDate(q.to, { zone }).startOf('day').plus({ days: 1 });

  for (; day <= lastDay; day = day.plus({ days: 1 })) {
    const ranges = rulesByWeekday.get(day.weekday);
    if (!ranges || blocked.has(day.toISODate()!)) continue;
    const date = { year: day.year, month: day.month, day: day.day };

    for (const range of ranges) {
      const rangeEnd = localTimeToInstant(date, range.endMin, zone);
      for (let m = range.startMin; m + SESSION_MINUTES <= range.endMin; m += SLOT_STEP_MINUTES) {
        const start = localTimeToInstant(date, m, zone);
        if (!start) continue; // local time does not exist today (DST gap)
        const startMs = start.toMillis();
        const endMs = startMs + SESSION_MINUTES * MINUTE_MS;
        // On DST days the real length of a range differs from its wall-clock length.
        if (rangeEnd && endMs > rangeEnd.toMillis()) continue;
        if (startMs < from || startMs >= to || startMs < earliest) continue;
        const slot = { start: new Date(startMs), end: new Date(endMs) };
        if (busy.some((b) => overlaps(slot, b))) continue;
        result.add(startMs);
      }
    }
  }
  return [...result].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/** True when `start` is exactly one of the slots generateSlots would offer right now. */
export function isOfferedSlot(q: Omit<SlotQuery, 'from' | 'to'>, start: Date): boolean {
  const slots = generateSlots({ ...q, from: start, to: new Date(start.getTime() + MINUTE_MS) });
  return slots.some((s) => s.getTime() === start.getTime());
}

export function sessionEnd(start: Date): Date {
  return new Date(start.getTime() + SESSION_MINUTES * MINUTE_MS);
}

export interface SlotDay {
  date: string; // YYYY-MM-DD in the viewer's timezone
  slots: { startAt: string; localTime: string }[];
}

/** Groups slot instants by calendar date in the viewer's timezone, for the booking calendar. */
export function groupByLocalDate(slots: readonly Date[], viewerTimezone: string): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (const s of slots) {
    const local = DateTime.fromJSDate(s, { zone: viewerTimezone });
    const date = local.toISODate()!;
    const day = days.get(date) ?? { date, slots: [] };
    day.slots.push({ startAt: s.toISOString(), localTime: local.toFormat('HH:mm') });
    days.set(date, day);
  }
  return [...days.values()];
}

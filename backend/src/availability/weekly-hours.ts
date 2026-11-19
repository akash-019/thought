/**
 * File: src/availability/weekly-hours.ts
 *
 * Weekly working hours: checking "HH:MM" ranges (no overlaps, no overnight ranges), and
 * loading a professional's hours and blocked dates from the database.
 */
import type { EntityManager } from 'typeorm';
import { AvailabilityRuleEntity, BlockedDateEntity } from '../db/entities.js';

/** One working range, e.g. { weekday: 1, start: '09:00', end: '17:00' } = Monday 9 to 5 (professional's timezone). */
export interface WeeklyRule {
  weekday: number; // 1 = Monday ... 7 = Sunday
  start: string; // "HH:MM"
  end: string; // "HH:MM"; "24:00" means midnight at the end of the day
}

/** "09:30" -> 570 (minutes since midnight). Returns null if the text is not a valid time. */
export function toMinutes(time: string): number | null {
  if (time === '24:00') return 24 * 60;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Returns the first problem with a weekly schedule, or null if it is fine. */
export function findScheduleProblem(rules: WeeklyRule[]): string | null {
  if (rules.length > 50) return 'At most 50 time ranges are allowed.';

  for (const rule of rules) {
    const start = toMinutes(rule.start);
    const end = toMinutes(rule.end);
    if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) {
      return `Weekday must be 1 (Monday) to 7 (Sunday), got ${rule.weekday}.`;
    }
    if (start === null || rule.start === '24:00') return `Invalid start time "${rule.start}" (use HH:MM).`;
    if (end === null) return `Invalid end time "${rule.end}" (use HH:MM).`;
    if (end <= start) return `${rule.start}-${rule.end}: end must be after start (overnight ranges are not supported).`;
  }

  const sorted = sortRules(rules);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.weekday === cur.weekday && toMinutes(cur.start)! < toMinutes(prev.end)!) {
      return `${prev.start}-${prev.end} overlaps ${cur.start}-${cur.end} on weekday ${cur.weekday}.`;
    }
  }
  return null;
}

/** Sorted by weekday, then start time. */
export function sortRules(rules: WeeklyRule[]): WeeklyRule[] {
  return [...rules].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

export async function loadWeeklyRules(db: EntityManager, professionalId: string): Promise<WeeklyRule[]> {
  const rows = await db.findBy(AvailabilityRuleEntity, { professionalId });
  // Postgres TIME comes back as "HH:MM:SS"; we only use "HH:MM".
  return sortRules(rows.map((r) => ({ weekday: r.weekday, start: r.startLocal.slice(0, 5), end: r.endLocal.slice(0, 5) })));
}

export async function loadBlockedDates(db: EntityManager, professionalId: string): Promise<string[]> {
  const rows = await db.findBy(BlockedDateEntity, { professionalId });
  return rows.map((r) => r.localDate).sort();
}

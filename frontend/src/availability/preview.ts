/**
 * File: src/availability/preview.ts
 *
 * Helpers for the weekly hours editor: which session start times a working range creates
 * (laid out exactly like the backend does it), and simple "HH:MM" arithmetic.
 */
import type { WeeklyRule } from '../api/types';

const SESSION_MINUTES = 50;
const STEP_MINUTES = 60; // a 50-minute session + 10-minute break

/** "09:30" -> 570 minutes since midnight */
export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** 570 -> "09:30" */
export const fromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "09:00" + 4 hours -> "13:00" (never past 23:55, the last time a time input can show) */
export const addHours = (time: string, hours: number) => fromMinutes(Math.min(toMinutes(time) + hours * 60, 23 * 60 + 55));

/** "3 sessions: 09:00, 10:00, 11:00" for one range, or why it gives none. */
export function previewSessions(rule: WeeklyRule): string {
  const start = toMinutes(rule.start);
  const end = toMinutes(rule.end);
  if (end <= start) return 'End must be after start.';
  const starts: string[] = [];
  for (let m = start; m + SESSION_MINUTES <= end; m += STEP_MINUTES) starts.push(fromMinutes(m));
  if (starts.length === 0) return 'Too short for a 50-minute session.';
  return `${starts.length} session${starts.length > 1 ? 's' : ''}: ${starts.join(', ')}`;
}

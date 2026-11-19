/**
 * File: src/lib/time.ts
 *
 * Date and time formatting. Every time is shown in a specific timezone (normally the logged-in
 * user's, chosen at sign-up), never the browser's, so what you see matches your account.
 */
import { DateTime } from 'luxon';

const at = (iso: string, zone: string) => DateTime.fromISO(iso, { zone });

/** "15:30" */
export const formatTime = (iso: string, zone: string) => at(iso, zone).toFormat('HH:mm');

/** "Wed 6 Jan" */
export const formatShortDate = (iso: string, zone: string) => at(iso, zone).toFormat('ccc d LLL');

/** "Wednesday 6 January" for a YYYY-MM-DD calendar date */
export const formatLongDate = (date: string) => DateTime.fromISO(date).toFormat('cccc d LLLL');

/** "Wednesday 6 January, 15:30" */
export const formatDateTime = (iso: string, zone: string) => at(iso, zone).toFormat("cccc d LLLL', 'HH:mm");

/** "Asia/Kolkata" -> "Kolkata", "America/Los_Angeles" -> "Los Angeles" */
export const cityOf = (zone: string) => (zone.split('/').pop() ?? zone).replaceAll('_', ' ');

/** "Today", "Tomorrow", "In 3 days" for a session, counted in calendar days in `zone`. */
export function dayLabel(iso: string, zone: string): string {
  const text = DateTime.fromISO(iso, { zone }).toRelativeCalendar({ base: DateTime.now().setZone(zone), unit: 'days' }) ?? '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The other person's clock time, with their weekday added when it is a different date for them:
 * "16:00", or "Tue 12:00" when it is still Tuesday in New York but already Wednesday for you.
 */
export function theirClock(iso: string, theirZone: string, yourZone: string): string {
  const theirs = at(iso, theirZone);
  const sameDate = theirs.toISODate() === at(iso, yourZone).toISODate();
  return sameDate ? theirs.toFormat('HH:mm') : theirs.toFormat('ccc HH:mm');
}

/** True if two timezones show a different clock time at this moment (e.g. Singapore vs Kolkata). */
export const clocksDiffer = (iso: string, zoneA: string, zoneB: string) => formatTime(iso, zoneA) !== formatTime(iso, zoneB);

/** "in 3 days", "in 2 hours", "2 days ago" */
export const relative = (iso: string) => DateTime.fromISO(iso).toRelative() ?? '';

/** Old timezone names some browsers still report, and their current names. */
const RENAMED: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
};

/** The browser's timezone (with old names updated), used as the default choice at sign-up. */
export const browserTimezone = () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return RENAMED[zone] ?? zone;
};

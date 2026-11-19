/**
 * File: src/booking/rules.ts
 *
 * Booking time rules: the 24-hour cancel/reschedule cutoff for members, and the
 * "not in the past / minimum notice" check for new bookings.
 */

/**
 * Members may cancel or reschedule only while the session is at least this far away.
 * Measured in real elapsed time (milliseconds), not calendar days, so a daylight saving change
 * in between does not stretch or shrink the window.
 */
export const MEMBER_CHANGE_CUTOFF_HOURS = 24;
const HOUR_MS = 3_600_000;

export function memberCanChange(sessionStart: Date, now: Date): boolean {
  return sessionStart.getTime() - now.getTime() >= MEMBER_CHANGE_CUTOFF_HOURS * HOUR_MS;
}

export const WITHIN_CUTOFF_MESSAGE =
  `Sessions can only be cancelled or rescheduled more than ${MEMBER_CHANGE_CUTOFF_HOURS} hours before they start. ` +
  'Please contact your professional if you can no longer attend.';

export type BookingTimeProblem = 'IN_PAST' | 'TOO_SOON' | null;

/** Why a start time cannot be booked yet, independent of availability. */
export function bookingTimeProblem(start: Date, now: Date, minNoticeMinutes: number): BookingTimeProblem {
  if (start.getTime() <= now.getTime()) return 'IN_PAST';
  if (start.getTime() < now.getTime() + minNoticeMinutes * 60_000) return 'TOO_SOON';
  return null;
}

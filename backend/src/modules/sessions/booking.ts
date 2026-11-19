/**
 * File: src/modules/sessions/booking.ts
 *
 * The booking logic. Each action runs in ONE database transaction, so it either fully
 * happens or not at all:
 * - bookSession:       check the slot, save the session, its reminders, and notify the professional.
 * - cancelSession:     24h rule for members, cancel reminders, notify the other person.
 * - rescheduleSession: cancel the old session and book the new one together (never zero or two).
 *
 * How double-booking is prevented: the database has constraints that refuse two booked sessions
 * overlapping for the same professional or the same member (see migration 003). So even if two
 * requests arrive at the same moment, Postgres lets only one insert through; the other fails with
 * error 23P01, which we turn into a clear "slot just taken" message.
 */
import type { DataSource, EntityManager } from 'typeorm';
import { SessionEntity } from './session.model.js';
import type { AuthUser } from '../auth/auth.middleware.js';
import { UserEntity } from '../auth/user.model.js';
import { isOfferedSlot, sessionEnd } from '../availability/slots.js';
import { loadBlockedDates, loadWeeklyRules } from '../availability/weekly-hours.js';
import { NotificationEntity, type NotificationType } from '../notifications/notification.model.js';
import { ReminderEntity } from '../notifications/reminder.model.js';
import { planReminders } from '../notifications/reminders.js';
import { badRequest, conflict, dbError, forbidden, notFound } from '../../common/errors.js';
import type { Settings } from '../../config.js';

interface BookingRequest {
  member: AuthUser;
  professionalId: string;
  start: Date;
  now: Date;
  settings: Pick<Settings, 'minNoticeMinutes'>;
}

export async function bookSession(db: DataSource, req: BookingRequest): Promise<string> {
  return withOverlapMessages(() =>
    db.transaction(async (m) => {
      const sessionId = await insertSession(m, req);
      await notify(m, req.professionalId, 'session_booked', sessionId);
      return sessionId;
    }),
  );
}

/** Members: only 24h or more before the start. Professionals: any time before it ends. */
export async function cancelSession(db: DataSource, req: { user: AuthUser; sessionId: string; now: Date }) {
  const { user, sessionId, now } = req;
  await db.transaction(async (m) => {
    const session = await lockOwnSession(m, user, sessionId);
    checkCanChange(session, user, now);

    await m.update(SessionEntity, { id: session.id }, { status: 'cancelled', cancelledBy: user.role, cancelledAt: now });
    await cancelReminders(m, session.id, now);
    const otherPerson = user.role === 'member' ? session.professionalId : session.memberId;
    await notify(m, otherPerson, 'session_cancelled', session.id);
  });
}

/**
 * Moves a member's session to another slot with the same professional.
 * Old session cancelled + new session booked in the same transaction: if the new slot fails
 * (taken, invalid...), everything rolls back and the member keeps the original session.
 */
export async function rescheduleSession(
  db: DataSource,
  req: { member: AuthUser; sessionId: string; start: Date; now: Date; settings: Pick<Settings, 'minNoticeMinutes'> },
): Promise<string> {
  const { member, sessionId, start, now, settings } = req;
  return withOverlapMessages(() =>
    db.transaction(async (m) => {
      const old = await lockOwnSession(m, member, sessionId);
      checkCanChange(old, member, now);
      if (old.startAt.getTime() === start.getTime()) throw badRequest('SAME_SLOT', 'Please pick a different time.');

      // Free the old slot first, so the member may also move to a slot overlapping the old one.
      await m.update(SessionEntity, { id: old.id }, { status: 'rescheduled', cancelledBy: 'member', cancelledAt: now });
      await cancelReminders(m, old.id, now);

      const newId = await insertSession(m, { member, professionalId: old.professionalId, start, now, settings }, old.id);
      await notify(m, old.professionalId, 'session_rescheduled', newId);
      return newId;
    }),
  );
}

// ---------------------------------------------------------------------------------------------

/**
 * Checks the slot is one the professional really offers (right time grid, working hours,
 * not blocked, not in the past), then saves the session and its reminders.
 * It does not check for clashes with other bookings itself: the database constraints do that.
 */
async function insertSession(m: EntityManager, req: BookingRequest, rescheduledFromId?: string): Promise<string> {
  const { member, professionalId, start, now, settings } = req;

  const pro = await m.findOneBy(UserEntity, { id: professionalId, role: 'professional' });
  if (!pro) throw notFound('Professional not found.');

  const timeProblem = bookingTimeProblem(start, now, settings.minNoticeMinutes);
  if (timeProblem === 'IN_PAST') throw badRequest('SLOT_IN_PAST', 'This time has already passed. Please pick a future slot.');
  if (timeProblem === 'TOO_SOON') {
    throw badRequest('TOO_SOON', `Sessions must be booked at least ${settings.minNoticeMinutes} minutes ahead.`);
  }

  const offered = isOfferedSlot(
    {
      rules: await loadWeeklyRules(m, pro.id),
      timezone: pro.timezone,
      blockedDates: await loadBlockedDates(m, pro.id),
      earliestStart: now,
    },
    start,
  );
  if (!offered) throw badRequest('INVALID_SLOT', 'This time is not one of the professional’s available slots.');

  const saved = await m.save(SessionEntity, {
    memberId: member.id,
    professionalId: pro.id,
    startAt: start,
    endAt: sessionEnd(start),
    status: 'booked',
    rescheduledFromId: rescheduledFromId ?? null,
  });

  for (const r of planReminders({ memberId: member.id, professionalId: pro.id, startAt: start }, now)) {
    await m.insert(ReminderEntity, { sessionId: saved.id, userId: r.userId, kind: r.kind, fireAt: r.fireAt, status: 'pending' });
  }
  return saved.id;
}

/** Loads the caller's session and locks it (SELECT ... FOR UPDATE) until the transaction ends. */
async function lockOwnSession(m: EntityManager, user: AuthUser, sessionId: string) {
  const owner = user.role === 'member' ? { memberId: user.id } : { professionalId: user.id };
  const session = await m.findOne(SessionEntity, { where: { id: sessionId, ...owner }, lock: { mode: 'pessimistic_write' } });
  // 404 (not 403) so we do not even reveal that someone else's session exists.
  if (!session) throw notFound('Session not found.');
  return session;
}

function checkCanChange(session: { status: string; startAt: Date; endAt: Date }, user: AuthUser, now: Date) {
  if (session.status !== 'booked') throw conflict('NOT_BOOKED', 'This session is no longer booked.');
  if (session.endAt <= now) throw conflict('SESSION_OVER', 'This session has already finished.');
  if (user.role === 'member' && !memberCanChange(session.startAt, now)) throw forbidden('WITHIN_24H', WITHIN_CUTOFF_MESSAGE);
}

async function cancelReminders(m: EntityManager, sessionId: string, now: Date) {
  await m.update(ReminderEntity, { sessionId, status: 'pending' }, { status: 'cancelled', processedAt: now });
}

async function notify(m: EntityManager, userId: string, type: NotificationType, sessionId: string) {
  await m.insert(NotificationEntity, { userId, type, sessionId });
}

/** Runs a booking action and turns the database's "overlapping session" error into a clear 409. */
async function withOverlapMessages<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    const { code, constraint } = dbError(err);
    if (code !== '23P01') throw err;
    if (constraint === 'sessions_no_member_overlap') {
      throw conflict('MEMBER_OVERLAP', 'You already have another session at this time.');
    }
    throw conflict('SLOT_TAKEN', 'Sorry, this time was just booked. Please pick another slot.');
  }
}

// --- Time rules ------------------------------------------------------------------------------

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

/**
 * File: src/modules/notifications/reminders.ts
 *
 * Reminders: 24 hours and 1 hour before each session, for both the member and the professional.
 * - planReminders:       which reminders to create when a session is booked.
 * - processDueReminders: called by the worker every few seconds to deliver the due ones.
 *
 * How each reminder is delivered exactly once, even after a crash or restart:
 * 1. Reminders are rows in the database (status 'pending'), created in the same transaction
 *    as the booking. Nothing lives in memory, so a restart loses nothing.
 * 2. Delivering = in ONE transaction, insert the notification AND mark the reminder 'delivered'.
 *    Both happen or neither does, so a crash can never deliver without marking (or the reverse).
 * 3. `FOR UPDATE SKIP LOCKED` means two workers running at once never pick the same reminder.
 * 4. notifications.reminder_id is UNIQUE: the database refuses a second notification for a reminder.
 */
import type { DataSource } from 'typeorm';
import { NotificationEntity } from './notification.model.js';
import { ReminderEntity, type ReminderKind } from './reminder.model.js';
import { MINUTE_MS } from '../../common/clock.js';

const REMINDERS: { kind: ReminderKind; minutesBefore: number }[] = [
  { kind: '24h', minutesBefore: 24 * 60 },
  { kind: '1h', minutesBefore: 60 },
];

/** How many due reminders one worker round handles at most. */
const BATCH_SIZE = 500;

/** Reminders to create for a new session. Times that have already passed are skipped. */
export function planReminders(session: { memberId: string; professionalId: string; startAt: Date }, now: Date) {
  const planned: { userId: string; kind: ReminderKind; fireAt: Date }[] = [];
  for (const { kind, minutesBefore } of REMINDERS) {
    const fireAt = new Date(session.startAt.getTime() - minutesBefore * MINUTE_MS);
    if (fireAt <= now) continue;
    planned.push({ userId: session.memberId, kind, fireAt });
    planned.push({ userId: session.professionalId, kind, fireAt });
  }
  return planned;
}

/**
 * The new status of a due reminder. Normally 'delivered'. But if the worker was down and the
 * session has already started, a "starts soon" message is useless, so it is 'expired' instead.
 */
export function newReminderStatus(sessionStatus: string, sessionStart: Date, now: Date): 'delivered' | 'expired' | 'cancelled' {
  if (sessionStatus !== 'booked') return 'cancelled'; // safety net: cancelling already does this
  if (now >= sessionStart) return 'expired';
  return 'delivered';
}

/** Delivers the due reminders (up to BATCH_SIZE). Returns how many were delivered / expired / cancelled. */
export async function processDueReminders(db: DataSource, now: Date) {
  return db.transaction(async (tx) => {
    const due: { id: string; user_id: string; session_id: string; kind: ReminderKind; status: string; start_at: Date }[] =
      await tx.query(
        `SELECT r.id, r.user_id, r.session_id, r.kind, s.status, s.start_at
           FROM reminders r
           JOIN sessions s ON s.id = r.session_id
          WHERE r.status = 'pending' AND r.fire_at <= $1
          ORDER BY r.fire_at
          LIMIT $2
          FOR UPDATE OF r SKIP LOCKED`,
        [now, BATCH_SIZE],
      );

    const counts = { delivered: 0, expired: 0, cancelled: 0 };
    for (const reminder of due) {
      const newStatus = newReminderStatus(reminder.status, reminder.start_at, now);
      if (newStatus === 'delivered') {
        await tx
          .createQueryBuilder()
          .insert()
          .into(NotificationEntity)
          .values({ userId: reminder.user_id, type: `reminder_${reminder.kind}`, sessionId: reminder.session_id, reminderId: reminder.id })
          .orIgnore() // ON CONFLICT DO NOTHING: never a second notification for one reminder
          .execute();
      }
      await tx.update(ReminderEntity, { id: reminder.id }, { status: newStatus, processedAt: now });
      counts[newStatus] += 1;
    }
    return counts;
  });
}

/**
 * Runs processDueReminders every `pollMs` until the returned `stop()` is called. A failed round
 * is logged and simply retried on the next one: nothing is lost because the state is in the database.
 * Used by the separate worker process (worker.ts) or, on single-process hosting, inside the API.
 */
export function startReminderLoop(db: DataSource, now: () => Date, pollMs: number): { stop: () => void } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function round() {
    try {
      const result = await processDueReminders(db, now());
      if (result.delivered || result.expired || result.cancelled) console.log('reminders processed', result);
    } catch (err) {
      console.error('reminder round failed (will retry)', err);
    }
    if (!stopped) timer = setTimeout(round, pollMs);
  }

  void round();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

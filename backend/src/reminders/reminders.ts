/**
 * File: src/reminders/reminders.ts
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
import { NotificationEntity, ReminderEntity, type ReminderKind } from '../db/entities.js';

const REMINDERS: { kind: ReminderKind; minutesBefore: number }[] = [
  { kind: '24h', minutesBefore: 24 * 60 },
  { kind: '1h', minutesBefore: 60 },
];

/** Reminders to create for a new session. Times that have already passed are skipped. */
export function planReminders(session: { memberId: string; professionalId: string; startAt: Date }, now: Date) {
  const planned: { userId: string; kind: ReminderKind; fireAt: Date }[] = [];
  for (const { kind, minutesBefore } of REMINDERS) {
    const fireAt = new Date(session.startAt.getTime() - minutesBefore * 60_000);
    if (fireAt <= now) continue;
    planned.push({ userId: session.memberId, kind, fireAt });
    planned.push({ userId: session.professionalId, kind, fireAt });
  }
  return planned;
}

/**
 * What to do with a due reminder. Normally deliver it. But if the worker was down and the
 * session has already started, a "starts soon" message is useless, so it is expired instead.
 */
export function decideDelivery(sessionStatus: string, sessionStart: Date, now: Date): 'deliver' | 'expire' | 'cancel' {
  if (sessionStatus !== 'booked') return 'cancel'; // safety net: cancelling already does this
  if (now >= sessionStart) return 'expire';
  return 'deliver';
}

/** Delivers up to `limit` due reminders. Returns how many were delivered / expired / cancelled. */
export async function processDueReminders(db: DataSource, now: Date, limit = 500) {
  return db.transaction(async (m) => {
    const due: { id: string; user_id: string; session_id: string; kind: ReminderKind; status: string; start_at: Date }[] =
      await m.query(
        `SELECT r.id, r.user_id, r.session_id, r.kind, s.status, s.start_at
           FROM reminders r
           JOIN sessions s ON s.id = r.session_id
          WHERE r.status = 'pending' AND r.fire_at <= $1
          ORDER BY r.fire_at
          LIMIT $2
          FOR UPDATE OF r SKIP LOCKED`,
        [now, limit],
      );

    const counts = { delivered: 0, expired: 0, cancelled: 0 };
    for (const r of due) {
      const decision = decideDelivery(r.status, r.start_at, now);
      if (decision === 'deliver') {
        await m
          .createQueryBuilder()
          .insert()
          .into(NotificationEntity)
          .values({ userId: r.user_id, type: `reminder_${r.kind}`, sessionId: r.session_id, reminderId: r.id })
          .orIgnore() // ON CONFLICT DO NOTHING: never a second notification for one reminder
          .execute();
      }
      const status = { deliver: 'delivered', expire: 'expired', cancel: 'cancelled' } as const;
      await m.update(ReminderEntity, { id: r.id }, { status: status[decision], processedAt: now });
      counts[status[decision]] += 1;
    }
    return counts;
  });
}

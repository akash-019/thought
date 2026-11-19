/**
 * File: src/db/migrations/004_reminders_and_notifications.ts
 *
 * Migration 4: reminders to deliver and the in-app notification list.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemindersAndNotifications1763510400004 implements MigrationInterface {
  name = 'RemindersAndNotifications1763510400004';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
-- One row per reminder that should be delivered. Rows are written in the same transaction
-- as the booking, so a committed booking always has its reminders (transactional outbox).
CREATE TABLE reminders (
  id           BIGSERIAL PRIMARY KEY,
  session_id   BIGINT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('24h', '1h')),
  fire_at      TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'cancelled', 'expired')),
  processed_at TIMESTAMPTZ,
  UNIQUE (session_id, user_id, kind)
);

-- The worker only ever scans pending rows by due time.
CREATE INDEX reminders_due_idx ON reminders (fire_at) WHERE status = 'pending';

-- The in-app notification list. Text is not stored: the app renders each notification from
-- its type and session, in the reader's own timezone.
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
                'reminder_24h', 'reminder_1h', 'session_booked', 'session_cancelled', 'session_rescheduled')),
  session_id  BIGINT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  -- UNIQUE: a reminder can produce at most one notification, ever. This is the last line of
  -- defence for exactly-once delivery if the worker logic were ever run twice for a reminder.
  reminder_id BIGINT UNIQUE REFERENCES reminders (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE notifications; DROP TABLE reminders;`);
  }
}

/**
 * File: src/db/migrations/003_sessions.ts
 *
 * Migration 3: booked sessions, including the constraints that make double-booking
 * impossible at the database level.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Sessions1763510400003 implements MigrationInterface {
  name = 'Sessions1763510400003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE sessions (
  id                  BIGSERIAL PRIMARY KEY,
  member_id           BIGINT NOT NULL REFERENCES users (id),
  professional_id     BIGINT NOT NULL REFERENCES users (id),
  start_at            TIMESTAMPTZ NOT NULL,
  end_at              TIMESTAMPTZ NOT NULL,
  -- 'rescheduled' = replaced by the session whose rescheduled_from_id points here.
  status              TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'rescheduled')),
  cancelled_by        TEXT CHECK (cancelled_by IN ('member', 'professional')),
  cancelled_at        TIMESTAMPTZ,
  rescheduled_from_id BIGINT REFERENCES sessions (id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at = start_at + interval '50 minutes'),
  CHECK (member_id <> professional_id),

  -- The double-booking guarantee lives in the database, not in application code.
  -- Two booked sessions for the same professional can never overlap in time, and neither can
  -- two booked sessions for the same member. Postgres checks this atomically on insert/update,
  -- so two requests racing for the same slot cannot both succeed: the second gets error 23P01.
  CONSTRAINT sessions_no_professional_overlap
    EXCLUDE USING gist (professional_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (status = 'booked'),
  CONSTRAINT sessions_no_member_overlap
    EXCLUDE USING gist (member_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (status = 'booked')
);

CREATE INDEX sessions_member_start_idx ON sessions (member_id, start_at);
CREATE INDEX sessions_professional_start_idx ON sessions (professional_id, start_at);
`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE sessions;`);
  }
}

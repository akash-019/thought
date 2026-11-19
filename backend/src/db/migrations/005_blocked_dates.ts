/**
 * File: src/db/migrations/005_blocked_dates.ts
 *
 * Migration 5: days a professional has blocked off (holidays).
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BlockedDates1763510400005 implements MigrationInterface {
  name = 'BlockedDates1763510400005';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
-- Whole days a professional is unavailable (holidays), as calendar dates in their own timezone.
CREATE TABLE blocked_dates (
  professional_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  local_date      DATE NOT NULL,
  PRIMARY KEY (professional_id, local_date)
);
`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE blocked_dates;`);
  }
}

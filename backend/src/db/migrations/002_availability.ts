/**
 * File: src/db/migrations/002_availability.ts
 *
 * Migration 2: professionals' weekly working hours.
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Availability1763510400002 implements MigrationInterface {
  name = 'Availability1763510400002';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
-- Weekly working hours, stored as wall-clock times in the professional's own timezone.
-- They are converted to UTC per calendar date when slots are generated, so a 09:00 start
-- stays 09:00 local across daylight saving changes.
CREATE TABLE availability_rules (
  id              BIGSERIAL PRIMARY KEY,
  professional_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  weekday         SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: 1 = Monday, 7 = Sunday
  start_local     TIME NOT NULL,
  end_local       TIME NOT NULL,
  CHECK (end_local > start_local)
);

CREATE INDEX availability_rules_professional_idx ON availability_rules (professional_id, weekday);
`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE availability_rules;`);
  }
}

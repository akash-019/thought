/**
 * File: src/modules/availability/availability-rule.model.ts
 *
 * Model: one weekly working-hours range of a professional, e.g. Monday 09:00-17:00. Table `availability_rules`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';

export interface AvailabilityRule {
  id: string;
  professionalId: string;
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  weekday: number;
  /** Wall-clock time in the professional's timezone, 'HH:MM:SS' from Postgres. */
  startLocal: string;
  endLocal: string;
}

export const AvailabilityRuleEntity = new EntitySchema<AvailabilityRule>({
  name: 'AvailabilityRule',
  tableName: 'availability_rules',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    professionalId: { type: 'bigint', name: 'professional_id' },
    weekday: { type: 'smallint' },
    startLocal: { type: 'time', name: 'start_local' },
    endLocal: { type: 'time', name: 'end_local' },
  },
});

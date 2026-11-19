/**
 * File: src/modules/availability/blocked-date.model.ts
 *
 * Model: a whole day a professional is unavailable (holiday). Table `blocked_dates`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';

export interface BlockedDate {
  professionalId: string;
  /** 'YYYY-MM-DD' in the professional's timezone. */
  localDate: string;
}

export const BlockedDateEntity = new EntitySchema<BlockedDate>({
  name: 'BlockedDate',
  tableName: 'blocked_dates',
  columns: {
    professionalId: { type: 'bigint', primary: true, name: 'professional_id' },
    localDate: { type: 'date', primary: true, name: 'local_date' },
  },
});

/**
 * File: src/modules/notifications/reminder.model.ts
 *
 * Model: a reminder waiting to be delivered (24h or 1h before a session). Table `reminders`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';

export type ReminderKind = '24h' | '1h';
export type ReminderStatus = 'pending' | 'delivered' | 'cancelled' | 'expired';

export interface Reminder {
  id: string;
  sessionId: string;
  userId: string;
  kind: ReminderKind;
  fireAt: Date;
  status: ReminderStatus;
  processedAt: Date | null;
}

export const ReminderEntity = new EntitySchema<Reminder>({
  name: 'Reminder',
  tableName: 'reminders',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    sessionId: { type: 'bigint', name: 'session_id' },
    userId: { type: 'bigint', name: 'user_id' },
    kind: { type: 'text' },
    fireAt: { type: 'timestamptz', name: 'fire_at' },
    status: { type: 'text', default: 'pending' },
    processedAt: { type: 'timestamptz', name: 'processed_at', nullable: true },
  },
});

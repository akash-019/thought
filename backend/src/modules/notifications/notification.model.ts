/**
 * File: src/modules/notifications/notification.model.ts
 *
 * Model: an item in a user's in-app notification list. Table `notifications`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';

export type NotificationType =
  | 'reminder_24h'
  | 'reminder_1h'
  | 'session_booked'
  | 'session_cancelled'
  | 'session_rescheduled';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  sessionId: string;
  reminderId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export const NotificationEntity = new EntitySchema<Notification>({
  name: 'Notification',
  tableName: 'notifications',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    userId: { type: 'bigint', name: 'user_id' },
    type: { type: 'text' },
    sessionId: { type: 'bigint', name: 'session_id' },
    reminderId: { type: 'bigint', name: 'reminder_id', nullable: true, unique: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true },
    readAt: { type: 'timestamptz', name: 'read_at', nullable: true },
  },
});

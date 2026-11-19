/**
 * File: src/db/entities.ts
 *
 * TypeORM entity definitions: one per table (users, availability_rules,
 * blocked_dates, sessions, reminders, notifications, refresh_tokens) plus their TypeScript types.
 * Used by every feature to read and write the database.
 */
import { EntitySchema } from 'typeorm';

/*
 * TypeORM entities defined with EntitySchema (plain objects) instead of decorators.
 * Decorators need `emitDecoratorMetadata`, which esbuild-based tools (tsx, Vitest) do not
 * support, so decorated entities can silently lose column types. EntitySchema avoids that.
 *
 * Conventions: camelCase properties, snake_case columns. BIGINT ids come back from pg as
 * strings (JS numbers cannot hold every 64-bit value). TIMESTAMPTZ comes back as Date (UTC).
 *
 * The tables themselves are created by the hand-written migrations in ./migrations, which also
 * hold the constraints TypeORM cannot express (e.g. the double-booking exclusion constraints).
 */

export type Role = 'member' | 'professional';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  /** IANA timezone, e.g. 'Asia/Kolkata'. */
  timezone: string;
  bio: string | null;
  createdAt: Date;
}

export const UserEntity = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    name: { type: 'text' },
    email: { type: 'text', unique: true },
    passwordHash: { type: 'text', name: 'password_hash' },
    role: { type: 'text' },
    timezone: { type: 'text' },
    bio: { type: 'text', nullable: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true },
  },
});

export interface RefreshToken {
  id: string;
  userId: string;
  /** SHA-256 of the token; the token itself is only ever held by the client. */
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Set on logout, on rotation, or when reuse of an old token is detected. */
  revokedAt: Date | null;
}

export const RefreshTokenEntity = new EntitySchema<RefreshToken>({
  name: 'RefreshToken',
  tableName: 'refresh_tokens',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    userId: { type: 'bigint', name: 'user_id' },
    tokenHash: { type: 'text', name: 'token_hash', unique: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true },
    expiresAt: { type: 'timestamptz', name: 'expires_at' },
    revokedAt: { type: 'timestamptz', name: 'revoked_at', nullable: true },
  },
});

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

export type SessionStatus = 'booked' | 'cancelled' | 'rescheduled';

export interface Session {
  id: string;
  memberId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  status: SessionStatus;
  cancelledBy: Role | null;
  cancelledAt: Date | null;
  /** Set on the new session when a member reschedules; points at the one it replaced. */
  rescheduledFromId: string | null;
  createdAt: Date;
}

export const SessionEntity = new EntitySchema<Session>({
  name: 'Session',
  tableName: 'sessions',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    memberId: { type: 'bigint', name: 'member_id' },
    professionalId: { type: 'bigint', name: 'professional_id' },
    startAt: { type: 'timestamptz', name: 'start_at' },
    endAt: { type: 'timestamptz', name: 'end_at' },
    status: { type: 'text', default: 'booked' },
    cancelledBy: { type: 'text', name: 'cancelled_by', nullable: true },
    cancelledAt: { type: 'timestamptz', name: 'cancelled_at', nullable: true },
    rescheduledFromId: { type: 'bigint', name: 'rescheduled_from_id', nullable: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true },
  },
});

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

export const ENTITIES = [
  UserEntity,
  RefreshTokenEntity,
  AvailabilityRuleEntity,
  BlockedDateEntity,
  SessionEntity,
  ReminderEntity,
  NotificationEntity,
];

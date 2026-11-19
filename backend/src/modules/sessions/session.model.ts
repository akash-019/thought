/**
 * File: src/modules/sessions/session.model.ts
 *
 * Model: a 50-minute session between a member and a professional. Table `sessions`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';
import type { Role } from '../auth/user.model.js';

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

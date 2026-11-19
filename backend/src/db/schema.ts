import type { ColumnType, Generated } from 'kysely';

/** Timestamps come back from pg as Date and can be written as Date or ISO string. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface UsersTable {
  id: Generated<string>; // BIGSERIAL comes back from pg as a string
  name: string;
  email: string;
  password_hash: string;
  role: 'member' | 'professional';
  timezone: string;
  bio: string | null;
  created_at: ColumnType<Date, never, never>;
}

export interface AuthSessionsTable {
  token_hash: string;
  user_id: string;
  created_at: ColumnType<Date, never, never>;
  expires_at: Timestamp;
}

export interface AvailabilityRulesTable {
  id: Generated<string>;
  professional_id: string;
  weekday: number;
  start_local: string; // 'HH:MM:SS'
  end_local: string;
}

export interface Database {
  users: UsersTable;
  auth_sessions: AuthSessionsTable;
  availability_rules: AvailabilityRulesTable;
}

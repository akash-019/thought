/**
 * File: src/modules/auth/user.model.ts
 *
 * Model: a user account (member or professional). Table `users`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';

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

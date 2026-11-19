/**
 * File: src/db/migrations/001_users_and_auth.ts
 *
 * Migration 1: users table and refresh tokens (for keeping users logged in).
 */
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersAndAuth1763510400001 implements MigrationInterface {
  name = 'UsersAndAuth1763510400001';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('member', 'professional')),
  -- IANA name such as 'Asia/Kolkata'. Validated by the app; all instants are stored in UTC.
  timezone      TEXT NOT NULL,
  bio           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_role_idx ON users (role);

-- Refresh tokens. Access tokens (JWT, 15 min) are not stored; refresh tokens (7 days) are,
-- so they can be rotated and revoked. Only a SHA-256 hash is stored: a database leak does not
-- hand out working tokens. Each refresh revokes the old token and issues a new one.
CREATE TABLE refresh_tokens (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE refresh_tokens; DROP TABLE users;`);
  }
}

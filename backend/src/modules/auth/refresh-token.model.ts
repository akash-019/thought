/**
 * File: src/modules/auth/refresh-token.model.ts
 *
 * Model: a refresh token (stored as a hash) that keeps a user logged in. Table `refresh_tokens`.
 * Columns are camelCase here and snake_case in the database. The table itself is created by
 * the migrations in src/db/migrations.
 */
import { EntitySchema } from 'typeorm';

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

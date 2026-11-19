import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db/client.js';

export const SESSION_COOKIE = 'sid';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'professional';
  timezone: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a login session and returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(db: DB, userId: string, now: Date, ttlDays: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  await db
    .insertInto('auth_sessions')
    .values({ token_hash: hashToken(token), user_id: userId, expires_at: expiresAt })
    .execute();
  return token;
}

export async function findSessionUser(db: DB, token: string, now: Date): Promise<AuthUser | undefined> {
  return db
    .selectFrom('auth_sessions as s')
    .innerJoin('users as u', 'u.id', 's.user_id')
    .select(['u.id', 'u.name', 'u.email', 'u.role', 'u.timezone'])
    .where('s.token_hash', '=', hashToken(token))
    .where('s.expires_at', '>', now)
    .executeTakeFirst();
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  await db.deleteFrom('auth_sessions').where('token_hash', '=', hashToken(token)).execute();
}

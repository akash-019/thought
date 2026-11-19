/**
 * File: src/modules/auth/tokens.ts
 *
 * Login tokens: the access token + refresh token pattern.
 * - Access token: a signed JWT, valid 15 minutes, sent as `Authorization: Bearer <token>`.
 *   Checked on every request just by verifying the signature (no database lookup for the token).
 * - Refresh token: a random string, valid 7 days, stored in the database only as a SHA-256 hash.
 *   POST /auth/refresh swaps it for a brand-new pair ("rotation") and the old one stops working.
 *   If an old, already-used refresh token is presented again, someone may have stolen it,
 *   so ALL of that user's refresh tokens are revoked ("reuse detection").
 */
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.model.js';
import { UserEntity, type Role, type User } from './user.model.js';
import { config, type Settings } from '../../config.js';

type Lifetimes = Pick<Settings, 'accessTokenTtlMinutes' | 'refreshTokenTtlDays'>;

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** Creates a new access token + refresh token for a user (sign up, log in, refresh). */
export async function issueTokens(m: EntityManager, user: { id: string; role: Role }, now: Date, ttl: Lifetimes): Promise<TokenPair> {
  // Access token: a JWT holding the user id and role. `iat` uses our clock so tests control expiry.
  const accessExpiresAt = new Date(now.getTime() + ttl.accessTokenTtlMinutes * 60_000);
  const accessToken = jwt.sign({ sub: user.id, role: user.role, iat: seconds(now) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: ttl.accessTokenTtlMinutes * 60,
  });

  // Refresh token: random, stored hashed.
  const refreshToken = randomBytes(32).toString('base64url');
  const refreshExpiresAt = new Date(now.getTime() + ttl.refreshTokenTtlDays * 86_400_000);
  await m.insert(RefreshTokenEntity, { userId: user.id, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt });

  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

/** Returns the user id from a valid access token, 'expired' if it has expired, or null if it is invalid. */
export function verifyAccessToken(token: string, now: Date): { userId: string } | 'expired' | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], clockTimestamp: seconds(now) });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? { userId: payload.sub } : null;
  } catch (err) {
    return err instanceof jwt.TokenExpiredError ? 'expired' : null;
  }
}

/**
 * Swaps a refresh token for a new pair. Returns null if the token is unknown, expired or revoked.
 * The token row is locked (FOR UPDATE) so the same token can never be used twice in parallel.
 */
export async function rotateRefreshToken(
  db: DataSource,
  refreshToken: string,
  now: Date,
  ttl: Lifetimes,
): Promise<{ user: User; tokens: TokenPair } | null> {
  return db.transaction(async (m) => {
    const stored = await m.findOne(RefreshTokenEntity, {
      where: { tokenHash: sha256(refreshToken) },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stored || stored.expiresAt <= now) return null;

    if (stored.revokedAt) {
      // This token was already used (or logged out). Possible theft: log the user out everywhere.
      await m.update(RefreshTokenEntity, { userId: stored.userId, revokedAt: IsNull() }, { revokedAt: now });
      return null;
    }

    const user = await m.findOneBy(UserEntity, { id: stored.userId });
    if (!user) return null;

    await m.update(RefreshTokenEntity, { id: stored.id }, { revokedAt: now });
    return { user, tokens: await issueTokens(m, user, now, ttl) };
  });
}

/** Logout: the refresh token stops working. Unknown or already-revoked tokens are ignored. */
export async function revokeRefreshToken(m: EntityManager, refreshToken: string, now: Date): Promise<void> {
  await m.update(RefreshTokenEntity, { tokenHash: sha256(refreshToken), revokedAt: IsNull() }, { revokedAt: now });
}

/**
 * File: src/auth/auth.routes.ts
 *
 * Routes: sign up, log in, refresh tokens, log out, GET /me, and the timezone list for the
 * sign-up form. Sign up and log in return an access token + refresh token pair.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { UserEntity, type User } from '../db/entities.js';
import { conflict, dbError, unauthorized } from '../shared/errors.js';
import { isValidTimezone, TIMEZONES } from '../shared/timezones.js';
import { requireUser, type AuthUser } from './auth.middleware.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken } from './tokens.js';

const email = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.email().max(254));

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  role: z.enum(['member', 'professional']),
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone.'),
  bio: z.string().trim().max(1000).optional(),
});

const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const refreshSchema = z.object({ refreshToken: z.string().min(1).max(200) });

/** The user fields that are safe to send to the client (never the password hash). */
const publicUser = (u: Pick<User, 'id' | 'name' | 'email' | 'role' | 'timezone'>): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  timezone: u.timezone,
});

// Verifying against a throwaway hash when the email is unknown keeps the response time
// similar either way, so login timing does not reveal which emails have accounts.
const dummyHash = hashPassword('not-a-real-password');

export function authRoutes({ db, clock, settings }: AppDeps): Router {
  const router = Router();

  router.get('/timezones', (_req, res) => {
    res.json({ timezones: TIMEZONES });
  });

  router.post('/auth/signup', async (req, res) => {
    const input = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    let saved;
    try {
      saved = await db.manager.save(UserEntity, {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        timezone: input.timezone,
        bio: input.role === 'professional' ? (input.bio ?? null) : null,
      });
    } catch (err) {
      if (dbError(err).code === '23505') throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
      throw err;
    }
    const user = publicUser(saved);
    res.status(201).json({ user, ...(await issueTokens(db.manager, user, clock.now(), settings)) });
  });

  router.post('/auth/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const row = await db.manager.findOneBy(UserEntity, { email: input.email });
    const ok = await verifyPassword(input.password, row?.passwordHash ?? (await dummyHash));
    if (!row || !ok) throw unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
    const user = publicUser(row);
    res.json({ user, ...(await issueTokens(db.manager, user, clock.now(), settings)) });
  });

  /** Swaps a valid refresh token for a new access + refresh token pair. */
  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await rotateRefreshToken(db, refreshToken, clock.now(), settings);
    if (!result) throw unauthorized('Your session has ended. Please log in again.', 'INVALID_REFRESH_TOKEN');
    res.json({ user: publicUser(result.user), ...result.tokens });
  });

  /** Revokes the refresh token. The client also discards its access token (valid at most 15 more minutes). */
  router.post('/auth/logout', async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await revokeRefreshToken(db.manager, refreshToken, clock.now());
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    res.json({ user: requireUser(req) });
  });

  return router;
}

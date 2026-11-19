/**
 * File: src/modules/auth/auth.routes.ts
 *
 * Routes: sign up, log in, refresh tokens, log out, GET /me, and the timezone list for the
 * sign-up form. Sign up and log in return an access token + refresh token pair.
 */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireUser, toAuthUser } from './auth.middleware.js';
import { loginSchema, refreshTokenSchema, signupSchema } from './auth.schema.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken } from './tokens.js';
import { UserEntity } from './user.model.js';
import type { AppDeps } from '../../app.js';
import { conflict, dbError, unauthorized } from '../../common/errors.js';
import { MINUTE_MS } from '../../common/clock.js';
import { TIMEZONES } from '../../common/timezones.js';

// Verifying against a throwaway hash when the email is unknown keeps the response time
// similar either way, so login timing does not reveal which emails have accounts.
const dummyHash = hashPassword('not-a-real-password');

/** A per-IP request limit that answers 429 with our usual error shape once it is reached. */
function limitPerIp(options: { windowMs: number; limit: number; countSuccesses: boolean; code: string; message: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: !options.countSuccesses,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: options.code, message: options.message } });
    },
  });
}

export function authRoutes({ db, clock, settings }: AppDeps): Router {
  const router = Router();

  // Slows down password guessing: after 10 failed log-ins from one IP in 15 minutes, log-in is
  // refused for the rest of that window. Successful log-ins don't count.
  const loginLimiter = limitPerIp({
    windowMs: 15 * MINUTE_MS,
    limit: 10,
    countSuccesses: false,
    code: 'TOO_MANY_ATTEMPTS',
    message: 'Too many failed log-in attempts. Please wait 15 minutes and try again.',
  });

  // Registration is open (the brief asks for it), so cap how many accounts one IP can create
  // per hour. Stops a script from flooding the app with fake members or professionals.
  const signupLimiter = limitPerIp({
    windowMs: 60 * MINUTE_MS,
    limit: settings.signupsPerHour,
    countSuccesses: true,
    code: 'TOO_MANY_SIGNUPS',
    message: 'Too many new accounts from this network. Please try again in an hour.',
  });

  router.get('/timezones', (_req, res) => {
    res.json({ timezones: TIMEZONES });
  });

  router.post('/auth/signup', signupLimiter, async (req, res) => {
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
    const user = toAuthUser(saved);
    res.status(201).json({ user, ...(await issueTokens(db.manager, user, clock.now(), settings)) });
  });

  router.post('/auth/login', loginLimiter, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const row = await db.manager.findOneBy(UserEntity, { email: input.email });
    const ok = await verifyPassword(input.password, row?.passwordHash ?? (await dummyHash));
    if (!row || !ok) throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password.');
    const user = toAuthUser(row);
    res.json({ user, ...(await issueTokens(db.manager, user, clock.now(), settings)) });
  });

  /** Swaps a valid refresh token for a new access + refresh token pair. */
  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const result = await rotateRefreshToken(db, refreshToken, clock.now(), settings);
    if (!result) throw unauthorized('INVALID_REFRESH_TOKEN', 'Your session has ended. Please log in again.');
    res.json({ user: toAuthUser(result.user), ...result.tokens });
  });

  /** Revokes the refresh token. The client also discards its access token (valid at most 15 more minutes). */
  router.post('/auth/logout', async (req, res) => {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await revokeRefreshToken(db.manager, refreshToken, clock.now());
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    res.json({ user: requireUser(req) });
  });

  return router;
}

import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, deleteSession, SESSION_COOKIE } from '../auth/sessions.js';
import { config } from '../config.js';
import type { AppDeps } from '../app.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { pgCode } from '../lib/http.js';
import { isValidTimezone, TIMEZONES } from '../lib/timezones.js';

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

// Verifying against a throwaway hash when the email is unknown keeps the response time
// similar either way, so login timing does not reveal which emails have accounts.
const dummyHash = hashPassword('not-a-real-password');

export function authRoutes({ db, clock }: AppDeps): Router {
  const router = Router();

  function setSessionCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // not readable from JavaScript
      sameSite: 'lax', // not sent on cross-site POST/PUT/DELETE, which blocks CSRF on state changes
      secure: config.cookieSecure,
      path: '/',
      maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  router.get('/timezones', (_req, res) => {
    res.json({ timezones: TIMEZONES });
  });

  router.post('/auth/signup', async (req, res) => {
    const input = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = await db
        .insertInto('users')
        .values({
          name: input.name,
          email: input.email,
          password_hash: passwordHash,
          role: input.role,
          timezone: input.timezone,
          bio: input.role === 'professional' ? (input.bio ?? null) : null,
        })
        .returning(['id', 'name', 'email', 'role', 'timezone'])
        .executeTakeFirstOrThrow();
    } catch (err) {
      if (pgCode(err) === '23505') throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
      throw err;
    }
    setSessionCookie(res, await createSession(db, user.id, clock.now(), config.sessionTtlDays));
    res.status(201).json({ user });
  });

  router.post('/auth/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const row = await db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'role', 'timezone', 'password_hash'])
      .where('email', '=', input.email)
      .executeTakeFirst();
    const ok = await verifyPassword(input.password, row?.password_hash ?? (await dummyHash));
    if (!row || !ok) throw unauthorized('Invalid email or password.');
    const { password_hash: _omit, ...user } = row;
    setSessionCookie(res, await createSession(db, user.id, clock.now(), config.sessionTtlDays));
    res.json({ user });
  });

  router.post('/auth/logout', async (req, res) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await deleteSession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    res.json({ user: requireUser(req) });
  });

  return router;
}

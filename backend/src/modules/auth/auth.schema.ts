/**
 * File: src/modules/auth/auth.schema.ts
 *
 * Request validation (zod) for the auth routes: what the request body must look like.
 */
import { z } from 'zod';
import { isValidTimezone } from '../../common/timezones.js';

/** Emails are trimmed and lower-cased so "Sam@Example.com " and "sam@example.com" are the same account. */
const email = z.preprocess((value) => (typeof value === 'string' ? value.trim().toLowerCase() : value), z.email().max(254));

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  role: z.enum(['member', 'professional']),
  timezone: z.string().refine(isValidTimezone, 'Unknown timezone.'),
  bio: z.string().trim().max(1000).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1).max(200),
});

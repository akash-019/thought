/**
 * File: test/helpers/app.ts
 *
 * Test helpers: build the app with a fixed clock, and sign up members/professionals
 * that come back as logged-in HTTP clients.
 */
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.js';
import type { Clock } from '../../src/common/clock.js';
import type { Settings } from '../../src/config.js';

export type Agent = ReturnType<typeof request.agent>;

/**
 * Test defaults: no minimum notice, and long-lived tokens because tests move the fixed clock
 * forward by days. Token expiry itself is tested in auth.test.ts with short lifetimes.
 */
export const TEST_SETTINGS: Settings = { minNoticeMinutes: 0, accessTokenTtlMinutes: 60 * 24 * 60, refreshTokenTtlDays: 90 };

export function makeApp(db: DataSource, clock: Clock, settings: Partial<Settings> = {}) {
  return createApp({ db, clock, settings: { ...TEST_SETTINGS, ...settings } });
}

let counter = 0;

/** Signs up a fresh user and returns a supertest agent that sends their access token on every request. */
export async function signUp(
  app: ReturnType<typeof createApp>,
  opts: { role: 'member' | 'professional'; timezone?: string; name?: string },
): Promise<{
  agent: Agent;
  user: { id: string; name: string; role: string; timezone: string };
  refreshToken: string;
}> {
  counter += 1;
  const res = await request(app).post('/api/auth/signup').send({
    name: opts.name ?? `${opts.role} ${counter}`,
    email: `${opts.role}${counter}-${Date.now()}@example.com`,
    password: 'password123',
    role: opts.role,
    timezone: opts.timezone ?? 'UTC',
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const agent = request.agent(app).set('Authorization', `Bearer ${res.body.accessToken}`);
  return { agent, user: res.body.user, refreshToken: res.body.refreshToken };
}

const WEEKDAYS_9_TO_17 = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }));

/** A professional with Mon-Fri 09:00-17:00 working hours (in their timezone). */
export async function signUpPro(
  app: ReturnType<typeof createApp>,
  opts: { timezone?: string; name?: string; rules?: { weekday: number; start: string; end: string }[] } = {},
) {
  const pro = await signUp(app, { role: 'professional', timezone: opts.timezone ?? 'UTC', name: opts.name });
  const res = await pro.agent.put('/api/me/availability').send({ rules: opts.rules ?? WEEKDAYS_9_TO_17 });
  if (res.status !== 200) throw new Error(`availability failed: ${JSON.stringify(res.body)}`);
  return pro;
}

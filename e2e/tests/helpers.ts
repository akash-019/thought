/**
 * File: e2e/tests/helpers.ts
 *
 * Shared set-up for the browser tests: create users and working hours through the API (fast),
 * log a browser in, and a database connection for the few "time travel" steps (moving a session
 * inside 24 hours, making a reminder due now) that can't be done by waiting.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';

export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://booking:booking@localhost:5433/booking';
export const JWT_SECRET = process.env.E2E_JWT_SECRET ?? 'local-demo-secret-change-me';
export const PASSWORD = 'password123';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'professional';
  timezone: string;
  accessToken: string;
  refreshToken: string;
}

let counter = 0;
/** A name and email nobody else has, so every test starts from fresh accounts. */
export function unique(prefix: string) {
  counter += 1;
  const id = `${Date.now().toString(36)}${counter}`;
  return { name: `${prefix} ${id}`, email: `${prefix.toLowerCase().replace(/\s+/g, '')}-${id}@example.com` };
}

export async function signUpByApi(
  request: APIRequestContext,
  role: 'member' | 'professional',
  timezone: string,
  prefix = role === 'member' ? 'Member' : 'Pro',
): Promise<TestUser> {
  const who = unique(prefix);
  const res = await request.post('/api/auth/signup', { data: { ...who, password: PASSWORD, role, timezone } });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { ...body.user, accessToken: body.accessToken, refreshToken: body.refreshToken };
}

/** A professional who works every day 08:00–20:00 in their timezone, so slots always exist. */
export async function professionalWithHours(request: APIRequestContext, timezone = 'Europe/Berlin', prefix = 'Pro') {
  const pro = await signUpByApi(request, 'professional', timezone, prefix);
  const rules = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }));
  const res = await request.put('/api/me/availability', { data: { rules }, headers: auth(pro) });
  expect(res.ok()).toBeTruthy();
  return pro;
}

export const auth = (u: Pick<TestUser, 'accessToken'>) => ({ Authorization: `Bearer ${u.accessToken}` });

/** Free slots of a professional, as the member sees them. */
export async function freeSlots(request: APIRequestContext, member: TestUser, proId: string) {
  const res = await request.get(`/api/professionals/${proId}/slots`, { headers: auth(member) });
  const body = await res.json();
  return body.days.flatMap((d: { slots: { startAt: string }[] }) => d.slots.map((s) => s.startAt)) as string[];
}

/** Opens the app already logged in as `user` (tokens put where the app keeps them). */
export async function logInAs(page: Page, user: TestUser, path = '/') {
  await page.addInitScript(
    ([access, refresh]) => {
      if (!sessionStorage.getItem('e2e-logged-in')) {
        localStorage.setItem('accessToken', access!);
        localStorage.setItem('refreshToken', refresh!);
        sessionStorage.setItem('e2e-logged-in', '1');
      }
    },
    [user.accessToken, user.refreshToken],
  );
  await page.goto(path);
  await expect(page.locator('.topbar')).toBeVisible();
}

export async function logInWithForm(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('.password input').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
}

export async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export const toast = (page: Page) => page.locator('.toast');

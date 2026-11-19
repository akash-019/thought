/**
 * File: test/integration/auth.test.ts
 *
 * Integration tests: sign up, log in, access token checks, refresh token rotation and reuse
 * detection, logout, and expiry.
 */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeApp, signUp } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';
import { fixedClock } from '../../src/common/clock.js';

const db = await testDb();
const clock = fixedClock('2027-01-04T10:00:00Z');
// Real-world lifetimes here: 15-minute access tokens, 7-day refresh tokens.
const app = makeApp(db, clock, { accessTokenTtlMinutes: 15, refreshTokenTtlDays: 7 });

beforeEach(async () => {
  clock.set('2027-01-04T10:00:00Z');
  await resetData(db);
});
afterAll(() => db.destroy());

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signupRiya() {
  return request(app).post('/api/auth/signup').send({
    name: 'Riya Fictional',
    email: '  Riya@Example.com ',
    password: 'password123',
    role: 'member',
    timezone: 'Asia/Kolkata',
  });
}

describe('sign up and log in', () => {
  it('sign up returns the user plus an access token and a refresh token', async () => {
    const res = await signupRiya();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'riya@example.com', role: 'member', timezone: 'Asia/Kolkata' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken.split('.')).toHaveLength(3); // a JWT
    expect(res.body.accessTokenExpiresAt).toBe('2027-01-04T10:15:00.000Z');
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshTokenExpiresAt).toBe('2027-01-11T10:00:00.000Z');
    expect(res.headers['set-cookie']).toBeUndefined();

    const me = await request(app).get('/api/me').set(bearer(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('riya@example.com');
  });

  it('logs in with the right password and rejects a wrong one with a generic message', async () => {
    await signupRiya();
    const ok = await request(app).post('/api/auth/login').send({ email: 'RIYA@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    const wrong = await request(app).post('/api/auth/login').send({ email: 'riya@example.com', password: 'nope-nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it('rejects duplicate emails, unknown timezones, and short passwords', async () => {
    const base = { name: 'A', email: 'dup@example.com', password: 'password123', role: 'member', timezone: 'UTC' };
    expect((await request(app).post('/api/auth/signup').send(base)).status).toBe(201);
    const dup = await request(app).post('/api/auth/signup').send(base);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    expect((await request(app).post('/api/auth/signup').send({ ...base, email: 'tz@example.com', timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await request(app).post('/api/auth/signup').send({ ...base, email: 'pw@example.com', password: 'short' })).status).toBe(400);
  });
});

describe('access token', () => {
  it('protected endpoints need a valid token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').set(bearer('not.a.jwt'))).status).toBe(401);
    expect((await request(app).get('/api/me').set({ Authorization: 'Basic abc' })).status).toBe(401);
  });

  it('a token signed with another secret, or edited, is rejected', async () => {
    const { body } = await signupRiya();
    const [header, payload, signature] = body.accessToken.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: '999', role: 'professional', iat: 1, exp: 9999999999 })).toString('base64url');
    expect((await request(app).get('/api/me').set(bearer(`${header}.${forgedPayload}.${signature}`))).status).toBe(401);
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    expect((await request(app).get('/api/me').set(bearer(noneAlg))).status).toBe(401);
  });

  it('expires after 15 minutes with a TOKEN_EXPIRED code so the app knows to refresh', async () => {
    const { body } = await signupRiya();
    clock.set('2027-01-04T10:14:59Z');
    expect((await request(app).get('/api/me').set(bearer(body.accessToken))).status).toBe(200);
    clock.set('2027-01-04T10:15:01Z');
    const expired = await request(app).get('/api/me').set(bearer(body.accessToken));
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('refresh token', () => {
  it('swaps for a new pair (rotation) and the old refresh token stops working', async () => {
    const { body } = await signupRiya();
    clock.set('2027-01-04T10:20:00Z');
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(body.refreshToken);
    expect(refreshed.body.user.email).toBe('riya@example.com');
    expect((await request(app).get('/api/me').set(bearer(refreshed.body.accessToken))).status).toBe(200);

    // Using the old one again looks like theft: it fails AND the new one is revoked too.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: body.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    const afterReuse = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshed.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('two refreshes racing with the same token: only one succeeds', async () => {
    const { body } = await signupRiya();
    const results = await Promise.all(
      [1, 2].map(() => request(app).post('/api/auth/refresh').send({ refreshToken: body.refreshToken })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('expires after 7 days', async () => {
    const { body } = await signupRiya();
    clock.set('2027-01-11T10:00:01Z');
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: body.refreshToken })).status).toBe(401);
  });

  it('rejects unknown tokens', async () => {
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: 'made-up' })).status).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the refresh token so it can no longer be used', async () => {
    const { refreshToken } = await signUp(app, { role: 'member' });
    expect((await request(app).post('/api/auth/logout').send({ refreshToken })).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(401);
  });
});

import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/lib/clock.js';
import { makeApp, signUp } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';

const db = testDb();
const clock = fixedClock('2027-01-04T10:00:00Z');
const app = makeApp(db, clock);

beforeEach(() => resetData(db));
afterAll(() => db.destroy());

describe('auth', () => {
  it('signs up, reads /me from the cookie, logs out, and the cookie stops working', async () => {
    const agent = request.agent(app);
    const signup = await agent.post('/api/auth/signup').send({
      name: 'Riya Fictional',
      email: '  Riya@Example.com ',
      password: 'password123',
      role: 'member',
      timezone: 'Asia/Kolkata',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user).toMatchObject({ email: 'riya@example.com', role: 'member', timezone: 'Asia/Kolkata' });
    expect(signup.body.user.password_hash).toBeUndefined();
    expect(signup.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('riya@example.com');

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('a copied cookie stops working after logout (session is revoked server-side)', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Copy Test',
      email: 'copy@example.com',
      password: 'password123',
      role: 'member',
      timezone: 'UTC',
    });
    const cookie = signup.headers['set-cookie']![0]!.split(';')[0]!; // "sid=..."
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(200);
    await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('logs in with the right password and rejects a wrong one with a generic message', async () => {
    await request(app).post('/api/auth/signup').send({
      name: 'Pro One',
      email: 'pro1@example.com',
      password: 'password123',
      role: 'professional',
      timezone: 'Europe/London',
    });
    const ok = await request(app).post('/api/auth/login').send({ email: 'PRO1@example.com', password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('professional');

    const wrong = await request(app).post('/api/auth/login').send({ email: 'pro1@example.com', password: 'nope-nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects duplicate emails, unknown timezones, and short passwords', async () => {
    const base = { name: 'A', email: 'dup@example.com', password: 'password123', role: 'member', timezone: 'UTC' };
    expect((await request(app).post('/api/auth/signup').send(base)).status).toBe(201);
    const dup = await request(app).post('/api/auth/signup').send(base);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const tz = await request(app).post('/api/auth/signup').send({ ...base, email: 'tz@example.com', timezone: 'Mars/Olympus' });
    expect(tz.status).toBe(400);
    const pw = await request(app).post('/api/auth/signup').send({ ...base, email: 'pw@example.com', password: 'short' });
    expect(pw.status).toBe(400);
  });

  it('expired sessions are rejected', async () => {
    const { agent } = await signUp(app, { role: 'member' });
    clock.set('2027-02-04T10:00:00Z'); // 31 days later, past the 7-day TTL
    expect((await agent.get('/api/me')).status).toBe(401);
    clock.set('2027-01-04T10:00:00Z');
  });

  it('protected endpoints need a session', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me/availability')).status).toBe(401);
  });
});

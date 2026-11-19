/**
 * File: test/integration/access.test.ts
 *
 * Integration tests: access control and privacy (only your own sessions, no leaked data).
 */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/shared/clock.js';
import { makeApp, signUp, signUpPro } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';

const db = await testDb();
const app = makeApp(db, fixedClock('2027-01-04T10:00:00Z'));

beforeEach(() => resetData(db));
afterAll(() => db.destroy());

const WED_10 = '2027-01-06T10:00:00.000Z';

async function scenario() {
  const pro = await signUpPro(app);
  const otherPro = await signUpPro(app);
  const alice = await signUp(app, { role: 'member', name: 'Alice Fictional' });
  const bob = await signUp(app, { role: 'member', name: 'Bob Fictional' });
  const res = await alice.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 });
  return { pro, otherPro, alice, bob, sessionId: res.body.session.id as string };
}

describe('access control', () => {
  it('a member cannot see or change another member’s session (404, not 403)', async () => {
    const { bob, sessionId } = await scenario();
    expect((await bob.agent.get(`/api/sessions/${sessionId}`)).status).toBe(404);
    expect((await bob.agent.post(`/api/sessions/${sessionId}/cancel`)).status).toBe(404);
    expect((await bob.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: '2027-01-06T14:00:00Z' })).status).toBe(404);
    expect((await bob.agent.get('/api/sessions')).body.sessions).toEqual([]);
  });

  it('a professional only sees their own schedule', async () => {
    const { pro, otherPro, sessionId } = await scenario();
    expect((await pro.agent.get('/api/sessions')).body.sessions).toHaveLength(1);
    expect((await otherPro.agent.get('/api/sessions')).body.sessions).toEqual([]);
    expect((await otherPro.agent.get(`/api/sessions/${sessionId}`)).status).toBe(404);
    expect((await otherPro.agent.post(`/api/sessions/${sessionId}/cancel`)).status).toBe(404);
  });

  it('ignores any user id the client tries to send', async () => {
    const { pro, alice, bob } = await scenario();
    // Bob tries to book "as Alice" by sending her id: the session is still Bob's.
    const res = await bob.agent
      .post('/api/sessions')
      .send({ professionalId: pro.user.id, startAt: '2027-01-06T14:00:00Z', memberId: alice.user.id, userId: alice.user.id });
    expect(res.status).toBe(201);
    expect((await bob.agent.get('/api/sessions')).body.sessions).toHaveLength(1);
    expect((await alice.agent.get('/api/sessions')).body.sessions).toHaveLength(1);
  });

  it('the professional list and profiles expose no emails', async () => {
    const { bob } = await scenario();
    const list = await bob.agent.get('/api/professionals');
    expect(list.body.professionals).toHaveLength(2);
    expect(Object.keys(list.body.professionals[0]).sort()).toEqual(['bio', 'id', 'name', 'timezone']);
  });

  it('notifications are private to their owner', async () => {
    const { pro, otherPro } = await scenario();
    const mine = await pro.agent.get('/api/notifications');
    expect(mine.body.notifications).toHaveLength(1);
    expect((await otherPro.agent.get('/api/notifications')).body.notifications).toEqual([]);
    expect((await otherPro.agent.post(`/api/notifications/${mine.body.notifications[0].id}/read`)).status).toBe(404);
  });

  it('everything under /api except signup/login/timezones needs a session', async () => {
    const anon = request(app);
    for (const path of ['/api/me', '/api/professionals', '/api/sessions', '/api/notifications', '/api/professionals/1/slots']) {
      expect((await anon.get(path)).status).toBe(401);
    }
    expect((await anon.post('/api/sessions').send({ professionalId: '1', startAt: WED_10 })).status).toBe(401);
    expect((await anon.get('/api/timezones')).status).toBe(200);
  });
});

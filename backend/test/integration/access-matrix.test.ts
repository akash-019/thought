/**
 * File: test/integration/access-matrix.test.ts
 *
 * Integration tests: every endpoint called by every kind of caller, with the expected status.
 * Callers: nobody (no token), the member who owns the session, another member, the professional
 * on the session, and another professional. This is the full access-control table in one place.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/common/clock.js';
import { makeApp, signUp, signUpPro, type Agent } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';

const db = await testDb();
const clock = fixedClock('2027-01-04T10:00:00Z');
const app = makeApp(db, clock);
afterAll(() => db.destroy());

type Caller = 'nobody' | 'owner' | 'otherMember' | 'pro' | 'otherPro';
const callers: Record<Caller, Agent> = {} as Record<Caller, Agent>;
let sessionId = '';
let proId = '';
let ownerNotificationId = '';

beforeAll(async () => {
  await resetData(db);
  const pro = await signUpPro(app);
  const otherPro = await signUpPro(app);
  const owner = await signUp(app, { role: 'member' });
  const otherMember = await signUp(app, { role: 'member' });
  proId = pro.user.id;
  const booked = await owner.agent.post('/api/sessions').send({ professionalId: proId, startAt: '2027-01-08T10:00:00Z' });
  sessionId = booked.body.session.id;
  // The professional cancels a second session so the owner has a notification to try to read.
  const second = await owner.agent.post('/api/sessions').send({ professionalId: proId, startAt: '2027-01-08T12:00:00Z' });
  await pro.agent.post(`/api/sessions/${second.body.session.id}/cancel`);
  ownerNotificationId = (await owner.agent.get('/api/notifications')).body.notifications[0].id;

  callers.nobody = request.agent(app);
  callers.owner = owner.agent;
  callers.otherMember = otherMember.agent;
  callers.pro = pro.agent;
  callers.otherPro = otherPro.agent;
});

/**
 * One row per endpoint: the expected HTTP status for each caller.
 * 401 = not logged in, 403 = wrong role, 404 = not yours (we don't reveal it exists).
 * Rows that change data are ordered so earlier rows don't affect later ones.
 */
const rows: { name: string; call: (a: Agent) => request.Test; expect: Record<Caller, number> }[] = [
  {
    name: 'GET /me',
    call: (a) => a.get('/api/me'),
    expect: { nobody: 401, owner: 200, otherMember: 200, pro: 200, otherPro: 200 },
  },
  {
    name: 'GET /me/availability',
    call: (a) => a.get('/api/me/availability'),
    expect: { nobody: 401, owner: 403, otherMember: 403, pro: 200, otherPro: 200 },
  },
  {
    name: 'PUT /me/availability (own hours only)',
    call: (a) => a.put('/api/me/availability').send({ rules: [{ weekday: 1, start: '09:00', end: '17:00' }, { weekday: 5, start: '09:00', end: '17:00' }] }),
    expect: { nobody: 401, owner: 403, otherMember: 403, pro: 200, otherPro: 200 },
  },
  {
    name: 'GET /me/blocked-dates',
    call: (a) => a.get('/api/me/blocked-dates'),
    expect: { nobody: 401, owner: 403, otherMember: 403, pro: 200, otherPro: 200 },
  },
  {
    name: 'GET /professionals',
    call: (a) => a.get('/api/professionals'),
    expect: { nobody: 401, owner: 200, otherMember: 200, pro: 200, otherPro: 200 },
  },
  {
    name: 'GET /professionals/:id',
    call: (a) => a.get(`/api/professionals/${proId}`),
    expect: { nobody: 401, owner: 200, otherMember: 200, pro: 200, otherPro: 200 },
  },
  {
    name: 'GET /professionals/:id/slots (members only)',
    call: (a) => a.get(`/api/professionals/${proId}/slots`),
    expect: { nobody: 401, owner: 200, otherMember: 200, pro: 403, otherPro: 403 },
  },
  {
    name: 'GET /sessions (always your own list)',
    call: (a) => a.get('/api/sessions'),
    expect: { nobody: 401, owner: 200, otherMember: 200, pro: 200, otherPro: 200 },
  },
  {
    name: 'GET /sessions/:id',
    call: (a) => a.get(`/api/sessions/${sessionId}`),
    expect: { nobody: 401, owner: 200, otherMember: 404, pro: 200, otherPro: 404 },
  },
  {
    name: 'POST /notifications/:id/read (owner’s notification)',
    call: (a) => a.post(`/api/notifications/${ownerNotificationId}/read`),
    expect: { nobody: 401, owner: 204, otherMember: 404, pro: 404, otherPro: 404 },
  },
  {
    name: 'POST /sessions/:id/reschedule (members only, owner only)',
    call: (a) => a.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: '2027-01-11T11:00:00Z' }),
    expect: { nobody: 401, otherMember: 404, pro: 403, otherPro: 403, owner: 200 },
  },
];

describe('access-control matrix', () => {
  for (const row of rows) {
    it(row.name, async () => {
      const got: Partial<Record<Caller, number>> = {};
      for (const caller of Object.keys(row.expect) as Caller[]) {
        got[caller] = (await row.call(callers[caller])).status;
      }
      expect(got).toEqual(row.expect);
    });
  }

  it('POST /sessions/:id/cancel: only the two people on the session', async () => {
    const { sessions } = (await callers.owner.get('/api/sessions')).body as { sessions: { id: string }[] };
    const id = sessions[0]!.id; // the rescheduled session
    expect((await callers.nobody.post(`/api/sessions/${id}/cancel`)).status).toBe(401);
    expect((await callers.otherMember.post(`/api/sessions/${id}/cancel`)).status).toBe(404);
    expect((await callers.otherPro.post(`/api/sessions/${id}/cancel`)).status).toBe(404);
    expect((await callers.pro.post(`/api/sessions/${id}/cancel`)).status).toBe(200);
  });

  it('POST /sessions: members only, and only with a real professional', async () => {
    const body = { professionalId: proId, startAt: '2027-01-11T14:00:00Z' };
    expect((await callers.nobody.post('/api/sessions').send(body)).status).toBe(401);
    expect((await callers.pro.post('/api/sessions').send(body)).status).toBe(403);
    expect((await callers.otherPro.post('/api/sessions').send(body)).status).toBe(403);
    const ownerId = (await callers.owner.get('/api/me')).body.user.id;
    // A member's id passed as the professional is refused.
    expect((await callers.otherMember.post('/api/sessions').send({ ...body, professionalId: ownerId })).status).toBe(404);
  });

  it('lists never include other people’s sessions or notifications', async () => {
    const otherMemberSessions = (await callers.otherMember.get('/api/sessions?scope=past')).body.sessions;
    const otherProSessions = (await callers.otherPro.get('/api/sessions?scope=past')).body.sessions;
    const otherMemberNotes = (await callers.otherMember.get('/api/notifications')).body.notifications;
    const otherProNotes = (await callers.otherPro.get('/api/notifications')).body.notifications;
    expect(otherMemberSessions).toEqual([]);
    expect(otherProSessions).toEqual([]);
    expect(otherMemberNotes).toEqual([]);
    expect(otherProNotes).toEqual([]);
  });

  it('ids that are not numbers are rejected cleanly (no database error)', async () => {
    for (const bad of ["1' OR '1'='1", '1;DROP TABLE users', '../../etc/passwd']) {
      const res = await callers.owner.get(`/api/sessions/${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

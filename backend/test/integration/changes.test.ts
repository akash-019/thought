/**
 * File: test/integration/changes.test.ts
 *
 * Integration tests: cancel and reschedule, the 24-hour rule, and atomic rescheduling.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/shared/clock.js';
import { makeApp, signUp, signUpPro } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';

const db = await testDb();
const clock = fixedClock('2027-01-04T10:00:00Z');
const app = makeApp(db, clock);

beforeEach(async () => {
  clock.set('2027-01-04T10:00:00Z');
  await resetData(db);
});
afterAll(() => db.destroy());

const WED_10 = '2027-01-06T10:00:00.000Z';
const WED_14 = '2027-01-06T14:00:00.000Z';

async function bookedSession() {
  const pro = await signUpPro(app);
  const member = await signUp(app, { role: 'member' });
  const res = await member.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 });
  expect(res.status).toBe(201);
  return { pro, member, sessionId: res.body.session.id as string };
}

const reminderStatuses = async (sessionId: string) =>
  (await db.query(`SELECT status FROM reminders WHERE session_id = $1`, [sessionId])).map((r: { status: string }) => r.status);

describe('cancel', () => {
  it('member cancels more than 24h ahead: slot frees up, reminders cancelled, professional notified', async () => {
    const { pro, member, sessionId } = await bookedSession();
    const res = await member.agent.post(`/api/sessions/${sessionId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('cancelled');
    expect(await reminderStatuses(sessionId)).toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);

    const slots = await member.agent.get(`/api/professionals/${pro.user.id}/slots`);
    expect(slots.body.days.flatMap((d: { slots: { startAt: string }[] }) => d.slots.map((s) => s.startAt))).toContain(WED_10);

    const notes = await pro.agent.get('/api/notifications');
    expect(notes.body.notifications.map((n: { type: string }) => n.type)).toEqual(['session_cancelled', 'session_booked']);
  });

  it('member is blocked inside 24h with a clear message; the UI flags turn off too', async () => {
    const { member, sessionId } = await bookedSession();
    clock.set('2027-01-05T10:00:01Z'); // 23h59m59s before
    const list = await member.agent.get('/api/sessions');
    expect(list.body.sessions[0]).toMatchObject({ canCancel: false, canReschedule: false });

    const cancel = await member.agent.post(`/api/sessions/${sessionId}/cancel`);
    expect(cancel.status).toBe(403);
    expect(cancel.body.error.code).toBe('WITHIN_24H');
    expect(cancel.body.error.message).toMatch(/24 hours/);
    const resched = await member.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: WED_14 });
    expect(resched.status).toBe(403);
  });

  it('exactly 24h before is still allowed', async () => {
    const { member, sessionId } = await bookedSession();
    clock.set('2027-01-05T10:00:00Z');
    expect((await member.agent.post(`/api/sessions/${sessionId}/cancel`)).status).toBe(200);
  });

  it('professional can cancel inside 24h; member is notified', async () => {
    const { pro, member, sessionId } = await bookedSession();
    clock.set('2027-01-06T09:30:00Z'); // 30 minutes before
    const res = await pro.agent.post(`/api/sessions/${sessionId}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.session.cancelledBy).toBe('professional');
    const notes = await member.agent.get('/api/notifications');
    expect(notes.body.notifications[0]).toMatchObject({ type: 'session_cancelled', session: { startAt: WED_10 } });
  });

  it('cannot cancel twice or after the session finished', async () => {
    const { pro, member, sessionId } = await bookedSession();
    await member.agent.post(`/api/sessions/${sessionId}/cancel`);
    expect((await member.agent.post(`/api/sessions/${sessionId}/cancel`)).body.error.code).toBe('NOT_BOOKED');

    const other = await signUp(app, { role: 'member' });
    const s2 = await other.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_14 });
    clock.set('2027-01-06T15:00:00Z');
    expect((await pro.agent.post(`/api/sessions/${s2.body.session.id}/cancel`)).body.error.code).toBe('SESSION_OVER');
  });
});

describe('reschedule', () => {
  it('moves the session: old one marked rescheduled, new one booked, reminders moved', async () => {
    const { pro, member, sessionId } = await bookedSession();
    const res = await member.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: WED_14 });
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ startAt: WED_14, status: 'booked' });

    const upcoming = await member.agent.get('/api/sessions?scope=upcoming');
    expect(upcoming.body.sessions.map((s: { startAt: string }) => s.startAt)).toEqual([WED_14]);
    const past = await member.agent.get('/api/sessions?scope=past');
    expect(past.body.sessions[0]).toMatchObject({ startAt: WED_10, status: 'rescheduled' });

    expect(await reminderStatuses(sessionId)).toEqual(['cancelled', 'cancelled', 'cancelled', 'cancelled']);
    const fresh = await db.query(`SELECT kind, fire_at FROM reminders WHERE session_id = $1 ORDER BY kind, user_id`, [
      res.body.session.id,
    ]);
    expect(fresh.map((r: { fire_at: Date }) => r.fire_at.toISOString())).toEqual([
      '2027-01-06T13:00:00.000Z',
      '2027-01-06T13:00:00.000Z',
      '2027-01-05T14:00:00.000Z',
      '2027-01-05T14:00:00.000Z',
    ]);

    const notes = await pro.agent.get('/api/notifications');
    expect(notes.body.notifications[0]).toMatchObject({
      type: 'session_rescheduled',
      session: { startAt: WED_14 },
    });
  });

  it('if the new slot is taken, nothing changes: the member keeps the original session', async () => {
    const { pro, member, sessionId } = await bookedSession();
    const other = await signUp(app, { role: 'member' });
    await other.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_14 });

    const res = await member.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: WED_14 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');

    const upcoming = await member.agent.get('/api/sessions?scope=upcoming');
    expect(upcoming.body.sessions).toHaveLength(1);
    expect(upcoming.body.sessions[0]).toMatchObject({ id: sessionId, startAt: WED_10, status: 'booked' });
    expect(await reminderStatuses(sessionId)).toEqual(['pending', 'pending', 'pending', 'pending']);
  });

  it('invalid new slot also leaves the original untouched', async () => {
    const { member, sessionId } = await bookedSession();
    const res = await member.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: '2027-01-06T14:20:00Z' });
    expect(res.status).toBe(400);
    const upcoming = await member.agent.get('/api/sessions?scope=upcoming');
    expect(upcoming.body.sessions[0]).toMatchObject({ id: sessionId, status: 'booked' });
  });

  it('two concurrent reschedules of one session: exactly one succeeds, member ends with one session', async () => {
    const { member, sessionId } = await bookedSession();
    const [a, b] = await Promise.all([
      member.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: WED_14 }),
      member.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: '2027-01-06T15:00:00Z' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const upcoming = await member.agent.get('/api/sessions?scope=upcoming');
    expect(upcoming.body.sessions).toHaveLength(1);
  });

  it('professionals cannot reschedule (only cancel)', async () => {
    const { pro, sessionId } = await bookedSession();
    expect((await pro.agent.post(`/api/sessions/${sessionId}/reschedule`).send({ startAt: WED_14 })).status).toBe(403);
  });
});

/**
 * File: test/integration/reminders.test.ts
 *
 * Integration tests: reminder scheduling and exactly-once delivery (repeat runs, parallel workers, downtime).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeApp, signUp, signUpPro } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';
import { fixedClock } from '../../src/common/clock.js';
import { processDueReminders } from '../../src/modules/notifications/reminders.js';

const db = await testDb();
const clock = fixedClock('2027-01-04T10:00:00Z');
const app = makeApp(db, clock);

beforeEach(async () => {
  clock.set('2027-01-04T10:00:00Z');
  await resetData(db);
});
afterAll(() => db.destroy());

const WED_10 = '2027-01-06T10:00:00.000Z';

async function book(startAt = WED_10) {
  const pro = await signUpPro(app);
  const member = await signUp(app, { role: 'member' });
  const res = await member.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt });
  expect(res.status).toBe(201);
  return { pro, member, sessionId: res.body.session.id as string };
}

const reminders = (sessionId: string) =>
  db.query(`SELECT user_id, kind, fire_at, status FROM reminders WHERE session_id = $1 ORDER BY fire_at, user_id`, [
    sessionId,
  ]);
const reminderNotifications = async (agent: Awaited<ReturnType<typeof signUp>>['agent']) =>
  (await agent.get('/api/notifications')).body.notifications
    .filter((n: { type: string }) => n.type.startsWith('reminder_'))
    .map((n: { type: string }) => n.type);

describe('reminder scheduling', () => {
  it('creates 24h and 1h reminders for both member and professional', async () => {
    const { pro, member, sessionId } = await book();
    const rows = await reminders(sessionId);
    expect(rows.map((r: { kind: string; fire_at: Date; user_id: string }) => [r.kind, r.fire_at.toISOString(), r.user_id])).toEqual([
      // Ordered by user id; the professional signed up first.
      ['24h', '2027-01-05T10:00:00.000Z', pro.user.id],
      ['24h', '2027-01-05T10:00:00.000Z', member.user.id],
      ['1h', '2027-01-06T09:00:00.000Z', pro.user.id],
      ['1h', '2027-01-06T09:00:00.000Z', member.user.id],
    ]);
  });

  it('does not create a reminder whose time has already passed', async () => {
    const { sessionId } = await book('2027-01-04T15:00:00.000Z'); // 5h ahead: no 24h reminder
    const rows = await reminders(sessionId);
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual(['1h', '1h']);
  });
});

describe('reminder delivery', () => {
  it('delivers each reminder at its time as an in-app notification, exactly once', async () => {
    const { pro, member, sessionId } = await book();

    clock.set('2027-01-05T09:59:59Z');
    expect(await processDueReminders(db, clock.now())).toEqual({ delivered: 0, expired: 0, cancelled: 0 });

    clock.set('2027-01-05T10:00:05Z');
    expect((await processDueReminders(db, clock.now())).delivered).toBe(2);
    expect(await reminderNotifications(member.agent)).toEqual(['reminder_24h']);
    expect(await reminderNotifications(pro.agent)).toEqual(['reminder_24h']);

    // Running again (another tick, or a second worker) delivers nothing new.
    expect((await processDueReminders(db, clock.now())).delivered).toBe(0);

    clock.set('2027-01-06T09:00:10Z');
    expect((await processDueReminders(db, clock.now())).delivered).toBe(2);
    expect(await reminderNotifications(member.agent)).toEqual(['reminder_1h', 'reminder_24h']);
    expect((await reminders(sessionId)).every((r: { status: string }) => r.status === 'delivered')).toBe(true);
  });

  it('parallel workers never deliver the same reminder twice', async () => {
    // Five sessions on Thursday 2027-01-07, 10:00-14:00 UTC.
    for (let h = 10; h < 15; h++) await book(`2027-01-07T${h}:00:00.000Z`);
    const now = new Date('2027-01-06T23:00:00Z'); // 24h reminders due (10 of them), sessions still ahead
    const results = await Promise.all(Array.from({ length: 4 }, () => processDueReminders(db, now)));
    const delivered = results.reduce((sum, r) => sum + r.delivered, 0);
    const notifications = await db.query(`SELECT reminder_id FROM notifications WHERE reminder_id IS NOT NULL`);
    const unique = new Set(notifications.map((n: { reminder_id: string }) => n.reminder_id));
    expect(delivered).toBe(notifications.length);
    expect(unique.size).toBe(notifications.length);
    const due = await db.query(`SELECT count(*)::int AS n FROM reminders WHERE fire_at <= $1`, [now]);
    expect(due[0].n).toBe(10);
    expect(notifications.length).toBe(10);
  });

  it('after downtime, catches up on overdue reminders; ones for sessions already started are expired', async () => {
    const { member } = await book();
    // Worker was down from before the 24h mark until after the session started.
    clock.set('2027-01-06T10:05:00Z');
    expect(await processDueReminders(db, clock.now())).toEqual({ delivered: 0, expired: 4, cancelled: 0 });
    expect(await reminderNotifications(member.agent)).toEqual([]);
  });

  it('after downtime, a late reminder is still delivered if the session has not started', async () => {
    const { member } = await book();
    clock.set('2027-01-06T09:30:00Z'); // both reminders overdue, session in 30 minutes
    expect((await processDueReminders(db, clock.now())).delivered).toBe(4);
    expect((await reminderNotifications(member.agent)).sort()).toEqual(['reminder_1h', 'reminder_24h']);
  });

  it('cancelled sessions get no reminders', async () => {
    const { member, sessionId } = await book();
    await member.agent.post(`/api/sessions/${sessionId}/cancel`);
    clock.set('2027-01-06T09:30:00Z');
    expect((await processDueReminders(db, clock.now())).delivered).toBe(0);
    expect(await reminderNotifications(member.agent)).toEqual([]);
  });

  it('the unique reminder_id makes a second notification for one reminder impossible', async () => {
    const { member, sessionId } = await book();
    const [r] = await db.query(`SELECT id FROM reminders WHERE session_id = $1 LIMIT 1`, [sessionId]);
    const insert = () =>
      db.query(`INSERT INTO notifications (user_id, type, session_id, reminder_id) VALUES ($1, 'reminder_24h', $2, $3)`, [
        member.user.id,
        sessionId,
        r.id,
      ]);
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: '23505' });
  });

  it('notifications can be marked read', async () => {
    const { pro } = await book();
    const list = await pro.agent.get('/api/notifications');
    expect(list.body.unreadCount).toBe(1);
    await pro.agent.post(`/api/notifications/${list.body.notifications[0].id}/read`);
    expect((await pro.agent.get('/api/notifications')).body.unreadCount).toBe(0);
  });
});

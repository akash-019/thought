/**
 * File: test/integration/booking.test.ts
 *
 * Integration tests: the calendar, booking, validation, and no double-booking under concurrent requests.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeApp, signUp, signUpPro } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';
import { fixedClock } from '../../src/common/clock.js';

const db = await testDb();
// "Now" is Monday 2027-01-04 10:00 UTC.
const clock = fixedClock('2027-01-04T10:00:00Z');
const app = makeApp(db, clock);

beforeEach(async () => {
  clock.set('2027-01-04T10:00:00Z');
  await resetData(db);
});
afterAll(() => db.destroy());

const WED_10 = '2027-01-06T10:00:00.000Z';

describe('calendar', () => {
  it('shows 4 weeks of free slots grouped by the member’s local date', async () => {
    const pro = await signUpPro(app, { timezone: 'Asia/Kolkata' });
    const member = await signUp(app, { role: 'member', timezone: 'America/Los_Angeles' });
    const res = await member.agent.get(`/api/professionals/${pro.user.id}/slots`);
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('America/Los_Angeles');
    expect(res.body.professionalTimezone).toBe('Asia/Kolkata');
    // 09:00 IST Tuesday = 19:30 PST Monday.
    const mon = res.body.days.find((d: { date: string }) => d.date === '2027-01-04');
    expect(mon.slots).toContainEqual({ startAt: '2027-01-05T03:30:00.000Z', localTime: '19:30' });
    // Nothing beyond 28 days.
    const last = res.body.days.at(-1).slots.at(-1).startAt;
    expect(new Date(last).getTime()).toBeLessThan(Date.parse('2027-02-01T10:00:00Z'));
    // 1 slot left today (16:00 IST) + 19 full weekdays x 8 + 7 on the last morning before the window ends.
    expect(res.body.days.flatMap((d: { slots: unknown[] }) => d.slots)).toHaveLength(160);
  });

  it('booked slots disappear for everyone, and the response never says who booked', async () => {
    const pro = await signUpPro(app);
    const a = await signUp(app, { role: 'member' });
    const b = await signUp(app, { role: 'member' });
    expect((await a.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 })).status).toBe(201);

    const res = await b.agent.get(`/api/professionals/${pro.user.id}/slots`);
    const all = res.body.days.flatMap((d: { slots: { startAt: string }[] }) => d.slots.map((s) => s.startAt));
    expect(all).not.toContain(WED_10);
    expect(JSON.stringify(res.body)).not.toContain(a.user.name);
    expect(Object.keys(res.body.days[0].slots[0]).sort()).toEqual(['localTime', 'startAt']);
  });
});

describe('booking', () => {
  it('books a slot, returns it in My sessions for both sides with names', async () => {
    const pro = await signUpPro(app, { name: 'Dr Fictional' });
    const member = await signUp(app, { role: 'member', name: 'Sam Example' });
    const res = await member.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 });
    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({
      startAt: WED_10,
      endAt: '2027-01-06T10:50:00.000Z',
      status: 'booked',
      counterpart: { name: 'Dr Fictional' },
      canCancel: true,
      canReschedule: true,
    });

    const proView = await pro.agent.get('/api/sessions?scope=upcoming');
    expect(proView.body.sessions).toHaveLength(1);
    // The professional sees the member's name and timezone only (no id, no email).
    expect(proView.body.sessions[0].counterpart).toEqual({ name: 'Sam Example', timezone: 'UTC' });
  });

  it('rejects past slots, off-grid times, times outside hours and blocked dates', async () => {
    const pro = await signUpPro(app);
    await pro.agent.put('/api/me/blocked-dates').send({ dates: ['2027-01-07'] });
    const { agent } = await signUp(app, { role: 'member' });
    const book = (startAt: string) => agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt });

    expect((await book('2027-01-04T09:00:00Z')).body.error.code).toBe('SLOT_IN_PAST');
    expect((await book('2027-01-06T10:30:00Z')).body.error.code).toBe('INVALID_SLOT');
    expect((await book('2027-01-06T18:00:00Z')).body.error.code).toBe('INVALID_SLOT');
    expect((await book('2027-01-09T10:00:00Z')).body.error.code).toBe('INVALID_SLOT'); // Saturday
    expect((await book('2027-01-07T10:00:00Z')).body.error.code).toBe('INVALID_SLOT'); // blocked
  });

  it('applies the minimum notice when configured', async () => {
    const strictApp = makeApp(db, clock, { minNoticeMinutes: 120 });
    const pro = await signUpPro(strictApp);
    const { agent } = await signUp(strictApp, { role: 'member' });
    const soon = await agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: '2027-01-04T11:00:00Z' });
    expect(soon.status).toBe(400);
    expect(soon.body.error.code).toBe('TOO_SOON');
    const ok = await agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: '2027-01-04T12:00:00Z' });
    expect(ok.status).toBe(201);
  });

  it('professionals cannot book', async () => {
    const pro = await signUpPro(app);
    const other = await signUpPro(app);
    const res = await other.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 });
    expect(res.status).toBe(403);
  });
});

describe('no double-booking', () => {
  it('10 members racing for the same slot: exactly one wins', async () => {
    const pro = await signUpPro(app);
    const members = await Promise.all(Array.from({ length: 10 }, () => signUp(app, { role: 'member' })));
    const results = await Promise.all(
      members.map((m) => m.agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('SLOT_TAKEN');

    const rows = await db.query(`SELECT count(*)::int AS n FROM sessions WHERE status = 'booked'`);
    expect(rows[0].n).toBe(1);
  });

  it('the same member double-clicking gets one session', async () => {
    const pro = await signUpPro(app);
    const { agent } = await signUp(app, { role: 'member' });
    const results = await Promise.all(
      [1, 2, 3].map(() => agent.post('/api/sessions').send({ professionalId: pro.user.id, startAt: WED_10 })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('a member cannot hold overlapping sessions with two different professionals', async () => {
    const utcPro = await signUpPro(app);
    // 09:30 start in this pro's hours: their 10:30 slot overlaps the other pro's 10:00 slot.
    const halfPastPro = await signUpPro(app, { rules: [{ weekday: 3, start: '09:30', end: '17:30' }] });
    const { agent } = await signUp(app, { role: 'member' });
    expect((await agent.post('/api/sessions').send({ professionalId: utcPro.user.id, startAt: WED_10 })).status).toBe(201);
    const clash = await agent
      .post('/api/sessions')
      .send({ professionalId: halfPastPro.user.id, startAt: '2027-01-06T10:30:00Z' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('MEMBER_OVERLAP');
  });

  it('the database itself rejects an overlapping insert (defence in depth)', async () => {
    const pro = await signUpPro(app);
    const a = await signUp(app, { role: 'member' });
    const b = await signUp(app, { role: 'member' });
    const insert = (memberId: string, start: string, end: string) =>
      db.query(`INSERT INTO sessions (member_id, professional_id, start_at, end_at) VALUES ($1, $2, $3, $4)`, [
        memberId,
        pro.user.id,
        start,
        end,
      ]);
    await insert(a.user.id, '2027-01-06T10:00:00Z', '2027-01-06T10:50:00Z');
    await expect(insert(b.user.id, '2027-01-06T10:20:00Z', '2027-01-06T11:10:00Z')).rejects.toMatchObject({
      code: '23P01',
    });
    // Back-to-back is fine ('[)' ranges).
    await insert(b.user.id, '2027-01-06T10:50:00Z', '2027-01-06T11:40:00Z');
  });
});

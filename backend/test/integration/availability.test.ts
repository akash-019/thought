/**
 * File: test/integration/availability.test.ts
 *
 * Integration tests: professionals saving and reading weekly hours.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/shared/clock.js';
import { makeApp, signUp } from '../helpers/app.js';
import { resetData, testDb } from '../helpers/db.js';

const db = await testDb();
const app = makeApp(db, fixedClock('2027-01-04T10:00:00Z'));

beforeEach(() => resetData(db));
afterAll(() => db.destroy());

describe('weekly availability', () => {
  it('a professional sets and reads back weekly hours in their own timezone', async () => {
    const { agent } = await signUp(app, { role: 'professional', timezone: 'Asia/Kolkata' });
    const rules = [
      { weekday: 1, start: '09:00', end: '13:00' },
      { weekday: 1, start: '14:00', end: '17:00' },
      { weekday: 5, start: '10:00', end: '24:00' },
    ];
    const put = await agent.put('/api/me/availability').send({ rules });
    expect(put.status).toBe(200);

    const get = await agent.get('/api/me/availability');
    expect(get.body).toEqual({ timezone: 'Asia/Kolkata', rules });
  });

  it('replaces the whole schedule on each save', async () => {
    const { agent } = await signUp(app, { role: 'professional' });
    await agent.put('/api/me/availability').send({ rules: [{ weekday: 1, start: '09:00', end: '17:00' }] });
    await agent.put('/api/me/availability').send({ rules: [{ weekday: 2, start: '10:00', end: '11:00' }] });
    expect((await agent.get('/api/me/availability')).body.rules).toEqual([{ weekday: 2, start: '10:00', end: '11:00' }]);
  });

  it('rejects invalid schedules with a readable message and keeps the old one', async () => {
    const { agent } = await signUp(app, { role: 'professional' });
    await agent.put('/api/me/availability').send({ rules: [{ weekday: 1, start: '09:00', end: '17:00' }] });
    const bad = await agent.put('/api/me/availability').send({
      rules: [
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '11:00', end: '13:00' },
      ],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_AVAILABILITY');
    expect(bad.body.error.message).toMatch(/overlaps/);
    expect((await agent.get('/api/me/availability')).body.rules).toEqual([{ weekday: 1, start: '09:00', end: '17:00' }]);
  });

  it('members cannot set availability', async () => {
    const { agent } = await signUp(app, { role: 'member' });
    const res = await agent.put('/api/me/availability').send({ rules: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_ROLE');
  });
});

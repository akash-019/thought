/**
 * File: e2e/tests/reminders.spec.ts
 *
 * Reminders are delivered by the worker as in-app notifications. A reminder is made due now
 * (instead of waiting 23 hours) and the test waits for the running worker to deliver it.
 */
import { expect, test } from '@playwright/test';
import { auth, freeSlots, logInAs, professionalWithHours, signUpByApi, withDb } from './helpers';

test('a due reminder shows up in the notification list, exactly once', async ({ page, request }) => {
  test.setTimeout(90_000);
  const pro = await professionalWithHours(request, 'America/New_York', 'Reminder Pro');
  const member = await signUpByApi(request, 'member', 'Asia/Singapore', 'Reminder Member');
  const slots = await freeSlots(request, member, pro.id);
  const startAt = slots.find((s) => new Date(s).getTime() > Date.now() + 26 * 3_600_000)!;
  const booked = await request.post('/api/sessions', { data: { professionalId: pro.id, startAt }, headers: auth(member) });
  const sessionId = (await booked.json()).session.id;

  // Both people got 24h and 1h reminders when it was booked.
  const kinds = await withDb(async (db) => (await db.query(`SELECT kind FROM reminders WHERE session_id = $1 ORDER BY kind`, [sessionId])).rows.map((r) => r.kind));
  expect(kinds).toEqual(['1h', '1h', '24h', '24h']);

  // Make the member's 24h reminder due now and wait for the worker (it polls every few seconds).
  await withDb((db) => db.query(`UPDATE reminders SET fire_at = now() WHERE session_id = $1 AND user_id = $2 AND kind = '24h'`, [sessionId, member.id]));
  await expect
    .poll(() => withDb(async (db) => (await db.query(`SELECT status FROM reminders WHERE session_id = $1 AND user_id = $2 AND kind = '24h'`, [sessionId, member.id])).rows[0].status), { timeout: 45_000 })
    .toBe('delivered');

  await logInAs(page, member, '/sessions');
  await page.getByRole('button', { name: /Notifications, 1 unread/ }).click();
  await expect(page.locator('.bell-item')).toHaveCount(1);
  await expect(page.locator('.bell-item-title')).toHaveText('Your session is tomorrow');
  await expect(page.locator('.bell-item-detail')).toContainText(pro.name);
});

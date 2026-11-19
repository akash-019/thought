/**
 * File: e2e/tests/rules.spec.ts
 *
 * The 24-hour rule (members can't cancel or reschedule late; professionals can, with a warning),
 * and what professionals see.
 */
import { expect, test } from '@playwright/test';
import { auth, freeSlots, logInAs, professionalWithHours, signUpByApi, withDb } from './helpers';

test('inside 24 hours: the member sees why, the API refuses; the professional can still cancel', async ({ page, request }) => {
  const pro = await professionalWithHours(request, 'Europe/London', 'Rule Pro');
  const member = await signUpByApi(request, 'member', 'Asia/Singapore', 'Rule Member');
  const [startAt] = await freeSlots(request, member, pro.id);
  const booked = await request.post('/api/sessions', { data: { professionalId: pro.id, startAt }, headers: auth(member) });
  const sessionId = (await booked.json()).session.id;

  // Time travel: move the session to start in 3 hours.
  await withDb((db) =>
    db.query(`UPDATE sessions SET start_at = now() + interval '3 hours', end_at = now() + interval '3 hours 50 minutes' WHERE id = $1`, [sessionId]),
  );

  await logInAs(page, member, '/sessions');
  await expect(page.getByText(/Less than 24 hours to go/)).toBeVisible();
  await expect(page.locator('.session').getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reschedule' })).toHaveCount(0);
  const refused = await request.post(`/api/sessions/${sessionId}/cancel`, { headers: auth(member) });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error.code).toBe('WITHIN_24H');

  // The professional sees the member's name, both clocks, and can cancel with a warning.
  const proPage = await (await page.context().browser()!.newContext()).newPage();
  await logInAs(proPage, pro, '/schedule');
  await expect(proPage.locator('.session-with')).toHaveText(member.name);
  await expect(proPage.locator('.session-their-time')).toContainText(`for ${member.name.split(' ')[0]} in Singapore`);
  await proPage.locator('.session').getByRole('button', { name: 'Cancel' }).click();
  await expect(proPage.getByText(/Short-notice cancellations/)).toBeVisible();
  await proPage.getByRole('button', { name: 'Cancel session' }).click();
  await expect(proPage.locator('.toast')).toContainText('Session cancelled');

  // The member is told.
  await page.reload();
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.locator('.bell-item-title').first()).toHaveText('Session cancelled');
});

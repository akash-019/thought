/**
 * File: e2e/tests/availability.spec.ts
 *
 * The professional's side: setting weekly hours (with the session preview), being asked before
 * leaving with unsaved changes, and blocking a day that already has a booking.
 */
import { expect, test } from '@playwright/test';
import { auth, freeSlots, logInAs, professionalWithHours, signUpByApi } from './helpers';

test('set weekly hours and see members get those times', async ({ page, request }) => {
  const pro = await signUpByApi(request, 'professional', 'Asia/Kolkata', 'Hours Pro');
  await logInAs(page, pro, '/availability');

  await page.locator('.week-day', { hasText: 'Wednesday' }).getByRole('button', { name: 'Add hours' }).click();
  await expect(page.locator('.range-preview')).toHaveText('4 sessions: 09:00, 10:00, 11:00, 12:00');
  await page.getByRole('button', { name: 'Save working hours' }).click();
  await expect(page.locator('.toast')).toContainText('Working hours saved');

  const member = await signUpByApi(request, 'member', 'Asia/Kolkata');
  const slots = await freeSlots(request, member, pro.id);
  expect(slots.length).toBeGreaterThan(0);
  for (const s of slots) expect(new Date(s).getUTCDay()).toBe(3); // all on Wednesdays
});

test('leaving with unsaved hours asks first', async ({ page, request }) => {
  const pro = await signUpByApi(request, 'professional', 'UTC', 'Unsaved Pro');
  await logInAs(page, pro, '/availability');
  await page.locator('.week-day', { hasText: 'Monday' }).getByRole('button', { name: 'Add hours' }).click();
  await page.getByRole('link', { name: 'Schedule' }).click();

  const dialog = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay and save' }).click();
  await expect(page).toHaveURL(/\/availability$/);
});

test('blocking a day that has a booking lists it and asks first', async ({ page, request }) => {
  const pro = await professionalWithHours(request, 'UTC', 'Block Pro');
  const member = await signUpByApi(request, 'member', 'UTC', 'Block Member');
  const startAt = (await freeSlots(request, member, pro.id)).find((s) => new Date(s).getTime() > Date.now() + 48 * 3_600_000)!;
  await request.post('/api/sessions', { data: { professionalId: pro.id, startAt }, headers: auth(member) });

  await logInAs(page, pro, '/availability');
  await page.getByLabel('Day', { exact: true }).fill(startAt.slice(0, 10));
  await page.getByRole('button', { name: 'Block this day' }).click();
  await expect(page.locator('.warning')).toContainText(`with ${member.name}`);
  await page.getByRole('button', { name: 'Block the day anyway' }).click();
  await expect(page.locator('.chip')).toHaveCount(1);
});

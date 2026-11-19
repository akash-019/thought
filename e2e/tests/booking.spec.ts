/**
 * File: e2e/tests/booking.spec.ts
 *
 * The member's journey: find a professional, pick a time from the calendar in their own
 * timezone, confirm, book; then reschedule and cancel.
 */
import { expect, test } from '@playwright/test';
import { freeSlots, logInAs, professionalWithHours, signUpByApi, toast } from './helpers';

test('find, book, reschedule and cancel a session', async ({ page, request }) => {
  const pro = await professionalWithHours(request, 'Europe/Berlin', 'Berlin Pro');
  const member = await signUpByApi(request, 'member', 'Asia/Tokyo');
  await logInAs(page, member, '/professionals');

  // Find the professional with the search box.
  await page.getByRole('searchbox', { name: 'Search professionals' }).fill(pro.name);
  await expect(page.locator('.pro-row')).toHaveCount(1);
  await page.locator('.pro-row').click();

  // The calendar is in the member's timezone, and every time also shows the professional's.
  await expect(page.getByText(/Times in your timezone \(Tokyo\)/)).toBeVisible();
  await expect(page.locator('.slot').first()).toContainText('in Berlin');

  // Pick a time on a later day (well beyond 24 hours, so it can be changed afterwards).
  await page.locator('.calendar-day.has-slots').nth(3).click();
  const slot = page.locator('.slot').first();
  const time = (await slot.locator('.slot-time').textContent())!;
  await slot.click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Nothing is booked until the confirmation screen is accepted.
  await expect(page.getByRole('heading', { name: 'Confirm your session' })).toBeVisible();
  await expect(page.locator('.summary')).toContainText(pro.name);
  await expect(page.locator('.summary')).toContainText('50 minutes');
  await page.getByRole('button', { name: 'Book session' }).click();

  await expect(toast(page)).toContainText('Session booked');
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.locator('.session')).toHaveCount(1);
  await expect(page.locator('.session-when')).toContainText(time);

  // The booked time is no longer offered to anyone.
  const booked = (await (await request.get('/api/sessions', { headers: { Authorization: `Bearer ${member.accessToken}` } })).json()).sessions[0];
  expect(await freeSlots(request, member, pro.id)).not.toContain(booked.startAt);

  // Reschedule: the old time is shown crossed out on the confirmation screen.
  await page.getByRole('link', { name: 'Reschedule' }).click();
  await page.locator('.calendar-day.has-slots').nth(5).click();
  await page.locator('.slot').last().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.summary .strike')).toBeVisible();
  await page.getByRole('button', { name: 'Move session' }).click();
  await expect(toast(page)).toContainText('Session moved');
  await expect(page.locator('.session')).toHaveCount(1); // never zero, never two

  // Cancel: asks first.
  await page.locator('.session').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/Cancel this session\?/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel session' }).click();
  await expect(toast(page)).toContainText('Session cancelled');
  await expect(page.getByText('No upcoming sessions')).toBeVisible();

  // Past shows both what happened.
  await page.getByRole('tab', { name: 'Past' }).click();
  await expect(page.locator('.session-status')).toHaveCount(2);
  const statuses = await page.locator('.session-status').allTextContents();
  expect(statuses.sort()).toEqual(['Cancelled by you', 'Moved to another time']);
});

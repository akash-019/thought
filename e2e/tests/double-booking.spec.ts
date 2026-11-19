/**
 * File: e2e/tests/double-booking.spec.ts
 *
 * Two members in two browsers confirm the same time at the same moment: exactly one gets it.
 * The other is told and sees fresh times.
 */
import { expect, test } from '@playwright/test';
import { logInAs, professionalWithHours, signUpByApi } from './helpers';

test('the same slot booked from two browsers at once: exactly one wins', async ({ browser, request }) => {
  const pro = await professionalWithHours(request, 'Europe/London', 'Race Pro');
  const [alice, bob] = await Promise.all([
    signUpByApi(request, 'member', 'Europe/London', 'Alice'),
    signUpByApi(request, 'member', 'Europe/London', 'Bob'),
  ]);

  const pages = await Promise.all(
    [alice, bob].map(async (member) => {
      const page = await (await browser.newContext()).newPage();
      await logInAs(page, member, `/professionals/${pro.id}`);
      await page.locator('.calendar-day.has-slots').nth(2).click();
      await page.locator('.slot').first().click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Confirm your session' })).toBeVisible();
      return page;
    }),
  );

  // Both press "Book session" at the same time.
  await Promise.all(pages.map((page) => page.getByRole('button', { name: 'Book session' }).click()));

  const outcomes = await Promise.all(
    pages.map(async (page) => {
      await expect(page.locator('.toast').or(page.getByRole('alert'))).toBeVisible();
      return (await page.locator('.toast').count()) > 0 ? 'booked' : 'taken';
    }),
  );
  expect([...outcomes].sort()).toEqual(['booked', 'taken']); // sort a copy: the order maps outcomes to pages

  const loser = pages[outcomes.indexOf('taken')]!;
  await expect(loser.getByRole('alert')).toContainText('this time was just booked');
  await expect(loser.getByRole('heading', { name: 'Choose a time' })).toBeVisible(); // back to fresh times
});

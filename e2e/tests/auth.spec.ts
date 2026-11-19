/**
 * File: e2e/tests/auth.spec.ts
 *
 * Sign up, log in, log out, and staying logged in when the access token expires.
 */
import { expect, test } from '@playwright/test';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, logInWithForm, PASSWORD, signUpByApi, unique } from './helpers';

test('a new member signs up with a timezone and lands on the professionals list', async ({ page }) => {
  const who = unique('Member');
  await page.goto('/signup');
  await page.getByLabel('Name').fill(who.name);
  await page.getByLabel('Email').fill(who.email);
  await page.locator('.password input').nth(0).fill(PASSWORD);
  await page.locator('.password input').nth(1).fill(PASSWORD);
  await page.getByRole('combobox', { name: 'Timezone' }).click();
  await page.keyboard.type('tokyo');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/there now/)).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/professionals$/);
  await expect(page.getByRole('heading', { name: 'Find a professional' })).toBeVisible();
  await expect(page.locator('.account-zone')).toHaveText('Tokyo time');
});

test('sign-up checks the two passwords match and that the email is new', async ({ page, request }) => {
  const existing = await signUpByApi(request, 'member', 'UTC');
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Someone');
  await page.getByLabel('Email').fill(existing.email);
  await page.locator('.password input').nth(0).fill(PASSWORD);
  await page.locator('.password input').nth(1).fill('different1');
  await expect(page.getByText('Passwords don’t match.')).toBeVisible();

  await page.locator('.password input').nth(1).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('An account with this email already exists.');
});

test('a wrong password gets a clear, generic message', async ({ page, request }) => {
  const user = await signUpByApi(request, 'member', 'UTC');
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.locator('.password input').fill('not-my-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
});

test('the show-password button reveals what was typed', async ({ page }) => {
  await page.goto('/login');
  const field = page.locator('.password input');
  await field.fill('secret123');
  await expect(field).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(field).toHaveAttribute('type', 'text');
});

test('pages need a log-in; logging out returns to the log-in page', async ({ page, request }) => {
  await page.goto('/sessions');
  await expect(page).toHaveURL(/\/login$/);

  const user = await signUpByApi(request, 'professional', 'UTC');
  await logInWithForm(page, user.email);
  await expect(page).toHaveURL(/\/schedule$/);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/schedule');
  await expect(page).toHaveURL(/\/login$/);
});

test('when the access token expires, the app refreshes it and keeps working', async ({ page, request }) => {
  const user = await signUpByApi(request, 'member', 'UTC');
  await logInWithForm(page, user.email);

  // Replace the access token with one that expired a minute ago (same user, valid signature).
  const now = Math.floor(Date.now() / 1000);
  const expired = jwt.sign({ sub: user.id, role: 'member', iat: now - 3600, exp: now - 60 }, JWT_SECRET);
  await page.evaluate((t) => localStorage.setItem('accessToken', t), expired);

  await page.getByRole('link', { name: 'My sessions' }).click();
  await expect(page.getByRole('heading', { name: 'My sessions' })).toBeVisible();
  await expect(page.getByText('No upcoming sessions')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).not.toBe(expired);
});

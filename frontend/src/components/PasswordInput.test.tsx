/**
 * File: src/components/PasswordInput.test.tsx
 *
 * Tests: the eye button shows and hides the password.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { PasswordInput } from './PasswordInput';

it('toggles between hidden and visible', async () => {
  render(<PasswordInput aria-label="Password" defaultValue="secret123" />);
  const input = screen.getByLabelText('Password');
  expect(input).toHaveAttribute('type', 'password');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');
});

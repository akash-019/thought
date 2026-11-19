/**
 * File: src/professionals/PickAndConfirm.test.tsx
 *
 * Tests: pick a time, see a confirmation screen, confirm. If someone else took the time first,
 * go back to the calendar, say so, and load fresh times.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Professional, SlotsResponse } from '../api/types';
import { PickAndConfirm } from './PickAndConfirm';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (importActual) => ({ ...(await importActual<object>()), api: apiMock }));
vi.mock('../auth/AuthContext', () => ({
  useUser: () => ({ id: '1', name: 'Sam Taylor', email: 'sam@example.com', role: 'member', timezone: 'Asia/Singapore' }),
}));

const SOFIA: Professional = { id: '3', name: 'Dr Sofia Ramirez', bio: null, timezone: 'America/New_York' };
const SLOTS: SlotsResponse = {
  timezone: 'Asia/Singapore',
  professionalTimezone: 'America/New_York',
  days: [{ date: '2026-11-20', slots: [{ startAt: '2026-11-19T17:00:00.000Z', localTime: '01:00' }] }],
};
const TEXT = { pick: 'Choose a time', confirm: 'Confirm your session', button: 'Book session', busy: 'Booking…' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T02:00:00Z'));
  apiMock.mockReset();
  apiMock.mockResolvedValue(SLOTS);
});
afterEach(() => vi.useRealTimers());

async function pickFirstTime() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: /01:00/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
}

describe('PickAndConfirm', () => {
  it('shows a confirmation screen with both people’s times before booking', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<PickAndConfirm professional={SOFIA} text={TEXT} onConfirm={onConfirm} />);
    const user = await pickFirstTime();

    expect(screen.getByRole('heading', { name: 'Confirm your session' })).toBeInTheDocument();
    expect(screen.getByText('Friday 20 November, 01:00')).toBeInTheDocument();
    expect(screen.getByText('Thu 19 Nov, 12:00 for Sofia in New York')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled(); // nothing is booked until the member confirms

    await user.click(screen.getByRole('button', { name: 'Book session' }));
    expect(onConfirm).toHaveBeenCalledWith('2026-11-19T17:00:00.000Z');
  });

  it('“Choose another time” goes back to the calendar', async () => {
    render(<PickAndConfirm professional={SOFIA} text={TEXT} onConfirm={vi.fn()} />);
    const user = await pickFirstTime();
    await user.click(screen.getByRole('button', { name: 'Choose another time' }));
    expect(screen.getByRole('heading', { name: 'Choose a time' })).toBeInTheDocument();
  });

  it('if the time was just taken, goes back to the calendar with the message and fresh times', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(409, 'SLOT_TAKEN', 'Sorry, this time was just booked.'));
    render(<PickAndConfirm professional={SOFIA} text={TEXT} onConfirm={onConfirm} />);
    const user = await pickFirstTime();
    await user.click(screen.getByRole('button', { name: 'Book session' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, this time was just booked.');
    expect(screen.getByRole('heading', { name: 'Choose a time' })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2); // slots loaded again
  });

  it('other errors keep the confirmation screen so the member can try again', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new ApiError(500, 'INTERNAL', 'Something went wrong.'));
    render(<PickAndConfirm professional={SOFIA} text={TEXT} onConfirm={onConfirm} />);
    const user = await pickFirstTime();
    await user.click(screen.getByRole('button', { name: 'Book session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Book session' })).toBeEnabled();
  });
});

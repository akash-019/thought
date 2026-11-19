/**
 * File: src/professionals/SlotPicker.test.tsx
 *
 * Tests: the booking calendar shows free days in the member's timezone, and each time with the
 * professional's local time (and their date when it differs).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlotsResponse } from '../api/types';
import { SlotPicker } from './SlotPicker';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (importActual) => ({ ...(await importActual<object>()), api: apiMock }));

// Member in Singapore, professional in New York (13 hours behind).
const SLOTS: SlotsResponse = {
  timezone: 'Asia/Singapore',
  professionalTimezone: 'America/New_York',
  days: [
    {
      date: '2026-11-20',
      slots: [
        { startAt: '2026-11-19T17:00:00.000Z', localTime: '01:00' },
        { startAt: '2026-11-19T18:00:00.000Z', localTime: '02:00' },
      ],
    },
    { date: '2026-11-24', slots: [{ startAt: '2026-11-24T06:00:00.000Z', localTime: '14:00' }] },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T02:00:00Z')); // Thursday 19 Nov, 10:00 in Singapore
  apiMock.mockReset();
});
afterEach(() => vi.useRealTimers());

function renderPicker(onSelect = vi.fn()) {
  render(<SlotPicker professionalId="3" professionalName="Dr Sofia Ramirez" refreshKey={0} selected={null} onSelect={onSelect} />);
  return onSelect;
}

describe('SlotPicker', () => {
  it('opens the first free day and shows both clocks, with their date when it differs', async () => {
    apiMock.mockResolvedValue(SLOTS);
    renderPicker();
    expect(await screen.findByRole('heading', { name: /Friday 20 November/ })).toHaveTextContent('2 free times');
    const first = screen.getByRole('radio', { name: /01:00/ });
    expect(first).toHaveTextContent('12:00 in New York');
    expect(first).toHaveTextContent('Thu 19 Nov'); // still Thursday in New York
    expect(screen.getByText(/Times in your timezone \(Singapore\)/)).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/professionals/3/slots');
  });

  it('only days with free times can be chosen; today is marked', async () => {
    apiMock.mockResolvedValue(SLOTS);
    renderPicker();
    await screen.findByRole('heading', { name: /Friday 20 November/ });
    expect(screen.getByRole('button', { name: /Friday 20 November, 2 free times/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Saturday 21 November, no free times/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Today, Thursday 19 November/ })).toHaveAttribute('aria-current', 'date');
  });

  it('picking a time reports it; picking another day clears the choice', async () => {
    apiMock.mockResolvedValue(SLOTS);
    const onSelect = renderPicker();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /02:00/ }));
    expect(onSelect).toHaveBeenLastCalledWith('2026-11-19T18:00:00.000Z');
    await user.click(screen.getByRole('button', { name: /Tuesday 24 November/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('radio', { name: /14:00/ })).toHaveTextContent('01:00 in New York'); // same date there
  });

  it('says so when there is nothing free in the next 4 weeks', async () => {
    apiMock.mockResolvedValue({ ...SLOTS, days: [] });
    renderPicker();
    expect(await screen.findByText('No free times in the next 4 weeks')).toBeInTheDocument();
  });
});

/**
 * File: src/sessions/SessionRow.test.tsx
 *
 * Tests: what a session row shows and allows: the 24-hour lock for members, the inline cancel
 * confirmation, and the short-notice warning for professionals.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, User } from '../api/types';
import { SessionRow } from './SessionRow';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (importActual) => ({ ...(await importActual<object>()), api: apiMock }));

const SAM: User = { id: '1', name: 'Sam Taylor', email: 'sam@example.com', role: 'member', timezone: 'Asia/Singapore' };
const MAYA: User = { id: '2', name: 'Dr Maya Lindqvist', email: 'maya@example.com', role: 'professional', timezone: 'Europe/London' };
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function session(overrides: Partial<Session>): Session {
  return {
    id: '7',
    startAt: inHours(48),
    endAt: inHours(48.84),
    status: 'booked',
    cancelledBy: null,
    counterpart: { id: '2', name: 'Dr Maya Lindqvist', timezone: 'Europe/London' },
    canCancel: true,
    canReschedule: true,
    ...overrides,
  };
}

function renderRow(s: Session, user: User, onChanged = vi.fn()) {
  render(
    <MemoryRouter>
      <ul>
        <SessionRow session={s} user={user} onChanged={onChanged} />
      </ul>
    </MemoryRouter>,
  );
  return onChanged;
}

beforeEach(() => apiMock.mockReset());

describe('SessionRow', () => {
  it('shows the other person’s local time too', () => {
    renderRow(session({}), SAM);
    expect(screen.getByText(/for Maya in London/)).toBeInTheDocument();
  });

  it('inside 24 hours a member sees why changes are locked, and no buttons', () => {
    renderRow(session({ startAt: inHours(5), endAt: inHours(5.84), canCancel: false, canReschedule: false }), SAM);
    expect(screen.getByText(/Less than 24 hours to go/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reschedule' })).not.toBeInTheDocument();
  });

  it('cancelling asks first, then calls the API', async () => {
    apiMock.mockResolvedValue({ session: {} });
    const onChanged = renderRow(session({}), SAM);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/Cancel this session\? Dr Maya Lindqvist will be told/)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel session' }));
    expect(apiMock).toHaveBeenCalledWith('/sessions/7/cancel', { method: 'POST' });
    expect(onChanged).toHaveBeenCalledWith('Session cancelled');
  });

  it('“Keep it” closes the confirmation without cancelling', async () => {
    renderRow(session({}), SAM);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('a professional cancelling inside 24 hours is warned about short notice', async () => {
    const s = session({ startAt: inHours(3), endAt: inHours(3.84), canReschedule: false, counterpart: { name: 'Sam Taylor', timezone: 'Asia/Singapore' } });
    renderRow(s, MAYA);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/Short-notice cancellations are hard for members/)).toBeInTheDocument();
  });

  it('past sessions say what happened', () => {
    renderRow(session({ status: 'cancelled', cancelledBy: 'professional', canCancel: false, canReschedule: false }), SAM);
    expect(screen.getByText('Cancelled by Dr Maya Lindqvist')).toBeInTheDocument();
  });
});

/**
 * File: src/sessions/SessionRow.tsx
 *
 * One session in a list: date, time, who it is with, its status, and the actions allowed
 * right now. Cancelling asks for confirmation inline (no browser pop-up). Inside the 24-hour
 * window a member sees why the buttons are gone instead of the buttons.
 * The time is shown in your timezone, and under it in the other person's, when their clock differs.
 */
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api/client';
import type { Session, User } from '../api/types';
import { firstName } from '../lib/names';
import { cityOf, clocksDiffer, dayLabel, formatTime, relative, theirClock } from '../lib/time';

interface Props {
  session: Session;
  user: User;
  onChanged: (message: string) => void;
}

export function SessionRow({ session, user, onChanged }: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = DateTime.fromISO(session.startAt, { zone: user.timezone });
  const isMember = user.role === 'member';
  const isUpcoming = session.status === 'booked' && new Date(session.endAt) > new Date();
  const other = session.counterpart;
  const shortNotice = new Date(session.startAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api(`/sessions/${session.id}/cancel`, { method: 'POST' });
      onChanged('Session cancelled');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <li className="session">
      <div className="session-date" aria-hidden="true">
        <span className="session-date-day">{start.toFormat('d')}</span>
        <span className="session-date-month">{start.toFormat('LLL')}</span>
      </div>

      <div className="session-main">
        <p className="session-when">
          {start.toFormat('cccc')}, {formatTime(session.startAt, user.timezone)} – {formatTime(session.endAt, user.timezone)}
          {isUpcoming && <span className="session-day-label">{dayLabel(session.startAt, user.timezone)}</span>}
        </p>
        <p className="session-with">
          {isMember ? 'With ' : ''}
          {other.name}
        </p>
        {clocksDiffer(session.startAt, user.timezone, other.timezone) && (
          <p className="session-their-time">
            {theirClock(session.startAt, other.timezone, user.timezone)} – {formatTime(session.endAt, other.timezone)} for {firstName(other.name)} in{' '}
            {cityOf(other.timezone)}
          </p>
        )}
        {!isUpcoming && <p className="session-status">{statusText(session, user)}</p>}
        {isUpcoming && isMember && !session.canCancel && (
          <p className="session-locked">
            Less than 24 hours to go, so this session can’t be cancelled or moved here. If you can’t attend, please
            contact {other.name}.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {isUpcoming && (session.canCancel || session.canReschedule) && (
        <div className="session-actions">
          {confirmingCancel ? (
            <div className="inline-confirm">
              <p>Cancel this session? {other.name} will be told.</p>
              {!isMember && shortNotice && (
                <p className="inline-confirm-note">
                  It starts {relative(session.startAt)}. Short-notice cancellations are hard for members, so only cancel if
                  you must.
                </p>
              )}
              <div className="button-row">
                <button type="button" className="button button-danger" onClick={cancel} disabled={busy}>
                  {busy ? 'Cancelling…' : 'Cancel session'}
                </button>
                <button type="button" className="button button-quiet" onClick={() => setConfirmingCancel(false)} disabled={busy}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="button-row">
              {session.canReschedule && (
                <Link to={`/sessions/${session.id}/reschedule`} className="button button-quiet">
                  Reschedule
                </Link>
              )}
              {session.canCancel && (
                <button type="button" className="button button-quiet" onClick={() => setConfirmingCancel(true)}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** "Completed", "Cancelled by you", "Moved to another time"... for past sessions. */
function statusText(session: Session, user: User): string {
  if (session.status === 'rescheduled') return 'Moved to another time';
  if (session.status === 'cancelled') return session.cancelledBy === user.role ? 'Cancelled by you' : `Cancelled by ${session.counterpart.name}`;
  return 'Completed';
}

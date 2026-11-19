/**
 * File: src/sessions/ReschedulePage.tsx
 *
 * Members: move a session to another time with the same professional.
 * Pick a new time, confirm, done. If the new time is taken, the original session is kept.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, errorMessage } from '../api/client';
import type { Professional, Session } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { formatDateTime } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { usePageTitle } from '../lib/usePageTitle';
import { SlotPicker } from '../professionals/SlotPicker';
import { SessionSummary } from './SessionSummary';

export function ReschedulePage() {
  const { id = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error: loadError, loading } = useLoad(async () => {
    const { session } = await api<{ session: Session }>(`/sessions/${id}`);
    const { professional } = await api<{ professional: Professional }>(`/professionals/${session.counterpart.id}`);
    return { session, professional };
  }, [id]);

  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  usePageTitle('Reschedule');

  if (loading) return <Loading />;
  if (loadError || !data) return <ErrorNote message={loadError ?? 'Session not found.'} />;
  const { session, professional } = data;

  if (!session.canReschedule) {
    return (
      <>
        <Link to="/sessions" className="back-link">
          My sessions
        </Link>
        <h1>This session can’t be moved</h1>
        <p className="lead">
          Sessions can only be rescheduled more than 24 hours before they start. If you can’t attend, please contact{' '}
          {professional.name}.
        </p>
      </>
    );
  }

  async function move() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/sessions/${session.id}/reschedule`, { method: 'POST', body: { startAt: selected } });
      toast.show(`Session moved to ${formatDateTime(selected, user.timezone)}`);
      navigate('/sessions');
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) {
        setSelected(null);
        setConfirming(false);
        setRefreshKey((k) => k + 1);
      }
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/sessions" className="back-link">
        My sessions
      </Link>
      <h1>Reschedule with {professional.name}</h1>
      <p className="lead">Currently {formatDateTime(session.startAt, user.timezone)}. Your session stays booked until the new time is confirmed.</p>

      {error && <ErrorNote message={error} />}

      {!confirming ? (
        <section aria-labelledby="pick-heading">
          <h2 id="pick-heading">Choose a new time</h2>
          <SlotPicker
            professionalId={professional.id}
            professionalName={professional.name}
            refreshKey={refreshKey}
            selected={selected}
            onSelect={(s) => {
              setSelected(s);
              setError(null);
            }}
          />
          <div className={selected ? 'action-bar visible' : 'action-bar'} aria-hidden={!selected}>
            {selected && (
              <>
                <p>
                  <strong>{formatDateTime(selected, user.timezone)}</strong>
                </p>
                <button type="button" className="button button-primary" onClick={() => setConfirming(true)}>
                  Continue
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="confirm" aria-labelledby="confirm-heading">
          <h2 id="confirm-heading">Confirm the new time</h2>
          <SessionSummary
            withName={professional.name}
            startAt={selected!}
            previousStartAt={session.startAt}
            yourTimezone={user.timezone}
            theirTimezone={professional.timezone}
          />
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={move} disabled={busy}>
              {busy ? 'Moving…' : 'Move session'}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setConfirming(false)} disabled={busy}>
              Choose another time
            </button>
          </div>
        </section>
      )}
    </>
  );
}

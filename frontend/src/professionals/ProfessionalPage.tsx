/**
 * File: src/professionals/ProfessionalPage.tsx
 *
 * Members: a professional's profile and booking flow.
 *   1. pick a day and time in the calendar
 *   2. check the confirmation screen
 *   3. book
 * If someone books the same time first, the member is told and sees fresh times.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, errorMessage } from '../api/client';
import type { Professional } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { cityOf, formatDateTime } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { SessionSummary } from '../sessions/SessionSummary';
import { initials } from './ProfessionalsPage';
import { SlotPicker } from './SlotPicker';

export function ProfessionalPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const pro = useLoad(() => api<{ professional: Professional }>(`/professionals/${id}`).then((r) => r.professional), [id]);

  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (pro.loading) return <Loading />;
  if (pro.error || !pro.data) return <ErrorNote message={pro.error ?? 'Professional not found.'} />;
  const p = pro.data;

  async function book() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api('/sessions', { method: 'POST', body: { professionalId: p.id, startAt: selected } });
      toast.show(`Session booked for ${formatDateTime(selected, user.timezone)}`);
      navigate('/sessions');
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) {
        // Taken in the meantime: go back to the calendar with fresh times.
        setSelected(null);
        setConfirming(false);
        setRefreshKey((k) => k + 1);
      }
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/professionals" className="back-link">
        All professionals
      </Link>
      <header className="profile">
        <span className="avatar avatar-large" aria-hidden="true">
          {initials(p.name)}
        </span>
        <div>
          <h1>{p.name}</h1>
          {p.bio && <p className="lead">{p.bio}</p>}
          <p className="muted">Based in {cityOf(p.timezone)}</p>
        </div>
      </header>

      {error && <ErrorNote message={error} />}

      {!confirming ? (
        <section aria-labelledby="pick-heading">
          <h2 id="pick-heading">Choose a time</h2>
          <SlotPicker
            professionalId={p.id}
            professionalName={p.name}
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
          <h2 id="confirm-heading">Confirm your session</h2>
          <SessionSummary withName={p.name} startAt={selected!} yourTimezone={user.timezone} theirTimezone={p.timezone} />
          <p className="muted small">
            You can cancel or reschedule up to 24 hours before it starts. You’ll get reminders 24 hours and 1 hour before.
          </p>
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={book} disabled={busy}>
              {busy ? 'Booking…' : 'Book session'}
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

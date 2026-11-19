/**
 * File: src/professionals/PickAndConfirm.tsx
 *
 * The two-step flow shared by booking and rescheduling:
 *   1. pick a day and time in the calendar, then "Continue"
 *   2. check the confirmation screen, then confirm
 * If the time was taken by someone else in the meantime (409), it goes back to the calendar,
 * says so, and shows fresh times.
 */
import { useState, type ReactNode } from 'react';
import { ApiError, errorMessage } from '../api/client';
import type { Professional } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote } from '../components/States';
import { formatDateTime } from '../lib/time';
import { SessionSummary } from '../sessions/SessionSummary';
import { SlotPicker } from './SlotPicker';

interface Props {
  professional: Professional;
  /** Headings and button text, e.g. "Choose a time" / "Confirm your session" / "Book session". */
  text: { pick: string; confirm: string; button: string; busy: string };
  /** When rescheduling: the current time, shown crossed out on the confirmation screen. */
  previousStartAt?: string;
  /** Extra line under the summary on the confirmation screen. */
  note?: ReactNode;
  /** Does the booking or rescheduling. Throws on failure. */
  onConfirm: (startAt: string) => Promise<void>;
}

export function PickAndConfirm({ professional, text, previousStartAt, note, onConfirm }: Props) {
  const user = useUser();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(selected);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      if (err instanceof ApiError && err.status === 409) {
        // Someone else took this time: back to the calendar with fresh times.
        setSelected(null);
        setConfirming(false);
        setRefreshKey((k) => k + 1);
      }
    }
  }

  return (
    <>
      {error && <ErrorNote message={error} />}

      {!confirming || !selected ? (
        <section aria-labelledby="pick-heading">
          <h2 id="pick-heading">{text.pick}</h2>
          <SlotPicker
            professionalId={professional.id}
            professionalName={professional.name}
            refreshKey={refreshKey}
            selected={selected}
            onSelect={(startAt) => {
              setSelected(startAt);
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
          <h2 id="confirm-heading">{text.confirm}</h2>
          <SessionSummary
            withName={professional.name}
            startAt={selected}
            previousStartAt={previousStartAt}
            yourTimezone={user.timezone}
            theirTimezone={professional.timezone}
          />
          {note && <p className="muted small">{note}</p>}
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={confirm} disabled={busy}>
              {busy ? text.busy : text.button}
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

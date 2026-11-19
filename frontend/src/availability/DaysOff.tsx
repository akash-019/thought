/**
 * File: src/availability/DaysOff.tsx
 *
 * Professionals: block off whole days (e.g. holidays) so members can't book them.
 * Blocking a day that already has bookings lists them and asks first: the sessions stay booked.
 */
import { DateTime } from 'luxon';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Session } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { formatLongDate, formatTime } from '../lib/time';
import { useLoad } from '../lib/useLoad';

export function DaysOff() {
  const user = useUser();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(
    () => api<{ dates: string[] }>('/me/blocked-dates').then((r) => r.dates),
    [],
  );
  const [newDate, setNewDate] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  /** A day the professional wants to block that already has bookings: shown for confirmation. */
  const [pending, setPending] = useState<{ date: string; sessions: Session[] } | null>(null);
  const today = DateTime.now().toISODate()!;
  const upcomingDaysOff = (data ?? []).filter((d) => d >= today);

  async function saveDates(dates: string[], message: string) {
    setSaveError(null);
    try {
      const res = await api<{ dates: string[] }>('/me/blocked-dates', { method: 'PUT', body: { dates } });
      setData(res.dates);
      toast.show(message);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  }

  async function block(date: string) {
    if (!data || data.includes(date)) return;
    setSaveError(null);
    // Blocking stops new bookings but keeps existing ones, so say so if there are any that day.
    try {
      const { sessions } = await api<{ sessions: Session[] }>('/sessions?scope=upcoming');
      const onThatDay = sessions.filter((s) => DateTime.fromISO(s.startAt, { zone: user.timezone }).toISODate() === date);
      if (onThatDay.length > 0) {
        setPending({ date, sessions: onThatDay });
        return;
      }
    } catch {
      // If the check fails, still let them block the day.
    }
    await saveDates([...data, date], `${formatLongDate(date)} blocked`);
  }

  return (
    <section className="panel" aria-labelledby="blocked-heading">
      <h2 id="blocked-heading">Days off</h2>
      <p className="muted">Members can’t book you on these days.</p>
      {loading && !data && <Loading />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && (
        <>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (newDate) void block(newDate);
              setNewDate('');
            }}
          >
            <label className="field">
              <span>Day</span>
              <input type="date" min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            </label>
            <button className="button button-quiet">Block this day</button>
          </form>
          {pending && (
            <div className="warning" role="alert">
              <p>
                <strong>
                  You have {pending.sessions.length} session{pending.sessions.length > 1 ? 's' : ''} on{' '}
                  {formatLongDate(pending.date)}:
                </strong>
              </p>
              <ul>
                {pending.sessions.map((s) => (
                  <li key={s.id}>
                    {formatTime(s.startAt, user.timezone)} with {s.counterpart.name}
                  </li>
                ))}
              </ul>
              <p>Blocking the day stops new bookings but keeps these. Cancel them from your schedule if you can’t attend.</p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    void saveDates([...data, pending.date], `${formatLongDate(pending.date)} blocked`);
                    setPending(null);
                  }}
                >
                  Block the day anyway
                </button>
                <button type="button" className="button button-quiet" onClick={() => setPending(null)}>
                  Don’t block
                </button>
              </div>
            </div>
          )}
          {saveError && <ErrorNote message={saveError} />}
          {upcomingDaysOff.length === 0 ? (
            <p className="muted">No days off planned.</p>
          ) : (
            <ul className="chips">
              {upcomingDaysOff.map((d) => (
                  <li key={d} className="chip">
                    {formatLongDate(d)}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Unblock ${formatLongDate(d)}`}
                      onClick={() => saveDates(data.filter((day) => day !== d), `${formatLongDate(d)} available again`)}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

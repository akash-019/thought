/**
 * File: src/availability/AvailabilityPage.tsx
 *
 * Professionals: set weekly working hours and block off whole days (e.g. holidays).
 * Under each range it previews the session start times members will see, so the effect of
 * "09:00 to 12:30" (3 sessions: 09:00, 10:00, 11:00) is clear before saving.
 * Times are in the professional's own timezone. Saving never changes sessions already booked.
 */
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { WeeklyRule } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { cityOf, formatLongDate } from '../lib/time';
import { useLoad } from '../lib/useLoad';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SESSION_MINUTES = 50;
const STEP_MINUTES = 60; // a 50-minute session + 10-minute break, as the backend lays them out

export function AvailabilityPage() {
  const user = useUser();
  return (
    <>
      <h1>Availability</h1>
      <p className="lead">
        Times are in your timezone ({cityOf(user.timezone)}). Members see them in theirs. Changes never affect sessions
        that are already booked.
      </p>
      <WeeklyHours />
      <BlockedDates />
    </>
  );
}

// --- Weekly hours ------------------------------------------------------------------------------

function WeeklyHours() {
  const toast = useToast();
  const saved = useLoad(() => api<{ rules: WeeklyRule[] }>('/me/availability').then((r) => r.rules), []);
  const [rules, setRules] = useState<WeeklyRule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data) setRules(saved.data);
  }, [saved.data]);

  if (saved.loading && !saved.data) return <Loading />;
  if (saved.error) return <ErrorNote message={saved.error} onRetry={saved.reload} />;

  const changed = JSON.stringify(rules) !== JSON.stringify(saved.data);

  const update = (index: number, patch: Partial<WeeklyRule>) =>
    setRules((all) => all.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => setRules((all) => all.filter((_, i) => i !== index));
  const add = (weekday: number) => {
    const lastEnd = rules.filter((r) => r.weekday === weekday).at(-1)?.end;
    const start = lastEnd && lastEnd < '20:00' ? addHour(lastEnd) : '09:00';
    setRules((all) => [...all, { weekday, start, end: addHours(start, 4) }]);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ rules: WeeklyRule[] }>('/me/availability', { method: 'PUT', body: { rules } });
      saved.setData(res.rules);
      toast.show('Working hours saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="hours-heading">
      <h2 id="hours-heading">Weekly hours</h2>
      <ul className="week">
        {DAYS.map((dayName, i) => {
          const weekday = i + 1;
          const ranges = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => rule.weekday === weekday);
          return (
            <li key={dayName} className="week-day">
              <span className="week-day-name">{dayName}</span>
              <div className="week-day-ranges">
                {ranges.length === 0 && <span className="muted">Not available</span>}
                {ranges.map(({ rule, index }) => (
                  <div key={index} className="range">
                    <div className="range-inputs">
                      <input
                        type="time"
                        step={300}
                        value={rule.start}
                        aria-label={`${dayName} start`}
                        onChange={(e) => update(index, { start: e.target.value })}
                      />
                      <span aria-hidden="true">to</span>
                      <input
                        type="time"
                        step={300}
                        value={rule.end}
                        aria-label={`${dayName} end`}
                        onChange={(e) => update(index, { end: e.target.value })}
                      />
                      <button type="button" className="icon-button" aria-label={`Remove ${dayName} ${rule.start} to ${rule.end}`} onClick={() => remove(index)}>
                        ×
                      </button>
                    </div>
                    <p className="range-preview">{previewSessions(rule)}</p>
                  </div>
                ))}
                <button type="button" className="link-button" onClick={() => add(weekday)}>
                  Add hours
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <ErrorNote message={error} />}
      <div className="button-row">
        <button type="button" className="button button-primary" onClick={save} disabled={!changed || busy}>
          {busy ? 'Saving…' : 'Save working hours'}
        </button>
        {changed && (
          <button type="button" className="button button-quiet" onClick={() => setRules(saved.data ?? [])} disabled={busy}>
            Discard changes
          </button>
        )}
      </div>
    </section>
  );
}

/** "3 sessions: 09:00, 10:00, 11:00" for one range, laid out like the backend does it. */
function previewSessions(rule: WeeklyRule): string {
  const start = toMinutes(rule.start);
  const end = toMinutes(rule.end);
  if (end <= start) return 'End must be after start.';
  const starts: string[] = [];
  for (let m = start; m + SESSION_MINUTES <= end; m += STEP_MINUTES) starts.push(fromMinutes(m));
  if (starts.length === 0) return 'Too short for a 50-minute session.';
  return `${starts.length} session${starts.length > 1 ? 's' : ''}: ${starts.join(', ')}`;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addHours = (t: string, h: number) => fromMinutes(Math.min(toMinutes(t) + h * 60, 23 * 60 + 55));
const addHour = (t: string) => addHours(t, 1);

// --- Blocked dates -----------------------------------------------------------------------------

function BlockedDates() {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(
    () => api<{ dates: string[] }>('/me/blocked-dates').then((r) => r.dates),
    [],
  );
  const [newDate, setNewDate] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = DateTime.now().toISODate()!;

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
              if (newDate && !data.includes(newDate)) {
                void saveDates([...data, newDate], `${formatLongDate(newDate)} blocked`);
              }
              setNewDate('');
            }}
          >
            <label className="field">
              <span>Day</span>
              <input type="date" min={today} value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            </label>
            <button className="button button-quiet">Block this day</button>
          </form>
          {saveError && <ErrorNote message={saveError} />}
          {data.filter((d) => d >= today).length === 0 ? (
            <p className="muted">No days off planned.</p>
          ) : (
            <ul className="chips">
              {data
                .filter((d) => d >= today)
                .map((d) => (
                  <li key={d} className="chip">
                    {formatLongDate(d)}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Unblock ${formatLongDate(d)}`}
                      onClick={() => saveDates(data.filter((x) => x !== d), `${formatLongDate(d)} available again`)}
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

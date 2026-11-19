/**
 * File: src/availability/WeeklyHours.tsx
 *
 * Professionals: edit weekly working hours (one or more ranges per weekday, in their own timezone).
 * Under each range it previews the session start times members will see, so the effect of
 * "09:00 to 12:30" (3 sessions: 09:00, 10:00, 11:00) is clear before saving.
 * Leaving the page with unsaved changes asks first.
 */
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { WeeklyRule } from '../api/types';
import { ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard';
import { useLoad } from '../lib/useLoad';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SESSION_MINUTES = 50;
const STEP_MINUTES = 60; // a 50-minute session + 10-minute break, as the backend lays them out

export function WeeklyHours() {
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
      <UnsavedChangesGuard when={changed} what="your working hours" />
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

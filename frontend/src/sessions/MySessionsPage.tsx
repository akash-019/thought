/**
 * File: src/sessions/MySessionsPage.tsx
 *
 * "My sessions" for members and "Schedule" for professionals: upcoming and past sessions.
 */
import { Link } from 'react-router';
import { useState } from 'react';
import { api } from '../api/client';
import type { Session } from '../api/types';
import { useUser } from '../auth/AuthContext';
import { Empty, ErrorNote, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { cityOf } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { usePageTitle } from '../lib/usePageTitle';
import { SessionRow } from './SessionRow';

type Scope = 'upcoming' | 'past';

export function MySessionsPage() {
  const user = useUser();
  const toast = useToast();
  const [scope, setScope] = useState<Scope>('upcoming');
  const { data, error, loading, reload } = useLoad(
    () => api<{ sessions: Session[] }>(`/sessions?scope=${scope}`).then((r) => r.sessions),
    [scope],
  );
  const isMember = user.role === 'member';
  usePageTitle(isMember ? 'My sessions' : 'Schedule');

  return (
    <>
      <h1>{isMember ? 'My sessions' : 'Schedule'}</h1>
      <p className="lead">Times are shown in your timezone ({cityOf(user.timezone)}).</p>

      <div className="tabs" role="tablist" aria-label="Which sessions">
        {(['upcoming', 'past'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            className={scope === s ? 'tab active' : 'tab'}
            onClick={() => setScope(s)}
          >
            {s === 'upcoming' ? 'Upcoming' : 'Past'}
          </button>
        ))}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty title={scope === 'upcoming' ? 'No upcoming sessions' : 'No past sessions yet'}>
          {scope === 'upcoming' &&
            (isMember ? (
              <p>
                <Link to="/professionals">Find a professional</Link> to book your first session.
              </p>
            ) : (
              <p>
                Members can book you once you’ve <Link to="/availability">set your working hours</Link>.
              </p>
            ))}
        </Empty>
      )}
      {data && data.length > 0 && (
        <ul className="session-list">
          {data.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              user={user}
              onChanged={(message) => {
                toast.show(message);
                void reload();
              }}
            />
          ))}
        </ul>
      )}
    </>
  );
}

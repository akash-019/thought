/**
 * File: src/professionals/ProfessionalsPage.tsx
 *
 * Members: the list of professionals. Opening one shows their calendar.
 */
import { Link } from 'react-router';
import { api } from '../api/client';
import type { Professional } from '../api/types';
import { Empty, ErrorNote, Loading } from '../components/States';
import { initials } from '../lib/names';
import { cityOf } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { usePageTitle } from '../lib/usePageTitle';

export function ProfessionalsPage() {
  usePageTitle('Find a professional');
  const { data, error, loading, reload } = useLoad(
    () => api<{ professionals: Professional[] }>('/professionals').then((r) => r.professionals),
    [],
  );

  return (
    <>
      <h1>Find a professional</h1>
      <p className="lead">Choose someone to see their free times for the next 4 weeks.</p>
      {loading && <Loading />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty title="No professionals have joined yet" />}
      {data && data.length > 0 && (
        <ul className="pro-list">
          {data.map((p) => (
            <li key={p.id}>
              <Link to={`/professionals/${p.id}`} className="pro-row">
                <span className="avatar" aria-hidden="true">
                  {initials(p.name)}
                </span>
                <span className="pro-row-text">
                  <span className="pro-name">{p.name}</span>
                  {p.bio && <span className="pro-bio">{p.bio}</span>}
                  <span className="pro-zone">Based in {cityOf(p.timezone)}</span>
                </span>
                <span className="pro-row-action">See times</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

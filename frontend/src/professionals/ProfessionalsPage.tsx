/**
 * File: src/professionals/ProfessionalsPage.tsx
 *
 * Members: the list of professionals, with a search by name, what they help with, or city.
 * Opening one shows their calendar.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { Professional } from '../api/types';
import { matches, SearchInput } from '../components/SearchInput';
import { Empty, ErrorNote, Loading } from '../components/States';
import { initials } from '../lib/names';
import { cityOf } from '../lib/time';
import { useLoad } from '../lib/useLoad';
import { usePageTitle } from '../lib/usePageTitle';

export function ProfessionalsPage() {
  usePageTitle('Find a professional');
  const [query, setQuery] = useState('');
  const { data, error, loading, reload } = useLoad(
    () => api<{ professionals: Professional[] }>('/professionals').then((r) => r.professionals),
    [],
  );
  const shown = (data ?? []).filter((p) => matches(query, p.name, p.bio, cityOf(p.timezone), p.timezone));

  return (
    <>
      <h1>Find a professional</h1>
      <p className="lead">Choose someone to see their free times for the next 4 weeks.</p>
      {loading && <Loading />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {data && data.length === 0 && <Empty title="No professionals have joined yet" />}
      {data && data.length > 0 && (
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            label="Search professionals"
            placeholder="Search by name, topic (e.g. anxiety) or city"
          />
          {query && (
            <p className="search-count" aria-live="polite">
              {shown.length} of {data.length} professionals
            </p>
          )}
          {shown.length === 0 ? (
            <Empty title={`No professionals match “${query}”`}>
              <p>Try a different name, topic or city.</p>
            </Empty>
          ) : (
            <ul className="pro-list">
              {shown.map((p) => (
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
      )}
    </>
  );
}

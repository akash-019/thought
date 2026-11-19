/**
 * File: src/auth/TimezoneSelect.tsx
 *
 * Timezone picker for sign-up: one searchable box. It shows the chosen zone ("Kolkata, GMT+5:30");
 * click or type to filter 400+ zones by city, region or offset ("new y", "+5:30"), then pick with
 * the mouse or the keyboard (arrow keys, Enter, Escape). Below it, the current time in that zone,
 * so people can check they picked the right one.
 */
import { DateTime } from 'luxon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { matches } from '../lib/search';

interface Props {
  zones: string[];
  value: string;
  onChange: (zone: string) => void;
}

export function TimezoneSelect({ zones, value, onChange }: Props) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => (zones.includes(value) ? zones : [value, ...zones]), [zones, value]);
  const results = useMemo(() => all.filter((z) => matches(query, z.replaceAll('_', ' '), label(z))), [all, query]);

  // Keep the highlighted option in view while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function choose(zone: string) {
    onChange(zone);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), results.length - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  return (
    <div className="field">
      <label htmlFor="timezone">Timezone</label>
      <div className="combo">
        <input
          id="timezone"
          role="combobox"
          aria-expanded={open}
          aria-controls="timezone-list"
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `tz-${active}` : undefined}
          autoComplete="off"
          value={open ? query : label(value)}
          placeholder={label(value)}
          onFocus={() => {
            setOpen(true);
            setActive(Math.max(results.indexOf(value), 0));
          }}
          onBlur={close}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <svg className="combo-chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {open && (
          <ul className="combo-list" id="timezone-list" role="listbox" ref={listRef}>
            {results.length === 0 && <li className="combo-empty">No timezone matches “{query}”</li>}
            {results.map((zone, i) => (
              <li
                key={zone}
                id={`tz-${i}`}
                role="option"
                aria-selected={zone === value}
                className={i === active ? 'combo-option active' : 'combo-option'}
                // mousedown (not click) so it fires before the input loses focus
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(zone);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{city(zone)}</span>
                <span className="combo-option-meta">
                  {region(zone)}, {offset(zone)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <small>
        It’s {now.setZone(value).toFormat('HH:mm')} on {now.setZone(value).toFormat('cccc')} there now. Session times are
        shown in this timezone.
      </small>
    </div>
  );
}

/** "America/Argentina/Salta" -> "Argentina, Salta" */
const city = (zone: string) => zone.split('/').slice(1).join(', ').replaceAll('_', ' ') || zone;
const region = (zone: string) => (zone.includes('/') ? zone.split('/')[0]! : 'Other');
const offset = (zone: string) => DateTime.now().setZone(zone).toFormat("'GMT'Z");
/** "Kolkata, GMT+5:30" */
const label = (zone: string) => `${city(zone)}, ${offset(zone)}`;

/** The current time, refreshed every minute. */
function useNow() {
  const [now, setNow] = useState(DateTime.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(DateTime.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

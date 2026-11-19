/**
 * File: src/auth/TimezoneSelect.tsx
 *
 * Timezone picker for sign-up. Zones are grouped by region and labelled with the city and
 * current UTC offset ("Kolkata, GMT+5:30"). Below it, the current time in the chosen zone,
 * so people can check they picked the right one.
 */
import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';

interface Props {
  zones: string[];
  value: string;
  onChange: (zone: string) => void;
}

export function TimezoneSelect({ zones, value, onChange }: Props) {
  const now = useNow();
  const groups = groupByRegion(zones.includes(value) ? zones : [value, ...zones]);

  return (
    <label className="field">
      <span>Timezone</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map(([region, list]) => (
          <optgroup key={region} label={region}>
            {list.map((zone) => (
              <option key={zone} value={zone}>
                {label(zone)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <small>
        Your time there now: <strong>{now.setZone(value).toFormat('HH:mm, cccc')}</strong>. All session times are shown in
        this timezone.
      </small>
    </label>
  );
}

/** "Asia/Kolkata" -> "Kolkata, GMT+5:30"; "America/Argentina/Salta" -> "Argentina, Salta, GMT-3" */
function label(zone: string): string {
  const place = zone.split('/').slice(1).join(', ').replaceAll('_', ' ') || zone;
  return `${place}, ${DateTime.now().setZone(zone).toFormat("'GMT'Z")}`;
}

function groupByRegion(zones: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const region = zone.includes('/') ? zone.split('/')[0]! : 'Other';
    groups.set(region, [...(groups.get(region) ?? []), zone]);
  }
  return [...groups.entries()];
}

/** The current time, refreshed every minute. */
function useNow() {
  const [now, setNow] = useState(DateTime.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(DateTime.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * File: src/sessions/SessionSummary.tsx
 *
 * The details block on confirmation screens: who, when (your time and theirs, with their weekday
 * when it is a different date for them), how long.
 */
import { firstName } from '../lib/names';
import { cityOf, formatDateTime, theirClock } from '../lib/time';

interface Props {
  withName: string;
  startAt: string;
  yourTimezone: string;
  theirTimezone: string;
  previousStartAt?: string;
}

export function SessionSummary({ withName, startAt, yourTimezone, theirTimezone, previousStartAt }: Props) {
  return (
    <dl className="summary">
      <div>
        <dt>With</dt>
        <dd>{withName}</dd>
      </div>
      {previousStartAt && (
        <div>
          <dt>Was</dt>
          <dd className="strike">{formatDateTime(previousStartAt, yourTimezone)}</dd>
        </div>
      )}
      <div>
        <dt>{previousStartAt ? 'Now' : 'When'}</dt>
        <dd>
          {formatDateTime(startAt, yourTimezone)}
          <span className="summary-sub">Your time, {cityOf(yourTimezone)}</span>
          {theirTimezone !== yourTimezone && (
            <span className="summary-sub">
              {theirClock(startAt, theirTimezone, yourTimezone)} for {firstName(withName)} in {cityOf(theirTimezone)}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>Length</dt>
        <dd>50 minutes</dd>
      </div>
    </dl>
  );
}

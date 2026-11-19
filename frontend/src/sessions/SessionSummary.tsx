/**
 * File: src/sessions/SessionSummary.tsx
 *
 * The details block on confirmation screens: who, when (your time and theirs), how long.
 */
import { cityOf, formatDateTime, formatTime } from '../lib/time';

interface Props {
  withName: string;
  startAt: string;
  yourTimezone: string;
  theirTimezone?: string;
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
          {theirTimezone && theirTimezone !== yourTimezone && (
            <span className="summary-sub">
              {formatTime(startAt, theirTimezone)} for {withName.split(' ')[0]} in {cityOf(theirTimezone)}
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

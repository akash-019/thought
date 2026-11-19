/**
 * File: test/unit/rules-and-reminders.test.ts
 *
 * Unit tests: the 24-hour rule, booking time checks, reminder planning and delivery decisions.
 */
import { describe, expect, it } from 'vitest';
import { bookingTimeProblem, memberCanChange } from '../../src/booking/rules.js';
import { decideDelivery, planReminders } from '../../src/reminders/reminders.js';

const d = (s: string) => new Date(s);
const START = d('2027-01-10T15:00:00Z');

describe('24-hour change rule for members', () => {
  it('allows a change exactly 24 hours before the start', () => {
    expect(memberCanChange(START, d('2027-01-09T15:00:00Z'))).toBe(true);
  });

  it('blocks a change one second inside the 24 hours', () => {
    expect(memberCanChange(START, d('2027-01-09T15:00:01Z'))).toBe(false);
  });

  it('allows well before, blocks after start', () => {
    expect(memberCanChange(START, d('2027-01-01T00:00:00Z'))).toBe(true);
    expect(memberCanChange(START, d('2027-01-10T16:00:00Z'))).toBe(false);
  });

  it('counts real hours across a DST change, not calendar days', () => {
    // New York springs forward on 2027-03-14. 09:00 EDT Monday 03-15 = 13:00Z.
    // 09:00 EST Sunday 03-14 local is 14:00Z, only 23 real hours before: blocked.
    const start = d('2027-03-15T13:00:00Z');
    expect(memberCanChange(start, d('2027-03-14T14:00:00Z'))).toBe(false);
    expect(memberCanChange(start, d('2027-03-14T13:00:00Z'))).toBe(true);
  });
});

describe('bookingTimeProblem', () => {
  const now = d('2027-01-10T12:00:00Z');
  it('rejects past and current times', () => {
    expect(bookingTimeProblem(d('2027-01-10T11:00:00Z'), now, 0)).toBe('IN_PAST');
    expect(bookingTimeProblem(now, now, 0)).toBe('IN_PAST');
  });
  it('applies the minimum notice', () => {
    expect(bookingTimeProblem(d('2027-01-10T13:00:00Z'), now, 120)).toBe('TOO_SOON');
    expect(bookingTimeProblem(d('2027-01-10T14:00:00Z'), now, 120)).toBeNull();
    expect(bookingTimeProblem(d('2027-01-10T13:00:00Z'), now, 0)).toBeNull();
  });
});

describe('planReminders', () => {
  const session = { memberId: 'm1', professionalId: 'p1', startAt: START };

  it('booked days ahead: 24h and 1h reminders for both people', () => {
    const r = planReminders(session, d('2027-01-05T00:00:00Z'));
    expect(r).toEqual([
      { userId: 'm1', kind: '24h', fireAt: d('2027-01-09T15:00:00Z') },
      { userId: 'p1', kind: '24h', fireAt: d('2027-01-09T15:00:00Z') },
      { userId: 'm1', kind: '1h', fireAt: d('2027-01-10T14:00:00Z') },
      { userId: 'p1', kind: '1h', fireAt: d('2027-01-10T14:00:00Z') },
    ]);
  });

  it('booked 3 hours ahead: the 24h reminder time has passed, so only 1h reminders', () => {
    const r = planReminders(session, d('2027-01-10T12:00:00Z'));
    expect(r.map((x) => x.kind)).toEqual(['1h', '1h']);
  });

  it('booked 30 minutes ahead: no reminders', () => {
    expect(planReminders(session, d('2027-01-10T14:30:00Z'))).toEqual([]);
  });

  it('a reminder due exactly now counts as passed', () => {
    expect(planReminders(session, d('2027-01-10T14:00:00Z'))).toEqual([]);
  });
});

describe('decideDelivery', () => {
  it('delivers before the session starts', () => {
    expect(decideDelivery('booked', START, d('2027-01-10T14:00:05Z'))).toBe('deliver');
  });
  it('expires when the worker catches up after the session started', () => {
    expect(decideDelivery('booked', START, d('2027-01-10T15:00:00Z'))).toBe('expire');
  });
  it('cancels for a session that is no longer booked', () => {
    expect(decideDelivery('cancelled', START, d('2027-01-10T14:00:00Z'))).toBe('cancel');
    expect(decideDelivery('rescheduled', START, d('2027-01-10T14:00:00Z'))).toBe('cancel');
  });
});

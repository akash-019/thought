import { describe, expect, it } from 'vitest';
import type { WeeklyRule } from '../../src/domain/availability.js';
import {
  generateSlots,
  groupByLocalDate,
  isOfferedSlot,
  localTimeToInstant,
  type SlotQuery,
} from '../../src/domain/slots.js';

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());
const d = (s: string) => new Date(s);

/** Slots for one whole local day window, with "now" far in the past so nothing is filtered by time. */
function slotsBetween(rules: WeeklyRule[], timezone: string, from: string, to: string, extra: Partial<SlotQuery> = {}) {
  return iso(generateSlots({ rules, timezone, from: d(from), to: d(to), earliestStart: d('2000-01-01T00:00:00Z'), ...extra }));
}

// 2027-01-04 is a Monday.
const MON_9_TO_12: WeeklyRule[] = [{ weekday: 1, start: '09:00', end: '12:00' }];

describe('slot layout', () => {
  it('lays hourly 50-minute slots inside working hours; the last slot must finish by the end', () => {
    expect(slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z')).toEqual([
      '2027-01-04T09:00:00.000Z',
      '2027-01-04T10:00:00.000Z',
      '2027-01-04T11:00:00.000Z', // 11:00-11:50 fits before 12:00
    ]);
  });

  it('drops a final slot that would run past the end of the range', () => {
    const rules = [{ weekday: 1, start: '09:00', end: '11:40' }];
    expect(slotsBetween(rules, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z')).toEqual([
      '2027-01-04T09:00:00.000Z',
      '2027-01-04T10:00:00.000Z',
    ]);
  });

  it('offers nothing for a range shorter than one session', () => {
    const rules = [{ weekday: 1, start: '09:00', end: '09:45' }];
    expect(slotsBetween(rules, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z')).toEqual([]);
  });

  it('handles split days, off-hour starts and a 24:00 end', () => {
    const rules = [
      { weekday: 1, start: '09:30', end: '11:30' },
      { weekday: 1, start: '22:00', end: '24:00' },
    ];
    expect(slotsBetween(rules, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z')).toEqual([
      '2027-01-04T09:30:00.000Z',
      '2027-01-04T10:30:00.000Z',
      '2027-01-04T22:00:00.000Z',
      '2027-01-04T23:00:00.000Z',
    ]);
  });

  it('repeats weekly and skips days without hours', () => {
    const slots = slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T00:00:00Z', '2027-01-18T00:00:00Z');
    expect(slots).toHaveLength(6);
    expect(slots[3]).toBe('2027-01-11T09:00:00.000Z');
  });
});

describe('filtering', () => {
  it('never offers slots that start before the earliest allowed start (the past)', () => {
    const slots = slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z', {
      earliestStart: d('2027-01-04T09:00:01Z'), // 09:00 has just started
    });
    expect(slots).toEqual(['2027-01-04T10:00:00.000Z', '2027-01-04T11:00:00.000Z']);
  });

  it('removes slots that overlap an existing booking, including off-grid ones', () => {
    const slots = slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z', {
      busy: [
        { start: d('2027-01-04T09:00:00Z'), end: d('2027-01-04T09:50:00Z') },
        // A session left over from an older schedule, overlapping 11:00 only by 10 minutes.
        { start: d('2027-01-04T10:20:00Z'), end: d('2027-01-04T11:10:00Z') },
      ],
    });
    expect(slots).toEqual([]);
  });

  it('a booking that ends exactly when a slot starts does not block it', () => {
    const slots = slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T00:00:00Z', '2027-01-05T00:00:00Z', {
      busy: [{ start: d('2027-01-04T08:10:00Z'), end: d('2027-01-04T09:00:00Z') }],
    });
    expect(slots[0]).toBe('2027-01-04T09:00:00.000Z');
  });

  it('skips blocked dates (in the professional’s timezone)', () => {
    const slots = slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T00:00:00Z', '2027-01-12T00:00:00Z', {
      blockedDates: ['2027-01-04'],
    });
    expect(slots).toEqual(['2027-01-11T09:00:00.000Z', '2027-01-11T10:00:00.000Z', '2027-01-11T11:00:00.000Z']);
  });

  it('respects the [from, to) window exactly', () => {
    expect(slotsBetween(MON_9_TO_12, 'UTC', '2027-01-04T10:00:00Z', '2027-01-04T11:00:00Z')).toEqual([
      '2027-01-04T10:00:00.000Z',
    ]);
  });
});

describe('timezones', () => {
  it('uses the professional’s timezone: 09:00 in Kolkata (UTC+5:30) is 03:30 UTC', () => {
    expect(slotsBetween(MON_9_TO_12, 'Asia/Kolkata', '2027-01-03T00:00:00Z', '2027-01-05T00:00:00Z')).toEqual([
      '2027-01-04T03:30:00.000Z',
      '2027-01-04T04:30:00.000Z',
      '2027-01-04T05:30:00.000Z',
    ]);
  });

  it('finds slots whose local date differs from the UTC date at the window edge', () => {
    // Monday 09:00 in Auckland (UTC+13 in January) is Sunday 20:00 UTC.
    expect(slotsBetween(MON_9_TO_12, 'Pacific/Auckland', '2027-01-03T00:00:00Z', '2027-01-04T00:00:00Z')).toEqual([
      '2027-01-03T20:00:00.000Z',
      '2027-01-03T21:00:00.000Z',
      '2027-01-03T22:00:00.000Z',
    ]);
  });

  it('groups slots by the member’s local date: a Kolkata Monday morning is Sunday evening in Los Angeles', () => {
    const slots = generateSlots({
      rules: MON_9_TO_12,
      timezone: 'Asia/Kolkata',
      from: d('2027-01-03T00:00:00Z'),
      to: d('2027-01-05T00:00:00Z'),
      earliestStart: d('2000-01-01T00:00:00Z'),
    });
    expect(groupByLocalDate(slots, 'America/Los_Angeles')).toEqual([
      {
        date: '2027-01-03',
        slots: [
          { startAt: '2027-01-04T03:30:00.000Z', localTime: '19:30' },
          { startAt: '2027-01-04T04:30:00.000Z', localTime: '20:30' },
          { startAt: '2027-01-04T05:30:00.000Z', localTime: '21:30' },
        ],
      },
    ]);
  });
});

describe('daylight saving time', () => {
  const NY = 'America/New_York';

  it('keeps 09:00 local across the spring change: the UTC time moves by an hour', () => {
    const rules = [
      { weekday: 5, start: '09:00', end: '10:00' }, // Friday before the change
      { weekday: 1, start: '09:00', end: '10:00' }, // Monday after
    ];
    // US clocks spring forward on Sunday 2027-03-14.
    expect(slotsBetween(rules, NY, '2027-03-12T00:00:00Z', '2027-03-16T00:00:00Z')).toEqual([
      '2027-03-12T14:00:00.000Z', // 09:00 EST (UTC-5)
      '2027-03-15T13:00:00.000Z', // 09:00 EDT (UTC-4)
    ]);
  });

  it('spring forward: skips the local hour that does not exist', () => {
    const rules = [{ weekday: 7, start: '00:00', end: '05:00' }];
    // 02:00-02:59 does not exist in New York on 2027-03-14.
    expect(slotsBetween(rules, NY, '2027-03-14T00:00:00Z', '2027-03-15T00:00:00Z')).toEqual([
      '2027-03-14T05:00:00.000Z', // 00:00 EST
      '2027-03-14T06:00:00.000Z', // 01:00 EST
      '2027-03-14T07:00:00.000Z', // 03:00 EDT
      '2027-03-14T08:00:00.000Z', // 04:00 EDT
    ]);
  });

  it('fall back: a repeated local hour gets one slot, at its first occurrence', () => {
    const rules = [{ weekday: 7, start: '00:00', end: '04:00' }];
    // New York clocks go from 02:00 EDT back to 01:00 EST on Sunday 2027-11-07.
    expect(slotsBetween(rules, NY, '2027-11-07T00:00:00Z', '2027-11-08T00:00:00Z')).toEqual([
      '2027-11-07T04:00:00.000Z', // 00:00 EDT
      '2027-11-07T05:00:00.000Z', // 01:00 EDT (first 01:00)
      '2027-11-07T07:00:00.000Z', // 02:00 EST
      '2027-11-07T08:00:00.000Z', // 03:00 EST
    ]);
  });

  it('London spring forward (01:00 -> 02:00 on the last Sunday of March)', () => {
    const rules = [{ weekday: 7, start: '00:00', end: '03:00' }];
    expect(slotsBetween(rules, 'Europe/London', '2027-03-28T00:00:00Z', '2027-03-29T00:00:00Z')).toEqual([
      '2027-03-28T00:00:00.000Z', // 00:00 GMT
      '2027-03-28T01:00:00.000Z', // 02:00 BST
    ]);
  });

  it('localTimeToInstant: gap -> null, repeated time -> first occurrence', () => {
    expect(localTimeToInstant({ year: 2027, month: 3, day: 14 }, 150, NY)).toBeNull(); // 02:30
    expect(localTimeToInstant({ year: 2027, month: 11, day: 7 }, 90, NY)!.toUTC().toISO()).toBe(
      '2027-11-07T05:30:00.000Z', // 01:30 EDT, not 01:30 EST (06:30Z)
    );
    expect(localTimeToInstant({ year: 2027, month: 11, day: 7 }, 180, NY)!.toUTC().toISO()).toBe(
      '2027-11-07T08:00:00.000Z', // 03:00 EST: not ambiguous, must not be shifted
    );
  });
});

describe('isOfferedSlot', () => {
  const base = { rules: MON_9_TO_12, timezone: 'UTC', earliestStart: d('2027-01-01T00:00:00Z') };

  it('accepts exactly a generated slot', () => {
    expect(isOfferedSlot(base, d('2027-01-04T10:00:00Z'))).toBe(true);
  });

  it('rejects off-grid times, times outside hours, past times and busy times', () => {
    expect(isOfferedSlot(base, d('2027-01-04T10:15:00Z'))).toBe(false);
    expect(isOfferedSlot(base, d('2027-01-04T13:00:00Z'))).toBe(false);
    expect(isOfferedSlot({ ...base, earliestStart: d('2027-01-04T10:30:00Z') }, d('2027-01-04T10:00:00Z'))).toBe(false);
    expect(
      isOfferedSlot(
        { ...base, busy: [{ start: d('2027-01-04T10:00:00Z'), end: d('2027-01-04T10:50:00Z') }] },
        d('2027-01-04T10:00:00Z'),
      ),
    ).toBe(false);
  });
});

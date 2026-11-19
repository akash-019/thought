import { describe, expect, it } from 'vitest';
import { parseHHMM, validateWeeklyRules } from '../../src/domain/availability.js';

describe('parseHHMM', () => {
  it('parses valid times to minutes since midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('24:00')).toBe(1440);
  });

  it('rejects malformed times', () => {
    for (const bad of ['9:00', '24:01', '25:00', '12:60', 'noon', '', '12:00:00']) {
      expect(parseHHMM(bad)).toBeNull();
    }
  });
});

describe('validateWeeklyRules', () => {
  it('accepts a normal week and sorts it', () => {
    const result = validateWeeklyRules([
      { weekday: 3, start: '13:00', end: '17:00' },
      { weekday: 1, start: '09:00', end: '17:00' },
      { weekday: 3, start: '09:00', end: '12:00' },
    ]);
    expect(result).toEqual({
      ok: true,
      rules: [
        { weekday: 1, start: '09:00', end: '17:00' },
        { weekday: 3, start: '09:00', end: '12:00' },
        { weekday: 3, start: '13:00', end: '17:00' },
      ],
    });
  });

  it('accepts an empty schedule (professional not taking bookings)', () => {
    expect(validateWeeklyRules([])).toEqual({ ok: true, rules: [] });
  });

  it('allows 24:00 as an end but not as a start', () => {
    expect(validateWeeklyRules([{ weekday: 5, start: '20:00', end: '24:00' }]).ok).toBe(true);
    expect(validateWeeklyRules([{ weekday: 5, start: '24:00', end: '24:00' }]).ok).toBe(false);
  });

  it('rejects end before or equal to start (no overnight ranges)', () => {
    const r = validateWeeklyRules([{ weekday: 1, start: '22:00', end: '02:00' }]);
    expect(r.ok).toBe(false);
    expect(validateWeeklyRules([{ weekday: 1, start: '10:00', end: '10:00' }]).ok).toBe(false);
  });

  it('rejects overlapping ranges on the same day but allows touching ones', () => {
    expect(
      validateWeeklyRules([
        { weekday: 2, start: '09:00', end: '12:00' },
        { weekday: 2, start: '11:00', end: '14:00' },
      ]).ok,
    ).toBe(false);
    expect(
      validateWeeklyRules([
        { weekday: 2, start: '09:00', end: '12:00' },
        { weekday: 2, start: '12:00', end: '14:00' },
      ]).ok,
    ).toBe(true);
  });

  it('rejects bad weekdays and malformed times', () => {
    expect(validateWeeklyRules([{ weekday: 0, start: '09:00', end: '10:00' }]).ok).toBe(false);
    expect(validateWeeklyRules([{ weekday: 8, start: '09:00', end: '10:00' }]).ok).toBe(false);
    expect(validateWeeklyRules([{ weekday: 1, start: '9am', end: '10:00' }]).ok).toBe(false);
  });
});

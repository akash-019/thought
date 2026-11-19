/**
 * File: test/unit/weekly-hours.test.ts
 *
 * Unit tests: reading "HH:MM" times and checking weekly working hours.
 */
import { describe, expect, it } from 'vitest';
import { findScheduleProblem, sortRules, toMinutes } from '../../src/availability/weekly-hours.js';

describe('toMinutes', () => {
  it('turns valid times into minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('24:00')).toBe(1440);
  });

  it('returns null for anything else', () => {
    for (const bad of ['9:00', '24:01', '25:00', '12:60', 'noon', '', '12:00:00']) {
      expect(toMinutes(bad)).toBeNull();
    }
  });
});

describe('findScheduleProblem', () => {
  it('accepts a normal week, split days and an empty schedule', () => {
    expect(
      findScheduleProblem([
        { weekday: 1, start: '09:00', end: '17:00' },
        { weekday: 3, start: '09:00', end: '12:00' },
        { weekday: 3, start: '13:00', end: '17:00' },
      ]),
    ).toBeNull();
    expect(findScheduleProblem([])).toBeNull();
  });

  it('allows 24:00 as an end but not as a start', () => {
    expect(findScheduleProblem([{ weekday: 5, start: '20:00', end: '24:00' }])).toBeNull();
    expect(findScheduleProblem([{ weekday: 5, start: '24:00', end: '24:00' }])).toMatch(/Invalid start/);
  });

  it('rejects end before or equal to start (no overnight ranges)', () => {
    expect(findScheduleProblem([{ weekday: 1, start: '22:00', end: '02:00' }])).toMatch(/end must be after start/);
    expect(findScheduleProblem([{ weekday: 1, start: '10:00', end: '10:00' }])).toMatch(/end must be after start/);
  });

  it('rejects overlapping ranges on the same day but allows touching ones', () => {
    const overlap = [
      { weekday: 2, start: '11:00', end: '14:00' },
      { weekday: 2, start: '09:00', end: '12:00' },
    ];
    expect(findScheduleProblem(overlap)).toMatch(/overlaps/);
    const touching = [
      { weekday: 2, start: '09:00', end: '12:00' },
      { weekday: 2, start: '12:00', end: '14:00' },
    ];
    expect(findScheduleProblem(touching)).toBeNull();
  });

  it('rejects bad weekdays and malformed times', () => {
    expect(findScheduleProblem([{ weekday: 0, start: '09:00', end: '10:00' }])).toMatch(/Weekday/);
    expect(findScheduleProblem([{ weekday: 8, start: '09:00', end: '10:00' }])).toMatch(/Weekday/);
    expect(findScheduleProblem([{ weekday: 1, start: '9am', end: '10:00' }])).toMatch(/Invalid start/);
  });
});

it('sortRules orders by weekday then start time', () => {
  expect(
    sortRules([
      { weekday: 3, start: '13:00', end: '17:00' },
      { weekday: 1, start: '09:00', end: '17:00' },
      { weekday: 3, start: '09:00', end: '12:00' },
    ]).map((r) => `${r.weekday} ${r.start}`),
  ).toEqual(['1 09:00', '3 09:00', '3 13:00']);
});

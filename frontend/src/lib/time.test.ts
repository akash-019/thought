/**
 * File: src/lib/time.test.ts
 *
 * Tests: showing times in the right timezone, including when the date differs between two people.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityOf, clocksDiffer, dayLabel, formatDateTime, formatTime, theirClock, theirDateIfDifferent } from './time';

// Friday 20 Nov 2026, 01:00 in Singapore = Thursday 19 Nov, 12:00 in New York.
const START = '2026-11-19T17:00:00.000Z';

describe('formatting in a given timezone', () => {
  it('uses the timezone it is given, not the computer’s', () => {
    expect(formatTime(START, 'Asia/Singapore')).toBe('01:00');
    expect(formatTime(START, 'America/New_York')).toBe('12:00');
    expect(formatDateTime(START, 'Asia/Singapore')).toBe('Friday 20 November, 01:00');
  });

  it('handles half-hour offsets', () => {
    expect(formatTime(START, 'Asia/Kolkata')).toBe('22:30');
  });

  it('turns a timezone into a readable city', () => {
    expect(cityOf('America/Los_Angeles')).toBe('Los Angeles');
    expect(cityOf('Asia/Kolkata')).toBe('Kolkata');
  });
});

describe('the other person’s time', () => {
  it('adds their date only when it is a different day for them', () => {
    expect(theirClock(START, 'America/New_York', 'Asia/Singapore')).toBe('Thu 19 Nov, 12:00');
    expect(theirClock(START, 'Asia/Tokyo', 'Asia/Singapore')).toBe('02:00'); // Friday for both
    expect(theirClock(START, 'Asia/Kolkata', 'Asia/Singapore')).toBe('Thu 19 Nov, 22:30'); // still Thursday in Kolkata
  });

  it('theirDateIfDifferent returns null on the same date', () => {
    expect(theirDateIfDifferent(START, 'America/New_York', 'Asia/Singapore')).toBe('Thu 19 Nov');
    expect(theirDateIfDifferent(START, 'Asia/Tokyo', 'Asia/Singapore')).toBeNull();
  });

  it('clocksDiffer is false for two zones that show the same time', () => {
    expect(clocksDiffer(START, 'Asia/Singapore', 'Asia/Shanghai')).toBe(false);
    expect(clocksDiffer(START, 'Asia/Singapore', 'Europe/London')).toBe(true);
  });
});

describe('dayLabel', () => {
  afterEach(() => vi.useRealTimers());

  it('says Today, Tomorrow or In N days, counted in the user’s own calendar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T02:00:00Z')); // Thursday 10:00 in Singapore
    expect(dayLabel('2026-11-19T10:00:00Z', 'Asia/Singapore')).toBe('Today');
    expect(dayLabel('2026-11-20T10:00:00Z', 'Asia/Singapore')).toBe('Tomorrow');
    expect(dayLabel('2026-11-23T10:00:00Z', 'Asia/Singapore')).toBe('In 4 days');
  });
});

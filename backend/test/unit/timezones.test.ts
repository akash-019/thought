/**
 * File: test/unit/timezones.test.ts
 *
 * Unit tests: the timezone list offered at sign-up uses current city names.
 */
import { describe, expect, it } from 'vitest';
import { isValidTimezone, TIMEZONES } from '../../src/common/timezones.js';

describe('timezone list', () => {
  it('uses current names, so people can find their city', () => {
    for (const zone of ['Asia/Kolkata', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh', 'America/New_York', 'UTC']) {
      expect(TIMEZONES).toContain(zone);
    }
    expect(TIMEZONES).not.toContain('Asia/Calcutta');
    expect(TIMEZONES).not.toContain('Europe/Kiev');
  });

  it('has no duplicates and every entry is valid', () => {
    expect(new Set(TIMEZONES).size).toBe(TIMEZONES.length);
    expect(TIMEZONES.every(isValidTimezone)).toBe(true);
  });

  it('still accepts old names (e.g. from a browser) when signing up', () => {
    expect(isValidTimezone('Asia/Calcutta')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
  });
});

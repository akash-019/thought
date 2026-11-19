/**
 * File: src/availability/preview.test.ts
 *
 * Tests: the weekly-hours preview lays out sessions exactly like the backend
 * (50-minute sessions starting every hour, the last one must end by the end of the range).
 */
import { describe, expect, it } from 'vitest';
import { addHours, previewSessions } from './preview';

describe('previewSessions', () => {
  it('lists hourly start times that fit inside the range', () => {
    expect(previewSessions({ weekday: 1, start: '09:00', end: '13:00' })).toBe('4 sessions: 09:00, 10:00, 11:00, 12:00');
    expect(previewSessions({ weekday: 1, start: '09:00', end: '12:30' })).toBe('3 sessions: 09:00, 10:00, 11:00');
    expect(previewSessions({ weekday: 1, start: '09:30', end: '10:20' })).toBe('1 session: 09:30');
  });

  it('explains ranges that give no sessions', () => {
    expect(previewSessions({ weekday: 1, start: '09:00', end: '09:45' })).toBe('Too short for a 50-minute session.');
    expect(previewSessions({ weekday: 1, start: '12:00', end: '09:00' })).toBe('End must be after start.');
  });
});

describe('addHours', () => {
  it('adds hours but never goes past 23:55', () => {
    expect(addHours('09:00', 4)).toBe('13:00');
    expect(addHours('21:00', 4)).toBe('23:55');
  });
});

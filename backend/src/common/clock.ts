/**
 * File: src/common/clock.ts
 *
 * Time helpers. A Clock is the only way code asks "what time is it now?": production uses the
 * system clock, tests use fixedClock to test time rules (24h rule, reminders) exactly.
 * Business rules must never call `new Date()` directly.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(at: Date | string): Clock & { set(at: Date | string): void } {
  let current = new Date(at);
  return {
    now: () => new Date(current),
    set(next) {
      current = new Date(next);
    },
  };
}

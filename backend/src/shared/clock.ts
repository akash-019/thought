/**
 * File: src/shared/clock.ts
 *
 * The Clock abstraction: the only way code asks "what time is it now?".
 * Production uses the system clock; tests use fixedClock to test time rules (24h rule, reminders) exactly.
 */


/**
 * All "what time is it now" questions go through a Clock so tests can pin time.
 * Business rules (24h rule, past slots, reminder times) must never call `new Date()` directly.
 */
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

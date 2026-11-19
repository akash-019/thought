/**
 * File: src/shared/timezones.ts
 *
 * The list of IANA timezones users can choose at sign-up, and a validator for them.
 */
import { IANAZone } from 'luxon';

/** IANA timezone names users can pick at sign-up. `Intl` leaves out plain "UTC", so it is added. */
export const TIMEZONES: readonly string[] = ['UTC', ...Intl.supportedValuesOf('timeZone')];

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

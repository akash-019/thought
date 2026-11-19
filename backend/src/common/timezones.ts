/**
 * File: src/common/timezones.ts
 *
 * The list of IANA timezones users can choose at sign-up, and a validator for them.
 */
import { IANAZone } from 'luxon';

/**
 * Node's built-in list still uses some old names ("Asia/Calcutta", "Europe/Kiev"), so people
 * searching for "Kolkata" or "Kyiv" would not find their city. Both names work everywhere;
 * we offer the current one.
 */
const RENAMED: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Louisville': 'America/Kentucky/Louisville',
};

/** IANA timezone names users can pick at sign-up (current names, sorted). "UTC" is added. */
export const TIMEZONES: readonly string[] = [
  'UTC',
  ...[...new Set(Intl.supportedValuesOf('timeZone').map((zone) => RENAMED[zone] ?? zone))]
    .filter((zone) => IANAZone.isValidZone(zone))
    .sort(),
];

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

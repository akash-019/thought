/**
 * File: src/modules/availability/availability.schema.ts
 *
 * Request validation (zod) for the availability routes. The deeper checks on working hours
 * (overlaps, end after start) are in weekly-hours.ts.
 */
import { DateTime } from 'luxon';
import { z } from 'zod';

export const weeklyHoursSchema = z.object({
  rules: z.array(z.object({ weekday: z.number().int(), start: z.string(), end: z.string() })),
});

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid;

export const blockedDatesSchema = z.object({
  dates: z.array(z.string().refine(isDate, 'Dates must be YYYY-MM-DD.')).max(366),
});

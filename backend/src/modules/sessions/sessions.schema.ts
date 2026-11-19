/**
 * File: src/modules/sessions/sessions.schema.ts
 *
 * Request validation (zod) for the session routes.
 */
import { z } from 'zod';

/** An ISO 8601 date-time with a timezone offset, e.g. "2027-01-06T10:00:00Z", turned into a Date. */
const dateTime = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const bookSessionSchema = z.object({
  // Ids are numbers (sent as a string or a number); anything else is rejected before it reaches the database.
  professionalId: z.coerce.string().regex(/^\d+$/, 'Invalid professional id.'),
  startAt: dateTime,
});

export const rescheduleSessionSchema = z.object({
  startAt: dateTime,
});

export const listSessionsSchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});

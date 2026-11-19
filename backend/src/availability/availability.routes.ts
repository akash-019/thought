/**
 * File: src/availability/availability.routes.ts
 *
 * Routes for professionals to manage their own availability:
 * - GET/PUT /me/availability   weekly working hours
 * - GET/PUT /me/blocked-dates  whole days off (holidays)
 * Saving replaces the whole list. Sessions that are already booked are never touched.
 */
import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireRole } from '../auth/auth.middleware.js';
import { AvailabilityRuleEntity, BlockedDateEntity } from '../db/entities.js';
import { badRequest } from '../shared/errors.js';
import { findScheduleProblem, loadBlockedDates, loadWeeklyRules, sortRules } from './weekly-hours.js';

const hoursSchema = z.object({
  rules: z.array(z.object({ weekday: z.number().int(), start: z.string(), end: z.string() })),
});

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid;
const blockedSchema = z.object({
  dates: z.array(z.string().refine(isDate, 'Dates must be YYYY-MM-DD.')).max(366),
});

export function availabilityRoutes({ db }: AppDeps): Router {
  const router = Router();

  router.get('/me/availability', async (req, res) => {
    const pro = requireRole(req, 'professional');
    res.json({ timezone: pro.timezone, rules: await loadWeeklyRules(db.manager, pro.id) });
  });

  router.put('/me/availability', async (req, res) => {
    const pro = requireRole(req, 'professional');
    const { rules } = hoursSchema.parse(req.body);
    const problem = findScheduleProblem(rules);
    if (problem) throw badRequest('INVALID_AVAILABILITY', problem);

    await db.transaction(async (m) => {
      await m.delete(AvailabilityRuleEntity, { professionalId: pro.id });
      for (const r of rules) {
        await m.insert(AvailabilityRuleEntity, { professionalId: pro.id, weekday: r.weekday, startLocal: r.start, endLocal: r.end });
      }
    });
    res.json({ timezone: pro.timezone, rules: sortRules(rules) });
  });

  router.get('/me/blocked-dates', async (req, res) => {
    const pro = requireRole(req, 'professional');
    res.json({ dates: await loadBlockedDates(db.manager, pro.id) });
  });

  router.put('/me/blocked-dates', async (req, res) => {
    const pro = requireRole(req, 'professional');
    const dates = [...new Set(blockedSchema.parse(req.body).dates)].sort();

    await db.transaction(async (m) => {
      await m.delete(BlockedDateEntity, { professionalId: pro.id });
      for (const localDate of dates) {
        await m.insert(BlockedDateEntity, { professionalId: pro.id, localDate });
      }
    });
    res.json({ dates });
  });

  return router;
}

/**
 * File: src/modules/availability/availability.routes.ts
 *
 * Routes for professionals to manage their own availability:
 * - GET/PUT /me/availability   weekly working hours
 * - GET/PUT /me/blocked-dates  whole days off (holidays)
 * Saving replaces the whole list. Sessions that are already booked are never touched.
 */
import { Router } from 'express';
import { AvailabilityRuleEntity } from './availability-rule.model.js';
import { blockedDatesSchema, weeklyHoursSchema } from './availability.schema.js';
import { BlockedDateEntity } from './blocked-date.model.js';
import { findScheduleProblem, loadBlockedDates, loadWeeklyRules, sortRules } from './weekly-hours.js';
import { requireRole } from '../auth/auth.middleware.js';
import type { AppDeps } from '../../app.js';
import { badRequest } from '../../common/errors.js';

export function availabilityRoutes({ db }: AppDeps): Router {
  const router = Router();

  router.get('/me/availability', async (req, res) => {
    const pro = requireRole(req, 'professional');
    res.json({ timezone: pro.timezone, rules: await loadWeeklyRules(db.manager, pro.id) });
  });

  router.put('/me/availability', async (req, res) => {
    const pro = requireRole(req, 'professional');
    const { rules } = weeklyHoursSchema.parse(req.body);
    const problem = findScheduleProblem(rules);
    if (problem) throw badRequest('INVALID_AVAILABILITY', problem);

    await db.transaction(async (tx) => {
      await tx.delete(AvailabilityRuleEntity, { professionalId: pro.id });
      for (const r of rules) {
        await tx.insert(AvailabilityRuleEntity, { professionalId: pro.id, weekday: r.weekday, startLocal: r.start, endLocal: r.end });
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
    const dates = [...new Set(blockedDatesSchema.parse(req.body).dates)].sort();

    await db.transaction(async (tx) => {
      await tx.delete(BlockedDateEntity, { professionalId: pro.id });
      for (const localDate of dates) {
        await tx.insert(BlockedDateEntity, { professionalId: pro.id, localDate });
      }
    });
    res.json({ dates });
  });

  return router;
}

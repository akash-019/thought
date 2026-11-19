/**
 * File: src/booking/professionals.routes.ts
 *
 * Routes for members to find a professional:
 * - GET /professionals            the list
 * - GET /professionals/:id        one profile
 * - GET /professionals/:id/slots  free slots for the next 4 weeks, in the member's timezone
 * Only public profile fields are returned, and slots never reveal who booked other times.
 */
import { Router } from 'express';
import { LessThan, MoreThan } from 'typeorm';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireRole, requireUser } from '../auth/auth.middleware.js';
import { BOOKING_WINDOW_DAYS, generateSlots, groupByLocalDate } from '../availability/slots.js';
import { loadBlockedDates, loadWeeklyRules } from '../availability/weekly-hours.js';
import { SessionEntity, UserEntity, type User } from '../db/entities.js';
import { notFound } from '../shared/errors.js';

const idSchema = z.object({ id: z.string().regex(/^\d+$/, 'Invalid id.') });

/** Public profile: never the email or anything about bookings. */
const publicProfile = (u: User) => ({ id: u.id, name: u.name, bio: u.bio, timezone: u.timezone });

export function professionalRoutes({ db, clock, settings }: AppDeps): Router {
  const router = Router();

  async function findProfessional(id: string) {
    const pro = await db.manager.findOneBy(UserEntity, { id, role: 'professional' });
    if (!pro) throw notFound('Professional not found.');
    return pro;
  }

  router.get('/professionals', async (req, res) => {
    requireUser(req);
    const pros = await db.manager.find(UserEntity, { where: { role: 'professional' }, order: { name: 'ASC' } });
    res.json({ professionals: pros.map(publicProfile) });
  });

  router.get('/professionals/:id', async (req, res) => {
    requireUser(req);
    res.json({ professional: publicProfile(await findProfessional(idSchema.parse(req.params).id)) });
  });

  router.get('/professionals/:id/slots', async (req, res) => {
    const member = requireRole(req, 'member');
    const pro = await findProfessional(idSchema.parse(req.params).id);
    const from = clock.now();
    const to = new Date(from.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);

    // Busy times: this professional's bookings, plus the member's own bookings with anyone
    // (the member could not book an overlapping slot anyway, so it is not shown as free).
    const overlapsWindow = { status: 'booked' as const, endAt: MoreThan(from), startAt: LessThan(to) };
    const busy = await db.manager.find(SessionEntity, {
      where: [
        { professionalId: pro.id, ...overlapsWindow },
        { memberId: member.id, ...overlapsWindow },
      ],
    });

    const slots = generateSlots({
      rules: await loadWeeklyRules(db.manager, pro.id),
      timezone: pro.timezone,
      blockedDates: await loadBlockedDates(db.manager, pro.id),
      busy: busy.map((s) => ({ start: s.startAt, end: s.endAt })),
      from,
      to,
      earliestStart: new Date(from.getTime() + settings.minNoticeMinutes * 60_000),
    });

    res.json({
      timezone: member.timezone, // times below are grouped and labelled in the member's timezone
      professionalTimezone: pro.timezone,
      days: groupByLocalDate(slots, member.timezone),
    });
  });

  return router;
}

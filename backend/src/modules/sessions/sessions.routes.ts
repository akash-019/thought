/**
 * File: src/modules/sessions/sessions.routes.ts
 *
 * Routes for sessions:
 * - POST /sessions                  book a slot (members)
 * - GET  /sessions?scope=upcoming   my upcoming sessions (or scope=past)
 * - GET  /sessions/:id              one of my sessions
 * - POST /sessions/:id/cancel       cancel (members: 24h+ ahead; professionals: any time)
 * - POST /sessions/:id/reschedule   move to another slot (members: 24h+ ahead)
 * Every query is filtered by the caller's own id, so nobody can see someone else's sessions.
 */
import { Router } from 'express';
import { LessThanOrEqual, MoreThan, Not } from 'typeorm';
import { bookSession, cancelSession, rescheduleSession } from './booking.js';
import { describeSessions } from './session-view.js';
import { ownedBy, SessionEntity, type Session } from './session.model.js';
import { bookSessionSchema, listSessionsSchema, rescheduleSessionSchema } from './sessions.schema.js';
import { requireRole, requireUser, type AuthUser } from '../auth/auth.middleware.js';
import type { AppDeps } from '../../app.js';
import { notFound } from '../../common/errors.js';
import { idParamSchema } from '../../common/schemas.js';

export function sessionRoutes({ db, clock, settings }: AppDeps): Router {
  const router = Router();

  /** Loads one of the caller's sessions, shaped for the UI. 404 if it is not theirs. */
  async function getOwnSession(user: AuthUser, id: string) {
    const session = await db.manager.findOneBy(SessionEntity, { id, ...ownedBy(user) });
    if (!session) throw notFound('Session not found.');
    const [view] = await describeSessions(db.manager, user, [session], clock.now());
    return view;
  }

  router.post('/sessions', async (req, res) => {
    const member = requireRole(req, 'member');
    const { professionalId, startAt } = bookSessionSchema.parse(req.body);
    const id = await bookSession(db, { member, professionalId, start: startAt, now: clock.now(), settings });
    res.status(201).json({ session: await getOwnSession(member, id) });
  });

  router.get('/sessions', async (req, res) => {
    const user = requireUser(req);
    const { scope } = listSessionsSchema.parse(req.query);
    const now = clock.now();
    const mine = ownedBy(user);

    let sessions: Session[];
    if (scope === 'upcoming') {
      // Booked and not finished yet, soonest first.
      sessions = await db.manager.find(SessionEntity, {
        where: { ...mine, status: 'booked', endAt: MoreThan(now) },
        order: { startAt: 'ASC' },
      });
    } else {
      // Finished, cancelled or rescheduled, most recent first. (Two conditions = "either".)
      sessions = await db.manager.find(SessionEntity, {
        where: [
          { ...mine, status: Not('booked') },
          { ...mine, endAt: LessThanOrEqual(now) },
        ],
        order: { startAt: 'DESC' },
        take: 200,
      });
    }

    res.json({ sessions: await describeSessions(db.manager, user, sessions, now) });
  });

  router.get('/sessions/:id', async (req, res) => {
    const user = requireUser(req);
    res.json({ session: await getOwnSession(user, idParamSchema.parse(req.params).id) });
  });

  router.post('/sessions/:id/cancel', async (req, res) => {
    const user = requireUser(req);
    const { id } = idParamSchema.parse(req.params);
    await cancelSession(db, { user, sessionId: id, now: clock.now() });
    res.json({ session: await getOwnSession(user, id) });
  });

  router.post('/sessions/:id/reschedule', async (req, res) => {
    const member = requireRole(req, 'member');
    const { id } = idParamSchema.parse(req.params);
    const { startAt } = rescheduleSessionSchema.parse(req.body);
    const newId = await rescheduleSession(db, { member, sessionId: id, start: startAt, now: clock.now(), settings });
    res.json({ session: await getOwnSession(member, newId) });
  });

  return router;
}

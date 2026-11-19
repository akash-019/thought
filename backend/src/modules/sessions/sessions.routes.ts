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
import { In, LessThanOrEqual, MoreThan, Not, type EntityManager } from 'typeorm';
import { bookSession, cancelSession, memberCanChange, rescheduleSession } from './booking.js';
import { SessionEntity, type Session } from './session.model.js';
import { bookSessionSchema, listSessionsSchema, rescheduleSessionSchema } from './sessions.schema.js';
import { requireRole, requireUser, type AuthUser } from '../auth/auth.middleware.js';
import { UserEntity } from '../auth/user.model.js';
import type { AppDeps } from '../../app.js';
import { notFound } from '../../common/errors.js';
import { idParamSchema } from '../../common/schemas.js';

/** WHERE condition for "sessions that belong to this user". */
function ownedBy(user: AuthUser) {
  return user.role === 'member' ? { memberId: user.id } : { professionalId: user.id };
}

/**
 * Turns sessions into what the UI shows, from `user`'s point of view: who the session is with,
 * and whether the cancel / reschedule buttons should be enabled.
 */
export async function describeSessions(m: EntityManager, user: AuthUser, sessions: Session[], now: Date) {
  if (sessions.length === 0) return [];
  const isMember = user.role === 'member';
  const otherId = (s: Session) => (isMember ? s.professionalId : s.memberId);
  const others = await m.findBy(UserEntity, { id: In(sessions.map(otherId)) });

  return sessions.map((s) => {
    const other = others.find((u) => u.id === otherId(s))!;
    const active = s.status === 'booked' && s.endAt > now;
    const memberMayChange = isMember && active && memberCanChange(s.startAt, now);
    return {
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      status: s.status,
      cancelledBy: s.cancelledBy,
      // The other person's timezone lets each side see the session in the other's local time too.
      // Members also get the professional's id (to rebook); professionals never get the member's id or email.
      counterpart: isMember
        ? { id: other.id, name: other.name, timezone: other.timezone }
        : { name: other.name, timezone: other.timezone },
      canCancel: active && (!isMember || memberMayChange),
      canReschedule: memberMayChange,
    };
  });
}

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

    const sessions =
      scope === 'upcoming'
        ? // booked and not finished yet, soonest first
          await db.manager.find(SessionEntity, {
            where: { ...mine, status: 'booked', endAt: MoreThan(now) },
            order: { startAt: 'ASC' },
          })
        : // finished, cancelled or rescheduled, most recent first
          await db.manager.find(SessionEntity, {
            where: [
              { ...mine, status: Not('booked') },
              { ...mine, endAt: LessThanOrEqual(now) },
            ],
            order: { startAt: 'DESC' },
            take: 200,
          });

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

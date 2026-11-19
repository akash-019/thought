/**
 * File: src/modules/sessions/session-view.ts
 *
 * How sessions are shown to a user (shared by the session and notification routes): who each
 * session is with, and whether cancel / reschedule are allowed right now.
 */
import { In, type EntityManager } from 'typeorm';
import { memberCanChange } from './booking.js';
import type { Session } from './session.model.js';
import type { AuthUser } from '../auth/auth.middleware.js';
import { UserEntity } from '../auth/user.model.js';

/**
 * Turns sessions into what the UI shows, from `user`'s point of view: who the session is with,
 * and whether the cancel / reschedule buttons should be enabled.
 */
export async function describeSessions(db: EntityManager, user: AuthUser, sessions: Session[], now: Date) {
  if (sessions.length === 0) return [];
  const isMember = user.role === 'member';
  const otherPersonId = (session: Session) => (isMember ? session.professionalId : session.memberId);
  const others = await db.findBy(UserEntity, { id: In(sessions.map(otherPersonId)) });

  return sessions.map((session) => {
    const other = others.find((person) => person.id === otherPersonId(session))!;
    const active = session.status === 'booked' && session.endAt > now;
    const memberMayChange = isMember && active && memberCanChange(session.startAt, now);
    return {
      id: session.id,
      startAt: session.startAt.toISOString(),
      endAt: session.endAt.toISOString(),
      status: session.status,
      cancelledBy: session.cancelledBy,
      // The other person's timezone lets each side see the session in the other's local time too.
      // Members also get the professional's id (to rebook); professionals never get the member's id or email.
      counterpart: isMember
        ? { id: other.id, name: other.name, timezone: other.timezone }
        : { name: other.name, timezone: other.timezone },
      // Members: only 24h+ ahead. Professionals: any time until it ends.
      canCancel: isMember ? memberMayChange : active,
      canReschedule: memberMayChange,
    };
  });
}

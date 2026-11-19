/**
 * File: src/modules/notifications/notifications.routes.ts
 *
 * Routes for the in-app notification list:
 * - GET  /notifications           my latest 50 notifications + unread count
 * - POST /notifications/:id/read  mark one as read
 * - POST /notifications/read-all  mark all as read
 * Each notification includes its session, so the app can show the time in the user's timezone.
 */
import { Router } from 'express';
import { In, IsNull } from 'typeorm';
import { NotificationEntity } from './notification.model.js';
import { requireUser } from '../auth/auth.middleware.js';
import { SessionEntity } from '../sessions/session.model.js';
import { describeSessions } from '../sessions/sessions.routes.js';
import type { AppDeps } from '../../app.js';
import { notFound } from '../../common/errors.js';
import { idParamSchema } from '../../common/schemas.js';

export function notificationRoutes({ db, clock }: AppDeps): Router {
  const router = Router();

  router.get('/notifications', async (req, res) => {
    const user = requireUser(req);
    const notifications = await db.manager.find(NotificationEntity, {
      where: { userId: user.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 50,
    });
    const sessions = notifications.length
      ? await db.manager.findBy(SessionEntity, { id: In(notifications.map((n) => n.sessionId)) })
      : [];
    const views = await describeSessions(db.manager, user, sessions, clock.now());
    const unreadCount = await db.manager.countBy(NotificationEntity, { userId: user.id, readAt: IsNull() });

    res.json({
      unreadCount,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type, // reminder_24h | reminder_1h | session_booked | session_cancelled | session_rescheduled
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
        session: views.find((v) => v.id === n.sessionId),
      })),
    });
  });

  router.post('/notifications/:id/read', async (req, res) => {
    const user = requireUser(req);
    const { id } = idParamSchema.parse(req.params);
    const result = await db.manager.update(NotificationEntity, { id, userId: user.id }, { readAt: clock.now() });
    if (!result.affected) throw notFound('Notification not found.');
    res.status(204).end();
  });

  router.post('/notifications/read-all', async (req, res) => {
    const user = requireUser(req);
    await db.manager.update(NotificationEntity, { userId: user.id, readAt: IsNull() }, { readAt: clock.now() });
    res.status(204).end();
  });

  return router;
}

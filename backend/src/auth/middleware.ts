import type { NextFunction, Request, Response } from 'express';
import type { DB } from '../db/client.js';
import type { Clock } from '../lib/clock.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { findSessionUser, SESSION_COOKIE, type AuthUser } from './sessions.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Resolves the caller from the session cookie on every request.
 * The acting user is never taken from a request body, query or URL parameter.
 */
export function loadUser(db: DB, clock: Clock) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0) {
      req.user = await findSessionUser(db, token, clock.now());
    }
    next();
  };
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireRole(req: Request, role: AuthUser['role']): AuthUser {
  const user = requireUser(req);
  if (user.role !== role) {
    throw forbidden('WRONG_ROLE', `Only a ${role} can do this.`);
  }
  return user;
}

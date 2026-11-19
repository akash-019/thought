/**
 * File: src/auth/auth.middleware.ts
 *
 * Who is calling?
 * - loadUser middleware: reads the access token from `Authorization: Bearer <token>`,
 *   verifies it, and sets req.user from the database on every request.
 * - requireUser / requireRole: used by routes to demand a logged-in user (and role).
 * The user is always taken from the verified token, never from an id the client sends.
 */
import type { NextFunction, Request, Response } from 'express';
import type { DataSource } from 'typeorm';
import { UserEntity, type Role } from '../db/entities.js';
import type { Clock } from '../shared/clock.js';
import { forbidden, unauthorized } from '../shared/errors.js';
import { verifyAccessToken } from './tokens.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Set when a token was sent but has expired, so the client knows to refresh. */
      tokenExpired?: boolean;
    }
  }
}

export function loadUser(db: DataSource, clock: Clock) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (token) {
      const result = verifyAccessToken(token, clock.now());
      if (result === 'expired') {
        req.tokenExpired = true;
      } else if (result) {
        // Load the user so a deleted account stops working and name/timezone are always current.
        const user = await db.manager.findOneBy(UserEntity, { id: result.userId });
        if (user) req.user = { id: user.id, name: user.name, email: user.email, role: user.role, timezone: user.timezone };
      }
    }
    next();
  };
}

export function requireUser(req: Request): AuthUser {
  if (req.user) return req.user;
  if (req.tokenExpired) throw unauthorized('Your session expired. Please refresh your token.', 'TOKEN_EXPIRED');
  throw unauthorized();
}

export function requireRole(req: Request, role: Role): AuthUser {
  const user = requireUser(req);
  if (user.role !== role) throw forbidden('WRONG_ROLE', `Only a ${role} can do this.`);
  return user;
}

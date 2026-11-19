/**
 * File: src/app.ts
 *
 * Builds the Express app: JSON body parsing, the "who is calling" (access token) middleware,
 * every feature's routes under /api, the API docs at /api/docs, and the shared error handler.
 * Takes its dependencies (database, clock, settings) as arguments so tests can pass a fixed clock.
 */
import express from 'express';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import swaggerUi from 'swagger-ui-express';
import type { DataSource } from 'typeorm';
import { parse as parseYaml } from 'yaml';
import type { Clock } from './common/clock.js';
import { errorHandler, notFound } from './common/errors.js';
import type { Settings } from './config.js';
import { loadUser } from './modules/auth/auth.middleware.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { availabilityRoutes } from './modules/availability/availability.routes.js';
import { notificationRoutes } from './modules/notifications/notifications.routes.js';
import { professionalRoutes } from './modules/professionals/professionals.routes.js';
import { sessionRoutes } from './modules/sessions/sessions.routes.js';

/** The API documentation (backend/openapi.yaml), shown at /api/docs. */
const openApiSpec = parseYaml(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

export interface AppDeps {
  db: DataSource;
  clock: Clock;
  settings: Settings;
  /** Folder of the built frontend to serve, if any (single-service hosting). */
  staticDir?: string | null;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // Interactive API docs (Swagger UI) and the raw spec.
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // Security headers on every API response (nosniff, no framing, HSTS, strict CSP...).
  // Added after the docs because Swagger UI needs inline scripts.
  const api = express.Router();
  api.use(helmet());
  api.use(loadUser(deps.db, deps.clock)); // sets req.user from the access token, if any
  api.use(authRoutes(deps));
  api.use(availabilityRoutes(deps));
  api.use(professionalRoutes(deps));
  api.use(sessionRoutes(deps));
  api.use(notificationRoutes(deps));
  api.use(() => {
    throw notFound('No such endpoint.');
  });
  app.use('/api', api);

  // Single-service hosting: also serve the built web app. Any other path loads index.html and
  // React picks the page (same as the nginx setup used with Docker Compose).
  if (deps.staticDir) {
    const dir = deps.staticDir;
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    // Every path that does NOT start with /api/ (the (?!...) part means "not followed by").
    const NOT_AN_API_PATH = /^(?!\/api\/).*/;
    app.get(NOT_AN_API_PATH, (_req, res) => {
      res.sendFile('index.html', { root: dir });
    });
  }

  app.use(errorHandler);
  return app;
}

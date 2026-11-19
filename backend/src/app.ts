/**
 * File: src/app.ts
 *
 * Builds the Express app: JSON body parsing, the "who is calling" (access token) middleware,
 * every feature's routes under /api, the API docs at /api/docs, and the shared error handler.
 * Takes its dependencies (database, clock, settings) as arguments so tests can pass a fixed clock.
 */
import { readFileSync } from 'node:fs';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import type { DataSource } from 'typeorm';
import { parse as parseYaml } from 'yaml';
import { loadUser } from './auth/auth.middleware.js';
import { authRoutes } from './auth/auth.routes.js';
import { availabilityRoutes } from './availability/availability.routes.js';
import { bookingRoutes } from './booking/booking.routes.js';
import { professionalRoutes } from './booking/professionals.routes.js';
import type { Settings } from './config.js';
import { notificationRoutes } from './reminders/notifications.routes.js';
import type { Clock } from './shared/clock.js';
import { errorHandler, notFound } from './shared/errors.js';

/** The API documentation (backend/openapi.yaml), shown at /api/docs. */
const openApiSpec = parseYaml(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

export interface AppDeps {
  db: DataSource;
  clock: Clock;
  settings: Settings;
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

  const api = express.Router();
  api.use(loadUser(deps.db, deps.clock)); // sets req.user from the access token, if any
  api.use(authRoutes(deps));
  api.use(availabilityRoutes(deps));
  api.use(professionalRoutes(deps));
  api.use(bookingRoutes(deps));
  api.use(notificationRoutes(deps));
  api.use(() => {
    throw notFound('No such endpoint.');
  });
  app.use('/api', api);

  app.use(errorHandler);
  return app;
}

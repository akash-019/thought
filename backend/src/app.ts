import cookieParser from 'cookie-parser';
import express from 'express';
import { loadUser } from './auth/middleware.js';
import type { DB } from './db/client.js';
import type { Clock } from './lib/clock.js';
import { notFound } from './lib/errors.js';
import { errorHandler } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { availabilityRoutes } from './routes/availability.js';

export interface AppDeps {
  db: DB;
  clock: Clock;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(loadUser(deps.db, deps.clock));
  api.use(authRoutes(deps));
  api.use(availabilityRoutes(deps));
  api.use(() => {
    throw notFound('No such endpoint.');
  });
  app.use('/api', api);

  app.use(errorHandler);
  return app;
}

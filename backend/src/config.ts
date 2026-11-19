/**
 * File: src/config.ts
 *
 * All settings read from environment variables, with safe defaults for local development.
 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
  return 'dev-only-secret-do-not-use-in-production';
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://booking:booking@localhost:5432/booking',
  port: intEnv('PORT', 4000),
  /** Secret used to sign access tokens (JWT, HS256). Must be set in production. */
  jwtSecret: jwtSecret(),
  /** Access tokens are short-lived: a leaked one is only useful for this long. */
  accessTokenTtlMinutes: intEnv('ACCESS_TOKEN_TTL_MINUTES', 15),
  /** Refresh tokens keep the user logged in; each use swaps it for a new one. */
  refreshTokenTtlDays: intEnv('REFRESH_TOKEN_TTL_DAYS', 7),
  /** Minimum notice for a booking, in minutes (optional extra from the brief). */
  minNoticeMinutes: intEnv('MIN_NOTICE_MINUTES', 120),
  /** Most new accounts one IP address can create per hour (stops scripted mass sign-ups). */
  signupsPerHour: intEnv('SIGNUPS_PER_HOUR', 20),
  /** Create fictional demo users and sessions on start-up when the database is empty. */
  seedDemoData: process.env.SEED_DEMO_DATA === 'true',
  /**
   * Also run the reminder worker inside the API process. The Docker image turns this on (locally
   * and on Render); without it, run the worker as its own process (`node dist/worker.js`).
   */
  runReminderWorker: process.env.RUN_REMINDER_WORKER === 'true',
  /** Folder with the built frontend. When set, the API also serves the web app (single-service hosting). */
  staticDir: process.env.STATIC_DIR || null,
  /** How often the reminder worker looks for due reminders. */
  reminderPollMs: intEnv('REMINDER_POLL_MS', 10_000),
};

/** The business rules the app needs. Production passes `config`; tests pass their own values. */
export type Settings = Pick<
  typeof config,
  'minNoticeMinutes' | 'accessTokenTtlMinutes' | 'refreshTokenTtlDays' | 'signupsPerHour'
>;

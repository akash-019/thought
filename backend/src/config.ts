function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://booking:booking@localhost:5432/booking',
  port: intEnv('PORT', 4000),
  /** Set to true when served over HTTPS so the session cookie is never sent in clear text. */
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionTtlDays: intEnv('SESSION_TTL_DAYS', 7),
  /** How often the reminder worker looks for due reminders. */
  reminderPollMs: intEnv('REMINDER_POLL_MS', 10_000),
};

/**
 * File: src/worker.ts
 *
 * Reminder worker entry point (a separate process from the API).
 * Every REMINDER_POLL_MS it asks the database for due reminders and delivers them as in-app
 * notifications. Because all state is in the database, restarting it never loses or repeats a reminder.
 */
import { systemClock } from './common/clock.js';
import { config } from './config.js';
import { connect, runMigrations } from './db/data-source.js';
import { processDueReminders } from './modules/notifications/reminders.js';

/**
 * Reminder worker: a separate process that polls for due reminders every REMINDER_POLL_MS.
 * Polling the database (instead of in-memory timers) is what makes delivery survive restarts.
 */
const db = await connect(config.databaseUrl);
await runMigrations(db);
console.log(`reminder worker polling every ${config.reminderPollMs}ms`);

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick() {
  try {
    const r = await processDueReminders(db, systemClock.now());
    if (r.delivered || r.expired || r.cancelled) console.log('reminders processed', r);
  } catch (err) {
    console.error('reminder tick failed (will retry next tick)', err);
  }
  if (!stopping) timer = setTimeout(tick, config.reminderPollMs);
}

async function shutdown() {
  stopping = true;
  clearTimeout(timer);
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await tick();

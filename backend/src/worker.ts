/**
 * File: src/worker.ts
 *
 * Reminder worker entry point, for running it as its own process. (The Docker image runs the same
 * loop inside the API process instead: RUN_REMINDER_WORKER=true.)
 * Every REMINDER_POLL_MS it asks the database for due reminders and delivers them as in-app
 * notifications. Because all state is in the database, restarting it never loses or repeats a reminder.
 */
import { systemClock } from './common/clock.js';
import { config } from './config.js';
import { connect, runMigrations } from './db/data-source.js';
import { startReminderLoop } from './modules/notifications/reminders.js';

const db = await connect(config.databaseUrl);
await runMigrations(db);
console.log(`reminder worker polling every ${config.reminderPollMs}ms`);
const loop = startReminderLoop(db, systemClock.now, config.reminderPollMs);

async function shutdown() {
  loop.stop();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

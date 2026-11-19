/**
 * File: src/server.ts
 *
 * API server entry point.
 * Connects to Postgres, applies pending migrations, adds demo data if SEED_DEMO_DATA=true and the
 * database is empty, then starts the Express app on PORT.
 * Run with `npm run dev` (watch mode) or `npm start` (built code).
 */
import { createApp } from './app.js';
import { systemClock } from './common/clock.js';
import { config } from './config.js';
import { connect, runMigrations } from './db/data-source.js';
import { seedDemoData } from './db/seed.js';

const db = await connect(config.databaseUrl);
await runMigrations(db);
if (config.seedDemoData && (await seedDemoData(db))) {
  console.log('Demo data created. Password for every demo account: password123');
}
const app = createApp({ db, clock: systemClock, settings: config });

const server = app.listen(config.port, () => {
  console.log(`api listening on :${config.port}`);
});

async function shutdown() {
  server.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

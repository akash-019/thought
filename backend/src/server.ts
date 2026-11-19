/**
 * File: src/server.ts
 *
 * API server entry point.
 * Connects to Postgres, applies pending migrations, then starts the Express app on PORT.
 * Run with `npm run dev` (watch mode) or `npm start` (built code).
 */
import { createApp } from './app.js';
import { config } from './config.js';
import { connect, runMigrations } from './db/data-source.js';
import { systemClock } from './shared/clock.js';

const db = await connect(config.databaseUrl);
await runMigrations(db);
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

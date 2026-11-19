import { createApp } from './app.js';
import { config } from './config.js';
import { createDb } from './db/client.js';
import { migrate } from './db/migrate.js';
import { systemClock } from './lib/clock.js';

await migrate(config.databaseUrl);
const db = createDb(config.databaseUrl);
const app = createApp({ db, clock: systemClock });

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

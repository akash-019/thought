/**
 * File: src/db/seed-cli.ts
 *
 * Command-line helper: `npm run seed` adds the demo accounts to an empty database and exits.
 */
import { config } from '../config.js';
import { connect, runMigrations } from './data-source.js';
import { DEMO_PASSWORD, seedDemoData } from './seed.js';

const db = await connect(config.databaseUrl);
await runMigrations(db);
const created = await seedDemoData(db);
console.log(created ? `Demo data created. Password for every account: ${DEMO_PASSWORD}` : 'Users exist already; nothing to do.');
await db.destroy();

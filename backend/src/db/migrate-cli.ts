/**
 * File: src/db/migrate-cli.ts
 *
 * Command-line helper: `npm run migrate` applies pending migrations and exits.
 */
import { config } from '../config.js';
import { connect, runMigrations } from './data-source.js';

const ds = await connect(config.databaseUrl);
await runMigrations(ds);
await ds.destroy();

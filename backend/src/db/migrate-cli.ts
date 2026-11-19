/**
 * File: src/db/migrate-cli.ts
 *
 * Command-line helper: `npm run migrate` applies pending migrations and exits.
 */
import { connect, runMigrations } from './data-source.js';
import { config } from '../config.js';

const ds = await connect(config.databaseUrl);
await runMigrations(ds);
await ds.destroy();

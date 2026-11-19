/**
 * File: src/db/data-source.ts
 *
 * Creates the TypeORM connection (DataSource) and runs migrations safely
 * when the API and worker start at the same time.
 */
import 'reflect-metadata';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings. By default pg turns them into JS Dates at
// local midnight of the *server*, which silently shifts calendar dates across timezones.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export function createDataSource(url: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTransactionMode: 'each',
    // The schema is owned by the migrations, never auto-synced from the entities.
    synchronize: false,
    extra: { max: 10 },
  });
}

/** Creates and connects a DataSource. */
export async function connect(url: string): Promise<DataSource> {
  return createDataSource(url).initialize();
}

/**
 * Applies pending migrations. A Postgres advisory lock (held on one dedicated connection)
 * makes it safe for the API and the worker to start at the same time.
 */
export async function runMigrations(ds: DataSource, log: (msg: string) => void = console.log): Promise<void> {
  const lock = ds.createQueryRunner();
  await lock.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(727001)');
    const applied = await ds.runMigrations({ transaction: 'each' });
    for (const m of applied) log(`migrated ${m.name}`);
  } finally {
    await lock.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    await lock.release();
  }
}

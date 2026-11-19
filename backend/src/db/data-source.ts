/**
 * File: src/db/data-source.ts
 *
 * Creates the TypeORM connection (DataSource) and runs migrations safely
 * when the API and worker start at the same time.
 */
import 'reflect-metadata';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { MIGRATIONS } from './migrations/index.js';
import { RefreshTokenEntity } from '../modules/auth/refresh-token.model.js';
import { UserEntity } from '../modules/auth/user.model.js';
import { AvailabilityRuleEntity } from '../modules/availability/availability-rule.model.js';
import { BlockedDateEntity } from '../modules/availability/blocked-date.model.js';
import { NotificationEntity } from '../modules/notifications/notification.model.js';
import { ReminderEntity } from '../modules/notifications/reminder.model.js';
import { SessionEntity } from '../modules/sessions/session.model.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings. By default pg turns them into JS Dates at
// local midnight of the *server*, which silently shifts calendar dates across timezones.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

/** Creates and connects to the database. */
export async function connect(url: string): Promise<DataSource> {
  const db = new DataSource({
    type: 'postgres',
    url,
    // Every model (table) of every module.
    entities: [
      UserEntity,
      RefreshTokenEntity,
      AvailabilityRuleEntity,
      BlockedDateEntity,
      SessionEntity,
      ReminderEntity,
      NotificationEntity,
    ],
    migrations: MIGRATIONS,
    migrationsTransactionMode: 'each',
    // The schema is owned by the migrations, never auto-synced from the entities.
    synchronize: false,
  });
  return db.initialize();
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
    const applied = await ds.runMigrations();
    for (const migration of applied) log(`migrated ${migration.name}`);
  } finally {
    await lock.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    await lock.release();
  }
}

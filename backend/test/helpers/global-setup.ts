import pg from 'pg';
import { migrate } from '../../src/db/migrate.js';
import { TEST_DATABASE_URL } from './db.js';

/** Runs once per `vitest run`: wipe the test database schema and apply all migrations fresh. */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach the test database at ${TEST_DATABASE_URL}. Start it with "docker compose up -d db" ` +
        `or set TEST_DATABASE_URL. (${(err as Error).message})`,
    );
  }
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  await migrate(TEST_DATABASE_URL, () => {});
}

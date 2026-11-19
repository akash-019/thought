import { sql } from 'kysely';
import { createDb, type DB } from '../../src/db/client.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://booking:booking@localhost:5433/booking_test';

export function testDb(): DB {
  return createDb(TEST_DATABASE_URL);
}

/** Empties every table between tests. CASCADE follows foreign keys. */
export async function resetData(db: DB): Promise<void> {
  const { rows } = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`.execute(db);
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`).execute(db);
}

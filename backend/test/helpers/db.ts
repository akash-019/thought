/**
 * File: test/helpers/db.ts
 *
 * Test helpers: connect to the test database and empty all tables between tests.
 */
import type { DataSource } from 'typeorm';
import { connect } from '../../src/db/data-source.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://booking:booking@localhost:5433/booking_test';

export function testDb(): Promise<DataSource> {
  return connect(TEST_DATABASE_URL);
}

/** Empties every table between tests. CASCADE follows foreign keys. */
export async function resetData(db: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  if (rows.length === 0) return;
  await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

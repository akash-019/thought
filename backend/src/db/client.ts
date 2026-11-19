import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

export type DB = Kysely<Database>;

export function createDb(connectionString: string): DB {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

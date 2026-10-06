import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Builds a read-write fixture database; the runner then opens it READ_ONLY.
 * Autoinstall and autoload stay off and TimeZone is never a creation option, so DuckDB never
 * downloads an extension (ruling R17; spike A, "For Tasks 11-17", item 17).
 */
export async function makeFixtureDb(statements: string[]): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'al-test-')), 'fixture.duckdb');
  const inst = await DuckDBInstance.create(path, { autoinstall_known_extensions: 'false', autoload_known_extensions: 'false' });
  const c = await inst.connect();
  for (const s of statements) await c.run(s);
  c.disconnectSync();
  inst.closeSync();
  return path;
}

export const SHOP = [
  'CREATE SCHEMA vis',
  "CREATE TABLE vis.stores AS SELECT * FROM (VALUES (1,'NL-01','Amsterdam','NL'),(2,'BE-07','Gent','BE'),(3,'LU-01','Luxembourg','LU')) v(store_id, store_code, city, country_code)",
  'CREATE TABLE vis.big AS SELECT range AS id FROM range(200000)',
  'CREATE SCHEMA hidden',
  "CREATE TABLE hidden.stores AS SELECT * FROM (VALUES (9,'XX-99','Secret','XX')) v(store_id, store_code, city, country_code)",
];

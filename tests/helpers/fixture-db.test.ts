// tests/helpers/fixture-db.test.ts: makeFixtureDb sets TimeZone with SET after opening, as ruling R17 asks of every instance (S7-30). A
// statement that turns a TIMESTAMPTZ into text shows the session's zone, so the text written into the file shows whether it was set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { makeFixtureDb } from './fixture-db.ts';

test('S7-30: the fixture database is built in UTC whatever the laptop\'s zone is', async () => {
  const path = await makeFixtureDb(["CREATE TABLE t AS SELECT CAST(TIMESTAMPTZ '2026-01-15 10:00:00+00' AS VARCHAR) AS shown"]);
  try {
    const inst = await DuckDBInstance.create(path, { access_mode: 'READ_ONLY', autoinstall_known_extensions: 'false', autoload_known_extensions: 'false' });
    const c = await inst.connect();
    const rows = (await c.runAndReadAll('SELECT shown FROM t')).getRows();
    c.disconnectSync();
    inst.closeSync();
    assert.deepEqual(rows, [['2026-01-15 10:00:00+00']]);
  } finally { await rm(dirname(path), { recursive: true, force: true }); }
});

// tests/runner/escape-probes.test.ts: runner escape probes (design §17), run on the real engine path: the runner client, its child
// process and the locked instance, as the app runs learner SQL. S7-23 (sprint 7, Task A1; the build record's final review A3): an
// unused named WINDOW, `SELECT 1 AS x WINDOW w AS (ORDER BY <a function the gate refuses>)`, must be refused by the gate or never run
// that function. The controller records the result as a design §17 probe (Task F2).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner } from '../../server/runner/client.ts';
import { macroDenylistOf, openLockedInstance } from '../../server/runner/child.ts';
import type { DisplayOk } from '../../server/runner/protocol.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const db = await makeFixtureDb(SHOP);
const runner = await startRunner(db);
// Opened only to read the runtime macro denylist, which the runner's child builds the same way from the same engine (child.ts).
const inst = await openLockedInstance(db);
after(async () => { inst.closeSync(); await runner.close(); });

const display = (sql: string) => runner.request<DisplayOk>({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000 });
const unusedWindow = (expr: string) => `SELECT 1 AS x WINDOW w AS (ORDER BY ${expr})`;

/** Calls the gate refuses: every name on the runtime macro denylist, and some on its static text denylist (tables.ts). */
const refusedCalls = (): string[] => [
  ...[...macroDenylistOf(inst)].map((name) => `${name}(1)`),
  "query_table('hidden.stores')", "read_csv('stores.csv')", 'duckdb_settings()',
];

test('S7-23: an unused named WINDOW that orders by a function the gate refuses is refused by the gate, or runs without running it', async () => {
  const calls = refusedCalls();
  assert.ok(calls.length > 3, 'the runtime denylist is not empty');
  for (const call of calls) {
    const r = await display(unusedWindow(call));
    if (!r.ok) {
      assert.deepEqual([r.error.kind, r.error.kind === 'gate' ? r.error.reason : null], ['gate', 'table_function'], `${call}: ${JSON.stringify(r)}`);
    } else {
      // Ran: then only the constant came back, and the next test shows the engine never evaluates an unused window.
      assert.deepEqual(r.data.rows, [[1]], call);
    }
  }
});

test('S7-23: on this engine every such probe is refused by the gate, before anything runs', async () => {
  // The result the controller records (Task F2). On DuckDB 1.5.6 each refused name is on the static text denylist, which the gate
  // checks before prepare; the runtime macro denylist holds the same four names. A refusal here also means nothing was run.
  for (const call of refusedCalls()) {
    const r = await display(unusedWindow(call));
    assert.ok(!r.ok && r.error.kind === 'gate' && r.error.reason === 'table_function', `${call}: ${JSON.stringify(r)}`);
  }
});

test('S7-23: the engine never binds or runs an unused named WINDOW, so nothing in one is evaluated or read', async () => {
  // error() raises when it runs, and an unknown column or function fails at bind: none of them does here.
  for (const expr of ["error('the unused window ran')", 'no_such_column', 'no_such_function(1)']) {
    const r = await display(unusedWindow(expr));
    assert.ok(r.ok, `${expr}: ${JSON.stringify(r)}`);
    assert.deepEqual(r.data.rows, [[1]], expr);
  }
  // json_serialize_sql leaves an unused window out of the tree, so the gate's tree checks never see a table it names. It is never
  // bound either: the hidden table is never read, and the probe gives the constant.
  const hidden = await display(unusedWindow('(SELECT max(city) FROM hidden.stores)'));
  if (hidden.ok) assert.deepEqual(hidden.data.rows, [[1]]);
  else assert.equal(hidden.error.kind, 'gate');
});

test('S7-23: a named WINDOW that is used is in the tree, so the gate sees what it calls and reads', async () => {
  const called = await display('SELECT count(*) OVER w AS n FROM stores WINDOW w AS (ORDER BY format_type(23, -1))');
  assert.ok(!called.ok && called.error.kind === 'gate' && called.error.reason === 'table_function', JSON.stringify(called));
  const read = await display('SELECT count(*) OVER w AS n FROM stores WINDOW w AS (ORDER BY (SELECT max(city) FROM hidden.stores))');
  assert.ok(!read.ok && read.error.kind === 'gate' && read.error.reason === 'qualified_schema', JSON.stringify(read));
});

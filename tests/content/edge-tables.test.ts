// tests/content/edge-tables.test.ts: S6-05 (sprint 6, Task A1). Each of the ten edge descriptions that existed before sprint 6
// assigns every `contains` line to the table or tables it is about, so a failed hidden run can list only the tables the learner's
// query read. `contains` stays the fallback. The four schemas sprint 6 adds have their own task and are not checked here.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import type { RowsOk } from '../../server/runner/protocol.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';

const SCHEMAS = ['agg', 'basics', 'case', 'date', 'filter', 'join', 'null', 'set', 'sort', 'type'].map((f) => `voltmarkt_edge_${f}`);
const read = async (schema: string): Promise<EdgeDescription> => JSON.parse(await readFile(`content/sql/edge/${schema}.json`, 'utf8')) as EdgeDescription;
const DB = 'data/course.duckdb';
const runner = existsSync(DB) ? await startRunner(DB) : null;
after(async () => { await runner?.close(); });

test('S6-05: every line of the ten edge descriptions is assigned to a table, and every table line is one of its lines', async () => {
  for (const schema of SCHEMAS) {
    const d = await read(schema);
    assert.ok(d.tables && Object.keys(d.tables).length > 0, `${schema} has tables`);
    const assigned = new Set(Object.values(d.tables).flat());
    for (const line of d.contains) assert.ok(assigned.has(line), `${schema}: "${line}" is assigned to no table`);
    for (const [table, lines] of Object.entries(d.tables)) {
      assert.match(table, /^[a-z_]+$/, `${schema}: ${table} is a plain table name`);
      assert.ok(lines.length > 0, `${schema}.${table} has lines`);
      assert.equal(new Set(lines).size, lines.length, `${schema}.${table} lists a line twice`);
      for (const line of lines) assert.ok(d.contains.includes(line), `${schema}.${table}: "${line}" is not one of the lines`);
      assert.deepEqual(lines, d.contains.filter((l) => lines.includes(l)), `${schema}.${table} keeps the lines in their order`);
    }
  }
});
test('S6-05: each table named is a table or view of that edge schema in the built database', { skip: !runner && 'data/course.duckdb is not built' }, async () => {
  for (const schema of SCHEMAS) {
    const r = await runner!.request<RowsOk>({ op: 'app_query', sql: `SELECT lower(table_name) FROM information_schema.tables WHERE table_schema = '${schema}'` });
    assert.ok(r.ok, schema);
    const tables = new Set(r.data.rows.map((row) => String(row[0])));
    for (const table of Object.keys((await read(schema)).tables ?? {})) assert.ok(tables.has(table), `${schema} has no table ${table}`);
  }
});

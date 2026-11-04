// tests/runner/ga4-views.test.ts: ruling S9-C18 (sprint 9, Task L1). A graded run names only tables of the item's own schema
// (design §6 step 5, allowedSchemas: []), so mailvora_ga4 holds views onto the four mailvora tables a level 7 item joins to events, and
// mailvora_edge_ga4 holds tables of the same names. Through the real gate and runner on the built data/course.duckdb, one query that
// joins events to sessions by unqualified names runs on mailvora_ga4 and, the same text, on mailvora_edge_ga4. Skipped when the
// database is not built. Assertions name schemas and counts only.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DEFAULT_RULES } from '../../schemas/item.ts';
import { startRunner } from '../../server/runner/client.ts';
import type { DisplayOk } from '../../server/runner/protocol.ts';

const DB = 'data/course.duckdb';
const runner = existsSync(DB) ? await startRunner(DB) : null;
after(async () => { await runner?.close(); });

/** Each session_start joined to its mailvora session: the visitor and the session's start second (ga_session_id). */
const JOINED = `SELECT count(*) AS n
FROM events AS e
JOIN sessions AS s
  ON s.visitor_id = e.user_pseudo_id
 AND epoch(s.session_start) = list_filter(e.event_params, lambda p: p.key = 'ga_session_id')[1].value.int_value
WHERE e.event_name = 'session_start'`;
const STARTS = "SELECT count(*) AS n FROM events WHERE event_name = 'session_start' AND user_pseudo_id IS NOT NULL";

/** One count through the gate on `schema`, as a graded run sends it: no other schema may be named. */
async function count(schema: string, sql: string): Promise<number> {
  const r = await runner!.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql, cap: 10, deadlineMs: DEFAULT_RULES.timeout_ms });
  assert.ok(r.ok, `${schema}: ${r.ok ? '' : JSON.stringify(r.error)}`);
  return Number(r.data.rows[0]![0]);
}

test('S9-C18: events joins sessions by unqualified names on mailvora_ga4 and on mailvora_edge_ga4, through the gate', { skip: !runner && 'data/course.duckdb is not built' }, async () => {
  for (const schema of ['mailvora_ga4', 'mailvora_edge_ga4']) {
    const joined = await count(schema, JOINED);
    assert.ok(joined > 0, `${schema}: the join finds sessions`);
    assert.equal(joined, await count(schema, STARTS), `${schema}: each consented session_start meets its one session`);
  }
});

test('S9-C18: from mailvora_ga4, mailvora itself still cannot be named', { skip: !runner && 'data/course.duckdb is not built' }, async () => {
  const r = await runner!.request<DisplayOk>({ op: 'display', schema: 'mailvora_ga4', allowedSchemas: [], sql: 'SELECT count(*) FROM mailvora.sessions', cap: 10, deadlineMs: DEFAULT_RULES.timeout_ms });
  assert.equal(r.ok, false);
  assert.equal(r.ok ? null : r.error.kind, 'gate');
});

// Sprint 4b Task C2 (ERRATA E-168): a planted set-operator query is diagnosed ERR-LOG-27. The query is read from the
// item's key at runtime, never copied here. It needs the built course database, so it skips when `npm run build:data` has not run.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { grade } from '../../server/grader/grade.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';

const DB = 'data/course.duckdb';
const have = existsSync(DB);
const runner = have ? await startRunner(DB) : null;
after(async () => { await runner?.close(); });
const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const feedback = await read<Record<string, never>>('content/sql/error-feedback.json');

// The item whose first EXCEPT plant is the wrong-way-round query (the id is content, the query is not).
const ITEM = 'EX-SQL-SET-01-E1-05';

test('a planted EXCEPT-the-wrong-way-round query is diagnosed ERR-LOG-27 with its refutation feedback', { skip: !have && 'data/course.duckdb is not built' }, async () => {
  const item = await read<SqlItem>(`content/sql/items/${ITEM}.json`);
  const key = await read<SqlKey>(`content/keys/sql/${ITEM}.json`);
  const edge = await read<EdgeDescription>(`content/sql/edge/${item.edge_schema}.json`);
  const planted = key.planted_wrong.filter((p) => p.error_id === 'ERR-LOG-27');
  assert.ok(planted.length >= 1, 'the key plants ERR-LOG-27');
  assert.ok(planted.every((p) => /\bEXCEPT\b/i.test(p.sql)));
  const deps = { runner: runner!, edge, feedback: feedback as never };
  assert.equal((await grade({ item, key, sql: key.reference_sql }, deps)).outcome, 'pass');
  for (const p of planted) {
    const r = await grade({ item, key, sql: p.sql }, deps);
    assert.equal(r.outcome, 'fail', p.id);
    assert.equal(r.diagnosis?.errorId, 'ERR-LOG-27', p.id);
    assert.equal(r.diagnosis?.source, 'mutant', p.id);
    assert.equal(r.matchedMutantId, p.id);
  }
});
// After the C1 content review (E-168): five set-operator plants are on ERR-LOG-27. ERR-LOG-03's feedback teaches the opposite
// case of the two missing-value plants on E1-02 and E1-22, so sprint 4c (D44, E-171) gave them ERR-LOG-28. The missing filter on
// E1-07 stays on ERR-LOG-00: no existing ID fits it.
test('five SQL-SET-01 plants are on ERR-LOG-27, two on ERR-LOG-28, one stays on ERR-LOG-00 and none is on ERR-LOG-03', async () => {
  const ids = (await import('node:fs')).readdirSync('content/keys/sql').filter((f) => f.startsWith('EX-SQL-SET-01-'));
  const counts: Record<string, number> = {};
  for (const f of ids) for (const p of (await read<SqlKey>(`content/keys/sql/${f}`)).planted_wrong) counts[p.error_id] = (counts[p.error_id] ?? 0) + 1;
  assert.equal(counts['ERR-LOG-27'], 5);
  assert.equal(counts['ERR-LOG-28'], 2);
  assert.equal(counts['ERR-LOG-00'] ?? 0, 1);
  assert.equal(counts['ERR-LOG-03'] ?? 0, 0);
});

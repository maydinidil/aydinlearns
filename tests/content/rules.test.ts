import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cur = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8'));
const ids = new Set(cur.concepts.map((c: any) => c.id));

test('every construct maps to a real concept and has an example', async () => {
  const c = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
  for (const k of c.constructs) {
    assert.ok(ids.has(k.concept_id), k.construct);
    assert.ok(k.examples.length > 0);
  }
});
test('refutation feedback covers the level 1-2 IDs and uses allowed placeholders only', async () => {
  const fb = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  // ERR-SEM-05 (level 4) has its own text since sprint 2, instead of ERR-LOG-00's.
  const need = ['ERR-SYN-01','ERR-SYN-02','ERR-SYN-03','ERR-SYN-04','ERR-SYN-05','ERR-SYN-06','ERR-SYN-07','ERR-SEM-01','ERR-SEM-04','ERR-SEM-05','ERR-LOG-00','ERR-LOG-02','ERR-LOG-03','ERR-LOG-04','ERR-LOG-05','ERR-LOG-06','ERR-LOG-07','ERR-LOG-08','ERR-LOG-09','ERR-LOG-13','ERR-LOG-14','ERR-LOG-15','ERR-LOG-16','ERR-LOG-17','ERR-LOG-18','ERR-LOG-19','ERR-LOG-20','ERR-LOG-21','ERR-OUT-01','ERR-OUT-02'];
  for (const id of need) assert.ok(fb[id]?.assumed && fb[id]?.why && fb[id]?.model, id);
  const allowed = new Set(['column', 'table', 'missing', 'extra', 'expected_columns', 'actual_columns']);
  for (const [id, t] of Object.entries<any>(fb)) {
    for (const m of JSON.stringify(t).matchAll(/\{([a-z_]+)\}/g)) assert.ok(allowed.has(m[1]!), `${id} uses {${m[1]}}`);
  }
});
test('ERR-SYN-01 feedback covers a name with a space, and ERR-SEM-05 has its own refutation feedback (sprint 2)', async () => {
  const fb = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  const syn01 = `${fb['ERR-SYN-01'].assumed} ${fb['ERR-SYN-01'].why} ${fb['ERR-SYN-01'].model}`;
  assert.match(syn01, /a name with a space/);
  assert.match(syn01, /double quotes/);
  assert.match(syn01, /clauses/, 'the clause-order and spelling advice stays');
  assert.notEqual(fb['ERR-SEM-05'].assumed, fb['ERR-LOG-00'].assumed, 'ERR-SEM-05 no longer falls back to ERR-LOG-00');
  assert.match(fb['ERR-SEM-05'].why, /more than one/);
  assert.match(fb['ERR-SEM-05'].assumed, /^You probably expected/);
});
test('goals cover the six recruitment stages', async () => {
  const g = JSON.parse(await readFile('content/goals.json', 'utf8'));
  const stages = new Set(g.goals.map((x: any) => x.stage).filter((s: any) => s !== null));
  assert.deepEqual([...stages].sort(), [1, 2, 3, 4, 5, 6]);
});
test('every goal has an id, a title, an ISO target date and well-formed criteria', async () => {
  const g = JSON.parse(await readFile('content/goals.json', 'utf8'));
  const required: Record<string, string[]> = {
    concept_state: ['section', 'state'],
    mock_pass: ['mock'],
    external: ['result', 'count'],
    live_rep: ['window_weeks', 'min_logged', 'min_passed'],
  };
  for (const x of g.goals) {
    assert.ok(typeof x.id === 'string' && x.id.length > 0, JSON.stringify(x));
    assert.ok(typeof x.title === 'string' && x.title.length > 0, `${x.id} has no title`);
    assert.match(x.target_date, /^\d{4}-\d{2}-\d{2}$/, `${x.id} target_date`);
    const day = new Date(`${x.target_date}T00:00:00Z`);
    assert.ok(!Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === x.target_date, `${x.id} target_date ${x.target_date} is not a real day`);
    assert.ok(Array.isArray(x.criteria) && x.criteria.length > 0, `${x.id} has no criteria`);
    for (const c of x.criteria) {
      const keys = required[c.kind];
      assert.ok(keys, `${x.id} has an unknown criterion kind ${c.kind}`);
      for (const k of keys) assert.ok(c[k] !== undefined, `${x.id}: ${c.kind} needs ${k}`);
    }
  }
});

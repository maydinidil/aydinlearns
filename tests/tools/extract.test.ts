import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractJsonBlock, buildCurriculum } from '../../tools/extract.ts';
import { buildErrors } from '../../tools/extract.ts';

const json01 = extractJsonBlock(await readFile('knowledge/01_sql_curriculum.md', 'utf8')) as any;
const cur = buildCurriculum(json01);
const byId = new Map(cur.concepts.map((c) => [c.id, c]));
const order = cur.concepts.map((c) => c.id);

test('keeps all 46 concepts and 7 levels', () => {
  assert.equal(cur.concepts.length, 46);
  assert.equal(cur.levels.length, 7);
});
test('moves SQL-CTE-01 into level 3, after JOIN-02 and before JOIN-03 (owner decision)', () => {
  assert.equal(byId.get('SQL-CTE-01')!.level, 3);
  assert.deepEqual(byId.get('SQL-CTE-01')!.prerequisites, ['SQL-AGG-02']);
  assert.ok(order.indexOf('SQL-JOIN-02') < order.indexOf('SQL-CTE-01'));
  assert.ok(order.indexOf('SQL-CTE-01') < order.indexOf('SQL-JOIN-03'));
  assert.ok(byId.get('SQL-SUBQ-02')!.prerequisites.includes('SQL-CTE-01'));
  assert.ok(byId.get('SQL-JOIN-03')!.prerequisites.includes('SQL-CTE-01'));
});
test('moves SQL-DATE-01 to the start of level 3; DATE-02 stays in level 4', () => {
  const l3 = cur.concepts.filter((c) => c.level === 3).map((c) => c.id);
  assert.equal(l3[0], 'SQL-DATE-01');
  assert.equal(byId.get('SQL-DATE-02')!.level, 4);
});
test('levels 1-2 keep their 12 concepts; the graph has no cycle', () => {
  assert.equal(cur.concepts.filter((c) => c.level <= 2).length, 12);
  const seen = new Set<string>();
  for (const c of cur.concepts) {
    for (const p of c.prerequisites) assert.ok(seen.has(p), `${c.id} needs ${p} earlier in order`);
    seen.add(c.id);
  }
});
test('41 error types (37 + 4 new), each tied to a known concept', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const map = JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8'));
  const cat = buildErrors(j02, map);
  assert.equal(cat.errors.length, 41);
  for (const e of cat.errors) assert.ok(byId.has(e.concept_id), `${e.id} -> ${e.concept_id}`);
});
test('R38: ERR-LOG-22 (LIKE pattern) and ERR-LOG-23 (BETWEEN range) belong to SQL-FILTER-02, with ERRATA entries and refutation feedback', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const cat = buildErrors(j02, JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8')));
  const written = JSON.parse(await readFile('content/sql/errors.json', 'utf8'));
  const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  const errata = await readFile('knowledge/ERRATA.md', 'utf8');
  for (const id of ['ERR-LOG-22', 'ERR-LOG-23']) {
    const e = cat.errors.find((x) => x.id === id);
    assert.equal(e?.concept_id, 'SQL-FILTER-02', id);
    assert.equal(e?.category, 'LOG', id);
    assert.deepEqual(written.errors.find((x: { id: string }) => x.id === id), e, `${id}: run npm run extract`);
    assert.ok(feedback[id]?.assumed && feedback[id]?.why && feedback[id]?.model, `${id} feedback`);
    assert.match(errata, new RegExp(`^\\| E-\\d{3} \\| fix \\|[^\\n]*\\| ${id} \\|`, 'm'), `${id} ERRATA entry`);
  }
  assert.match(cat.errors.find((x) => x.id === 'ERR-LOG-22')!.name, /LIKE/);
  assert.match(cat.errors.find((x) => x.id === 'ERR-LOG-23')!.name, /BETWEEN/);
});
test('levels 3 and 4 carry the E-149 titles and ready_when text', () => {
  const lvl = (id: string) => cur.levels.find((l) => l.id === id)!;
  assert.ok(cur.errata_applied.includes('E-149'));
  assert.match(lvl('LVL-03').title, /CTEs/);
  assert.match(lvl('LVL-03').title, /dates/);
  assert.match(lvl('LVL-03').ready_when, /CTE/);
  assert.match(lvl('LVL-03').ready_when, /week or month with date_trunc/);
  assert.equal(lvl('LVL-04').title, 'Multi-step logic, text and date arithmetic');
  assert.doesNotMatch(lvl('LVL-04').ready_when, /week or month/);
  assert.match(lvl('LVL-04').ready_when, /date differences and intervals/);
});

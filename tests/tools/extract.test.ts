import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractJsonBlock, buildCurriculum } from '../../tools/extract.ts';
import { buildErrors, NEW_ERRORS } from '../../tools/extract.ts';

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
// Sprint 6 Task K3: the one test that asserts how many error types there are. The count is read from content/sql/errors.json, never
// typed, so a new ID changes no test (sprint 6 Task B2 added ERR-LOG-30 to ERR-LOG-39; sprint 7 Task A2, S7-24, ERR-LOG-40 to -43).
test('the extract builds as many error types as errors.json holds, each tied to a known concept', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const map = JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8'));
  const written = JSON.parse(await readFile('content/sql/errors.json', 'utf8')) as { errors: unknown[] };
  const cat = buildErrors(j02, map);
  assert.ok(written.errors.length > 0, 'errors.json holds error types');
  assert.equal(cat.errors.length, written.errors.length);
  assert.deepEqual(cat.errors.slice(-14).map((e) => e.id), Array.from({ length: 14 }, (_, i) => `ERR-LOG-${30 + i}`), 'sprint 6\'s ten new IDs, then sprint 7\'s four, come last, so errors.json only grows');
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
test('sprint 4a Task B2: the level 3 IDs ERR-LOG-24 (UNION), -25 (date truncation) and -26 (UTC day) have their concepts, ERRATA entries and refutation feedback', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const cat = buildErrors(j02, JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8')));
  const written = JSON.parse(await readFile('content/sql/errors.json', 'utf8'));
  const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  const errata = await readFile('knowledge/ERRATA.md', 'utf8');
  const want: Record<string, { concept: string; name: RegExp; row: string }> = {
    'ERR-LOG-24': { concept: 'SQL-SET-01', name: /UNION ALL/, row: 'E-162' },
    'ERR-LOG-25': { concept: 'SQL-DATE-01', name: /truncation/, row: 'E-163' },
    'ERR-LOG-26': { concept: 'SQL-DATE-01', name: /UTC day/, row: 'E-164' },
  };
  for (const [id, w] of Object.entries(want)) {
    const e = cat.errors.find((x) => x.id === id);
    assert.equal(e?.concept_id, w.concept, id);
    assert.equal(e?.category, 'LOG', id);
    assert.deepEqual(e?.detection_checks, ['CHK-MUTANT-MATCH'], id);
    assert.match(e!.name, w.name, id);
    assert.deepEqual(written.errors.find((x: { id: string }) => x.id === id), e, `${id}: run npm run extract`);
    assert.ok(feedback[id]?.assumed && feedback[id]?.why && feedback[id]?.model, `${id} feedback`);
    assert.match(errata, new RegExp(`^\\| ${w.row} \\| fix \\|[^\\n]*\\| ${id} \\|`, 'm'), `${id} ERRATA entry`);
  }
});
test('sprint 6 Task A1: ERR-SYN-08 (a window function in WHERE) belongs to SQL-WIN-01, with its ERRATA row and refutation feedback', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const cat = buildErrors(j02, JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8')));
  const written = JSON.parse(await readFile('content/sql/errors.json', 'utf8'));
  const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  const errata = await readFile('knowledge/ERRATA.md', 'utf8');
  const e = cat.errors.find((x) => x.id === 'ERR-SYN-08');
  assert.deepEqual({ ...e, feedback_template: '' }, { id: 'ERR-SYN-08', category: 'SYN', name: 'A window function in WHERE, GROUP BY, HAVING or an aggregate', detection_checks: ['CHK-ENGINE-ERROR'], feedback_template: '', concept_id: 'SQL-WIN-01' });
  assert.match(e!.feedback_template, /WHERE/);
  assert.ok(NEW_ERRORS.some((x) => x.id === 'ERR-SYN-08'), 'one of the extract\'s NEW_ERRORS, so npm run extract keeps it');
  assert.deepEqual(written.errors.find((x: { id: string }) => x.id === 'ERR-SYN-08'), e, 'run npm run extract');
  const f = feedback['ERR-SYN-08'];
  assert.ok(f?.assumed && f.why && f.model, 'feedback');
  assert.match(f.assumed, /^You probably expected /);
  const all = `${f.assumed} ${f.why} ${f.model} ${e!.feedback_template}`;
  assert.doesNotMatch(all, /—/, 'no em dash');
  assert.doesNotMatch(all, /\b(he|she|him|her|his|hers)\b/i, 'no gendered pronoun');
  assert.doesNotMatch(all, /\bqualify\b/i, 'the model is portable: QUALIFY works only in DuckDB');
  assert.doesNotMatch(JSON.stringify(f), /\{[a-z_]+\}/, 'needs no placeholder');
  assert.match(errata, /^\| E-189 \| fix \|[^\n]*ERR-SYN-08/m, 'ERRATA entry');
});
test('errors.json is exactly what the extract builds, so npm run extract never drops an ID', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const cat = buildErrors(j02, JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8')));
  assert.deepEqual(JSON.parse(await readFile('content/sql/errors.json', 'utf8')), cat);
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

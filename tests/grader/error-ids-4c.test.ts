// Sprint 4c Task C1 (D44 to D48): the new error IDs ERR-LOG-28 (a set operator and missing values) and ERR-LOG-29 (CASE branch
// order), the plants moved to them, the two AGG mistakes planted with the ID whose feedback fits, and the widened feedback of
// ERR-LOG-06 and ERR-OUT-02. Every planted query is read from its item's key at runtime and never copied here, and no assertion
// message quotes one. The grading tests need the built course database, so they skip when `npm run build:data` has not run.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { grade } from '../../server/grader/grade.ts';
import { gradeChoice } from '../../server/choice/grade.ts';
import { NEW_ERRORS } from '../../tools/extract.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { ChoiceKey } from '../../schemas/choice.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';

const DB = 'data/course.duckdb';
const have = existsSync(DB);
const runner = have ? await startRunner(DB) : null;
after(async () => { await runner?.close(); });
const skip = !have && 'data/course.duckdb is not built';

const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
type Fb = { assumed: string; why: string; model: string };
const feedback = await read<Record<string, Fb>>('content/sql/error-feedback.json');
const concepts = await read<Record<string, string>>('content/sql/error-concepts.json');
const errors = (await read<{ errors: { id: string; category: string; name: string; detection_checks: string[]; feedback_template: string; concept_id: string }[] }>('content/sql/errors.json')).errors;
const key = (id: string) => read<SqlKey>(`content/keys/sql/${id}.json`);
const item = (id: string) => read<SqlItem>(`content/sql/items/${id}.json`);
const text = (f: Fb): string => `${f.assumed} ${f.why} ${f.model}`;

/**
 * Grades every plant of `id` mapped to `errorId` and checks it is diagnosed as that ID: by its own planted match, with the ID's
 * refutation text, unless `anyStep` (a shape or engine-error plant is diagnosed before any planted match, design §6).
 */
async function plantsDiagnosed(id: string, errorId: string, anyStep = false): Promise<number> {
  const it = await item(id);
  const k = await key(id);
  const edge = await read<EdgeDescription>(`content/sql/edge/${it.edge_schema}.json`);
  const deps = { runner: runner!, edge, feedback: feedback as never };
  const planted = k.planted_wrong.filter((p) => p.error_id === errorId);
  for (const p of planted) {
    const r = await grade({ item: it, key: k, sql: p.sql }, deps);
    assert.ok(anyStep ? ['fail', 'engine_error'].includes(r.outcome) : r.outcome === 'fail', `${id} ${p.id}: ${r.outcome}`);
    assert.equal(r.diagnosis?.errorId, errorId, `${id} ${p.id}`);
    if (anyStep) continue;
    assert.equal(r.diagnosis?.source, 'mutant', `${id} ${p.id}`);
    assert.equal(r.matchedMutantId, p.id, `${id} ${p.id}`);
    assert.deepEqual(r.diagnosis?.feedback, feedback[errorId], `${id} ${p.id}: the refutation text of ${errorId}`);
  }
  return planted.length;
}

/** The plants of the write and fix items whose ID starts with `prefix`, by error ID, with the items that carry each. */
async function plantsOf(prefix: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const f of readdirSync('content/keys/sql').filter((n) => n.startsWith(prefix)).sort()) {
    const k = await read<SqlKey>(`content/keys/sql/${f}`);
    for (const p of k.planted_wrong) out.set(p.error_id, [...(out.get(p.error_id) ?? []), k.item_id]);
  }
  return out;
}

// ---- the catalogue ----------------------------------------------------------------------------------------------------------------

test('ERR-LOG-28 and ERR-LOG-29 are in the catalogue, the extract and error-concepts.json, detected by a planted match', () => {
  const want: Record<string, { concept: string; name: RegExp }> = {
    'ERR-LOG-28': { concept: 'SQL-SET-01', name: /missing values/ },
    'ERR-LOG-29': { concept: 'SQL-CASE-01', name: /CASE branch order/ },
  };
  for (const [id, w] of Object.entries(want)) {
    assert.equal(concepts[id], w.concept, `${id} in error-concepts.json`);
    const e = errors.find((x) => x.id === id);
    assert.ok(e, `${id} in errors.json`);
    assert.equal(e.concept_id, w.concept, id);
    assert.equal(e.category, 'LOG', id);
    assert.deepEqual(e.detection_checks, ['CHK-MUTANT-MATCH'], id);
    assert.match(e.name, w.name, id);
    assert.ok(e.feedback_template.length > 0, `${id} has a template`);
    assert.ok(NEW_ERRORS.some((x) => x.id === id), `${id} is one of the extract's NEW_ERRORS, so npm run extract keeps it`);
  }
});

test('ERR-LOG-28 and ERR-LOG-29 have their own refutation feedback in the house shape', () => {
  for (const id of ['ERR-LOG-28', 'ERR-LOG-29']) {
    const f = feedback[id];
    assert.ok(f?.assumed && f.why && f.model, `${id} feedback`);
    assert.match(f.assumed, /^You probably expected /, id);
    assert.notEqual(f.assumed, feedback['ERR-LOG-00']!.assumed, id);
    assert.doesNotMatch(text(f), /—/, `${id} has an em dash`);
    assert.doesNotMatch(text(f), /\b(he|she|him|her|his|hers)\b/i, `${id} has a gendered pronoun`);
    assert.doesNotMatch(text(f), /\bempty\b/i, `${id} calls a missing value empty`);
    assert.doesNotMatch(JSON.stringify(f), /\{[a-z_]+\}/, `${id} needs no placeholder`);
  }
  // Checked on DuckDB 1.5.6: INTERSECT keeps a missing value both parts hold, EXCEPT removes it, a join's = never matches it.
  assert.match(text(feedback['ERR-LOG-28']!), /INTERSECT/);
  assert.match(text(feedback['ERR-LOG-28']!), /EXCEPT/);
  assert.match(feedback['ERR-LOG-28']!.model, /IS NOT NULL/);
  assert.match(text(feedback['ERR-LOG-29']!), /first/);
  assert.match(feedback['ERR-LOG-29']!.model, /WHEN/);
});

// ---- D44: ERR-LOG-28 on SQL-SET-01 ------------------------------------------------------------------------------------------------

test('D44: the two missing-value plants of SQL-SET-01 are on ERR-LOG-28; one plant stays on ERR-LOG-00, as no existing ID fits it', async () => {
  const p = await plantsOf('EX-SQL-SET-01-');
  assert.deepEqual(p.get('ERR-LOG-28'), ['EX-SQL-SET-01-E1-02', 'EX-SQL-SET-01-E1-22']);
  assert.deepEqual(p.get('ERR-LOG-00'), ['EX-SQL-SET-01-E1-07']);
  assert.equal(p.get('ERR-LOG-27')?.length, 5);
  for (const id of ['EX-SQL-SET-01-E1-02', 'EX-SQL-SET-01-E1-22']) {
    assert.equal((await item(id)).version, 4, `${id}: its plants changed, so its version is raised`);
    assert.equal((await key(id)).item_version, 4, id);
  }
});
test('D44: a planted set-operator query that keeps a missing value is diagnosed ERR-LOG-28', { skip }, async () => {
  assert.equal(await plantsDiagnosed('EX-SQL-SET-01-E1-02', 'ERR-LOG-28'), 1);
  assert.equal(await plantsDiagnosed('EX-SQL-SET-01-E1-22', 'ERR-LOG-28'), 1);
});

// ---- D45: ERR-LOG-29 on SQL-CASE-01 -----------------------------------------------------------------------------------------------

/** The SQL-CASE-01 write items whose WHEN-order plant was on ERR-LOG-00 before sprint 4c. */
const WHEN_ORDER_ITEMS = ['EX-SQL-CASE-01-E2-01', 'EX-SQL-CASE-01-E2-03', 'EX-SQL-CASE-01-E2-04', 'EX-SQL-CASE-01-E2-05',
  'EX-SQL-CASE-01-E2-07', 'EX-SQL-CASE-01-E3-01', 'EX-SQL-CASE-01-E3-02'];
/** The SQL-CASE-01 choice items with a WHEN-order option. */
const WHEN_ORDER_CHOICES = ['EX-SQL-CASE-01-E2-41', 'EX-SQL-CASE-01-E2-42'];

test('D45: every SQL-CASE-01 WHEN-order plant is on ERR-LOG-29; the two plants left on ERR-LOG-00 are other mistakes', async () => {
  const p = await plantsOf('EX-SQL-CASE-01-');
  assert.deepEqual(p.get('ERR-LOG-29'), WHEN_ORDER_ITEMS);
  assert.deepEqual(p.get('ERR-LOG-00'), ['EX-SQL-CASE-01-E1-22', 'EX-SQL-CASE-01-E3-03']);
  for (const id of WHEN_ORDER_ITEMS) {
    assert.equal((await item(id)).version, 2, `${id}: its plants changed, so its version is raised`);
    assert.equal((await key(id)).item_version, 2, id);
  }
});
test('D45: a planted CASE whose earlier WHEN catches rows meant for a later one is diagnosed ERR-LOG-29', { skip }, async () => {
  for (const id of WHEN_ORDER_ITEMS) assert.equal(await plantsDiagnosed(id, 'ERR-LOG-29'), 1, id);
});
test('D45: the WHEN-order option of each SQL-CASE-01 choice item names ERR-LOG-29', async () => {
  for (const id of WHEN_ORDER_CHOICES) {
    const it = await item(id) as unknown as { id: string; version: number; options: { oid: string; text: string; misconception_id: string | null }[] };
    const k = await read<ChoiceKey>(`content/keys/sql-choice/${id}.json`);
    const opts = it.options.filter((o) => o.misconception_id === 'ERR-LOG-29');
    assert.equal(opts.length, 1, `${id}: one WHEN-order option`);
    assert.notEqual(opts[0]!.oid, k.correct_oid, id);
    assert.deepEqual(gradeChoice(it, k, opts[0]!.oid), { correct: false, error_ids: ['ERR-LOG-29'] }, id);
    assert.equal(it.version, 2, `${id}: an option's misconception changed, so its version is raised`);
    assert.equal(k.item_version, 2, id);
  }
});

// ---- D46: ERR-LOG-06 covers timestamps, DATE ranges and period boundaries --------------------------------------------------------

test('D46: ERR-LOG-06\'s feedback and template cover timestamps, DATE ranges and period boundaries such as weeks', () => {
  const f = feedback['ERR-LOG-06']!;
  assert.match(f.assumed, /^You probably expected /);
  for (const re of [/timestamp/i, /\bDATE\b/, /week/i, /month|quarter/i, /first day/i, /last day/i]) assert.match(text(f), re, String(re));
  assert.match(f.model, /half-open/);
  assert.doesNotMatch(text(f), /—/);
  assert.doesNotMatch(text(f), /\bempty\b/i);
  const t = errors.find((x) => x.id === 'ERR-LOG-06')!.feedback_template;
  for (const re of [/timestamp/i, /DATE/, /week/i]) assert.match(t, re, `template ${re}`);
});

// ---- D47: the two unplanted AGG mistakes ------------------------------------------------------------------------------------------

test('D47: each item now plants its common mistake under the ID whose feedback fits, and every plant is its own diagnosis', { skip }, async () => {
  const counts = async (id: string) => (await key(id)).planted_wrong.reduce<Record<string, number>>((m, p) => ({ ...m, [p.error_id]: (m[p.error_id] ?? 0) + 1 }), {});
  // EX-SQL-AGG-01-E3-02: the mistake the prompt's missing-value sentence names, now a third ERR-LOG-04 plant (it was diagnosed ERR-LOG-05).
  assert.equal((await counts('EX-SQL-AGG-01-E3-02'))['ERR-LOG-04'], 3);
  assert.equal(await plantsDiagnosed('EX-SQL-AGG-01-E3-02', 'ERR-LOG-04'), 3);
  // EX-SQL-AGG-03-E3-01: the mistake the prompt's missing-value sentence names, now an ERR-LOG-17 plant (it was diagnosed ERR-LOG-02).
  assert.equal((await counts('EX-SQL-AGG-03-E3-01'))['ERR-LOG-17'], 1);
  assert.equal(await plantsDiagnosed('EX-SQL-AGG-03-E3-01', 'ERR-LOG-17'), 1);
  for (const id of ['EX-SQL-AGG-01-E3-02', 'EX-SQL-AGG-03-E3-01']) {
    for (const e of Object.keys(await counts(id))) await plantsDiagnosed(id, e, true);
    assert.equal((await item(id)).version, 2, `${id}: a plant was added, so its version is raised`);
    assert.equal((await key(id)).item_version, 2, id);
  }
});

// ---- D48: ERR-OUT-02 names a whole number returned with decimals -------------------------------------------------------------------

test('D48: ERR-OUT-02\'s feedback names a whole number returned with decimals, as screen mode checks it', () => {
  const f = feedback['ERR-OUT-02']!;
  assert.match(f.assumed, /^You probably expected /);
  assert.match(text(f), /whole number/);
  assert.match(text(f), /2\.0/);
  assert.match(text(f), /[Ss]creen mode/);
  assert.match(text(f), /'10'/, 'the text-for-number case stays');
  assert.doesNotMatch(text(f), /—/);
});

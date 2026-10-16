// tests/tools/case-solver.test.ts: the case blind solver's tools (sprint 6, Task B3; the backlog's B2-M6). `npm run export:case-view`
// writes, per case, what a learner sees of its CP1, CP2, CP4 and CP5 (each prompt, its options or typed spec) with the case's title,
// brief, schema and schema notes; never a key, a truth, a model text or a credit. `npm run record:case-solver` grades the solver's
// answers (an oid for CP1 and CP5; a typed number or one SELECT for CP2 and CP4) and stores `solver: { <CP>: { pass, prompt_hash, at } }`
// in the case key, printing checkpoint IDs and PASS, FAIL or SKIP only. Every case, key and value here is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { casePromptHash, caseSolverView, exportCaseView } from '../../tools/export-case-view.ts';
import { recordCaseSolver } from '../../tools/record-case-solver.ts';
import { caseKeyHash } from '../../tools/case-key-hash.ts';
import { DAILY_ID, EXPLANATION, INBOX_ID, OPENER_ID, TRUTH_QUERY, makeCaseFixture, type CasePatch } from '../helpers/case-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const note = (schema: string, table: string, from_level?: number): TableNote => ({ schema, table, grain: `one row per ${table}`, primary_key: [`${table}_id`],
  foreign_keys: [], row_count: 3, sample: { columns: [`${table}_id`], rows: [[1]] }, ...(from_level ? { from_level } : {}) });
const NOTES = [note('voltmarkt', 'stores'), note('voltmarkt', 'orders', 3), note('mailvora', 'contacts')];
/** Model texts and a credit no view may hold. */
const patch: CasePatch = { records: (r) => {
  for (const x of [r.opener, r.inbox, r.daily]) { x.model_plan = 'An invented private model plan.'; x.model_answer_template = 'An invented private model answer {CP4}.'; }
} };
const tempDir = async (name: string) => join(await mkdtemp(join(tmpdir(), 'al-case-view-')), name);

test('export:case-view writes one view per case with its auto-graded checkpoints, and never a key, a truth, a model text or a credit', async () => {
  const f = await makeCaseFixture(patch);
  const notesFile = join(f.root, 'notes.json');
  await writeFile(notesFile, JSON.stringify(NOTES));
  // The export never opens a key: a key file that is not even JSON does not stop it.
  await writeFile(join(f.root, 'keys/cases', `${INBOX_ID}.json`), '{ "case_id": ');
  const out = await tempDir('cases');
  const written = await exportCaseView(f.root, out, notesFile);
  assert.deepEqual(written, [{ id: DAILY_ID, checkpoints: ['CP4'] }, { id: INBOX_ID, checkpoints: ['CP1', 'CP2', 'CP4', 'CP5'] }, { id: OPENER_ID, checkpoints: ['CP4'] }]);
  assert.deepEqual((await readdir(out)).sort(), [`${DAILY_ID}.json`, `${INBOX_ID}.json`, `${OPENER_ID}.json`]);
  const view = JSON.parse(await readFile(join(out, `${INBOX_ID}.json`), 'utf8'));
  assert.deepEqual(Object.keys(view), ['case_id', 'title', 'level', 'schema', 'brief', 'checkpoints', 'schema_notes']);
  assert.deepEqual([view.schema, view.brief, view.level], ['voltmarkt', { decision: 'Which stores to visit', deadline: 'Friday' }, 1]);
  assert.deepEqual(view.checkpoints.map((c: any) => [c.id, c.kind, Object.keys(c)]), [
    [`${INBOX_ID}:CP1`, 'CP1', ['id', 'kind', 'prompt', 'options']], [`${INBOX_ID}:CP2`, 'CP2', ['id', 'kind', 'prompt', 'typed']],
    [`${INBOX_ID}:CP4`, 'CP4', ['id', 'kind', 'prompt', 'typed']], [`${INBOX_ID}:CP5`, 'CP5', ['id', 'kind', 'prompt', 'options']]]);
  assert.deepEqual(view.schema_notes.map((n: TableNote) => n.table), ['stores'], 'its schema\'s notes, up to its level');
  for (const name of await readdir(out)) {
    const text = await readFile(join(out, name), 'utf8');
    for (const secret of [EXPLANATION, TRUTH_QUERY, 'invented private', 'correct', 'explanation', 'truth', 'choices', 'solver', 'credits', 'model_', '"value"']) {
      assert.ok(!text.includes(secret), `${name} holds no ${secret}`);
    }
  }
});

test('export:case-view clears an earlier export\'s case files, keeps other files, and refuses an output folder inside the content', async () => {
  const f = await makeCaseFixture();
  const out = await tempDir('cases');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'CASE-GONE-01.json'), '{}');
  await writeFile(join(out, 'notes.md'), 'kept');
  await exportCaseView(f.root, out, join(f.root, 'no-notes.json'));
  assert.deepEqual((await readdir(out)).sort(), [`${DAILY_ID}.json`, `${INBOX_ID}.json`, `${OPENER_ID}.json`, 'notes.md']);
  await assert.rejects(exportCaseView(f.root, join(f.root, 'views'), join(f.root, 'no-notes.json')), /outside the content folder/);
});

test('the prompt hash covers what the solver saw: the checkpoint, the case\'s title, brief and schema; not the credits or the model texts', async () => {
  const f = await makeCaseFixture();
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  const inbox = store.case!(INBOX_ID)!;
  const cp = inbox.checkpoints[0]!;
  const h = casePromptHash(inbox, cp);
  assert.match(h, /^[0-9a-f]{16}$/);
  const otherPlan = { ...inbox, model_plan: 'another invented plan' };
  const otherCredits = { ...cp, credits_concepts: ['SQL-AGG-01'] };
  assert.equal(casePromptHash(otherPlan, otherCredits), h);
  assert.equal(casePromptHash(inbox, { ...cp, options: [...cp.options!].reverse() }), h, 'the order of the options is not seen: each view shuffles them');
  for (const changed of [{ ...inbox, brief: { ...inbox.brief, deadline: 'Monday' } }, { ...inbox, title: 'Another title' }, { ...inbox, schema: 'voltmarkt_raw' }]) {
    assert.notEqual(casePromptHash(changed, cp), h);
  }
  assert.notEqual(casePromptHash(inbox, { ...cp, prompt: 'Another prompt?' }), h);
  // The hash rebuilt from an exported view is the record's.
  const view = caseSolverView(inbox, 'seed-x', []);
  assert.ok(view.checkpoints.every((c) => !('prompt_hash' in c)), 'a view carries no hash field');
});

// ---- record:case-solver --------------------------------------------------------------------------------------------------------

const runner = await startRunner(await makeFixtureDb([
  "SET TimeZone = 'UTC'", 'CREATE SCHEMA voltmarkt',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1, 'Amsterdam'), (2, 'Gent'), (3, 'Utrecht')) v(store_id, city)",
]));
after(() => runner.close());
const AT = new Date('2026-10-14T12:00:00Z');

/** A content root, its views exported, an answers folder, and the record run over whatever answers were written. */
async function solving(fixture: CasePatch = {}) {
  const f = await makeCaseFixture({ ...fixture, truths: (t) => { fixture.truths?.(t); t[`${INBOX_ID}:CP2`] = 3; t[`${INBOX_ID}:CP4`] = 2.5; } });
  const views = await tempDir('views');
  await exportCaseView(f.root, views, join(f.root, 'no-notes.json'));
  const answers = await tempDir('answers');
  await mkdir(answers, { recursive: true });
  const write = (name: string, text: string) => writeFile(join(answers, name), text);
  const record = async () => recordCaseSolver(await loadContent(f.root, { truthFile: f.truthFile }), f.root, answers, views, { runner: async () => runner, at: AT });
  const key = async (id: string) => JSON.parse(await readFile(join(f.root, 'keys/cases', `${id}.json`), 'utf8'));
  return { f, write, record, key, views };
}

test('record:case-solver grades an oid for CP1 and CP5 and stores pass or fail with the prompt hash; it prints IDs and outcomes only', async () => {
  const s = await solving();
  const k = await s.key(INBOX_ID);
  const store = await loadContent(s.f.root, { truthFile: s.f.truthFile });
  const inbox = store.case!(INBOX_ID)!;
  const wrong = inbox.checkpoints[4]!.options!.map((o) => o.oid).find((o) => o !== k.choices.CP5.correct_oid)!;
  await s.write(`${INBOX_ID}-CP1.txt`, `${k.choices.CP1.correct_oid}\n`);
  await s.write(`${INBOX_ID}-CP5.txt`, wrong);
  const lines = await s.record();
  assert.deepEqual(lines, [`PASS ${INBOX_ID}:CP1`, `FAIL ${INBOX_ID}:CP5`]);
  const after = await s.key(INBOX_ID);
  assert.deepEqual(after.solver, {
    CP1: { pass: true, prompt_hash: casePromptHash(inbox, inbox.checkpoints[0]!), key_hash: caseKeyHash('CP1', k, undefined), at: AT.toISOString() },
    CP5: { pass: false, prompt_hash: casePromptHash(inbox, inbox.checkpoints[4]!), key_hash: caseKeyHash('CP5', k, undefined), at: AT.toISOString() },
  });
  assert.deepEqual([after.truths, after.choices], [k.truths, k.choices], 'the rest of the key is unchanged');
  for (const l of lines) assert.ok(!l.includes(k.choices.CP1.correct_oid) && !l.includes(wrong), 'no oid printed');
  for (const l of lines) assert.ok(!l.includes(after.solver.CP1.key_hash) && !l.includes(after.solver.CP5.key_hash), 'no hash printed');
});

test('record:case-solver grades CP2 and CP4 as typed numbers, a typed answer or one SELECT run on the case\'s schema', async () => {
  const s = await solving();
  await s.write(`${INBOX_ID}-CP2.txt`, '3');
  await s.write(`${INBOX_ID}-CP4.sql`, 'SELECT round(avg(store_id) + 0.5, 2) FROM stores');
  await s.write(`${OPENER_ID}-CP4.sql`, 'SELECT store_id FROM stores');
  await s.write(`${DAILY_ID}-CP4.sql`, 'SELECT 1; SELECT 2');
  const lines = await s.record();
  assert.deepEqual(lines, [`FAIL ${DAILY_ID}:CP4 (not one SELECT that returns one number)`, `PASS ${INBOX_ID}:CP2`, `PASS ${INBOX_ID}:CP4`,
    `FAIL ${OPENER_ID}:CP4 (not one SELECT that returns one number)`]);
  assert.deepEqual(Object.values((await s.key(INBOX_ID)).solver).map((r: any) => r.pass), [true, true]);
  assert.equal((await s.key(OPENER_ID)).solver.CP4.pass, false);
});

test('record:case-solver skips an answer whose checkpoint changed since the export, an unknown case or checkpoint, and a checkpoint with no value built', async () => {
  const s = await solving({ truths: (t) => { delete t[`${DAILY_ID}:CP4`]; } });
  const k = await s.key(INBOX_ID);
  // The prompt is edited after the export: the solver answered another question.
  const file = join(s.f.root, 'sql/cases', `${INBOX_ID}.json`);
  const rec = JSON.parse(await readFile(file, 'utf8'));
  rec.checkpoints[0].prompt = 'An edited invented scope question?';
  await writeFile(file, JSON.stringify(rec));
  await s.write(`${INBOX_ID}-CP1.txt`, k.choices.CP1.correct_oid);
  await s.write('CASE-NOPE-01-CP1.txt', 'o0000000');
  await s.write(`${INBOX_ID}-CP3.txt`, 'x');
  await s.write(`${DAILY_ID}-CP4.txt`, '7');
  await s.write('notes.md', 'not an answer');
  assert.deepEqual(await s.record(), [
    `SKIP ${DAILY_ID}:CP4 (no value built; run npm run build:data)`, 'SKIP CASE-NOPE-01-CP1.txt (unknown case)',
    `SKIP ${INBOX_ID}:CP1 (the checkpoint changed since the export; run export:case-view)`, `SKIP ${INBOX_ID}-CP3.txt (not a CP1, CP2, CP4 or CP5 answer)`,
  ]);
  assert.equal((await s.key(INBOX_ID)).solver, undefined, 'nothing written');
});

test('K1: record:case-solver stores the fingerprint of the value a CP2 or CP4 was graded against; no value is printed', async () => {
  const s = await solving();
  await s.write(`${INBOX_ID}-CP2.txt`, '3');
  const lines = await s.record();
  const k = await s.key(INBOX_ID);
  assert.equal(k.solver.CP2.key_hash, caseKeyHash('CP2', k, 3));
  for (const l of lines) assert.ok(!l.includes(k.solver.CP2.key_hash), 'no hash printed');
});

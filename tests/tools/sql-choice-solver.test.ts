// Task C4: the SQL choice kinds in the choice blind-solver tools (S3-13). export:choice-view writes each active SQL choice
// item's view (id, kind, prompt, schema, shown_sql, options in a seeded shuffle, the typed spec or the unique check; never the
// key) to sql/<concept>/; record:choice-solver grades sql/<id>.txt answers and writes the record into keys/sql-choice/; and the
// write items' solver view leaves the choice kinds out. Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { optionId, type ChoiceKey } from '../../schemas/choice.ts';
import { CHOICE_GRADER_VERSION } from '../../server/choice/grade.ts';
import { sqlChoicePromptHash } from '../../tools/check-sql-choice.ts';
import { DEFAULT_SEED, exportChoiceView, sqlChoiceView, sqlViewPromptHash } from '../../tools/export-choice-view.ts';
import { exportSolverView } from '../../tools/export-solver-view.ts';
import { recordSqlChoiceSolver } from '../../tools/record-choice-solver.ts';
import { FIXTURE_CONCEPT, makeContentFixture } from '../helpers/content-fixture.ts';
import { ALL_KINDS, IDS, sqlChoiceItem, sqlChoiceKey, writeSqlChoice } from '../helpers/sql-choice-fixture.ts';

const AT = new Date('2026-10-05T10:00:00Z');
const root = async () => { const r = await makeContentFixture(); await writeSqlChoice(r); return r; };
const outDir = async () => join(await mkdtemp(join(tmpdir(), 'al-cview-')), 'choice');
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

test('an SQL choice view holds what the learner sees: id, kind, prompt, schema, and the kind\'s own fields, never the key', () => {
  const pr = sqlChoiceItem('predict_result');
  const view = sqlChoiceView(pr, DEFAULT_SEED);
  assert.deepEqual(Object.keys(view), ['id', 'kind', 'prompt', 'schema', 'shown_sql', 'options']);
  for (const o of view.options!) assert.deepEqual(Object.keys(o), ['oid', 'text', 'table']);
  assert.deepEqual(view.options!.map((o) => o.oid).sort(), pr.options!.map((o) => o.oid).sort());
  assert.deepEqual(sqlChoiceView(sqlChoiceItem('predict_rows'), DEFAULT_SEED), { id: IDS.predict_rows, kind: 'predict_rows', prompt: sqlChoiceItem('predict_rows').prompt,
    schema: 'voltmarkt', shown_sql: sqlChoiceItem('predict_rows').shown_sql, typed: { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'rows' } });
  assert.deepEqual(Object.keys(sqlChoiceView(sqlChoiceItem('is_unique'), DEFAULT_SEED)), ['id', 'kind', 'prompt', 'schema', 'options', 'unique_check']);
  for (const o of sqlChoiceView(sqlChoiceItem('choose_query'), DEFAULT_SEED).options!) assert.deepEqual(Object.keys(o), ['oid', 'text']);
  assert.doesNotMatch(JSON.stringify(ALL_KINDS.map((k) => sqlChoiceView(sqlChoiceItem(k), DEFAULT_SEED))),
    /MIS-FAKE|misconception|explanation|correct|solver|edge|difficulty|template|hints|concept/);
});

test('sqlViewPromptHash rebuilds the item\'s hash from its view, in any seed; a GA4 view is not an SQL view', () => {
  for (const kind of ALL_KINDS) {
    const item = sqlChoiceItem(kind);
    for (const seed of [DEFAULT_SEED, 'round-2']) assert.equal(sqlViewPromptHash(sqlChoiceView(item, seed)), sqlChoicePromptHash(item), `${kind} ${seed}`);
  }
  assert.equal(sqlViewPromptHash({ id: 'Q-GA4-901', stem: 'x', options: [] }), null);
  assert.equal(sqlViewPromptHash(null), null);
});

test('exportChoiceView writes the active SQL choice items under sql/<concept>/, and the write items\' solver view leaves them out', async () => {
  const r = await root();
  const retired = { ...sqlChoiceItem('which_table'), status: 'retired' as const };
  await writeFile(join(r, 'sql/items', `${retired.id}.json`), JSON.stringify(retired));
  const out = await outDir();
  const groups = await exportChoiceView(r, out);
  assert.deepEqual(groups, [{ section: 'sql', group: FIXTURE_CONCEPT, ids: [IDS.predict_rows, IDS.predict_result, IDS.choose_query, IDS.is_unique] }]);
  assert.deepEqual(await read(join(out, 'sql', FIXTURE_CONCEPT, `${IDS.choose_query}.json`)), sqlChoiceView(sqlChoiceItem('choose_query'), DEFAULT_SEED));
  const all = JSON.stringify(await Promise.all(groups[0]!.ids.map((id) => read(join(out, 'sql', FIXTURE_CONCEPT, `${id}.json`)))));
  for (const k of ALL_KINDS) assert.ok(!all.includes(sqlChoiceKey(k).explanation), k);
  // A second export clears the first: the folder holds this export's files only.
  await exportChoiceView(r, out);
  assert.equal((await readdir(join(out, 'sql', FIXTURE_CONCEPT))).length, 4);
  const sqlOut = join(await mkdtemp(join(tmpdir(), 'al-sview-')), 'v');
  const ids = await exportSolverView(r, sqlOut);
  assert.equal(ids.length, 13, 'the 13 write items of the fixture, and no choice item');
  assert.ok(ids.every((id) => !Object.values(IDS).includes(id)));
});

test('a right SQL choice answer leaves a record with the SQL choice prompt hash; a wrong or unreadable one leaves the key alone', () => {
  const cq = sqlChoiceItem('choose_query');
  const key = sqlChoiceKey('choose_query');
  const r = recordSqlChoiceSolver(cq, key, ` ${optionId(cq.id, 0)}\n`, AT);
  assert.deepEqual(r, { ok: true, why: '', key: { ...key, solver: { prompt_hash: sqlChoicePromptHash(cq), grader_version: CHOICE_GRADER_VERSION,
    chosen: optionId(cq.id, 0), typed: null, at: AT.toISOString() } } });
  assert.deepEqual(recordSqlChoiceSolver(cq, key, optionId(cq.id, 1), AT), { ok: false, key, why: '' });
  assert.deepEqual(recordSqlChoiceSolver(cq, key, 'the first query', AT), { ok: false, key, why: 'not one of the options' });
  const rows = sqlChoiceItem('predict_rows');
  const rowsKey = sqlChoiceKey('predict_rows');
  assert.equal(recordSqlChoiceSolver(rows, rowsKey, '2', AT).key.solver?.typed, '2');
  assert.deepEqual(recordSqlChoiceSolver(rows, rowsKey, '2.5', AT), { ok: false, key: rowsKey, why: 'not a number the app accepts' }, 'a count is a whole number');
  assert.deepEqual(recordSqlChoiceSolver(rows, rowsKey, '3', AT), { ok: false, key: rowsKey, why: '' });
});

test('the CLI grades sql/<id>.txt answers against their exported views and writes keys/sql-choice/<id>.json, printing IDs only', async () => {
  const r = await root();
  const views = await outDir();
  await exportChoiceView(r, views);
  const before = await readFile(join(r, 'keys/sql-choice', `${IDS.which_table}.json`), 'utf8');
  const dir = join(await mkdtemp(join(tmpdir(), 'al-cout-')), 'choice');
  await mkdir(join(dir, 'sql'), { recursive: true });
  const put = (id: string, text: string) => writeFile(join(dir, 'sql', `${id}.txt`), text);
  await put(IDS.predict_rows, '2\n');
  await put(IDS.choose_query, optionId(IDS.choose_query, 0));
  await put(IDS.which_table, optionId(IDS.which_table, 1));
  await put(IDS.is_unique, 'Yes');
  await put('EX-SQL-FILTER-02-E1-01', optionId('EX-SQL-FILTER-02-E1-01', 0));      // a write item: not an SQL choice item
  const { stdout } = await promisify(execFile)(process.execPath, ['tools/record-choice-solver.ts', r, dir, views]);
  assert.deepEqual(stdout.trim().split(/\r?\n/), [
    `SKIP EX-SQL-FILTER-02-E1-01 (unknown item)`, `PASS ${IDS.predict_rows}`, `PASS ${IDS.choose_query}`, `FAIL ${IDS.which_table}`,
    `FAIL ${IDS.is_unique} (not one of the options)`, '2 passed, 2 failed, 1 skipped',
  ]);
  const saved = await read(join(r, 'keys/sql-choice', `${IDS.choose_query}.json`)) as ChoiceKey;
  assert.equal(saved.solver?.prompt_hash, sqlChoicePromptHash(sqlChoiceItem('choose_query')));
  assert.equal((await read(join(r, 'keys/sql-choice', `${IDS.predict_rows}.json`)) as ChoiceKey).solver?.typed, '2');
  assert.equal(await readFile(join(r, 'keys/sql-choice', `${IDS.which_table}.json`), 'utf8'), before, 'a FAIL leaves the key file byte for byte');
  assert.doesNotMatch(stdout, /o[0-9a-f]{7}|stores|Yes|SELECT/);
  // An item changed since the export is skipped.
  const changed = { ...sqlChoiceItem('choose_query'), prompt: 'Which invented query, now reworded, shows the city of store 2?' };
  await writeFile(join(r, 'sql/items', `${changed.id}.json`), JSON.stringify(changed));
  const again = await promisify(execFile)(process.execPath, ['tools/record-choice-solver.ts', r, dir, views]);
  assert.match(again.stdout, new RegExp(`SKIP ${IDS.choose_query} \\(the item changed since the export\\)`));
});

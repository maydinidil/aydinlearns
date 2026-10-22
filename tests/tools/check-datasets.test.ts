// tests/tools/check-datasets.test.ts: content check C51 (sprint 6 Part 2, Task G2; S6-21, ruling P35) and the registry's loader
// (server/content.ts). C51: each registry record validates (validateDataset), names a prep script that exists, and shares no ID,
// alias or schema with another record; a real dataset has no questions yet or at least 5 (P35); every real case reads a schema of a
// real registry dataset, and every case on a registry schema agrees with it on `real` and the licence. The backlog row "Case build
// and inbox details": an item on a registry dataset's schema that the database does not hold is skipped by name, as its case is.
// Also the real datasets' edge descriptions (S6-23). Every record, case and item here is invented, apart from the committed files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { checkDatasets, REAL_DATASET_QUESTIONS, unbuiltItems, type CheckResult } from '../../tools/check-content.ts';
import type { DatasetRecord } from '../../schemas/dataset.ts';
import type { CaseRecord } from '../../schemas/case.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { openerRecord } from '../helpers/case-fixture.ts';

const SHA = 'cd'.repeat(32);
const record = (id: string, patch: Partial<DatasetRecord> = {}): DatasetRecord => ({
  id, aliases: [], name: `Invented ${id}`, owner: 'An invented owner',
  licence: { name: 'CC BY 4.0', url: null, terms: 'Share and adapt, with credit.' },
  real: true, label: 'Real data: invented. Licence: CC BY 4.0.', source_url: 'https://example.org/dataset',
  files: [{ name: `${id.toLowerCase()}.zip`, sha256: SHA }], schemas: [{ name: `${id.toLowerCase().replace(/-/g, '_')}`, title: 'Invented' }],
  prep: 'pipeline/datasets/invented.py', questions: [], links: [], notes: [], ...patch,
});
const questions = (id: string, n: number) => Array.from({ length: n }, (_, k) => ({ id: `${id}-Q${k + 1}`, text: `Invented question ${k + 1} on December 2010?` }));
const realCase = (id: string, schema: string, patch: Partial<CaseRecord> = {}): CaseRecord => ({
  ...openerRecord(), case_id: id, kind: 'inbox', schema, data_source: { label: 'Real data: invented', real: true, licence: 'CC BY 4.0' }, ...patch,
} as CaseRecord);
const store = (records: unknown[], cases: CaseRecord[] = []): ContentStore => ({ datasetRecords: () => records, cases: () => cases } as unknown as ContentStore);
const exists = (p: string) => p === 'pipeline/datasets/invented.py';
const byId = (rs: CheckResult[], id: string) => rs.find((r) => r.id === id);
const failing = (rs: CheckResult[], id: string, pattern: RegExp) => {
  const r = byId(rs, id);
  assert.ok(r, `a C51 result for ${id}`);
  assert.equal(r.check, 'C51');
  assert.equal(r.ok, false, `${id} should fail`);
  assert.match(r.detail, pattern);
};

test('C51: valid records with their prep scripts pass, one result each, named by ID', () => {
  const rs = checkDatasets(store([record('DS-RETAIL-02'), record('CH-01', { real: false, label: 'Fictional data.', licence: { name: 'No licence stated', url: null, terms: 'None stated.' } })]), exists);
  assert.deepEqual(rs.map((r) => [r.id, r.check, r.ok]), [['DS-RETAIL-02', 'C51', true], ['CH-01', 'C51', true]]);
});

test('C51: an invalid record, a missing prep script, and an ID, alias or schema used twice fail', () => {
  failing(checkDatasets(store([record('DS-RETAIL-02', { real: undefined as unknown as boolean })]), exists), 'DS-RETAIL-02', /real must be true or false/);
  failing(checkDatasets(store([record('DS-RETAIL-02', { prep: 'pipeline/datasets/gone.py' })]), exists), 'DS-RETAIL-02', /pipeline\/datasets\/gone\.py does not exist/);
  const twice = checkDatasets(store([record('DS-RETAIL-02'), record('DS-RETAIL-02', { schemas: [{ name: 'other', title: 'x' }] })]), exists);
  failing(twice, 'DS-RETAIL-02', /the ID DS-RETAIL-02 is used by 2 records/);
  failing(checkDatasets(store([record('DS-RETAIL-02'), record('CH-01', { aliases: ['DS-RETAIL-02'] })]), exists), 'CH-01', /the alias DS-RETAIL-02 is another record's ID or alias/);
  failing(checkDatasets(store([record('DS-RETAIL-02'), record('CH-01', { schemas: [{ name: 'ds_retail_02', title: 'x' }] })]), exists), 'CH-01', /the schema ds_retail_02 is also DS-RETAIL-02's/);
  failing(checkDatasets(store([null]), exists), 'registry record #1', /a dataset record must be an object/);
});

test('P35: a real dataset has no questions yet (H2 writes them) or at least 5; 1 to 4 fail; a fictional one may have none', () => {
  for (const n of [0, 5, 6]) assert.equal(byId(checkDatasets(store([record('DS-RETAIL-02', { questions: questions('DS-RETAIL-02', n) })]), exists), 'DS-RETAIL-02')?.ok, true, `${n}`);
  for (const n of [1, 4]) failing(checkDatasets(store([record('DS-RETAIL-02', { questions: questions('DS-RETAIL-02', n) })]), exists), 'DS-RETAIL-02', /a real dataset needs at least 5 questions \(it has \d\)/);
});

test('C51: every real case reads a schema of a real registry dataset, and agrees with it on real and the licence', () => {
  const datasets = [record('DS-RETAIL-02'), record('CH-01', { real: false, label: 'Fictional data.', licence: { name: 'No licence stated', url: null, terms: 'x' }, schemas: [{ name: 'foodie_fi', title: 'Foodie-Fi' }] })];
  const ok = checkDatasets(store(datasets, [realCase('CASE-REAL-01', 'ds_retail_02'), { ...openerRecord() } as CaseRecord]), exists);
  assert.equal(byId(ok, 'CASE-REAL-01')?.ok, true);
  assert.equal(byId(ok, openerRecord().case_id), undefined, 'a Voltmarkt case is not C51\'s');
  failing(checkDatasets(store(datasets, [realCase('CASE-REAL-01', 'nowhere')]), exists), 'CASE-REAL-01', /a real-data case must read a schema of a real registry dataset: nowhere is in none/);
  failing(checkDatasets(store(datasets, [realCase('CASE-REAL-01', 'foodie_fi')]), exists), 'CASE-REAL-01', /foodie_fi is CH-01's, which the registry marks fictional/);
  failing(checkDatasets(store(datasets, [realCase('CASE-REAL-01', 'ds_retail_02', { data_source: { label: 'x', real: true, licence: 'CC0' } })]), exists),
    'CASE-REAL-01', /data_source\.licence must be CC BY 4\.0, DS-RETAIL-02's licence/);
  failing(checkDatasets(store(datasets, [realCase('CASE-X-01', 'ds_retail_02', { data_source: { label: 'x', real: false, licence: null } })]), exists),
    'CASE-X-01', /reads ds_retail_02, DS-RETAIL-02's schema, so data_source\.real must be true/);
});

const item = (id: string, schema: string, edge: string) => ({ id, status: 'active', schema, edge_schema: edge }) as unknown as SqlItem;

test('the backlog row: an item on a registry schema the database does not hold is skipped by name; any other item is not', () => {
  const s = { datasetOfSchema: (x: string) => (x === 'online_retail_ii' ? record('DS-RETAIL-02') : undefined) } as unknown as ContentStore;
  const items = [item('EX-CASE-REAL-01', 'online_retail_ii', 'online_retail_ii_edge'), item('EX-TYPO-01', 'voltmarkt_rw', 'voltmarkt_edge_basics'), item('EX-OK-01', 'voltmarkt', 'voltmarkt_edge_basics')];
  const built = new Set(['voltmarkt', 'voltmarkt_edge_basics', 'online_retail_ii_edge']);
  const rs = unbuiltItems(items, built, s);
  assert.deepEqual(rs.map((r) => [r.id, r.check, r.ok, r.warn]), [['EX-CASE-REAL-01', 'C51', false, true]]);
  assert.match(rs[0]!.detail, /^skipped: the database has no schema online_retail_ii, so the item waits until DS-RETAIL-02 is prepared/);
  assert.deepEqual(unbuiltItems(items, new Set([...built, 'online_retail_ii']), s), [], 'prepared: checked like any item');
  assert.deepEqual(unbuiltItems(items, null, s), [], 'schemas unreadable: C41 fails once, nothing is skipped');
});

test('the loader: the registry\'s valid records, found by ID, alias or schema; a missing file is no datasets; a malformed one stops the load', async () => {
  const root = await makeContentFixture();
  assert.deepEqual((await loadContent(root)).datasets?.(), [], 'no registry yet');
  await mkdir(join(root, 'datasets'), { recursive: true });
  const ch = record('CH-01', { aliases: ['DS-SAAS-04'], real: false, label: 'Fictional data.', licence: { name: 'No licence stated', url: null, terms: 'x' },
    schemas: [{ name: 'foodie_fi', title: 'Foodie-Fi' }, { name: 'data_mart', title: 'Data Mart' }],
    files: [{ name: 'a.sql', sha256: SHA, schema: 'foodie_fi' }, { name: 'b.sql', sha256: SHA, schema: 'data_mart' }] });
  await writeFile(join(root, 'datasets/registry.json'), JSON.stringify({ datasets: [record('DS-RETAIL-02'), ch, { id: 'DS-BROKEN-01' }] }));
  const s = await loadContent(root);
  assert.deepEqual(s.datasets?.().map((d) => d.id), ['DS-RETAIL-02', 'CH-01'], 'an invalid record is left out (C51 names it)');
  assert.equal(s.datasetRecords?.().length, 3, 'C51 sees every record as loaded');
  assert.equal(s.dataset?.('DS-SAAS-04')?.id, 'CH-01', 'by alias');
  assert.equal(s.dataset?.('DS-BROKEN-01'), undefined);
  assert.equal(s.datasetOfSchema?.('data_mart')?.id, 'CH-01');
  assert.equal(s.datasetOfSchema?.('voltmarkt'), undefined);
  const before = s.contentVersion;
  await writeFile(join(root, 'datasets/registry.json'), JSON.stringify({ datasets: [record('DS-RETAIL-02')] }));
  assert.notEqual((await loadContent(root)).contentVersion, before, 'the registry is part of the content version');
  await writeFile(join(root, 'datasets/registry.json'), JSON.stringify({ datasets: { id: 'x' } }));
  await assert.rejects(loadContent(root), /datasets\/registry\.json: "datasets" must be a list/);
});

test('the committed registry passes C51, with the case records as they are', async () => {
  const s = await loadContent('content');
  const rs = checkDatasets(s, (p) => existsSync(p));
  assert.deepEqual(rs.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`), []);
  assert.deepEqual(s.datasets?.().map((d) => [d.id, d.real, d.schemas.length]), [['DS-RETAIL-02', true, 1], ['DS-PRICE-101', true, 1], ['CH-01', false, 8]]);
  assert.equal(s.dataset?.('DS-SAAS-04')?.id, 'CH-01', 'E-062: Foodie-Fi\'s ID is an alias of CH-01');
  // D87: the challenge's record holds names, schemas, file names, fingerprints and links only.
  const ch = s.dataset?.('CH-01')!;
  assert.deepEqual(ch.questions, []);
  assert.deepEqual(ch.schemas.map((x) => x.name), ['dannys_diner', 'pizza_runner', 'foodie_fi', 'data_bank', 'data_mart', 'clique_bait', 'balanced_tree', 'fresh_segments']);
  assert.ok(ch.schemas.every((x, k) => x.page === `https://8weeksqlchallenge.com/case-study-${k + 1}/`));
});

test('P35 (Task H2): every real dataset in the committed registry, whatever its ID, has its manager questions, each <id>-Q<n> and unique', async () => {
  const file = JSON.parse(await readFile('content/datasets/registry.json', 'utf8')) as { datasets: DatasetRecord[] };
  const real = file.datasets.filter((d) => d.real === true);
  assert.ok(real.length > 0, 'the registry holds real datasets');   // S7-30: every real record is asserted, whatever its ID, so a third one is covered too
  for (const d of real) {
    const ids = d.questions.map((q) => q.id);
    assert.ok(ids.length >= REAL_DATASET_QUESTIONS, `${d.id} has ${ids.length} questions; a real dataset needs at least ${REAL_DATASET_QUESTIONS}`);
    for (const id of ids) assert.match(id, new RegExp(`^${d.id}-Q[1-9]\\d*$`), `${id} is not ${d.id}-Q<n>`);
    assert.equal(new Set(ids).size, ids.length, `${d.id}'s question IDs are unique`);
  }
});

// S6-23: the real datasets' edge descriptions, in the S6-05 shape: every line assigned to a table its SQL file creates.
for (const schema of ['online_retail_ii_edge', 'breakfast_at_the_frat_edge']) {
  test(`S6-23: ${schema}'s description assigns each line to a table its SQL file creates`, async () => {
    const d = JSON.parse(await readFile(`content/sql/edge/${schema}.json`, 'utf8')) as EdgeDescription;
    const sql = await readFile(`pipeline/edge/${schema}.sql`, 'utf8');
    const created = new Set([...sql.matchAll(new RegExp(`CREATE TABLE ${schema}\\.(\\w+)`, 'g'))].map((m) => m[1]!));
    assert.equal(d.schema, schema);
    assert.equal(d.mirrors, schema.replace(/_edge$/, ''));
    assert.ok(d.tables && Object.keys(d.tables).length > 0);
    const assigned = new Set(Object.values(d.tables).flat());
    for (const line of d.contains) assert.ok(assigned.has(line), `"${line}" is assigned to no table`);
    for (const [table, lines] of Object.entries(d.tables)) {
      assert.ok(created.has(table), `${schema}.sql creates no table ${table}`);
      assert.deepEqual(lines, d.contains.filter((l) => lines.includes(l)), `${table} keeps the lines in their order`);
    }
    assert.doesNotMatch(JSON.stringify(d), /\bNULL\b|\bempty\b|—/, 'NULL is "missing", no em dash');
  });
}

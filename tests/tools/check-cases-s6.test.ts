// tests/tools/check-cases-s6.test.ts: content check C41 repaired, sprint 6 (Task B3; sprint 4b B2-M2 to B2-M4 and B2-M6, the C1 fix
// report's note 5, S4C-05, S6-13). Every repaired line fails once and passes once:
// - the key named for another case (now reachable: a key is the file named after its case) and a key file with no case;
// - a model answer placeholder for a checkpoint the case does not list;
// - a daily case's level, which equals its highest credited concept's level;
// - the truth query, parsed by the runner's gate (one statement, a SELECT, no schema named) and run on the case's own schema (S6-13)
//   and on its CP3 item's edge schema (S4C-05), where it must return one number; a value that is not what the query returns now;
// - a stale truth (the key changed since the last build) and a case on a schema the database does not hold (skipped by name);
// - the F2 seams fix round: a failed schema query fails C41 once, instead of skipping every case as unavailable.
// Every case, key and value here is invented; no detail quotes a query or a value.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startRunner, type RunnerClient } from '../../server/runner/client.ts';
import type { RunnerError } from '../../server/runner/protocol.ts';
import { loadContent } from '../../server/content.ts';
import { checkCases, checkCasesOnDb, type CheckResult } from '../../tools/check-content.ts';
import { DAILY_ID, INBOX_ID, OPENER_ID, makeCaseFixture, type CasePatch } from '../helpers/case-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

// The database: voltmarkt and the fixture items' edge schema hold stores; mailvora holds its own stores, with another count.
const runner = await startRunner(await makeFixtureDb([
  "SET TimeZone = 'UTC'",
  'CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics', 'CREATE SCHEMA mailvora',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1, 'Amsterdam'), (2, 'Gent'), (3, 'Utrecht')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (7, 'Liège'), (8, 'Den Haag')) v(store_id, city)",
  "CREATE TABLE mailvora.stores AS SELECT * FROM (VALUES (1, 'a'), (2, 'b'), (3, 'c'), (4, 'd'), (5, 'e')) v(store_id, city)",
  "CREATE TABLE voltmarkt.only_visible AS SELECT 1 AS n",
]));
after(() => runner.close());
const SCHEMAS = new Set(['voltmarkt', 'voltmarkt_edge_basics', 'mailvora']);
const COUNT = 'SELECT count(*) FROM stores';
const AVG = 'SELECT round(avg(store_id), 2) FROM stores';

/** Every truth query is a real one on this database, and each value is what it returns on voltmarkt. */
const real: CasePatch = {
  keys: (ks) => { for (const k of ks) for (const cp of Object.keys(k.truths)) k.truths[cp] = cp === 'CP2' ? COUNT : AVG; },
  truths: (t) => { for (const key of Object.keys(t)) t[key] = key.endsWith(':CP2') ? 3 : 2; },
};
const join2 = (a: CasePatch, b: CasePatch): CasePatch => ({
  records: (r) => { a.records?.(r); b.records?.(r); }, keys: (k) => { a.keys?.(k); b.keys?.(k); }, items: (i) => { a.items?.(i); b.items?.(i); },
  truths: (t) => { a.truths?.(t); b.truths?.(t); }, file: (f) => { a.file?.(f); b.file?.(f); },
});
async function run(patch: CasePatch = {}, db = true): Promise<CheckResult[]> {
  const f = await makeCaseFixture(join2(real, patch));
  return checkCases(await loadContent(f.root, { truthFile: f.truthFile }), db ? { db: { runner, schemas: SCHEMAS } } : {});
}
const SECRETS = [COUNT, AVG, 'invented_case_truth_marker'];
/** The C41 result named `id`, which must fail, every other C41 result passing; its detail, which quotes no query. */
async function failing(id: string, patch: CasePatch, db = true): Promise<string> {
  const results = (await run(patch, db)).filter((r) => r.check === 'C41');
  const r = results.find((x) => x.id === id);
  assert.ok(r, `a C41 result for ${id}`);
  assert.equal(r.ok, false, `${id} should fail`);
  for (const other of results.filter((x) => x.id !== id)) assert.equal(other.ok, true, `${other.id} still passes: ${other.detail}`);
  for (const s of SECRETS) assert.ok(!r.detail.includes(s), 'the detail quotes no truth query');
  return r.detail;
}

test('C41 with the database: the fixture\'s three cases pass, one result each', async () => {
  const results = await run();
  assert.deepEqual(results.filter((r) => r.check === 'C41').map((r) => [r.id, r.ok, r.detail]), [[DAILY_ID, true, ''], [INBOX_ID, true, ''], [OPENER_ID, true, '']]);
});

test('B2-M2: a key file holding another case\'s ID fails ("the key names another case"); its own ID passes', async () => {
  const f = await makeCaseFixture(join2(real, { keys: (ks) => { ks.find((k) => k.case_id === DAILY_ID)!.case_id = 'CASE-DAILY-L1-09'; } }));
  await rename(join(f.root, 'keys/cases', 'CASE-DAILY-L1-09.json'), join(f.root, 'keys/cases', `${DAILY_ID}.json`));
  const r = (await checkCases(await loadContent(f.root, { truthFile: f.truthFile }))).find((x) => x.id === DAILY_ID)!;
  assert.deepEqual([r.ok, /the key names another case/.test(r.detail)], [false, true]);
});

test('B2-M2: a key file named after no case fails, by its file name; removed, every result passes', async () => {
  const f = await makeCaseFixture(join2(real, { keys: (ks) => { ks.push({ ...structuredClone(ks[0]!), case_id: 'CASE-NOPE-01' }); } }));
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  const r = (await checkCases(store)).find((x) => x.id === 'keys/cases/CASE-NOPE-01.json');
  assert.deepEqual([r?.check, r?.ok, r?.detail], ['C41', false, 'a case key with no case of its name in content/sql/openers/, content/sql/cases/ or content/sql/mocks/']);
  await rm(join(f.root, 'keys/cases/CASE-NOPE-01.json'));
  assert.ok((await checkCases(await loadContent(f.root, { truthFile: f.truthFile }))).every((x) => x.ok));
});

test('B2-M2: a model answer placeholder must name a CP2 or CP4 the case lists (S4B-10)', async () => {
  assert.match(await failing(DAILY_ID, { records: (r) => { r.daily.model_answer_template = 'An invented answer: {CP2} and {CP4}.'; } }, false),
    /model_answer_template fills \{CP2\}, but the case has no CP2/);
});

test('B2-M3: a daily case\'s level equals its highest credited concept\'s level', async () => {
  // The daily case credits two level 1 concepts; as a level 2 case its ID must say L2 too.
  const detail = await failing('CASE-DAILY-L2-01', { records: (r) => { r.daily.level = 2; r.daily.case_id = 'CASE-DAILY-L2-01';
    r.daily.checkpoints[1].item_id = 'CASE-DAILY-L2-01:CP4'; r.daily.checkpoints[1].truth_key = 'CASE-DAILY-L2-01:CP4'; r.daily.checkpoints[0].item_id = 'EX-CASE-DAILY-L2-01'; },
  items: (i) => { i['EX-CASE-DAILY-L2-01'] = { ...i['EX-CASE-DAILY-L1-01']!, id: 'EX-CASE-DAILY-L2-01' }; },
  keys: (ks) => { ks.find((k) => k.case_id === DAILY_ID)!.case_id = 'CASE-DAILY-L2-01'; },
  truths: (t) => { t['CASE-DAILY-L2-01:CP4'] = 2; } }, false);
  assert.match(detail, /a daily case's level must be 1, the level of its highest credited concept/);
});

test('B2-M4: the truth query is parsed by the runner\'s gate: two statements, an INSERT or a schema name fail; one SELECT passes', async () => {
  const truth = (q: string): CasePatch => ({ keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.truths.CP2 = q; } });
  assert.match(await failing(INBOX_ID, truth(`${COUNT}; ${COUNT}`)), /the truth query for CP2 must be one statement/);
  assert.match(await failing(INBOX_ID, truth('WITH s AS (SELECT 1 AS n) INSERT INTO stores SELECT n, n FROM s')), /the truth query for CP2 must be one SELECT/);
  assert.match(await failing(INBOX_ID, truth('SELECT count(*) FROM voltmarkt.stores')), /the truth query for CP2 must name its tables without a schema/);
  assert.equal((await run(truth(`WITH s AS (SELECT store_id FROM stores) SELECT count(*) FROM s`))).find((r) => r.id === INBOX_ID)!.ok, true, 'a WITH query is one SELECT');
});

test('S4C-05: the truth query runs on the CP3 item\'s edge schema too, and must return one number there', async () => {
  assert.match(await failing(INBOX_ID, { keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.truths.CP2 = 'SELECT max(store_id) FROM stores WHERE store_id < 4 HAVING count(*) > 0'; },
    truths: (t) => { t[`${INBOX_ID}:CP2`] = 3; } }), /the truth query for CP2 does not return one number on voltmarkt_edge_basics/);
  assert.match(await failing(INBOX_ID, { keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.truths.CP2 = 'SELECT sum(n) FROM only_visible'; },
    truths: (t) => { t[`${INBOX_ID}:CP2`] = 1; } }), /the truth query for CP2 does not return one number on voltmarkt_edge_basics/);
  assert.match(await failing(INBOX_ID, { keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.truths.CP2 = 'SELECT store_id FROM stores'; } }),
    /the truth query for CP2 does not return one number on voltmarkt\b/);
});

test('P16: a missing value on the edge data is a named WARN, not a FAIL; the visible schema still fails on one', async () => {
  const missingOnEdge: CasePatch = { keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.truths.CP2 = 'SELECT max(store_id) FROM stores WHERE store_id < 4'; },
    truths: (t) => { t[`${INBOX_ID}:CP2`] = 3; } };
  const results = (await run(missingOnEdge)).filter((r) => r.check === 'C41');
  const r = results.find((x) => x.id === INBOX_ID)!;
  assert.deepEqual([r.ok, r.warn], [false, true], 'a warning, not a failure');
  assert.match(r.detail, /the truth query for CP2 returns a missing value on voltmarkt_edge_basics/);
  for (const s of SECRETS) assert.ok(!r.detail.includes(s), 'the detail quotes no truth query');
  for (const other of results.filter((x) => x.id !== INBOX_ID)) assert.equal(other.ok, true, other.id);
  // A missing value on the visible schema fails.
  assert.match(await failing(INBOX_ID, { keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.truths.CP2 = 'SELECT max(store_id) FROM stores WHERE store_id > 99'; } }),
    /the truth query for CP2 does not return one number on voltmarkt \(it returns a missing value\)/);
});

test('S6-13: a Mailvora case\'s truth runs on mailvora, its own schema; the same value read on voltmarkt would not match', async () => {
  const mailvora: CasePatch = {
    records: (r) => { r.inbox.schema = 'mailvora'; },
    items: (i) => { i['EX-CASE-PRICE-01']!.schema = 'mailvora'; },
    truths: (t) => { t[`${INBOX_ID}:CP2`] = 5; t[`${INBOX_ID}:CP4`] = 3; },
  };
  assert.equal((await run(mailvora)).find((r) => r.id === INBOX_ID)!.ok, true, 'mailvora holds 5 stores, whose average ID is 3');
  // A case that names no schema reads voltmarkt, where those queries give 3 and 2: the stored values are not what they return.
  assert.match(await failing(INBOX_ID, { ...mailvora, records: () => {}, items: () => {} }),
    /the truth file's value for CASE-PRICE-01:CP2 is not what its query returns on voltmarkt: run npm run build:data/);
});

test('F2 (triage "B3: schemasIn returns an empty set on failure"): a failed schema query fails C41 once; no case is skipped as unavailable', async () => {
  const f = await makeCaseFixture(real);
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  const crash: RunnerError = { kind: 'crash', message: 'an invented runner failure' };
  const broken = { request: async () => ({ ok: false, error: crash }), close: async () => {} } as unknown as RunnerClient;
  const results = (await checkCasesOnDb(store, broken)).filter((r) => r.check === 'C41');
  const failed = results.filter((r) => !r.ok && !r.warn);
  assert.deepEqual(failed.map((r) => [r.id, r.detail]),
    [['data/course.duckdb', 'the schemas the database holds could not be read, so no truth query ran on it: check that npm run build:data finished']]);
  assert.ok(!results.some((r) => r.warn), 'no case is skipped by name as unavailable');
  assert.deepEqual(results.filter((r) => r.ok).map((r) => r.id), [DAILY_ID, INBOX_ID, OPENER_ID], 'the records and keys are still checked');
});

test('S6-13: a case\'s CP3 item reads the case\'s schema', async () => {
  assert.match(await failing(INBOX_ID, { records: (r) => { r.inbox.schema = 'mailvora'; } }, false), /EX-CASE-PRICE-01 must read mailvora, the case's schema \(it reads voltmarkt\)/);
});

test('C1 fix note 5: a stale truth (the key changed since the last build) fails with "Run npm run build:data"; a fresh one passes', async () => {
  const detail = await failing(OPENER_ID, { file: (f) => { f.sources[`${OPENER_ID}:CP4`] = '0000000000000000'; } }, false);
  assert.match(detail, /the truth for CASE-VOLT-L1:CP4 is stale: its key or the case's schema changed since the last build\. Run npm run build:data/);
  assert.match(await failing(OPENER_ID, { file: (f) => { delete (f.sources as Record<string, string>)[`${OPENER_ID}:CP4`]; } }, false), /is stale/);
});

test('Review Focus 3: a case on a schema the database does not hold is skipped by name, never failed', async () => {
  const absent: CasePatch = { records: (r) => { r.inbox.schema = 'online_retail_ii'; }, items: (i) => { i['EX-CASE-PRICE-01']!.schema = 'online_retail_ii'; },
    truths: (t) => { delete t[`${INBOX_ID}:CP2`]; delete t[`${INBOX_ID}:CP4`]; } };
  const r = (await run(absent)).find((x) => x.id === INBOX_ID)!;
  assert.deepEqual([r.check, r.ok, r.warn, r.detail], ['C41', false, true, 'skipped: the database has no schema online_retail_ii, so the case is unavailable until its dataset is prepared']);
  // Without the database, the schemas the build named decide the same.
  const g = await makeCaseFixture(join2(real, { ...absent, file: (f) => { f.schemas = ['voltmarkt', 'voltmarkt_edge_basics']; } }));
  const s = (await checkCases(await loadContent(g.root, { truthFile: g.truthFile }))).find((x) => x.id === INBOX_ID)!;
  assert.deepEqual([s.ok, s.warn], [false, true]);
  // A record that does not validate still fails, skipped or not.
  assert.equal((await run({ ...absent, records: (x) => { absent.records!(x); x.inbox.persona = 3; } })).find((x) => x.id === INBOX_ID)!.warn, undefined);
});

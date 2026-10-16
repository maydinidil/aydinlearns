// tests/tools/check-level4.test.ts: the sprint 6 checks of Task B3. C47 (raw data, S6-01, Review Focus 2) for items and cases; C48
// (the level 4 must-have traps, S6-11, ruling P3's table); C49 (the level 4 drill pool and the cumulative entry, S6-19); C19 taught
// the cumulative entry's own shape (ruling P12); C50 (a passing blind-solve record for each case CP1, CP2, CP4 and CP5 at its
// current prompt hash). Each fails once and passes once on fixtures. Every item, case and key here is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { parseDrillFile, type DrillFile } from '../../server/drill.ts';
import { loadContent } from '../../server/content.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import {
  checkCaseSolvers, checkCumulativeDrills, checkLevel4Drills, checkLevel4Traps, checkRawCases, LEVEL4_TRAPS, rawDataProblems,
} from '../../tools/check-content.ts';
import { casePromptHash } from '../../tools/export-case-view.ts';
import { caseKeyHash } from '../../tools/case-key-hash.ts';
import { DAILY_ID, INBOX_ID, OPENER_ID, TRUTHS, makeCaseFixture, type CasePatch } from '../helpers/case-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const LEVEL4 = ['SQL-SUBQ-01', 'SQL-SUBQ-02', 'SQL-STR-01', 'SQL-DATE-02', 'SQL-CLEAN-01'];

// ---- C47: raw data (S6-01) -------------------------------------------------------------------------------------------------

const runner = await startRunner(await makeFixtureDb([
  "SET TimeZone = 'UTC'",
  'CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_raw', 'CREATE SCHEMA voltmarkt_edge_clean',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1, 'Amsterdam'), (2, 'Gent'), (8, 'Utrecht')) v(store_id, city)",
  "CREATE TABLE voltmarkt_raw.stores AS SELECT * FROM (VALUES (1, 'Amsterdam'), (2, 'gent '), (8, 'Utrecht ')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_clean.stores AS SELECT * FROM (VALUES (8, ' Utrecht')) v(store_id, city)",
  "CREATE TABLE voltmarkt.categories AS SELECT * FROM (VALUES (1, 'TV & Video')) v(category_id, name)",
  "CREATE TABLE voltmarkt_raw.categories AS SELECT * FROM (VALUES (1, 'TV & Video')) v(category_id, name)",
  "CREATE TABLE voltmarkt_edge_clean.categories AS SELECT * FROM (VALUES (1, 'TV & Video')) v(category_id, name)",
]));
after(() => runner.close());

const itemOf = (over: Partial<SqlItem> & { uses_raw?: boolean }): SqlItem =>
  ({ id: 'EX-SQL-CLEAN-01-E1-01', schema: 'voltmarkt_raw', edge_schema: 'voltmarkt_edge_clean', target_concept_id: 'SQL-CLEAN-01', ...over }) as SqlItem;
const keyOf = (reference_sql: string, over: Partial<SqlKey> = {}): SqlKey =>
  ({ item_id: 'EX-SQL-CLEAN-01-E1-01', reference_sql, alternatives: [reference_sql], other_way: null, hint3_partial: 'SELECT city FROM ...', planted_wrong: [], ...over }) as SqlKey;
const CITY = 'SELECT city FROM stores WHERE store_id = 8';

test('C47: a raw-data item whose key finds the quirk passes: raw schema, clean edge schema, no schema named, another result on clean data', async () => {
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf(CITY), runner), []);
});

test('C47: a raw-data item whose key reads a table the quirks leave alone fails: the same result on voltmarkt as on voltmarkt_raw', async () => {
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf('SELECT name FROM categories'), runner),
    ['the key gives the same result on voltmarkt as on voltmarkt_raw, so it finds no quirk (Review Focus 2)']);
});

test('C47: a raw-data item whose key names voltmarkt_raw. (qualified) fails: graded runs swap unqualified names only', async () => {
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf(CITY, { alternatives: [CITY, 'SELECT city FROM voltmarkt_raw.stores WHERE store_id = 8'] }), runner),
    ['alternative 2 names a schema: a raw-data key reads its tables by name only (S6-01)']);
  // A raw item whose key reads the clean table by its qualified name gives the clean answer, and the gate refuses the name.
  const clean = 'SELECT city FROM voltmarkt.stores WHERE store_id = 8';
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf(clean, { alternatives: [clean] }), runner), [
    'the reference names a schema: a raw-data key reads its tables by name only (S6-01)', 'alternative 1 names a schema: a raw-data key reads its tables by name only (S6-01)',
  ]);
});

test('C47: a raw-data item is on voltmarkt_raw with the edge schema voltmarkt_edge_clean, either way round', async () => {
  assert.deepEqual(await rawDataProblems(itemOf({ edge_schema: 'voltmarkt_edge_basics' }), keyOf(CITY), runner),
    ['a raw-data item has the edge schema voltmarkt_edge_clean']);
  assert.deepEqual(await rawDataProblems(itemOf({ schema: 'voltmarkt' }), keyOf(CITY), runner), ['a raw-data item has the schema voltmarkt_raw']);
  assert.deepEqual(await rawDataProblems(itemOf({ schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics', uses_raw: true }), keyOf(CITY), runner),
    ['a raw-data item has the schema voltmarkt_raw', 'a raw-data item has the edge schema voltmarkt_edge_clean']);
});

test('C47: a clean item\'s key that reads a raw table (voltmarkt_raw.) fails; its plain key passes', async () => {
  const clean = itemOf({ schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics', target_concept_id: 'SQL-FILTER-01' });
  assert.deepEqual(await rawDataProblems(clean, keyOf(CITY), runner), []);
  assert.deepEqual(await rawDataProblems(clean, keyOf(CITY, { hint3_partial: 'SELECT city FROM "voltmarkt_raw" . stores WHERE ...' }), runner),
    ['hint 3 reads a raw table (voltmarkt_raw.): a clean item reads its own schema only (S6-01)']);
  assert.deepEqual(await rawDataProblems(clean, keyOf("SELECT 'voltmarkt_raw.stores' AS label"), runner), [], 'inside a string it is text, not a table');
});

/** The inbox case on raw data: its record, its CP3 item (whose fixture key reads store 8's city) and its truth queries. */
const rawCase: CasePatch = {
  records: (r) => { r.inbox.uses_raw = true; r.inbox.schema = 'voltmarkt_raw'; r.inbox.world = 'DQ'; },
  items: (i) => { i['EX-CASE-PRICE-01']!.schema = 'voltmarkt_raw'; i['EX-CASE-PRICE-01']!.edge_schema = 'voltmarkt_edge_clean'; },
  keys: (ks) => { const k = ks.find((x) => x.case_id === INBOX_ID)!; k.truths = { CP2: 'SELECT count(*) FROM stores', CP4: 'SELECT max(store_id) FROM stores' }; },
};
const rawResults = async (patch: CasePatch) => {
  const f = await makeCaseFixture(patch);
  return checkRawCases(await loadContent(f.root, { truthFile: f.truthFile }), runner);
};

test('C47 for cases: a raw-data case passes on voltmarkt_raw with its CP3 item on the clean edge schema; the clean cases pass too', async () => {
  const results = await rawResults(rawCase);
  assert.deepEqual(results.map((r) => [r.id, r.check, r.ok, r.detail]), [[DAILY_ID, 'C47', true, ''], [INBOX_ID, 'C47', true, ''], [OPENER_ID, 'C47', true, '']]);
});

test('C47 for cases: uses_raw and the schema agree, the CP3 item is on raw data, its key finds the quirk, and no truth query names a schema', async () => {
  const fail = async (patch: CasePatch): Promise<string> => {
    const r = (await rawResults(patch)).find((x) => x.id === INBOX_ID)!;
    assert.equal(r.ok, false);
    return r.detail;
  };
  assert.match(await fail({ ...rawCase, records: (r) => { rawCase.records!(r); r.inbox.uses_raw = false; } }), /a case on voltmarkt_raw has uses_raw true/);
  assert.match(await fail({ ...rawCase, records: (r) => { rawCase.records!(r); r.inbox.schema = undefined; } }), /a case with uses_raw has the schema voltmarkt_raw/);
  assert.match(await fail({ ...rawCase, items: (i) => { rawCase.items!(i); i['EX-CASE-PRICE-01']!.edge_schema = 'voltmarkt_edge_basics'; } }),
    /EX-CASE-PRICE-01 has the edge schema voltmarkt_edge_clean/);
  assert.match(await fail({ ...rawCase, keys: (ks) => { rawCase.keys!(ks); ks.find((x) => x.case_id === INBOX_ID)!.truths.CP4 = 'SELECT max(store_id) FROM voltmarkt_raw.stores'; } }),
    /the truth query for CP4 names a schema/);
});

test('C47 for cases: a raw-data case whose CP3 key gives the same result on clean data fails', async () => {
  const f = await makeCaseFixture(rawCase);
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  const key = store.key('EX-CASE-PRICE-01')!;
  const same = { ...store, key: (id: string) => (id === 'EX-CASE-PRICE-01' ? { ...key, reference_sql: 'SELECT name FROM categories' } : store.key(id)) };
  const r = (await checkRawCases(same, runner)).find((x) => x.id === INBOX_ID)!;
  assert.deepEqual([r.ok, /EX-CASE-PRICE-01's key gives the same result on voltmarkt as on voltmarkt_raw/.test(r.detail)], [false, true]);
});

// ---- C48: the level 4 must-have traps (P3) ---------------------------------------------------------------------------------

/** An active item of `concept` with `use` and `kind`, and its key planting `traps`. */
const trapItem = (id: string, concept: string, traps: string[], over: Partial<SqlItem> = {}): [SqlItem, SqlKey] => [
  { id, target_concept_id: concept, use: 'pool', kind: 'write', status: 'active', ...over } as SqlItem,
  { item_id: id, planted_wrong: traps.map((error_id, n) => ({ id: `M${n + 1}`, error_id, sql: 'SELECT 1' })) } as unknown as SqlKey,
];
const allTraps = (): [SqlItem, SqlKey][] => Object.entries(LEVEL4_TRAPS).map(([concept, traps], n) => trapItem(`EX-${concept}-E1-0${n + 1}`, concept, [...traps]));
const traps = (pairs: [SqlItem, SqlKey][]) => checkLevel4Traps(pairs.map(([i]) => i), (id) => pairs.find(([i]) => i.id === id)?.[1]);

test('C48: the trap table is P3\'s, for the five level 4 concepts', () => {
  assert.deepEqual(LEVEL4_TRAPS, {
    'SQL-SUBQ-01': ['ERR-SEM-05', 'ERR-LOG-30', 'ERR-LOG-31'], 'SQL-SUBQ-02': ['ERR-LOG-07', 'ERR-LOG-20'], 'SQL-STR-01': ['ERR-LOG-32', 'ERR-LOG-33'],
    'SQL-DATE-02': ['ERR-LOG-34', 'ERR-LOG-06'], 'SQL-CLEAN-01': ['ERR-LOG-35', 'ERR-LOG-36', 'ERR-LOG-05'],
  });
  assert.deepEqual(Object.keys(LEVEL4_TRAPS), LEVEL4);
});

test('C48: every must-have trap planted in a pool or fix item of its concept passes, one result per concept', () => {
  assert.deepEqual(traps(allTraps()).map((r) => [r.id, r.check, r.ok]), LEVEL4.map((c) => [c, 'C48', true]));
  // A fix item's starter counts as its plant.
  const fix = allTraps().filter(([i]) => i.target_concept_id !== 'SQL-DATE-02');
  fix.push(trapItem('EX-SQL-DATE-02-E1-31', 'SQL-DATE-02', ['ERR-LOG-06'], { kind: 'fix', starter_error_id: 'ERR-LOG-34' }));
  assert.ok(traps(fix).every((r) => r.ok));
});

test('C48: a trap planted only in a drill item, another concept\'s item or an inactive item, or nowhere, fails and is named', () => {
  const base = allTraps().filter(([i]) => i.target_concept_id !== 'SQL-STR-01');
  const none = traps(base).find((r) => r.id === 'SQL-STR-01')!;
  assert.deepEqual([none.ok, none.detail], [false, 'ERR-LOG-32, ERR-LOG-33 planted in no pool or fix item of SQL-STR-01']);
  for (const [label, extra] of [
    ['a drill item', trapItem('EX-SQL-STR-01-E1-21', 'SQL-STR-01', ['ERR-LOG-32', 'ERR-LOG-33'], { use: 'drill' })],
    ['another concept', trapItem('EX-SQL-SUBQ-01-E1-09', 'SQL-SUBQ-01', ['ERR-LOG-32', 'ERR-LOG-33'])],
    ['an inactive item', trapItem('EX-SQL-STR-01-E1-09', 'SQL-STR-01', ['ERR-LOG-32', 'ERR-LOG-33'], { status: 'needs_fix' } as Partial<SqlItem>)],
  ] as const) assert.equal(traps([...base, extra]).find((r) => r.id === 'SQL-STR-01')!.ok, false, label);
  const one = traps([...base, trapItem('EX-SQL-STR-01-E1-01', 'SQL-STR-01', ['ERR-LOG-32'])]).find((r) => r.id === 'SQL-STR-01')!;
  assert.deepEqual([one.ok, one.detail], [false, 'ERR-LOG-33 planted in no pool or fix item of SQL-STR-01']);
});

// ---- C49 and C19: the level 4 drill and the cumulative entry (S6-19, P12) ---------------------------------------------------

const drillItem = (id: string, concept: string, level: number): SqlItem => ({ id, target_concept_id: concept, use: 'drill', kind: 'write', status: 'active', level } as SqlItem);
const LEVEL4_ITEMS = LEVEL4.flatMap((c) => Array.from({ length: 6 }, (_, n) => drillItem(`EX-${c}-E1-2${n + 1}`, c, 4)));
const LOW_ITEMS = [1, 2, 3].flatMap((level) => Array.from({ length: 6 }, (_, n) => drillItem(`EX-L${level}-${n}`, `C-L${level}`, level)));
const drillFile = (over: { l4?: string[] | null; per_level?: number; levels?: number[]; low?: Record<number, string[]> } = {}): DrillFile => parseDrillFile({ drills: [
  ...[1, 2, 3].map((level) => ({ level, questions: 3, minutes: 20, pass_pct: 90, unseen_min_pct: 70, concepts: [`C-L${level}`],
    pool_item_ids: over.low?.[level] ?? LOW_ITEMS.filter((i) => i.level === level).map((i) => i.id) })),
  ...(over.l4 === null ? [] : [{ level: 4, questions: 10, minutes: 25, pass_pct: 90, unseen_min_pct: 70, concepts: LEVEL4, pool_item_ids: over.l4 ?? LEVEL4_ITEMS.map((i) => i.id) }]),
  { id: 'cumulative-1-4', levels: over.levels ?? [1, 2, 3, 4], per_level: over.per_level ?? 3, minutes: 30, pass_pct: 80, unseen_min_pct: 70, mode: 'screen' },
] });
const items = [...LEVEL4_ITEMS, ...LOW_ITEMS];

test('C49: 30 level 4 drill items across the 5 concepts, every level 1 to 4 pool filled, and a per_level each pool can serve unseen at 70%: pass', () => {
  assert.deepEqual(checkLevel4Drills(drillFile(), items, curriculum).map((r) => [r.id, r.check, r.ok, r.detail]),
    [['drill-L4', 'C49', true, ''], ['cumulative-1-4', 'C49', true, '']]);
});

test('C49: a level 4 pool short of 30, or with a concept missing, fails; so does a file with no level 4 entry', () => {
  const short = checkLevel4Drills(drillFile({ l4: LEVEL4_ITEMS.slice(1).map((i) => i.id) }), items, curriculum)[0]!;
  assert.deepEqual([short.ok, short.detail], [false, 'the level 4 pool holds 29 drill items; it needs 30']);
  const gap = checkLevel4Drills(drillFile({ l4: LEVEL4_ITEMS.filter((i) => i.target_concept_id !== 'SQL-DATE-02').map((i) => i.id) }), items, curriculum)[0]!;
  assert.match(gap.detail, /no drill item for SQL-DATE-02/);
  const absent = checkLevel4Drills(drillFile({ l4: null }), items, curriculum);
  assert.deepEqual(absent.map((r) => [r.id, r.ok]), [['drill-L4', false], ['cumulative-1-4', false]]);
  assert.match(absent[0]!.detail, /content\/sql\/drills\.json has no level 4 entry/);
  assert.match(absent[1]!.detail, /level 4 has no drill pool/);
});

test('C49: the cumulative entry fails on an empty level pool, and on a per_level more than a pool can serve unseen at 70%', () => {
  const empty = checkLevel4Drills(drillFile({ low: { 2: [] } }), items, curriculum)[1]!;
  assert.deepEqual([empty.ok, empty.detail], [false, 'level 2 has no drill pool']);
  // A pool of 3 serves at most 4 questions with 70% of them unseen (3 / 0.7 = 4.3): a per_level of 5 is too many, 4 is not.
  const small = { 1: LOW_ITEMS.filter((i) => i.level === 1).slice(0, 3).map((i) => i.id) };
  const five = checkLevel4Drills(drillFile({ low: small, per_level: 5 }), items, curriculum)[1]!;
  assert.deepEqual([five.ok, five.detail], [false, 'per_level is 5, but level 1\'s pool of 3 serves at most 4 with 70% unseen']);
  assert.equal(checkLevel4Drills(drillFile({ low: small, per_level: 4 }), items, curriculum)[1]!.ok, true, 'a pool of 3 serves 4, and the larger pools more');
});

test('P12: C19 checks a cumulative entry by its own shape: its levels are curriculum levels and pass_pct is above 0', () => {
  assert.deepEqual(checkCumulativeDrills(drillFile(), curriculum).map((r) => [r.id, r.check, r.ok, r.detail]), [['cumulative-1-4', 'C19', true, '']]);
  // The parser keeps levels to 1 to 7; a level the curriculum holds no concept of is not a level a drill can draw from.
  const sixLevels = { ...curriculum, concepts: curriculum.concepts.filter((c) => c.level !== 7) };
  const seven = checkCumulativeDrills(drillFile({ levels: [1, 2, 7] }), sixLevels)[0]!;
  assert.deepEqual([seven.ok, seven.detail], [false, 'level 7 has no concept in the curriculum']);
  assert.equal(checkCumulativeDrills(drillFile({ levels: [1, 2, 7] }), curriculum)[0]!.ok, true, 'the real curriculum has level 7');
  const zero = parseDrillFile({ drills: [{ id: 'cumulative-x', levels: [1], per_level: 2, minutes: 10, pass_pct: 0, unseen_min_pct: 70 }] });
  assert.deepEqual(checkCumulativeDrills(zero, curriculum).map((r) => [r.ok, r.detail]), [[false, 'pass_pct must be above 0']]);
});

// ---- C50: case blind-solve records ------------------------------------------------------------------------------------------

/** Each case key's solver records: a passing one per CP1, CP2, CP4 and CP5 at its checkpoint's current prompt hash. */
const solved: CasePatch = {
  keys: (ks) => {
    for (const k of ks) k.solver = {};
  },
};
async function solverResults(patch: (records: Record<string, any>[], keys: Record<string, any>[]) => void = () => {}) {
  let recs: Record<string, any>[] = [];
  const f = await makeCaseFixture({ records: (r) => { recs = [r.opener, r.inbox, r.daily]; }, keys: (ks) => {
    solved.keys!(ks);
    for (const k of ks) {
      const record = recs.find((r) => r.case_id === k.case_id)!;
      for (const cp of record.checkpoints.filter((c: any) => ['CP1', 'CP2', 'CP4', 'CP5'].includes(c.kind))) {
        k.solver[cp.kind] = { pass: true, prompt_hash: casePromptHash(record as never, cp), key_hash: caseKeyHash(cp.kind, k as never, TRUTHS[`${k.case_id}:${cp.kind}`]), at: '2026-10-14T10:00:00.000Z' };
      }
    }
    patch(recs, ks);
  } });
  return checkCaseSolvers(await loadContent(f.root, { truthFile: f.truthFile }));
}

test('C50: a case whose CP1, CP2, CP4 and CP5 each have a passing record at the current prompt hash passes', async () => {
  assert.deepEqual((await solverResults()).map((r) => [r.id, r.check, r.ok]), [[DAILY_ID, 'C50', true], [INBOX_ID, 'C50', true], [OPENER_ID, 'C50', true]]);
});

test('K1: C50 fails a changed correct_oid, a changed CP2 value, a record with no key_hash and a CP2 with no built value, naming no oid, value or hash', async () => {
  const one = async (patch: (recs: Record<string, any>[], ks: Record<string, any>[]) => void, truths?: CasePatch['truths']) => {
    let recs: Record<string, any>[] = [];
    const f = await makeCaseFixture({ records: (r) => { recs = [r.opener, r.inbox, r.daily]; }, truths, keys: (ks) => {
      for (const k of ks) {
        k.solver = {};
        const record = recs.find((r) => r.case_id === k.case_id)!;
        for (const cp of record.checkpoints.filter((c: any) => ['CP1', 'CP2', 'CP4', 'CP5'].includes(c.kind))) {
          k.solver[cp.kind] = { pass: true, prompt_hash: casePromptHash(record as never, cp), key_hash: caseKeyHash(cp.kind, k as never, TRUTHS[`${k.case_id}:${cp.kind}`]), at: '2026-10-14T10:00:00.000Z' };
        }
      }
      patch(recs, ks);
    } });
    return (checkCaseSolvers(await loadContent(f.root, { truthFile: f.truthFile }))).find((r) => r.id === INBOX_ID)!;
  };
  const key = (ks: Record<string, any>[]) => ks.find((k) => k.case_id === INBOX_ID)!;
  const CHANGED = 'the answer key or its built value changed since the solver record: blind-solve it again';
  const oid = await one((_, ks) => { key(ks).choices.CP1.correct_oid = key(ks).choices.CP5.correct_oid; });
  assert.deepEqual([oid.ok, oid.detail], [false, `CP1: ${CHANGED}`]);
  const value = await one(() => {}, (t) => { t[`${INBOX_ID}:CP2`] = 99; });
  assert.deepEqual([value.ok, value.detail], [false, `CP2: ${CHANGED}`]);
  const none = await one((_, ks) => { delete key(ks).solver.CP5.key_hash; });
  assert.deepEqual([none.ok, none.detail], [false, 'CP5: recorded before answer fingerprints (F32): blind-solve it again']);
  const unbuilt = await one(() => {}, (t) => { delete t[`${INBOX_ID}:CP2`]; });
  assert.ok(!unbuilt.ok && /CP2: no value built: run npm run build:data/.test(unbuilt.detail), unbuilt.detail);
  for (const r of [oid, value, none, unbuilt]) assert.ok(!/[0-9a-f]{16}/.test(r.detail) && !/99/.test(r.detail), 'no hash or value in a detail');
});

test('C50 (Review Focus 3): a case on a schema the build did not hold waits for its CP2 and CP4 values with a warning, and a missing record still fails', async () => {
  const inbox = async (dropCp5: boolean) => {
    let recs: Record<string, any>[] = [];
    const f = await makeCaseFixture({
      records: (r) => { r.inbox.schema = 'online_retail_ii'; recs = [r.opener, r.inbox, r.daily]; },
      keys: (ks) => {
        for (const k of ks) {
          k.solver = {};
          const record = recs.find((r) => r.case_id === k.case_id)!;
          for (const cp of record.checkpoints.filter((c: any) => ['CP1', 'CP2', 'CP4', 'CP5'].includes(c.kind))) {
            k.solver[cp.kind] = { pass: true, prompt_hash: casePromptHash(record as never, cp), key_hash: caseKeyHash(cp.kind, k as never, TRUTHS[`${k.case_id}:${cp.kind}`]), at: '2026-10-14T10:00:00.000Z' };
          }
        }
        if (dropCp5) delete ks.find((k) => k.case_id === INBOX_ID)!.solver.CP5;
      },
      truths: (t) => { delete t[`${INBOX_ID}:CP2`]; delete t[`${INBOX_ID}:CP4`]; },
      file: (x) => { x.schemas = ['voltmarkt']; },
    });
    return checkCaseSolvers(await loadContent(f.root, { truthFile: f.truthFile })).find((r) => r.id === INBOX_ID)!;
  };
  const waiting = await inbox(false);
  assert.deepEqual([waiting.ok, waiting.warn, waiting.detail],
    [false, true, 'CP2, CP4: skipped: the database has no schema online_retail_ii, so their values wait until its dataset is prepared']);
  const missing = await inbox(true);
  assert.deepEqual([missing.ok, missing.warn, missing.detail],
    [false, undefined, 'CP5 has no solver record: blind-solve it (npm run export:case-view, then npm run record:case-solver)']);
});

test('C50: no record, a failed record, or a record for an older prompt fails, naming the checkpoint', async () => {
  const one = async (patch: (recs: Record<string, any>[], ks: Record<string, any>[]) => void) => (await solverResults(patch)).find((r) => r.id === INBOX_ID)!;
  const key = (ks: Record<string, any>[]) => ks.find((k) => k.case_id === INBOX_ID)!;
  const none = await one((_, ks) => { delete key(ks).solver.CP2; });
  assert.deepEqual([none.ok, none.detail], [false, 'CP2 has no solver record: blind-solve it (npm run export:case-view, then npm run record:case-solver)']);
  const failed = await one((_, ks) => { key(ks).solver.CP5.pass = false; });
  assert.deepEqual([failed.ok, failed.detail], [false, 'CP5: the blind solver\'s answer did not pass; read the prompt as ambiguous first']);
  const stale = await one((recs) => { recs.find((r) => r.case_id === INBOX_ID)!.checkpoints[0].prompt = 'An edited invented scope question?'; });
  assert.deepEqual([stale.ok, stale.detail], [false, 'CP1: the prompt or the brief changed since the solver record: blind-solve it again']);
  const noField = (await (async () => {
    const f = await makeCaseFixture();
    return checkCaseSolvers(await loadContent(f.root, { truthFile: f.truthFile }));
  })()).find((r) => r.id === OPENER_ID)!;
  assert.deepEqual([noField.ok, noField.detail], [false, 'CP4 has no solver record: blind-solve it (npm run export:case-view, then npm run record:case-solver)']);
});

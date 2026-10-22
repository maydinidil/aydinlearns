// tests/tools/check-mocks.test.ts: content checks C54 and C55 (sprint 7, Task M1; S7-08, S7-09, S7-13 to S7-15), and the case checks
// C41 and C50 on a mock case. C54: content/mocks.json validates and its forms fit the content (every screen form item a mock item, one of
// each of levels 1 to 4 then two of level 5; every case form's case a mock case of its kind); each mock item is in exactly one form, and
// no drill pool, case, lesson or other way names it. C55: each mock case lists CP1 to CP6, its CP3 item has use mock, and a take-home
// reads raw data. With every forms empty and no mock content, both pass. A detail names IDs, forms and fields only. Every item and case
// here is invented (tests/helpers/mock-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { loadDrillFile, type DrillFile } from '../../server/drill.ts';
import { checkCases, checkCaseSolvers, checkMockCases, checkMocks, type CheckResult } from '../../tools/check-content.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { INBOX_ID, OPENER_ID, inboxRecord } from '../helpers/case-fixture.ts';
import { MOCK_CASE, MOCK_CP3, SCREEN_ITEM, makeMockFixture, mockCaseRecord, type MockPatch } from '../helpers/mock-fixture.ts';

const store = async (patch: MockPatch = {}): Promise<ContentStore> => {
  const f = await makeMockFixture(patch);
  return loadContent(f.root, { truthFile: f.truthFile });
};
const NO_DRILLS: DrillFile = { levels: [], cumulative: [] };
const result = (rs: CheckResult[], id: string): CheckResult => {
  const r = rs.find((x) => x.id === id);
  assert.ok(r, `no result for ${id}: ${rs.map((x) => x.id).join(', ')}`);
  return r!;
};

/** The six items of form SCREEN-A, one concept of each of levels 1 to 4, then two of level 5, as S7-09 orders them. */
const LEVELED = ['SQL-FILTER-02', 'SQL-AGG-01', 'SQL-JOIN-01', 'SQL-SUBQ-01', 'SQL-WIN-02', 'SQL-WIN-03'];
const SCREEN_A = LEVELED.map((_, k) => `EX-MOCK-SCREEN-A-0${k + 1}`);
/** A filled screen form and case-round form: the mock items, CASE-MOCK-A's form, and mocks.json naming them. */
const filled = (more: MockPatch = {}): MockPatch => ({
  ...more,
  mockItems: (i) => {
    const base = i[SCREEN_ITEM]!;
    SCREEN_A.forEach((id, k) => { i[id] = { ...base, id, target_concept_id: LEVELED[k], concept_ids: [LEVELED[k]] }; });
    more.mockItems?.(i);
  },
  mocks: (m) => {
    m.screen.forms = [{ id: 'SCREEN-A', item_ids: [...SCREEN_A] }];
    m.case_round.forms = [{ id: 'CASE-ROUND-A', case_id: MOCK_CASE }];
    more.mocks?.(m);
  },
});

test('C54 and C55 on the real content: content/mocks.json validates with three screen forms of six mock items and a form per mock case, and both checks pass', async () => {
  const real = await loadContent('content');
  assert.deepEqual(real.mocks!.screen.forms.map((f) => [f.id, f.item_ids.length]), [['SCREEN-A', 6], ['SCREEN-B', 6], ['SCREEN-C', 6]]);
  // Task P2: each case-round and take-home form runs one mock case, and C54 reads that case's CP3 item as the form's item.
  const caseForms = [...real.mocks!.case_round.forms, ...real.mocks!.take_home.forms];
  const cases = real.mockCases?.() ?? [];
  assert.deepEqual(cases.map((c) => c.case_id).sort(), caseForms.map((f) => f.case_id).sort(), 'one mock case per case form');
  const cp3 = cases.map((c) => c.checkpoints.find((cp) => cp.kind === 'CP3')!.item_id!);
  const c54 = checkMocks(real, await loadDrillFile());
  assert.deepEqual(c54.map((r) => r.id).sort(), ['mocks.json', ...real.mocks!.screen.forms.flatMap((f) => f.item_ids), ...cp3].sort(), 'one result for mocks.json and one per form item');
  assert.deepEqual(c54.filter((r) => !r.ok).map((r) => [r.id, r.detail]), []);
  const c55 = checkMockCases(real);
  assert.deepEqual(c55.map((r) => r.id).sort(), caseForms.map((f) => f.case_id).sort(), 'one result per mock case');
  assert.deepEqual(c55.filter((r) => !r.ok).map((r) => [r.id, r.detail]), []);
});

test('C54 and C55: the shipped rules with every form emptied and no mock item and no mock case pass', async () => {
  const s = await store({ mocks: (m) => { m.screen.forms = []; }, mockItems: (i) => { delete i[SCREEN_ITEM]; delete i[MOCK_CP3]; }, mockCases: (c) => { delete c[MOCK_CASE]; } });
  assert.deepEqual(checkMocks(s, NO_DRILLS), [{ id: 'mocks.json', check: 'C54', ok: true, detail: '' }]);
  assert.deepEqual(checkMockCases(s), []);
});

test('C54: filled forms whose items and cases fit pass, one result for mocks.json and one per mock item', async () => {
  const rs = checkMocks(await store(filled()), NO_DRILLS);
  assert.deepEqual(rs.map((r) => [r.id, r.check, r.ok, r.detail]).sort(), [['mocks.json', 'C54', true, ''], [MOCK_CP3, 'C54', true, ''],
    ...SCREEN_A.map((id) => [id, 'C54', true, ''])].sort());
});

test('C54: content/mocks.json must be there; the store refuses a malformed one before C54 runs', async () => {
  const s = await store();
  assert.deepEqual(result(checkMocks({ ...s, mocks: undefined }, NO_DRILLS), 'mocks.json'), { id: 'mocks.json', check: 'C54', ok: false, detail: 'content/mocks.json is missing' });
});

test('C54: every form item exists with use mock, and a screen form is one item of each of levels 1 to 4, then two of level 5', async () => {
  const missing = result(checkMocks(await store(filled({ mockItems: (i) => { delete i['EX-MOCK-SCREEN-A-03']; } })), NO_DRILLS), 'mocks.json');
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /SCREEN-A: EX-MOCK-SCREEN-A-03 is missing/);
  const notMock = checkMocks(await store(filled({ mockItems: (i) => { i['EX-MOCK-SCREEN-A-02']!.use = 'pool'; } })), NO_DRILLS);
  assert.match(result(notMock, 'mocks.json').detail, /SCREEN-A: EX-MOCK-SCREEN-A-02 must have use mock/);
  const order = (ids: string[]) => filled({ mockItems: (i) => { ids.forEach((id, k) => { i[id]!.target_concept_id = LEVELED[k === 0 ? 1 : k === 1 ? 0 : k]; }); } });
  const swapped = result(checkMocks(await store(order(SCREEN_A)), NO_DRILLS), 'mocks.json');
  assert.match(swapped.detail, /SCREEN-A must hold one item of each of levels 1 to 4, then two of level 5, in that order \(S7-09\)/);
  const noFive = result(checkMocks(await store(filled({ mockItems: (i) => { i['EX-MOCK-SCREEN-A-06']!.target_concept_id = 'SQL-SUBQ-02'; } })), NO_DRILLS), 'mocks.json');
  assert.equal(noFive.ok, false);
});

test('C54: a case form\'s case is a mock case of the form\'s kind', async () => {
  const absent = result(checkMocks(await store(filled({ mocks: (m) => { m.case_round.forms = [{ id: 'CASE-ROUND-B', case_id: 'CASE-MOCK-B' }]; } })), NO_DRILLS), 'mocks.json');
  assert.match(absent.detail, /CASE-ROUND-B: CASE-MOCK-B is missing from content\/sql\/mocks\//);
  const wrongKind = filled({ mocks: (m) => { m.take_home.forms = [{ id: 'TAKE-HOME-A', case_id: 'CASE-TAKE-A' }]; },
    mockCases: (c) => { c['CASE-TAKE-A'] = { ...mockCaseRecord('CASE-TAKE-A', 'take_home'), kind: 'case_round' }; } });
  assert.match(result(checkMocks(await store(wrongKind), NO_DRILLS), 'mocks.json').detail, /TAKE-HOME-A: CASE-TAKE-A must have kind take_home/);
});

test('C54: a mock item in no form fails, named by its ID', async () => {
  const rs = checkMocks(await store(filled({ mocks: (m) => { m.case_round.forms = []; } })), NO_DRILLS);
  assert.deepEqual(result(rs, MOCK_CP3), { id: MOCK_CP3, check: 'C54', ok: false, detail: 'it is in no form of content/mocks.json' });
  assert.equal(result(rs, 'mocks.json').ok, true);
});

test('C54: no drill pool, case, lesson or other way names a mock item (S7-08)', async () => {
  const drills: DrillFile = { levels: [{ level: 1, questions: 1, minutes: 5, pass_pct: 90, concepts: [FIXTURE_CONCEPT], unseen_min_pct: 0, mode: 'normal',
    pool_item_ids: ['EX-MOCK-SCREEN-A-01'] }], cumulative: [] };
  assert.match(result(checkMocks(await store(filled()), drills), 'EX-MOCK-SCREEN-A-01').detail, /the level 1 drill pool names it/);
  const inCase = filled({ records: (r) => { r.inbox.checkpoints[2].item_id = 'EX-MOCK-SCREEN-A-02'; } });
  assert.match(result(checkMocks(await store(inCase), NO_DRILLS), 'EX-MOCK-SCREEN-A-02').detail, new RegExp(`${INBOX_ID} names it`));
  const f = await makeMockFixture(filled());
  const lessonFile = join(f.root, 'sql/lessons', `${FIXTURE_CONCEPT}.json`);
  const lesson = JSON.parse(await readFile(lessonFile, 'utf8'));
  await writeFile(lessonFile, JSON.stringify({ ...lesson, pool_item_ids: [...lesson.pool_item_ids, 'EX-MOCK-SCREEN-A-03'] }));
  const withLesson = await loadContent(f.root, { truthFile: f.truthFile });
  assert.match(result(checkMocks(withLesson, NO_DRILLS), 'EX-MOCK-SCREEN-A-03').detail, new RegExp(`the ${FIXTURE_CONCEPT} lesson names it`));
  // "Other ways" never shows a mock item (S7-08), so its key holds none.
  const g = await makeMockFixture(filled());
  const keyFile = join(g.root, 'keys/sql', 'EX-MOCK-SCREEN-A-04.json');
  const key = JSON.parse(await readFile(keyFile, 'utf8'));
  await writeFile(keyFile, JSON.stringify({ ...key, other_way: { sql: key.alternatives[0], tradeoff: 'An invented trade-off.' } }));
  const withOtherWay = await loadContent(g.root, { truthFile: g.truthFile });
  assert.match(result(checkMocks(withOtherWay, NO_DRILLS), 'EX-MOCK-SCREEN-A-04').detail, /its key has an other way/);
});

test('C54: a checkpoint of an opener that names a mock item fails it as a case does (S7-C33: the openers are read beside the cases)', async () => {
  const withOpener = filled({ records: (r) => { r.opener.checkpoints[0].item_id = 'EX-MOCK-SCREEN-A-05'; } });
  const s = await store(withOpener);
  // A store whose cases() holds no opener (the loaded one lists openers in both): the openers are still read.
  const apart = { ...s, cases: () => s.cases!().filter((c) => c.kind !== 'opener') } as ContentStore;
  assert.match(result(checkMocks(apart, NO_DRILLS), 'EX-MOCK-SCREEN-A-05').detail, new RegExp(`${OPENER_ID} names it`));
});

test('C55: a mock case lists CP1 to CP6, its CP3 item has use mock, and a take-home reads raw data; one result per mock case', async () => {
  assert.deepEqual(checkMockCases(await store()), [{ id: MOCK_CASE, check: 'C55', ok: true, detail: '' }]);
  const noCp2 = await store({ mockCases: (c) => { c[MOCK_CASE]!.checkpoints = c[MOCK_CASE]!.checkpoints.filter((x: { kind: string }) => x.kind !== 'CP2'); } });
  assert.deepEqual(checkMockCases(noCp2), [{ id: MOCK_CASE, check: 'C55', ok: false, detail: 'a mock case lists CP1 to CP6: it has no CP2' }]);
  const notMock = await store({ mockItems: (i) => { i[MOCK_CP3]!.use = 'case'; } });
  assert.match(checkMockCases(notMock)[0]!.detail, new RegExp(`${MOCK_CP3} must have use mock`));
  const take = await store({ mockItems: (i) => { i['EX-MOCK-TAKE-A'] = { ...i[MOCK_CP3], id: 'EX-MOCK-TAKE-A' }; },
    mockCases: (c) => { c['CASE-TAKE-A'] = mockCaseRecord('CASE-TAKE-A', 'take_home'); } });
  assert.deepEqual(result(checkMockCases(take), 'CASE-TAKE-A'), { id: 'CASE-TAKE-A', check: 'C55', ok: false, detail: 'a take-home has uses_raw true (S7-15)' });
  const inbox = await store({ mockCases: (c) => { c['CASE-PRICE-09'] = { ...inboxRecord(), case_id: 'CASE-PRICE-09' }; } });
  assert.match(result(checkMockCases(inbox), 'CASE-PRICE-09').detail, /content\/sql\/mocks\/ holds the mock cases only: kind case_round or take_home/);
});

test('C41 checks a mock case as it checks every case: it passes, its key is no stray key, and its CP3 item has use mock', async () => {
  const rs = await checkCases(await store());
  assert.deepEqual(result(rs, MOCK_CASE), { id: MOCK_CASE, check: 'C41', ok: true, detail: '' });
  assert.ok(!rs.some((r) => r.id.startsWith('keys/cases/')), 'CASE-MOCK-A\'s key belongs to a case');
  assert.ok(rs.filter((r) => r.id !== MOCK_CASE).every((r) => r.ok), 'the practice cases pass as before');
  const used = await checkCases(await store({ mockItems: (i) => { i[MOCK_CP3]!.use = 'case'; } }));
  assert.match(result(used, MOCK_CASE).detail, new RegExp(`${MOCK_CP3} must have use mock`));
});

test('C41: a mock case goes in content/sql/mocks/, and only a mock case does (S7-08)', async () => {
  const f = await makeMockFixture();
  await writeFile(join(f.root, 'sql/cases', 'CASE-MOCK-B.json'), JSON.stringify(mockCaseRecord('CASE-MOCK-B')));
  const misplaced = await checkCases(await loadContent(f.root, { truthFile: f.truthFile }));
  assert.match(result(misplaced, 'CASE-MOCK-B').detail, /a case-round or take-home mock goes in content\/sql\/mocks\//);
  const g = await makeMockFixture();
  await mkdir(join(g.root, 'sql/mocks'), { recursive: true });
  await writeFile(join(g.root, 'sql/mocks', 'CASE-PRICE-09.json'), JSON.stringify({ ...inboxRecord(), case_id: 'CASE-PRICE-09' }));
  const inMocks = await checkCases(await loadContent(g.root, { truthFile: g.truthFile }));
  assert.match(result(inMocks, 'CASE-PRICE-09').detail, /content\/sql\/mocks\/ holds the mock cases only/);
});

test('C50 checks a mock case\'s blind-solve records as it checks every case\'s', async () => {
  const r = result(checkCaseSolvers(await store()), MOCK_CASE);
  assert.equal(r.ok, false);
  assert.match(r.detail, /CP1 has no solver record/);
});

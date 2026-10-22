// tests/server/mock-store.test.ts: the held-out mock store (sprint 7, Task M1; S7-08, D114; Review Focus 1). Mock content is held out
// by where it is stored: an SQL item with `use: 'mock'` and a case in content/sql/mocks/ load into the content store's mock maps
// (mockItem, mockCase), never into item(), sqlItems(), cases() or case(). So every practice route answers 404 or leaves them out, even
// when practice content names them (which C54 forbids): one test per route, each naming the mock item or the mock case by ID. Every
// item, case and key here is invented (tests/helpers/mock-fixture.ts); no message quotes a prompt or a key.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { replay } from '../../core/replay.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { ContentFileError, loadContent, type ContentStore } from '../../server/content.ts';
import type { CumulativeSpec, DrillSpec } from '../../server/drill.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { buildCatalog, LearnerState } from '../../server/state.ts';
import { tutorSource } from '../../server/tutor-source.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { INBOX_ID } from '../helpers/case-fixture.ts';
import { MOCK_CASE, MOCK_CP3, SCREEN_ITEM, makeMockFixture } from '../helpers/mock-fixture.ts';
import { blockClose, instance, options, primed } from '../helpers/replay-fixture.ts';

const MOCK_ITEMS = [SCREEN_ITEM, MOCK_CP3];
const PRACTICE_ITEM = `EX-${FIXTURE_CONCEPT}-E1-08`;
const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });

const fixture = await makeMockFixture();
made.push(fixture.root);
// The fixture's lesson names the mock item everywhere a practice route reads an item from it (C54 forbids this; the store still
// holds the item out): first in its pretest, as its re-test, and first in its pool.
const lessonFile = join(fixture.root, 'sql/lessons', `${FIXTURE_CONCEPT}.json`);
const lesson = JSON.parse(await readFile(lessonFile, 'utf8'));
await writeFile(lessonFile, JSON.stringify({ ...lesson, pretest_item_ids: [SCREEN_ITEM, lesson.pretest_item_ids[1]], retest_item_id: SCREEN_ITEM,
  pool_item_ids: [SCREEN_ITEM, MOCK_CP3, ...lesson.pool_item_ids] }));
const content = await loadContent(fixture.root, { truthFile: fixture.truthFile });
const SHIPPED = JSON.parse(await readFile('content/mocks.json', 'utf8'));

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

async function deps(store: ContentStore = content, attempts: object[] = []): Promise<AppDeps> {
  const dir = await mkdtemp(join(tmpdir(), 'al-mock-store-'));
  made.push(dir);
  const log = openJsonlLog(dir);
  for (const r of attempts) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state };
}
const app = createApp(await deps());
/** No reply may carry a mock item or case ID as something served, nor any of the fixture's mock texts. */
const leaks = (body: unknown): boolean => [SCREEN_ITEM, MOCK_CP3, MOCK_CASE, 'An invented case-round mock'].some((s) => JSON.stringify(body).includes(s));

test('S7-08: mockItem and mockCase reach the mock content; item, sqlItems, cases, case and opener never do', () => {
  for (const id of MOCK_ITEMS) {
    assert.equal(content.mockItem?.(id)?.id, id);
    assert.equal(content.mockItem?.(id)?.use, 'mock');
    assert.equal(content.item(id), undefined, id);
  }
  assert.deepEqual(content.mockItems?.().map((i) => i.id).sort(), [...MOCK_ITEMS].sort());
  assert.equal(content.mockCase?.(MOCK_CASE)?.kind, 'case_round');
  assert.deepEqual(content.mockCases?.().map((c) => c.case_id), [MOCK_CASE]);
  assert.equal(content.case?.(MOCK_CASE), undefined);
  assert.equal(content.opener?.(MOCK_CASE), undefined);
  assert.ok(!(content.cases?.() ?? []).some((c) => c.case_id === MOCK_CASE));
  assert.ok(!(content.sqlItems?.() ?? []).some((i) => MOCK_ITEMS.includes(i.id)));
  // A practice item and case are in the practice maps only.
  assert.equal(content.mockItem?.(PRACTICE_ITEM), undefined);
  assert.equal(content.mockCase?.(INBOX_ID), undefined);
  assert.ok(content.item(PRACTICE_ITEM) && content.case?.(INBOX_ID));
  // The keys stay server-side, where the mock routes and the checks grade with them.
  assert.ok(content.key(SCREEN_ITEM) && content.caseKey?.(MOCK_CASE));
  // The fixture writes the shipped rules with the case forms empty (its root holds none of the real mock cases).
  assert.deepEqual(content.mocks, { ...SHIPPED, case_round: { ...SHIPPED.case_round, forms: [] }, take_home: { ...SHIPPED.take_home, forms: [] } }, 'content/mocks.json as written');
});
test('D114: an item with an EX-MOCK- ID is held out whatever its use says (C01 then names the mismatch)', async () => {
  const f = await makeMockFixture({ mockItems: (i) => { i['EX-MOCK-SCREEN-B-01'] = { ...i[SCREEN_ITEM], id: 'EX-MOCK-SCREEN-B-01', use: 'pool' }; } });
  made.push(f.root);
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  assert.equal(store.item('EX-MOCK-SCREEN-B-01'), undefined);
  assert.equal(store.mockItem?.('EX-MOCK-SCREEN-B-01')?.use, 'pool');
});

test('content/mocks.json: a malformed file stops the load naming the file; a missing one is no mocks; the mock files are in the content version', async () => {
  const bad = await makeMockFixture({ mocks: (m) => { m.screen.minutes = 0; } });
  made.push(bad.root);
  await assert.rejects(loadContent(bad.root), (e: unknown) => e instanceof ContentFileError && e.file === 'mocks.json' && e.problems.includes('screen.minutes must be a number above 0'));
  await rm(join(bad.root, 'mocks.json'));
  assert.equal((await loadContent(bad.root)).mocks, undefined);
  const other = await makeMockFixture({ mockCases: (c) => { c[MOCK_CASE]!.title = 'Another invented case-round mock'; } });
  made.push(other.root);
  assert.notEqual((await loadContent(other.root)).contentVersion, (await loadContent(fixture.root)).contentVersion);
});

// ---- the routes (Review Focus 1) ---------------------------------------------------------------------------------------------------

test('GET /api/items/:id answers 404 for a mock item', async () => {
  for (const id of MOCK_ITEMS) {
    const r = await get(app, `/api/items/${id}`);
    assert.equal(r.status, 404, id);
    assert.ok(!leaks(await r.json()));
  }
  assert.equal((await get(app, `/api/items/${PRACTICE_ITEM}`)).status, 200, 'a practice item is served as before');
});

test('POST /api/run, /api/submit and /api/item-close answer 404 for a mock item', async () => {
  for (const id of MOCK_ITEMS) {
    for (const path of ['/api/run', '/api/submit', '/api/item-close']) {
      const r = await post(app, path, { item_id: id, item_instance_id: `I-${path.slice(5)}-${id}`, sql: 'SELECT 1', reason: 'left' });
      assert.equal(r.status, 404, `${path} ${id}`);
      assert.ok(!leaks(await r.json()));
    }
  }
});

test('hint 3 (and hints 1 and 2) answer 404 for a mock item, and log nothing', async () => {
  const d = await deps();
  const a = createApp(d);
  for (const id of MOCK_ITEMS) for (const level of [1, 2, 3]) {
    const r = await post(a, '/api/hint', { item_id: id, item_instance_id: `I-hint-${id}`, level });
    assert.equal(r.status, 404, `hint ${level} ${id}`);
    assert.ok(!leaks(await r.json()));
  }
  assert.deepEqual(await d.logger.readAll('attempts'), []);
});

test('show-answer answers 404 for a mock item, and logs nothing', async () => {
  const d = await deps();
  const a = createApp(d);
  for (const id of MOCK_ITEMS) {
    const r = await post(a, '/api/show-answer', { item_id: id, item_instance_id: `I-show-${id}` });
    assert.equal(r.status, 404, id);
    assert.ok(!leaks(await r.json()));
  }
  assert.deepEqual(await d.logger.readAll('attempts'), []);
});

test('POST /api/other-way answers 404 for a mock item, even for an instance with a logged pass', async () => {
  const passed = instance({ id: 'I-other', item: SCREEN_ITEM, concept: FIXTURE_CONCEPT, start: '2026-11-02T09:00:00Z', version: 2,
    steps: [{ at: '2026-11-02T09:01:00Z', submit: 'pass' }] });
  const d = await deps(content, passed);
  const a = createApp(d);
  for (const [id, inst] of [[SCREEN_ITEM, 'I-other'], [MOCK_CP3, 'I-other-2']]) {
    const r = await post(a, '/api/other-way', { item_id: id, item_instance_id: inst });
    assert.equal(r.status, 404, id);
    assert.ok(!leaks(await r.json()));
  }
});

test('POST /api/serve, every purpose: never a mock item, though the lesson names it first', async () => {
  for (const purpose of ['review', 'new_concept', 'retest', 'relearning', 'opener', 'practice', 'wheel_spinning', 'case']) {
    const r = await post(app, '/api/serve', { section: 'sql', purpose, concept_id: FIXTURE_CONCEPT, case_id: MOCK_CASE });
    const body = await r.json();
    assert.ok(r.status !== 200 || !MOCK_ITEMS.includes(body.item_id), `${purpose} served a mock item`);
    assert.ok(!leaks(body), purpose);
  }
  // The pretest's first item is the mock one, so a new concept has nothing to start with; a practice case still serves its CP3.
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'new_concept', concept_id: FIXTURE_CONCEPT })).status, 404);
  assert.equal((await json(post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: INBOX_ID }))).item_id, 'EX-CASE-PRICE-01');
});

/** The store with drill specs: level 1's pool names both mock items beside a practice drill item, and a cumulative drill over level 1. */
function withDrills(): ContentStore & { drills(): DrillSpec[]; cumulativeDrills(): CumulativeSpec[] } {
  const drill = { ...content.item(PRACTICE_ITEM)!, id: `EX-${FIXTURE_CONCEPT}-E1-31`, use: 'drill' as const };
  return {
    ...content,
    item: (id: string) => (id === drill.id ? drill : content.item(id)),
    key: (id: string) => (id === drill.id ? { ...content.key(PRACTICE_ITEM)!, item_id: drill.id } : content.key(id)),
    drills: () => [{ level: 1, questions: 1, minutes: 5, pass_pct: 90, concepts: [FIXTURE_CONCEPT], unseen_min_pct: 0, mode: 'normal', pool_item_ids: [...MOCK_ITEMS, drill.id] }],
    cumulativeDrills: () => [{ id: 'CUM-1', levels: [1], per_level: 3, minutes: 10, pass_pct: 80, unseen_min_pct: 70, mode: 'normal' }],
  };
}

test('the level drill, the cumulative drill and a chosen-concepts drill never draw a mock item', async () => {
  const a = createApp(await deps(withDrills()));
  const served = async (path: string, body: unknown): Promise<string[]> => {
    const run = await json(post(a, path, body));
    assert.ok(Array.isArray(run.servings), `${path}: ${JSON.stringify(run.error ?? '')}`);
    await post(a, '/api/drill/end', { block_id: run.block_id });
    return run.servings.map((s: { item_id: string }) => s.item_id);
  };
  assert.deepEqual(await served('/api/drill/start', { level: 1 }), [`EX-${FIXTURE_CONCEPT}-E1-31`]);
  assert.deepEqual(await served('/api/drill/cumulative/start', {}), [`EX-${FIXTURE_CONCEPT}-E1-31`]);
  const chosen = await served('/api/drill/start', { concept_ids: [FIXTURE_CONCEPT] });
  assert.ok(chosen.length > 0 && chosen.every((id) => !MOCK_ITEMS.includes(id)), 'the lesson pool lists the mock items first');
});

test('POST /api/explore/run naming a mock item or its hidden data opens nothing: the explorer lists datasets, never items', async () => {
  const item = content.mockItem!(SCREEN_ITEM)!;
  for (const body of [{ item_id: SCREEN_ITEM, schema: item.edge_schema, sql: 'SELECT 1' }, { schema: SCREEN_ITEM, sql: 'SELECT 1' }, { item_id: MOCK_CP3, schema: MOCK_CP3, sql: 'SELECT 1' }]) {
    const r = await post(app, '/api/explore/run', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(!leaks(await r.json()));
  }
  assert.ok(!leaks(await json(get(app, '/api/explore'))));
});

test('GET /api/cases leaves the mock case out; GET /api/cases/:id and every case route answer 404 for it', async () => {
  const inbox = await json(get(app, '/api/cases'));
  assert.ok(inbox.some((c: { case_id: string }) => c.case_id === INBOX_ID));
  assert.ok(!leaks(inbox));
  assert.equal((await get(app, `/api/cases/${MOCK_CASE}`)).status, 404);
  for (const path of [`checkpoints/CP1/serve`, `checkpoints/CP2/answer`, 'plan', 'plan-check', 'sketch', 'insight', 'rubric']) {
    const r = await post(app, `/api/cases/${MOCK_CASE}/${path}`, { item_instance_id: 'I-case', typed: '1', fields: {}, text: 'x', ticked: [] });
    assert.equal(r.status, 404, path);
    assert.ok(!leaks(await r.json()));
  }
});

test('the portfolio leaves the mock case out, even with every checkpoint of it answered right, and will not export it', async () => {
  const day = (min: number) => new Date(Date.parse('2026-11-02T09:00:00Z') + min * 60_000).toISOString();
  const answered = ['CP1', 'CP2', 'CP4', 'CP5'].flatMap((cp, k) => instance({ id: `I-${cp}`, item: `${MOCK_CASE}:${cp}`, concept: FIXTURE_CONCEPT, phase: 'case',
    kind: cp === 'CP2' || cp === 'CP4' ? 'typed' : 'mcq', start: day(10 * k), version: 2, steps: [{ at: day(10 * k + 1), submit: 'pass' }] }));
  const cp3 = instance({ id: 'I-CP3', item: MOCK_CP3, concept: FIXTURE_CONCEPT, phase: 'case', start: day(50), version: 2, steps: [{ at: day(51), submit: 'pass' }] });
  const a = createApp(await deps(content, [...answered, ...cp3]));
  const portfolio = await json(get(a, '/api/portfolio'));
  assert.ok(!leaks(portfolio.cases));
  assert.equal((await post(a, `/api/cases/${MOCK_CASE}/export`, {})).status, 404);
});

test('server/tutor-source.ts gives the tutor no mock item and no mock case', () => {
  const source = tutorSource(content, []);
  for (const id of MOCK_ITEMS) assert.equal(source.item(id), undefined, id);
  assert.equal(source.caseRecord(MOCK_CASE), undefined);
  assert.equal(source.item(PRACTICE_ITEM)?.id, PRACTICE_ITEM, 'a practice item is there as before');
});

// F2-2-5: the server's catalog has no mock item (content.item holds it out), so familyOf takes the attempt's item_kind: a screen-mock write
// item is rated by the drill row (S7-C08): a fast first-try pass on a rated card is Good, never Easy.
test('S7-C08 through buildCatalog: a screen-mock item takes its family from its kind and a fast first-try pass on a rated card is Good, never Easy', () => {
  const catalog = buildCatalog(content);
  assert.equal(content.item(SCREEN_ITEM), undefined, 'the practice lookup holds the mock item out');
  assert.equal(catalog.familyOf(SCREEN_ITEM, 'write'), 'write');
  const block = 'mock-screen-00000000-0000-4000-8000-000000000009';
  const start = '2026-10-13T09:00:00Z', end = '2026-10-13T09:45:00Z';
  const r = replay([...primed(FIXTURE_CONCEPT, '2026-10-12'),
    ...instance({ id: 'MQ-1', item: SCREEN_ITEM, concept: FIXTURE_CONCEPT, phase: 'mock', block, start, version: 2,
      steps: [{ at: '2026-10-13T09:00:30Z', submit: 'pass', activeMs: 10_000 }], close: { at: end, reason: 'run_end' } }),
    blockClose(block, end)], [], options({ catalog }));
  assert.deepEqual([r.instances.get('MQ-1')?.rating, r.instances.get('MQ-1')?.why], [3, 'mock: passed within the time limit'], 'Good: the drill row, never Easy');
  assert.deepEqual(r.blocks.get(block)?.card_reviews.map((c) => [c.card_id, c.rating]), [[catalog.cardOf(FIXTURE_CONCEPT), 3]]);
});

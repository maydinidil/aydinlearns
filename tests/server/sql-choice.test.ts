// Task C4: SQL choice items on the server (S3-13 to S3-17). The content store loads them and their keys; /api/choice serves
// them with section sql (the view, the answer, the log fields); /api/items never sends their options; the composer serves them
// within S3-16's caps and builds the predict pretest (S3-17); and replay rates them on the multiple-choice map (S3-15). Every
// item here is invented (tests/helpers/sql-choice-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, targetOf, type ContentStore } from '../../server/content.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog } from '../../server/state.ts';
import { Servings } from '../../server/servings.ts';
import { CHOICE_GRADER_VERSION } from '../../server/choice/grade.ts';
import { publicSqlChoiceItem, servableSqlChoiceItem, type SqlChoiceServedView } from '../../server/routes/choice.ts';
import { mixedBlock, pickItem, pretestItemIds } from '../../server/session-composer.ts';
import { optionId } from '../../schemas/choice.ts';
import type { SqlItem } from '../../schemas/item.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { ALL_KINDS, IDS, sqlChoiceItem, sqlChoiceKey, writeSqlChoice } from '../helpers/sql-choice-fixture.ts';
import { instance, primed, run } from '../helpers/replay-fixture.ts';

const NEEDS_FIX = `EX-${FIXTURE_CONCEPT}-E1-26`;
const root = await makeContentFixture();
await writeSqlChoice(root, [...ALL_KINDS.map((k) => sqlChoiceItem(k)), { ...sqlChoiceItem('which_table'), id: NEEDS_FIX, status: 'needs_fix' }],
  [...ALL_KINDS.map((k) => sqlChoiceKey(k)), { ...sqlChoiceKey('which_table'), item_id: NEEDS_FIX }]);
const content = await loadContent(root);
const lesson = content.lesson(FIXTURE_CONCEPT)!;

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

async function deps(seed: object[] = [], store: ContentStore = content): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-sqlchoice-')));
  for (const r of seed) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
const attempts = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
const show = (app: Hono, id: string, query = '') => get(app, `/api/choice/${id}?section=sql${query}`);
const answer = (app: Hono, body: Record<string, unknown>) => post(app, '/api/choice/answer', body);

// ---- Content -----------------------------------------------------------------------------------------------------------------

test('the store loads SQL choice items with the SQL items, and their keys from keys/sql-choice, never as SQL keys', () => {
  assert.equal(content.item(IDS.choose_query)?.kind, 'choose_query');
  assert.equal(content.sqlChoiceKey?.(IDS.predict_rows)?.value, 2);
  assert.equal(content.key(IDS.predict_rows), undefined);
  assert.equal(content.choiceItem?.(IDS.choose_query), undefined, 'not a GA4 or Methodology item');
  assert.equal(targetOf(content, IDS.is_unique), FIXTURE_CONCEPT);
  assert.deepEqual(content.sqlItems?.().filter((i) => i.kind !== 'write').map((i) => i.id), [...Object.values(IDS), NEEDS_FIX]);
  assert.equal(servableSqlChoiceItem(content, IDS.which_table)?.id, IDS.which_table);
  assert.equal(servableSqlChoiceItem(content, NEEDS_FIX), undefined, 'an item the solver loop left as needs_fix is never served');
  assert.equal(servableSqlChoiceItem(content, lesson.pool_item_ids[0]!), undefined, 'a write item is not a choice item');
});

// ---- GET (S3-14) ---------------------------------------------------------------------------------------------------------------

const KEY_FIELDS = ['correct_oid', 'value', 'explanation', 'solver', 'misconception_id', 'edge_schema', 'hints', 'template_id', 'difficulty'];
test('GET ?section=sql sends the question, shown_sql, the option tables in a shuffled order and the schema; never the key', async () => {
  const d = await deps();
  const app = createApp(d);
  const r = await show(app, IDS.predict_result);
  assert.equal(r.status, 200);
  const text = await r.text();
  for (const f of KEY_FIELDS) assert.ok(!text.includes(`"${f}"`), `no ${f}`);
  assert.ok(!text.includes(sqlChoiceKey('predict_result').explanation) && !text.includes('MIS-FAKE'));
  const body = JSON.parse(text) as SqlChoiceServedView;
  const item = sqlChoiceItem('predict_result');
  assert.deepEqual(body.item, { id: item.id, version: 1, section: 'sql', kind: 'mcq', sql_kind: 'predict_result', stem: item.prompt, concept_id: FIXTURE_CONCEPT,
    topic_id: null, level: 1, typed: null, exam_relevance: null, verified: true, schema: 'voltmarkt', shown_sql: item.shown_sql, unique_check: null });
  assert.deepEqual(body.shown_order, body.options.map((o) => o.oid));
  assert.deepEqual(body.options.map((o) => Object.keys(o)), body.options.map(() => ['oid', 'text', 'table']));
  for (const o of body.options) assert.deepEqual(o.table, item.options!.find((x) => x.oid === o.oid)!.table);
  assert.equal(body.phase, 'free');
  const rows = await json(show(app, IDS.predict_rows));
  assert.deepEqual([rows.item.kind, rows.item.sql_kind, rows.item.typed, rows.options, rows.shown_order], ['typed', 'predict_rows', sqlChoiceItem('predict_rows').typed, [], []]);
  const unique = await json(show(app, IDS.is_unique));
  assert.deepEqual([unique.item.unique_check, unique.item.shown_sql, unique.options.map((o: { text: string }) => o.text).sort()], [{ table: 'stores', column: 'store_id' }, null, ['No', 'Yes']]);
  assert.deepEqual(await attempts(d), [], 'a question shown is not logged');
  assert.deepEqual(Object.keys(publicSqlChoiceItem(sqlChoiceItem('choose_query'))).sort(),
    ['concept_id', 'exam_relevance', 'id', 'kind', 'level', 'schema', 'section', 'shown_sql', 'sql_kind', 'stem', 'topic_id', 'typed', 'unique_check', 'verified', 'version']);
});

test('GET ?section=sql serves only active SQL choice items, and names the pretest phase only when asked for it', async () => {
  const app = createApp(await deps());
  assert.equal((await show(app, NEEDS_FIX)).status, 404);
  assert.equal((await show(app, lesson.pool_item_ids[0]!)).status, 404, 'a write item');
  assert.equal((await get(app, `/api/choice/${IDS.choose_query}?section=ga4`)).status, 404, 'another section');
  assert.equal((await get(app, `/api/choice/${IDS.choose_query}?section=nope`)).status, 400);
  assert.equal((await json(show(app, IDS.predict_rows, '&phase=pretest'))).phase, 'pretest', 'S3-17: the predict pretest item');
  assert.equal((await json(show(app, IDS.predict_rows, '&phase=free'))).phase, 'free');
  assert.equal((await show(app, IDS.predict_rows, '&phase=review')).status, 400, 'a served-only phase comes from a serving, never the browser');
});

test('/api/items sends an SQL choice item without its options, so no misconception or source order reaches the browser', async () => {
  const app = createApp(await deps());
  const r = await json(get(app, `/api/items/${IDS.choose_query}`));
  assert.equal(r.item.kind, 'choose_query');
  assert.ok(!('options' in r.item));
  assert.ok(!JSON.stringify(r).includes('MIS-FAKE'));
  assert.equal((await post(app, '/api/hint', { item_id: IDS.choose_query, item_instance_id: 'I-H', level: 1 })).status, 404, 'no hints: no SQL key');
  assert.equal((await post(app, '/api/show-answer', { item_id: IDS.choose_query, item_instance_id: 'I-S' })).status, 404, 'the choice route reveals it');
});

// ---- Answer and show-answer (S3-14) --------------------------------------------------------------------------------------------

test('an answer is graded by the choice grader and logged with section sql, the kind, payload mcq and the item\'s own fields', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, IDS.choose_query));
  const right = optionId(IDS.choose_query, 0);
  const r = await json(answer(app, { item_id: IDS.choose_query, item_instance_id: served.item_instance_id, chosen: right, confidence: 3, shown_order: served.shown_order, active_ms: 9000 }));
  assert.deepEqual(r, { correct: true, correct_oid: right, explanation: sqlChoiceKey('choose_query').explanation, error_ids: [], attempt_id: (await attempts(d))[0].attempt_id });
  const [a, close] = await attempts(d);
  const item = sqlChoiceItem('choose_query');
  assert.deepEqual([a.record, a.schema_version, a.section, a.item_kind, a.item_id, a.item_version], ['attempt', SCHEMA_VERSION, 'sql', 'choose_query', item.id, 1]);
  assert.deepEqual([a.target_concept_id, a.concept_ids, a.template_id, a.level, a.difficulty, a.sub_skill, a.world, a.target_ms],
    [FIXTURE_CONCEPT, [FIXTURE_CONCEPT], item.template_id, 1, 'E1', null, 'pricing', item.time_target_ms]);
  assert.deepEqual(a.payload, { kind: 'mcq', shown_order: served.shown_order, chosen: right });
  assert.deepEqual([a.outcome, a.is_correct, a.confidence, a.grader_version, a.hint_level, a.fading_stage, a.active_ms, a.phase],
    ['pass', true, 3, CHOICE_GRADER_VERSION, 0, null, 9000, 'free']);
  assert.deepEqual([close.record, close.item_id, close.target_concept_id, close.reason], ['item_close', item.id, FIXTURE_CONCEPT, 'pass']);
  // A wrong option names its misconception; a typed count is read as the app reads one, and a refusal logs nothing.
  const s2 = await json(show(app, IDS.which_table));
  assert.deepEqual((await json(answer(app, { item_id: IDS.which_table, item_instance_id: s2.item_instance_id, chosen: optionId(IDS.which_table, 1) }))).error_ids, ['MIS-FAKE-1']);
  const s3 = await json(show(app, IDS.predict_rows));
  assert.equal((await answer(app, { item_id: IDS.predict_rows, item_instance_id: s3.item_instance_id, typed: '2.5' })).status, 400);
  assert.equal((await attempts(d)).length, 4);
  const typed = await json(answer(app, { item_id: IDS.predict_rows, item_instance_id: s3.item_instance_id, typed: ' 2 ' }));
  assert.deepEqual([typed.correct, typed.value], [true, 2]);
  assert.deepEqual((await attempts(d)).at(-2).payload, { kind: 'mcq', shown_order: [], chosen: null, typed: ' 2 ' });
  assert.equal((await attempts(d)).at(-2).item_kind, 'predict_rows');
});

test('show-answer logs a version 2 solution_opened naming the item, its target and the phase, then reveals the key', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, IDS.is_unique, '&phase=free'));
  const r = await json(post(app, '/api/choice/show-answer', { item_id: IDS.is_unique, item_instance_id: served.item_instance_id }));
  assert.deepEqual(r, { correct_oid: optionId(IDS.is_unique, 0), explanation: sqlChoiceKey('is_unique').explanation });
  const [s] = await attempts(d);
  assert.deepEqual([s.record, s.schema_version, s.item_id, s.target_concept_id, s.phase], ['solution_opened', SCHEMA_VERSION, IDS.is_unique, FIXTURE_CONCEPT, 'free']);
});

// ---- Rating (S3-15) ------------------------------------------------------------------------------------------------------------

test('S3-15: replay rates an SQL choice instance on the multiple-choice map, never Easy, never qualifying; a pass counts toward Practised', async () => {
  // sprint 2's catalog already sends these kinds to the choice map (family other_sql, Task B6); this pins it for the real kinds.
  const catalog = buildCatalog(content);
  assert.deepEqual(ALL_KINDS.map((k) => catalog.familyOf(IDS[k], k)), ALL_KINDS.map(() => 'other_sql'));
  const seed = primed(FIXTURE_CONCEPT, '2026-09-01');           // the card has its first rating
  const d = await deps(seed);
  const app = createApp(d);
  const rate = async (id: string, body: Record<string, unknown>, reveal = false) => {
    const s = await json(show(app, id));
    if (reveal) await post(app, '/api/choice/show-answer', { item_id: id, item_instance_id: s.item_instance_id });
    await answer(app, { item_id: id, item_instance_id: s.item_instance_id, ...body });
    return d.state.current().instances.get(s.item_instance_id)!;
  };
  const good = await rate(IDS.choose_query, { chosen: optionId(IDS.choose_query, 0), confidence: 4, active_ms: 1 });
  assert.deepEqual([good.rating, good.countsAsPass, good.qualifying], [3, true, false], 'Good, never Easy, even fast at confidence 4');
  const hard = await rate(IDS.which_table, { chosen: optionId(IDS.which_table, 0), confidence: 2 });
  assert.deepEqual([hard.rating, hard.countsAsPass], [2, true]);
  const again = await rate(IDS.is_unique, { chosen: optionId(IDS.is_unique, 1), confidence: 3 });
  assert.deepEqual([again.rating, again.countsAsPass], [1, false]);
  const revealed = await rate(IDS.predict_rows, { typed: '2', confidence: 3 }, true);
  assert.deepEqual([revealed.rating, revealed.countsAsPass], [1, false], 'a show-answer before answering is Again');
  const closes = (await attempts(d)).filter((x) => x.record === 'item_close' && x.item_id.startsWith(`EX-${FIXTURE_CONCEPT}-E1-2`));
  assert.deepEqual(closes.map((c) => c.instance_rating), [3, 2, 1, 1], 'each close is logged with the rating replay gives it');
  // Practised (S2-20): the primed pass and the two counted choice passes make 3.
  assert.equal(d.state.current().concepts.get(FIXTURE_CONCEPT)?.state, 'practised');
});

test('S3-17 with S2-11: the write pretest item and the predict item, both passed without help, create the card at Good', async () => {
  const day = '2026-09-02';
  const writePretest = instance({ id: 'P-W', item: lesson.pretest_item_ids[0]!, concept: FIXTURE_CONCEPT, phase: 'pretest', start: `${day}T09:00:00Z`,
    steps: [{ at: `${day}T09:01:00Z`, submit: 'pass' }] });
  const d = await deps(writePretest);
  const app = createApp(d);
  const s = await json(show(app, IDS.predict_rows, '&phase=pretest'));
  await answer(app, { item_id: IDS.predict_rows, item_instance_id: s.item_instance_id, typed: '2', confidence: 2 });
  const [a] = (await attempts(d)).filter((x) => x.record === 'attempt' && x.item_id === IDS.predict_rows);
  assert.equal(a.phase, 'pretest');
  const card = d.state.current().cards.get(`CARD-${FIXTURE_CONCEPT}`)!;
  assert.deepEqual([card.origin, card.rated], ['pretest', true]);
  // With a show-answer first, the predict item is not clean, and the pretest gives no card.
  const d2 = await deps(writePretest);
  const app2 = createApp(d2);
  const s2 = await json(show(app2, IDS.predict_rows, '&phase=pretest'));
  await post(app2, '/api/choice/show-answer', { item_id: IDS.predict_rows, item_instance_id: s2.item_instance_id });
  await answer(app2, { item_id: IDS.predict_rows, item_instance_id: s2.item_instance_id, typed: '2' });
  assert.equal(d2.state.current().cards.get(`CARD-${FIXTURE_CONCEPT}`), undefined);
  // Through the replay fixture too: the same records rate the same way under the server's catalog.
  const r = run({ attempts: [...writePretest, ...instance({ id: 'P-P', item: IDS.predict_result, kind: 'predict_result', concept: FIXTURE_CONCEPT, phase: 'pretest',
    start: `${day}T09:02:00Z`, steps: [{ at: `${day}T09:02:30Z`, submit: 'pass' }] })], events: [] }, { catalog: buildCatalog(content) });
  assert.equal(r.cards.get(`CARD-${FIXTURE_CONCEPT}`)?.origin, 'pretest');
});

// ---- The composer (S3-16, S3-17) -----------------------------------------------------------------------------------------------

test('S3-17: a concept with a predict pretest item has its first write pretest item, then that predict item; the lesson route says so', async () => {
  assert.deepEqual(pretestItemIds(content, FIXTURE_CONCEPT), [lesson.pretest_item_ids[0], IDS.predict_rows]);
  // Without one, the lesson's own two.
  const bare = await loadContent(await makeContentFixture());
  assert.deepEqual(pretestItemIds(bare, FIXTURE_CONCEPT), lesson.pretest_item_ids);
  // A predict item the lesson lists comes second, whatever its place in the list; a retired one is never used.
  const listed = await makeContentFixture();
  await writeSqlChoice(listed, [sqlChoiceItem('predict_rows', { status: 'retired' }), sqlChoiceItem('predict_result', { use: 'pretest' })], []);
  await writeFile(join(listed, 'sql/lessons', `${FIXTURE_CONCEPT}.json`), JSON.stringify({ ...lesson, pretest_item_ids: [IDS.predict_result, lesson.pretest_item_ids[1]] }));
  const listedStore = await loadContent(listed);
  assert.deepEqual(pretestItemIds(listedStore, FIXTURE_CONCEPT), [lesson.pretest_item_ids[1], IDS.predict_result]);
  assert.deepEqual(pretestItemIds(listedStore, 'SQL-NONE-01'), []);
  const app = createApp(await deps());
  const l = await json(get(app, `/api/lessons/${FIXTURE_CONCEPT}`));
  assert.deepEqual(l.pretest_item_ids, [lesson.pretest_item_ids[0], IDS.predict_rows]);
  assert.deepEqual(l.pool_item_ids, lesson.pool_item_ids, 'the rest of the lesson as it is');
  // Today starts a new concept with the pretest's first item: the write item, even when the lesson lists the predict item first.
  const served = await json(post(createApp(await deps([], listedStore)), '/api/serve', { section: 'sql', purpose: 'new_concept', concept_id: FIXTURE_CONCEPT }));
  assert.deepEqual([served.item_id, served.phase], [lesson.pretest_item_ids[1], 'pretest']);
});

const NOW = new Date('2026-10-20T10:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const sql = (id: string, concept: string, over: Partial<SqlItem> = {}): SqlItem =>
  ({ id, version: 1, section: 'sql', kind: 'write', use: 'pool', status: 'active', target_concept_id: concept, concept_ids: [concept], sub_skill: null, difficulty: 'E2', ...over }) as SqlItem;

test('S3-16: review servings draw SQL choice items from the pool, at most 1 in 3 fix or choice items together', () => {
  const C = 'SQL-AGG-01';
  const pool = [sql('X-E2-01', C, { kind: 'choose_query' }), sql('X-E2-02', C, { kind: 'predict_rows' }), sql('X-E2-03', C, { kind: 'fix' }),
    sql('X-E2-04', C), sql('X-E2-05', C), sql('X-E2-06', C), sql('X-E2-07', C, { kind: 'which_table', use: 'pretest' }), sql('X-E2-08', C, { kind: 'is_unique', status: 'needs_fix' })];
  const kinds: string[] = [];
  const ids: string[] = [];
  const seen: { item_id: string; started_at: string }[] = [];
  for (let n = 0; n < 6; n++) {
    const p = pickItem({ now: NOW, pool, seen, firstExposureAt: ago(20), recentReviewKinds: kinds, purpose: 'review' })!;
    kinds.push(p.item.kind);
    ids.push(p.item.id);
    seen.push({ item_id: p.item.id, started_at: NOW.toISOString() });
  }
  assert.equal(ids[0], 'X-E2-01', 'a choice item is served like any pool item');
  for (let i = 0; i + 3 <= kinds.length; i++) assert.ok(kinds.slice(i, i + 3).filter((k) => k !== 'write').length <= 1, kinds.join(' '));
  assert.ok(!ids.includes('X-E2-07') && !ids.includes('X-E2-08'), 'never a pretest item, never one that is not active');
  assert.equal(pickItem({ now: NOW, pool, seen: [], firstExposureAt: ago(20), recentReviewKinds: ['predict_rows'], purpose: 'review' })!.item.id, 'X-E2-04',
    'a choice item two servings back blocks a fix item too');
});

test('S3-16: a mixed block holds at most 2 fix or choice items together: its fix item and one SQL choice item', () => {
  const concepts = ['SQL-AGG-03', 'SQL-FILTER-01', 'SQL-CASE-01', 'SQL-AGG-04', 'SQL-AGG-02', 'SQL-SORT-01'];
  const pools = new Map(concepts.map((c) => [c, [sql(`EX-${c}-E2-06`, c), sql(`EX-${c}-E2-07`, c), sql(`EX-${c}-E2-30`, c, { kind: 'choose_query' }),
    ...(c === 'SQL-AGG-04' ? [sql(`EX-${c}-E2-20`, c, { kind: 'fix' })] : [])]]));
  const block = mixedBlock({ concepts, poolOf: (c) => pools.get(c) ?? [], cardOf: (c) => `CARD-${c}`, seen: [], firstExposureOf: () => ago(3), now: NOW, pairs: [] });
  assert.equal(block.length, 6);
  const special = block.filter((b) => b.item.kind !== 'write');
  assert.deepEqual(special.map((b) => b.item.kind).sort(), ['choose_query', 'fix']);
  assert.notEqual(special[0]!.concept_id, special[1]!.concept_id);
  assert.equal(new Set(block.map((b) => b.concept_id)).size, 6, 'still one item per card');
  // Without any choice item, the block is as before: one fix item and the rest write items.
  const plain = new Map([...pools].map(([c, p]) => [c, p.filter((i) => i.kind !== 'choose_query')]));
  const before = mixedBlock({ concepts, poolOf: (c) => plain.get(c) ?? [], cardOf: (c) => `CARD-${c}`, seen: [], firstExposureOf: () => ago(3), now: NOW, pairs: [] });
  assert.deepEqual(before.filter((b) => b.item.kind !== 'write').map((b) => b.item.kind), ['fix']);
});

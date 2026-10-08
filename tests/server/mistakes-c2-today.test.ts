// tests/server/mistakes-c2-today.test.ts: mistake cards on the server (sprint 4a Task C2; rulings S4-06 to S4-08, S4-10, S4-13;
// design §4 "A study day", §5, §14 "Mistakes and review"; Review Focus 1). Today's review step and its serving, the mixed block and
// the drill, the wheel-spinning step, the wrap-up's corrected query, GET /api/mistakes and POST /api/mistakes/:card/try. Every route
// runs against an in-memory content store (no runner) and an empty temporary log, at the real clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { mistakeCardId } from '../../core/replay.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { ChoiceKey } from '../../schemas/choice.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import type { ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loadErrorNames } from '../../server/routes/mistakes.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { instance, type Step } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const WITH_CONTENT = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01', 'SQL-AGG-01'];
/** The mistake's concept: its pool has two fix items whose starter makes ERR-LOG-14, and the key of its first E1 pool item plants it. */
const X = 'SQL-NULL-01';
const ERR = 'ERR-LOG-14';
const CARD = mistakeCardId(X, ERR);
const id = (concept: string, n: string) => `EX-${concept}-${n}`;
const PLANTS = new Set([id(X, 'E1-08')]);
const NAMES: Record<string, string> = { [ERR]: 'Invented name for the missing filter', 'ERR-LOG-05': 'Invented name for the wrong grain' };

function sqlItem(itemId: string, concept: string, use: SqlItem['use'], over: Partial<SqlItem> = {}): SqlItem {
  return {
    id: itemId, version: 1, kind: 'write', tags: [], level: curriculum.concepts.find((c) => c.id === concept)!.level, source_ids: [], verified: true,
    as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use,
    target_concept_id: concept, concept_ids: [concept], template_id: 'T-C2', template_params: {}, sub_skill: null,
    difficulty: (/-(E[123])-/.exec(itemId)![1]) as SqlItem['difficulty'], company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics',
    prompt: `Show the cities for ${itemId}.`, output_contract: null, rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
    hints: ['Which table holds the stores?', 'Which clause keeps one store?'], subgoals: [], fading: null, faded_shape: null, starter_sql: null,
    time_target_ms: 120_000, why_this_works: 'It names the column.', ...over,
  } as SqlItem;
}

/** Key text no response may carry: every key here has it. */
const KEY_TEXT = { reference: 'SELECT key_reference_column', alternative: 'SELECT key_alternative_column', planted: 'SELECT key_planted_column', hint3: 'SELECT key_hint_three' };

/** As tests/server/today.test.ts's store, plus the item list (S4-06 trap items) and the error names the mistakes routes read. */
function memoryContent(extra: Partial<ContentStore> = {}): ContentStore {
  const items = new Map<string, SqlItem>();
  const lessons = new Map<string, Lesson>();
  for (const c of WITH_CONTENT) {
    const ids = { pre: [id(c, 'E1-01'), id(c, 'E1-02')], lesson: [id(c, 'E1-03'), id(c, 'E1-04'), id(c, 'E2-05'), id(c, 'E2-06')], retest: id(c, 'E1-07'),
      pool: [id(c, 'E1-08'), id(c, 'E1-09'), id(c, 'E2-10'), id(c, 'E2-11'), id(c, 'E2-12'), id(c, 'E3-13'), ...(c === X ? [id(c, 'E2-14'), id(c, 'E2-15')] : [])] };
    for (const x of ids.pre) items.set(x, sqlItem(x, c, 'pretest'));
    for (const x of ids.lesson) items.set(x, sqlItem(x, c, 'lesson'));
    items.set(ids.retest, sqlItem(ids.retest, c, 'retest'));
    for (const x of ids.pool) items.set(x, sqlItem(x, c, 'pool', /E2-1[45]$/.test(x) ? { kind: 'fix', starter_sql: 'SELECT city FROM stores', starter_error_id: ERR } : {}));
    lessons.set(c, { concept_id: c, version: 1, reading_md: 'Read.', syntax_md: '', dialect_note: null, worked_examples: [] as unknown as Lesson['worked_examples'],
      pretest_item_ids: ids.pre as [string, string], lesson_item_ids: ids.lesson as Lesson['lesson_item_ids'], retest_item_id: ids.retest, pool_item_ids: ids.pool, source_ids: [] });
  }
  const key = (item_id: string): SqlKey => ({ item_id, item_version: 1, reference_sql: KEY_TEXT.reference, alternatives: [KEY_TEXT.alternative, KEY_TEXT.alternative],
    other_way: null, planted_wrong: PLANTS.has(item_id) ? [{ id: 'M1', error_id: ERR, sql: KEY_TEXT.planted }] : [], hint3_partial: KEY_TEXT.hint3, solver: null });
  const store: ContentStore & { errorNames(): Record<string, string> } = {
    curriculum, feedback: {}, goals: [], contentVersion: 'c2-test', errorConcepts: {},
    lesson: (c) => lessons.get(c), item: (x) => items.get(x), key: (x) => (items.has(x) ? key(x) : undefined), edge: () => undefined,
    conceptsWithContent: () => new Set(lessons.keys()), sqlItems: () => [...items.values()], errorNames: () => NAMES, ...extra,
  };
  return store;
}

async function deps(content: ContentStore = memoryContent()): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-c2-'))));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
const records = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
/** Writes an earlier session's records straight to the attempts file, as the routes would have. */
async function write(d: AppDeps, recs: object[]): Promise<void> { for (const r of recs) await d.logger.attempt(r as AydinAttempt); }
/** One instance's records, each attempt with its own query text and diff summary, and optionally a card_id (D28). */
function inst(o: { id: string; item: string; concept: string; phase?: 'free' | 'lesson_block' | 'review'; start: string; steps: Step[]; session?: string;
  queries?: string[]; diff?: string | null; card?: string }): object[] {
  let n = 0;
  return instance({ id: o.id, item: o.item, concept: o.concept, phase: o.phase ?? 'free', start: o.start, steps: o.steps, version: 2, session: o.session })
    .map((r: any) => (r.record !== 'attempt' ? r : { ...r, ...(o.card ? { card_id: o.card } : {}),
      payload: { ...r.payload, submitted_query: o.queries?.[n++] ?? r.payload.submitted_query, diff_summary: o.diff ?? r.payload.diff_summary } }));
}
const plus = (t: string, s: number) => new Date(Date.parse(t) + s * 1000).toISOString();
/** The mistake: a failed lesson-block attempt on X naming ERR-LOG-14 an hour ago. It makes a New card, due at once; X has no card of its own. */
async function makeMistake(d: AppDeps): Promise<{ attempt_id: string; at: string }> {
  const at = iso(3_600_000);
  await write(d, inst({ id: 'MISTAKE-1', item: id(X, 'E1-03'), concept: X, phase: 'lesson_block', start: at, steps: [{ at: plus(at, 30), submit: 'fail', errors: [ERR] }],
    queries: ['SELECT the learners own text'], diff: '2 missing, 1 extra' }));
  return { attempt_id: 'MISTAKE-1-1', at: plus(at, 30) };
}

// ---- Today: the review step and its serving (S4-07, S4-08; Review Focus 1) ---------------------------------------------------------

test('the review step counts a due mistake card; /api/serve review serves its trap item (a fix item whose starter makes the error) with card_id on the serving only', async () => {
  const d = await deps();
  await makeMistake(d);
  const app = createApp(d);
  const today = await json(get(app, '/api/today?section=sql'));
  assert.deepEqual(today.plan.steps.find((s: any) => s.kind === 'reviews'), { kind: 'reviews', card_ids: [CARD] });
  assert.deepEqual(today.plan.minimumDay, [{ kind: 'reviews', card_ids: [CARD] }]);

  const served = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review' }));
  assert.deepEqual({ ...served, item_instance_id: typeof served.item_instance_id }, { item_id: id(X, 'E2-14'), item_instance_id: 'string', phase: 'review',
    block_id: null, repeat_exposure: false, hide_labels: true }, 'the response names no card: a review hides its concept until after submission (S2-39)');
  assert.deepEqual(d.servings.get(served.item_instance_id), { phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: id(X, 'E2-14'), card_id: CARD });
  await post(app, '/api/hint', { item_id: served.item_id, item_instance_id: served.item_instance_id, level: 1, phase: 'free' });
  const hint = (await records(d)).find((r) => r.record === 'hint_opened');
  assert.deepEqual([hint.card_id, hint.phase], [CARD, 'review'], 'D33: the help record names the card the instance reviews');
  const again = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review' }));
  assert.deepEqual([again.item_id, again.item_instance_id], [served.item_id, served.item_instance_id], 'Codex F20: the card has an open instance, so a second serve answers it');

  // An ordinary review of the concept (named), on the same trap items: no card_id, so it rates the concept card.
  const ordinary = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: X }));
  assert.equal(ordinary.item_id, id(X, 'E1-08'), 'a write trap item, served as an ordinary review');
  assert.equal('card_id' in d.servings.get(ordinary.item_instance_id)!, false);
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'relearning' })).status, 404, 'S4-08: a mistake card is never served as relearning');
});

test('S4-08: a mixed block and a drill never hold a mistake-card review, even when they hold its trap items', async () => {
  const d = await deps();
  await makeMistake(d);
  const app = createApp(d);
  const block = await json(post(app, '/api/mixed/start', { section: 'sql' }));
  assert.ok(block.servings.some((s: any) => [id(X, 'E2-14'), id(X, 'E2-15'), id(X, 'E1-08')].includes(s.item_id)), 'the block holds a trap item');
  for (const s of block.servings) assert.equal('card_id' in d.servings.get(s.item_instance_id)!, false, `mixed ${s.item_id}`);
  const run = await json(post(app, '/api/drill/start', { concept_ids: [X] }));
  assert.ok(run.servings.length >= 3);
  for (const s of run.servings) assert.equal('card_id' in d.servings.get(s.item_instance_id)!, false, `drill ${s.item_id}`);
});

// ---- S4-10: the wheel-spinning step ----------------------------------------------------------------------------------------------

test('S4-10: a wheel-spinning concept gets a step at the top with its easier E1 item; /api/serve wheel_spinning serves that item in phase free', async () => {
  const d = await deps();
  const Y = 'SQL-FILTER-01';
  // 5 graded instances over 2 sessions, none passed: the flag (T-17). Their error is no mistake-card error.
  const fails = [['E2-10', 'S-1'], ['E2-11', 'S-1'], ['E2-12', 'S-1'], ['E3-13', 'S-2'], ['E2-10', 'S-2']] as const;
  for (const [n, [item, session]] of fails.entries()) {
    const at = iso((10 - n) * 3_600_000);
    await write(d, inst({ id: `WS-${n}`, item: id(Y, item), concept: Y, start: at, session, steps: [{ at: plus(at, 30), submit: 'fail', errors: ['ERR-OUT-01'] }] }));
  }
  assert.equal(d.state.current().concepts.get(Y)!.flags.wheelSpinning, true);
  const app = createApp(d);
  const plan = (await json(get(app, '/api/today?section=sql'))).plan;
  assert.deepEqual(plan.steps[0], { kind: 'wheel_spinning', concept_id: Y, item_id: id(Y, 'E1-08') });
  assert.ok(!plan.minimumDay.some((s: any) => s.kind === 'wheel_spinning'));
  const served = await json(post(app, '/api/serve', { section: 'sql', purpose: 'wheel_spinning' }));
  assert.deepEqual([served.item_id, served.phase, served.block_id, served.hide_labels, served.repeat_exposure], [id(Y, 'E1-08'), 'free', null, false, false]);
  assert.equal('card_id' in d.servings.get(served.item_instance_id)!, false);
  const named = await json(post(app, '/api/serve', { section: 'sql', purpose: 'wheel_spinning', concept_id: 'SQL-SORT-01' }));
  assert.equal(named.item_id, id('SQL-SORT-01', 'E1-08'), 'nothing is locked: any concept can have its easier exercise');
  assert.equal((await post(app, '/api/serve', { section: 'ga4', purpose: 'wheel_spinning' })).status, 404);
});

test('S4-10: with no wheel-spinning concept, Today has no such step and /api/serve wheel_spinning is a 404', async () => {
  const d = await deps();
  const app = createApp(d);
  assert.ok(!(await json(get(app, '/api/today?section=sql'))).plan.steps.some((s: any) => s.kind === 'wheel_spinning'));
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'wheel_spinning' })).status, 404);
});

// ---- S4-13: the wrap-up's corrected query ---------------------------------------------------------------------------------------

test('S4-13: the wrap-up\'s corrected query is the newest own passing query after a logged failure on the same item', async () => {
  const d = await deps();
  const S = 'SQL-SORT-01';
  const base = Date.now();
  const at = (h: number) => new Date(base - h * 3_600_000).toISOString();
  await write(d, [
    // An older correction.
    ...inst({ id: 'C-1', item: id(S, 'E2-10'), concept: S, start: at(72), steps: [{ at: at(71.9), submit: 'fail', errors: ['ERR-LOG-05'] }], queries: ['OLD FAILED'] }),
    ...inst({ id: 'C-2', item: id(S, 'E2-10'), concept: S, start: at(48), steps: [{ at: at(47.9), submit: 'pass' }], queries: ['OLD CORRECTED'] }),
    // The newest one: failed, then passed in the same instance.
    ...inst({ id: 'C-3', item: id(S, 'E1-09'), concept: S, start: at(6), steps: [{ at: at(5.9), submit: 'fail', errors: ['ERR-LOG-05'] }, { at: at(5.8), submit: 'pass' }],
      queries: ['NEW FAILED', 'NEW CORRECTED'] }),
    // Newer passes that do not count: after "show answer", an "I was right" override, and a pass with no failure before it.
    ...inst({ id: 'C-4', item: id(S, 'E2-11'), concept: S, start: at(3), steps: [{ at: at(2.9), submit: 'fail', errors: ['ERR-LOG-05'] }, { at: at(2.8), solution: true },
      { at: at(2.7), submit: 'pass' }], queries: ['SHOWN FAILED', 'COPIED'] }),
    ...inst({ id: 'C-5', item: id(S, 'E2-12'), concept: S, start: at(2), steps: [{ at: at(1.9), submit: 'fail', errors: ['ERR-LOG-05'] }, { at: at(1.8), override: true }],
      queries: ['DISPUTED'] }),
    ...inst({ id: 'C-6', item: id(S, 'E3-13'), concept: S, start: at(1), steps: [{ at: at(0.9), submit: 'pass' }], queries: ['FIRST TIME'] }),
  ]);
  const app = createApp(d);
  const body = await json(get(app, '/api/today?section=sql'));
  assert.deepEqual(body.corrected_query, { item_id: id(S, 'E1-09'), concept_id: S, error_id: 'ERR-LOG-05', error_name: NAMES['ERR-LOG-05'],
    failed_query: 'NEW FAILED', passed_query: 'NEW CORRECTED', failed_at: at(5.9), passed_at: at(5.8) });
  assert.equal((await json(get(app, '/api/today?section=ga4'))).corrected_query, null);
  assert.equal((await json(get(createApp(await deps()), '/api/today?section=sql'))).corrected_query, null, 'no failure corrected yet');
});

// ---- S4-13: GET /api/mistakes ----------------------------------------------------------------------------------------------------

/** Every property name in a JSON value, at any depth. */
const keysOf = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keysOf)
  : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysOf(x)]) : []);
/**
 * Every field of an SQL key and a choice key (the `satisfies` makes the typecheck fail when a key gains a field), plus the fields
 * nested inside them. item_id and item_version are left out: they name the item, and every item record carries them.
 */
const SQL_KEY_FIELDS = Object.keys({ item_id: 0, item_version: 0, reference_sql: 0, alternatives: 0, other_way: 0, planted_wrong: 0, hint3_partial: 0, solver: 0 } satisfies Record<keyof SqlKey, 0>);
const CHOICE_KEY_FIELDS = Object.keys({ item_id: 0, item_version: 0, correct_oid: 0, value: 0, explanation: 0, solver: 0 } satisfies Record<keyof ChoiceKey, 0>);
const KEY_FIELDS = [...new Set([...SQL_KEY_FIELDS, ...CHOICE_KEY_FIELDS, 'tradeoff', 'prompt_hash', 'sql'])].filter((k) => k !== 'item_id' && k !== 'item_version');

test('GET /api/mistakes: each active card with its error name, the learner\'s own original query and logged diff summary, due and state; the untrapped candidates as a count; no key field', async () => {
  const d = await deps();
  const m = await makeMistake(d);
  // A candidate with no trap item (no item plants ERR-LOG-20): listed for the tune-up as a count only.
  const at = iso(2 * 3_600_000);
  await write(d, inst({ id: 'NOTRAP', item: id('SQL-SORT-01', 'E1-03'), concept: 'SQL-SORT-01', phase: 'lesson_block', start: at,
    steps: [{ at: plus(at, 30), submit: 'fail', errors: ['ERR-LOG-20'] }] }));
  const app = createApp(d);
  const r = await get(app, '/api/mistakes');
  assert.equal(r.status, 200);
  const text = await r.text();
  const body = JSON.parse(text);
  assert.deepEqual(body, { cards: [{ card_id: CARD, concept_id: X, error_id: ERR, error_name: NAMES[ERR], state: 'new', due: m.at, is_due: true, created_at: m.at,
    last_review: null, occurrences: 1, original: { attempt_id: m.attempt_id, item_id: id(X, 'E1-03'), submitted_at: m.at, query: 'SELECT the learners own text',
      diff_summary: '2 missing, 1 extra' } }], untrapped_candidates: 1 });
  assert.ok(KEY_FIELDS.length >= 10);
  for (const k of keysOf(body)) assert.ok(!KEY_FIELDS.includes(k), `the response has the key field ${k}`);
  for (const [what, t] of Object.entries(KEY_TEXT)) assert.ok(!text.includes(t), `the key's ${what} text`);
  assert.deepEqual((await d.logger.readAll('events')), [], 'a read starts no session');
});

test('GET /api/mistakes with no mistakes: an empty list', async () => {
  assert.deepEqual(await json(get(createApp(await deps()), '/api/mistakes')), { cards: [], untrapped_candidates: 0 });
});

// ---- S4-13: POST /api/mistakes/:card/try ----------------------------------------------------------------------------------------

test('POST /api/mistakes/:card/try: a due card\'s trap item is served as free practice with card_id (it rates the card, never counts toward mastery); once reviewed (not due), as free practice without one', async () => {
  const d = await deps();
  await makeMistake(d);
  const app = createApp(d);
  const due = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD)}/try`, {}));
  assert.deepEqual({ ...due, item_instance_id: typeof due.item_instance_id }, { item_id: id(X, 'E2-14'), item_instance_id: 'string', phase: 'free', block_id: null,
    repeat_exposure: false, hide_labels: false, card_id: CARD });
  assert.equal(d.servings.get(due.item_instance_id)!.card_id, CARD);
  await post(app, '/api/hint', { item_id: due.item_id, item_instance_id: due.item_instance_id, level: 1 });
  assert.equal((await records(d)).find((r) => r.record === 'hint_opened').card_id, CARD);

  // The card's review, as an earlier instance served for it: passed 2 minutes ago, rated Good, so the card is in Review, not due for days.
  const at = iso(2 * 60_000);
  await write(d, inst({ id: 'REVIEWED', item: id(X, 'E2-15'), concept: X, phase: 'review', start: at, steps: [{ at: plus(at, 30), submit: 'pass' }], card: CARD }));
  const card = d.state.current().mistakeCards.get(CARD)!;
  assert.deepEqual([card.state, Date.parse(card.due) > Date.now()], [2, true]);
  const free = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD)}/try`, {}));
  assert.deepEqual([free.phase, free.card_id, free.hide_labels, free.block_id], ['free', null, false, null]);
  assert.equal(free.item_id, id(X, 'E1-08'), 'the fix items were seen: the write trap item');
  assert.equal('card_id' in d.servings.get(free.item_instance_id)!, false);
  const listed = (await json(get(app, '/api/mistakes'))).cards[0];
  assert.deepEqual([listed.state, listed.is_due, listed.last_review], ['review', false, card.last_review]);

  assert.equal((await post(app, `/api/mistakes/${encodeURIComponent(mistakeCardId(X, 'ERR-LOG-13'))}/try`, {})).status, 404, 'no such card');
  assert.equal((await post(app, '/api/mistakes/CARD-NOPE/try', {})).status, 404, 'not a mistake card ID');
});

// ---- the error names ------------------------------------------------------------------------------------------------------------

test('loadErrorNames: the names of content/sql/errors.json by ID; a missing file means none', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-c2-errors-'));
  const path = join(dir, 'errors.json');
  await writeFile(path, JSON.stringify({ version: 1, errors: [{ id: 'ERR-LOG-01', name: 'First' }, { id: 'ERR-LOG-02', name: 'Second' }, { id: 'ERR-LOG-03' }] }));
  assert.deepEqual([...await loadErrorNames(path)], [['ERR-LOG-01', 'First'], ['ERR-LOG-02', 'Second']]);
  assert.deepEqual([...await loadErrorNames(join(dir, 'none.json'))], []);
});

test('POST /api/mistakes/:card/try on a card Today\'s review already served answers that instance with hide_labels true (S2-39)', async () => {
  const d = await deps();
  await makeMistake(d);
  const app = createApp(d);
  const served = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review' }));
  assert.equal(served.phase, 'review');
  const tried = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD)}/try`, {}));
  assert.deepEqual([tried.item_instance_id, tried.phase, tried.card_id, tried.hide_labels], [served.item_instance_id, 'review', CARD, true]);
});

// ---- Sprint 4c Task A5: a due card whose concept has no servable item is skipped, not a stall --------------------------------------

/** A second card, on Y with the same error, made before X's (so it is first in the queue); then Y's items go away (content changed). */
const Y = 'SQL-AGG-01';
const CARD_Y = mistakeCardId(Y, ERR);
async function twoCards(onlyY: boolean): Promise<{ d: AppDeps & { servings: Servings }; app: Hono; hide: () => void }> {
  PLANTS.add(id(Y, 'E1-08'));
  let hidden = false;
  const base = memoryContent();
  const d = await deps({ ...base, sqlItems: () => base.sqlItems!().filter((i) => !(hidden && i.target_concept_id === Y)) });
  const at = iso(2 * 3_600_000);
  await write(d, inst({ id: 'MISTAKE-Y', item: id(Y, 'E1-03'), concept: Y, phase: 'lesson_block', start: at, steps: [{ at: plus(at, 30), submit: 'fail', errors: [ERR] }] }));
  if (!onlyY) await makeMistake(d);
  d.state.current();      // the catalog's trap pairs are built on first use: build them while Y still has its items
  return { d, app: createApp(d), hide: () => { hidden = true; } };
}
const clean = () => PLANTS.delete(id(Y, 'E1-08'));

test('A5: Today\'s review step skips a due card with no servable item and serves the next one; the skipped card stays due and nothing is logged for it', async () => {
  try {
    const { d, app, hide } = await twoCards(false);
    hide();
    const before = (await records(d)).length;
    const served = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review' }));
    assert.deepEqual(d.servings.get(served.item_instance_id)?.card_id, CARD, 'the second card is served');
    assert.equal(d.servings.get(served.item_instance_id)?.item_id.includes(X), true);
    const cards = (await json(get(app, '/api/mistakes'))).cards;
    assert.equal(cards.find((c: any) => c.card_id === CARD_Y)?.is_due, true, 'the skipped card stays due');
    assert.equal((await records(d)).length, before, 'nothing is logged for the skipped card');
  } finally { clean(); }
});

test('A5: with only an unservable due card, Today\'s review says "No review is due."', async () => {
  try {
    const { app, hide } = await twoCards(true);
    hide();
    const r = await post(app, '/api/serve', { section: 'sql', purpose: 'review' });
    assert.equal(r.status, 404);
    assert.match(await r.text(), /No review is due\./);
  } finally { clean(); }
});

test('A5: "Try again" on an unservable due card serves the next due card; with none, "No review is due."', async () => {
  try {
    const { d, app, hide } = await twoCards(false);
    hide();
    const before = (await records(d)).length;
    const served = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD_Y)}/try`, {}));
    assert.equal(served.card_id, CARD, 'the next due card is served');
    assert.equal(d.servings.get(served.item_instance_id)?.card_id, CARD);
    assert.equal((await records(d)).length, before, 'nothing is logged for the skipped card');
    assert.equal((await json(get(app, '/api/mistakes'))).cards.find((c: any) => c.card_id === CARD_Y).is_due, true);
  } finally { clean(); }
  try {
    const { app, hide } = await twoCards(true);
    hide();
    const r = await post(app, `/api/mistakes/${encodeURIComponent(CARD_Y)}/try`, {});
    assert.equal(r.status, 404);
    assert.match(await r.text(), /No review is due\./);
  } finally { clean(); }
});

// ---- Codex F26: the fallback waits for a candidate card's pending close --------------------------------------------------------------

test('F26: "Try again" on an unservable due card waits for the next candidate\'s pending close, then skips it once it is reviewed', async () => {
  try {
    const { d, app, hide } = await twoCards(false);
    hide();
    let release!: () => void;
    d.servings.closingCard(CARD, new Promise<void>((resolve) => { release = resolve; }));
    let settled = false;
    const reply = Promise.resolve(post(app, `/api/mistakes/${encodeURIComponent(CARD_Y)}/try`, {})).then((r: Response) => { settled = true; return r; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(settled, false, 'the reply waits while the candidate card\'s close is being written');
    // The close lands: the candidate's review is logged (rated Good), so it is no longer due.
    const at = iso(2 * 60_000);
    await write(d, inst({ id: 'F26-REVIEWED', item: id(X, 'E2-15'), concept: X, phase: 'review', start: at, steps: [{ at: plus(at, 30), submit: 'pass' }], card: CARD }));
    release();
    const r = await reply;
    assert.equal(r.status, 404, 'the candidate is not served a second time');
    assert.match(await r.text(), /No review is due\./);
  } finally { clean(); }
});

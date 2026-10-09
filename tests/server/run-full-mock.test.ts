// tests/server/run-full-mock.test.ts: the GA4 full mock, a third timed run kind (sprint 5b Task B4; design §8 "Mock runner"; owner
// decisions D65, D68, D72; Review Focus 2). The routes run against an invented GA4 bank (every ID, stem, option and explanation here
// is made up: Q-GA4-H* are its held-out items, Q-GA4-P* its practice items) beside the SQL content fixture, with a temporary log. One
// test starts a full mock on the shipped content through the store; it names counts only, never an item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { optionId, type ChoiceConcept, type ChoiceItem } from '../../schemas/choice.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { bootState, loadContentOrSetup, loggedInstanceIds, readLogs } from '../../server/main.ts';
import { choiceRuns, CODE_ONE_ANSWER } from '../../server/run.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { checkFullMockPool } from '../../tools/check-content.ts';
import { historyCells, readinessNote, unseenLine } from '../../web/src/lib/run-flow.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { blockClose, exposure, instance } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;

// ---- an invented GA4 bank: 56 held-out items (a full mock's 13/13/12/5/7 with some to spare) and 30 practice items ----------------

const TOPICS = ['T-GA4-01', 'T-GA4-02', 'T-GA4-03', 'T-GA4-04', 'T-GA4-05'];
const LETTER = ['A', 'B', 'C', 'D', 'E'];
const CONCEPTS: ChoiceConcept[] = TOPICS.flatMap((topic_id, k) => [1, 2].map((n) => ({ id: `GA4-T${LETTER[k]}-0${n}`, parent_id: null, topic_id,
  title: `Invented parent ${LETTER[k]}${n}`, level: 1 as const, verified: true })));
const EXPLAIN = 'Made-up explanation for';
const STEM = 'Invented question about widget';
const ENVELOPE = { version: 1, tags: [], source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null, status: 'active', supersedes: [] };
interface Fixture { id: string; topic: string; parent: string; held: boolean; group: string | null }
function bank(heldPerTopic: readonly number[], group: (topic: number, i: number) => string | null = () => null): Fixture[] {
  return TOPICS.flatMap((topic, k) => [
    ...Array.from({ length: heldPerTopic[k]! }, (_, i): Fixture => ({ id: `Q-GA4-H${k + 1}${String(i + 1).padStart(2, '0')}`, topic, parent: CONCEPTS[2 * k + (i % 2)]!.id,
      held: true, group: group(k, i) })),
    ...Array.from({ length: 6 }, (_, i): Fixture => ({ id: `Q-GA4-P${k + 1}${String(i + 1).padStart(2, '0')}`, topic, parent: CONCEPTS[2 * k + (i % 2)]!.id, held: false, group: null })),
  ]);
}
const BANK = bank([14, 14, 14, 6, 8]);
const byId = new Map(BANK.map((f) => [f.id, f]));
const HELD = new Set(BANK.filter((f) => f.held).map((f) => f.id));
const topicOf = (id: string) => byId.get(id)!.topic;
const RIGHT = (id: string) => optionId(id, 0);
const ENTRY = {
  from: '2026-10-06',
  mini_drill: { questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' },
  half_mock: { questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam', retake_days: 21 },
  full_mock: { questions: 50, minutes: 75, pass_pct: 80, mode: 'exam', retake_days: 21 },
};
const EXAM = { topic_weights: { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 }, blueprints: [ENTRY] };

async function writeBank(root: string, fixtures: readonly Fixture[] = BANK, exam: unknown = EXAM, nonCore: ReadonlySet<string> = new Set()): Promise<void> {
  for (const dir of ['ga4/items', 'keys/ga4']) await mkdir(join(root, dir), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  await put('ga4/concepts.json', { concepts: CONCEPTS });
  await put('ga4/held-out.json', { item_ids: fixtures.filter((f) => f.held).map((f) => f.id) });
  await put('ga4/exam.json', exam);
  for (const f of fixtures) {
    await put(`ga4/items/${f.id}.json`, { ...ENVELOPE, level: 1, enemy_group: f.group, id: f.id, kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: f.parent,
      parent_id: null, topic_id: f.topic, stem: `${STEM} ${f.id}?`, typed: null, exam_relevance: nonCore.has(f.id) ? 'new_2026' : 'core', held_out: f.held,
      options: ['Teal widget', 'Gold widget', 'Ruby widget', 'Jade widget'].map((text, i) => ({ oid: optionId(f.id, i), text, misconception_id: null })) });
    await put(`keys/ga4/${f.id}.json`, { item_id: f.id, item_version: 1, correct_oid: RIGHT(f.id), explanation: `${EXPLAIN} ${f.id}.`, solver: null });
  }
}
const root = await makeContentFixture();
await writeBank(root);
const content = await loadContent(root);

async function primedLog(extra: object[] = []): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-full-mock-')));
  const read = new Date(Date.now() - 2 * DAY).toISOString();
  for (const c of CONCEPTS) await log.append('attempts', exposure(c.id, read));
  for (const r of extra) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  return log;
}
async function deps(log?: JsonlLog, store: ContentStore = content): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(log ?? await primedLog());
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds(await logger.readAll('attempts')), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
const records = async (d: { logger: AttemptLogger } | JsonlLog) => ('logger' in d ? await d.logger.readAll('attempts') : await d.readAll('attempts')) as any[];
type Serving = { item_id: string; item_instance_id: string };
const start = (app: Hono, kind: string) => post(app, '/api/run/start', { section: 'ga4', kind });
const show = (app: Hono, s: Serving) => get(app, `/api/choice/${s.item_id}?section=ga4&instance=${s.item_instance_id}`);
async function answer(app: Hono, s: Serving, pick: 'right' | 'wrong', extra: Record<string, unknown> = {}): Promise<Response> {
  const shown = await json(show(app, s));
  const chosen = pick === 'right' ? RIGHT(s.item_id) : (shown.shown_order as string[]).find((o) => o !== RIGHT(s.item_id));
  return post(app, '/api/choice/answer', { item_id: s.item_id, item_instance_id: s.item_instance_id, chosen, confidence: 3, ...extra });
}
const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
const iso = (ms: number) => new Date(ms).toISOString();
/** A held-out showing `daysAgo` days ago: every held-out item of topic 1 (14) and one of topic 2, in an old half-mock. */
function shownBefore(daysAgo: number): { seed: object[]; shownAt: number; shown: Fixture[] } {
  const shownAt = Date.now() - daysAgo * DAY;
  const shown = BANK.filter((f) => f.held && (f.topic === 'T-GA4-01' || f.id === 'Q-GA4-H201'));
  const seed = [...shown.flatMap((f, n) => instance({ id: `OLD-${n}`, item: f.id, concept: f.parent, kind: 'mcq', section: 'ga4', phase: 'mock', block: 'OLD-MOCK',
    version: 2, targetMs: null, start: iso(shownAt + n * 1000), steps: [{ at: iso(shownAt + n * 1000 + 500), submit: 'pass', confidence: null, errors: [] }],
    close: { at: iso(shownAt + 60_000), reason: 'run_end' } })), blockClose('OLD-MOCK', iso(shownAt + 60_000))];
  return { seed, shownAt, shown };
}

// ---- the start --------------------------------------------------------------------------------------------------------------------

test('a full mock on a fresh log: 50 held-out core items by topic weight, exam mode, 75 minutes, phase mock, on unseen items; nothing is logged', async () => {
  const d = await deps();
  const app = createApp(d);
  const before = (await records(d)).length;
  const t0 = Date.now();
  const r = await start(app, 'full_mock');
  assert.equal(r.status, 200);
  const run = await r.json() as any;
  assert.deepEqual([run.section, run.kind, run.mode, run.phase, run.questions, run.minutes, run.pass_pct, run.on_unseen, run.next_unseen_date],
    ['ga4', 'full_mock', 'exam', 'mock', 50, 75, 80, true, null]);
  assert.ok(Math.abs(Date.parse(run.ends_at) - (t0 + 75 * 60_000)) < 5_000, 'the time limit: 75 minutes');
  const ids = (run.servings as Serving[]).map((s) => s.item_id);
  assert.equal(new Set(ids).size, 50);
  assert.ok(ids.every((id) => HELD.has(id)), 'held-out items only');
  assert.deepEqual(count(ids.map(topicOf)), { 'T-GA4-01': 13, 'T-GA4-02': 13, 'T-GA4-03': 12, 'T-GA4-04': 5, 'T-GA4-05': 7 });
  for (const s of run.servings as Serving[]) {
    assert.deepEqual(d.servings.get(s.item_instance_id), { phase: 'mock', block_id: run.block_id, repeat_exposure: false, section: 'ga4', item_id: s.item_id });
  }
  assert.equal((await records(d)).length, before, 'a start logs nothing');
  const current = (await json(get(app, '/api/run/current'))).run;
  assert.deepEqual([current.block_id, current.kind, current.on_unseen], [run.block_id, 'full_mock', true]);
});

test('one timed run at a time: a start of any kind while a full mock runs is a 409 that carries the full mock; an unknown kind is a 400', async () => {
  const app = createApp(await deps());
  const full = await json(start(app, 'full_mock'));
  for (const kind of ['full_mock', 'half_mock', 'mini_drill']) {
    const again = await start(app, kind);
    assert.equal(again.status, 409, kind);
    const body = await again.json() as any;
    assert.deepEqual([body.run.block_id, body.run.kind, body.run.questions], [full.block_id, 'full_mock', 50], kind);
  }
  const odd = await start(app, 'quarter_mock');
  assert.equal(odd.status, 400);
  assert.match((await odd.json() as any).error, /mini_drill, half_mock or full_mock/);
});

test('a full mock when some held-out items were shown in the last 21 days: topped up by the least recently shown, not on unseen items, with the date they come back', async () => {
  const { seed, shownAt, shown } = shownBefore(5);
  assert.equal(shown.length, 15);
  const d = await deps(await primedLog(seed));
  const app = createApp(d);
  const back = new Date(Date.parse(`${amsterdamDate(new Date(shownAt))}T00:00:00Z`) + 22 * DAY).toISOString().slice(0, 10);
  // The preview (read only) answers the full mock's date; a half-mock still fills with unseen items, so it has none.
  assert.deepEqual(await json(get(app, '/api/run/preview')), { next_unseen_date: { mini_drill: null, half_mock: null, full_mock: back } });
  const run = await json(start(app, 'full_mock'));
  assert.deepEqual([run.on_unseen, run.next_unseen_date, run.servings.length], [false, back, 50]);
  const fresh = BANK.filter((f) => f.held && !shown.includes(f)).map((f) => f.id);
  const ids = (run.servings as Serving[]).map((s) => s.item_id);
  assert.ok(fresh.every((id) => ids.includes(id)), 'every unseen item first');
  const repeats = (run.servings as Serving[]).filter((s) => d.servings.get(s.item_instance_id)!.repeat_exposure);
  assert.equal(repeats.length, 9, '41 unseen items, topped up by 9 shown ones');
});

test('the preview on a fresh log gives no date for any kind', async () => {
  assert.deepEqual(await json(get(createApp(await deps()), '/api/run/preview')), { next_unseen_date: { mini_drill: null, half_mock: null, full_mock: null } });
});

test('a full mock the pool cannot fill is refused, and says how many questions can be drawn now', async () => {
  // 50 held-out core items, so the content loads, but two share an enemy group: a form takes at most one of them.
  const fixtures = bank([13, 13, 12, 5, 7], (k, i) => (k === 0 && i < 2 ? 'EG-HELD-1' : null));
  const dir = await makeContentFixture();
  await writeBank(dir, fixtures);
  const app = createApp(await deps(undefined, await loadContent(dir)));
  const r = await start(app, 'full_mock');
  assert.equal(r.status, 404);
  assert.equal((await r.json() as any).error, 'The full mock needs 50 questions, and 49 can be drawn now.');
  assert.equal((await json(get(app, '/api/run/current'))).run, null, 'no run started');
});

test('a full mock longer than the held-out pool still loads (ruling 8: content check C46 reports it, the start route refuses it); only active core keyed held-out items count', async () => {
  const longer = await makeContentFixture();
  await writeBank(longer, BANK, { ...EXAM, blueprints: [{ ...ENTRY, full_mock: { ...ENTRY.full_mock, questions: 57 } }] });
  assert.equal((await loadContentOrSetup(longer)).check, null, 'the app loads');
  assert.match(checkFullMockPool(await loadContent(longer))[0]!.detail, /asks 57 questions, more than the 56 of the held-out pool/);
  const notCore = await makeContentFixture();
  await writeBank(notCore, BANK, EXAM, new Set(BANK.filter((f) => f.held).slice(0, 7).map((f) => f.id)));     // 49 core
  assert.equal((await loadContentOrSetup(notCore)).check, null);
  assert.deepEqual(checkFullMockPool(await loadContent(notCore)).map((r) => [r.check, r.ok]), [['C46', false]]);
  const exact = await makeContentFixture();
  await writeBank(exact, BANK, EXAM, new Set(BANK.filter((f) => f.held).slice(0, 6).map((f) => f.id)));       // 50 core
  assert.equal((await loadContentOrSetup(exact)).check, null);
  assert.deepEqual(checkFullMockPool(await loadContent(exact)).map((r) => [r.check, r.ok]), [['C46', true]]);
});

// ---- the answers and the log (D68) ---------------------------------------------------------------------------------------------

test('every answer to a GA4 run item logs its run kind (D68); a full mock takes one answer per question and asks no confidence', async () => {
  const d = await deps();
  const app = createApp(d);
  const full = await json(start(app, 'full_mock'));
  const [f0, f1] = full.servings as Serving[];
  assert.equal((await answer(app, f0!, 'right', { confidence: 4 })).status, 200);
  assert.equal((await answer(app, f1!, 'wrong')).status, 200);
  const again = await answer(app, f0!, 'wrong');
  assert.equal(again.status, 409);
  const refused = await again.json() as any;
  assert.equal(refused.code, CODE_ONE_ANSWER);
  assert.match(refused.error, /full mock takes one answer per question/);
  await post(app, '/api/run/end', { block_id: full.block_id });
  const half = await json(start(app, 'half_mock'));
  await answer(app, half.servings[0], 'right');
  await post(app, '/api/run/end', { block_id: half.block_id });
  const mini = await json(start(app, 'mini_drill'));
  await answer(app, mini.servings[0], 'right');
  await answer(app, mini.servings[0], 'wrong');
  await post(app, '/api/run/end', { block_id: mini.block_id });
  // A practice answer outside any run: no run kind.
  const practice = BANK.find((f) => !f.held)!.id;
  const shown = await json(get(app, `/api/choice/${practice}?section=ga4`));
  await post(app, '/api/choice/answer', { item_id: practice, item_instance_id: shown.item_instance_id, chosen: RIGHT(practice), confidence: 3 });
  const attempts = (await records(d)).filter((r) => r.record === 'attempt');
  const kindOf = (block: string | null) => attempts.filter((a) => a.block_id === block).map((a) => [a.phase, a.payload.run_kind, a.confidence]);
  assert.deepEqual(kindOf(full.block_id), [['mock', 'full_mock', null], ['mock', 'full_mock', null]]);
  assert.deepEqual(kindOf(half.block_id), [['mock', 'half_mock', null]]);
  assert.deepEqual(kindOf(mini.block_id), [['drill', 'mini_drill', 3], ['drill', 'mini_drill', 3]]);
  const free = attempts.filter((a) => a.block_id === null);
  assert.equal(free.length, 1);
  assert.equal('run_kind' in free[0].payload, false, 'an answer outside a run carries no run kind');
  assert.deepEqual(d.state.current().warnings, []);
});

test('Review Focus 2: a full mock cut short by a restart, with 20 answers, is read as a full mock, 20 of 50; without run_kind it would read as a half-mock', async () => {
  const log = await primedLog();
  const d = await deps(log);
  const app = createApp(d);
  const full = await json(start(app, 'full_mock'));
  for (const s of (full.servings as Serving[]).slice(0, 20)) assert.equal((await answer(app, s, 'right')).status, 200);
  // The crash: no run end, no session end. The next start recovers: it closes the 20 logged items run_end.
  const logger = new AttemptLogger(log);
  await bootState(logger, new SessionTracker(logger, async () => {}), content, await readLogs(logger), () => null, true);
  const recs = await records(log);
  assert.equal(recs.filter((r) => r.record === 'item_close' && r.block_id === full.block_id).length, 20);
  const after = createApp(await deps(log));
  const row = (await json(get(after, '/api/run/history?section=ga4'))).runs.find((r: any) => r.block_id === full.block_id);
  assert.deepEqual([row.kind, row.correct, row.of, row.pct, row.pass, row.pass_pct], ['full_mock', 20, 50, 40, false, 80]);
  const review = await json(get(after, `/api/run/${full.block_id}/review`));
  assert.deepEqual([review.kind, review.of, review.items.length, review.recovered], ['full_mock', 50, 20, true]);
  // F2 I1 (ruling 24): the readiness check counts it, so the history row and the review say so, and no line says a question was seen.
  for (const r of [row, review]) assert.deepEqual([r.counts_for_readiness, r.on_unseen, r.logged_unseen], [true, false, true]);
  const readiness = await json(get(after, '/api/ga4/readiness'));
  assert.deepEqual([readiness.mock.basis, readiness.mock.correct, readiness.mock.of], ['full_mock', 20, 50], 'the check counts the same run');
  const lines = [historyCells(row)[4]!, unseenLine({ kind: 'full_mock', on_unseen: review.on_unseen, logged_unseen: review.logged_unseen }),
    readinessNote(review, null) ?? ''];
  assert.deepEqual(lines.slice(0, 2), ['No saved question was shown in the last 21 days.', 'No saved question was shown in the last 21 days.']);
  for (const l of lines) assert.doesNotMatch(l, /does not count|Some questions were shown/, l);
  assert.ok(review.items.every((i: any) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(['answered', 'correct', 'n', 'topic'])));
  // The same log read the pre-version-5 way (no run_kind): 20 closes are not more than a half-mock's 25, so it would be a half-mock.
  const stripped = recs.map((r) => (r.record === 'attempt' && r.payload?.run_kind ? { ...r, payload: { ...r.payload, run_kind: undefined } } : r));
  const old = choiceRuns(stripped, { cfg: content.ga4Exam!()!, itemOf: (id) => content.choiceItem?.(id) });
  assert.equal(old.find((r) => r.block_id === full.block_id)!.kind, 'half_mock', 'the reason D68 logs the run kind');
});

test('reading a log with no run_kind (before version 5): a mock block is a half-mock with 25 closes, a full mock with more; a drill block is a mini drill; run_kind wins when logged', async () => {
  const day = Date.parse('2026-10-20T09:00:00Z');
  const held = BANK.filter((f) => f.held);
  /** A block of `n` held-out (mock) or practice (drill) items, each closed run_end; `answered` of them answered right, logging `kind` when given. */
  const block = (id: string, phase: 'mock' | 'drill', n: number, answered: number, t: number, kind?: string): object[] => {
    const pool = phase === 'mock' ? held : BANK.filter((f) => !f.held);
    const out: object[] = [];
    for (let k = 0; k < n; k++) {
      const f = pool[k]!;
      const inst = `${id}-${k}`;
      if (k < answered) {
        out.push({ record: 'attempt', schema_version: kind ? 5 : 4, attempt_id: `${inst}-a`, item_instance_id: inst, item_id: f.id, section: 'ga4', phase, block_id: id,
          started_at: iso(t + k * 1000), submitted_at: iso(t + k * 1000 + 500), outcome: 'pass', is_correct: true, grading_source: 'auto',
          payload: { kind: 'mcq', shown_order: [RIGHT(f.id)], chosen: RIGHT(f.id), ...(kind ? { run_kind: kind } : {}) } });
      }
    }
    for (let k = 0; k < n; k++) {
      const f = pool[k]!;
      out.push({ record: 'item_close', ts: iso(t + 600_000), item_instance_id: `${id}-${k}`, item_id: f.id, phase, block_id: id, reason: 'run_end', raw_outcome: { active_ms: 0 } });
    }
    out.push(blockClose(id, iso(t + 600_000)));
    return out;
  };
  const log = [
    ...block('OLD-HALF', 'mock', 25, 25, day),
    ...block('OLD-FULL', 'mock', 50, 30, day + DAY),
    ...block('OLD-FULL-EMPTY', 'mock', 26, 0, day + 2 * DAY),
    ...block('OLD-DRILL', 'drill', 20, 5, day + 3 * DAY),
    ...block('NEW-FULL-SHORT', 'mock', 3, 3, day + 4 * DAY, 'full_mock'),
  ];
  const runs = choiceRuns(log, { cfg: content.ga4Exam!()!, itemOf: (id) => content.choiceItem?.(id) as ChoiceItem | undefined });
  const seen = Object.fromEntries(runs.map((r) => [r.block_id, [r.kind, r.score.correct, r.score.of]]));
  assert.deepEqual(seen, {
    'OLD-HALF': ['half_mock', 25, 25],
    'OLD-FULL': ['full_mock', 30, 50],
    'OLD-FULL-EMPTY': ['full_mock', 0, 50],
    'OLD-DRILL': ['mini_drill', 5, 20],
    'NEW-FULL-SHORT': ['full_mock', 3, 50],
  });
});

// ---- the review and the history -----------------------------------------------------------------------------------------------

test('a full mock\'s review is a half-mock\'s: number, topic and right or wrong, and nothing that names an item; its history row says on unseen items', async () => {
  const d = await deps();
  const app = createApp(d);
  const full = await json(start(app, 'full_mock'));
  const s0 = full.servings[0] as Serving;
  await answer(app, s0, 'right');
  const end = await json(post(app, '/api/run/end', { block_id: full.block_id }));
  assert.deepEqual([end.kind, end.correct, end.of, end.pass, end.on_unseen, end.pass_pct], ['full_mock', 1, 50, false, true, 80]);
  assert.equal('unseen' in end, false);
  // After the run, its held-out items are 404 everywhere, as after a half-mock.
  assert.equal((await show(app, s0)).status, 404);
  assert.equal((await post(app, '/api/choice/show-answer', { item_id: s0.item_id, item_instance_id: s0.item_instance_id })).status, 404);
  const review = await json(get(app, `/api/run/${full.block_id}/review`));
  assert.equal(review.items.length, 50);
  assert.ok(review.items.every((i: any) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(['answered', 'correct', 'n', 'topic'])));
  assert.deepEqual(review.items.map((i: any) => i.topic), (full.servings as Serving[]).map((s) => topicOf(s.item_id)), 'in the order the run asked them');
  const text = JSON.stringify(review);
  for (const s of full.servings as Serving[]) assert.equal(text.includes(s.item_id) || text.includes(s.item_instance_id), false, 'no item or instance is named');
  for (const leak of [EXPLAIN, STEM, 'widget', 'correct_oid', 'chosen', 'shown_order', 'item_id']) assert.equal(text.includes(leak), false, leak);
  const h = await json(get(app, '/api/run/history?section=ga4'));
  assert.deepEqual(h.blueprints.full_mock, { questions: 50, minutes: 75, pass_pct: 80, mode: 'exam' });
  const row = h.runs.find((r: any) => r.block_id === full.block_id);
  assert.deepEqual(Object.keys(row).sort(), ['block_id', 'by_topic', 'correct', 'counts_for_readiness', 'date', 'kind', 'logged_unseen', 'of', 'on_unseen', 'pass', 'pass_pct', 'pct']);
  assert.deepEqual([row.kind, row.on_unseen, row.logged_unseen, row.counts_for_readiness], ['full_mock', true, true, true]);
  assert.equal(JSON.stringify(h.runs).includes('minute'), false, 'no study time');
  assert.deepEqual(d.state.current().warnings, []);
});

// ---- the shipped content -------------------------------------------------------------------------------------------------------

test('the shipped content fills a full mock on an empty log: 50 questions, every one held out, on unseen items (counts only)', async () => {
  const shipped = await loadContent('content');
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-full-mock-shipped-')));
  const app = createApp(await deps(log, shipped));
  const r = await start(app, 'full_mock');
  assert.equal(r.status, 200, 'the shipped held-out pool fills a full mock');
  const run = await r.json() as any;
  const ids = (run.servings as Serving[]).map((s) => s.item_id);
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
  assert.equal(ids.filter((id) => shipped.heldOut?.(id) === true).length, 50, 'held-out questions');
  assert.equal(run.on_unseen, true);
  await post(app, '/api/run/end', { block_id: run.block_id });
});

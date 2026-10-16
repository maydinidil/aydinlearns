// tests/server/cases-s6.test.ts: the case routes in sprint 6 (Task B3). S6-13: a case on a schema the database does not hold is
// unavailable: the inbox lists it with the line naming its dataset and the prep command, its routes answer 409 with that line, and
// Today never offers it. S6-15: a case of level 4 or more adds CRAFT-01's two ticks to the CP6 rubric. D1-M6: the routes send only
// the persona, brief and data-source fields the screens use. Every case, key and value here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, unavailableLine, type ContentStore } from '../../server/content.ts';
import { RUBRIC } from '../../server/routes/cases.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { DAILY_ID, INBOX_ID, OPENER_ID, OTHER_CONCEPT, makeCaseFixture, type CasePatch } from '../helpers/case-fixture.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { exposure, instance } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

async function deps(store: ContentStore, seed: object[] = []): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-cases-s6-')));
  for (const r of seed) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state };
}
const storeOf = async (patch: CasePatch): Promise<ContentStore> => { const f = await makeCaseFixture(patch); return loadContent(f.root, { truthFile: f.truthFile }); };
const attempts = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
/** A reading, then three passes on three different items on another day: each concept is at Practised (S2-20), as the composer test's. */
const practisedIn = (concepts: string[]) => [...concepts.map((c) => exposure(c, '2026-09-21T08:00:00Z')), ...concepts.flatMap((c, n) => ['E1-08', 'E1-09', 'E2-10'].flatMap((it, k) =>
  instance({ id: `P-${c}-${it}`, item: `EX-${c}-${it}`, concept: c, version: 2, start: `2026-09-22T0${k + 1}:${String(10 + n).padStart(2, '0')}:00Z`,
    steps: [{ at: `2026-09-22T0${k + 1}:${String(10 + n).padStart(2, '0')}:30Z`, submit: 'pass' }] })))];

// ---- S6-13: unavailable cases ------------------------------------------------------------------------------------------------

const MAILVORA = { label: 'Fictional, generated data: Mailvora', real: false, licence: null };
const LINE = unavailableLine('Mailvora');
/** The inbox case reads `mailvora`, which this build does not hold; the opener and the daily case read voltmarkt. */
const missing: CasePatch = {
  records: (r) => { r.inbox.schema = 'mailvora'; r.inbox.data_source = MAILVORA; },
  file: (f) => { f.schemas = ['voltmarkt', 'voltmarkt_edge_basics']; },
};

test('S6-13: the inbox lists a case on a missing schema with the line naming its dataset; every other case has none', async () => {
  const app = createApp(await deps(await storeOf(missing)));
  const list = await json(get(app, '/api/cases'));
  assert.deepEqual(list.map((x: any) => [x.case_id, x.unavailable]), [[DAILY_ID, null], [INBOX_ID, LINE], [OPENER_ID, null]]);
  assert.equal(LINE, 'This case needs Mailvora. Run `npm run prep:datasets -- --from <your downloads folder>`, then start the app again.');
});

test('S6-13: every route of an unavailable case answers 409 with that line, and nothing is logged', async () => {
  const d = await deps(await storeOf(missing));
  const app = createApp(d);
  const calls: [string, () => Response | Promise<Response>][] = [
    ['view', () => get(app, `/api/cases/${INBOX_ID}`)],
    ['CP1 serve', () => post(app, `/api/cases/${INBOX_ID}/checkpoints/CP1/serve`)],
    ['CP2 serve', () => post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/serve`)],
    ['CP4 answer', () => post(app, `/api/cases/${INBOX_ID}/checkpoints/CP4/answer`, { item_instance_id: 'x', typed: '1' })],
    ['plan', () => post(app, `/api/cases/${INBOX_ID}/plan`, { fields: { metric_formula: 'a plan' } })],
    ['plan check', () => post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: [] })],
    ['insight', () => post(app, `/api/cases/${INBOX_ID}/insight`, { text: 'An insight.' })],
    ['rubric', () => post(app, `/api/cases/${INBOX_ID}/rubric`, { ticked: [] })],
    ['CP3 serve', () => post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: INBOX_ID })],
  ];
  for (const [label, call] of calls) {
    const r = await call();
    assert.equal(r.status, 409, label);
    assert.equal((await r.json()).error, LINE, label);
  }
  assert.deepEqual(await attempts(d), [], 'nothing is logged for an unavailable case');
  assert.equal((await get(app, `/api/cases/${OPENER_ID}`)).status, 200, 'an available case still opens');
});

test('S6-13: an unavailable opener answers 409 on its CP4 alias and its sketch too', async () => {
  const store = await storeOf({ records: (r) => { r.opener.schema = 'mailvora'; r.opener.data_source = MAILVORA; }, file: missing.file });
  const app = createApp(await deps(store));
  for (const [label, path, body] of [['CP4 alias', `/api/openers/${OPENER_ID}/cp4/serve`, {}], ['sketch', `/api/cases/${OPENER_ID}/sketch`, { fields: { one_row_per: 'store' } }]] as const) {
    const r = await post(app, path, body);
    assert.deepEqual([r.status, (await r.json()).error], [409, LINE], label);
  }
});

test('S6-13: Today never offers a daily case on a missing schema; the same case on a built schema is offered', async () => {
  const seed = practisedIn([FIXTURE_CONCEPT, OTHER_CONCEPT]);
  const daily = async (patch: CasePatch) => {
    const app = createApp(await deps(await storeOf(patch), seed));
    return (await json(get(app, '/api/today?section=sql'))).plan.steps.find((s: any) => s.kind === 'daily_case') ?? null;
  };
  assert.deepEqual(await daily({ file: missing.file }), { kind: 'daily_case', case_id: DAILY_ID, done: false }, 'its concepts are practised: offered');
  assert.equal(await daily({ records: (r) => { r.daily.schema = 'mailvora'; r.daily.data_source = MAILVORA; }, file: missing.file }), null, 'unavailable: never offered');
});

test('S6-13: an older build that names no schemas leaves every case available', async () => {
  const app = createApp(await deps(await storeOf({ records: missing.records })));
  assert.deepEqual((await json(get(app, '/api/cases'))).map((x: any) => x.unavailable), [null, null, null]);
  assert.equal((await get(app, `/api/cases/${INBOX_ID}`)).status, 200);
});

// ---- S6-15: the CRAFT ticks from level 4 -------------------------------------------------------------------------------------

const CRAFT = [{ id: 'grain_comment', label: 'A grain comment on every CTE' }, { id: 'reconciliation', label: 'One reconciliation check' }];

test('S6-15: a level 4 case\'s rubric has seven ticks, the five and CRAFT-01\'s two; a level 3 case\'s has five', async () => {
  for (const [level, want] of [[3, RUBRIC], [4, [...RUBRIC, ...CRAFT]], [5, [...RUBRIC, ...CRAFT]]] as const) {
    const app = createApp(await deps(await storeOf({ records: (r) => { r.daily.level = level; } })));
    const reply = await json(post(app, `/api/cases/${DAILY_ID}/insight`, { text: 'An insight.' }));
    assert.deepEqual(reply.rubric, want, `level ${level}`);
    assert.equal(reply.rubric.length, level >= 4 ? 7 : 5);
  }
});

test('S6-15: the CRAFT ticks are logged in the rubric self-check\'s ticked list at level 4, and refused below it', async () => {
  const d4 = await deps(await storeOf({ records: (r) => { r.daily.level = 4; } }));
  const app4 = createApp(d4);
  await post(app4, `/api/cases/${DAILY_ID}/insight`, { text: 'An insight.' });
  assert.deepEqual(await json(post(app4, `/api/cases/${DAILY_ID}/rubric`, { ticked: ['number', 'grain_comment', 'reconciliation'] })), { ok: true });
  const rubric = (await attempts(d4)).find((x) => x.record === 'self_check' && x.kind === 'rubric');
  assert.deepEqual([rubric.ticked, rubric.schema_version], [['number', 'grain_comment', 'reconciliation'], 5], 'no log change: the same record, version 5');
  const app3 = createApp(await deps(await storeOf({ records: (r) => { r.daily.level = 3; } })));
  await post(app3, `/api/cases/${DAILY_ID}/insight`, { text: 'An insight.' });
  assert.equal((await post(app3, `/api/cases/${DAILY_ID}/rubric`, { ticked: ['grain_comment'] })).status, 400, 'a level 3 case has no CRAFT tick');
});

// ---- D1-M6: only the fields the screens use --------------------------------------------------------------------------------

test('D1-M6: the inbox and the view send the persona\'s name and role, the brief\'s decision and deadline, and the data source\'s label, real flag and licence only', async () => {
  const store = await storeOf({ records: (r) => {
    r.inbox.persona = { ...r.inbox.persona, note: 'an invented private persona note' };
    r.inbox.brief = { ...r.inbox.brief, background: 'an invented private brief note' };
    r.inbox.data_source = { ...r.inbox.data_source, source_url: 'an invented private source note' };
  } });
  const app = createApp(await deps(store));
  const row = (await json(get(app, '/api/cases'))).find((x: any) => x.case_id === INBOX_ID);
  const view = await json(get(app, `/api/cases/${INBOX_ID}`));
  for (const [label, x] of [['inbox', row], ['view', view]] as const) {
    assert.deepEqual(Object.keys(x.persona).sort(), ['name', 'role'], label);
    assert.deepEqual(Object.keys(x.brief).sort(), ['deadline', 'decision'], label);
    assert.ok(!JSON.stringify(x).includes('invented private'), `${label}: no extra field`);
  }
  assert.deepEqual(Object.keys(view.data_source).sort(), ['label', 'licence', 'real']);
});

// ---- Task K2 (S6-35, S4B-10, M3): a case with no CP1 holds its model plan until CP2 -------------------------------------------

const noCp1: CasePatch = { records: (r) => { r.inbox.checkpoints = r.inbox.checkpoints.filter((c: any) => c.kind !== 'CP1'); } };
const PLAN_FIELDS = { metric_formula: 'average price', filters: 'open stores' };

test('K2: a case with no CP1 holds its model plan until CP2 is answered; a tick before that is refused, and after it the plan shows', async () => {
  const d = await deps(await storeOf(noCp1));
  const app = createApp(d);
  const model = d.content.case!(INBOX_ID)!.model_plan;
  const before = await post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN_FIELDS });
  assert.equal(before.status, 200);
  const text = await before.text();
  assert.match(JSON.parse(text).note, /CP2/, 'the note says the plan waits for CP2');
  assert.equal(JSON.parse(text).model_plan, undefined);
  assert.equal(text.includes(model), false, 'no model plan before CP2');
  const refused = await post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['filters'] });
  assert.equal(refused.status, 409, 'a tick before CP2 is refused');
  assert.match((await refused.json()).error, /CP2/);
  const s = await json(post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/serve`));
  await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/answer`, { item_instance_id: s.item_instance_id, typed: '3' });
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['filters'] })).status, 409, 'CP2 answered, but no reply has shown the plan');
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN_FIELDS })), { model_plan: model }, 'sent again after CP2: the model plan');
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['filters'] })), { ok: true });
});

test('K2: a case with a CP1 still waits for CP1, not CP2; a case with neither shows the plan at once', async () => {
  const app = createApp(await deps(await storeOf({})));
  const note = (await json(post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN_FIELDS }))).note;
  assert.match(note, /CP1/);
  const s = await json(post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/serve`));
  await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/answer`, { item_instance_id: s.item_instance_id, typed: '3' });
  assert.match((await json(post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN_FIELDS }))).note, /CP1/, 'CP2 does not open the gate when the case has a CP1');
  const none = await storeOf({ records: (r) => { r.inbox.checkpoints = r.inbox.checkpoints.filter((c: any) => c.kind !== 'CP1' && c.kind !== 'CP2'); } });
  const fresh = createApp(await deps(none));
  assert.deepEqual(await json(post(fresh, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN_FIELDS })), { model_plan: none.case!(INBOX_ID)!.model_plan });
});

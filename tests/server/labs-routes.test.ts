// tests/server/labs-routes.test.ts: the GA4 lab routes (sprint 5b, Task B2; D68, D69). GET /api/labs, GET /api/labs/:id and
// POST /api/labs/:id/answer on the invented fixture labs (tests/helpers/lab-fixture.ts), against a temporary log folder under
// os.tmpdir(). "Today" is the app's clock: each test sets Date with node:test's mock timers.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { fixtureLab, LAB_FIXTURES, makeLabRoot } from '../helpers/lab-fixture.ts';

const DAY = 86_400_000;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const NUMBER_HELP = 'Type a number, for example 12,345 or 61.2';
const content = await loadContent(await makeLabRoot());

/** Every key in a JSON value, at any depth. */
function keysOf(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) keysOf(v, out);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.add(k); keysOf(v, out); }
  return out;
}

/** An app on a fresh temporary log folder, with Date set to `now`. `seed` records are in the attempts log before the app starts. */
async function setup(t: TestContext, now: string, store: ContentStore = content, seed: object[] = []) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  const dir = await mkdtemp(join(tmpdir(), 'al-labs-routes-'));
  const log = openJsonlLog(dir);
  for (const r of seed) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const d: AppDeps = { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state };
  const app = createApp(d);
  const get = async (path: string): Promise<{ status: number; body: any }> => {
    const r = await app.request(`http://127.0.0.1:5174${path}`, { headers: H });
    return { status: r.status, body: await r.json() };
  };
  const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
    const r = await app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  /** Every line of the attempt files, parsed. */
  const lines = async (): Promise<any[]> => {
    const names = (await readdir(dir)).filter((n) => n.startsWith('attempts-')).sort();
    const text = (await Promise.all(names.map((n) => readFile(join(dir, n), 'utf8')))).join('');
    return text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  };
  return { get, post, lines, tick: (ms: number) => t.mock.timers.tick(ms) };
}

const TWELVE = { kind: 'first', values: { P1: '12,345', P2: '7,407', P3: '60.0%', P4: 'Teal marker' }, self: {}, range: null, note: '  The totals row was folded.  ' };
const TWENTY_RANGE = { from: '2026-09-10', to: '2026-10-07' };
const TWENTY = {
  kind: 'first', values: { P1: 'Step 2', P2: '5,000', P3: '4,000', P4: [' Oval marker', 'Circle marker'], P5: '  It shows step one and its condition.  ' },
  self: { P5: true }, range: TWENTY_RANGE,
};

test('GET /api/labs lists every lab with its state, and the guide as its title and text only', async (t) => {
  const { get, lines } = await setup(t, '2026-10-08T10:00:00.000Z');
  const { status, body } = await get('/api/labs');
  assert.equal(status, 200);
  const guide = JSON.parse(await readFile(join(LAB_FIXTURES, 'ga4/lab-guide.json'), 'utf8')) as { title: string; body_md: string };
  assert.deepEqual(body.guide, { title: guide.title, body_md: guide.body_md });
  assert.deepEqual(body.labs.map((l: { id: string }) => l.id), ['LAB-07', 'LAB-12', 'LAB-20']);
  assert.deepEqual(body.labs[1], {
    id: 'LAB-12', title: 'An invented engagement lab', topic_id: 'T-GA4-02', concept_id: 'GA4-METRICS-01', interview_relevant: true,
    lab_id: 'LAB-12', state: 'new', baseline_date: null, recheck_from: null, month: null, range: null,
  });
  assert.equal(body.labs[2].interview_relevant, false);
  assert.deepEqual(await lines(), []);
});

test('GET /api/labs with no guide file: the guide is null', async (t) => {
  const { get } = await setup(t, '2026-10-08T10:00:00.000Z', await loadContent(await makeLabRoot((f) => { f.guide = null; })));
  assert.equal((await get('/api/labs')).body.guide, null);
});

test('GET /api/labs/:id: an unknown lab is a 404; a new lab suggests a first answer, on the fixed month for a fixed_month lab; no key goes out', async (t) => {
  const { get } = await setup(t, '2026-10-08T10:00:00.000Z');
  assert.equal((await get('/api/labs/LAB-99')).status, 404);
  const { status, body } = await get('/api/labs/LAB-12');
  assert.equal(status, 200);
  assert.deepEqual(body.lab, await fixtureLab('LAB-12'));
  assert.equal(body.mode, 'first');
  assert.equal(body.month, '2026-09');
  assert.equal(body.range, null);
  assert.equal(body.status.state, 'new');
  for (const k of ['structural', 'solver', 'expected', 'lab_version']) assert.ok(!keysOf(body).has(k), k);
  for (const id of ['LAB-07', 'LAB-20']) {
    const r = (await get(`/api/labs/${id}`)).body;
    assert.deepEqual([r.mode, r.month, r.range], ['first', null, null], id);
  }
});

test('a first answer is graded, logs exactly one lab_answer line, and only a structural part carries expected', async (t) => {
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z');
  const { status, body } = await post('/api/labs/LAB-12/answer', TWELVE);
  assert.equal(status, 200);
  assert.deepEqual(body.outcomes, [
    { part_id: 'P1', result: 'pending', message: null },
    { part_id: 'P2', result: 'pending', message: null },
    { part_id: 'P3', result: 'pass', message: null },
    { part_id: 'P4', result: 'pass', expected: 'Teal marker', message: null },
  ]);
  assert.deepEqual(body.status, { lab_id: 'LAB-12', state: 'recheck_waiting', baseline_date: '2026-10-08', recheck_from: '2026-10-15', month: '2026-09', range: null });
  assert.equal(body.notice, null);
  const logged = await lines();
  assert.equal(logged.length, 1);
  const [rec] = logged;
  assert.equal(typeof rec.session_id, 'string');
  assert.ok(rec.session_id.length > 0);
  assert.deepEqual({ ...rec, session_id: 'S' }, {
    record: 'lab_answer', schema_version: 5, ts: '2026-10-08T10:00:00.000Z', session_id: 'S', lab_id: 'LAB-12', lab_version: 1, kind: 'first',
    month: '2026-09', range: null,
    parts: [
      { part_id: 'P1', value: 12345, result: 'pending' }, { part_id: 'P2', value: 7407, result: 'pending' },
      { part_id: 'P3', value: 60, result: 'pass' }, { part_id: 'P4', value: 'Teal marker', result: 'pass' },
    ],
    note: 'The totals row was folded.',
  });

  // A wrong structural answer and a wrong rate: expected on P4 only, the rule's message on P3, and the lab is look_again.
  const wrong = await post('/api/labs/LAB-12/answer', { ...TWELVE, values: { ...TWELVE.values, P3: '61', P4: 'plum marker' } });
  assert.deepEqual(wrong.body.outcomes.slice(2), [
    { part_id: 'P3', result: 'fail', message: 'Engagement rate should be about 60.0% from your two numbers (7,407 / 12,345).' },
    { part_id: 'P4', result: 'fail', expected: 'Teal marker', message: null },
  ]);
  assert.equal(wrong.body.status.state, 'look_again');
  assert.equal((await lines()).length, 2);
});

test('the fixed month is the one before today from the 5th, and the one before that until then', async (t) => {
  const { get, post, lines } = await setup(t, '2026-10-04T10:00:00.000Z');
  assert.equal((await get('/api/labs/LAB-12')).body.month, '2026-08');
  await post('/api/labs/LAB-12/answer', TWELVE);
  assert.equal((await lines())[0].month, '2026-08');
});

test('during a re-check, GET /api/labs/:id names the baseline\'s month and never a baseline value or a key', async (t) => {
  const { get, post, tick } = await setup(t, '2026-10-08T10:00:00.000Z');
  assert.equal((await post('/api/labs/LAB-12/answer', TWELVE)).status, 200);
  tick(DAY);
  const { body } = await get('/api/labs/LAB-12');
  assert.equal(body.mode, 'recheck');
  assert.equal(body.month, '2026-09');
  assert.equal(body.status.state, 'recheck_waiting');
  assert.equal(body.status.recheck_from, '2026-10-15');
  const text = JSON.stringify(body);
  for (const v of ['12345', '12,345', '7407', '7,407', 'folded']) assert.ok(!text.includes(v), v);
  for (const k of ['structural', 'solver', 'expected', 'values', 'outcomes']) assert.ok(!keysOf(body).has(k), k);
  assert.deepEqual(body.lab, await fixtureLab('LAB-12'));
  // The list shows the same state.
  assert.equal((await get('/api/labs')).body.labs[1].state, 'recheck_waiting');
  // On 6 November a new first answer would read October; the re-check still reads the baseline's September.
  tick(28 * DAY);
  const later = (await get('/api/labs/LAB-12')).body;
  assert.deepEqual([later.status.state, later.mode, later.month], ['recheck_due', 'recheck', '2026-09']);
});

test('an early re-check is logged and graded and says when re-checks count; one on day 7 or later decides the state', async (t) => {
  const { get, post, lines, tick } = await setup(t, '2026-10-08T10:00:00.000Z');
  await post('/api/labs/LAB-12/answer', TWELVE);
  tick(3 * DAY);
  const early = await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '12,400', P2: '7407', P3: 'ignored', P4: 'ignored' } });
  assert.equal(early.status, 200);
  assert.deepEqual(early.body.outcomes, [{ part_id: 'P1', result: 'pass', message: null }, { part_id: 'P2', result: 'pass', message: null }]);
  assert.equal(early.body.notice, 'Too early to count: only a re-check from 15 October counts. This one is saved.');
  assert.equal(early.body.status.state, 'recheck_waiting');
  const rec = (await lines())[1];
  assert.deepEqual([rec.kind, rec.month, rec.range, rec.parts], ['recheck', '2026-09', null, [
    { part_id: 'P1', value: 12400, result: 'pass' }, { part_id: 'P2', value: 7407, result: 'pass' },
  ]]);

  tick(4 * DAY);                                                       // 15 October: day 7
  let view = (await get('/api/labs/LAB-12')).body;
  assert.deepEqual([view.status.state, view.mode], ['recheck_due', 'recheck']);
  const failed = await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '13,000', P2: '7,407' } });
  assert.deepEqual(failed.body.outcomes, [
    { part_id: 'P1', result: 'fail', message: 'This does not match your first answer. Check the dates and the steps, then read it again.' }, { part_id: 'P2', result: 'pass', message: null },
  ]);
  assert.equal(failed.body.notice, null);
  assert.equal(failed.body.status.state, 'look_again');
  view = (await get('/api/labs/LAB-12')).body;
  assert.deepEqual([view.status.state, view.mode, view.month], ['look_again', 'recheck', '2026-09']);

  const passed = await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '12,345', P2: '7,500' } });
  assert.equal(passed.body.status.state, 'done');
  view = (await get('/api/labs/LAB-12')).body;
  assert.deepEqual([view.status.state, view.mode], ['done', 'first']);
  assert.equal((await lines()).length, 4);

  // The POST takes the kind it is sent: a first answer during a re-check starts the week again.
  const restart = await post('/api/labs/LAB-12/answer', TWELVE);
  assert.deepEqual([restart.body.status.state, restart.body.status.baseline_date, restart.body.status.recheck_from], ['recheck_waiting', '2026-10-15', '2026-10-22']);
});

test('a last_28_days lab: a first answer needs a valid range and the self-check; its re-check logs the baseline\'s range', async (t) => {
  const { post, lines, tick } = await setup(t, '2026-10-08T10:00:00.000Z');
  const refused = async (body: object, pattern: RegExp, part_id?: string) => {
    const r = await post('/api/labs/LAB-20/answer', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.body.error, pattern);
    if (part_id) assert.equal(r.body.part_id, part_id);
  };
  await refused({ ...TWENTY, range: undefined }, /From and To/, 'range');
  await refused({ ...TWENTY, range: null }, /From and To/, 'range');
  await refused({ ...TWENTY, range: { from: '2026-09-10' } }, /From and To/, 'range');
  await refused({ ...TWENTY, range: { from: '2026-02-30', to: '2026-03-10' } }, /From and To/, 'range');
  await refused({ ...TWENTY, range: { from: '2026-10-08', to: '2026-09-11' } }, /^The From date cannot be after the To date\.$/, 'range');
  await refused({ ...TWENTY, self: {} }, /My screen matches/, 'P5');
  await refused({ ...TWENTY, self: { P5: 'yes' } }, /My screen matches/, 'P5');
  await refused({ ...TWENTY, values: { ...TWENTY.values, P4: 'Oval marker' } }, /Answer this question first/, 'P4');
  await refused({ ...TWENTY, values: { ...TWENTY.values, P4: ['Hexagon marker'] } }, /Tick only the options shown/, 'P4');
  await refused({ ...TWENTY, values: { ...TWENTY.values, P1: 'Step 9' } }, /Choose one of the options/, 'P1');
  assert.deepEqual(await lines(), []);

  // A self_rubric part needs only its self entry: a value sent for it is ignored, and its logged value is null.
  const { P5: _ignored, ...withoutP5 } = TWENTY.values;
  const first = await post('/api/labs/LAB-20/answer', { ...TWENTY, values: { ...withoutP5, P5: '   ' } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.outcomes.map((o: { result: string }) => o.result), ['pending', 'pending', 'pass', 'pass', 'self_yes']);
  assert.deepEqual(first.body.outcomes[3].expected, ['Circle marker', 'Oval marker']);
  assert.deepEqual(first.body.status.range, TWENTY_RANGE);
  const [rec] = await lines();
  assert.deepEqual([rec.month, rec.range, rec.note], [null, TWENTY_RANGE, null]);
  assert.deepEqual(rec.parts, [
    { part_id: 'P1', value: 'Step 2', result: 'pending' }, { part_id: 'P2', value: 5000, result: 'pending' },
    { part_id: 'P3', value: 4000, result: 'pass' }, { part_id: 'P4', value: ['Oval marker', 'Circle marker'], result: 'pass' },
    { part_id: 'P5', value: null, result: 'self_yes' },
  ]);

  tick(7 * DAY);
  const again = await post('/api/labs/LAB-20/answer', { kind: 'recheck', values: { P1: 'step 2', P2: '4,990' }, range: { from: '2026-09-17', to: '2026-10-14' } });
  assert.equal(again.status, 200);
  assert.equal(again.body.status.state, 'done');
  const re = (await lines())[1];
  assert.deepEqual([re.kind, re.month, re.range], ['recheck', null, TWENTY_RANGE]);
});

test('refusals: an unknown lab, a bad body or kind, a re-check with no baseline, a missing value, a number that cannot be read; none is logged', async (t) => {
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z');
  assert.equal((await post('/api/labs/LAB-99/answer', TWELVE)).status, 404);
  assert.equal((await post('/api/labs/LAB-12/answer', '[1, 2]')).status, 400);
  assert.equal((await post('/api/labs/LAB-12/answer', 'not json')).status, 400);
  assert.equal((await post('/api/labs/LAB-12/answer', { ...TWELVE, kind: 'second' })).status, 400);
  const none = await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '12,345', P2: '7,407' } });
  assert.equal(none.status, 409);

  const missing = await post('/api/labs/LAB-12/answer', { ...TWELVE, values: { P1: '12,345', P3: '60', P4: 'Teal marker' } });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /Answer this question first/);
  assert.equal(missing.body.part_id, 'P2');
  assert.equal((await post('/api/labs/LAB-12/answer', { ...TWELVE, values: undefined })).body.part_id, 'P1');

  const ambiguous = await post('/api/labs/LAB-12/answer', { ...TWELVE, values: { ...TWELVE.values, P1: '1.234' } });
  assert.deepEqual([ambiguous.status, ambiguous.body.error, ambiguous.body.part_id], [400, 'Is that 1234 or 1.234? Type it without a separator.', 'P1']);
  const words = await post('/api/labs/LAB-12/answer', { ...TWELVE, values: { ...TWELVE.values, P3: 'sixty' } });
  assert.deepEqual([words.status, words.body.error, words.body.part_id], [400, NUMBER_HELP, 'P3']);
  const choice = await post('/api/labs/LAB-12/answer', { ...TWELVE, values: { ...TWELVE.values, P4: 'Grey marker' } });
  assert.deepEqual([choice.status, choice.body.part_id], [400, 'P4']);
  assert.deepEqual(await lines(), []);

  // After a first answer, a re-check that leaves out a re-check part is refused too.
  await post('/api/labs/LAB-12/answer', TWELVE);
  const short = await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '12,345' } });
  assert.deepEqual([short.status, short.body.part_id], [400, 'P2']);
  assert.equal((await lines()).length, 1);
});

test('a first answer to an older lab version is no baseline: the lab is new and a re-check is a 409', async (t) => {
  const store = await loadContent(await makeLabRoot((f) => { f.labs['LAB-12']!.version = 2; }));
  const old = {
    record: 'lab_answer', schema_version: 5, ts: '2026-09-20T10:00:00.000Z', session_id: 'S-old', lab_id: 'LAB-12', lab_version: 1, kind: 'first',
    month: '2026-08', range: null, parts: [{ part_id: 'P1', value: 12345, result: 'pending' }, { part_id: 'P2', value: 7407, result: 'pending' }], note: null,
  };
  const { get, post } = await setup(t, '2026-10-08T10:00:00.000Z', store, [old]);
  const view = (await get('/api/labs/LAB-12')).body;
  assert.deepEqual([view.status.state, view.mode, view.month], ['new', 'first', '2026-09']);
  assert.equal((await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '12,345', P2: '7,407' } })).status, 409);
  const first = await post('/api/labs/LAB-12/answer', TWELVE);
  assert.equal(first.status, 200);
  assert.equal(first.body.status.state, 'recheck_waiting');
});

test('the note is trimmed and cut to 500 characters; a blank or missing note is null', async (t) => {
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z');
  await post('/api/labs/LAB-12/answer', { ...TWELVE, note: `  ${'a'.repeat(600)}  ` });
  await post('/api/labs/LAB-12/answer', { ...TWELVE, note: '   ' });
  await post('/api/labs/LAB-12/answer', { ...TWELVE, note: undefined });
  await post('/api/labs/LAB-12/answer', { ...TWELVE, note: 42 });
  assert.deepEqual((await lines()).map((r) => r.note), ['a'.repeat(500), null, null, null]);
});

test('a lab whose key file is missing answers 500 with its text; an unknown lab stays 404', async (t) => {
  const store = await loadContent(await makeLabRoot((f) => { delete f.keys['LAB-12']; }));
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z', store);
  const r = await post('/api/labs/LAB-12/answer', TWELVE);
  assert.deepEqual([r.status, r.body.error], [500, 'This lab has no answer key.']);
  assert.equal((await post('/api/labs/LAB-99/answer', TWELVE)).status, 404);
  assert.deepEqual(await lines(), []);
});

test('a re-check of a lab with no re-check part is a 400, and is not logged', async (t) => {
  const store = await loadContent(await makeLabRoot((f) => {
    for (const p of f.labs['LAB-12']!.parts.slice(0, 2)) { p.check = 'consistency'; delete p.tolerance; }
  }));
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z', store);
  assert.equal((await post('/api/labs/LAB-12/answer', TWELVE)).status, 200);
  const r = await post('/api/labs/LAB-12/answer', { kind: 'recheck', values: { P1: '12,345', P2: '7,407' } });
  assert.deepEqual([r.status, r.body.error], [400, 'This lab has no re-check.']);
  assert.equal((await lines()).length, 1);
});

test("the month sent with a first answer is the month logged: today's and yesterday's are accepted, a stale one is refused and not logged", async (t) => {
  // 2026-10-05 Amsterdam: the fixed month is 2026-09. Yesterday (the 4th) gave 2026-08.
  const { post, lines } = await setup(t, '2026-10-05T10:00:00.000Z');
  const today = await post('/api/labs/LAB-12/answer', { ...TWELVE, month: '2026-09' });
  assert.equal(today.status, 200);
  const yesterday = await post('/api/labs/LAB-12/answer', { ...TWELVE, month: '2026-08' });
  assert.equal(yesterday.status, 200);
  const logged = await lines();
  assert.deepEqual(logged.map((r) => r.month), ['2026-09', '2026-08']);
  const stale = await post('/api/labs/LAB-12/answer', { ...TWELVE, month: '2026-07' });
  assert.equal(stale.status, 400);
  assert.equal(stale.body.error, 'The month to use has changed. Reload the lab.');
  const wrongType = await post('/api/labs/LAB-12/answer', { ...TWELVE, month: 202609 });
  assert.equal(wrongType.status, 400);
  assert.equal((await lines()).length, 2);
});

test('a last_28_days range must span 28 days: To minus From is 27 days; otherwise it is refused beside the range and not logged', async (t) => {
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z');
  for (const range of [{ from: '2026-08-10', to: '2026-10-07' }, { from: '2026-09-10', to: '2026-10-06' }, { from: '2026-09-10', to: '2026-09-10' }]) {
    const r = await post('/api/labs/LAB-20/answer', { ...TWENTY, range });
    assert.equal(r.status, 400, JSON.stringify(range));
    assert.equal(r.body.error, "GA4's Last 28 days covers 28 days. Check From and To.");
    assert.equal(r.body.part_id, 'range');
  }
  assert.deepEqual(await lines(), []);
  assert.equal((await post('/api/labs/LAB-20/answer', TWENTY)).status, 200);
});

test('an empty set is not an answer to a multi part: refused beside that part, not logged', async (t) => {
  const { post, lines } = await setup(t, '2026-10-08T10:00:00.000Z');
  const r = await post('/api/labs/LAB-20/answer', { ...TWENTY, values: { ...TWENTY.values, P4: [] } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Answer this question first.');
  assert.equal(r.body.part_id, 'P4');
  assert.deepEqual(await lines(), []);
  assert.equal((await post('/api/labs/LAB-20/answer', TWENTY)).status, 200);
});

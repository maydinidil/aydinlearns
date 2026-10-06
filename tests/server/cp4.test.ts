// Task C7: the openers' typed CP4 (design §7, D15; S2-49, S2-50, S2-52, S2-98). The truth values and queries here are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog } from '../../server/state.ts';
import { api, type Cp4Served, type Cp4Result } from '../../web/src/api.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { primed } from '../helpers/replay-fixture.ts';

const L1_VALUE = 123.45;      // invented: a euro amount with 2 decimals
const L2_VALUE = 38.4;        // invented: a percentage with 1 decimal
const QUERY_TEXT = 'SELECT invented_truth_query_marker FROM nowhere';
const L1_CP3 = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-NULL-01'];
const L1_CREDITS: string[] = [];                     // S2-106: this CP4 credits nothing
const L2_CREDITS = ['SQL-AGG-01'];
const PROMPT_1 = 'Type the invented average price in euros, rounded to 2 decimals.';
const PROMPT_2 = 'Type the invented percentage with 1 decimal.';

async function writeCases(root: string): Promise<void> {
  for (const dir of ['sql/openers', 'keys/cases']) await mkdir(join(root, dir), { recursive: true });
  const record = (n: number, cp4: object | null) => ({
    case_id: `CASE-VOLT-L${n}`, world: 'PRICE', company_id: 'voltmarkt', title: `Opener ${n}`, persona: { name: 'Sanne', role: 'Manager' },
    brief: { decision: 'd', deadline: 'Friday' }, model_plan: 'p', model_answer_template: 'a', difficulty: 1, concept_ids: [FIXTURE_CONCEPT],
    metric_ids: [], find_ids: [], uses_raw: false,
    checkpoints: [{ id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: [...L1_CP3, 'SQL-SORT-01', 'SQL-AGG-01'], item_id: `EX-OPENER-L${n}-01` }, ...(cp4 ? [cp4] : [])],
  });
  const cp4 = (n: number, prompt: string, credits: string[], typed: object) =>
    ({ id: 'CP4', kind: 'CP4', prompt, credits_concepts: credits, item_id: `CASE-VOLT-L${n}:CP4`, typed, truth_key: `CASE-VOLT-L${n}:CP4` });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  await put('sql/openers/CASE-VOLT-L1.json', record(1, cp4(1, PROMPT_1, L1_CREDITS, { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' })));
  await put('sql/openers/CASE-VOLT-L2.json', record(2, cp4(2, PROMPT_2, L2_CREDITS, { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' })));
  await put('sql/openers/CASE-VOLT-L3.json', record(3, null));         // an opener with no CP4
  for (const n of [1, 2]) await put(`keys/cases/CASE-VOLT-L${n}.json`, { case_id: `CASE-VOLT-L${n}`, checkpoint_id: 'CP4', truth_query: QUERY_TEXT });
}

const root = await makeContentFixture();
const truthFile = join(await mkdtemp(join(tmpdir(), 'al-truth-')), 'voltmarkt.json');
await writeFile(truthFile, JSON.stringify({ company: 'voltmarkt', checkpoints: { 'CASE-VOLT-L1:CP4': L1_VALUE, 'CASE-VOLT-L2:CP4': L2_VALUE } }));
await writeCases(root);
const content = await loadContent(root, { truthFile });

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const serve = (app: Hono, caseId: string) => post(app, `/api/openers/${caseId}/cp4/serve`);
const answer = (app: Hono, caseId: string, body: Record<string, unknown>) => post(app, `/api/openers/${caseId}/cp4/answer`, body);

async function deps(seed: object[] = [], store = content): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-cp4-')));
  for (const r of seed) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state };
}
const attempts = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
const everything = async (d: AppDeps) => JSON.stringify([...await d.logger.readAll('attempts'), ...await d.logger.readAll('events'), ...await d.logger.readAll('reports')]);
const primes = (concepts: string[]) => concepts.flatMap((c) => primed(c, '2020-01-01'));
const reviews = (d: AppDeps, id: string) => d.state.current().instances.get(id)!.card_reviews.map((c) => [c.card_id, c.rating]);

// ---- Content --------------------------------------------------------------------------------------------------------------

test('the truth value of a CP4 loads from the truth file, and its credits are served like a CP3 item\'s (S2-49)', async () => {
  assert.equal(content.checkpointTruth?.('CASE-VOLT-L1:CP4'), L1_VALUE);
  assert.equal(content.checkpointTruth?.('CASE-VOLT-L2:CP4'), L2_VALUE);
  assert.equal(content.checkpointTruth?.('CASE-VOLT-L3:CP4'), undefined);
  assert.deepEqual(content.checkpointCredits?.('CASE-VOLT-L1:CP4'), L1_CREDITS);
  assert.deepEqual(content.checkpointCredits?.('CASE-VOLT-L2:CP4'), L2_CREDITS);
  const catalog = buildCatalog(content);
  assert.deepEqual([catalog.familyOf('CASE-VOLT-L2:CP4', 'typed'), catalog.creditsOf('CASE-VOLT-L2:CP4')], ['checkpoint', L2_CREDITS]);
  const bare = await loadContent(root);
  assert.equal(bare.checkpointTruth?.('CASE-VOLT-L1:CP4'), undefined, 'no truth file given: no value');
  const missing = await loadContent(root, { truthFile: join(root, 'no-such-truth.json') });
  assert.equal(missing.checkpointTruth?.('CASE-VOLT-L1:CP4'), undefined, 'a truth file that does not exist is no values');
});
test('a case key file is part of the content version and never loaded as an item key', async () => {
  const other = await makeContentFixture();
  await writeCases(other);
  const before = (await loadContent(other)).contentVersion;
  await writeFile(join(other, 'keys/cases/CASE-VOLT-L1.json'), JSON.stringify({ case_id: 'CASE-VOLT-L1', checkpoint_id: 'CP4', truth_query: 'SELECT 1' }));
  assert.notEqual((await loadContent(other)).contentVersion, before);
  assert.equal(content.key('CASE-VOLT-L1'), undefined);
});

// ---- Serving: the question, never its value or its query ---------------------------------------------------------------------

test('serving sends the prompt and the typed spec, in phase case, and never a truth value or query', async () => {
  const d = await deps();
  const app = createApp(d);
  const r = await serve(app, 'CASE-VOLT-L1');
  assert.equal(r.status, 200);
  const text = await r.text();
  const body = JSON.parse(text) as Cp4Served;
  assert.deepEqual(body, { case_id: 'CASE-VOLT-L1', item_id: 'CASE-VOLT-L1:CP4', item_instance_id: body.item_instance_id, phase: 'case', prompt: PROMPT_1,
    typed: { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' } });
  assert.match(body.item_instance_id, /^[0-9a-f-]{36}$/);
  for (const secret of ['123.45', '38.4', 'truth', 'invented_truth_query_marker', 'SQL-BASICS']) assert.ok(!text.includes(secret), `no ${secret}`);
  assert.deepEqual(await attempts(d), [], 'a question served is not logged');
  assert.equal((await serve(app, 'CASE-VOLT-L3')).status, 404, 'an opener with no CP4');
  assert.equal((await serve(app, 'CASE-NOPE')).status, 404);
});
test('a CP4 whose value is not built yet is not served', async () => {
  const noTruth = await loadContent(root);
  const d = await deps([], noTruth);
  const r = await serve(createApp(d), 'CASE-VOLT-L1');
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /Close and start aydinlearns again\./);
});

// ---- Answering: a right, a wrong and a factor-of-100 answer (D15) -------------------------------------------------------------

test('a right answer is logged as a typed checkpoint attempt in phase case, closes as a pass, and reveals the value only then', async () => {
  const d = await deps(primes(L1_CREDITS));
  const app = createApp(d);
  const served = await json(serve(app, 'CASE-VOLT-L1'));
  const id = served.item_instance_id;
  const r = await json(answer(app, 'CASE-VOLT-L1', { item_instance_id: id, typed: ' 123,45 ', confidence: 3, phase: 'free', active_ms: 8000 }));
  assert.deepEqual(r, { correct: true, value: L1_VALUE, error_ids: [], attempt_id: r.attempt_id });
  const [a, close, ...rest] = (await attempts(d)).filter((x) => x.item_instance_id === id);
  assert.deepEqual(rest, []);
  assert.deepEqual([a.record, a.section, a.item_kind, a.item_id, a.phase, a.item_instance_id], ['attempt', 'sql', 'typed', 'CASE-VOLT-L1:CP4', 'case', id], 'the serving\'s phase, not the browser\'s');
  assert.deepEqual([a.target_concept_id, a.concept_ids], ['SQL-BASICS-01', []], 'no credits: the target is the first concept of its CP3');
  assert.deepEqual([a.outcome, a.is_correct, a.error_ids, a.confidence, a.grader_version, a.grading_source, a.submission_no, a.hint_level], ['pass', true, [], 3, 'choice.1', 'auto', 1, 0]);
  assert.deepEqual(a.payload, { kind: 'mcq', shown_order: [], chosen: null, typed: ' 123,45 ' }, 'the text as typed');
  assert.deepEqual([a.world, a.difficulty, a.template_id], [null, null, null]);
  assert.deepEqual([close.record, close.reason, close.item_id, close.phase], ['item_close', 'pass', 'CASE-VOLT-L1:CP4', 'case']);
  // S2-106: a CP4 that credits nothing is graded and shown but writes no card review.
  assert.deepEqual(reviews(d, id), []);
  assert.equal((await answer(app, 'CASE-VOLT-L1', { item_instance_id: id, typed: '123.45' })).status, 409, 'one answer per instance');
});
test('a decimal comma, a trailing %, and a value within half the last decimal are right; one beyond it is wrong', async () => {
  const d = await deps();
  const app = createApp(d);
  const tries: [string, string, boolean][] = [['CASE-VOLT-L2', '38,4 %', true], ['CASE-VOLT-L2', '38.44', true], ['CASE-VOLT-L2', '38.46', false],
    ['CASE-VOLT-L1', '123.449', true], ['CASE-VOLT-L1', '123.46', false]];
  for (const [caseId, typed, right] of tries) {
    const served = await json(serve(app, caseId));
    assert.equal((await json(answer(app, caseId, { item_instance_id: served.item_instance_id, typed }))).correct, right, `${caseId} ${typed}`);
  }
});
test('a wrong answer fails the checkpoint: Again for the first credited concept, and the value is revealed after it (S2-50)', async () => {
  const d = await deps(primes(L2_CREDITS));
  const app = createApp(d);
  const served = await json(serve(app, 'CASE-VOLT-L2'));
  const r = await json(answer(app, 'CASE-VOLT-L2', { item_instance_id: served.item_instance_id, typed: '99', confidence: null }));
  assert.deepEqual([r.correct, r.value, r.error_ids], [false, L2_VALUE, []]);
  assert.deepEqual(reviews(d, served.item_instance_id), [['CARD-SQL-AGG-01', 1]]);
  assert.deepEqual((await attempts(d)).filter((x) => x.record === 'item_close' && x.item_id === 'CASE-VOLT-L2:CP4').map((x) => x.reason), ['left']);
});
test('a percentage typed as a share (a factor of 100 off) is ERR-LOG-21, and its concept is the first credited when not credited (S2-50)', async () => {
  const d = await deps(primes(L2_CREDITS));
  const app = createApp(d);
  const served = await json(serve(app, 'CASE-VOLT-L2'));
  const r = await json(answer(app, 'CASE-VOLT-L2', { item_instance_id: served.item_instance_id, typed: '0,384' }));
  assert.deepEqual([r.correct, r.error_ids], [false, ['ERR-LOG-21']]);
  assert.deepEqual(reviews(d, served.item_instance_id), [['CARD-SQL-AGG-01', 1]], 'ERR-LOG-21 belongs to SQL-BASICS-02, which this CP4 does not credit');
  const bigger = await json(serve(app, 'CASE-VOLT-L2'));
  assert.deepEqual((await json(answer(app, 'CASE-VOLT-L2', { item_instance_id: bigger.item_instance_id, typed: '3840' }))).error_ids, ['ERR-LOG-21'], 'the other direction');
  // Euros 100 times off are cents, never the percent-scale mistake (D15).
  const money = await json(serve(app, 'CASE-VOLT-L1'));
  assert.deepEqual((await json(answer(app, 'CASE-VOLT-L1', { item_instance_id: money.item_instance_id, typed: '12345' }))).error_ids, []);
});
// ---- S2-105: a value shown is a value known ----------------------------------------------------------------------------------

test('after a wrong answer showed the value, a later CP4 of that case counts as assisted: no Good, no qualifying solve (S2-105)', async () => {
  const d = await deps(primes(L2_CREDITS));
  const app = createApp(d);
  const first = await json(serve(app, 'CASE-VOLT-L2'));
  assert.equal((await json(answer(app, 'CASE-VOLT-L2', { item_instance_id: first.item_instance_id, typed: '99' }))).value, L2_VALUE);
  const second = await json(serve(app, 'CASE-VOLT-L2'));
  const r = await json(answer(app, 'CASE-VOLT-L2', { item_instance_id: second.item_instance_id, typed: '38.4' }));
  assert.equal(r.correct, true);
  const mine = (await attempts(d)).filter((x) => x.item_instance_id === second.item_instance_id);
  assert.deepEqual(mine.map((x) => x.record), ['solution_opened', 'attempt', 'item_close'], 'the reveal is logged before the first graded attempt');
  assert.equal(mine[1].solution_viewed, true);
  assert.ok(Date.parse(mine[0].ts) < Date.parse(mine[1].submitted_at));
  assert.deepEqual(reviews(d, second.item_instance_id), [['CARD-SQL-AGG-01', 1]], 'Again on a rated card, never Good');
  assert.equal(d.state.current().instances.get(second.item_instance_id)!.countsAsPass, false, 'not a qualifying solve');
  // Another case's CP4 is untouched, and the first instance stays an ordinary fail.
  const other = await json(serve(app, 'CASE-VOLT-L1'));
  await answer(app, 'CASE-VOLT-L1', { item_instance_id: other.item_instance_id, typed: '123.45' });
  assert.ok(!(await attempts(d)).some((x) => x.item_instance_id === other.item_instance_id && x.record === 'solution_opened'));
});
test('a right first answer shows the value to nobody new: the next CP4 of that case is not assisted', async () => {
  const d = await deps(primes(L2_CREDITS));
  const app = createApp(d);
  for (let n = 0; n < 2; n++) {
    const s = await json(serve(app, 'CASE-VOLT-L2'));
    await answer(app, 'CASE-VOLT-L2', { item_instance_id: s.item_instance_id, typed: '38.4' });
    assert.ok(!(await attempts(d)).some((x) => x.item_instance_id === s.item_instance_id && x.record === 'solution_opened'));
  }
});
test('a CP4 that credits nothing is graded and logged but writes no card review, and a replay of its log agrees (S2-106)', async () => {
  const d = await deps(primes(L1_CP3));
  const app = createApp(d);
  const s = await json(serve(app, 'CASE-VOLT-L1'));
  const r = await json(answer(app, 'CASE-VOLT-L1', { item_instance_id: s.item_instance_id, typed: '99' }));
  assert.equal(r.correct, false);
  assert.deepEqual(reviews(d, s.item_instance_id), []);
  assert.deepEqual((await attempts(d)).filter((x) => x.item_instance_id === s.item_instance_id).map((x) => x.record), ['attempt', 'item_close']);
});
test('an answer that cannot be read is refused and logs nothing; a lapsed or foreign instance is refused too (S2-98)', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(serve(app, 'CASE-VOLT-L1'));
  const id = served.item_instance_id;
  for (const typed of ['', '1e3', '1.234,5', 'abc']) assert.equal((await answer(app, 'CASE-VOLT-L1', { item_instance_id: id, typed })).status, 400, typed);
  assert.equal((await answer(app, 'CASE-VOLT-L1', { item_instance_id: id })).status, 400);
  assert.deepEqual(await attempts(d), [], 'a refused answer is not an attempt');
  assert.equal((await answer(app, 'CASE-VOLT-L1', { item_instance_id: 'never-served', typed: '123.45' })).status, 409, 'never served here');
  assert.equal((await answer(app, 'CASE-VOLT-L2', { item_instance_id: id, typed: '38.4' })).status, 400, 'an instance of another case');
  assert.equal((await answer(app, 'CASE-NOPE', { item_instance_id: id, typed: '38.4' })).status, 404);
  assert.deepEqual(await attempts(d), []);
});
test('a serving the session end forgot is not answered (S2-98)', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(serve(app, 'CASE-VOLT-L1'));
  await d.session.end('explicit');
  assert.equal((await answer(app, 'CASE-VOLT-L1', { item_instance_id: served.item_instance_id, typed: '123.45' })).status, 409);
});
test('no response before an answer and no log record holds a truth value or query', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await serve(app, 'CASE-VOLT-L2');
  const id = (await served.clone().json()).item_instance_id;
  const refused = await answer(app, 'CASE-VOLT-L2', { item_instance_id: id, typed: 'abc' });
  for (const text of [await served.text(), await refused.text()]) for (const secret of ['38.4', 'invented_truth_query_marker']) assert.ok(!text.includes(secret));
  const logged = await json(answer(app, 'CASE-VOLT-L2', { item_instance_id: id, typed: '38.4' }));
  assert.equal(logged.value, L2_VALUE);
  assert.ok(!(await everything(d)).includes('invented_truth_query_marker'));
  assert.ok(!(await everything(d)).includes('"value"'), 'the log holds what was typed, not the truth');
});
test('the web client\'s types fit what the routes send', () => {
  const served: Cp4Served = { case_id: 'c', item_id: 'c:CP4', item_instance_id: 'i', phase: 'case', prompt: 'p', typed: { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' } };
  const result: Cp4Result = { correct: true, value: 1, error_ids: [], attempt_id: 'a' };
  assert.deepEqual([served.phase, result.correct, typeof api.cp4Serve, typeof api.cp4Answer], ['case', true, 'function', 'function']);
});

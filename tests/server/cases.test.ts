// tests/server/cases.test.ts: the case routes (sprint 4b, Task D1; design §5, §7; S4B-02, S4B-07 to S4B-10, S4B-12, S4B-13;
// S2-50, S2-105, S2-106; Review Focus 2 and 3). Every case, key and value here is invented (tests/helpers/case-fixture.ts); the
// truth values are set to numbers no ID, time or prompt can hold, so a search for them finds only a real leak. No assertion
// message quotes a secret: a leak is named by what it is, never by its text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, recoveredCloses, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds } from '../../server/main.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { makeCaseFixture, DAILY_ID, INBOX_ID, OPENER_ID, OTHER_CONCEPT, type CasePatch } from '../helpers/case-fixture.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { instance, primed } from '../helpers/replay-fixture.ts';

/** Invented truth values: a count, a money amount and so on, each long enough that no UUID group, date or time can hold it. */
const VALUES: Record<string, number> = { [`${OPENER_ID}:CP4`]: 6543.21, [`${INBOX_ID}:CP2`]: 48213, [`${INBOX_ID}:CP4`]: 9137.58, [`${DAILY_ID}:CP4`]: 52917 };
const CP5_EXPLANATION = 'A second invented explanation, for the fifth checkpoint.';
const TEMPLATE = 'An invented model answer marker: {CP2} stores, {CP4} euros on average.';
const WRONG = { CP2: '100', CP4: '1.00' } as const;
/** Fix round 1: what a plan or an insight reply says while its gate (CP1, CP5) has no answer, in place of the model text. */
const PLAN_NOTE = 'Answer CP1, then compare your plan with the model plan.';
const INSIGHT_NOTE = 'Answer CP5, then compare with the model answer.';
/** Seams M1: what an opener's plan reply says while its grain is held back (no sketch logged, CP3 never answered). */
const GRAIN_NOTE = 'Save your sketch or submit CP3, then compare your plan with the model plan.';

const patch: CasePatch = {
  truths: (t) => { for (const k of Object.keys(t)) delete t[k]; Object.assign(t, VALUES); },
  keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.choices.CP5.explanation = CP5_EXPLANATION; },
  // Each case's model texts differ, so the search names the case whose text leaked.
  records: (r) => {
    r.inbox.model_answer_template = TEMPLATE;
    r.opener.model_plan = 'Opener plan: an invented marker.';
    r.opener.model_answer_template = 'Opener answer: an invented marker, {CP4}.';
    r.daily.model_plan = 'Daily plan: an invented marker.';
    r.daily.model_answer_template = 'Daily answer: an invented marker, {CP4}.';
  },
};
const fixture = await makeCaseFixture(patch);
const content = await loadContent(fixture.root, { truthFile: fixture.truthFile });
const inbox = content.case!(INBOX_ID)!;
const opener = content.case!(OPENER_ID)!;
const keyOf = (caseId: string) => content.caseKey!(caseId)!;
const correctOid = (cp: 'CP1' | 'CP5') => keyOf(INBOX_ID).choices[cp]!.correct_oid;
const wrongOid = (cp: 'CP1' | 'CP5') => inbox.checkpoints.find((c) => c.kind === cp)!.options!.map((o) => o.oid).find((o) => o !== correctOid(cp))!;
const right = (key: string): string => { const v = VALUES[key]!; return Number.isInteger(v) ? String(v) : v.toFixed(2); };

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const serve = (app: Hono, caseId: string, cp: string) => post(app, `/api/cases/${caseId}/checkpoints/${cp}/serve`);
const answer = (app: Hono, caseId: string, cp: string, body: Record<string, unknown>) => post(app, `/api/cases/${caseId}/checkpoints/${cp}/answer`, body);

async function deps(seed: { attempts?: object[]; events?: object[] } = {}, store: ContentStore = content): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-cases-')));
  for (const r of seed.attempts ?? []) await log.append('attempts', r);
  for (const r of seed.events ?? []) await log.append('events', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state };
}
const attempts = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
const events = async (d: AppDeps) => (await d.logger.readAll('events')) as any[];
const primes = (concepts: string[]) => concepts.flatMap((c) => primed(c, '2020-01-01'));
const reviews = (d: AppDeps, id: string) => d.state.current().instances.get(id)!.card_reviews.map((c) => [c.card_id, c.rating]);

// ---- The leak search (Review Focus 2) ----------------------------------------------------------------------------------------

/** Field names that say whether an answer is right, or carry a key, a model text or a credit. None may appear before an answer. */
const KEY_FIELDS = ['correct', 'correct_oid', 'value', 'explanation', 'model_plan', 'model_answer', 'model_answer_template', 'truths', 'choices',
  'truth_query', 'truth_key', 'credits_concepts'];
/** The texts no response may hold before their answer: each key file's truth queries and explanations, each case's model texts. */
function secretTexts(): { label: string; text: string; cp?: string }[] {
  const out: { label: string; text: string; cp?: string }[] = [];
  for (const c of content.cases!()) {
    out.push({ label: `${c.case_id} model plan`, text: c.model_plan }, { label: `${c.case_id} model answer`, text: c.model_answer_template.split('{')[0]! });
    const k = keyOf(c.case_id);
    for (const [cp, q] of Object.entries(k.truths)) out.push({ label: `${c.case_id} ${cp} truth query`, text: q! });
    for (const [cp, ch] of Object.entries(k.choices)) out.push({ label: `${c.case_id} ${cp} explanation`, text: ch!.explanation, cp: `${c.case_id}:${cp}` });
  }
  return out;
}
const SECRETS = secretTexts();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A truth value as a number, or as text written with a point or a comma, standing on its own (not inside a longer number or ID). */
const valuePatterns = (v: number): RegExp[] => {
  const forms = Number.isInteger(v) ? [String(v)] : [v.toFixed(2), v.toFixed(2).replace('.', ',')];
  return forms.map((f) => new RegExp(`(?<![0-9A-Za-z])${escape(f)}(?![0-9A-Za-z])`));
};

/**
 * What a response body leaks, by label: a truth value, a truth query, an explanation, a model text, or a key field. `allow` names
 * what this response may hold: the checkpoint item IDs (<case_id>:<CP>) its answer just revealed, `fields` the key fields of an
 * answer reply, and `texts` the labels of model texts a self-check reply carries.
 */
function leaks(body: string, allow: { revealed?: string[]; fields?: string[]; texts?: string[] } = {}): string[] {
  const found = new Set<string>();
  const revealed = new Set(allow.revealed ?? []);
  for (const s of SECRETS) if (body.includes(s.text) && !(s.cp && revealed.has(s.cp)) && !allow.texts?.includes(s.label)) found.add(s.label);
  const values = Object.entries(VALUES).filter(([k]) => !revealed.has(k));
  const walk = (x: unknown): void => {
    if (typeof x === 'number') { for (const [k, v] of values) if (x === v) found.add(`${k} value`); }
    else if (typeof x === 'string') { for (const [k, v] of values) if (valuePatterns(v).some((p) => p.test(x))) found.add(`${k} value`); }
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) {
        if (KEY_FIELDS.includes(k) && !allow.fields?.includes(k)) found.add(`field ${k}`);
        walk(v);
      }
    }
  };
  walk(JSON.parse(body));
  return [...found];
}
/** Every read and serve the case screen makes before an answer: the inbox, each case's view, and a serving of each checkpoint. */
async function everyPreAnswerResponse(app: Hono): Promise<{ label: string; body: string }[]> {
  const out: { label: string; body: string }[] = [];
  const read = async (label: string, r: Response) => { assert.equal(r.status, 200, label); out.push({ label, body: await r.text() }); };
  await read('the inbox', await get(app, '/api/cases'));
  for (const c of content.cases!()) {
    await read(`${c.case_id} view`, await get(app, `/api/cases/${c.case_id}`));
    for (const cp of c.checkpoints) if (['CP1', 'CP2', 'CP4', 'CP5'].includes(cp.kind)) await read(`${c.case_id} ${cp.kind} serve`, await serve(app, c.case_id, cp.kind));
  }
  return out;
}
/**
 * Fix round 1 (M3): the plan and insight replies sent while their gate has no answer: a plan before the case's CP1, an insight
 * before its CP5. Each must carry a plain note and no model text. Posting them logs self-checks, which name no instance.
 */
async function gatedReplies(app: Hono, answered: readonly string[]): Promise<{ label: string; body: string }[]> {
  const out: { label: string; body: string }[] = [];
  const send = async (label: string, path: string, body: unknown) => {
    const r = await post(app, path, body);
    assert.equal(r.status, 200, label);
    out.push({ label, body: await r.text() });
  };
  for (const c of content.cases!()) {
    const gated = (cp: string) => c.checkpoints.some((p) => p.kind === cp) && !answered.includes(`${c.case_id}:${cp}`);
    if (gated('CP1')) await send(`${c.case_id} plan reply before CP1`, `/api/cases/${c.case_id}/plan`, { fields: { metric_formula: 'a plan written first' } });
    if (gated('CP5')) await send(`${c.case_id} insight reply before CP5`, `/api/cases/${c.case_id}/insight`, { text: 'An insight written first.' });
  }
  return out;
}

test('the fixture\'s secrets are what the leak search looks for, and the search finds each kind of leak', () => {
  assert.equal(SECRETS.filter((s) => s.label.endsWith('truth query')).length, 4);
  assert.equal(SECRETS.filter((s) => s.label.endsWith('explanation')).length, 2);
  assert.deepEqual(leaks(JSON.stringify({ a: 'nothing here', id: 'c0ffee48213a-9137', t: '2026-10-07T09:13:58.213Z' })), []);
  assert.deepEqual(leaks(JSON.stringify({ n: VALUES[`${INBOX_ID}:CP2`] })), [`${INBOX_ID}:CP2 value`]);
  assert.deepEqual(leaks(JSON.stringify({ s: `about ${right(`${INBOX_ID}:CP4`).replace('.', ',')} euros` })), [`${INBOX_ID}:CP4 value`]);
  assert.deepEqual(leaks(JSON.stringify({ correct: false })), ['field correct']);
  assert.deepEqual(leaks(JSON.stringify({ x: [{ y: inbox.model_plan }] })), [`${INBOX_ID} model plan`]);
  assert.deepEqual(leaks(JSON.stringify({ x: opener.model_answer_template })), [`${OPENER_ID} model answer`]);
});

// ---- The inbox and the case view (S4B-12, Review Focus 2) ------------------------------------------------------------------------

test('GET /api/cases lists every case as a manager message with its status and score, and serves and logs nothing (S4B-12)', async () => {
  const d = await deps();
  const app = createApp(d);
  const r = await get(app, '/api/cases');
  assert.equal(r.status, 200);
  const list = await r.json();
  assert.deepEqual(list.map((x: any) => x.case_id), [DAILY_ID, INBOX_ID, OPENER_ID], 'every case, in case ID order');
  assert.deepEqual(list.find((x: any) => x.case_id === INBOX_ID), {
    case_id: INBOX_ID, kind: 'inbox', level: 1, title: inbox.title, persona: inbox.persona, brief: inbox.brief,
    status: 'new', score: 0, checkpoints_passed: 0, checkpoints_total: 5,
  });
  assert.deepEqual(list.map((x: any) => [x.kind, x.checkpoints_total]), [['daily', 2], ['inbox', 5], ['opener', 2]]);
  await get(app, `/api/cases/${INBOX_ID}`);
  assert.deepEqual([await attempts(d), await events(d), d.session.currentId], [[], [], null], 'reading starts no session and logs nothing');
});

test('GET /api/cases/:id sends the brief, the checkpoints\' prompts, options and typed specs, and nothing that answers one', async () => {
  const d = await deps();
  const app = createApp(d);
  const v = await json(get(app, `/api/cases/${INBOX_ID}`));
  assert.deepEqual(Object.keys(v).sort(), ['brief', 'case_id', 'checkpoints', 'data_needed', 'data_source', 'expected_output', 'follow_up_question', 'insight', 'kind',
    'level', 'persona', 'plan', 'plan_fields', 'score', 'sketch', 'sketch_fields', 'solved_at', 'status', 'title']);
  assert.deepEqual([v.case_id, v.kind, v.level, v.title, v.persona, v.brief, v.data_needed, v.data_source, v.status, v.score, v.solved_at],
    [INBOX_ID, 'inbox', 1, inbox.title, inbox.persona, inbox.brief, inbox.data_needed, inbox.data_source, 'new', 0, null]);
  assert.deepEqual(v.checkpoints.map((c: any) => [c.id, c.kind, c.item_id]),
    [['CP1', 'CP1', `${INBOX_ID}:CP1`], ['CP2', 'CP2', `${INBOX_ID}:CP2`], ['CP3', 'CP3', 'EX-CASE-PRICE-01'], ['CP4', 'CP4', `${INBOX_ID}:CP4`],
      ['CP5', 'CP5', `${INBOX_ID}:CP5`], ['CP6', 'CP6', null]]);
  for (const [i, c] of v.checkpoints.entries()) {
    const src = inbox.checkpoints[i]!;
    assert.deepEqual(Object.keys(c).sort(), ['id', 'item_id', 'kind', 'last', 'options', 'passed', 'prompt', 'typed'], c.id);
    assert.deepEqual([c.prompt, c.typed, c.passed, c.last], [src.prompt, src.typed ?? null, false, null], c.id);
    if (src.options) {
      assert.deepEqual([...c.options].sort((a: any, b: any) => a.oid.localeCompare(b.oid)), [...src.options].sort((a, b) => a.oid.localeCompare(b.oid)), `${c.id}: the same options`);
    } else assert.equal(c.options, null, c.id);
  }
  assert.deepEqual([v.sketch, v.plan, v.insight], [null, null, null]);
  assert.deepEqual(v.plan_fields.map((f: any) => f.id), ['metric_formula', 'output_grain', 'tables_and_keys', 'filters', 'edge_cases', 'expected_row_count']);
  assert.deepEqual(v.sketch_fields.map((f: any) => f.id), ['one_row_per', 'tables', 'metric']);
  assert.deepEqual([v.expected_output.columns, v.expected_output.sort], [inbox.expected_output.columns, inbox.expected_output.sort]);
  assert.equal((await get(app, '/api/cases/CASE-NOPE')).status, 404);
});

test('the options of a CP5 are never sent in their source order alone: each view and each serving shuffles them (S2-60)', async () => {
  const d = await deps();
  const app = createApp(d);
  const views = new Set<string>();
  const servings = new Set<string>();
  for (let n = 0; n < 40; n++) {
    views.add((await json(get(app, `/api/cases/${INBOX_ID}`))).checkpoints.find((c: any) => c.kind === 'CP5').options.map((o: any) => o.oid).join());
    const s = await json(serve(app, INBOX_ID, 'CP5'));
    assert.deepEqual(s.options.map((o: any) => o.oid), s.shown_order, 'a serving shows the order it logs');
    servings.add(s.shown_order.join());
  }
  // 4 options shuffled 40 times: one order every time is a chance of 1 in 24^39.
  assert.ok(views.size > 1, 'the view shuffles');
  assert.ok(servings.size > 1, 'each serving shuffles');
});

test('Review Focus 2: before each answer, no inbox, case view, serving or gated plan or insight reply holds a value, an explanation, a truth query, a model text or a key field', async () => {
  const d = await deps();
  const app = createApp(d);
  // Nothing answered yet: every read and every serving of every case, and the inbox case's plan and insight replies (gated).
  const first = await gatedReplies(app, []);
  assert.deepEqual(first.map((r) => r.label), [`${INBOX_ID} plan reply before CP1`, `${INBOX_ID} insight reply before CP5`]);
  for (const r of [...await everyPreAnswerResponse(app), ...first]) assert.deepEqual(leaks(r.body), [], r.label);
  // The inbox case answered checkpoint by checkpoint, wrong first where a wrong answer reveals the most. Before each answer, every
  // read and serving still hides everything; each reply reveals its own checkpoint only.
  const steps: [string, Record<string, unknown>, string[]][] = [
    ['CP1', { chosen: wrongOid('CP1') }, ['correct', 'correct_oid', 'explanation']],
    ['CP2', { typed: WRONG.CP2 }, ['correct', 'value']],
    ['CP4', { typed: right(`${INBOX_ID}:CP4`) }, ['correct', 'value']],
    ['CP5', { chosen: correctOid('CP5') }, ['correct', 'correct_oid', 'explanation']],
  ];
  const revealed: string[] = [];
  for (const [cp, body, fields] of steps) {
    const gated = await gatedReplies(app, revealed);
    assert.equal(gated.length, cp === 'CP1' ? 2 : 1, `before ${cp}: the gated replies searched`);
    for (const r of [...await everyPreAnswerResponse(app), ...gated]) assert.deepEqual(leaks(r.body), [], `before ${cp}: ${r.label}`);
    const s = await json(serve(app, INBOX_ID, cp));
    const reply = await answer(app, INBOX_ID, cp, { item_instance_id: s.item_instance_id, ...body });
    assert.equal(reply.status, 200, cp);
    const text = await reply.text();
    revealed.push(`${INBOX_ID}:${cp}`);
    assert.deepEqual(leaks(text, { revealed: [`${INBOX_ID}:${cp}`], fields }), [], `${cp}'s reply reveals its own checkpoint only`);
    const r = JSON.parse(text);
    if (cp === 'CP1' || cp === 'CP5') assert.deepEqual([r.correct_oid, r.explanation], [correctOid(cp), keyOf(INBOX_ID).choices[cp]!.explanation], `${cp}'s reply`);
    else assert.equal(r.value, VALUES[`${INBOX_ID}:${cp}`], `${cp}'s reply`);
  }
  // Answered or not, the reads never carry a key, a value, an explanation or a model text (constraints, S4B-10).
  for (const label of ['the inbox', 'the view']) {
    const body = await (await get(app, label === 'the inbox' ? '/api/cases' : `/api/cases/${INBOX_ID}`)).text();
    assert.deepEqual(leaks(body), [], `${label} after every answer`);
  }
  // The log holds what was typed or chosen, never a truth query, an explanation or a model text.
  const logged = JSON.stringify([...await attempts(d), ...await events(d)]);
  for (const s of SECRETS) assert.ok(!logged.includes(s.text), `the log holds no ${s.label}`);
});

// ---- Checkpoints CP1, CP2, CP4 and CP5 (S4B-07, Review Focus 3) -------------------------------------------------------------

test('a CP1 is served in phase case, answered once, logged as a choice checkpoint attempt, closed, and its key comes back only then', async () => {
  const d = await deps();
  const app = createApp(d);
  const s = await json(serve(app, INBOX_ID, 'CP1'));
  const cp1 = inbox.checkpoints[0]!;
  assert.deepEqual(Object.keys(s).sort(), ['case_id', 'checkpoint', 'item_id', 'item_instance_id', 'options', 'phase', 'prompt', 'shown_order', 'typed']);
  assert.deepEqual([s.case_id, s.checkpoint, s.item_id, s.phase, s.prompt, s.typed], [INBOX_ID, 'CP1', `${INBOX_ID}:CP1`, 'case', cp1.prompt, null]);
  assert.match(s.item_instance_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await attempts(d), [], 'a question served is not logged');
  const r = await json(answer(app, INBOX_ID, 'CP1', { item_instance_id: s.item_instance_id, chosen: correctOid('CP1'), confidence: 4, phase: 'free' }));
  assert.deepEqual(Object.keys(r).sort(), ['attempt_id', 'correct', 'correct_oid', 'error_ids', 'explanation']);
  assert.deepEqual([r.correct, r.correct_oid, r.error_ids], [true, correctOid('CP1'), []]);
  const [a, close, ...rest] = (await attempts(d)).filter((x) => x.item_instance_id === s.item_instance_id);
  assert.deepEqual(rest, []);
  assert.deepEqual([a.record, a.section, a.item_kind, a.item_id, a.phase, a.level, a.outcome, a.is_correct, a.confidence, a.grader_version, a.grading_source, a.submission_no],
    ['attempt', 'sql', 'mcq', `${INBOX_ID}:CP1`, 'case', 1, 'pass', true, 4, 'choice.2', 'auto', 1], 'the serving\'s phase, not the browser\'s');
  assert.deepEqual(a.payload, { kind: 'mcq', shown_order: s.shown_order, chosen: correctOid('CP1') });
  assert.deepEqual([a.concept_ids, a.target_concept_id], [[], FIXTURE_CONCEPT], 'CP1 credits nothing: the target is the first concept its CP3 credits (S2-106)');
  assert.deepEqual([close.record, close.reason, close.item_id, close.phase], ['item_close', 'pass', `${INBOX_ID}:CP1`, 'case']);
  assert.deepEqual(reviews(d, s.item_instance_id), [], 'a CP1 that credits nothing rates no card');
  const again = await answer(app, INBOX_ID, 'CP1', { item_instance_id: s.item_instance_id, chosen: correctOid('CP1') });
  assert.equal(again.status, 409, 'one answer per instance');
  assert.equal((await attempts(d)).filter((x) => x.record === 'attempt').length, 1);
});

test('a second answer sent at the same time as the first gets the 409 too, and only one attempt is logged', async () => {
  const d = await deps();
  const app = createApp(d);
  const s = await json(serve(app, INBOX_ID, 'CP2'));
  const [x, y] = await Promise.all([answer(app, INBOX_ID, 'CP2', { item_instance_id: s.item_instance_id, typed: WRONG.CP2 }),
    answer(app, INBOX_ID, 'CP2', { item_instance_id: s.item_instance_id, typed: right(`${INBOX_ID}:CP2`) })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  assert.equal((await attempts(d)).filter((r) => r.record === 'attempt').length, 1);
});

test('a CP2 and a CP4 are graded as typed numbers against the truth file, and the value comes back after the answer', async () => {
  const d = await deps();
  const app = createApp(d);
  const s = await json(serve(app, INBOX_ID, 'CP2'));
  assert.deepEqual([s.typed, s.options, s.shown_order], [inbox.checkpoints[1]!.typed, null, []]);
  const r = await json(answer(app, INBOX_ID, 'CP2', { item_instance_id: s.item_instance_id, typed: '48 213' }));
  assert.deepEqual(Object.keys(r).sort(), ['attempt_id', 'correct', 'error_ids', 'value']);
  assert.deepEqual([r.correct, r.value, r.error_ids], [true, VALUES[`${INBOX_ID}:CP2`], []]);
  const a = (await attempts(d)).find((x) => x.record === 'attempt');
  assert.deepEqual([a.item_kind, a.item_id, a.concept_ids, a.target_concept_id], ['typed', `${INBOX_ID}:CP2`, [OTHER_CONCEPT], OTHER_CONCEPT]);
  assert.deepEqual(a.payload, { kind: 'mcq', shown_order: [], chosen: null, typed: '48 213' }, 'the text as typed');
  const four = await json(serve(app, INBOX_ID, 'CP4'));
  assert.equal((await json(answer(app, INBOX_ID, 'CP4', { item_instance_id: four.item_instance_id, typed: '9137,6' }))).correct, false, 'beyond half the last decimal');
  const daily = await json(serve(app, DAILY_ID, 'CP4'));
  assert.equal((await json(answer(app, DAILY_ID, 'CP4', { item_instance_id: daily.item_instance_id, typed: '52,917' }))).correct, true, 'a count with a thousands separator');
});

test('Review Focus 3: a reopened checkpoint is a new instance, rated by the checkpoint rule; a value shown makes the next one assisted (S2-105)', async () => {
  const d = await deps({ attempts: primes([OTHER_CONCEPT, FIXTURE_CONCEPT]) });
  const app = createApp(d);
  // CP4 credits the fixture concept: an unassisted first-attempt pass is Good, and so is the next instance's, since no value was shown.
  const ids: string[] = [];
  for (let n = 0; n < 2; n++) {
    const s = await json(serve(app, INBOX_ID, 'CP4'));
    ids.push(s.item_instance_id);
    assert.equal((await json(answer(app, INBOX_ID, 'CP4', { item_instance_id: s.item_instance_id, typed: right(`${INBOX_ID}:CP4`), confidence: 3 }))).correct, true);
    assert.deepEqual(reviews(d, s.item_instance_id), [[`CARD-${FIXTURE_CONCEPT}`, 3]], `CP4 instance ${n + 1}: Good`);
    assert.equal(d.state.current().instances.get(s.item_instance_id)!.countsAsPass, true);
  }
  // CP2 credits the other concept: a wrong answer is Again and shows the value; the reopened CP2 is a new instance, assisted.
  const first = await json(serve(app, INBOX_ID, 'CP2'));
  await answer(app, INBOX_ID, 'CP2', { item_instance_id: first.item_instance_id, typed: WRONG.CP2 });
  assert.deepEqual(reviews(d, first.item_instance_id), [[`CARD-${OTHER_CONCEPT}`, 1]], 'a failed checkpoint: Again for its concept');
  const second = await json(serve(app, INBOX_ID, 'CP2'));
  ids.push(first.item_instance_id, second.item_instance_id);
  assert.equal(new Set(ids).size, 4, 'each serving is a new instance');
  assert.equal((await json(answer(app, INBOX_ID, 'CP2', { item_instance_id: second.item_instance_id, typed: right(`${INBOX_ID}:CP2`) }))).correct, true);
  const mine = (await attempts(d)).filter((x) => x.item_instance_id === second.item_instance_id);
  assert.deepEqual(mine.map((x) => x.record), ['solution_opened', 'attempt', 'item_close'], 'the reveal is logged before the first graded attempt');
  assert.ok(Date.parse(mine[0].ts) < Date.parse(mine[1].submitted_at));
  assert.equal(mine[1].solution_viewed, true);
  assert.deepEqual(reviews(d, second.item_instance_id), [[`CARD-${OTHER_CONCEPT}`, 1]], 'assisted: Again, never Good');
  assert.equal(d.state.current().instances.get(second.item_instance_id)!.countsAsPass, false, 'not a qualifying solve');
  // S4B-08: the assisted pass still counts for the case's status.
  const cp2 = d.state.current().cases.get(INBOX_ID)!.checkpoints.find((c) => c.kind === 'CP2')!;
  assert.deepEqual([cp2.passed, cp2.latest_pass?.instance_id], [true, second.item_instance_id]);
});

test('S2-105 for a CP1 answered twice after its option was shown: the second answer is assisted, and still passes the checkpoint', async () => {
  // This store's CP1 credits the other concept, so its rating shows too.
  const credited = await makeCaseFixture({ ...patch, records: (r) => { patch.records!(r); r.inbox.checkpoints[0].credits_concepts = [OTHER_CONCEPT]; } });
  const store = await loadContent(credited.root, { truthFile: credited.truthFile });
  const d = await deps({ attempts: primes([OTHER_CONCEPT]) }, store);
  const app = createApp(d);
  const first = await json(serve(app, INBOX_ID, 'CP1'));
  const r1 = await json(answer(app, INBOX_ID, 'CP1', { item_instance_id: first.item_instance_id, chosen: wrongOid('CP1') }));
  assert.deepEqual([r1.correct, r1.correct_oid], [false, correctOid('CP1')], 'the wrong answer showed the right option');
  assert.deepEqual(reviews(d, first.item_instance_id), [[`CARD-${OTHER_CONCEPT}`, 1]]);
  const second = await json(serve(app, INBOX_ID, 'CP1'));
  assert.notEqual(second.item_instance_id, first.item_instance_id);
  const r2 = await json(answer(app, INBOX_ID, 'CP1', { item_instance_id: second.item_instance_id, chosen: correctOid('CP1') }));
  assert.equal(r2.correct, true);
  const mine = (await attempts(d)).filter((x) => x.item_instance_id === second.item_instance_id);
  assert.deepEqual(mine.map((x) => x.record), ['solution_opened', 'attempt', 'item_close']);
  assert.deepEqual([mine[0].item_id, mine[0].phase, mine[1].solution_viewed], [`${INBOX_ID}:CP1`, 'case', true]);
  assert.deepEqual(reviews(d, second.item_instance_id), [[`CARD-${OTHER_CONCEPT}`, 1]], 'Again, never Good');
  assert.equal(d.state.current().instances.get(second.item_instance_id)!.countsAsPass, false);
  assert.equal(d.state.current().cases.get(INBOX_ID)!.checkpoints[0]!.passed, true, 'S4B-08: a pass after a reveal passes the checkpoint');
  // A CP5 answered right first shows nobody anything new: its next instance is not assisted.
  for (let n = 0; n < 2; n++) {
    const s = await json(serve(app, INBOX_ID, 'CP5'));
    await answer(app, INBOX_ID, 'CP5', { item_instance_id: s.item_instance_id, chosen: correctOid('CP5') });
    assert.ok(!(await attempts(d)).some((x) => x.item_instance_id === s.item_instance_id && x.record === 'solution_opened'), `CP5 instance ${n + 1}`);
  }
});

test('refusals: an answer that cannot be read, a lapsed or foreign instance, an unknown case or checkpoint, a missing value or key', async () => {
  const d = await deps();
  const app = createApp(d);
  const one = await json(serve(app, INBOX_ID, 'CP1'));
  const two = await json(serve(app, INBOX_ID, 'CP2'));
  for (const body of [{}, { chosen: 'o-not-an-option' }, { chosen: correctOid('CP5') }, { chosen: correctOid('CP1'), shown_order: ['x'] }, { chosen: correctOid('CP1'), confidence: 7 }]) {
    assert.equal((await answer(app, INBOX_ID, 'CP1', { item_instance_id: one.item_instance_id, ...body })).status, 400, JSON.stringify(Object.keys(body)));
  }
  for (const typed of ['', '1e3', 'abc', '4.5']) assert.equal((await answer(app, INBOX_ID, 'CP2', { item_instance_id: two.item_instance_id, typed })).status, 400, 'unreadable');
  assert.equal((await answer(app, INBOX_ID, 'CP2', { item_instance_id: two.item_instance_id })).status, 400);
  assert.equal((await answer(app, INBOX_ID, 'CP2', {})).status, 400, 'no instance named');
  assert.deepEqual((await attempts(d)).filter((x) => x.record === 'attempt'), [], 'a refused answer is not an attempt');
  assert.equal((await answer(app, INBOX_ID, 'CP2', { item_instance_id: 'never-served', typed: '1' })).status, 409, 'never served here');
  assert.equal((await answer(app, INBOX_ID, 'CP4', { item_instance_id: two.item_instance_id, typed: '1' })).status, 400, 'an instance of another checkpoint');
  assert.equal((await answer(app, DAILY_ID, 'CP4', { item_instance_id: two.item_instance_id, typed: '1' })).status, 400, 'an instance of another case');
  for (const [caseId, cp] of [['CASE-NOPE', 'CP1'], [INBOX_ID, 'CP3'], [INBOX_ID, 'CP6'], [INBOX_ID, 'CP9'], [DAILY_ID, 'CP1'], [OPENER_ID, 'CP2']]) {
    assert.equal((await serve(app, caseId!, cp!)).status, 404, `${caseId} ${cp} serve`);
    assert.equal((await answer(app, caseId!, cp!, { item_instance_id: two.item_instance_id, typed: '1' })).status, 404, `${caseId} ${cp} answer`);
  }
  assert.deepEqual((await attempts(d)).filter((x) => x.record === 'attempt'), []);
  // A session end forgets the servings made here (S2-98).
  await d.session.end('explicit');
  assert.equal((await answer(app, INBOX_ID, 'CP2', { item_instance_id: two.item_instance_id, typed: '1' })).status, 409);
  // No truth file: CP2 and CP4 are not served (503); a key without the CP1 choice: CP1 is not served (404).
  const noTruth = createApp(await deps({}, await loadContent(fixture.root)));
  assert.equal((await serve(noTruth, INBOX_ID, 'CP2')).status, 503);
  assert.equal((await serve(noTruth, INBOX_ID, 'CP1')).status, 200, 'a choice needs no truth file');
  const noChoice = await makeCaseFixture({ ...patch, keys: (ks) => { patch.keys!(ks); delete ks.find((k) => k.case_id === INBOX_ID)!.choices.CP1; } });
  const bare = createApp(await deps({}, await loadContent(noChoice.root, { truthFile: noChoice.truthFile })));
  assert.equal((await serve(bare, INBOX_ID, 'CP1')).status, 404);
});

test('the opener CP4 path is an alias of the case route: one serving answers through either', async () => {
  const d = await deps();
  const app = createApp(d);
  const s = await json(post(app, `/api/openers/${OPENER_ID}/cp4/serve`));
  assert.deepEqual(Object.keys(s).sort(), ['case_id', 'item_id', 'item_instance_id', 'phase', 'prompt', 'typed']);
  const r = await json(answer(app, OPENER_ID, 'CP4', { item_instance_id: s.item_instance_id, typed: right(`${OPENER_ID}:CP4`) }));
  assert.deepEqual([r.correct, r.value], [true, VALUES[`${OPENER_ID}:CP4`]]);
  const t = await json(serve(app, OPENER_ID, 'CP4'));
  const viaAlias = await json(post(app, `/api/openers/${OPENER_ID}/cp4/answer`, { item_instance_id: t.item_instance_id, typed: WRONG.CP4 }));
  assert.deepEqual(Object.keys(viaAlias).sort(), ['attempt_id', 'correct', 'error_ids', 'value']);
  assert.equal((await post(app, `/api/openers/${INBOX_ID}/cp4/serve`)).status, 404, 'the alias serves openers only');
});

// ---- The case status (S4B-08, S4B-12) ------------------------------------------------------------------------------------------

test('the inbox status follows replay: new, started, solved with its score, then exported', async () => {
  const cp3 = instance({ id: 'DAILY-CP3', item: 'EX-CASE-DAILY-L1-01', concept: FIXTURE_CONCEPT, phase: 'case', start: '2026-01-05T09:00:00Z',
    steps: [{ at: '2026-01-05T09:02:00Z', submit: 'pass' }] });
  const d = await deps({ attempts: cp3 });
  const app = createApp(d);
  const row = async () => (await json(get(app, '/api/cases'))).find((x: any) => x.case_id === DAILY_ID);
  assert.deepEqual([(await row()).status, (await row()).score, (await row()).checkpoints_passed], ['started', 0.5, 1]);
  const s = await json(serve(app, DAILY_ID, 'CP4'));
  await answer(app, DAILY_ID, 'CP4', { item_instance_id: s.item_instance_id, typed: right(`${DAILY_ID}:CP4`) });
  assert.deepEqual([(await row()).status, (await row()).score], ['solved', 1]);
  const v = await json(get(app, `/api/cases/${DAILY_ID}`));
  assert.deepEqual([v.status, v.score, typeof v.solved_at, v.checkpoints.map((c: any) => [c.kind, c.passed, c.last?.passed])],
    ['solved', 1, 'string', [['CP3', true, true], ['CP4', true, true]]]);
  assert.deepEqual(Object.keys(v.checkpoints[1].last).sort(), ['passed', 'submitted_at'], 'a last result names no answer, option or value');
  await d.logger.event({ event: 'case_export', schema_version: 4, ts: new Date().toISOString(), case_id: DAILY_ID, files: ['x.md', 'x.csv'], data_source: 'Fictional' });
  assert.equal((await row()).status, 'exported');
  assert.deepEqual((await json(get(app, '/api/cases'))).filter((x: any) => x.case_id !== DAILY_ID).map((x: any) => x.status), ['new', 'new']);
});

// ---- Self-checks: plan, plan check, sketch, insight, rubric (S4B-09, S4B-10, S4B-13) --------------------------------------------

const PLAN = { metric_formula: 'average price', output_grain: 'one row per store', tables_and_keys: 'stores', filters: 'open stores', edge_cases: 'missing city',
  expected_row_count: '12' };

test('a plan is logged as a self_check with its six fields; the model plan comes back only in a plan reply sent once CP1 has an answer (S4B-09, S4B-10)', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const bad of [{}, { fields: {} }, { fields: { metric_formula: '  ' } }, { fields: { ...PLAN, extra: 'x' } }, { fields: { ...PLAN, filters: 3 } }, { fields: 'x' }]) {
    assert.equal((await post(app, `/api/cases/${INBOX_ID}/plan`, bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await post(app, '/api/cases/CASE-NOPE/plan', { fields: PLAN })).status, 404);
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['filters'] })).status, 409, 'no plan to check yet');
  assert.deepEqual((await attempts(d)).filter((x) => x.record === 'self_check'), [], 'a refused plan is not logged');
  // Fix round 1: a plan written before CP1 is logged, and its reply is a plain note with no model text.
  const r = await post(app, `/api/cases/${INBOX_ID}/plan`, { fields: { metric_formula: 'average price', filters: 'open stores' } });
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.deepEqual(JSON.parse(text), { note: PLAN_NOTE });
  assert.deepEqual(leaks(text), [], 'no model plan before CP1 has an answer');
  const [sc] = (await attempts(d)).filter((x) => x.record === 'self_check');
  assert.deepEqual({ ...sc, ts: 'ts' }, { record: 'self_check', schema_version: 4, ts: 'ts', session_id: d.session.currentId, kind: 'plan', phase: 'case', case_id: INBOX_ID,
    item_instance_id: null, block_id: null, text: null, fields: { ...Object.fromEntries(Object.keys(PLAN).map((k) => [k, ''])), metric_formula: 'average price', filters: 'open stores' },
    ticked: [] });
  // M3: a plan check needs the model plan shown, not only a plan logged.
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['filters'] })).status, 409, 'the model plan was not shown yet');
  await post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN });
  const v = await json(get(app, `/api/cases/${INBOX_ID}`));
  assert.deepEqual([v.plan.fields, v.status], [PLAN, 'started'], 'the latest plan, and the case is started');
  assert.deepEqual(leaks(JSON.stringify(v)), [], 'the view never carries the model plan');
  // CP1 answered (wrong, so its reply showed the right option). The model plan is still unshown until the plan is sent again.
  const one = await json(serve(app, INBOX_ID, 'CP1'));
  await answer(app, INBOX_ID, 'CP1', { item_instance_id: one.item_instance_id, chosen: wrongOid('CP1') });
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['filters'] })).status, 409, 'CP1 answered, but no reply has shown the model plan');
  const again = await post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN });
  const againText = await again.text();
  assert.deepEqual(JSON.parse(againText), { model_plan: inbox.model_plan }, 'sent again after CP1: the model plan');
  assert.deepEqual(leaks(againText, { fields: ['model_plan'], texts: [`${INBOX_ID} model plan`] }), [], 'the model plan and nothing else');
  assert.equal((await attempts(d)).filter((x) => x.record === 'self_check' && x.kind === 'plan_check').length, 0, 'a refused plan check is not logged');
  // A case that lists no CP1 (the L1 opener, once its sketch is saved: Seams M1) shows its model plan at once, and its plan check
  // is open straight after.
  await post(app, `/api/cases/${OPENER_ID}/sketch`, { fields: { one_row_per: 'store' } });
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/plan`, { fields: PLAN })), { model_plan: opener.model_plan });
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/plan-check`, { ticked: [] })), { ok: true });
  // The plan check: the points ticked as matching the model plan.
  for (const bad of [{}, { ticked: 'filters' }, { ticked: ['nope'] }, { ticked: ['filters', 'filters'] }]) {
    assert.equal((await post(app, `/api/cases/${INBOX_ID}/plan-check`, bad)).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: ['output_grain', 'filters'] })), { ok: true });
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/plan-check`, { ticked: [] })), { ok: true }, 'nothing ticked');
  const checks = (await attempts(d)).filter((x) => x.record === 'self_check' && x.kind === 'plan_check');
  assert.deepEqual(checks.map((x) => [x.phase, x.case_id, x.ticked, x.fields, x.text, x.item_instance_id]),
    [['case', OPENER_ID, [], null, null, null], ['case', INBOX_ID, ['output_grain', 'filters'], null, null, null], ['case', INBOX_ID, [], null, null, null]]);
});

test('Seams M1: an opener with no sketch and no CP3 answer gets a note, not the model plan; after a sketch it gets the model plan', async () => {
  const d = await deps();
  const app = createApp(d);
  const r = await post(app, `/api/cases/${OPENER_ID}/plan`, { fields: PLAN });
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.deepEqual(JSON.parse(text), { note: GRAIN_NOTE });
  assert.deepEqual(leaks(text), [], 'no model plan before the sketch or CP3');
  const plans = () => attempts(d).then((all) => all.filter((x) => x.record === 'self_check' && x.kind === 'plan'));
  assert.deepEqual((await plans()).map((x) => [x.case_id, x.phase, x.fields]), [[OPENER_ID, 'case', PLAN]], 'the plan is still logged');
  assert.equal((await post(app, `/api/cases/${OPENER_ID}/plan-check`, { ticked: [] })).status, 409, 'no reply has shown the model plan');
  // The sketch releases the grain, so the plan sent again now meets the model plan; a plan check counts only from that reply.
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/sketch`, { fields: { one_row_per: 'store', tables: 'stores' } })), { ok: true });
  const sketchedOnly = await post(app, `/api/cases/${OPENER_ID}/plan-check`, { ticked: [] });
  assert.equal(sketchedOnly.status, 409, 'the sketch is saved, but the plan reply before it showed no model plan');
  assert.match((await sketchedOnly.json()).error, /^Send your plan again\./);
  const again = await post(app, `/api/cases/${OPENER_ID}/plan`, { fields: PLAN });
  const againText = await again.text();
  assert.deepEqual(JSON.parse(againText), { model_plan: opener.model_plan }, 'after a sketch: the model plan');
  assert.deepEqual(leaks(againText, { fields: ['model_plan'], texts: [`${OPENER_ID} model plan`] }), [], 'the model plan and nothing else');
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/plan-check`, { ticked: ['output_grain'] })), { ok: true });
  // The day-1 sketch is still the first sketch, written after a plan whose reply held the model plan back.
  assert.deepEqual((await json(get(app, `/api/cases/${OPENER_ID}`))).sketch.fields, { one_row_per: 'store', tables: 'stores', metric: '' });
});

test('Seams M1: an opener\'s CP3 answer releases its model plan as a sketch does; a non-opener with no CP1 is unchanged', async () => {
  const cp3 = instance({ id: 'OPENER-CP3', item: 'EX-OPENER-L1-01', concept: FIXTURE_CONCEPT, phase: 'case', start: '2026-01-05T09:00:00Z',
    steps: [{ at: '2026-01-05T09:02:00Z', submit: 'fail' }] });
  const d = await deps({ attempts: cp3 });
  const app = createApp(d);
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/plan`, { fields: PLAN })), { model_plan: opener.model_plan }, 'CP3 answered, no sketch');
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/plan-check`, { ticked: [] })), { ok: true });
  // The daily case lists no CP1 and is no opener: its model plan comes at once, with no sketch and no CP3.
  const fresh = createApp(await deps());
  assert.deepEqual(await json(post(fresh, `/api/cases/${DAILY_ID}/plan`, { fields: PLAN })), { model_plan: content.case!(DAILY_ID)!.model_plan });
  assert.deepEqual(await json(post(fresh, `/api/cases/${DAILY_ID}/plan-check`, { ticked: [] })), { ok: true });
});

test('a plan or an insight written first never makes its CP1 or CP5 assisted (fix round 1)', async () => {
  // This store's CP1 credits the other concept, so its rating shows too.
  const credited = await makeCaseFixture({ ...patch, records: (r) => { patch.records!(r); r.inbox.checkpoints[0].credits_concepts = [OTHER_CONCEPT]; } });
  const store = await loadContent(credited.root, { truthFile: credited.truthFile });
  const d = await deps({ attempts: primes([OTHER_CONCEPT]) }, store);
  const app = createApp(d);
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN })), { note: PLAN_NOTE });
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/insight`, { text: 'An insight written first.' })), { note: INSIGHT_NOTE });
  for (const [cp, chosen] of [['CP1', correctOid('CP1')], ['CP5', correctOid('CP5')]] as const) {
    const s = await json(serve(app, INBOX_ID, cp));
    assert.equal((await json(answer(app, INBOX_ID, cp, { item_instance_id: s.item_instance_id, chosen, confidence: 3 }))).correct, true, cp);
    const mine = (await attempts(d)).filter((x) => x.item_instance_id === s.item_instance_id);
    assert.deepEqual(mine.map((x) => x.record), ['attempt', 'item_close'], `${cp}: no reveal logged`);
    assert.equal(mine[0].solution_viewed, false, cp);
    assert.equal(d.state.current().instances.get(s.item_instance_id)!.countsAsPass, true, `${cp}: a counted pass`);
  }
  const cp1 = (await attempts(d)).find((x) => x.record === 'attempt' && x.item_id === `${INBOX_ID}:CP1`)!;
  assert.deepEqual(reviews(d, cp1.item_instance_id), [[`CARD-${OTHER_CONCEPT}`, 3]], 'CP1 after a plan written first: Good');
  // Sent again now that CP1 and CP5 have answers, the replies carry the model texts.
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/plan`, { fields: PLAN })), { model_plan: store.case!(INBOX_ID)!.model_plan });
  assert.deepEqual(Object.keys(await json(post(app, `/api/cases/${INBOX_ID}/insight`, { text: 'An insight.' }))).sort(), ['model_answer', 'rubric']);
});

test('an insight is logged; the filled model answer and the rubric come back once CP5 has an answer, with a number blank until its checkpoint has one (S4B-10)', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const bad of [{}, { text: '   ' }, { text: 7 }]) assert.equal((await post(app, `/api/cases/${INBOX_ID}/insight`, bad)).status, 400);
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/rubric`, { ticked: ['number'] })).status, 409, 'no insight to score yet');
  const insight = async () => {
    const r = await post(app, `/api/cases/${INBOX_ID}/insight`, { text: 'Sales rose. The season may explain part of it.' });
    assert.equal(r.status, 200);
    const text = await r.text();
    return { text, body: JSON.parse(text) };
  };
  // Fix round 1: before CP5 has an answer the insight is logged, and its reply is a plain note: no model answer, no rubric.
  const gated = await insight();
  assert.deepEqual(gated.body, { note: INSIGHT_NOTE });
  assert.deepEqual(leaks(gated.text), [], 'no model answer before CP5 has an answer');
  // M3: the rubric needs the model answer shown, not only an insight logged.
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/rubric`, { ticked: ['number'] })).status, 409, 'the model answer was not shown yet');
  const five = await json(serve(app, INBOX_ID, 'CP5'));
  await answer(app, INBOX_ID, 'CP5', { item_instance_id: five.item_instance_id, chosen: wrongOid('CP5') });
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/rubric`, { ticked: ['number'] })).status, 409, 'CP5 answered, but no reply has shown the model answer');
  // Sent again after CP5: the model answer, CP2 and CP4 still blank.
  const before = await insight();
  assert.deepEqual(Object.keys(before.body).sort(), ['model_answer', 'rubric']);
  assert.equal(before.body.model_answer, 'An invented model answer marker: (answer CP2 to see this number) stores, (answer CP4 to see this number) euros on average.');
  const ownAnswer = [`${INBOX_ID} model answer`];
  assert.deepEqual(leaks(before.text, { fields: ['model_answer'], texts: ownAnswer }), [], 'no value before any answer');
  assert.deepEqual(before.body.rubric.map((p: any) => p.id), ['number', 'direction', 'caveat', 'next_step', 'driver']);
  // CP2 answered wrong: its value is filled in; CP4 still reads as blank.
  const two = await json(serve(app, INBOX_ID, 'CP2'));
  await answer(app, INBOX_ID, 'CP2', { item_instance_id: two.item_instance_id, typed: WRONG.CP2 });
  const mid = await insight();
  assert.equal(mid.body.model_answer, `An invented model answer marker: ${right(`${INBOX_ID}:CP2`)} stores, (answer CP4 to see this number) euros on average.`);
  assert.deepEqual(leaks(mid.text, { fields: ['model_answer'], revealed: [`${INBOX_ID}:CP2`], texts: ownAnswer }), [], 'CP4 stays blank');
  const four = await json(serve(app, INBOX_ID, 'CP4'));
  await answer(app, INBOX_ID, 'CP4', { item_instance_id: four.item_instance_id, typed: WRONG.CP4 });
  const after = await insight();
  assert.equal(after.body.model_answer, `An invented model answer marker: ${right(`${INBOX_ID}:CP2`)} stores, ${right(`${INBOX_ID}:CP4`)} euros on average.`);
  const logged = (await attempts(d)).filter((x) => x.record === 'self_check' && x.kind === 'insight');
  assert.deepEqual(logged.map((x) => [x.phase, x.text, x.fields, x.ticked, x.item_instance_id]), Array(4).fill(['case', 'Sales rose. The season may explain part of it.', null, [], null]));
  const v = await json(get(app, `/api/cases/${INBOX_ID}`));
  assert.equal(v.insight.text, 'Sales rose. The season may explain part of it.');
  assert.deepEqual(leaks(JSON.stringify(v)), [], 'the view never carries the model answer');
  // The rubric: the points ticked.
  for (const bad of [{ ticked: ['nope'] }, { ticked: 'number' }]) assert.equal((await post(app, `/api/cases/${INBOX_ID}/rubric`, bad)).status, 400);
  assert.deepEqual(await json(post(app, `/api/cases/${INBOX_ID}/rubric`, { ticked: ['number', 'caveat'] })), { ok: true });
  const rubric = (await attempts(d)).filter((x) => x.record === 'self_check' && x.kind === 'rubric');
  assert.deepEqual(rubric.map((x) => [x.phase, x.ticked, x.text, x.fields]), [['case', ['number', 'caveat'], null, null]]);
  // A case that lists no CP5 (the daily case) shows its filled model answer and the rubric at once; its rubric is open straight after.
  const daily = await json(post(app, `/api/cases/${DAILY_ID}/insight`, { text: 'Counts held steady.' }));
  assert.deepEqual([daily.model_answer, daily.rubric.length], ['Daily answer: an invented marker, (answer CP4 to see this number).', 5]);
  assert.deepEqual(await json(post(app, `/api/cases/${DAILY_ID}/rubric`, { ticked: [] })), { ok: true });
});

test('an opener\'s sketch is logged in phase opener_preview; the first is the day-1 sketch, and it releases the grain and the data needed (S4B-13)', async () => {
  const d = await deps();
  const app = createApp(d);
  const grain = async (caseId: string) => (await json(get(app, `/api/cases/${caseId}`))).expected_output.grain;
  const dataNeeded = async (caseId: string) => (await json(get(app, `/api/cases/${caseId}`))).data_needed;
  assert.deepEqual([await grain(OPENER_ID), await grain(INBOX_ID), await grain(DAILY_ID)], [null, null, opener.expected_output.grain],
    'held back while it answers the sketch or a CP1; a daily case has neither');
  // Fix round 1: an opener's data needed (its "which tables") follows its grain's rule; other cases always show theirs.
  assert.deepEqual([await dataNeeded(OPENER_ID), await dataNeeded(INBOX_ID), await dataNeeded(DAILY_ID)], [null, inbox.data_needed, content.case!(DAILY_ID)!.data_needed],
    'an opener holds its data needed back until the sketch');
  const SKETCH = { one_row_per: 'store', tables: 'stores', metric: 'count' };
  for (const bad of [{}, { fields: { one_row_per: '' } }, { fields: { ...SKETCH, other: 'x' } }]) assert.equal((await post(app, `/api/cases/${OPENER_ID}/sketch`, bad)).status, 400);
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/sketch`, { fields: SKETCH })).status, 404, 'only an opener has a sketch');
  assert.deepEqual(await json(post(app, `/api/cases/${OPENER_ID}/sketch`, { fields: SKETCH })), { ok: true });
  await post(app, `/api/cases/${OPENER_ID}/sketch`, { fields: { one_row_per: 'city' } });
  const sketches = (await attempts(d)).filter((x) => x.record === 'self_check' && x.kind === 'sketch');
  assert.deepEqual(sketches.map((x) => [x.phase, x.case_id, x.item_instance_id, x.text, x.ticked]), Array(2).fill(['opener_preview', OPENER_ID, null, null, []]));
  assert.deepEqual(sketches[1].fields, { one_row_per: 'city', tables: '', metric: '' });
  const v = await json(get(app, `/api/cases/${OPENER_ID}`));
  assert.deepEqual([v.sketch.fields, v.expected_output.grain, v.status], [SKETCH, opener.expected_output.grain, 'started'], 'the day-1 sketch is the first');
  assert.deepEqual(v.data_needed, opener.data_needed, 'the sketch releases the data needed with the grain');
  // An inbox case's grain comes once its CP1 has an answer (the reply showed the right option anyway).
  const one = await json(serve(app, INBOX_ID, 'CP1'));
  await answer(app, INBOX_ID, 'CP1', { item_instance_id: one.item_instance_id, chosen: wrongOid('CP1') });
  assert.equal(await grain(INBOX_ID), inbox.expected_output.grain);
});

test('an opener\'s grain and data needed also come once its CP3 has an answer', async () => {
  const cp3 = instance({ id: 'OPENER-CP3', item: 'EX-OPENER-L1-01', concept: FIXTURE_CONCEPT, phase: 'case', start: '2026-01-05T09:00:00Z',
    steps: [{ at: '2026-01-05T09:02:00Z', submit: 'fail' }] });
  const app = createApp(await deps({ attempts: cp3 }));
  const v = await json(get(app, `/api/cases/${OPENER_ID}`));
  assert.deepEqual([v.expected_output.grain, v.data_needed], [opener.expected_output.grain, opener.data_needed]);
});

test('a self_check never names an instance, so it never closes, reopens or moves a checkpoint instance (B1 review Q4)', async () => {
  const d = await deps();
  const app = createApp(d);
  const s = await json(serve(app, INBOX_ID, 'CP2'));
  await answer(app, INBOX_ID, 'CP2', { item_instance_id: s.item_instance_id, typed: WRONG.CP2 });
  // The opener lists no CP1 or CP5, so once its sketch is saved (Seams M1) its plan and insight replies show the model texts and
  // its plan check and rubric are open.
  await post(app, `/api/cases/${OPENER_ID}/sketch`, { fields: { one_row_per: 'store' } });
  await post(app, `/api/cases/${OPENER_ID}/plan`, { fields: PLAN });
  await post(app, `/api/cases/${OPENER_ID}/plan-check`, { ticked: ['filters'] });
  await post(app, `/api/cases/${OPENER_ID}/insight`, { text: 'An insight.' });
  await post(app, `/api/cases/${OPENER_ID}/rubric`, { ticked: [] });
  const all = await attempts(d);
  const checks = all.filter((x) => x.record === 'self_check');
  assert.deepEqual(checks.map((x) => x.kind), ['sketch', 'plan', 'plan_check', 'insight', 'rubric']);
  assert.ok(checks.every((x) => x.item_instance_id === null && x.block_id === null));
  assert.deepEqual([...loggedInstanceIds(checks)], [], 'a restart closes no instance for them');
  // Startup recovery of the CP2 instance as if its close were lost: the self-checks after it change nothing.
  const attempt = all.find((x) => x.record === 'attempt');
  const open = all.filter((x) => x.record !== 'item_close');
  const ends = new Map([[attempt.session_id as string, new Date(Date.parse(attempt.submitted_at) + 1).toISOString()]]);
  const withChecks = recoveredCloses(open, ends, await events(d));
  assert.deepEqual(withChecks, recoveredCloses(open.filter((x) => x.record !== 'self_check'), ends, await events(d)));
  assert.deepEqual(withChecks.map((x) => x.item_instance_id), [s.item_instance_id]);
});

// ---- CP3 through /api/serve (S4B-07, S2-39, Review Focus 3) -------------------------------------------------------------------

test('/api/serve purpose case serves a case\'s CP3 item in phase case with its labels hidden, and logs nothing', async () => {
  const d = await deps();
  const app = createApp(d);
  const r = await json(post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: INBOX_ID }));
  assert.deepEqual(r, { item_id: 'EX-CASE-PRICE-01', item_instance_id: r.item_instance_id, phase: 'case', block_id: null, repeat_exposure: false, hide_labels: true });
  assert.equal((await json(post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: OPENER_ID }))).item_id, 'EX-OPENER-L1-01', 'an opener too');
  assert.equal((await json(post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: DAILY_ID }))).item_id, 'EX-CASE-DAILY-L1-01');
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'case' })).status, 400, 'a case must be named');
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: 'CASE-NOPE' })).status, 404);
  assert.equal((await post(app, '/api/serve', { section: 'ga4', purpose: 'case', case_id: INBOX_ID })).status, 404);
  assert.deepEqual(await attempts(d), [], 'serving logs nothing');
  // The serving's phase is the server's: the browser's 'free' does not replace it.
  await post(app, '/api/item-close', { item_id: 'EX-CASE-PRICE-01', item_instance_id: r.item_instance_id, reason: 'left', phase: 'free' });
  const [close] = await attempts(d);
  assert.deepEqual([close.record, close.item_id, close.phase, close.block_id], ['item_close', 'EX-CASE-PRICE-01', 'case', null]);
});

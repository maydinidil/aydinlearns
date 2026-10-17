// tests/server/tutor-routes.test.ts: the tutor's routes (spec §4, §7, §10, §12) on the content fixture with scripted models; nothing reaches
// the network. A refusal calls no model and logs nothing, except the cap, which logs `capped`. A question streams its reply, ends with the
// summary line and writes one tutor_asked record with counts only. Review Focus 2 (the learner leaves mid-reply), 3 (two questions near
// the cap) and 5 (a session end mid-reply) are here, and so are Review Focus 4's redaction through the route, the whole-reply deadline
// (T-15), the hidden labels of a served phase (T-16), kept once the instance closes or when the browser's phase hides them (I1), the timed
// run's closed tutor (D94) and the cap setting (T-06). Block P (T-20 to T-23): the status shape, the model and effort built per question
// from Settings and the key store, the token limit by effort, no reservation without a daily limit, the new settings and their checks,
// POST /api/tutor/keys, a model whose provider has no key, and the switch turned off while a reply streams. Keys are invented strings
// in a memory store or a temporary tutor-keys.json.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, settingsFromEvents, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import type { DrillSpec } from '../../server/drill.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { SettingChange } from '../../core/events.ts';
import { AttemptLogger } from '../../server/log.ts';
import { Servings } from '../../server/servings.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { SUMMARY_MARK, TUTOR_KEY_PATH, type TutorStatusView } from '../../schemas/tutor.ts';
import type { TutorRuntime } from '../../server/routes/tutor.ts';
import { TutorKeys } from '../../server/tutor/keys.ts';
import { offlineLine } from '../../server/tutor/providers/errors.ts';
import { fakeModel } from '../../server/tutor/providers/fake.ts';
import { TUTOR_PROMPT_VERSION } from '../../server/tutor/prompt.ts';
import { SpendLedger } from '../../server/tutor/spend.ts';
import { TutorFailure, type KeyProvider, type ModelChoice, type TutorDone, type TutorModel, type TutorModelInput } from '../../server/tutor/types.ts';
import { FIXTURE_CONCEPT, makeContentFixture } from '../helpers/content-fixture.ts';

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const tmp = async (prefix = 'al-tutor-') => { const d = await mkdtemp(join(tmpdir(), prefix)); made.push(d); return d; };
const content = await loadContent(await makeContentFixture().then((d) => { made.push(d); return d; }));
const ITEM = content.lesson(FIXTURE_CONCEPT)!.pool_item_ids[0]!;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const QUESTION = 'Why is my query wrong? (an invented question marker)';
const ask = (over: object = {}) => ({ screen: 'item', subject_id: ITEM, snapshot: 'Exercise status: not passed\nYour query:\nSELECT 1',
  item: { item_id: ITEM, item_instance_id: 'I-1', phase: 'free' }, thread: [], question: QUESTION, ...over });
/** A stream test that regresses fails here instead of hanging the suite. */
const STREAM = { timeout: 10_000 };
const USAGE = { input_tokens: 1000, cache_write_tokens: 0, cached_input_tokens: 0, output_tokens: 200 };

/** The fixture store with a level 1 drill whose one exercise is ITEM served as a drill item, so a live rep can start (as journey-routes). */
const drillItem = { ...content.item(ITEM)!, use: 'drill' as const };
const DRILL: DrillSpec = { level: 1, questions: 1, minutes: 10, pass_pct: 100, concepts: [FIXTURE_CONCEPT], unseen_min_pct: 0, mode: 'normal',
  pool_item_ids: [drillItem.id] };
const withDrill: ContentStore & { drills(): DrillSpec[] } = { ...content, item: (id) => (id === drillItem.id ? drillItem : content.item(id)), drills: () => [DRILL] };

/** A model that yields `pieces` (waiting for `gate` after the first, when given), then returns or throws; it records every input. */
function scripted(pieces: string[], o: { gate?: (input: TutorModelInput) => Promise<void>; fail?: TutorFailure; model?: string; end?: TutorDone['end'] } = {}) {
  const seen: TutorModelInput[] = [];
  const model: TutorModel = {
    provider: 'claude', model: o.model ?? 'claude-haiku-5-5',
    async *ask(input): AsyncGenerator<string, TutorDone, void> {
      seen.push(input);
      for (const [i, p] of pieces.entries()) { yield p; if (i === 0 && o.gate) await o.gate(input); }
      if (o.fail) throw o.fail;
      return { end: o.end ?? 'done', usage: USAGE };
    },
  };
  return { model, seen };
}
/**
 * N8: a model that behaves as the real providers do on an abort (fakeModel only stops and returns `done`): it yields `pieces`, then
 * waits, and throws a TutorFailure once its signal aborts. It never finishes on its own.
 */
function untilAborted(pieces: string[]) {
  const seen: TutorModelInput[] = [];
  const model: TutorModel = {
    provider: 'claude', model: 'claude-haiku-5-5',
    async *ask(input): AsyncGenerator<string, TutorDone, void> {
      seen.push(input);
      for (const p of pieces) yield p;
      await new Promise<void>((_, fail) => {
        const stop = (): void => fail(new TutorFailure('offline', offlineLine('claude')));
        if (input.signal!.aborted) stop(); else input.signal!.addEventListener('abort', stop, { once: true });
      });
      return { end: 'done', usage: USAGE };
    },
  };
  return { model, seen };
}
const CLAUDE_KEY = 'sk-ant-test-routes-000000000000000';
const OPENAI_KEY = 'sk-test-routes-00000000000000000';
type Runtime = TutorRuntime & { chosen: ModelChoice[]; keys: TutorKeys };
/**
 * A runtime whose model is `model` whatever Settings chose (null: none can be built); `chosen` records what each question asked for.
 * The key store holds a Claude start key unless `start` says otherwise (a null model: no key), in memory, or in `file`.
 */
async function runtime(model: TutorModel | null, ledger = new SpendLedger(),
  o: { start?: Partial<Record<KeyProvider, string>>; fake?: boolean; file?: string; replyDeadlineMs?: number } = {}): Promise<Runtime> {
  const keys = await TutorKeys.open(o.file ?? null, o.start ?? (model ? { claude: CLAUDE_KEY } : {}));
  const chosen: ModelChoice[] = [];
  const modelFor = async (c: ModelChoice): Promise<TutorModel> => { chosen.push(c); if (!model) throw new Error('no model'); return model; };
  return { keys, fake: o.fake ?? false, ledger, modelFor, chosen, ...(o.replyDeadlineMs ? { replyDeadlineMs: o.replyDeadlineMs } : {}) };
}

async function deps(tutorIn?: TutorRuntime | Promise<TutorRuntime>, settings: Partial<AppDeps['settings']> = {}, over: Partial<AppDeps> = {}) {
  const tutor = await tutorIn;
  const store = over.content ?? content;
  const dir = await tmp('al-tutor-log-');
  const logger = new AttemptLogger(openJsonlLog(dir));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  if (tutor) logger.onWrite((file, r) => { if (file === 'attempts') tutor.ledger.note(r); });
  const d: AppDeps = { port: 5174, checks: [], runner: null, content: store, logger, endHooks, state,
    session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null, ...settings }, tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell',
    ...(tutor ? { tutor } : {}), ...over };
  return { d, dir, logger };
}
async function records(dir: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const f of await readdir(dir)) if (f.startsWith('attempts')) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  return out;
}
const split = (body: string) => { const at = body.lastIndexOf(SUMMARY_MARK); return { reply: body.slice(0, at), summary: JSON.parse(body.slice(at + 1)) }; };
/** The rest of a stream that was read in part, as text. */
async function rest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const text = new TextDecoder();
  let out = '';
  for (let n = await reader.read(); !n.done; n = await reader.read()) out += text.decode(n.value, { stream: true });
  return out + text.decode();
}

/** Every model Settings offers, as the status lists it, with whether each provider has a key. */
const modelsView = (claude: boolean, openai: boolean): TutorStatusView['models'] => [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'claude', input_usd: 0.1, output_usd: 0.5, available: claude },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'claude', input_usd: 2, output_usd: 10, available: claude },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'claude', input_usd: 4, output_usd: 20, available: claude },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai', input_usd: 0.1, output_usd: 0.5, available: openai },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai', input_usd: 2, output_usd: 10, available: openai },
];
const status = async (app: Hono): Promise<TutorStatusView> => (await get(app, '/api/tutor/status')).json() as Promise<TutorStatusView>;

test("status (block P): on or off and why, the switch, model and effort, each model with its price and whether it can be picked, each key's source, the spend and the limit", async () => {
  assert.deepEqual(await status(createApp((await deps()).d)), { enabled: false, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium',
    reason: 'The tutor is off.', models: modelsView(false, false), keys: [{ provider: 'claude', source: null }, { provider: 'openai', source: null }],
    spent_today_usd: 0, cap_usd: 1, run_on: false });
  assert.deepEqual(await status(createApp((await deps(runtime(scripted(['x']).model), { tutor_daily_cap_usd: 2 })).d)), { enabled: true, switched_on: true,
    provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: null, models: modelsView(true, false),
    keys: [{ provider: 'claude', source: 'env' }, { provider: 'openai', source: null }], spent_today_usd: 0, cap_usd: 2, run_on: false });
  const noKey = await status(createApp((await deps(runtime(null), { tutor_model: 'gpt-6.1-sol', tutor_effort: 'high', tutor_daily_cap_usd: 'none' })).d));
  assert.deepEqual(noKey, { enabled: false, switched_on: true, provider: 'openai', model: 'gpt-6.1-sol', effort: 'high',
    reason: 'GPT-6.1 Sol needs an OpenAI key. Add one in Settings to turn the tutor on.', models: modelsView(false, false),
    keys: [{ provider: 'claude', source: null }, { provider: 'openai', source: null }], spent_today_usd: 0, cap_usd: null, run_on: false });
  const both = { start: { claude: CLAUDE_KEY, openai: OPENAI_KEY } };
  const off = await status(createApp((await deps(runtime(scripted(['x']).model, undefined, both), { tutor_enabled: false })).d));
  assert.deepEqual([off.enabled, off.switched_on, off.reason, off.models.every((m) => m.available)], [false, false, 'The tutor is switched off in Settings.', true]);
});

test('T-23: with the fake test hook every model can be picked and the fake answers, with no key; the status says fake', async () => {
  const rt = runtime(fakeModel(), undefined, { start: {}, fake: true });
  const { d, dir } = await deps(rt, { tutor_model: 'gpt-6-luna', tutor_effort: 'low' });
  const app = createApp(d);
  const s = await status(app);
  assert.deepEqual([s.enabled, s.provider, s.model, s.effort, s.reason, s.models.every((m) => m.available), s.keys.map((k) => k.source)],
    [true, 'fake', 'gpt-6-luna', 'low', null, true, [null, null]]);
  assert.equal(split(await (await post(app, '/api/tutor/ask', ask())).text()).summary.outcome, 'answered');
  assert.deepEqual((await rt).chosen, [{ provider: 'fake', model: 'gpt-6-luna', effort: 'low' }]);
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => [r.provider, r.model, r.effort, r.cost_usd]), [['fake', 'fake', 'low', 0]]);
});

test('status starts no study session (T-12)', async () => {
  const { d } = await deps(runtime(scripted(['x']).model));
  assert.equal((await get(createApp(d), '/api/tutor/status')).status, 200);
  assert.equal(d.session.currentId, null);
});

test('a question streams its reply and a summary, writes one record with counts only, and opens the item as a hint does', async () => {
  const { model, seen } = scripted(['Look at ', 'the WHERE clause', ' a\u001eb.']);
  const { d, dir } = await deps(runtime(model));
  const app = createApp(d);
  const res = await post(app, '/api/tutor/ask', ask({ thread: [{ question: 'Earlier?', reply: 'Earlier reply.' }] }));
  assert.equal(res.status, 200);
  const { reply, summary } = split(await res.text());
  assert.equal(reply, 'Look at the WHERE clause ab.', 'the summary mark is dropped from the model text (T-08)');
  assert.deepEqual(summary, { outcome: 'answered', message: null, cost_usd: 0.0002, spent_today_usd: 0.0002, cap_usd: 1, counted: true });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0]!.turns, [{ role: 'user', text: 'Earlier?' }, { role: 'assistant', text: 'Earlier reply.' }]);
  assert.ok(seen[0]!.question.includes('<course>') && seen[0]!.question.includes(QUESTION));
  const recs = await records(dir);
  const asked = recs.filter((r) => r.record === 'tutor_asked');
  assert.equal(asked.length, 1);
  assert.deepEqual({ ...asked[0], ts: 'T', session_id: 'S' }, { record: 'tutor_asked', schema_version: 6, ts: 'T', session_id: 'S', screen: 'item',
    item_instance_id: 'I-1', item_id: ITEM, target_concept_id: content.item(ITEM)!.target_concept_id, phase: 'free', provider: 'claude', model: 'claude-haiku-5-5',
    effort: 'medium', prompt_version: TUTOR_PROMPT_VERSION, input_tokens: 1000, cached_input_tokens: 0, output_tokens: 200, cost_usd: 0.0002, outcome: 'answered' });
  assert.ok(!JSON.stringify(recs).includes('invented question marker'), 'no question text in the log');
  assert.equal((await post(app, '/api/session-end', {})).status, 200);
  const close = (await records(dir)).find((r) => r.record === 'item_close' && r.item_instance_id === 'I-1');
  assert.equal(close?.reason, 'session_end', 'the question opened the instance, so the session end closed it');
});

test('refusals come before any call and log nothing: off, an unknown screen, an empty question, an oversized snapshot', async () => {
  const off = await post(createApp((await deps()).d), '/api/tutor/ask', ask());
  assert.deepEqual([off.status, (await off.json()).code], [404, 'tutor_off']);
  const { model, seen } = scripted(['x']);
  const { d, dir } = await deps(runtime(model));
  const app = createApp(d);
  assert.equal((await post(app, '/api/tutor/ask', ask({ screen: 'nowhere' }))).status, 400);
  assert.equal((await post(app, '/api/tutor/ask', ask({ question: '   ' }))).status, 400);
  assert.equal((await post(app, '/api/tutor/ask', ask({ snapshot: 'x'.repeat(32_001) }))).status, 413);
  assert.equal(seen.length, 0);
  assert.equal((await records(dir)).filter((r) => r.record === 'tutor_asked').length, 0);
});

test("the day's cap: a question that could pass it is refused before any call and logged as capped", async () => {
  const ledger = new SpendLedger([{ record: 'tutor_asked', ts: new Date().toISOString(), cost_usd: 0.05 }]);
  const { model, seen } = scripted(['x']);
  const { d, dir } = await deps(runtime(model, ledger), { tutor_daily_cap_usd: 0.05 });
  const res = await post(createApp(d), '/api/tutor/ask', ask());
  assert.deepEqual([res.status, await res.json()], [429, { error: "Today's tutor budget is used up. It resets tomorrow, or raise it in Settings.", code: 'capped' }]);
  assert.equal(seen.length, 0);
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => [r.outcome, r.cost_usd, r.output_tokens]), [['capped', 0, 0]]);
});

test('Review Focus 3: two questions at once near the cap: the one in flight holds its worst cost, so the other is capped; its end frees the rest', STREAM, async () => {
  // claude-opus-5-5's worst cost at low effort is about $0.09 (4,096 output tokens at $20 a million), so one fits under a $0.15 cap and two do not.
  let release = (): void => {};
  const held = new Promise<void>((done) => { release = done; });
  const { model, seen } = scripted(['Part one. ', 'Part two.'], { gate: () => held, model: 'claude-opus-5-5' });
  const ledger = new SpendLedger();
  const { d, dir } = await deps(runtime(model, ledger), { tutor_daily_cap_usd: 0.15, tutor_model: 'claude-opus-5-5', tutor_effort: 'low' });
  const app = createApp(d);
  const first = (await post(app, '/api/tutor/ask', ask())).body!.getReader();
  await first.read();
  const second = await post(app, '/api/tutor/ask', ask());
  assert.deepEqual([second.status, (await second.json()).code], [429, 'capped']);
  assert.equal(seen.length, 1, 'the capped question called no model');
  release();
  const { summary } = split(await rest(first));
  assert.deepEqual([summary.outcome, summary.cost_usd, summary.spent_today_usd, summary.cap_usd], ['answered', 0.008, 0.008, 0.15]);
  const third = split(await (await post(app, '/api/tutor/ask', ask())).text());
  assert.equal(third.summary.outcome, 'answered', 'the first reply is done, so its reservation is free again');
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['capped', 'answered', 'answered']);
  assert.ok(ledger.spentOn(new Date()) <= 0.15);
});

test('a failure gives its line in the summary and logs error; a model refusal logs refused; neither counts as help', async () => {
  const failing = scripted([], { fail: new TutorFailure('busy', 'The tutor is busy. Try again in a minute.') });
  const a = await deps(runtime(failing.model));
  const r1 = split(await (await post(createApp(a.d), '/api/tutor/ask', ask())).text());
  assert.deepEqual([r1.reply, r1.summary.outcome, r1.summary.message, r1.summary.counted], ['', 'error', 'The tutor is busy. Try again in a minute.', false]);
  const declining: TutorModel = { provider: 'claude', model: 'claude-haiku-5-5', async *ask(): AsyncGenerator<string, TutorDone, void> { return { end: 'refused', usage: USAGE }; } };
  const b = await deps(runtime(declining));
  const r2 = split(await (await post(createApp(b.d), '/api/tutor/ask', ask())).text());
  assert.deepEqual([r2.summary.outcome, r2.summary.message, r2.summary.counted], ['refused', 'The tutor could not answer this one.', false]);
  assert.deepEqual((await records(b.dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['refused']);
});

test('Review Focus 2: the learner leaves mid-reply: the call is cancelled, one record is written, the reservation is released', STREAM, async () => {
  const ledger = new SpendLedger();
  const { model, seen } = untilAborted(['Part ']);
  const { d, dir, logger } = await deps(runtime(model, ledger), { tutor_daily_cap_usd: 0.05 });
  const written = new Promise<void>((done) => logger.onWrite((_f, r) => { if ((r as { record?: string }).record === 'tutor_asked') done(); }));
  const res = await post(createApp(d), '/api/tutor/ask', ask());
  const reader = res.body!.getReader();
  await reader.read();
  await reader.cancel();
  await written;
  assert.equal(seen[0]!.signal!.aborted, true, 'the call was cancelled');
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['error']);
  assert.ok(ledger.reserve(0.05, 0.05, new Date()), 'the whole cap is free again: the reservation was released');
});

test('T-15: a reply that runs past the whole-reply deadline is cut: an error summary, one record, the reservation released', STREAM, async () => {
  const ledger = new SpendLedger();
  const { model } = untilAborted(['Part ']);
  const { d, dir } = await deps(runtime(model, ledger, { replyDeadlineMs: 50 }), { tutor_daily_cap_usd: 0.05 });
  const { reply, summary } = split(await (await post(createApp(d), '/api/tutor/ask', ask())).text());
  assert.equal(reply, 'Part ');
  // Review T3 M4: the deadline cut a reply that had started, so the line is the cut-off one, not the provider's "can't reach".
  assert.deepEqual([summary.outcome, summary.message, summary.counted], ['error', 'The reply was cut off.', false]);
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['error']);
  assert.ok(ledger.reserve(0.05, 0.05, new Date()), "today's reserved spend is back to what it was");
});

test('a model that returns normally after its signal aborts (the fake) is still logged as error, never answered (T10 smoke tu-4)', STREAM, async () => {
  const ledger = new SpendLedger();
  const { d, dir } = await deps(runtime(fakeModel({ delayMs: 30 }), ledger, { replyDeadlineMs: 50 }), { tutor_daily_cap_usd: 0.05 });
  const { summary } = split(await (await post(createApp(d), '/api/tutor/ask', ask())).text());
  assert.deepEqual([summary.outcome, summary.counted], ['error', false], 'an aborted reply is not an answer');
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['error']);
  assert.ok(ledger.reserve(0.05, 0.05, new Date()), "today's reserved spend is back to what it was");
});

test('review T3 M4: the deadline before any text shows the busy line, after text the cut-off line; never "can\'t reach"', STREAM, async () => {
  // A model that throws on the abort (as the real providers do) and one that returns normally on it (the fake), each silent until the
  // deadline, then each after one piece of text.
  const silentFake = fakeModel({ delayMs: 200 });
  const cases: [name: string, model: TutorModel, reply: string, message: string][] = [
    ['throws, no text', untilAborted([]).model, '', 'The tutor is busy. Try again in a minute.'],
    ['returns, no text', silentFake, '', 'The tutor is busy. Try again in a minute.'],
    ['throws, after text', untilAborted(['Part ']).model, 'Part ', 'The reply was cut off.'],
    ['returns, after text', fakeModel({ delayMs: 30 }), '', 'The reply was cut off.'],
  ];
  for (const [name, model, reply, message] of cases) {
    const ledger = new SpendLedger();
    const { d, dir } = await deps(runtime(model, ledger, { replyDeadlineMs: 50 }), { tutor_daily_cap_usd: 0.05 });
    const got = split(await (await post(createApp(d), '/api/tutor/ask', ask())).text());
    if (reply !== '') assert.equal(got.reply, reply, name);
    assert.equal(got.reply === '', message.startsWith('The tutor is busy'), `${name}: text came exactly when the line says so`);
    assert.deepEqual([got.summary.outcome, got.summary.message, got.summary.counted], ['error', message, false], name);
    assert.notEqual(got.summary.message, offlineLine('claude'), name);
    assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['error'], name);
    assert.ok(ledger.reserve(0.05, 0.05, new Date()), `${name}: the reservation is released`);
  }
});

test('Review Focus 5: a session end mid-reply does not wait for it; the record keeps the session the question started in', STREAM, async () => {
  let release = (): void => {};
  const held = new Promise<void>((done) => { release = done; });
  const { model } = scripted(['Part one. ', 'Part two.'], { gate: () => held });
  const { d, dir } = await deps(runtime(model));
  const app = createApp(d);
  const res = await post(app, '/api/tutor/ask', ask());
  const reader = res.body!.getReader();
  await reader.read();
  const sessionAtAsk = d.session.currentId;
  assert.ok(sessionAtAsk, 'asking started a session (T-12)');
  assert.equal((await post(app, '/api/session-end', {})).status, 200, 'the end does not hang on the open reply');
  release();
  while (!(await reader.read()).done) { /* the rest of the reply and the summary */ }
  const recs = await records(dir);
  assert.equal(recs.find((r) => r.record === 'tutor_asked')?.session_id, sessionAtAsk);
  assert.equal(recs.find((r) => r.record === 'item_close' && r.item_instance_id === 'I-1')?.reason, 'session_end');
});

test('Review Focus 4 through the route: the backup folder and the username never reach the model', async () => {
  const { model, seen } = scripted(['ok']);
  const folder = 'C:\\Users\\Robin Example\\OneDrive\\Backups';
  const { d } = await deps(runtime(model), { backup_folder: folder });
  await (await post(createApp(d), '/api/tutor/ask', ask({ snapshot: `Backup folder: ${folder}\nStatus: saved`, question: 'Where are my backups?' }))).text();
  assert.ok(!seen[0]!.question.includes('Robin') && !seen[0]!.question.includes('OneDrive'));
});

test('T-16 through the route: on an instance served in a phase that hides labels, the course text names no concept, summary or item ID', async () => {
  const title = content.curriculum.concepts.find((c) => c.id === FIXTURE_CONCEPT)!.title;
  const summaryText = 'SELECT names the columns.';
  const servings = new Servings();
  const review = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: ITEM });
  const { model, seen } = scripted(['ok']);
  const { d, dir } = await deps(runtime(model), {}, { servings });
  const app = createApp(d);
  await (await post(app, '/api/tutor/ask', ask())).text();                                                           // I-1, phase free
  await (await post(app, '/api/tutor/ask', ask({ item: { item_id: ITEM, item_instance_id: review, phase: 'free' } }))).text();
  const [shown, hidden] = seen.map((s) => s.question);
  assert.ok(shown!.includes(title) && shown!.includes(FIXTURE_CONCEPT) && shown!.includes(summaryText), 'a free question names them');
  assert.ok(!hidden!.includes(title) && !hidden!.includes(FIXTURE_CONCEPT) && !hidden!.includes(summaryText), 'a review question does not');
  assert.ok(hidden!.includes('<course>') && hidden!.includes('Task: '), 'the task itself is still there');
  const asked = (await records(dir)).filter((r) => r.record === 'tutor_asked');
  assert.deepEqual(asked.map((r) => [r.item_instance_id, r.phase]), [['I-1', 'free'], [review, 'review']], "the serving's phase wins over the browser's");
});

/** The course text the model received, and which of T-16's hidden labels it names (S2-39: concept, lesson summary, level, item ID). */
const courseOf = (input: TutorModelInput): string => /<course>\n([\s\S]*?)\n<\/course>/.exec(input.question)?.[1] ?? '';
const labelsIn = (course: string): string[] => {
  const title = content.curriculum.concepts.find((c) => c.id === FIXTURE_CONCEPT)!.title;
  return ([['concept title', title], ['concept ID', FIXTURE_CONCEPT], ['lesson summary', 'SELECT names the columns.'], ['item ID', ITEM]] as const)
    .filter(([, text]) => course.includes(text)).map(([label]): string => label).concat(/level \d/.test(course) ? ['level'] : []);
};

test('I1 (T-16): a review instance a session end closed still hides its labels; the question names no instance (T-03)', async () => {
  const servings = new Servings();
  const review = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: ITEM });
  const { model, seen } = scripted(['ok']);
  const { d, dir } = await deps(runtime(model), {}, { servings });
  const app = createApp(d);
  const body = ask({ item: { item_id: ITEM, item_instance_id: review, phase: 'free' } });     // the browser sends no hidden phase
  await (await post(app, '/api/tutor/ask', body)).text();
  assert.equal((await post(app, '/api/session-end', {})).status, 200);
  assert.equal((await records(dir)).find((r) => r.record === 'item_close' && r.item_instance_id === review)?.reason, 'session_end', 'the end closed it');
  await (await post(app, '/api/tutor/ask', body)).text();
  assert.equal(seen.length, 2);
  for (const [n, input] of seen.entries()) {
    const course = courseOf(input);
    assert.deepEqual(labelsIn(course), [], `question ${n + 1} sends no hidden label`);
    assert.ok(course.includes('Task: '), `question ${n + 1} still has the task`);
  }
  const asked = (await records(dir)).filter((r) => r.record === 'tutor_asked');
  assert.deepEqual(asked.map((r) => [r.item_instance_id, r.phase]), [[review, 'review'], [null, null]], 'the closed instance is named by no record');
  // After a restart the serving is gone and the instance is one of the logged ones: its replayed close still hides the labels.
  const state = new LearnerState({ content, attempts: await records(dir), events: [], examDate: () => null });
  const restarted = await deps(runtime(model), {}, { state, closedInstances: [review] });
  await (await post(createApp(restarted.d), '/api/tutor/ask', body)).text();
  assert.equal(seen.length, 3);
  assert.deepEqual(labelsIn(courseOf(seen[2]!)), [], 'after a restart it sends no hidden label either');
  assert.ok(courseOf(seen[2]!).includes('Task: '));
});

test("I1 (T-16): the browser's own phase alone hides labels, on an instance the server never served and with no instance at all", async () => {
  const { model, seen } = scripted(['ok']);
  const { d, dir } = await deps(runtime(model));
  const app = createApp(d);
  await (await post(app, '/api/tutor/ask', ask({ item: { item_id: ITEM, item_instance_id: 'I-2', phase: 'review' } }))).text();
  await (await post(app, '/api/tutor/ask', ask({ item: { item_id: ITEM, phase: 'review' } }))).text();
  assert.equal(seen.length, 2);
  for (const [n, input] of seen.entries()) {
    const course = courseOf(input);
    assert.deepEqual(labelsIn(course), [], `question ${n + 1} sends no hidden label`);
    assert.ok(course.includes('Task: '), `question ${n + 1} still has the task`);
  }
  const asked = (await records(dir)).filter((r) => r.record === 'tutor_asked');
  assert.deepEqual(asked.map((r) => [r.item_instance_id, r.phase]), [['I-2', 'free'], [null, null]], 'a browser never gives a served-only phase to the record');
});

test("D94: while a timed run's clock runs, its screen and its items are refused; other screens stay open; its review is open after", async () => {
  const { model, seen } = scripted(['ok']);
  const { d, dir } = await deps(runtime(model), {}, { content: withDrill });
  const app = createApp(d);
  const started = await post(app, '/api/drill/live/start', {});
  assert.equal(started.status, 200);
  const run = await started.json() as { block_id: string; servings: { item_id: string; item_instance_id: string }[] };
  const s = run.servings[0]!;
  const onItem = { item_id: s.item_id, item_instance_id: s.item_instance_id, phase: 'drill' };
  assert.equal((await (await get(app, '/api/tutor/status')).json()).run_on, true);
  for (const body of [ask({ screen: 'drill', item: null }), ask({ item: onItem })]) {
    const res = await post(app, '/api/tutor/ask', body);
    assert.deepEqual([res.status, await res.json()], [409, { error: 'Help opens in the end-of-run review.', code: 'help_waits' }]);
  }
  assert.equal(seen.length, 0);
  assert.equal((await post(app, '/api/tutor/ask', ask({ screen: 'today', item: null }))).status, 200);
  assert.equal((await post(app, '/api/drill/end', { block_id: run.block_id })).status, 200);
  assert.equal((await (await get(app, '/api/tutor/status')).json()).run_on, false);
  const review = await post(app, '/api/tutor/ask', ask({ screen: 'drill', item: onItem }));
  assert.equal(split(await review.text()).summary.outcome, 'answered');
  const asked = (await records(dir)).filter((r) => r.record === 'tutor_asked');
  assert.deepEqual(asked.map((r) => [r.screen, r.item_instance_id]), [['today', null], ['drill', null]], 'the closed run item is named by no instance');
});

test('a question on another item\'s instance, or on a closed one, names no instance and counts for nothing', async () => {
  const { model } = scripted(['ok']);
  const { d, dir } = await deps(runtime(model));
  const app = createApp(d);
  const other = content.lesson(FIXTURE_CONCEPT)!.pool_item_ids[1]!;
  await (await post(app, '/api/tutor/ask', ask())).text();                                            // opens I-1 on ITEM
  const wrong = split(await (await post(app, '/api/tutor/ask', ask({ item: { item_id: other, item_instance_id: 'I-1', phase: 'free' } }))).text());
  assert.equal(wrong.summary.counted, false);
  assert.equal((await post(app, '/api/session-end', {})).status, 200);                              // closes I-1
  const closed = split(await (await post(app, '/api/tutor/ask', ask())).text());
  assert.equal(closed.summary.counted, false);
  const asked = (await records(dir)).filter((r) => r.record === 'tutor_asked');
  assert.deepEqual(asked.map((r) => r.item_instance_id), ['I-1', null, null]);
});

test('T-06, T-22: Settings takes a daily cap from 0.05 to 20 US dollars, "none" for no daily limit, or null for the default; the status shows the cap in force', async () => {
  const { d, logger } = await deps(runtime(scripted(['x']).model));
  const app = createApp(d);
  const set = (value: unknown) => post(app, '/api/settings', { key: 'tutor_daily_cap_usd', value });
  const cap = async () => (await status(app)).cap_usd;
  for (const bad of [0.01, 20.5, '2', true, 'None', 'off', '']) {
    const res = await set(bad);
    assert.deepEqual([res.status, (await res.json()).error], [400, 'Use a daily budget from 0.05 to 20 US dollars.'], `refused: ${String(bad)}`);
  }
  assert.equal((await set(2.5)).status, 200);
  assert.deepEqual([d.settings.tutor_daily_cap_usd, await cap()], [2.5, 2.5]);
  assert.equal((await set('none')).status, 200);
  assert.deepEqual([d.settings.tutor_daily_cap_usd, await cap()], ['none', null]);
  assert.equal((await set(null)).status, 200);
  assert.deepEqual([d.settings.tutor_daily_cap_usd, await cap()], [null, 1]);
  const events = await logger.readAll('events') as Partial<SettingChange>[];
  assert.deepEqual(events.filter((e) => e.key === 'tutor_daily_cap_usd').map((e) => e.value), [2.5, 'none', null]);
  assert.equal(settingsFromEvents(events).tutor_daily_cap_usd, null, 'a restart reads the latest');
});

// ---- block P (T-20 to T-23) ---------------------------------------------------------------------------------------------------
test('T-22: Settings takes the switch, the model and the effort, each checked, logged and read back; a refusal never repeats the value', async () => {
  const { d, logger } = await deps(runtime(scripted(['x']).model, undefined, { start: { claude: CLAUDE_KEY, openai: OPENAI_KEY } }));
  const app = createApp(d);
  const set = (key: string, value: unknown) => post(app, '/api/settings', { key, value });
  const refusals: [string, unknown[], string][] = [
    ['tutor_enabled', ['yes', 1, 'true', 'false', {}], 'Switch the tutor on or off: true or false.'],
    ['tutor_model', ['gpt-made-up', 'sk-ant-api03-not-a-real-key-0000', 'toString', '__proto__', 'fake', 'Claude-Haiku-5-5', 3, ''], 'Pick one of the models Settings lists.'],
    ['tutor_effort', ['max', 'xhigh', 'none', 'minimal', 'Medium', '', 2], 'Pick low, medium or high.'],
  ];
  for (const [key, bad, line] of refusals) {
    for (const value of bad) {
      const res = await set(key, value);
      const body = await res.text();
      assert.deepEqual([res.status, (JSON.parse(body) as { error: string }).error], [400, line], `${key} refuses ${JSON.stringify(value)}`);
      if (typeof value === 'string' && value.length > 3 && !line.includes(value)) assert.ok(!body.includes(value), `the refusal does not repeat ${value}`);
    }
  }
  assert.equal((await logger.readAll('events')).filter((e) => (e as { event?: string }).event === 'setting_change').length, 0, 'a refusal logs nothing');
  for (const [key, value] of [['tutor_model', 'gpt-6.1-sol'], ['tutor_effort', 'high'], ['tutor_enabled', false]] as const) assert.equal((await set(key, value)).status, 200, key);
  let s = await status(app);
  assert.deepEqual([s.switched_on, s.enabled, s.provider, s.model, s.effort], [false, false, 'openai', 'gpt-6.1-sol', 'high']);
  for (const key of ['tutor_model', 'tutor_effort', 'tutor_enabled']) assert.equal((await set(key, null)).status, 200, `${key}: null is the default`);
  s = await status(app);
  assert.deepEqual([s.switched_on, s.enabled, s.provider, s.model, s.effort], [true, true, 'claude', 'claude-haiku-5-5', 'medium']);
  const events = await logger.readAll('events') as Partial<SettingChange>[];
  assert.deepEqual(events.filter((e) => e.event === 'setting_change').map((e) => [e.key, e.value, e.schema_version]), [
    ['tutor_model', 'gpt-6.1-sol', 6], ['tutor_effort', 'high', 6], ['tutor_enabled', false, 6], ['tutor_model', null, 6], ['tutor_effort', null, 6], ['tutor_enabled', null, 6]]);
  const restarted = settingsFromEvents(events.filter((e) => e.event === 'setting_change').slice(0, 3));
  assert.deepEqual([restarted.tutor_model, restarted.tutor_effort, restarted.tutor_enabled], ['gpt-6.1-sol', 'high', false], 'a restart reads them');
});

test('the model is built per question from Settings: the chosen model and effort reach the call, its token limit and the record', async () => {
  const { model, seen } = scripted(['ok']);
  const rt = runtime(model, undefined, { start: { claude: CLAUDE_KEY, openai: OPENAI_KEY } });
  const { d, dir } = await deps(rt);
  const app = createApp(d);
  const askOnce = async () => split(await (await post(app, '/api/tutor/ask', ask())).text()).summary.outcome;
  assert.equal(await askOnce(), 'answered');
  await post(app, '/api/settings', { key: 'tutor_model', value: 'gpt-6.1-sol' });
  await post(app, '/api/settings', { key: 'tutor_effort', value: 'high' });
  assert.equal(await askOnce(), 'answered');
  await post(app, '/api/settings', { key: 'tutor_model', value: 'claude-sonnet-5-5' });
  await post(app, '/api/settings', { key: 'tutor_effort', value: 'low' });
  assert.equal(await askOnce(), 'answered');
  assert.deepEqual((await rt).chosen, [{ provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium' },
    { provider: 'openai', model: 'gpt-6.1-sol', effort: 'high' }, { provider: 'claude', model: 'claude-sonnet-5-5', effort: 'low' }]);
  assert.deepEqual(seen.map((s) => s.maxTokens), [8_192, 16_384, 4_096], 'the token limit follows the effort');
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.effort), ['medium', 'high', 'low'], 'the record carries the effort');
});

test("T-21: the reservation uses the effort's token limit: at high effort Opus 5.5 can pass a $0.20 limit, so it is capped; at low it fits", async () => {
  const { model, seen } = scripted(['ok'], { model: 'claude-opus-5-5' });
  const { d, dir } = await deps(runtime(model), { tutor_daily_cap_usd: 0.2, tutor_model: 'claude-opus-5-5', tutor_effort: 'high' });
  const app = createApp(d);
  const high = await post(app, '/api/tutor/ask', ask());
  assert.deepEqual([high.status, (await high.json()).code], [429, 'capped'], '16,384 tokens at $20 a million is over $0.32');
  await post(app, '/api/settings', { key: 'tutor_effort', value: 'low' });
  assert.equal(split(await (await post(app, '/api/tutor/ask', ask())).text()).summary.outcome, 'answered', '4,096 tokens is about $0.08');
  assert.equal(seen.length, 1);
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => [r.outcome, r.effort]), [['capped', 'high'], ['answered', 'low']]);
});

test('T-22: with no daily limit a question holds no reservation and is never capped; its spend is still noted and shown', STREAM, async () => {
  const ledger = new SpendLedger([{ record: 'tutor_asked', ts: new Date().toISOString(), cost_usd: 25 }]);    // over any limit Settings takes
  let release = (): void => {};
  const held = new Promise<void>((done) => { release = done; });
  const { model } = scripted(['Part one. ', 'Part two.'], { gate: () => held, model: 'claude-opus-5-5' });
  const { d, dir } = await deps(runtime(model, ledger), { tutor_daily_cap_usd: 'none', tutor_model: 'claude-opus-5-5', tutor_effort: 'high' });
  const app = createApp(d);
  const reader = (await post(app, '/api/tutor/ask', ask())).body!.getReader();
  await reader.read();
  const now = new Date();
  assert.ok(ledger.reserve(1, ledger.spentOn(now) + 1, now), 'nothing is held while the reply streams');
  release();
  const { summary } = split(await rest(reader));
  assert.deepEqual([summary.outcome, summary.cap_usd, summary.cost_usd], ['answered', null, 0.008]);
  assert.equal(Math.round(summary.spent_today_usd * 1e6), 25_008_000);
  const s = await status(app);
  assert.deepEqual([s.cap_usd, Math.round(s.spent_today_usd * 1e6)], [null, 25_008_000]);
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => [r.outcome, r.cost_usd]), [['answered', 0.008]]);
});

test("a model whose provider has no key is refused before any call, with the reason; nothing is logged", async () => {
  const rt = runtime(scripted(['x']).model, undefined, { start: { claude: CLAUDE_KEY } });
  const { d, dir } = await deps(rt, { tutor_model: 'gpt-6-luna' });
  const res = await post(createApp(d), '/api/tutor/ask', ask());
  assert.deepEqual([res.status, await res.json()], [404, { error: 'GPT-6 Luna needs an OpenAI key. Add one in Settings to turn the tutor on.', code: 'tutor_off' }]);
  assert.deepEqual((await rt).chosen, [], 'no model was built');
  assert.equal((await records(dir)).length, 0);
});

test('a model that cannot be built is refused before any call and logs nothing', async () => {
  const rt = runtime(null, undefined, { start: { claude: CLAUDE_KEY } });
  const { d, dir } = await deps(rt);
  const res = await post(createApp(d), '/api/tutor/ask', ask());
  const body = await res.json() as { error: string; code: string };
  assert.deepEqual([res.status, body.code], [503, 'tutor_off']);
  assert.ok(!JSON.stringify(body).includes(CLAUDE_KEY));
  assert.equal((await rt).chosen.length, 1);
  assert.equal((await records(dir)).filter((r) => r.record === 'tutor_asked').length, 0);
});

test('Review Focus (block P): the switch turned off while a reply streams: that reply ends as answered and is logged; the next question is refused', STREAM, async () => {
  let release = (): void => {};
  const held = new Promise<void>((done) => { release = done; });
  const { model, seen } = scripted(['Part one. ', 'Part two.'], { gate: () => held });
  const { d, dir } = await deps(runtime(model));
  const app = createApp(d);
  const reader = (await post(app, '/api/tutor/ask', ask())).body!.getReader();
  await reader.read();
  assert.equal((await post(app, '/api/settings', { key: 'tutor_enabled', value: false })).status, 200);
  assert.equal((await status(app)).enabled, false);
  release();
  const { reply, summary } = split(await rest(reader));
  assert.deepEqual([reply.endsWith('Part two.'), summary.outcome], [true, 'answered']);
  const next = await post(app, '/api/tutor/ask', ask());
  assert.deepEqual([next.status, await next.json()], [404, { error: 'The tutor is switched off in Settings.', code: 'tutor_off' }]);
  assert.equal(seen.length, 1);
  assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), ['answered']);
});

/** Runs `work` with console.log, info, warn and error caught, and gives what they were asked to print. */
async function printed(work: () => Promise<void>): Promise<string> {
  const out: unknown[] = [];
  const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of ['log', 'info', 'warn', 'error'] as const) console[k] = (...a: unknown[]) => { out.push(a); };
  try { await work(); } finally { Object.assign(console, keep); }
  return JSON.stringify(out);
}

test('T-20: POST /api/tutor/keys saves a key to the file and removes it; the answer is the status, never a key; nothing is logged or printed; no session starts', async () => {
  const file = join(await tmp('al-tutor-keyfile-'), 'tutor-keys.json');
  const ENV_KEY = 'sk-ant-test-env-key-0000000000000';
  const rt = runtime(scripted(['x']).model, undefined, { start: { claude: ENV_KEY }, file });
  const { d, dir } = await deps(rt);
  const app = createApp(d);
  const bodies: string[] = [];
  const send = async (body: unknown, status = 200): Promise<TutorStatusView> => {
    const res = await post(app, TUTOR_KEY_PATH, body);
    const text = await res.text();
    bodies.push(text);
    assert.equal(res.status, status, text);
    return JSON.parse(text) as TutorStatusView;
  };
  const shown = await printed(async () => {
    let s = await send({ provider: 'claude', key: CLAUDE_KEY });
    assert.deepEqual(s.keys, [{ provider: 'claude', source: 'settings' }, { provider: 'openai', source: null }]);
    assert.equal(s.enabled, true);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { claude: CLAUDE_KEY });
    assert.equal((await rt).keys.secretFor('claude'), CLAUDE_KEY, 'the saved key wins over the start key');
    s = await send({ provider: 'openai', key: `  ${OPENAI_KEY}\n` });
    assert.deepEqual(s.keys.map((k) => k.source), ['settings', 'settings']);
    assert.ok(s.models.every((m) => m.available));
    s = await send({ provider: 'claude', key: null });
    assert.deepEqual(s.keys.map((k) => k.source), ['env', 'settings'], 'removed: the start key is back');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { openai: OPENAI_KEY });
    s = await send({ provider: 'openai', key: null });
    assert.deepEqual(s.keys.map((k) => k.source), ['env', null]);
  });
  for (const k of [CLAUDE_KEY, OPENAI_KEY, ENV_KEY]) {
    assert.ok(!bodies.some((b) => b.includes(k)), 'no answer holds a key');
    assert.ok(!shown.includes(k), 'nothing printed a key');
  }
  assert.equal(shown, '[]', 'nothing was printed');
  assert.deepEqual(await readdir(dir), [], 'nothing reached the logs folder');
  assert.equal(d.session.currentId, null, 'saving a key starts no study session');
});

test('T-20: POST /api/tutor/keys refuses an unknown provider, a key that does not look like one and a body of the wrong shape, never repeating it', async () => {
  const file = join(await tmp('al-tutor-keyfile-'), 'tutor-keys.json');
  const { d, dir } = await deps(runtime(scripted(['x']).model, undefined, { file }));
  const app = createApp(d);
  const bad = 'sk-ant-test has a space 000000000';
  const cases: [unknown, number, string, string | null][] = [
    [{ provider: 'gemini', key: CLAUDE_KEY }, 400, 'bad_request', 'Unknown provider: use claude or openai.'],
    [{ provider: 'claude', key: bad }, 400, 'bad_key', null],
    [{ provider: 'claude', key: OPENAI_KEY }, 400, 'bad_key', null],
    [{ provider: 'openai', key: CLAUDE_KEY }, 400, 'bad_key', 'That looks like a Claude key (it starts with sk-ant-): paste it in the Claude API key field.'],
    [{ provider: 'openai', key: 'pk-test-0000000000000000000000' }, 400, 'bad_key', null],
    [{ provider: 'claude', key: 42 }, 400, 'bad_request', 'Send a key to save, or null to remove the one saved in Settings.'],
    [{ provider: 'claude' }, 400, 'bad_request', 'Send a key to save, or null to remove the one saved in Settings.'],
    [[CLAUDE_KEY], 400, 'bad_request', 'The request body must be a JSON object.'],
  ];
  for (const [body, code, tag, line] of cases) {
    const res = await post(app, TUTOR_KEY_PATH, body);
    const text = await res.text();
    const got = JSON.parse(text) as { error: string; code: string };
    assert.deepEqual([res.status, got.code], [code, tag], JSON.stringify(body));
    if (line) assert.equal(got.error, line);
    else assert.match(got.error, /^An? (Claude|OpenAI) key starts with sk-/);
    for (const k of [CLAUDE_KEY, OPENAI_KEY, bad, 'pk-test-0000000000000000000000']) assert.ok(!text.includes(k), `the refusal of ${JSON.stringify(body)} repeats no key`);
  }
  const raw = await app.request(`http://127.0.0.1:5174${TUTOR_KEY_PATH}`, { method: 'POST', headers: P, body: `{"provider":"claude","key":"${CLAUDE_KEY}"` });
  const rawText = await raw.text();
  assert.equal(raw.status, 400);
  assert.ok(!rawText.includes(CLAUDE_KEY), 'a body that is not JSON is refused without repeating it');
  await assert.rejects(readFile(file, 'utf8'), 'nothing was written');
  assert.deepEqual(await readdir(dir), []);
});

test('T-20: a key that cannot be written is refused with a plain line; nothing changes and no key is in the answer', async () => {
  const file = join(await tmp('al-tutor-keyfile-'), 'tutor-keys.json');
  await mkdir(file);                                                          // the file's place is a folder, so the write fails
  const { d } = await deps(runtime(scripted(['x']).model, undefined, { file }));
  const res = await post(createApp(d), TUTOR_KEY_PATH, { provider: 'openai', key: OPENAI_KEY });
  const text = await res.text();
  assert.deepEqual([res.status, JSON.parse(text)], [500, { error: 'The key could not be saved. Check that the app folder can be written, then try again.', code: 'not_saved' }]);
  assert.ok(!text.includes(OPENAI_KEY));
  assert.deepEqual((await status(createApp(d))).keys.map((k) => k.source), ['env', null]);
});

test('review P M7: POST /api/tutor/keys from another origin is refused before anything runs; nothing is written', async () => {
  const file = join(await tmp('al-tutor-keyfile-'), 'tutor-keys.json');
  const { d, dir } = await deps(runtime(scripted(['x']).model, undefined, { file }));
  const res = await createApp(d).request(`http://127.0.0.1:5174${TUTOR_KEY_PATH}`,
    { method: 'POST', headers: { ...P, origin: 'http://evil.example' }, body: JSON.stringify({ provider: 'openai', key: OPENAI_KEY }) });
  assert.equal(res.status, 403);
  assert.ok(!(await res.text()).includes(OPENAI_KEY));
  await assert.rejects(readFile(file, 'utf8'), 'nothing was written');
  assert.deepEqual(await readdir(dir), []);
});

test('review P M5: a reply that stops at its token limit before any text is an error, never an answer or help; one with text is answered', STREAM, async () => {
  for (const [pieces, outcome] of [[[], 'error'], [['Some teaching. '], 'answered']] as const) {
    const { d, dir } = await deps(runtime(scripted([...pieces], { end: 'max_tokens' }).model));
    const { summary } = split(await (await post(createApp(d), '/api/tutor/ask', ask())).text());
    assert.equal(summary.outcome, outcome, `${pieces.length} pieces`);
    if (outcome === 'error') assert.deepEqual([summary.message, summary.counted], ['The reply was cut off.', false]);
    assert.deepEqual((await records(dir)).filter((r) => r.record === 'tutor_asked').map((r) => r.outcome), [outcome]);
  }
});

test('POST /api/tutor/keys without a tutor runtime is refused as off', async () => {
  const res = await post(createApp((await deps()).d), TUTOR_KEY_PATH, { provider: 'claude', key: CLAUDE_KEY });
  const text = await res.text();
  assert.deepEqual([res.status, JSON.parse(text)], [404, { error: 'The tutor is off.', code: 'tutor_off' }]);
});

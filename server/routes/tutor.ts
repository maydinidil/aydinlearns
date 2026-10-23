// server/routes/tutor.ts: the AI tutor's three routes (AI tutor design §4, §7, §10, §11; D91 to D99; block P, T-20 to T-23).
// GET /api/tutor/status: on or off and why, the Settings switch, model and effort, every model with its price and whether its provider has
//   a key, where each key came from (never the key), today's spend and the limit (null: none), whether a timed run is on, and (D117, S7C-04)
//   whether that run is a mock's, which closes the tutor on every screen, so the panel shows its line before any question. Starts no session.
// POST /api/tutor/ask: { screen, subject_id?, snapshot, item, thread, question }. The guard's refusals come first, as JSON, and call no model.
//   The model is built per question from Settings and the key store (server/tutor/config.ts, startup.ts), with the token limit of the
//   effort. Then the daily limit: a question that could pass it is refused (429) and logged as `capped`; with no limit (T-22) nothing is
//   held. The limit is decided before the item is resolved, so a capped question opens nothing (S7-32). Otherwise the reply streams as
//   plain text, then U+001E and one JSON summary line (T-08). Every question past the guard writes one tutor_asked record (log version 6)
//   with counts and the effort only, stamped with the time the question was asked (S7-33, D112). A reply that runs past the whole-reply
//   deadline (T-15; 1, 2 or 4 minutes by the effort, S7-32) is cut like any failure, with the busy line before any text and the cut-off
//   line after it: the SDKs' own timeout covers only the wait for headers. A cut reply is counted, not logged at $0 (S7-32).
//   A question admitted while the tutor was on runs to its end even if Settings turns the tutor off meanwhile; the next one is refused.
// POST /api/tutor/keys (T-20): { provider, key } saves a key (a string) to tutor-keys.json, or removes the one saved there (null), and answers
//   with the status. The key is never in an answer, a log line, the journey, a span or an error; the route writes nothing to the logs and
//   starts no study session (server/app.ts lets it past the session middleware).
import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { trace } from '@opentelemetry/api';
import { SCHEMA_VERSION, type Phase, type TutorAsked, type TutorOutcome } from '../../core/envelope.ts';
import { SCREENS, SUBJECT_ID, type Screen } from '../../schemas/journey.ts';
import { SUMMARY_MARK, TUTOR_KEY_PATH, type TutorStatusView, type TutorSummary } from '../../schemas/tutor.ts';
import type { RouteDeps, Settings } from '../app.ts';
import { isMockPlan, type DrillGate, type RunEntry } from '../drill.ts';
import { tutorObserved } from '../observe.ts';
import { hidesLabels } from '../servings.ts';
import { tutorState, type TutorState } from '../tutor/config.ts';
import { buildInput, type Exchange } from '../tutor/context.ts';
import { courseFor, type CourseSource } from '../tutor/course.ts';
import { guard, TIMED_SCREENS } from '../tutor/guard.ts';
import { KEY_PROVIDERS, keyProblem, type KeyStore } from '../tutor/keys.ts';
import { MODELS, replyDeadlineMs, tokenLimit } from '../tutor/models.ts';
import { costOf, priceOf, worstCost } from '../tutor/prices.ts';
import { TUTOR_PROMPT_VERSION } from '../tutor/prompt.ts';
import { TUTOR_LINES } from '../tutor/providers/errors.ts';
import { localNames } from '../tutor/redact.ts';
import { capOf, type SpendLedger } from '../tutor/spend.ts';
import { TutorFailure, type KeyProvider, type ModelChoice, type TutorModel, type TutorModelInput, type TutorUsage } from '../tutor/types.ts';

/**
 * What server/main.ts gives the tutor. `fake`: T-23's test hook. `modelFor`: the model for one question (startup.ts's makeTutorModel over
 * the key store; a test passes its own). `replyDeadlineMs`: T-15's deadline, the effort's (models.ts) unless a test sets a shorter one.
 */
export interface TutorRuntime {
  keys: KeyStore;
  fake: boolean;
  modelFor(c: ModelChoice): Promise<TutorModel>;
  ledger: SpendLedger;
  replyDeadlineMs?: number;
}
/**
 * GET /api/tutor/status's reply: the shared status view, and (D117, S7C-04) whether the run that is on is a mock's. The browser declares the
 * same shape (TutorStatusRead in web/src/tutor/TutorContext.tsx); tests/web/tutor-status-shape.test.ts checks the two agree, both ways.
 */
export interface TutorStatusReply extends TutorStatusView { mock_on: boolean }
/** T-03: the instance a question names, with what its record carries. */
export interface TutorTarget { item_instance_id: string; item_id: string; target_concept_id: string; phase: Phase; card_id?: string }
export interface TutorRoutes {
  /** Null: no tutor (an app built without one); every route answers that it is off. */
  runtime: TutorRuntime | null;
  runs: Pick<DrillGate, 'running'> & { current(): Pick<RunEntry, 'plan'> | undefined };
  target(b: Record<string, unknown>): TutorTarget | null;
  /** I1 (T-16): the named instance's phase hides labels whatever its state (live, served, closed), or the browser's own phase does. */
  hides(b: Record<string, unknown>): boolean;
  course: CourseSource;
}

const OFF_LINE = 'The tutor is off.';
const NOT_STARTED = 'The tutor could not start. Try again, or check its key in Settings.';
const NO_PRICE = 'The chosen model has no price, so the daily limit could not work. Pick another model in Settings.';
const NOT_SAVED = 'The key could not be saved. Check that the app folder can be written, then try again.';
/** S7-32: the summary's line when the question's record could not be written (the app's own line for a failed log write). */
const NOT_LOGGED = 'The question could not be written to the log, so grading is paused. See the setup screen.';
const ZERO: TutorUsage = { input_tokens: 0, cache_write_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isScreen = (v: unknown): v is Screen => (SCREENS as readonly unknown[]).includes(v);
/** What a call sends, in characters, as T-10's worst cost reads it. */
const charsOf = (i: TutorModelInput): number => i.system.length + i.question.length + i.turns.reduce((n, x) => n + x.text.length, 0);
const longest = (a: string | null, b: string | null): string | null => ((b?.length ?? -1) > (a?.length ?? -1) ? b : a);
const exchangesOf = (v: unknown): Exchange[] => (Array.isArray(v) ? v : [])
  .filter((x): x is Exchange => isRecord(x) && typeof x.question === 'string' && typeof x.reply === 'string');
const foldersOf = (s: Settings): string[] => [s.backup_folder, s.portfolio_folder].filter((f): f is string => typeof f === 'string' && f !== '');

export function mountTutor(app: Hono, d: RouteDeps, t: TutorRoutes): void {
  const rt = t.runtime;
  /** On or off, and with what, as Settings and the keys say now. */
  const stateNow = (): TutorState => (rt
    ? tutorState(d.settings, (p) => rt.keys.sourceOf(p), rt.fake)
    : { ...tutorState(d.settings, () => null, false), enabled: false, reason: OFF_LINE });
  const cap = (): number | null => capOf(d.settings.tutor_daily_cap_usd);
  /** D117 (S7C-04): the run that is on is a mock's (any of the four; a take-home until it is handed in or closes at 24 hours). */
  const mockOn = (): boolean => { const run = t.runs.current(); return run !== undefined && isMockPlan(run.plan); };
  const statusView = (): TutorStatusReply => {
    const s = stateNow();
    const has = (p: KeyProvider): boolean => rt !== null && (rt.fake || rt.keys.sourceOf(p) !== null);
    return {
      enabled: s.enabled, switched_on: s.switched_on, provider: s.provider, model: s.model, effort: s.effort, reason: s.reason,
      models: MODELS.map((m) => {
        const p = priceOf(m.id)!;                                       // every catalog model has a row (tests/server/tutor-config.test.ts)
        return { id: m.id, label: m.label, provider: m.provider, input_usd: p.input, output_usd: p.output, available: has(m.provider) };
      }),
      keys: KEY_PROVIDERS.map((p) => ({ provider: p, source: rt?.keys.sourceOf(p) ?? null })),
      spent_today_usd: rt?.ledger.spentOn(new Date()) ?? 0, cap_usd: cap(), run_on: t.runs.current() != null, mock_on: mockOn(),
    };
  };

  app.get('/api/tutor/status', (c) => c.json(statusView()));

  // T-20. Nothing here logs, observes or throws with the body: a refusal names the rule, never the value sent.
  app.post(TUTOR_KEY_PATH, async (c) => {
    if (!rt) return c.json({ error: OFF_LINE, code: 'tutor_off' }, 404);
    const b: unknown = await c.req.json().catch(() => null);
    if (!isRecord(b)) return c.json({ error: 'The request body must be a JSON object.', code: 'bad_request' }, 400);
    const provider = (KEY_PROVIDERS as readonly unknown[]).includes(b.provider) ? b.provider as KeyProvider : null;
    if (provider === null) return c.json({ error: 'Unknown provider: use claude or openai.', code: 'bad_request' }, 400);
    const sent = b.key;
    if (sent !== null && typeof sent !== 'string') return c.json({ error: 'Send a key to save, or null to remove the one saved in Settings.', code: 'bad_request' }, 400);
    if (typeof sent === 'string') {
      const problem = keyProblem(provider, sent.trim());
      if (problem) return c.json({ error: problem, code: 'bad_key' }, 400);
    }
    try {
      if (sent === null) await rt.keys.remove(provider); else await rt.keys.save(provider, sent);
    } catch {
      return c.json({ error: NOT_SAVED, code: 'not_saved' }, 500);
    }
    return c.json(statusView());
  });

  app.post('/api/tutor/ask', async (c) => {
    const askedAt = new Date();                                         // S7-33 (D112): the record's ts is when the question was asked
    const b: unknown = await c.req.json().catch(() => null);
    if (!isRecord(b)) return c.json({ error: 'The request body must be a JSON object.', code: 'bad_request' }, 400);
    const screen: Screen | null = isScreen(b.screen) ? b.screen : null;
    if (screen === null) return c.json({ error: 'Unknown screen.', code: 'bad_request' }, 400);
    const question = typeof b.question === 'string' ? b.question.trim() : '';
    const snapshot = typeof b.snapshot === 'string' ? b.snapshot : '';
    const item = isRecord(b.item) ? b.item : null;
    const instanceId = typeof item?.item_instance_id === 'string' ? item.item_instance_id : null;
    const state = stateNow();
    const refusal = guard({ enabled: state.enabled, offReason: state.reason, screen, runOn: t.runs.current() != null, mockOn: mockOn(),
      itemInRun: instanceId !== null && (await t.runs.running(instanceId)), questionChars: question.length, snapshotChars: snapshot.length });
    if (refusal) return c.json({ error: refusal.message, code: refusal.code }, refusal.status);

    // Block P: the model Settings names, built for this question; nothing is opened or logged when it cannot be.
    const model = await rt!.modelFor({ provider: state.provider, model: state.model, effort: state.effort }).catch(() => null);   // state.enabled: rt is set
    if (!model) return c.json({ error: NOT_STARTED, code: 'tutor_off' }, 503);
    const price = priceOf(model.model);
    if (!price) return c.json({ error: NO_PRICE, code: 'tutor_off' }, 404);
    const ledger = rt!.ledger;
    const subject = typeof b.subject_id === 'string' && SUBJECT_ID.test(b.subject_id) ? b.subject_id : null;
    const itemId = typeof item?.item_id === 'string' && SUBJECT_ID.test(item.item_id) ? item.item_id : null;
    const errorIds = [...new Set(snapshot.match(/\bERR-[A-Z]+-\d{2}\b/g) ?? [])];      // T-14: the Mistakes screen's error IDs
    const courseOf = (id: string | null, hideLabels: boolean): string | null =>
      courseFor(t.course, { item_id: id, screen, subject_id: subject, error_ids: errorIds, hide_labels: hideLabels });
    // T-21: the effort's token limit, for the call and for the reservation alike.
    const inputWith = (course: string | null): TutorModelInput => ({
      ...buildInput({ screen, course, snapshot, thread: exchangesOf(b.thread), question, redaction: { ...localNames(), folders: foldersOf(d.settings) } }),
      maxTokens: tokenLimit(state.effort) });
    const sessionId = d.session.currentId ?? '';                        // Review Focus 5: the session the question started in
    const record = (target: TutorTarget | null, outcome: TutorOutcome, u: TutorUsage, cost: number): TutorAsked => ({
      record: 'tutor_asked', schema_version: SCHEMA_VERSION, ts: askedAt.toISOString(), session_id: sessionId, screen,
      item_instance_id: target?.item_instance_id ?? null, item_id: target?.item_id ?? null, target_concept_id: target?.target_concept_id ?? null,
      phase: target?.phase ?? null, ...(target?.card_id ? { card_id: target.card_id } : {}),
      provider: model.provider, model: model.model, effort: state.effort, prompt_version: TUTOR_PROMPT_VERSION,
      input_tokens: u.input_tokens + u.cache_write_tokens, cached_input_tokens: u.cached_input_tokens, output_tokens: u.output_tokens, cost_usd: cost, outcome,
    });
    const span = trace.getActiveSpan();
    const observe = (target: TutorTarget | null, outcome: TutorOutcome, u: TutorUsage): void =>
      tutorObserved(span, { screen, provider: model.provider, model: model.model, effort: state.effort, outcome }, target?.item_id ?? null,
        u.input_tokens + u.cache_write_tokens + u.cached_input_tokens + u.output_tokens);

    // S7-32: the daily limit is decided before the item is resolved, since resolving opens an SQL item's instance (T-03). The reservation
    // is sized on the longest course text the question can get, the body's item's or the screen subject's with the labels shown: resolving
    // picks one of the two and can only hide labels, so the input the call sends is never longer.
    const sizedCourse = longest(courseOf(itemId, false), courseOf(null, false));
    const sized = inputWith(sizedCourse);
    const worst = worstCost(price, charsOf(sized), sized.maxTokens);
    const limit = cap();
    // T-22: with no daily limit nothing is held; the record still notes the spend, which the status shows.
    const release = limit === null ? () => {} : ledger.reserve(worst, limit, new Date());
    if (!release) {
      await d.logger.tutorAsked(record(null, 'capped', ZERO, 0));
      observe(null, 'capped', ZERO);
      return c.json({ error: TUTOR_LINES.capped, code: 'capped' }, 429);
    }

    const target = item ? t.target(item) : null;                        // T-03: an SQL item's instance opens here, as a hint opens it
    // T-16: an instance in a phase that hides labels (review, mixed, drill, case) gets course text without them, as the screen shows it.
    // I1: so does one the question no longer names (a session end closed it), and any item whose browser phase hides them.
    const hide = (target !== null && hidesLabels(target.phase)) || (item !== null && t.hides(item));
    // S7-35 (review T7 M6): in a drill or GA4 run review (the guard closed both screens while a run is on) the run's instances are closed,
    // so no target: the body's item ID gives the course text only, with the labels hidden. No record names it.
    const course = target === null && TIMED_SCREENS.has(screen) ? courseOf(itemId, true) : courseOf(target?.item_id ?? null, hide);
    const input = course === sizedCourse ? sized : inputWith(course);
    /** S7-32: what a reply cut before the provider reported any usage counts: the call's reservation, to a millionth of a dollar. */
    const reservation = Math.round(worst * 1_000_000) / 1_000_000;

    return streamText(c, async (out) => {
      const abort = new AbortController();
      out.onAbort(() => abort.abort());                                 // Review Focus 2: the learner left, so the call is cancelled
      // S7-32 (review T7 M5): a request dropped before this stream started is never cancelled by the server's adapter, which only aborts
      // the request's signal; that signal stops the stream and the call, so the record is written and the reservation released.
      const dropped = c.req.raw.signal;
      if (dropped.aborted) out.abort(); else dropped.addEventListener('abort', () => out.abort(), { once: true });
      const deadline = AbortSignal.timeout(rt!.replyDeadlineMs ?? replyDeadlineMs(state.effort));
      const signal = AbortSignal.any([abort.signal, deadline]);
      let outcome: TutorSummary['outcome'] = 'error';                  // a streamed question is never `capped`: that refusal came first
      let usage = ZERO;
      let cost = 0;
      let message: string | null = null;
      let started = false;                                              // text has come
      let received = 0;                                                 // S7-32: the characters the model sent
      // Review T3 M4: when T-15's deadline (not the learner) ended the call, the provider answered and was slow, whatever the model then
      // threw: busy before any text, cut off after it, never the provider's "can't reach".
      const deadlineLine = (): string | null => (deadline.aborted && !abort.signal.aborted ? (started ? TUTOR_LINES.cut_off : TUTOR_LINES.busy) : null);
      try {
        const reply = model.ask({ ...input, signal });
        let n = await reply.next();
        while (!n.done) {
          received += n.value.length;
          const piece = n.value.replaceAll(SUMMARY_MARK, '');
          if (piece !== '') started = true;
          if (!out.aborted) await out.write(piece);
          n = await reply.next();
        }
        usage = n.value.usage;
        cost = costOf(price, usage);
        // Review Focus 2 and T-15 (found by smoke row tu-4): a model that stops on the signal and returns normally (the fake does) was
        // cut, not answered. Whatever the model does, an aborted call is an error: never counted as help, its tokens still counted.
        if (signal.aborted) message = deadlineLine() ?? TUTOR_LINES.cut_off;
        // Review P M5: thinking that used the whole token limit leaves no text: nothing was taught, so it is no answer and no help.
        else if (n.value.end === 'max_tokens' && !started) message = TUTOR_LINES.cut_off;
        else {
          outcome = n.value.end === 'refused' ? 'refused' : 'answered';
          if (outcome === 'refused') message = TUTOR_LINES.declined;
        }
      } catch (e) {
        const failure = e instanceof TutorFailure ? e : null;
        message = deadlineLine() ?? failure?.message ?? TUTOR_LINES.cut_off;
        // S7-31: a provider that declined on policy is the model declining, as spec §10 logs it.
        if (failure?.kind === 'declined' && !signal.aborted) outcome = 'refused';
        // S7-32 (block P review I2): a reply cut off (Close, Alt+T, leaving, the deadline, a broken stream) is counted, as the provider
        // bills it: the input the provider reported and the characters received over 4, or else the call's reservation. A call that
        // failed before the provider answered (a refused key, busy, no network) cost nothing.
        if (failure?.usage) {
          usage = { ...failure.usage, output_tokens: Math.ceil(received / 4) };
          cost = costOf(price, usage);
        } else if (signal.aborted || failure === null || failure.kind === 'cut_off') cost = reservation;
      } finally {
        // S7-32 (review T7 M4): a record that cannot be written still observes and sends the summary; it is not counted as help, since
        // replay never reads it. The logger has marked itself unwritable, so the status and every later write say why.
        let logged = true;
        try { await d.logger.tutorAsked(record(target, outcome, usage, cost)); } catch { logged = false; } finally { release(); }
        observe(target, outcome, usage);
        if (!out.aborted) {
          const summary: TutorSummary = { outcome, message: logged ? message : message ?? NOT_LOGGED, cost_usd: cost,
            spent_today_usd: ledger.spentOn(new Date()), cap_usd: cap(), counted: logged && outcome === 'answered' && target !== null };
          await out.write(SUMMARY_MARK + JSON.stringify(summary));
        }
      }
    });
  });
}

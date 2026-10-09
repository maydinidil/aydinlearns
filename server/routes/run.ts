// server/routes/run.ts: the timed GA4 runs, mini drills, half-mocks and full mocks (design §8, §14 GA4 section; rulings S3-01 to
// S3-10 and S3-12; owner decisions D25, D26, D27, D65, D70, D72; Task B2; sprint 5b Tasks B4 and B5).
// POST /api/run/start { section: 'ga4', kind: 'mini_drill' | 'half_mock' | 'full_mock' }: serves a run as one block (phase drill or
//   mock) under the blueprint in force today (blueprintOn). A start while any timed run is on, an SQL drill included, is a 409 that
//   carries that run (S3-08). Nothing is logged.
// GET /api/run/current: the GA4 run that is on, so the screen can pick it up again.
// GET /api/run/preview: the date unseen questions come back for each mock (ruling A, D27). Read only.
// POST /api/run/end { block_id }: ends a GA4 run before its limit; answers its score.
// GET /api/run/history?section=ga4: today's blueprints and the ended runs, newest first, with their scores, from the logs (S3-10).
//   Never minutes.
// GET /api/run/:block_id/review: an ended run's review: a mini drill's items (S3-03), a mock's numbers and topics (S3-12).
// GET /api/ga4/readiness: the readiness check (sprint 5b Task B5; D70, Ruling 7), advice only: the mock part from the ended runs and
//   the topic part from each item's cold answer, per topic in exam.json's order with its names (server/readiness.ts). It names no item.
//   Nothing is served, started or logged; a run past its limit ends first, as for the history (S2-42).
// A run ends at its limit (a server timer and the check on every request, S2-42), by the learner, or at a session end (S3-09); its
// end closes every served item run_end and writes one rated block_close (routes/drill.ts's end, shared through DrillRuns).
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { isUnseen, nextUnseenDate, type ExamHistory } from '../../core/exam.ts';
import { amsterdamDate } from '../../core/time.ts';
import { blueprintOn, type Ga4ExamConfig } from '../../schemas/ga4-exam.ts';
import type { RouteDeps } from '../app.ts';
import type { DrillRuns } from '../drill.ts';
import { coldAnswers, instanceFacts, type InstanceFact } from '../progress.ts';
import { ga4Readiness } from '../readiness.ts';
import {
  answeredPositions, CHOICE_RUN_KINDS, choiceRuns, drawRun, examHistory, historyRow, isChoicePlan, isGa4Item, isMockKind, lastShowing, PHASE_OF, REVIEW_WAITS, reviewOf,
  runView, seenWindow, type ChoiceRun, type ChoiceRunKind, type ChoiceRunPlan,
} from '../run.ts';
import { seenIn } from '../session-composer.ts';
import { LESSON_WINDOW_MS } from '../state.ts';

const refuse = (status: 400 | 404 | 409, message: string): HTTPException => new HTTPException(status, { message });
async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Record<string, unknown>;
}
const NAME: Record<ChoiceRunKind, string> = { mini_drill: 'mini drill', half_mock: 'half-mock', full_mock: 'full mock' };

export function mountRun(app: Hono, d: RouteDeps, runs: DrillRuns): void {
  const config = (): Ga4ExamConfig => {
    const cfg = d.content.ga4Exam?.();
    if (!cfg) throw refuse(404, 'GA4 runs are not set up yet: content/ga4/exam.json is missing.');
    return cfg;
  };
  /** The GA4 items a run may ask: active, with a key (S2-64: needs_fix and retired items are never served). */
  const askable = () => (d.content.choiceItems?.('ga4') ?? []).filter(isGa4Item).filter((i) => i.status === 'active' && d.content.choiceKey?.(i.id) !== undefined);
  /**
   * S3-02: a mini drill draws from the whole non-held-out bank; S3-06: a half-mock or a full mock only from the held-out pool, and
   * (owner decision, design §8) only from core items. server/content.ts counts the same pool at load for the full mock's check.
   */
  const poolOf = (kind: ChoiceRunKind) => askable().filter((i) => (d.content.heldOut?.(i.id) ?? false) === isMockKind(kind) && (!isMockKind(kind) || i.exam_relevance === 'core'));
  const history = async (): Promise<ChoiceRun[]> => choiceRuns(await d.logger.readAll('attempts'),
    { cfg: config(), itemOf: (id) => d.content.choiceItem?.(id), events: await d.logger.readAll('events') });
  const section = (v: unknown): void => { if (v !== 'ga4') throw refuse(400, 'section must be ga4.'); };

  app.post('/api/run/start', async (c) => {
    const b = await readBody(c);
    section(b.section);
    if (!CHOICE_RUN_KINDS.includes(b.kind as ChoiceRunKind)) throw refuse(400, 'kind must be mini_drill, half_mock or full_mock.');
    const kind = b.kind as ChoiceRunKind;
    const cfg = config();
    await runs.sweep();
    // S3-05: the retake rule reads the whole attempt file. Read before the check below, which nothing may follow with an await.
    const h: ExamHistory | null = isMockKind(kind) ? examHistory(await d.logger.readAll('attempts')) : null;
    // From here to runs.start nothing awaits, so two starts at once (a double click) cannot both pass this check.
    const on = runs.current();
    if (on) return c.json({ error: 'A timed run is already on. End it before starting another.', run: runView(on) }, 409);
    const now = new Date();
    const today = amsterdamDate(now);
    // F14: the entry in force today, the one choiceRuns scores this run with (its start date).
    const bp = blueprintOn(cfg, kind, today);
    const retake = isMockKind(kind) ? blueprintOn(cfg, kind, today).retake_days : 0;
    const pool = poolOf(kind);
    const rule = h === null
      ? seenWindow(seenIn(d.state.current()), now)                        // S3-02: S2-41's 30-day rule
      : { fresh: (id: string) => isUnseen(id, h, now, retake, amsterdamDate), lastShown: (id: string) => lastShowing(h, id) };
    const form = drawRun({ cfg, blueprint: bp, pool, ...rule });
    // As a level drill whose pool is not written yet: a run asks its blueprint's questions, so a pool that cannot fill it waits.
    if (form.picks.length < bp.questions) throw refuse(404, `The ${NAME[kind]} needs ${bp.questions} questions, and ${form.picks.length} can be drawn now.`);
    const block_id = randomUUID();
    const servings = form.picks.map((p) => ({ item_id: p.item.id,
      item_instance_id: d.servings.serve({ phase: PHASE_OF[kind], block_id, repeat_exposure: !p.fresh, section: 'ga4', item_id: p.item.id }) }));
    const plan: ChoiceRunPlan = { section: 'ga4', kind, mode: bp.mode, questions: bp.questions, minutes: bp.minutes, pass_pct: bp.pass_pct,
      on_unseen: h === null ? null : form.allFresh,
      next_unseen_date: h === null || form.allFresh ? null : nextUnseenDate(pool.map((i) => i.id), h, bp.questions, today, retake, amsterdamDate) };
    const run = runs.start({ block_id, plan, started_at: now.getTime(), ends_at: now.getTime() + Math.round(bp.minutes * 60_000), servings });
    return c.json(runView(run));
  });

  app.get('/api/run/current', async (c) => {
    await runs.sweep();                                                  // a run past its limit is over, not current
    const on = runs.current();
    if (!on || !isChoicePlan(on.plan)) return c.json({ run: null });   // an SQL drill is resumed through /api/drill/current
    // B3 I2: which positions have an answer, so a second tab or a cleared tab store resumes an exam where it was. Positions only.
    return c.json({ run: { ...runView(on), answered: answeredPositions(await d.logger.readAll('attempts'), on.servings) } });
  });

  // Ruling A: the entries' "Unseen questions come back on <date>" (D27), for each mock kind. Read only: nothing is served, started or
  // logged, and no sweep runs.
  app.get('/api/run/preview', async (c) => {
    const cfg = config();
    const h = examHistory(await d.logger.readAll('attempts'));
    const now = new Date();
    const today = amsterdamDate(now);
    const pool = poolOf('half_mock');                                   // the full mock's pool too: held out and core
    const dateFor = (kind: 'half_mock' | 'full_mock'): string | null => {
      const bp = blueprintOn(cfg, kind, today);
      const form = drawRun({ cfg, blueprint: bp, pool, fresh: (id) => isUnseen(id, h, now, bp.retake_days, amsterdamDate), lastShown: (id) => lastShowing(h, id) });
      return form.picks.length < bp.questions || form.allFresh ? null : nextUnseenDate(pool.map((i) => i.id), h, bp.questions, today, bp.retake_days, amsterdamDate);
    };
    return c.json({ next_unseen_date: { mini_drill: null, half_mock: dateFor('half_mock'), full_mock: dateFor('full_mock') } });
  });

  app.post('/api/run/end', async (c) => {
    const b = await readBody(c);
    const block = typeof b.block_id === 'string' ? b.block_id : '';
    if (!block) throw refuse(400, 'block_id is missing.');
    const run = runs.get(block);
    if (run && isChoicePlan(run.plan)) await runs.finish(run);
    const r = (await history()).find((x) => x.block_id === block && x.ended_at !== null);
    if (!r) throw refuse(404, 'Unknown GA4 run.');
    return c.json(historyRow(r));
  });

  app.get('/api/run/history', async (c) => {
    // A run past its limit whose timer fired late (a laptop asleep) ends before the history is read (S2-42).
    await runs.sweep();
    section(c.req.query('section'));
    const cfg = config();
    const today = amsterdamDate(new Date());
    const blueprint = (k: ChoiceRunKind) => {                            // the rules a start today runs under, shown before it
      const x = blueprintOn(cfg, k, today);
      return { questions: x.questions, minutes: x.minutes, pass_pct: x.pass_pct, mode: x.mode };
    };
    return c.json({ blueprints: Object.fromEntries(CHOICE_RUN_KINDS.map((k) => [k, blueprint(k)])), topic_names: cfg.topic_names ?? {},
      runs: (await history()).filter((r) => r.ended_at !== null).map(historyRow) });
  });

  app.get('/api/run/:block_id/review', async (c) => {
    await runs.sweep();
    const block = c.req.param('block_id');
    const live = runs.get(block);
    if (live && runs.current() === live) throw refuse(409, REVIEW_WAITS);    // help waits for the end (S3-03)
    if (live) await runs.finish(live);                                       // ending: its end is being written
    const r = (await history()).find((x) => x.block_id === block && x.ended_at !== null);
    if (!r) throw refuse(404, 'Unknown GA4 run.');
    return c.json(reviewOf(r));
  });

  app.get('/api/ga4/readiness', async (c) => {
    await runs.sweep();
    const cfg = config();
    const [attempts, events] = await Promise.all([d.logger.readAll('attempts'), d.logger.readAll('events')]);
    // Every GA4 run, one still on included: ga4Readiness counts only the ended ones. Not `runs`, which names the DrillRuns here.
    const choiceRunList = choiceRuns(attempts, { cfg, itemOf: (id) => d.content.choiceItem?.(id), events });
    // A GA4 item's own topic, as a run's per-topic score reads it; any other item has none.
    const topicOf = (f: InstanceFact): string | null => { const i = d.content.choiceItem?.(f.item_id); return isGa4Item(i) ? i.topic_id : null; };
    const facts = instanceFacts(d.state.current(), attempts, events, (id) => d.content.item(id)?.kind);
    const cold = coldAnswers(facts, attempts, (id) => d.state.catalog().cardOf(id), LESSON_WINDOW_MS, topicOf);
    const names = cfg.topic_names ?? {};
    return c.json(ga4Readiness(choiceRunList, cold, Object.keys(cfg.topic_weights).map((t) => ({ topic_id: t, title: names[t] ?? t }))));
  });
}

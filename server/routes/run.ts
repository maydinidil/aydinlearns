// server/routes/run.ts: the timed GA4 runs, mini drills and half-mocks (design §8, §14 GA4 section; rulings S3-01 to S3-10 and
// S3-12; owner decisions D25, D26, D27; Task B2).
// POST /api/run/start { section: 'ga4', kind: 'mini_drill' | 'half_mock' }: serves a run as one block (phase drill or mock). A
//   start while any timed run is on, an SQL drill included, is a 409 that carries that run (S3-08). Nothing is logged.
// GET /api/run/current: the GA4 run that is on, so the screen can pick it up again.
// POST /api/run/end { block_id }: ends a GA4 run before its limit; answers its score.
// GET /api/run/history?section=ga4: the ended runs, newest first, with their scores, from the logs (S3-10). Never minutes.
// GET /api/run/:block_id/review: an ended run's review: a mini drill's items (S3-03), a half-mock's numbers and topics (S3-12).
// A run ends at its limit (a server timer and the check on every request, S2-42), by the learner, or at a session end (S3-09); its
// end closes every served item run_end and writes one rated block_close (routes/drill.ts's end, shared through DrillRuns).
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { isUnseen, nextUnseenDate, type ExamHistory } from '../../core/exam.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { Ga4ExamConfig } from '../../schemas/ga4-exam.ts';
import type { RouteDeps } from '../app.ts';
import type { DrillRuns } from '../drill.ts';
import {
  answeredPositions, CHOICE_RUN_KINDS, choiceRuns, drawRun, examHistory, historyRow, isChoicePlan, isGa4Item, lastShowing, PHASE_OF, REVIEW_WAITS, reviewOf, runView,
  seenWindow, type ChoiceRun, type ChoiceRunKind, type ChoiceRunPlan,
} from '../run.ts';
import { seenIn } from '../session-composer.ts';

const refuse = (status: 400 | 404 | 409, message: string): HTTPException => new HTTPException(status, { message });
async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Record<string, unknown>;
}
const NAME: Record<ChoiceRunKind, string> = { mini_drill: 'mini drill', half_mock: 'half-mock' };

export function mountRun(app: Hono, d: RouteDeps, runs: DrillRuns): void {
  const config = (): Ga4ExamConfig => {
    const cfg = d.content.ga4Exam?.();
    if (!cfg) throw refuse(404, 'GA4 runs are not set up yet: content/ga4/exam.json is missing.');
    return cfg;
  };
  /** The GA4 items a run may ask: active, with a key (S2-64: needs_fix and retired items are never served). */
  const askable = () => (d.content.choiceItems?.('ga4') ?? []).filter(isGa4Item).filter((i) => i.status === 'active' && d.content.choiceKey?.(i.id) !== undefined);
  /** S3-02: a mini drill draws from the whole non-held-out bank; S3-06: a half-mock only from the held-out pool, and (owner decision, design §8) only from core items. */
  const poolOf = (kind: ChoiceRunKind) => askable().filter((i) => (d.content.heldOut?.(i.id) ?? false) === (kind === 'half_mock') && (kind === 'mini_drill' || i.exam_relevance === 'core'));
  const history = async (): Promise<ChoiceRun[]> => choiceRuns(await d.logger.readAll('attempts'),
    { cfg: config(), itemOf: (id) => d.content.choiceItem?.(id), events: await d.logger.readAll('events') });
  const section = (v: unknown): void => { if (v !== 'ga4') throw refuse(400, 'section must be ga4.'); };

  app.post('/api/run/start', async (c) => {
    const b = await readBody(c);
    section(b.section);
    if (!CHOICE_RUN_KINDS.includes(b.kind as ChoiceRunKind)) throw refuse(400, 'kind must be mini_drill or half_mock.');
    const kind = b.kind as ChoiceRunKind;
    const cfg = config();
    await runs.sweep();
    // S3-05: the retake rule reads the whole attempt file. Read before the check below, which nothing may follow with an await.
    const h: ExamHistory | null = kind === 'half_mock' ? examHistory(await d.logger.readAll('attempts')) : null;
    // From here to runs.start nothing awaits, so two starts at once (a double click) cannot both pass this check.
    const on = runs.current();
    if (on) return c.json({ error: 'A timed run is already on. End it before starting another.', run: runView(on) }, 409);
    const now = new Date();
    const bp = kind === 'half_mock' ? cfg.half_mock : cfg.mini_drill;
    const pool = poolOf(kind);
    const rule = h === null
      ? seenWindow(seenIn(d.state.current()), now)                        // S3-02: S2-41's 30-day rule
      : { fresh: (id: string) => isUnseen(id, h, now, cfg.half_mock.retake_days, amsterdamDate), lastShown: (id: string) => lastShowing(h, id) };
    const form = drawRun({ cfg, blueprint: bp, pool, ...rule });
    // As a level drill whose pool is not written yet: a run asks its blueprint's questions, so a pool that cannot fill it waits.
    if (form.picks.length < bp.questions) throw refuse(404, `The ${NAME[kind]} needs ${bp.questions} questions, and ${form.picks.length} can be drawn now.`);
    const block_id = randomUUID();
    const servings = form.picks.map((p) => ({ item_id: p.item.id,
      item_instance_id: d.servings.serve({ phase: PHASE_OF[kind], block_id, repeat_exposure: !p.fresh, section: 'ga4', item_id: p.item.id }) }));
    const plan: ChoiceRunPlan = { section: 'ga4', kind, mode: bp.mode, questions: bp.questions, minutes: bp.minutes, pass_pct: bp.pass_pct,
      on_unseen: h === null ? null : form.allFresh,
      next_unseen_date: h === null || form.allFresh ? null
        : nextUnseenDate(pool.map((i) => i.id), h, bp.questions, amsterdamDate(now), cfg.half_mock.retake_days, amsterdamDate) };
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

  // Ruling A: the entries' "Unseen questions come back on <date>" (D27). Read only: nothing is served, started or logged, and no sweep runs.
  app.get('/api/run/preview', async (c) => {
    const cfg = config();
    const h = examHistory(await d.logger.readAll('attempts'));
    const now = new Date();
    const pool = poolOf('half_mock');
    const form = drawRun({ cfg, blueprint: cfg.half_mock, pool, fresh: (id) => isUnseen(id, h, now, cfg.half_mock.retake_days, amsterdamDate), lastShown: (id) => lastShowing(h, id) });
    const half_mock = form.picks.length < cfg.half_mock.questions || form.allFresh ? null
      : nextUnseenDate(pool.map((i) => i.id), h, cfg.half_mock.questions, amsterdamDate(now), cfg.half_mock.retake_days, amsterdamDate);
    return c.json({ next_unseen_date: { mini_drill: null, half_mock } });
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
    const blueprint = (k: ChoiceRunKind) => {
      const x = k === 'half_mock' ? cfg.half_mock : cfg.mini_drill;
      return { questions: x.questions, minutes: x.minutes, pass_pct: x.pass_pct, mode: x.mode };
    };
    return c.json({ blueprints: { mini_drill: blueprint('mini_drill'), half_mock: blueprint('half_mock') }, topic_names: cfg.topic_names ?? {},
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
}

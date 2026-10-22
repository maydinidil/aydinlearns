// server/routes/drill.ts: the drill routes (design §4 "A level", §14 Drill; owner decisions D9 and D10; rulings S2-41 to
// S2-47; Task B14). POST /api/drill/start serves a timed run as one block (phase drill); POST /api/drill/end ends it before its
// limit; GET /api/drill/history lists the ended runs with their scores, derived from the logs (S2-43).
// A run's end, at its limit (a server timer, and the check on every request in server/app.ts), by the learner, or at a
// session end, closes every item it served with run_end, reached or not, and then writes its rated block_close (S2-42, S2-45).
// Nothing is logged when a run starts: an item is logged once the learner works on it.
// Task E3 (S4B-23): a start may ask for screen mode (`screen_mode: true`), with the same pools, limits and pass marks; every item is then
// served in screen mode, so the server grades it so (S4B-22) and logs `screen_mode: true` on its attempts, which the history reads.
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION, type SelfCheck } from '../../core/envelope.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import {
  chosenPlan, CUMULATIVE_PREFIX, cumulativeOverall, cumulativePlan, drillRuns, DrillRuns, EXPLAINED_ALOUD, isDrillPlan, isMockPlan, levelPlan, liveRepTiers, liveRuns, LIVE_PREFIX, livePlan,
  drillSpecLoader, pickLiveRepTiered, sampleCumulative, sampleDrill, type CumulativeSpec, type DrillFile, type DrillPlan, type DrillRun, type DrillSpec, type LiveRun,
  type RunEntry,
} from '../drill.ts';
import { journey, type JourneyAttributes } from '../journey.ts';
import { choiceRuns, runView } from '../run.ts';
import { poolOf, seenIn } from '../session-composer.ts';

/**
 * K10 (S6-18, D81) and M1 (S6-31): a run's `run_finished` is sent once, by the call whose own finish ended the run: the app's end
 * (its timer, a request after the limit, a session end) or the end route that finished it in memory. The sets are the app's own
 * (DrillRuns.endedHere and finishSent), shared by the SQL and GA4 end routes. An end route that finds the block already in history
 * after a restart did not end it, so it sends nothing. A block is claimed only by the call that sends, after its history read has
 * succeeded, so a read that fails claims nothing and the other end, in the same app, still sends.
 */
export function runFinishedOnce(runs: Pick<DrillRuns, 'endedHere' | 'finishSent'>, blockId: string, attrs: JourneyAttributes): void {
  if (!runs.endedHere.has(blockId) || runs.finishSent.has(blockId)) return;
  runs.finishSent.add(blockId);
  journey('run_finished', attrs);
}

const refuse = (status: 400 | 404 | 409, message: string): HTTPException => new HTTPException(status, { message });
async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Record<string, unknown>;
}
/** The kinds a run serves: blank-editor and fix-this-query items (as the review pools, S2-35). */
const servable = (i: SqlItem | undefined): i is SqlItem => i !== undefined && (i.kind === 'write' || i.kind === 'fix');

/**
 * What a start answers, and a second start while a run is on: the run, its limit (a test rule, which may be shown) and its items
 * (drillRunView). Task B2 (S3-08): the run that is on may be a GA4 run, which answers in its own shape (server/run.ts runView).
 */
const view = runView;
/** A history row: the date, the mode (S4B-23), the score, the pass and the unseen share (S2-43). No study time. */
const row = (r: DrillRun) => ({ block_id: r.block_id, kind: r.kind, level: r.level, date: r.date, screen_mode: r.screen_mode, ...r.score });

/**
 * S4B-26: a live rep's history row, kind `live_rep`: one question, passed when the item passed and "explained aloud" is ticked (D42). The
 * score is the rep's own; it counts for no level. `explained_aloud` tells "logged only" from a pass.
 */
const liveScore = (r: LiveRun) => ({ passed: r.item_passed ? 1 : 0, questions: 1, pct: r.item_passed ? 100 : 0, run_passed: r.passed, unseen: 1, unseen_pct: 100, counts_for_level: false });
const liveRow = (r: LiveRun) => ({ block_id: r.block_id, kind: 'live_rep' as const, level: null, date: r.local_date, screen_mode: true, explained_aloud: r.explained_aloud, ...liveScore(r) });

/**
 * Mounts the drill routes and returns the runs in progress: the gate server/app.ts asks before help and submissions, which the GA4
 * run routes and the choice routes share (Task B2, S3-08).
 */
export function mountDrill(app: Hono, d: RouteDeps): DrillRuns {
  const { specs, cumulative: cumulativeSpecs } = drillSpecLoader(d.content);
  const runs = new DrillRuns({
    // Every item the run served closes with run_end, rated like any close (S2-15); then the block_close, one review per card
    // at the worst rating (S2-45). Writes through the logger only: a session end runs this inside the tracker's queue.
    end: async (run, at) => {
      for (const s of run.servings) await d.writeClose(s.item_instance_id, 'run_end', at);
      await d.logger.blockClose(d.state.rateBlockClose({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: at.toISOString(), block_id: run.block_id, card_reviews: [] }, at));
      for (const s of run.servings) d.servings.forget(s.item_instance_id);
      await sendRunFinished(run);                                      // K10: after the block_close, unless the browser's end sends it
    },
    ...d.runClock,                                                     // sprint 7 (Task M2): a test's clock and timers; absent, the real ones
  });
  /** K10: the `run_finished` of a run the app ends (its timer, a request after the limit, a session end), with the browser end's fields. */
  async function sendRunFinished(run: RunEntry): Promise<void> {
    if (isMockPlan(run.plan)) return;                                  // sprint 7: a mock's run_finished is the mock routes' (routes/mocks.ts)
    try {
      if (isDrillPlan(run.plan)) {
        const r = (await history()).find((x) => x.block_id === run.block_id);
        if (r) {
          runFinishedOnce(runs, r.block_id, { section: 'sql', run_kind: r.kind, block_id: r.block_id, score_pct: r.score.pct, run_passed: r.score.run_passed,
            ...(r.level === null ? {} : { level: r.level }) });
          return;
        }
        const live = liveRuns(await d.logger.readAll('attempts'), await d.logger.readAll('events')).find((x) => x.block_id === run.block_id);
        if (live) runFinishedOnce(runs, live.block_id, { section: 'sql', run_kind: 'live_rep', block_id: live.block_id, score_pct: liveScore(live).pct });
        return;
      }
      const cfg = d.content.ga4Exam?.();
      if (!cfg) return;
      const r = choiceRuns(await d.logger.readAll('attempts'), { cfg, itemOf: (id) => d.content.choiceItem?.(id), events: await d.logger.readAll('events') })
        .find((x) => x.block_id === run.block_id && x.ended_at !== null);
      if (r) runFinishedOnce(runs, r.block_id, { section: 'ga4', run_kind: r.kind, block_id: r.block_id, score_pct: r.score.pct, run_passed: r.score.pass });
    } catch (e) {
      console.error(`aydinlearns: the run_finished of ${run.block_id} could not be sent (${e instanceof Error ? e.message : String(e)}).`);
    }
  }
  /** A level's drill pool: the `use: 'drill'` items its spec lists that exist (history tells a level run by them, S2-46). */
  const levelPool = (spec: DrillSpec): SqlItem[] => spec.pool_item_ids.map((id) => d.content.item(id)).filter((i): i is SqlItem => servable(i) && i.use === 'drill');
  const history = async (): Promise<DrillRun[]> =>
    drillRuns(await d.logger.readAll('attempts'), await d.logger.readAll('events'), (id) => d.content.item(id), await specs(),
      (id) => d.content.choiceItem?.(id) !== undefined, await cumulativeSpecs());   // a GA4 mini drill is listed by /api/run/history

  /**
   * S6-19 (Task B4): the cumulative levels 1-4 drill. 3 items from each level's drill pool, unseen first, in screen mode (the entry's mode),
   * 30 minutes, as one block whose block_id starts `cum-`. Nothing is logged at the start. A level short of unseen items gives seen ones,
   * and one with too small a pool gives what it has; the reply's `fill` says so, level by level. Refused only when no level has an item.
   */
  app.post('/api/drill/cumulative/start', async (c) => {
    await runs.sweep();
    const all = await specs();
    const spec = (await cumulativeSpecs())[0];
    // From here to runs.start nothing awaits, so two starts at once (a double click) cannot both pass this check.
    const on = runs.current();
    if (on) return c.json({ error: 'A drill is already running. End it before starting another.', run: view(on) }, 409);
    if (!spec) throw refuse(404, 'There is no cumulative drill yet.');
    const now = new Date();
    const { picks, fill } = sampleCumulative({ spec, specs: all, itemOf: (id) => d.content.item(id), seen: seenIn(d.state.current()), now });
    if (!picks.length) throw refuse(404, 'No drill exercises are written yet, so there is no cumulative drill.');
    const plan = cumulativePlan(spec, picks.length, fill);
    const block_id = `${CUMULATIVE_PREFIX}${randomUUID()}`;
    const servings = picks.map((p) => ({ item_id: p.item.id,
      item_instance_id: d.servings.serve({ phase: 'drill', block_id, repeat_exposure: p.repeat_exposure, section: 'sql', item_id: p.item.id,
        ...(plan.screen_mode ? { screen_mode: true as const } : {}) }) }));
    const run = runs.start({ block_id, plan, started_at: now.getTime(), ends_at: now.getTime() + Math.round(plan.minutes * 60_000), servings });
    journey('run_started', { section: 'sql', run_kind: 'cumulative', block_id, questions: plan.questions, screen_mode: plan.screen_mode === true });   // D77
    return c.json(view(run));
  });

  /**
   * S4B-26 (D42): a live rep. One item not seen in 30 days, in screen mode, 10 minutes, as one block whose block_id starts `live-`.
   * Nothing is logged at the start. D49 (sprint 4c): the item comes from the drill pools of the levels whose concepts are all Practised
   * or better (level 1 when none) when one is fresh there, else from the other levels with a drill, nearest first (liveRepTiers). The
   * start refuses only when no level has a fresh one.
   */
  app.post('/api/drill/live/start', async (c) => {
    await runs.sweep();
    const all = await specs();
    const on = runs.current();
    if (on) return c.json({ error: 'A drill is already running. End it before starting another.', run: view(on) }, 409);
    const state = d.state.current();
    const tiers = liveRepTiers(all, (id) => state.concepts.get(id)?.state).map((levels) => all.filter((s) => levels.includes(s.level)).flatMap(levelPool));
    if (!tiers.some((pool) => pool.length)) throw refuse(404, 'No drill exercises are written yet, so there is no live rep.');
    const now = new Date();
    const item = pickLiveRepTiered({ tiers, seen: seenIn(state), now, random: Math.random });
    if (!item) throw refuse(404, 'Every drill exercise was seen in the last 30 days, so there is no new one for a live rep yet.');
    const block_id = `${LIVE_PREFIX}${randomUUID()}`;
    const servings = [{ item_id: item.id, item_instance_id: d.servings.serve({ phase: 'drill', block_id, repeat_exposure: false, section: 'sql', item_id: item.id, screen_mode: true }) }];
    const plan = livePlan(item);
    const run = runs.start({ block_id, plan, started_at: now.getTime(), ends_at: now.getTime() + plan.minutes * 60_000, servings });
    journey('run_started', { section: 'sql', run_kind: 'live_rep', block_id, questions: 1, screen_mode: true });   // D77
    return c.json(view(run));
  });

  /**
   * S4B-26 (D42): "explained aloud", the self-check after a rep. It names the rep's block and no instance (a self-check never closes or
   * reopens one). `ticked: false` takes the tick back; the latest word counts. Refused while the rep runs.
   */
  app.post('/api/drill/self-check', async (c) => {
    const b = await readBody(c);
    const block = typeof b.block_id === 'string' ? b.block_id : '';
    if (!block) throw refuse(400, 'block_id is missing.');
    if (typeof b.ticked !== 'boolean') throw refuse(400, 'ticked must be true or false.');
    if (runs.get(block)) throw refuse(409, 'The rep is still running. Tick this when it has ended.');
    if (!liveRuns(await d.logger.readAll('attempts'), []).some((r) => r.block_id === block)) throw refuse(404, 'Unknown live rep.');
    const record: SelfCheck = { record: 'self_check', schema_version: SCHEMA_VERSION, ts: new Date().toISOString(), session_id: d.session.currentId ?? '',
      kind: EXPLAINED_ALOUD, phase: 'drill', case_id: null, item_instance_id: null, block_id: block, text: null, fields: null, ticked: b.ticked ? [EXPLAINED_ALOUD] : [] };
    await d.logger.selfCheck(record);
    return c.json({ block_id: block, ticked: b.ticked });
  });

  app.post('/api/drill/start', async (c) => {
    const b = await readBody(c);
    if (b.screen_mode !== undefined && typeof b.screen_mode !== 'boolean') throw refuse(400, 'screen_mode must be true or false.');
    const screen_mode = b.screen_mode === true;
    await runs.sweep();
    const all = await specs();
    // From here to runs.start nothing awaits, so two starts at once (a double click) cannot both pass this check.
    const on = runs.current();
    if (on) return c.json({ error: 'A drill is already running. End it before starting another.', run: view(on) }, 409);
    let plan: DrillPlan;
    let pool: SqlItem[];
    if (b.level !== undefined && b.concept_ids === undefined) {
      if (!Number.isInteger(b.level)) throw refuse(400, 'The level must be a whole number.');
      const spec = all.find((s) => s.level === b.level);
      if (!spec) throw refuse(404, `There is no drill for level ${String(b.level)} yet.`);
      pool = levelPool(spec);
      if (pool.length < spec.questions) throw refuse(404, `The level ${spec.level} drill needs ${spec.questions} exercises, and ${pool.length} are written so far.`);
      plan = { ...levelPlan(spec), screen_mode };
    } else if (Array.isArray(b.concept_ids) && b.level === undefined) {
      // S2-47 and design §4 (RULE-18 overridden): any concepts, from their practice pools, so the level pools stay unseen.
      const known = new Map(d.content.curriculum.concepts.map((x) => [x.id, x.level]));
      const ids = [...new Set(b.concept_ids)];
      if (!ids.length || !ids.every((x): x is string => typeof x === 'string' && known.has(x))) throw refuse(400, 'Choose one or more concepts from the map.');
      pool = ids.flatMap((x) => poolOf(d.content, x).filter((i) => i.use === 'pool' && servable(i)));
      if (!pool.length) throw refuse(404, 'These concepts have no exercises yet.');
      plan = { ...chosenPlan(ids.filter((x) => pool.some((i) => i.target_concept_id === x)), pool.length, ids.map((x) => known.get(x)!), all), screen_mode };
    } else {
      throw refuse(400, 'Send a level, or a list of concept_ids.');
    }
    const now = new Date();
    // seenIn skips unreached drill items (S2-97): an item a run never reached is unseen and never a repeat exposure.
    const picks = sampleDrill({ pool, concepts: plan.concepts, questions: plan.questions, seen: seenIn(d.state.current()), now });
    const block_id = randomUUID();
    const servings = picks.map((p) => ({ item_id: p.item.id,
      item_instance_id: d.servings.serve({ phase: 'drill', block_id, repeat_exposure: p.repeat_exposure, section: 'sql', item_id: p.item.id,
        ...(screen_mode ? { screen_mode: true as const } : {}) }) }));
    const run = runs.start({ block_id, plan, started_at: now.getTime(), ends_at: now.getTime() + Math.round(plan.minutes * 60_000), servings });
    journey('run_started', { section: 'sql', run_kind: plan.kind, block_id, questions: plan.questions, screen_mode, ...(plan.level === null ? {} : { level: plan.level }) });   // D77
    return c.json(view(run));
  });

  app.post('/api/drill/end', async (c) => {
    const b = await readBody(c);
    const block = typeof b.block_id === 'string' ? b.block_id : '';
    if (!block) throw refuse(400, 'block_id is missing.');
    const run = runs.get(block);
    const served = run && isDrillPlan(run.plan) ? run.servings.map((s) => s.item_instance_id) : null;   // the drill order, held while the run is in memory
    if (run && isDrillPlan(run.plan)) await runs.finish(run);          // a GA4 run ends through /api/run/end; its end may send run_finished
    const r = (await history()).find((x) => x.block_id === block);
    if (!r) {
      const live = liveRuns(await d.logger.readAll('attempts'), await d.logger.readAll('events')).find((x) => x.block_id === block);
      // D77: the rep's score as this reply gives it. Its pass waits for the "explained aloud" tick, which can only come after the end,
      // so it is left out here; the tick is its own journey event (case_self_check).
      if (live) runFinishedOnce(runs, live.block_id, { section: 'sql', run_kind: 'live_rep', block_id: live.block_id, score_pct: liveScore(live).pct });
      if (live) return c.json({ block_id: live.block_id, kind: 'live_rep', level: null, score: liveScore(live) });
      throw refuse(404, 'Unknown drill run.');
    }
    // H3: one mark per question, in drill order when the run was in memory, else in log order (a screen matches them by instance).
    const items = served ? served.flatMap((id) => r.questions.filter((q) => q.item_instance_id === id)) : r.questions;
    runFinishedOnce(runs, r.block_id, { section: 'sql', run_kind: r.kind, block_id: r.block_id, score_pct: r.score.pct, run_passed: r.score.run_passed,   // D77
      ...(r.level === null ? {} : { level: r.level }) });
    return c.json({ block_id: r.block_id, kind: r.kind, level: r.level, score: r.score, items });
  });

  // The run in progress, if any, so the screen can pick it up again after the learner left it (Task B16, fix round 1). Sweeps first:
  // a run past its limit is over, not current.
  app.get('/api/drill/current', async (c) => {
    await runs.sweep();
    const on = runs.current();
    return c.json({ run: on && isDrillPlan(on.plan) ? view(on) : null });     // a GA4 run is resumed through /api/run/current
  });

  app.get('/api/drill/history', async (c) => {
    // A run past its limit whose timer fired late (a laptop asleep) ends before the history is read (S2-42). The one GET that
    // may write: the run's end was due anyway.
    await runs.sweep();
    const q = c.req.query('level');
    const level = q === undefined ? null : Number(q);
    if (level !== null && !Number.isInteger(level)) throw refuse(400, 'The level must be a whole number.');
    const all = await specs();
    const spec = level === null ? undefined : all.find((s) => s.level === level);
    const drill = spec ? { level: spec.level, questions: spec.questions, minutes: spec.minutes, pass_pct: spec.pass_pct, unseen_min_pct: spec.unseen_min_pct,
      available: levelPool(spec).length >= spec.questions } : null;
    const listed = (await history()).filter((r) => r.ended_at !== null && (level === null || (r.kind === 'level' && r.level === level)));
    // S4B-26: the live reps, listed as kind live_rep, newest first among the runs; never under a level.
    const reps = level === null ? liveRuns(await d.logger.readAll('attempts'), await d.logger.readAll('events')).map(liveRow) : [];
    const rows = [...listed.map(row), ...reps].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    // S6-19: what the cumulative drill would draw now, for the start screen: its rule and, level by level, what came from seen items or was short.
    const cumulative = level === null ? (await cumulativeSpecs()).map((spec) => {
      const { picks, fill } = sampleCumulative({ spec, specs: all, itemOf: (id) => d.content.item(id), seen: seenIn(d.state.current()), now: new Date() });
      return { id: spec.id, levels: spec.levels, questions: picks.length, minutes: spec.minutes, pass_pct: spec.pass_pct, unseen_min_pct: spec.unseen_min_pct,
        available: picks.length > 0, fill, overall: cumulativeOverall(fill) };
    }) : [];
    return c.json({ drill, runs: rows, cumulative });
  });

  // S2-16: a session end ends every run, before the app's own hook closes what is left.
  d.endHooks.push(async (at) => { await runs.finishAll(at); });
  return runs;
}

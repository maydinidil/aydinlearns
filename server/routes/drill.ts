// server/routes/drill.ts: the drill routes (design §4 "A level", §14 Drill; owner decisions D9 and D10; rulings S2-41 to
// S2-47; Task B14). POST /api/drill/start serves a timed run as one block (phase drill); POST /api/drill/end ends it before its
// limit; GET /api/drill/history lists the ended runs with their scores, derived from the logs (S2-43).
// A run's end, at its limit (a server timer, and the check on every request in server/app.ts), by the learner, or at a
// session end, closes every item it served with run_end, reached or not, and then writes its rated block_close (S2-42, S2-45).
// Nothing is logged when a run starts: an item is logged once the learner works on it.
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import {
  chosenPlan, drillRuns, DrillRuns, isDrillPlan, levelPlan, loadDrills, sampleDrill, type DrillPlan, type DrillRun, type DrillSpec,
} from '../drill.ts';
import { runView } from '../run.ts';
import { poolOf, seenIn } from '../session-composer.ts';

const refuse = (status: 400 | 404, message: string): HTTPException => new HTTPException(status, { message });
async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Record<string, unknown>;
}
/** The kinds a run serves: blank-editor and fix-this-query items (as the review pools, S2-35). */
const servable = (i: SqlItem | undefined): i is SqlItem => i !== undefined && (i.kind === 'write' || i.kind === 'fix');
/** A store may carry the drill specs (a test's fixture; Task B12 may add it); otherwise they come from content/sql/drills.json. */
const ownSpecs = (content: ContentStore): DrillSpec[] | undefined => (content as ContentStore & { drills?: () => DrillSpec[] }).drills?.();

/**
 * What a start answers, and a second start while a run is on: the run, its limit (a test rule, which may be shown) and its items
 * (drillRunView). Task B2 (S3-08): the run that is on may be a GA4 run, which answers in its own shape (server/run.ts runView).
 */
const view = runView;
/** A history row: the date, the score, the pass and the unseen share (S2-43). No study time. */
const row = (r: DrillRun) => ({ block_id: r.block_id, kind: r.kind, level: r.level, date: r.date, ...r.score });

/**
 * Mounts the drill routes and returns the runs in progress: the gate server/app.ts asks before help and submissions, which the GA4
 * run routes and the choice routes share (Task B2, S3-08).
 */
export function mountDrill(app: Hono, d: RouteDeps): DrillRuns {
  let file: Promise<DrillSpec[]> | null = null;
  const specs = (): Promise<DrillSpec[]> => {
    const own = ownSpecs(d.content);
    return own ? Promise.resolve(own) : (file ??= loadDrills().catch((e: unknown) => { file = null; throw e; }));
  };
  const runs = new DrillRuns({
    // Every item the run served closes with run_end, rated like any close (S2-15); then the block_close, one review per card
    // at the worst rating (S2-45). Writes through the logger only: a session end runs this inside the tracker's queue.
    end: async (run, at) => {
      for (const s of run.servings) await d.writeClose(s.item_instance_id, 'run_end', at);
      await d.logger.blockClose(d.state.rateBlockClose({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: at.toISOString(), block_id: run.block_id, card_reviews: [] }, at));
      for (const s of run.servings) d.servings.forget(s.item_instance_id);
    },
  });
  /** A level's drill pool: the `use: 'drill'` items its spec lists that exist (history tells a level run by them, S2-46). */
  const levelPool = (spec: DrillSpec): SqlItem[] => spec.pool_item_ids.map((id) => d.content.item(id)).filter((i): i is SqlItem => servable(i) && i.use === 'drill');
  const history = async (): Promise<DrillRun[]> =>
    drillRuns(await d.logger.readAll('attempts'), await d.logger.readAll('events'), (id) => d.content.item(id), await specs(),
      (id) => d.content.choiceItem?.(id) !== undefined);                // a GA4 mini drill is listed by /api/run/history

  app.post('/api/drill/start', async (c) => {
    const b = await readBody(c);
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
      plan = levelPlan(spec);
    } else if (Array.isArray(b.concept_ids) && b.level === undefined) {
      // S2-47 and design §4 (RULE-18 overridden): any concepts, from their practice pools, so the level pools stay unseen.
      const known = new Map(d.content.curriculum.concepts.map((x) => [x.id, x.level]));
      const ids = [...new Set(b.concept_ids)];
      if (!ids.length || !ids.every((x): x is string => typeof x === 'string' && known.has(x))) throw refuse(400, 'Choose one or more concepts from the map.');
      pool = ids.flatMap((x) => poolOf(d.content, x).filter((i) => i.use === 'pool' && servable(i)));
      if (!pool.length) throw refuse(404, 'These concepts have no exercises yet.');
      plan = chosenPlan(ids.filter((x) => pool.some((i) => i.target_concept_id === x)), pool.length, ids.map((x) => known.get(x)!), all);
    } else {
      throw refuse(400, 'Send a level, or a list of concept_ids.');
    }
    const now = new Date();
    // seenIn skips unreached drill items (S2-97): an item a run never reached is unseen and never a repeat exposure.
    const picks = sampleDrill({ pool, concepts: plan.concepts, questions: plan.questions, seen: seenIn(d.state.current()), now });
    const block_id = randomUUID();
    const servings = picks.map((p) => ({ item_id: p.item.id,
      item_instance_id: d.servings.serve({ phase: 'drill', block_id, repeat_exposure: p.repeat_exposure, section: 'sql', item_id: p.item.id }) }));
    const run = runs.start({ block_id, plan, started_at: now.getTime(), ends_at: now.getTime() + Math.round(plan.minutes * 60_000), servings });
    return c.json(view(run));
  });

  app.post('/api/drill/end', async (c) => {
    const b = await readBody(c);
    const block = typeof b.block_id === 'string' ? b.block_id : '';
    if (!block) throw refuse(400, 'block_id is missing.');
    const run = runs.get(block);
    if (run && isDrillPlan(run.plan)) await runs.finish(run);          // a GA4 run ends through /api/run/end
    const r = (await history()).find((x) => x.block_id === block);
    if (!r) throw refuse(404, 'Unknown drill run.');
    return c.json({ block_id: r.block_id, kind: r.kind, level: r.level, score: r.score });
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
    return c.json({ drill, runs: listed.map(row) });
  });

  // S2-16: a session end ends every run, before the app's own hook closes what is left.
  d.endHooks.push(async (at) => { await runs.finishAll(at); });
  return runs;
}

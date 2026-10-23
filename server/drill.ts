// server/drill.ts: the drill runner's rules (design §4 "A level", §5 the drill row, §12 drill pools; owner decisions D9 and
// D10; rulings S2-41 to S2-47; Task B14). It holds the drill specs (content/sql/drills.json), the draw of a run's items, the
// score, the run history, which is derived from the logs alone (S2-43), and the clock of the runs in progress.
// routes/drill.ts serves them over HTTP; server/app.ts asks the clock before every submission and every hint or "show answer".
// A run is one block (S2-46): its items are served with phase drill and one block_id, and no record marks its start.
// Task B2 (S3-08): the clock of the runs in progress (DrillRuns) holds the timed GA4 runs too (server/run.ts), so one timed run is
// on at a time across sections. A GA4 run is never an SQL drill: drillRuns leaves its blocks out of the SQL history.
// Sprint 7 Part 2 (Task N2; S7-15, S7-C25): a take-home mock keeps its own wall clock: a session end (finishAll) never ends it, and
// openTakeHomes reads the ones the log holds open, which the mock routes rebuild in the clock at an app start (routes/mock-cases.ts).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { countsAsAttempt } from '../core/rating.ts';
import { isUnreached } from '../core/replay.ts';
import { interleave } from '../core/session.ts';
import type { ConceptStateName } from '../core/states.ts';
import { amsterdamDate } from '../core/time.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { MockKind } from '../schemas/mock.ts';
import { deadlineOf, openMinutes } from './mocks.ts';
import type { ChoiceRunPlan } from './run.ts';

const DAY_MS = 86_400_000;
/** S2-41, S2-43: an item is unseen when no instance of it started in the 30 days before. */
export const SEEN_WINDOW_MS = 30 * DAY_MS;
/** S2-47: a learner-started drill asks this many questions, or one per concept when more are chosen, or all there are. */
export const CHOSEN_QUESTIONS = 10;
/** Design §5: inside a timed drill, hints and "show answer" wait for the end-of-run review (the text the screen shows too). */
export const HELP_WAITS = 'Help opens in the end-of-run review.';
/** S2-42: an answer to an item of a run that is over. */
export const RUN_OVER = 'This drill has ended, so it takes no more answers. Its review is open.';
/** S2-42 and S7-06 in a mock's words: an answer to an item of a mock run that is over. */
export const MOCK_RUN_OVER = 'This mock has ended, so it takes no more answers. Its review is open.';
/**
 * F4-2-1: a question named through an instance its mock run does not hold: one served before an app restart, which the rebuilt take-home
 * (S7-C25) replaced. Sent with CODE_RUN_CHANGED (server/run.ts), so the screen reads the run again and opens the question on its new instance.
 */
export const MOCK_RUN_CHANGED = 'This question was opened before the app restarted, so it opens again.';
/** S7-03: each question takes one graded answer (ONE_ANSWER's pattern, server/run.ts, in the mock's words). */
export const MOCK_ONE_ANSWER = 'This question already has its answer. A mock takes one answer per question.';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const iso = (ms: number): string => new Date(ms).toISOString();

// ---- the specs (content/sql/drills.json) -------------------------------------------------------------------------

export interface DrillSpec {
  level: number; questions: number; minutes: number; pass_pct: number; concepts: string[]; unseen_min_pct: number; mode: string;
  /** The level's drill pool (design §12: about 30 `use: 'drill'` items), in the order it offers them. Task B12 fills it. */
  pool_item_ids: string[];
}
/**
 * S6-19 (sprint 6 Task B2): a cumulative drill, keyed by `id`, draws `per_level` items from the drill pool of each of `levels`. It has
 * no pool, questions or concepts of its own. Task B4 runs it (sampleCumulative, cumulativePlan).
 */
export interface CumulativeSpec {
  id: string; levels: number[]; per_level: number; minutes: number; pass_pct: number; unseen_min_pct: number; mode: string;
}
/** The whole file: its level drills (`level`) and its cumulative drills (`id`, `levels`, `per_level`), each in file order. */
export interface DrillFile { levels: DrillSpec[]; cumulative: CumulativeSpec[] }
export const DRILLS_PATH = fileURLToPath(new URL('../content/sql/drills.json', import.meta.url));
const DRILLS_FILE = 'content/sql/drills.json';
/** The curriculum's levels (01 LVL-01 to LVL-07): a cumulative drill may name these. */
const LEVELS = 7;

/** The level specs, or an error that names the file and the drill. Cumulative entries are checked too, and left out. */
export function parseDrills(x: unknown): DrillSpec[] {
  return parseDrillFile(x).levels;
}

/** Every spec in the file, or an error that names the file and the drill. */
export function parseDrillFile(x: unknown): DrillFile {
  const list = (x as { drills?: unknown } | null)?.drills;
  if (!Array.isArray(list)) throw new Error(`${DRILLS_FILE}: "drills" must be a list.`);
  const out: DrillFile = { levels: [], cumulative: [] };
  const levels = new Set<number>();
  const cumulativeIds = new Set<string>();
  list.forEach((d: unknown, i) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const where = `${DRILLS_FILE}: drill ${i + 1}`;
    const whole = (k: string): number => {
      const v = o[k];
      if (!Number.isInteger(v) || (v as number) < 1) throw new Error(`${where} needs ${k} as a whole number of 1 or more.`);
      return v as number;
    };
    const percent = (k: string): number => {
      const v = o[k];
      if (typeof v !== 'number' || !(v >= 0 && v <= 100)) throw new Error(`${where} needs ${k} between 0 and 100.`);
      return v;
    };
    const ids = (k: string, required: boolean): string[] => {
      const v = o[k];
      if (v === undefined && !required) return [];
      if (!Array.isArray(v) || !v.every((s) => typeof s === 'string' && s !== '')) throw new Error(`${where} needs ${k} as a list of IDs.`);
      return [...v] as string[];
    };
    const minutes = (): number => {
      const v = o.minutes;
      if (typeof v !== 'number' || !(v > 0) || !Number.isFinite(v)) throw new Error(`${where} needs minutes above 0.`);
      return v;
    };
    const mode = o.mode === undefined ? 'normal' : o.mode;
    // S6-35: a mode is checked when the file loads, so a typo is a load error naming the entry (C19 reports it), never a 500 at start.
    const checkMode = (name: string): string => {
      if (mode !== 'normal' && mode !== 'screen') throw new Error(`${where} (${name}) has mode ${JSON.stringify(mode)}, and the mode must be normal or screen.`);
      return mode;
    };
    if (o.id !== undefined || o.levels !== undefined || o.per_level !== undefined) {
      if (o.level !== undefined) throw new Error(`${where} is either a level drill (level) or a cumulative drill (id, levels, per_level), not both.`);
      if (typeof o.id !== 'string' || o.id === '') throw new Error(`${where} needs id as a name.`);
      if (cumulativeIds.has(o.id)) throw new Error(`${where} repeats the cumulative drill ${o.id}.`);
      cumulativeIds.add(o.id);
      const lv = o.levels;
      if (!Array.isArray(lv) || lv.length === 0 || new Set(lv).size !== lv.length
        || !lv.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= LEVELS)) {
        throw new Error(`${where} needs levels as a list of different whole numbers from 1 to ${LEVELS}.`);
      }
      out.cumulative.push({ id: o.id, levels: [...lv] as number[], per_level: whole('per_level'), minutes: minutes(), pass_pct: percent('pass_pct'),
        unseen_min_pct: percent('unseen_min_pct'), mode: checkMode(o.id) });
      return;
    }
    const level = whole('level');
    if (levels.has(level)) throw new Error(`${where} repeats level ${level}.`);
    levels.add(level);
    const m = minutes();
    out.levels.push({ level, questions: whole('questions'), minutes: m, pass_pct: percent('pass_pct'), concepts: ids('concepts', true),
      unseen_min_pct: percent('unseen_min_pct'), mode: checkMode(`level ${level}`), pool_item_ids: ids('pool_item_ids', false) });
  });
  return out;
}

/** Every spec, read from the file: the level drills and the cumulative ones. A missing file means no drills; a malformed one is a fault. */
export async function loadDrillFile(path = DRILLS_PATH): Promise<DrillFile> {
  let text: string;
  try { text = await readFile(path, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { levels: [], cumulative: [] };
    throw e;
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`${DRILLS_FILE}: ${message(e)}`); }
  return parseDrillFile(data);
}

/** The level specs, read from the file. A missing file means no drills; a malformed one is a fault. */
export async function loadDrills(path = DRILLS_PATH): Promise<DrillSpec[]> {
  return (await loadDrillFile(path)).levels;
}

/**
 * The drill specs for a route. A store may carry them (a test's fixture); otherwise they come from content/sql/drills.json, read once
 * (a failed read is not kept, so the next call tries again). routes/drill.ts and routes/progress.ts share this.
 */
export interface DrillSpecLoader { file(): Promise<DrillFile>; specs(): Promise<DrillSpec[]>; cumulative(): Promise<CumulativeSpec[]> }
export function drillSpecLoader(content: object, path = DRILLS_PATH): DrillSpecLoader {
  const store = content as { drills?: () => DrillSpec[]; cumulativeDrills?: () => CumulativeSpec[] };
  let cached: Promise<DrillFile> | null = null;
  const file = (): Promise<DrillFile> => (cached ??= loadDrillFile(path).catch((e: unknown) => { cached = null; throw e; }));
  return {
    file,
    specs: async () => store.drills?.() ?? (await file()).levels,
    /** S6-19: the cumulative entries, from the store when it carries them; a store with level specs and none of these has none. */
    cumulative: async () => store.cumulativeDrills?.() ?? (store.drills?.() ? [] : (await file()).cumulative),
  };
}

// ---- what a run asks ----------------------------------------------------------------------------------------------

/**
 * A run's questions, its time limit (a test rule, which the screen may show) and its pass marks. `screen_mode` (S4B-23): the run was
 * started in screen mode, with the same pool, limit and pass marks; absent means normal mode.
 */
export interface DrillPlan {
  kind: 'level' | 'chosen' | 'cumulative'; level: number | null; concepts: string[]; questions: number; minutes: number; pass_pct: number; unseen_min_pct: number;
  screen_mode?: boolean;
  /** S6-19 (Task B4): a cumulative run's draw, level by level, so the screen can say which questions came from seen items or were short. */
  fill?: CumulativeFill[];
  /** P15 (Task B4 fix): the cumulative run as a whole, so the screen can say when it falls below `unseen_min_pct`. */
  overall?: CumulativeOverall;
  /** S4B-26 (D42, Task E4): a live rep, one unseen item in screen mode, whose block_id starts `live-`. The history lists it apart. */
  live?: boolean;
}
export type Marks = Pick<DrillSpec, 'pass_pct' | 'unseen_min_pct'>;
/** When no spec exists at all: level 1's shape (01 LVL-01). */
const FALLBACK: Pick<DrillSpec, 'questions' | 'minutes' | 'pass_pct' | 'unseen_min_pct'> = { questions: 10, minutes: 20, pass_pct: 90, unseen_min_pct: 70 };
/** S6-19: the marks of a cumulative run when the file holds no cumulative entry to read them from. */
const CUMULATIVE_MARKS: Marks = { pass_pct: 80, unseen_min_pct: 70 };

export function levelPlan(s: DrillSpec): DrillPlan {
  return { kind: 'level', level: s.level, concepts: [...s.concepts], questions: s.questions, minutes: s.minutes, pass_pct: s.pass_pct, unseen_min_pct: s.unseen_min_pct };
}

/** The spec a learner-started drill takes its pace and pass marks from: its highest level's, else the nearest lower one's, else the lowest. */
export function specForLevels(levels: readonly number[], specs: readonly DrillSpec[]): DrillSpec | null {
  const sorted = [...specs].sort((a, b) => a.level - b.level);
  const top = Math.max(-Infinity, ...levels);
  return sorted.filter((s) => s.level <= top).at(-1) ?? sorted[0] ?? null;
}

/**
 * S2-47: a learner-started drill on `concepts` (those with items), from `available` items of `levels`. It asks up to 10
 * questions, at least 1 per concept, at the pace of its spec (20 minutes for 10 at level 1), with the spec's pass marks.
 */
export function chosenPlan(concepts: string[], available: number, levels: readonly number[], specs: readonly DrillSpec[]): DrillPlan {
  const s = specForLevels(levels, specs) ?? FALLBACK;
  const questions = Math.min(available, Math.max(CHOSEN_QUESTIONS, concepts.length));
  return { kind: 'chosen', level: null, concepts: [...concepts], questions, minutes: Math.ceil((questions * s.minutes) / s.questions),
    pass_pct: s.pass_pct, unseen_min_pct: s.unseen_min_pct };
}

// ---- the draw (S2-41) ---------------------------------------------------------------------------------------------

export interface Seen { item_id: string; started_at: string }
export interface DrillPick { concept_id: string; item: SqlItem; repeat_exposure: boolean }

/**
 * S2-41: `questions` items of `pool`. First 1 per concept (in `concepts` order), then the rest spread over the concepts. Items
 * unseen in the last 30 days come first, in pool order; then the least recently seen, flagged repeat_exposure (design §12). E1
 * to E3 alike (S2-36). Ordered so no two items of one concept follow each other where the counts allow it. Several items of
 * one card are all served; the block_close takes the worst rating per card (S2-45).
 */
export function sampleDrill(a: { pool: readonly SqlItem[]; concepts: readonly string[]; questions: number; seen: readonly Seen[]; now: Date }): DrillPick[] {
  const t = a.now.getTime();
  const last = new Map<string, number>();
  for (const s of a.seen) {
    const at = Date.parse(s.started_at);
    if (!Number.isNaN(at) && at <= t && at > (last.get(s.item_id) ?? -Infinity)) last.set(s.item_id, at);
  }
  const fresh = (i: SqlItem): boolean => (last.get(i.id) ?? -Infinity) < t - SEEN_WINDOW_MS;
  const left = [...new Map(a.pool.map((i) => [i.id, i])).values()];
  const order = new Map(left.map((i, n) => [i.id, n]));
  /** Unseen first, in pool order; then the least recently seen. */
  const better = (x: SqlItem, y: SqlItem): number => Number(fresh(y)) - Number(fresh(x))
    || (fresh(x) ? 0 : last.get(x.id)! - last.get(y.id)!) || order.get(x.id)! - order.get(y.id)!;
  const picks: SqlItem[] = [];
  const take = (i: SqlItem): void => { picks.push(i); left.splice(left.indexOf(i), 1); };
  for (const c of a.concepts) {
    if (picks.length >= a.questions) break;
    const best = left.filter((i) => i.target_concept_id === c).sort(better)[0];
    if (best) take(best);
  }
  const count = (c: string): number => picks.filter((p) => p.target_concept_id === c).length;
  while (picks.length < a.questions && left.length) {
    take([...left].sort((x, y) => Number(fresh(y)) - Number(fresh(x)) || count(x.target_concept_id) - count(y.target_concept_id) || better(x, y))[0]!);
  }
  return interleave(picks.map((item) => ({ concept_id: item.target_concept_id, item, repeat_exposure: !fresh(item) })), []);
}

// ---- the cumulative drill (S6-19, sprint 6 Task B4) ---------------------------------------------------------------------------

/** S6-19: a cumulative run is one block whose block_id starts with this. Drill history tells it from a level or chosen run by it. */
export const CUMULATIVE_PREFIX = 'cum-';
export const isCumulativeBlock = (blockId: string): boolean => blockId.startsWith(CUMULATIVE_PREFIX);
/** What one level gave a cumulative draw: `wanted` per_level, `taken` what its pool could give, `from_seen` how many of those were seen in the last 30 days. */
export interface CumulativeFill { level: number; wanted: number; taken: number; from_seen: number }
/** P15: the whole cumulative draw: its questions, how many came from seen items, and the unseen share (rounded). */
export interface CumulativeOverall { questions: number; from_seen: number; unseen_pct: number }
export function cumulativeOverall(fill: readonly CumulativeFill[]): CumulativeOverall {
  const questions = fill.reduce((n, f) => n + f.taken, 0);
  const from_seen = fill.reduce((n, f) => n + f.from_seen, 0);
  return { questions, from_seen, unseen_pct: questions > 0 ? Math.round((100 * (questions - from_seen)) / questions) : 100 };
}
/** The kinds a drill serves: blank-editor and fix-this-query drill items (as routes/drill.ts levelPool). */
const drillServable = (i: SqlItem | undefined): i is SqlItem => i !== undefined && i.use === 'drill' && (i.kind === 'write' || i.kind === 'fix');

/** The run a cumulative entry asks, over `questions` drawn items: its limit and pass marks from the entry. Only `normal` and `screen` are valid modes. */
export function cumulativePlan(spec: CumulativeSpec, questions: number, fill?: CumulativeFill[]): DrillPlan {
  if (spec.mode !== 'normal' && spec.mode !== 'screen') {
    throw new Error(`${DRILLS_FILE}: the cumulative drill ${spec.id} has mode "${spec.mode}", and the mode must be normal or screen.`);
  }
  return { kind: 'cumulative', level: null, concepts: [], questions, minutes: spec.minutes, pass_pct: spec.pass_pct, unseen_min_pct: spec.unseen_min_pct,
    screen_mode: spec.mode === 'screen', ...(fill ? { fill, overall: cumulativeOverall(fill) } : {}) };
}

/**
 * S6-19: `per_level` items from the drill pool of each level of `spec`, in level order. Within a level the draw is sampleDrill's: items
 * unseen in the last 30 days first, then the least recently seen (flagged repeat_exposure), so a level short of unseen items fills from
 * its seen ones. A level with no drill entry or an empty pool gives nothing; `fill` says what each level gave.
 */
export function sampleCumulative(a: { spec: CumulativeSpec; specs: readonly DrillSpec[]; itemOf: (id: string) => SqlItem | undefined; seen: readonly Seen[]; now: Date }):
  { picks: DrillPick[]; fill: CumulativeFill[] } {
  const picks: DrillPick[] = [];
  const fill: CumulativeFill[] = [];
  for (const level of a.spec.levels) {
    const ls = a.specs.find((s) => s.level === level);
    const pool = (ls?.pool_item_ids ?? []).map(a.itemOf).filter(drillServable);
    const taken = ls ? sampleDrill({ pool, concepts: ls.concepts, questions: Math.min(a.spec.per_level, pool.length), seen: a.seen, now: a.now }) : [];
    picks.push(...taken);
    fill.push({ level, wanted: a.spec.per_level, taken: taken.length, from_seen: taken.filter((p) => p.repeat_exposure).length });
  }
  return { picks, fill };
}

// ---- the score and the history (S2-43) ---------------------------------------------------------------------------

export interface DrillScore {
  passed: number; questions: number; pct: number; run_passed: boolean; unseen: number; unseen_pct: number; counts_for_level: boolean;
}

/**
 * S2-43: score = passed / questions; the run passes at `pass_pct` or more; a passed level run counts toward level completion
 * when at least `unseen_min_pct` of its items were unseen. The percentages shown are rounded; the marks compare exactly.
 */
export function scoreOf(passed: number, questions: number, unseen: number, marks: Marks, levelRun: boolean): DrillScore {
  const pct = (n: number): number => (questions > 0 ? Math.round((100 * n) / questions) : 0);
  const run_passed = questions > 0 && passed * 100 >= marks.pass_pct * questions;
  return { passed, questions, pct: pct(passed), run_passed, unseen, unseen_pct: pct(unseen),
    counts_for_level: levelRun && run_passed && unseen * 100 >= marks.unseen_min_pct * questions };
}

/** H3: how one served question ended. Failed: answered and never passed. Not answered: no submission in the run. */
export type QuestionOutcome = 'passed' | 'failed' | 'not_answered';
export interface DrillQuestion { item_instance_id: string; item_id: string | null; outcome: QuestionOutcome }

export interface DrillRun {
  block_id: string; kind: 'level' | 'chosen' | 'cumulative'; level: number | null;
  /**
   * S4B-23: the run was in screen mode, read from its attempts' `screen_mode` (no log field is added). A run with no attempt at all
   * reads as normal mode: nothing in the log says otherwise.
   */
  screen_mode: boolean;
  /** The Amsterdam date the run started. */
  date: string;
  started_at: string;
  /** Its block_close; null while it runs. */
  ended_at: string | null;
  concept_ids: string[];
  score: DrillScore;
  /** H3: every question the log holds for the run, each with its outcome; the passed ones are the score's passed. Log order, not drill order. */
  questions: DrillQuestion[];
}

type Rec = Record<string, unknown>;
interface Inst {
  id: string;
  item_id: string | null; concept: string | null; block: string | null; drill: boolean; start: number; closedAt: number | null;
  /** The section its attempts name; null when it has none (an unreached item). */
  section: string | null;
  /** An attempt of it was logged in screen mode (S4B-23). */
  screen: boolean;
  passes: { at: number; auto: boolean; attempt_id: string }[];
  /** For S2-97: the close's reason, the attempts, and the help records logged before the close. */
  reason: unknown; attempts: number; helpBefore: number;
}

/**
 * Every drill run in the logs (S2-43, S2-46): the blocks whose items were served in phase drill, newest first.
 * - A level run: every item is a `use: 'drill'` item of one level that has a spec. It asks that spec's questions, so the
 *   items a crash kept out of the log count as not passed. Any other run is a learner-started one (S2-47), which never
 *   counts for level completion; it takes the pass marks of its highest level's spec.
 * - Passed: an automatic pass logged before the item's close (D9: any answer in time), or an "I was right" that an
 *   override_confirm confirmed (design §5: an override counts toward level completion only once confirmed).
 * - Unseen: no instance of the item, outside the run, started in the 30 days before the run's first instance. An unreached
 *   drill item (S2-97) is no instance for this: it was never seen.
 * - S6-19: a block whose block_id starts `cum-` is a cumulative run (kind `cumulative`, no level): it takes the pass marks of the first
 *   cumulative entry (80% and 70% when there is none), asks as many questions as it served, and never counts for a level.
 * - Task B2: a GA4 mini drill is served in phase drill too. A block with an item `isChoiceItem` names, or with an attempt of
 *   another section, is a GA4 run (server/run.ts lists those) and is left out here.
 */
export function drillRuns(attempts: object[], events: object[], itemOf: (id: string) => SqlItem | undefined, specs: readonly DrillSpec[],
  isChoiceItem: (id: string) => boolean = () => false, cumulative: readonly CumulativeSpec[] = []): DrillRun[] {
  const decided = new Map<string, 'confirmed' | 'reverted'>();
  for (const e of events as Rec[]) {
    const id = str(e.attempt_id);
    if (id && e.event === 'override_confirm') decided.set(id, 'confirmed');
    else if (id && e.event === 'override_revert') decided.set(id, 'reverted');
  }
  const insts = new Map<string, Inst>();
  const ends = new Map<string, string>();
  for (const r of attempts as Rec[]) {
    if (r.record === 'block_close') {
      const b = str(r.block_id), ts = str(r.ts);
      if (b && ts && !ends.has(b)) ends.set(b, ts);
      continue;
    }
    const id = str(r.item_instance_id);
    if (!id || !(r.record === 'attempt' || r.record === 'item_close' || r.record === 'hint_opened' || r.record === 'solution_opened')) continue;
    let x = insts.get(id);
    if (!x) { x = { id, item_id: null, concept: null, block: null, drill: false, start: Infinity, closedAt: null, section: null, screen: false, passes: [], reason: null, attempts: 0, helpBefore: 0 }; insts.set(id, x); }
    x.item_id ??= str(r.item_id);
    x.concept ??= str(r.target_concept_id);
    if (r.record !== 'hint_opened' && r.record !== 'solution_opened') {
      x.block ??= str(r.block_id);
      if (r.phase === 'drill') x.drill = true;
    }
    let start = NaN;
    if (r.record === 'attempt') {
      x.section ??= str(r.section);
      if (r.screen_mode === true) x.screen = true;
      start = Date.parse(str(r.started_at) ?? str(r.submitted_at) ?? '');
      x.attempts++;
      const at = Date.parse(str(r.submitted_at) ?? '');
      if (r.outcome === 'pass' && !Number.isNaN(at)) x.passes.push({ at, auto: r.grading_source !== 'override', attempt_id: str(r.attempt_id) ?? '' });
    } else if (r.record === 'item_close') {
      const at = Date.parse(str(r.ts) ?? '');
      if (!Number.isNaN(at) && x.closedAt === null) { x.closedAt = at; x.reason = r.reason; }
      const am = (r.raw_outcome as Rec | undefined)?.active_ms;
      start = at - (typeof am === 'number' && am >= 0 ? am : 0);
    } else {
      start = Date.parse(str(r.ts) ?? '');
      if (x.closedAt === null) x.helpBefore++;                // help after the close is the run's review (S2-44)
    }
    if (!Number.isNaN(start) && start < x.start) x.start = start;
  }
  const startsOf = new Map<string, { start: number; block: string | null }[]>();
  const runs = new Map<string, Inst[]>();
  for (const x of insts.values()) {
    const seen = !isUnreached({ reason: x.reason, attempts: x.attempts, help: x.helpBefore });
    if (seen && x.item_id !== null && Number.isFinite(x.start)) startsOf.set(x.item_id, [...(startsOf.get(x.item_id) ?? []), { start: x.start, block: x.block }]);
    if (x.drill && x.block !== null) runs.set(x.block, [...(runs.get(x.block) ?? []), x]);
  }
  const out: DrillRun[] = [];
  for (const [block_id, members] of runs) {
    if (isLiveBlock(block_id)) continue;                  // S4B-26: a live rep is never a level or chosen run (liveRuns lists it)
    if (members.some((m) => (m.section !== null && m.section !== 'sql') || (m.item_id !== null && isChoiceItem(m.item_id)))) continue;   // a GA4 run
    const start = Math.min(...members.map((m) => m.start));
    const known = members.map((m) => (m.item_id === null ? undefined : itemOf(m.item_id)));
    const levels = [...new Set(known.map((i) => i?.level).filter((l): l is number => typeof l === 'number'))];
    const cum = isCumulativeBlock(block_id);
    const cumSpec = cumulative[0];
    const levelSpec = !cum && known.every((i) => i?.use === 'drill') && levels.length === 1 ? specs.find((s) => s.level === levels[0]) : undefined;
    const marks: Marks = cum ? (cumSpec ?? CUMULATIVE_MARKS) : levelSpec ?? specForLevels(levels, specs) ?? FALLBACK;
    const questions = levelSpec ? Math.max(levelSpec.questions, members.length) : members.length;
    const didPass = (m: Inst): boolean => m.passes.some((p) => (m.closedAt === null || p.at <= m.closedAt) && (p.auto || decided.get(p.attempt_id) === 'confirmed'));
    const passed = members.filter(didPass).length;
    const unseen = members.filter((m) => m.item_id !== null && !(startsOf.get(m.item_id) ?? [])
      .some((o) => o.block !== block_id && o.start < start && o.start >= start - SEEN_WINDOW_MS)).length;
    out.push({ block_id, kind: cum ? 'cumulative' : levelSpec ? 'level' : 'chosen', level: levelSpec?.level ?? null,
      screen_mode: members.some((m) => m.screen) || (cum && cumSpec?.mode === 'screen'),
      date: amsterdamDate(new Date(start)), started_at: iso(start),
      ended_at: ends.get(block_id) ?? null, concept_ids: [...new Set(members.map((m) => m.concept).filter((c): c is string => c !== null))],
      score: scoreOf(passed, questions, unseen, marks, levelSpec !== undefined),
      questions: members.map((m) => ({ item_instance_id: m.id, item_id: m.item_id, outcome: didPass(m) ? 'passed' as const : m.attempts > 0 ? 'failed' as const : 'not_answered' as const })) });
  }
  return out.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

// ---- live reps (S4B-26, D42; Task E4) -------------------------------------------------------------------------------------

/** S4B-26: a live rep is one block whose block_id starts with this. Drill history tells it from a level or chosen run by it. */
export const LIVE_PREFIX = 'live-';
export const isLiveBlock = (blockId: string): boolean => blockId.startsWith(LIVE_PREFIX);
/** S4B-26: a live rep is one item in 10 minutes, in screen mode. */
export const LIVE_MINUTES = 10;
/** The self-check text (SelfCheck.ticked) of a ticked "explained aloud". */
export const EXPLAINED_ALOUD = 'explained_aloud';

const PRACTISED_UP: ReadonlySet<ConceptStateName> = new Set(['practised', 'mastered', 'retained']);
/**
 * S4B-26: the levels a live rep draws from: those whose concepts are all Practised or better, in level order. Level 1 when there are none.
 * A spec with no concepts qualifies for nothing.
 */
export function liveRepLevels(specs: readonly DrillSpec[], stateOf: (conceptId: string) => ConceptStateName | undefined): number[] {
  const levels = specs.filter((s) => s.concepts.length > 0 && s.concepts.every((c) => PRACTISED_UP.has(stateOf(c) as ConceptStateName)))
    .map((s) => s.level).sort((a, b) => a - b);
  return levels.length ? levels : [1];
}

/**
 * D49 (sprint 4c): where a live rep looks for a fresh exercise, tier by tier. First the practised levels together (liveRepLevels, so
 * level 1 when none is practised), then every other level with a drill, one at a time, nearest a practised level first (ties: the
 * lower level). A level with no drill spec is never looked in.
 */
export function liveRepTiers(specs: readonly DrillSpec[], stateOf: (conceptId: string) => ConceptStateName | undefined): number[][] {
  const first = liveRepLevels(specs, stateOf);
  const distance = (level: number): number => Math.min(...first.map((f) => Math.abs(f - level)));
  const rest = [...new Set(specs.map((s) => s.level))].filter((l) => !first.includes(l)).sort((a, b) => distance(a) - distance(b) || a - b);
  return [first, ...rest.map((l) => [l])];
}

/** S4B-26: the plan of a live rep: one question, 10 minutes, screen mode, pass when the item passes. */
export function livePlan(item: SqlItem): DrillPlan {
  return { kind: 'chosen', level: null, concepts: [item.target_concept_id], questions: 1, minutes: LIVE_MINUTES, pass_pct: 100, unseen_min_pct: 0, screen_mode: true, live: true };
}

/** S4B-26: one item of `pool` that no instance started in the 30 days before `now`, picked with `random` (0 up to 1); null when there is none. */
export function pickLiveRep(a: { pool: readonly SqlItem[]; seen: readonly Seen[]; now: Date; random: () => number }): SqlItem | null {
  const t = a.now.getTime();
  const recent = new Set(a.seen.filter((s) => { const at = Date.parse(s.started_at); return !Number.isNaN(at) && at <= t && at > t - SEEN_WINDOW_MS; }).map((s) => s.item_id));
  const fresh = [...new Map(a.pool.map((i) => [i.id, i])).values()].filter((i) => !recent.has(i.id));
  return fresh.length ? fresh[Math.min(fresh.length - 1, Math.floor(a.random() * fresh.length))]! : null;
}

/** D49: the draw of pickLiveRep over the tiers' pools (liveRepTiers) in order: the first pool with a fresh item gives it; null when none has one. */
export function pickLiveRepTiered(a: { tiers: readonly (readonly SqlItem[])[]; seen: readonly Seen[]; now: Date; random: () => number }): SqlItem | null {
  for (const pool of a.tiers) {
    const item = pickLiveRep({ pool, seen: a.seen, now: a.now, random: a.random });
    if (item) return item;
  }
  return null;
}

export interface LiveRun {
  block_id: string;
  /** The Amsterdam date its block closed (S4B-26: a rep is logged when its block closed). */
  local_date: string;
  ended_at: string;
  item_id: string | null;
  /** The item passed before the close (an automatic pass, or an override once confirmed). */
  item_passed: boolean;
  /** The latest "explained aloud" self-check of the block ticked it. */
  explained_aloud: boolean;
  /** D42: the item passed and "explained aloud" is ticked. */
  passed: boolean;
}

/**
 * S4B-26, D42: every live rep in the logs, in the order their blocks closed. A rep is logged when its block closed (a rep that ran out
 * of time unanswered is logged, not passed), on the Amsterdam date of that close. Its item passed when an attempt of the block passed
 * before the close: an automatic pass, or an "I was right" an override_confirm confirmed (as drillRuns reads a pass). The tick is
 * the block's latest `explained_aloud` self-check; a self-check names the block and never an instance, so it opens and closes nothing.
 */
export function liveRuns(attempts: object[], events: object[]): LiveRun[] {
  const decided = new Set<string>();
  for (const e of events as Rec[]) {
    const id = str(e.attempt_id);
    if (id && e.event === 'override_confirm') decided.add(id);
    else if (id && e.event === 'override_revert') decided.delete(id);
  }
  const closes = new Map<string, number>();
  const passes = new Map<string, { at: number; ok: boolean }[]>();
  const itemOf = new Map<string, string>();
  const ticks = new Map<string, boolean>();
  for (const r of attempts as Rec[]) {
    const block = str(r.block_id);
    if (!block || !isLiveBlock(block)) continue;
    if (r.record === 'block_close') {
      const at = Date.parse(str(r.ts) ?? '');
      if (!Number.isNaN(at) && !closes.has(block)) closes.set(block, at);
    } else if (r.record === 'attempt') {
      const item = str(r.item_id);
      if (item && !itemOf.has(block)) itemOf.set(block, item);
      const at = Date.parse(str(r.submitted_at) ?? '');
      if (r.outcome === 'pass' && !Number.isNaN(at)) passes.set(block, [...(passes.get(block) ?? []), { at, ok: r.grading_source !== 'override' || decided.has(str(r.attempt_id) ?? '') }]);
    } else if (r.record === 'self_check' && r.kind === EXPLAINED_ALOUD) {
      ticks.set(block, Array.isArray(r.ticked) && r.ticked.includes(EXPLAINED_ALOUD));
    }
  }
  return [...closes].map(([block_id, at]) => {
    const item_passed = (passes.get(block_id) ?? []).some((p) => p.ok && p.at <= at);
    const explained_aloud = ticks.get(block_id) === true;
    return { block_id, local_date: amsterdamDate(new Date(at)), ended_at: iso(at), item_id: itemOf.get(block_id) ?? null, item_passed, explained_aloud, passed: item_passed && explained_aloud };
  });
}

/** S4B-26: the reps as the goal evaluator's `live_rep` criterion reads them (core/goal-eval.ts GoalView.liveReps): one per closed block. */
export function liveReps(attempts: object[], events: object[] = []): { local_date: string; passed: boolean }[] {
  return liveRuns(attempts, events).map((r) => ({ local_date: r.local_date, passed: r.passed }));
}

// ---- the runs in progress (S2-42) ---------------------------------------------------------------------------------

export interface RunServing { item_id: string; item_instance_id: string }
/**
 * Sprint 7 (S7-01, S7-02): a recruiter mock in the run clock, so one timed run is on at a time across every kind (S3-08) and help waits
 * while it is on (HELP_WAITS). `form_id` and `on_unseen` are what its start decided and its mock_open logged (S7-04); `minutes` is its
 * limit; `started_at` (ms) is its mock_open's time. The mock routes start and end it (Task M2); server/mocks.ts derives its result.
 */
export interface MockPlan { kind: 'mock'; mock: MockKind; form_id: string; minutes: number; on_unseen: boolean; started_at: number }
/** What a run asks: an SQL drill's plan, a GA4 mini drill's or half-mock's (Task B2, server/run.ts), or a recruiter mock's (sprint 7). */
export type RunPlan = DrillPlan | ChoiceRunPlan | MockPlan;
export const isDrillPlan = (p: RunPlan): p is DrillPlan => p.kind === 'level' || p.kind === 'chosen' || p.kind === 'cumulative';
export const isMockPlan = (p: RunPlan): p is MockPlan => p.kind === 'mock';
/** S7-15: a take-home run, which keeps its own wall clock: a session end and the idle end never end it. */
export const isTakeHome = (run: { plan: RunPlan }): boolean => isMockPlan(run.plan) && run.plan.mock === 'take_home';
export interface RunEntry {
  block_id: string; plan: RunPlan; started_at: number; ends_at: number; servings: RunServing[];
  /** The latest attempt the run logged, ms: its end is never stamped before it. */
  last: number;
  /** Answers sent before the stop that are still being graded; the end waits for them (D9). */
  readonly inFlight: Set<Promise<void>>;
}

/** What server/app.ts asks the drill runner. */
export interface DrillGate {
  /** The check on every request (S2-42): ends every run whose time is up. */
  sweep(): Promise<void>;
  /** Whether the instance is an item of a run still on, after ending its run when the time is up. */
  running(instanceId: string): Promise<boolean>;
  /**
   * Before a submission: null when the instance is an item of a run that is over (the answer is refused). Otherwise a
   * release, which the caller calls once its attempt is logged, with the attempt's time (or null when nothing was logged);
   * the run's end waits for it. An instance outside every run gets a release that does nothing.
   */
  holdForSubmission(instanceId: string): Promise<((loggedAt: Date | null) => void) | null>;
  /** Task B2: the run the instance is an item of, while that run is on or ending; asks nothing of the clock. */
  runOf(instanceId: string): RunEntry | undefined;
}
/** The gate before the drill routes mount: no runs. */
export const NO_DRILLS: DrillGate = { sweep: async () => {}, running: async () => false, holdForSubmission: async () => () => {}, runOf: () => undefined };

/** What an SQL drill's start answers, and a second start while it is on: the run, its limit (a test rule, which may be shown) and its items. */
export function drillRunView(run: RunEntry & { plan: DrillPlan }) {
  const p = run.plan;
  return { block_id: run.block_id, kind: p.kind, level: p.level, phase: 'drill' as const, hide_labels: true, questions: p.questions, minutes: p.minutes,
    pass_pct: p.pass_pct, unseen_min_pct: p.unseen_min_pct, ends_at: new Date(run.ends_at).toISOString(), servings: run.servings, screen_mode: p.screen_mode === true, live: p.live === true,
    ...(p.fill ? { fill: p.fill } : {}), ...(p.overall ? { overall: p.overall } : {}) };
}

/**
 * S7-09 (Task M2): a screen mock's draw: its form's items from the mock store, in the form's order (levels 1 to 4, then two of level 5),
 * each one a blank-editor or fix-this-query item. Null when one is missing or of another kind (content check C54 keeps the forms whole).
 */
export function screenMockDraw(itemIds: readonly string[], mockItem: (id: string) => SqlItem | undefined): SqlItem[] | null {
  const items = itemIds.map(mockItem);
  return items.every((i): i is SqlItem => i !== undefined && (i.kind === 'write' || i.kind === 'fix')) ? items : null;
}

/**
 * What a mock's start answers, and a second start of any run while it is on (S7-02): the run, its form, its limit and its items. `deadline_at`
 * is its minutes after it opened, by the one rule the score and the review read (server/mocks.ts deadlineOf, N3 M1); `ends_at` is when the
 * run clock ends it: the deadline, except for a take-home, which takes late answers until it is handed in or closes `close_after_hours`
 * after it opened (S7-15).
 */
export function mockRunView(run: RunEntry & { plan: MockPlan }) {
  const p = run.plan;
  return { block_id: run.block_id, kind: p.kind, mock: p.mock, form_id: p.form_id, phase: 'mock' as const, hide_labels: true, minutes: p.minutes,
    on_unseen: p.on_unseen, ends_at: new Date(run.ends_at).toISOString(), deadline_at: new Date(deadlineOf(p.started_at, p.minutes)).toISOString(),
    servings: run.servings };
}

/**
 * S7-15 (ruling S7-C25): a take-home run the log holds open: its mock_open with no block_close, the instance of each item it answered, and
 * (F4-3-2) the instance of each item it tried, a crash included.
 */
export interface OpenTakeHome {
  block_id: string; form_id: string;
  /** Its mock_open's minutes; null when the record has none (N2 M9: the caller reads the rules' minutes then, as mockRuns does). */
  minutes: number | null; on_unseen: boolean;
  /** Its mock_open's time, ms. */
  started_at: number;
  /** Each item of the run with an answer that counts (a checkpoint's own ID, or CP3's SQL item), to the instance that answered it first. */
  answered: Map<string, string>;
  /**
   * F4-3-2: each item of the run with any attempt in its block, a crash included, to the instance of its first attempt. A restart leaves
   * these open too (S7-C25: no close early), and the rebuild serves an item with no answer that counts on this instance.
   */
  attempted: Map<string, string>;
}
/**
 * S7-15 (ruling S7-C25): the take-home runs the attempt files hold open, which an app start rebuilds in the run clock with their answered
 * checkpoints and their own wall clock, however old: the clock closes one 24 hours old or more at the first request (its block_close then,
 * stamped at its close). Read from the records alone, in log order; an answer that counts is countsAsAttempt's (never a crash, a refused
 * statement or an "I was right" copy).
 */
export function openTakeHomes(records: readonly object[]): OpenTakeHome[] {
  const opens = new Map<string, OpenTakeHome>();
  const closed = new Set<string>();
  for (const r of records as readonly Rec[]) {
    const block = str(r.block_id);
    if (block === null) continue;
    if (r.record === 'block_close') closed.add(block);
    else if (r.record === 'mock_open' && r.mock === 'take_home' && !opens.has(block)) {
      const at = Date.parse(str(r.ts) ?? '');
      if (Number.isNaN(at)) continue;
      opens.set(block, { block_id: block, form_id: str(r.form_id) ?? '', minutes: openMinutes(r),
        on_unseen: r.on_unseen === true, started_at: at, answered: new Map(), attempted: new Map() });
    } else if (r.record === 'attempt' && r.phase === 'mock') {
      const item = str(r.item_id), id = str(r.item_instance_id), run = opens.get(block);
      if (!run || item === null || id === null) continue;
      if (!run.attempted.has(item)) run.attempted.set(item, id);
      if (countsAsAttempt(r) && !run.answered.has(item)) run.answered.set(item, id);
    }
  }
  return [...opens.values()].filter((t) => !closed.has(t.block_id));
}

/** Runs `fn` after `ms`, and returns its cancel. The real timer never keeps the process alive. */
export type Schedule = (fn: () => void, ms: number) => () => void;
const realSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, Math.max(0, ms));
  t.unref();
  return () => clearTimeout(t);
};

/**
 * The runs in progress and their hard stop (S2-42): a timer at the limit, plus `sweep`, which every request runs. A run ends
 * once, whoever ends it first (its timer, the learner, a session end, a request after the limit). Its end waits for the answers
 * sent in time, then calls `end` with the stop time: the time asked for, never after the limit, never before an attempt the run
 * logged. `end` closes the items and writes the block_close (routes/drill.ts).
 * Task B2 (S3-08, S3-09): one registry for the SQL drills and the GA4 runs (server/run.ts), whose ends are the same: every item
 * closes run_end, then one rated block_close. `current` is the one run that is on, whatever its section.
 */
export class DrillRuns implements DrillGate {
  readonly #end: (run: RunEntry, at: Date) => Promise<void>;
  readonly #now: () => number;
  readonly #schedule: Schedule;
  readonly #active = new Map<string, RunEntry>();        // block_id -> a run that is on or ending
  readonly #runOf = new Map<string, RunEntry>();         // item_instance_id -> its run, while it is on or ending
  readonly #over = new Set<string>();                    // the items of the runs that ended in this process
  readonly #ending = new Map<string, Promise<void>>();
  readonly #cancel = new Map<string, () => void>();
  /**
   * S6-31 (M1): the blocks this registry (one per app, so one per process run) ended itself, and the blocks whose `run_finished` it sent.
   * A `run_finished` goes out only for a block ended here that has not been sent, so a restart cannot send a second one.
   */
  readonly endedHere = new Set<string>();
  readonly finishSent = new Set<string>();
  /** Sprint 7 (Task M2): what runs after each run's end is written, in the order added (the mock routes' run_finished). */
  readonly #afterEnd: ((run: RunEntry) => Promise<void>)[] = [];

  constructor(o: { end: (run: RunEntry, at: Date) => Promise<void>; now?: () => number; schedule?: Schedule }) {
    this.#end = o.end;
    this.#now = o.now ?? Date.now;
    this.#schedule = o.schedule ?? realSchedule;
  }

  /**
   * Sprint 7 (Task M2): `fn` runs after every run's end is written (its closes and its block_close), however the run ended, before the
   * run leaves the registry. It must not throw: it catches its own failures, as an end's run_finished does (routes/drill.ts).
   */
  afterEnd(fn: (run: RunEntry) => Promise<void>): void { this.#afterEnd.push(fn); }
  /** The run clock's time, ms: the injected clock in a test (AppDeps.runClock), else the real one. */
  now(): number { return this.#now(); }

  start(r: Omit<RunEntry, 'last' | 'inFlight'>): RunEntry {
    const run: RunEntry = { ...r, servings: [...r.servings], last: r.started_at, inFlight: new Set() };
    this.#active.set(run.block_id, run);
    for (const s of run.servings) this.#runOf.set(s.item_instance_id, run);
    this.#cancel.set(run.block_id, this.#schedule(() => {
      this.finish(run, run.ends_at).catch((e: unknown) => console.error(`aydinlearns: the drill run ${run.block_id} could not be ended at its time limit (${message(e)}).`));
    }, run.ends_at - this.#now()));
    return run;
  }
  /** The run with this block, while it is on or ending. */
  get(blockId: string): RunEntry | undefined { return this.#active.get(blockId); }
  runOf(instanceId: string): RunEntry | undefined { return this.#runOf.get(instanceId); }
  /** The run that is on, if any. */
  current(): RunEntry | undefined { return [...this.#active.values()].find((r) => !this.#ending.has(r.block_id)); }

  async sweep(): Promise<void> {
    const t = this.#now();
    for (const run of [...this.#active.values()]) if (t >= run.ends_at) await this.finish(run, run.ends_at);
  }
  /**
   * A session end (S2-16): every run ends, stamped at the session's end or its own limit, whichever came first. S7-15: except a take-home,
   * whose clock is wall time from its mock_open: a session end or an app stop never ends it.
   */
  async finishAll(at: Date): Promise<void> {
    for (const run of [...this.#active.values()]) if (!isTakeHome(run)) await this.finish(run, at.getTime());
  }
  /** Ends the run once; a second call gets the first one's promise. `at` defaults to now. */
  finish(run: RunEntry, at?: number): Promise<void> {
    const ending = this.#ending.get(run.block_id);
    if (ending) return ending;
    if (this.#active.get(run.block_id) !== run) return Promise.resolve();
    this.#cancel.get(run.block_id)?.();
    this.#cancel.delete(run.block_id);
    this.endedHere.add(run.block_id);
    const p = (async () => {
      try {
        await Promise.allSettled([...run.inFlight]);
        const asked = at ?? this.#now();
        await this.#end(run, new Date(Math.max(Math.min(asked, run.ends_at), run.last)));
        for (const fn of this.#afterEnd) await fn(run);
      } finally {
        this.#active.delete(run.block_id);
        this.#ending.delete(run.block_id);
        for (const s of run.servings) { this.#runOf.delete(s.item_instance_id); this.#over.add(s.item_instance_id); }
      }
    })();
    this.#ending.set(run.block_id, p);
    return p;
  }

  async running(instanceId: string): Promise<boolean> {
    await this.sweep();
    const run = this.#runOf.get(instanceId);
    if (!run) return false;
    const ending = this.#ending.get(run.block_id);
    if (ending) { await ending.catch(() => {}); return false; }
    return true;
  }
  async holdForSubmission(instanceId: string): Promise<((loggedAt: Date | null) => void) | null> {
    await this.sweep();
    const run = this.#runOf.get(instanceId);
    const ending = run ? this.#ending.get(run.block_id) : undefined;
    if (ending) await ending.catch(() => {});
    if (this.#over.has(instanceId)) return null;
    if (!run || ending) return () => {};
    let done: () => void = () => {};
    const held = new Promise<void>((resolve) => { done = resolve; });
    run.inFlight.add(held);
    return (loggedAt) => {
      if (loggedAt) run.last = Math.max(run.last, loggedAt.getTime());
      run.inFlight.delete(held);
      done();
    };
  }
  /**
   * S7C-02 (Codex F38): holdForSubmission's twin for a record that names no instance (a case mock's insight), keyed by the run itself. Null
   * when the run is over or ending (the caller refuses the record); otherwise a release, which the caller calls once its record is logged,
   * with the record's time (or null when nothing was logged). The run's end waits for it (D9).
   */
  async holdRun(run: RunEntry): Promise<((loggedAt: Date | null) => void) | null> {
    await this.sweep();
    const ending = this.#ending.get(run.block_id);
    if (ending) { await ending.catch(() => {}); return null; }
    if (this.#active.get(run.block_id) !== run) return null;
    let done: () => void = () => {};
    const held = new Promise<void>((resolve) => { done = resolve; });
    run.inFlight.add(held);
    return (loggedAt) => {
      if (loggedAt) run.last = Math.max(run.last, loggedAt.getTime());
      run.inFlight.delete(held);
      done();
    };
  }
}

// schemas/ga4-exam.ts: content/ga4/exam.json, the GA4 run blueprints (design §8 "Mini drills" and "Mock runner"; rulings S3-02,
// S3-04, S3-06; Task B2; sprint 5b Task B4, owner decisions D65 and D72, Codex F14). The topic weights give the form's topic counts by
// largest remainder (core/exam.ts allocate), in the file's topic order. The blueprints are dated: each entry in `blueprints` has a
// `from` date and the three runs' rules, a mini drill, a half-mock and a full mock, each with its questions, time limit (a test rule,
// which may be shown), pass mark (shown, never a gate) and mode; a mock's retake_days is the 21-day rule (S3-05). A run is scored with
// the entry in force on the date it started (blueprintOn), so a later entry never rescores an earlier run (F14): a change is a new
// entry, never an edit. loadContent validates the file, so a malformed one stops the content load with an error that names it (setup
// mode, as for any content file).
import { GA4_TOPIC } from './choice.ts';
import type { LoggedRunKind } from './log-ext.ts';

export type RunMode = 'practice' | 'exam';
export interface RunBlueprint { questions: number; minutes: number; pass_pct: number; mode: RunMode }
export interface HalfMockBlueprint extends RunBlueprint { retake_days: number }
/** One dated entry: the blueprints in force from `from` (YYYY-MM-DD, an Amsterdam date) until the next entry's date. */
export interface DatedBlueprints { from: string; mini_drill: RunBlueprint; half_mock: HalfMockBlueprint; full_mock: HalfMockBlueprint }
export interface Ga4ExamConfig {
  /** Topic ID to weight, in the file's order: that order breaks allocation ties and orders a run's per-topic scores. */
  topic_weights: Record<string, number>;
  /** Topic ID to its name, for the review tables and the history (Task B3, ruling B). Optional: a topic without a name shows its number. */
  topic_names?: Record<string, string>;
  /** The entries in date order; mini_drill, half_mock and full_mock are the latest entry's, for new runs. */
  dated: DatedBlueprints[];
  mini_drill: RunBlueprint;
  half_mock: HalfMockBlueprint;
  full_mock: HalfMockBlueprint;
}

export const GA4_EXAM_FILE = 'ga4/exam.json';
const KINDS = ['mini_drill', 'half_mock', 'full_mock'] as const;
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
/** A real calendar date written YYYY-MM-DD. */
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * The blueprints, or an Error whose message starts with the file (`ga4/exam.json: ...`), as loadContent's own errors do.
 * The held-out pool is no longer checked here: a full mock longer than its pool is content check C46, and the start route refuses a short pool.
 */
export function parseGa4Exam(x: unknown): Ga4ExamConfig {
  const fault = (what: string): Error => new Error(`${GA4_EXAM_FILE}: ${what}`);
  if (!isObj(x)) throw fault('the file must hold an object.');
  const w = x.topic_weights;
  if (!isObj(w) || Object.keys(w).length === 0) throw fault('topic_weights must map GA4 topics to weights.');
  for (const [topic, weight] of Object.entries(w)) {
    if (!GA4_TOPIC.test(topic)) throw fault(`topic_weights names ${JSON.stringify(topic)}, which is not a GA4 topic such as T-GA4-01.`);
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) throw fault(`the weight of ${topic} must be a number, 0 or more.`);
  }
  if (!Object.values(w).some((v) => (v as number) > 0)) throw fault('at least one topic needs a weight above 0.');
  let topic_names: Record<string, string> | undefined;
  if (x.topic_names !== undefined) {
    const n = x.topic_names;
    if (!isObj(n)) throw fault('topic_names must map GA4 topics to names.');
    for (const [topic, name] of Object.entries(n)) {
      if (!GA4_TOPIC.test(topic)) throw fault(`topic_names names ${JSON.stringify(topic)}, which is not a GA4 topic such as T-GA4-01.`);
      if (typeof name !== 'string' || name.trim() === '') throw fault(`the topic_names entry of ${topic} must be a name.`);
    }
    topic_names = { ...(n as Record<string, string>) };
  }
  const list = x.blueprints;
  if (!Array.isArray(list) || list.length === 0) throw fault('blueprints must list the dated blueprint entries, oldest first.');
  const blueprint = (entry: Obj, at: string, name: (typeof KINDS)[number]): RunBlueprint => {
    const b = entry[name];
    const where = `${at}.${name}`;
    if (!isObj(b)) throw fault(`${where} is missing.`);
    if (!Number.isInteger(b.questions) || (b.questions as number) < 1) throw fault(`${where}.questions must be a whole number, 1 or more.`);
    if (typeof b.minutes !== 'number' || !Number.isFinite(b.minutes) || !(b.minutes > 0)) throw fault(`${where}.minutes must be above 0.`);
    if (typeof b.pass_pct !== 'number' || !(b.pass_pct >= 0 && b.pass_pct <= 100)) throw fault(`${where}.pass_pct must be between 0 and 100.`);
    if (b.mode !== 'practice' && b.mode !== 'exam') throw fault(`${where}.mode must be practice or exam.`);
    return { questions: b.questions as number, minutes: b.minutes, pass_pct: b.pass_pct, mode: b.mode };
  };
  const mock = (entry: Obj, at: string, name: 'half_mock' | 'full_mock'): HalfMockBlueprint => {
    const b = blueprint(entry, at, name);
    const retake = (entry[name] as Obj).retake_days;
    if (!Number.isInteger(retake) || (retake as number) < 0) throw fault(`${at}.${name}.retake_days must be a whole number of days, 0 or more.`);
    return { ...b, retake_days: retake as number };
  };
  const dated: DatedBlueprints[] = list.map((entry: unknown, i: number): DatedBlueprints => {
    const at = `blueprints[${i}]`;
    if (!isObj(entry)) throw fault(`${at} must be an object.`);
    if (!isDate(entry.from)) throw fault(`${at}.from must be a date written YYYY-MM-DD.`);
    const half_mock = mock(entry, at, 'half_mock');
    const full_mock = mock(entry, at, 'full_mock');
    // An old run with no logged answers is read as a full mock only when it closed more items than the half-mock asks (server/run.ts).
    if (full_mock.questions <= half_mock.questions) throw fault(`${at}.full_mock.questions (${full_mock.questions}) must be more than ${at}.half_mock.questions (${half_mock.questions}).`);
    return { from: entry.from, mini_drill: blueprint(entry, at, 'mini_drill'), half_mock, full_mock };
  });
  dated.forEach((d, i) => {
    const prev = dated[i - 1];
    if (prev && d.from <= prev.from) throw fault(`blueprints[${i}].from must come after blueprints[${i - 1}].from (${prev.from}): the entries are in date order, one per date.`);
  });
  const latest = dated.at(-1)!;
  return { topic_weights: { ...(w as Record<string, number>) }, ...(topic_names ? { topic_names } : {}), dated,
    mini_drill: latest.mini_drill, half_mock: latest.half_mock, full_mock: latest.full_mock };
}

/**
 * F14: a run's blueprint, from the entry in force on `date` (the Amsterdam date the run started, YYYY-MM-DD): the latest entry whose
 * `from` is on or before it, or the first entry for an earlier date (a run older than every entry keeps the oldest rules known).
 */
export function blueprintOn(cfg: Ga4ExamConfig, kind: 'half_mock' | 'full_mock', date: string): HalfMockBlueprint;
export function blueprintOn(cfg: Ga4ExamConfig, kind: LoggedRunKind, date: string): RunBlueprint;
export function blueprintOn(cfg: Ga4ExamConfig, kind: LoggedRunKind, date: string): RunBlueprint {
  const entry = cfg.dated.findLast((d) => d.from <= date) ?? cfg.dated[0]!;
  return entry[kind];
}

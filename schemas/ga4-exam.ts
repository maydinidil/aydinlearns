// schemas/ga4-exam.ts: content/ga4/exam.json, the GA4 run blueprints (design §8 "Mini drills" and "Mock runner"; rulings S3-02,
// S3-04, S3-06; Task B2). The topic weights give the form's topic counts by largest remainder (core/exam.ts allocate), in the
// file's topic order; a mini drill and a half-mock each name their questions, time limit (a test rule, which may be shown),
// pass mark (shown, never a gate) and mode. A half-mock's retake_days is the 21-day rule (S3-05). loadContent validates the
// file, so a malformed one stops the content load with an error that names it (setup mode, as for any content file).
import { GA4_TOPIC } from './choice.ts';

export type RunMode = 'practice' | 'exam';
export interface RunBlueprint { questions: number; minutes: number; pass_pct: number; mode: RunMode }
export interface HalfMockBlueprint extends RunBlueprint { retake_days: number }
export interface Ga4ExamConfig {
  /** Topic ID to weight, in the file's order: that order breaks allocation ties and orders a run's per-topic scores. */
  topic_weights: Record<string, number>;
  /** Topic ID to its name, for the review tables and the history (Task B3, ruling B). Optional: a topic without a name shows its number. */
  topic_names?: Record<string, string>;
  mini_drill: RunBlueprint;
  half_mock: HalfMockBlueprint;
}

export const GA4_EXAM_FILE = 'ga4/exam.json';
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

/** The blueprints, or an Error whose message starts with the file (`ga4/exam.json: ...`), as loadContent's own errors do. */
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
  const blueprint = (name: 'mini_drill' | 'half_mock'): RunBlueprint => {
    const b = x[name];
    if (!isObj(b)) throw fault(`${name} is missing.`);
    if (!Number.isInteger(b.questions) || (b.questions as number) < 1) throw fault(`${name}.questions must be a whole number, 1 or more.`);
    if (typeof b.minutes !== 'number' || !Number.isFinite(b.minutes) || !(b.minutes > 0)) throw fault(`${name}.minutes must be above 0.`);
    if (typeof b.pass_pct !== 'number' || !(b.pass_pct >= 0 && b.pass_pct <= 100)) throw fault(`${name}.pass_pct must be between 0 and 100.`);
    if (b.mode !== 'practice' && b.mode !== 'exam') throw fault(`${name}.mode must be practice or exam.`);
    return { questions: b.questions as number, minutes: b.minutes, pass_pct: b.pass_pct, mode: b.mode };
  };
  const mini_drill = blueprint('mini_drill');
  const half = blueprint('half_mock');
  const retake = (x.half_mock as Obj).retake_days;
  if (!Number.isInteger(retake) || (retake as number) < 0) throw fault('half_mock.retake_days must be a whole number of days, 0 or more.');
  return { topic_weights: { ...(w as Record<string, number>) }, ...(topic_names ? { topic_names } : {}), mini_drill, half_mock: { ...half, retake_days: retake as number } };
}

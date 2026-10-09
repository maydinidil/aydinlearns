// server/run.ts: the timed GA4 runs, mini drills, half-mocks and full mocks (design §8 "Held-out mock pool", "Mini drills", "Mock
// runner"; rulings S3-01 to S3-10 and S3-12; owner decisions D27, D65, D68, D72; Task B2; sprint 5b Task B4). It draws a run's form
// through the exam engine (core/exam.ts), reads the retake rule's history from the attempt log (S3-05), and derives every ended run,
// its score and its review from the logs alone (S3-10), as server/drill.ts does for the SQL drills. routes/run.ts serves them; the run
// clock is server/drill.ts's DrillRuns, which holds the SQL drills too (S3-08).
// A run is one block (S3-01): phase drill for a mini drill, mock for a half-mock or a full mock, section ga4. Nothing marks its start;
// each answer is an attempt, whose payload names the run's kind (run_kind, log version 5, D68); its end closes every item run_end and
// writes one rated block_close. A block with no run_kind (an older log, or a run with no answer) is told by its phase and, for a mock,
// by how many items it closed. A run is scored with the blueprint in force on the date it started (blueprintOn, F14).
import { randomInt } from 'node:crypto';
import { isUnseen, pickForm, scoreRun, spread, type ExamHistory, type RunScore } from '../core/exam.ts';
import { isUnreached } from '../core/replay.ts';
import { amsterdamDate } from '../core/time.ts';
import { choiceTarget, type ChoiceItem } from '../schemas/choice.ts';
import type { Ga4Item } from '../schemas/ga4.ts';
import { blueprintOn, type Ga4ExamConfig, type RunBlueprint, type RunMode } from '../schemas/ga4-exam.ts';
import type { LoggedRunKind } from '../schemas/log-ext.ts';
import { drillRunView, isDrillPlan, SEEN_WINDOW_MS, type RunEntry } from './drill.ts';
import { countsForReadiness } from './readiness.ts';

/** D68: the kinds a GA4 run answer logs as its payload's run_kind. */
export type ChoiceRunKind = LoggedRunKind;
export const CHOICE_RUN_KINDS: readonly ChoiceRunKind[] = ['mini_drill', 'half_mock', 'full_mock'];
/** S3-01: the phase a run's items are served in. A mock phase holds a half-mock or a full mock; run_kind tells them apart (D68). */
export const PHASE_OF: Readonly<Record<ChoiceRunKind, 'drill' | 'mock'>> = { mini_drill: 'drill', half_mock: 'mock', full_mock: 'mock' };
/** A half-mock or a full mock: exam mode on the held-out pool, the retake rule, a review with no item in it (S3-05, S3-12). */
export const isMockKind = (k: ChoiceRunKind): k is 'half_mock' | 'full_mock' => k !== 'mini_drill';
const isRunKind = (v: unknown): v is ChoiceRunKind => (CHOICE_RUN_KINDS as readonly unknown[]).includes(v);
/** S3-03: the end-of-run review opens once the run is over. */
export const REVIEW_WAITS = 'The review opens when the run ends.';
/** S2-42 for a GA4 run: an answer to an item of a run that is over. */
export const CHOICE_RUN_OVER = 'This run has ended, so it takes no more answers. Its review is open.';
/** The codes a screen reads on a 409 to a run's answer, instead of the message text (B3 M1). */
export const CODE_RUN_OVER = 'RUN_OVER';
export const CODE_ONE_ANSWER = 'ONE_ANSWER';
/** S3-04: exam mode takes one answer per question. */
export const ONE_ANSWER = 'This question already has its answer. A half-mock takes one answer per question.';
export const ONE_ANSWER_FULL = 'This question already has its answer. A full mock takes one answer per question.';
/** The refusal of a second answer, in the words of the run's kind. */
export const oneAnswer = (kind: ChoiceRunKind): string => (kind === 'full_mock' ? ONE_ANSWER_FULL : ONE_ANSWER);

/** What a GA4 run asks (Task B2), beside an SQL drill's DrillPlan in the run clock. */
export interface ChoiceRunPlan {
  section: 'ga4'; kind: ChoiceRunKind; mode: RunMode; questions: number; minutes: number; pass_pct: number;
  /** A half-mock or a full mock: D27, every item unseen at the start (S3-05). Null for a mini drill. */
  on_unseen: boolean | null;
  /** A mock not on unseen items: the first Amsterdam date with enough unseen items (core/exam.ts nextUnseenDate). */
  next_unseen_date: string | null;
}
export const isChoicePlan = (p: RunEntry['plan']): p is ChoiceRunPlan => !isDrillPlan(p);

/** A GA4 run as its start answers it, and /api/run/current: its rules (the time limit is a test rule, shown), end and items. */
export function choiceRunView(run: RunEntry & { plan: ChoiceRunPlan }) {
  const p = run.plan;
  return {
    block_id: run.block_id, section: p.section, kind: p.kind, mode: p.mode, phase: PHASE_OF[p.kind], hide_labels: true, questions: p.questions,
    minutes: p.minutes, pass_pct: p.pass_pct, ends_at: new Date(run.ends_at).toISOString(), servings: run.servings,
    ...(isMockKind(p.kind) ? { on_unseen: p.on_unseen, next_unseen_date: p.next_unseen_date } : {}),
  };
}
/** Any run in its own shape: a 409 for a second start carries the run that is on, whatever its section (S3-08). */
export function runView(run: RunEntry) {
  const p = run.plan;
  return isDrillPlan(p) ? drillRunView({ ...run, plan: p }) : choiceRunView({ ...run, plan: p });
}

export const isGa4Item = (i: ChoiceItem | undefined): i is Ga4Item => i?.section === 'ga4';

// ---- the draw (S3-02, S3-06) ---------------------------------------------------------------------------------------------------

/**
 * S2-41's 30-day rule, the mini drill's `fresh` (S3-02), as sampleDrill reads it: an item is fresh when no instance of it started
 * in the 30 days before `now`. `seen` is seenIn's list (closed instances, unreached run items left out, S2-97).
 */
export function seenWindow(seen: readonly { item_id: string; started_at: string }[], now: Date): { fresh: (id: string) => boolean; lastShown: (id: string) => string | null } {
  const t = now.getTime();
  const last = new Map<string, number>();
  for (const s of seen) {
    const at = Date.parse(s.started_at);
    if (!Number.isNaN(at) && at <= t && at > (last.get(s.item_id) ?? -Infinity)) last.set(s.item_id, at);
  }
  return {
    fresh: (id) => (last.get(id) ?? -Infinity) < t - SEEN_WINDOW_MS,
    lastShown: (id) => { const at = last.get(id); return at === undefined ? null : new Date(at).toISOString(); },
  };
}

/**
 * A run's form, in the order the run serves it. pickForm draws `blueprint.questions` items by the topic weights (largest remainder,
 * in the file's topic order), fresh items first per topic, at most one per enemy group, topped up by the least recently shown; then
 * spread orders them so no two items of one parent concept (the card the item rates) follow each other where the form allows.
 * `fresh` is S2-41's 30-day rule for a mini drill, the 21-day retake rule for a mock. `allFresh`: D27.
 */
export function drawRun(a: {
  cfg: Ga4ExamConfig; blueprint: RunBlueprint; pool: readonly Ga4Item[]; fresh: (id: string) => boolean; lastShown: (id: string) => string | null;
  random?: (n: number) => number;
}): { picks: { item: Ga4Item; fresh: boolean }[]; allFresh: boolean } {
  const random = a.random ?? ((n: number) => randomInt(n));
  const byId = new Map(a.pool.map((i) => [i.id, i]));
  const form = pickForm({ pool: [...byId.values()].map((i) => ({ id: i.id, topic: i.topic_id, group: i.enemy_group })), weights: a.cfg.topic_weights,
    order: Object.keys(a.cfg.topic_weights), n: a.blueprint.questions, fresh: a.fresh, lastShown: a.lastShown, random });
  const ordered = spread(form.picks, (p) => choiceTarget(byId.get(p.item_id)!).target_concept_id, random);
  return { picks: ordered.map((p) => ({ item: byId.get(p.item_id)!, fresh: p.fresh })), allFresh: form.allFresh };
}

// ---- the instances in the log ----------------------------------------------------------------------------------------------------

type Rec = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const iso = (ms: number): string => new Date(ms).toISOString();

interface LoggedAnswer { attempt_id: string; at: number; correct: boolean; chosen: string | null; shown_order: string[] | null }
/** One item instance as the attempt file has it: what the run history, its review and the retake rule read. */
interface Inst {
  id: string; item_id: string | null; block: string | null; phase: string | null; section: string | null;
  /** D68: the run kind its first attempt that names one logged (version 5); null before version 5 or with no answer. */
  runKind: ChoiceRunKind | null;
  /** The earliest record's time, as drillRuns dates an instance (S2-97's reading): an attempt's started_at, a help record, a close's start. */
  start: number;
  closedAt: number | null; reason: unknown;
  /** Attempts in log order; the scored one is the last at or before the close (S3-02). */
  answers: LoggedAnswer[];
  helpBefore: number;
  /** Where its item_close sits in the file: a run's end closes its items in the order it served them. */
  closeSeq: number;
  firstSeq: number;
}

/** Every instance the attempt file names, from its attempts, help records and closes, in log order. */
function instancesOf(records: readonly object[]): Map<string, Inst> {
  const out = new Map<string, Inst>();
  (records as Rec[]).forEach((r, seq) => {
    const id = str(r.item_instance_id);
    if (!id || !(r.record === 'attempt' || r.record === 'item_close' || r.record === 'hint_opened' || r.record === 'solution_opened')) return;
    let x = out.get(id);
    if (!x) {
      x = { id, item_id: null, block: null, phase: null, section: null, runKind: null, start: Infinity, closedAt: null, reason: null, answers: [], helpBefore: 0,
        closeSeq: Infinity, firstSeq: seq };
      out.set(id, x);
    }
    x.item_id ??= str(r.item_id);
    const help = r.record === 'hint_opened' || r.record === 'solution_opened';
    if (!help) {
      x.block ??= str(r.block_id);
      x.phase ??= str(r.phase);
    }
    let start = NaN;
    if (r.record === 'attempt') {
      x.section ??= str(r.section);
      start = Date.parse(str(r.started_at) ?? str(r.submitted_at) ?? '');
      const at = Date.parse(str(r.submitted_at) ?? '');
      const payload = (r.payload ?? {}) as Rec;
      if (isRunKind(payload.run_kind)) x.runKind ??= payload.run_kind;
      const order = Array.isArray(payload.shown_order) && payload.shown_order.every((o) => typeof o === 'string') ? payload.shown_order as string[] : null;
      if (!Number.isNaN(at) && r.grading_source !== 'override' && r.outcome !== 'crash') {
        x.answers.push({ attempt_id: str(r.attempt_id) ?? '', at, correct: r.is_correct === true, chosen: str(payload.chosen), shown_order: order });
      }
    } else if (r.record === 'item_close') {
      const at = Date.parse(str(r.ts) ?? '');
      if (!Number.isNaN(at) && x.closedAt === null) { x.closedAt = at; x.reason = r.reason; x.closeSeq = seq; }
      const am = (r.raw_outcome as Rec | undefined)?.active_ms;
      start = at - (typeof am === 'number' && am >= 0 ? am : 0);
    } else {
      start = Date.parse(str(r.ts) ?? '');
      if (x.closedAt === null) x.helpBefore++;                 // help after the close is the run's review (S2-44)
    }
    if (!Number.isNaN(start) && start < x.start) x.start = start;
  });
  return out;
}

/** S3-02: the scored answer, the last one logged at or before the close (replay ignores the ones after it). */
const scoredOf = (x: Inst): LoggedAnswer | null => {
  const inTime = x.answers.filter((a) => x.closedAt === null || a.at <= x.closedAt);
  return [...inTime].sort((p, q) => p.at - q.at).at(-1) ?? null;     // a stable sort keeps the file's order for equal times
};
/** S3-05 (S2-97's reading): an item is shown at its instance's start when the instance has an attempt or a help record. */
const shown = (x: Inst): boolean => x.item_id !== null && Number.isFinite(x.start)
  && !isUnreached({ reason: x.reason, attempts: x.answers.length, help: x.helpBefore });

/** S3-05: the showings and the `solution_opened` openings the retake rule reads, with each showing's block. */
function historyOf(insts: ReadonlyMap<string, Inst>, records: readonly object[]): { showings: (ExamHistory['showings'][number] & { block: string | null; t: number })[]; openings: (ExamHistory['openings'][number] & { t: number })[] } {
  const showings = [...insts.values()].filter(shown).map((x) => ({ item_id: x.item_id!, at: iso(x.start), block: x.block, t: x.start }));
  const openings: (ExamHistory['openings'][number] & { t: number })[] = [];
  for (const r of records as Rec[]) {
    if (r.record !== 'solution_opened') continue;
    const t = Date.parse(str(r.ts) ?? '');
    const item = str(r.item_id) ?? insts.get(str(r.item_instance_id) ?? '')?.item_id ?? null;
    if (item !== null && !Number.isNaN(t)) openings.push({ item_id: item, at: iso(t), t });
  }
  return { showings, openings };
}

/** S3-05: the retake rule's history over the whole attempt file (a mock's start reads it). */
export function examHistory(records: readonly object[]): ExamHistory {
  const h = historyOf(instancesOf(records), records);
  return { showings: h.showings.map(({ item_id, at }) => ({ item_id, at })), openings: h.openings.map(({ item_id, at }) => ({ item_id, at })) };
}
/** The 0-based positions of a run's servings that have a logged answer, ascending: what the screen needs to resume an exam run (B3 I2). */
export function answeredPositions(records: readonly object[], servings: readonly { item_instance_id: string }[]): number[] {
  const insts = instancesOf(records);
  return servings.flatMap((s, i) => ((insts.get(s.item_instance_id)?.answers.length ?? 0) > 0 ? [i] : []));
}
/** The latest showing of an item, or null: a mock's top-up takes the least recently shown first (S3-06). */
export function lastShowing(h: ExamHistory, itemId: string): string | null {
  let last: string | null = null;
  for (const s of h.showings) if (s.item_id === itemId && (last === null || Date.parse(s.at) > Date.parse(last))) last = s.at;
  return last;
}

// ---- the ended runs, their scores and reviews (S3-03, S3-10, S3-12) --------------------------------------------------------------

export interface ChoiceRunItemResult {
  /** The question's number in the run. */
  n: number; item_id: string; item_instance_id: string; topic: string; answered: boolean; correct: boolean;
  /** The learner's scored answer and the order its options were shown in: the learner's own input, never key material. */
  chosen: string | null; shown_order: string[] | null;
}
export interface ChoiceRunScore { correct: number; of: number; pct: number; pass: boolean }
export interface ChoiceRun {
  block_id: string; kind: ChoiceRunKind;
  /** The Amsterdam date the run started. */
  date: string;
  started_at: string;
  /** Its block_close; null while it runs. */
  ended_at: string | null;
  pass_pct: number;
  score: ChoiceRunScore;
  by_topic: RunScore['by_topic'];
  /** A half-mock or a full mock (S3-10, D27): every item unseen at the run's start (S3-05), and every question there. Null for a mini drill. */
  on_unseen: boolean | null;
  /**
   * Ruling 7 (Task B5, the readiness check): a half-mock or a full mock whose every logged item was unseen at the run's start (S3-05),
   * however many it logged; on_unseen also needs every question there. Null for a mini drill. A mock's history row and review carry it,
   * so a run a crash cut short says no saved question was seen rather than that some were (F2 I1).
   */
  logged_unseen: boolean | null;
  /** A mini drill (S3-10): its items unseen in the 30 days before it (S2-41), and their share of its questions. Null for a mock. */
  unseen: number | null;
  unseen_pct: number | null;
  /**
   * F13: startup recovery closed the run after a restart. The log has no form order, so its closes (and so its question numbers)
   * follow the order the questions were answered. Read from the log: its session ended 'recovered', at the block_close's time,
   * and every question has an answer (a run the learner ended also closes the questions it never reached).
   */
  recovered: boolean;
  items: ChoiceRunItemResult[];
}

/**
 * Every GA4 run in the logs (S3-10), newest first: the blocks whose GA4 items were served in phase drill (a mini drill) or mock
 * (a half-mock or a full mock). Derived from the attempt file alone, so a restart changes nothing.
 * - Kind (D68): the run_kind any of its answers logged. With none (a log before version 5, or a run with no answer), a mock block
 *   is a full mock when it closed more items than the half-mock blueprint of its date asks, else a half-mock; a drill block is a
 *   mini drill. A block with no answer is listed; the readiness check (Task B5) never counts it.
 * - Blueprint (F14): the one in force on the date the run started (blueprintOn), so a later dated entry never rescores it.
 * - Score: each item's scored answer (S3-02); an unanswered item is wrong (S3-04). The run asks its blueprint's questions, so an
 *   item a crash kept out of the log counts as wrong, as for an SQL level drill (S2-43). Per-topic scores cover the logged items.
 * - A mini drill's unseen share: items with no instance outside the run, seen (S2-97), in the 30 days before its start (S2-41).
 * - A mock is on unseen items when each of its questions was unseen at its start by the retake rule (S3-05, D27). The readiness check
 *   reads logged_unseen instead (Ruling 7): the same rule over the items it logged, so a crash does not take a run out of the check.
 */
export function choiceRuns(records: readonly object[], o: { cfg: Ga4ExamConfig; itemOf: (id: string) => ChoiceItem | undefined; events?: readonly object[] }): ChoiceRun[] {
  const recoveredEnds = new Map<string, number>();                  // F13: the sessions a start-up recovery ended, and when
  for (const e of (o.events ?? []) as Rec[]) {
    const id = str(e.session_id), at = Date.parse(str(e.ts) ?? '');
    if (e.event === 'session' && e.phase === 'end' && e.reason === 'recovered' && id && !Number.isNaN(at)) recoveredEnds.set(id, at);
  }
  const sessionOf = new Map<string, string>();
  for (const r of records as Rec[]) {
    const b = str(r.block_id), sid = str(r.session_id);
    if (r.record === 'attempt' && b && sid && !sessionOf.has(b)) sessionOf.set(b, sid);
  }
  const insts = instancesOf(records);
  const h = historyOf(insts, records);
  const ends = new Map<string, string>();
  for (const r of records as Rec[]) {
    const b = str(r.block_id), ts = str(r.ts);
    if (r.record === 'block_close' && b && ts && !ends.has(b)) ends.set(b, ts);
  }
  const blocks = new Map<string, Inst[]>();
  for (const x of insts.values()) {
    if (x.block === null || (x.phase !== 'drill' && x.phase !== 'mock')) continue;
    blocks.set(x.block, [...(blocks.get(x.block) ?? []), x]);
  }
  const ga4 = (x: Inst): boolean => x.section === 'ga4' || (x.section === null && x.item_id !== null && isGa4Item(o.itemOf(x.item_id)));
  const order = Object.keys(o.cfg.topic_weights);
  const out: ChoiceRun[] = [];
  for (const [block_id, all] of blocks) {
    if (!all.every(ga4)) continue;                                  // an SQL drill (server/drill.ts lists it)
    const members = [...all].sort((p, q) => p.closeSeq - q.closeSeq || p.firstSeq - q.firstSeq);
    const start = Math.min(...members.map((m) => m.start));
    const date = amsterdamDate(new Date(start));
    const logged = members.find((m) => m.runKind !== null)?.runKind ?? null;
    const closed = members.filter((m) => m.closedAt !== null).length;
    const kind: ChoiceRunKind = logged
      ?? (members.some((m) => m.phase === 'mock') ? (closed > blueprintOn(o.cfg, 'half_mock', date).questions ? 'full_mock' : 'half_mock') : 'mini_drill');
    const bp = blueprintOn(o.cfg, kind, date);
    const items = members.map((m, k): ChoiceRunItemResult => {
      const scored = scoredOf(m);
      const item = m.item_id === null ? undefined : o.itemOf(m.item_id);
      return { n: k + 1, item_id: m.item_id ?? '', item_instance_id: m.id, topic: isGa4Item(item) ? item.topic_id : 'unknown', answered: scored !== null,
        correct: scored?.correct === true, chosen: scored?.chosen ?? null, shown_order: scored?.shown_order ?? null };
    });
    const s = scoreRun(items.map((i) => ({ topic: i.topic, correct: i.answered ? i.correct : null })), bp.pass_pct, order);
    const of = Math.max(bp.questions, items.length);
    const score: ChoiceRunScore = { correct: s.correct, of, pct: Math.round((100 * s.correct) / of), pass: 100 * s.correct >= bp.pass_pct * of };
    const before = (x: { t: number }): boolean => x.t < start;
    let on_unseen: boolean | null = null, logged_unseen: boolean | null = null, unseen: number | null = null, unseen_pct: number | null = null;
    if (isMockKind(kind)) {
      const past: ExamHistory = { showings: h.showings.filter((x) => x.block !== block_id && before(x)), openings: h.openings.filter(before) };
      const retake = blueprintOn(o.cfg, kind, date).retake_days;
      logged_unseen = items.every((i) => isUnseen(i.item_id, past, new Date(start), retake, amsterdamDate));
      on_unseen = items.length >= bp.questions && logged_unseen;
    } else {
      unseen = items.filter((i) => !h.showings.some((x) => x.item_id === i.item_id && x.block !== block_id && x.t < start && x.t >= start - SEEN_WINDOW_MS)).length;
      unseen_pct = Math.round((100 * unseen) / of);
    }
    const closedAt = Date.parse(ends.get(block_id) ?? '');
    const recovered = !Number.isNaN(closedAt) && recoveredEnds.get(sessionOf.get(block_id) ?? '') === closedAt && members.every((m) => m.answers.length > 0);
    out.push({ block_id, kind, date, started_at: iso(start), ended_at: ends.get(block_id) ?? null, pass_pct: bp.pass_pct,
      score, by_topic: s.by_topic, on_unseen, logged_unseen, unseen, unseen_pct, recovered, items });
  }
  return out.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

/**
 * A history row (S3-10): date, kind, score, pass, per-topic scores, and the unseen measure of its kind. Never minutes. counts_for_readiness
 * is the readiness check's own test (server/readiness.ts countsForReadiness, F2 I1), so the row and the review agree with the check.
 */
export function historyRow(r: ChoiceRun) {
  return { block_id: r.block_id, kind: r.kind, date: r.date, ...r.score, pass_pct: r.pass_pct, by_topic: r.by_topic,
    ...(isMockKind(r.kind) ? { on_unseen: r.on_unseen, logged_unseen: r.logged_unseen } : { unseen: r.unseen, unseen_pct: r.unseen_pct }),
    counts_for_readiness: countsForReadiness(r) };
}

/**
 * The end-of-run review. A mini drill (S3-03): right or wrong per item and per topic, with each item and its instance, so the
 * screen can show the question and open its answer (a logged show-answer on the closed instance). A half-mock or a full mock (S3-12):
 * each question's number and topic with right or wrong, and nothing that names or shows an item: no ID, stem, option, key or explanation.
 */
export function reviewOf(r: ChoiceRun) {
  const items = r.kind === 'mini_drill' ? r.items : r.items.map((i) => ({ n: i.n, topic: i.topic, answered: i.answered, correct: i.correct }));
  return { ...historyRow(r), recovered: r.recovered, items };
}

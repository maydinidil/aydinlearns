// server/mocks.ts: the recruiter mock runs, derived from the attempt files alone (sprint 7, Task M1; design §2.1; S7-01, S7-03 to S7-06,
// S7-09, S7-10, S7-14 to S7-16; D102, D112). A run is its mock_open, the answers and closes that name its block (phase mock), the rubric
// and insight self-checks of its block and its block_close; nothing else is read, and nothing here writes. The mock routes (Task M2, then
// Part 2) start and end the runs; this file says what each run was, which form a start takes (S7-04), and which stages a counting pass has
// met (S7-05). Codex F35 (ruling S7-C34): a run is scored on the questions its own instances served and on the pass mark its mock_open
// recorded, never on the current form or rules.
import { randomUUID } from 'node:crypto';
import type { AttemptFileRecord } from '../core/envelope.ts';
import { countsAsAttempt } from '../core/replay.ts';
import { amsterdamDate } from '../core/time.ts';
import { MOCK_KINDS, passCorrect, type FormMockKind, type MockKind, type MocksFile } from '../schemas/mock.ts';

/** S7-01: a mock run's block_id is mock-<mock>-<uuid>; every item it serves, its self-checks and its block_close name it. */
export const MOCK_BLOCK_PREFIX = 'mock-';
export const mockBlockId = (mock: MockKind): string => `${MOCK_BLOCK_PREFIX}${mock}-${randomUUID()}`;
/**
 * S7-15: a take-home run's block. Its clock is wall time from its mock_open, so a session end, an app stop and startup recovery never close
 * it: only its run's end does ("Hand in", "Give up", or 24 hours after it opened).
 */
export const isTakeHomeBlock = (blockId: string): boolean => blockId.startsWith(`${MOCK_BLOCK_PREFIX}take_home-`);

/** On; ended, a case mock waiting for its rubric (S7-16: "Waiting for your rubric"); or ended. */
export type MockRunStatus = 'on' | 'waiting_rubric' | 'ended';
export interface MockRun {
  block_id: string; mock: MockKind; form_id: string;
  /** Its mock_open's time. */
  opened_at: string;
  /**
   * Its block_close's time. With none, the run's limit once that has passed: its minutes, or for a take-home, whose clock is wall time
   * and which only a block_close or `close_after_hours` ends (S7-15), that many hours after it opened. Null while it is on.
   */
  ended_at: string | null;
  /** S7-04: what its start decided, and false whatever the start said when a fixed form already had a mock_open. */
  on_unseen: boolean;
  /**
   * S7-03: exactly right on the one answer that counts, each item's or checkpoint's first answer (countsAsAttempt: never a crash, a
   * refused statement or an "I was right" copy). A screen or knowledge run counts its own items' answers; a case mock its CP1 to CP5, plus
   * CP6 once a rubric self-check of its block ticks every core line (S7-16; a later, smaller rubric does not take it back, S7-05). `total`
   * is the items its instances served (the answers and closes naming its block; Codex F35), and never fewer than the rules' questions, so
   * a crash that left questions unreached still counts them; a case mock's is its 6 checkpoints.
   */
  correct: number; total: number;
  /** S7-15 (ruling S7-C30): a take-home answer, or CP6's memo, logged after its minutes. Only a take-home is ever late. */
  late: boolean;
  /** S7-16: the ticked lines of the latest rubric self-check naming the run's block; null when there is none. */
  rubric_ticked: string[] | null;
  status: MockRunStatus;
  /** S7-05, D102: an ended run that met its kind's rule (S7-09, S7-10, S7-16). */
  passed: boolean;
  /** S7-05: passed on unseen content, the evidence its stage asks for. */
  counts: boolean;
}

type Rec = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const timeOf = (v: unknown): number => Date.parse(str(v) ?? '');
const iso = (ms: number): string => new Date(ms).toISOString();
const isMockKind = (v: unknown): v is MockKind => (MOCK_KINDS as readonly unknown[]).includes(v);
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** A case mock's six checkpoints (design §7): CP1 to CP5 graded on their one answer, CP6 by the rubric (S7-16). */
const CASE_CHECKPOINTS = 6;
const AUTO_GRADED = ['CP1', 'CP2', 'CP3', 'CP4', 'CP5'];

interface Answer { key: string; at: number; pass: boolean }
/** A mock_open as a run reads it. `passCorrect`: the count its mock_open recorded, or (absent: written before Part 2) the rules' (S7-C34). */
interface Open { block: string; mock: MockKind; form: string; at: number; minutes: number; onUnseen: boolean; passCorrect: number }

/** S7-15: a run's deadline, ms: its minutes after its mock_open. One rule for the score, the run view and the review (N2 M5). */
export const deadlineOf = (openedAt: number, minutes: number): number => openedAt + Math.round(minutes * MINUTE_MS);
/** S7-15 (ruling S7-C30): an answer or a memo logged at `at` is late: only a take-home's, after its deadline. */
export const isLateAt = (mock: MockKind, at: number, deadline: number): boolean => mock === 'take_home' && at > deadline;

/**
 * What an answer of a run answers: its item, or for a case mock its checkpoint, from the item ID (<case_id>:CP1, CP2, CP4 and CP5 have
 * their own; the one SQL item a case run serves is its CP3, S7-08).
 */
const answerKey = (mock: MockKind, itemId: string): string => (mock === 'case_round' || mock === 'take_home' ? /:(CP[1245])$/.exec(itemId)?.[1] ?? 'CP3' : itemId);

/**
 * Every mock run in the attempt files, in the order they opened (S7-01, S7-05). `now` decides only whether a run with no block_close is
 * still on (S7-06; S7-15 for the take-home). A form is taken once its mock_open exists, answered or not (Review Focus 2).
 */
export function mockRuns(records: readonly AttemptFileRecord[], file: MocksFile, now: Date): MockRun[] {
  const opens: Open[] = [];
  const closes = new Map<string, number>();
  const answers = new Map<string, { item: string; at: number; pass: boolean }[]>();
  const rubrics = new Map<string, { at: number; ticked: string[] }[]>();
  /** Codex F35: the items each block's own instances served, as its answers and its closes (every run end closes each of them) name them. */
  const served = new Map<string, Set<string>>();
  /** S7-C30: when CP6's written answer (the take-home's memo) was saved in each block. */
  const insights = new Map<string, number[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T): void => { m.set(k, [...(m.get(k) ?? []), v]); };
  for (const r of records as readonly object[] as readonly Rec[]) {
    const block = str(r.block_id);
    if (block === null) continue;
    if (r.record === 'mock_open') {
      const at = timeOf(r.ts);
      const form = str(r.form_id);
      if (!isMockKind(r.mock) || form === null || Number.isNaN(at)) continue;
      const passMark = typeof r.pass_correct === 'number' && Number.isInteger(r.pass_correct) && r.pass_correct >= 0 ? r.pass_correct : passCorrect(r.mock, file[r.mock]);
      opens.push({ block, mock: r.mock, form, at, minutes: typeof r.minutes === 'number' && r.minutes > 0 ? r.minutes : file[r.mock].minutes, onUnseen: r.on_unseen === true,
        passCorrect: passMark });
    } else if (r.record === 'block_close') {
      const at = timeOf(r.ts);
      if (!Number.isNaN(at) && !closes.has(block)) closes.set(block, at);
    } else if (r.record === 'attempt' && r.phase === 'mock' && countsAsAttempt(r)) {
      const item = str(r.item_id);
      const at = timeOf(r.submitted_at);
      if (item !== null && !Number.isNaN(at)) push(answers, block, { item, at, pass: r.outcome === 'pass' });
    } else if (r.record === 'self_check' && r.kind === 'rubric') {
      const at = timeOf(r.ts);
      const ticked = Array.isArray(r.ticked) ? r.ticked.filter((t): t is string => typeof t === 'string') : [];
      if (!Number.isNaN(at)) push(rubrics, block, { at, ticked });
    } else if (r.record === 'self_check' && r.kind === 'insight') {
      const at = timeOf(r.ts);
      if (!Number.isNaN(at)) push(insights, block, at);
    }
    if ((r.record === 'attempt' && r.phase === 'mock') || r.record === 'item_close') {
      const item = str(r.item_id);
      if (item !== null) served.set(block, (served.get(block) ?? new Set()).add(item));
    }
  }
  const taken = new Set<string>();
  return [...opens].sort((a, b) => a.at - b.at).map((o): MockRun => {
    // S7-04: a fixed form opened before is seen, whatever this start said. The knowledge mock's start decides from its draw alone.
    const formKey = `${o.mock}\u0000${o.form}`;
    const onUnseen = o.onUnseen && (o.mock === 'knowledge' || !taken.has(formKey));
    taken.add(formKey);
    const deadline = o.mock === 'take_home' ? o.at + file.take_home.close_after_hours * HOUR_MS : o.at + o.minutes * MINUTE_MS;
    const closed = closes.get(o.block) ?? null;
    const ended = closed ?? (now.getTime() >= deadline ? deadline : null);
    // Each item's or checkpoint's first answer that counts, logged before the run ended.
    const inRun = (answers.get(o.block) ?? []).filter((a) => ended === null || a.at <= ended);
    const first = new Map<string, Answer>();
    for (const a of [...inRun].sort((x, y) => x.at - y.at)) {
      const key = answerKey(o.mock, a.item);
      if (!first.has(key)) first.set(key, { key, at: a.at, pass: a.pass });
    }
    // The review shows the latest rubric (a tie keeps the later line); CP6 reads every rubric of the block (S7-05, S7-16).
    const ticks = rubrics.get(o.block) ?? [];
    const rubric = ticks.length === 0 ? null : ticks.reduce((a, b) => (b.at >= a.at ? b : a)).ticked;
    const run = { block_id: o.block, mock: o.mock, form_id: o.form, opened_at: iso(o.at), ended_at: ended === null ? null : iso(ended), on_unseen: onUnseen, rubric_ticked: rubric };
    // S7-15 (ruling S7-C30): what was logged before the end and after the deadline is late: an answer, or CP6's memo saved again.
    const due = deadlineOf(o.at, o.minutes);
    const late = [...inRun.map((a) => a.at), ...(insights.get(o.block) ?? []).filter((at) => ended === null || at <= ended)].some((at) => isLateAt(o.mock, at, due));
    const score = scoreOf(o, file, first, ticks.map((t) => t.ticked), served.get(o.block)?.size ?? 0);
    const passed = ended !== null && score.passes && !late;
    const status: MockRunStatus = ended === null ? 'on' : (o.mock === 'case_round' || o.mock === 'take_home') && rubric === null ? 'waiting_rubric' : 'ended';
    return { ...run, correct: score.correct, total: score.total, late, status, passed, counts: passed && onUnseen };
  });
}

/**
 * The run's score by its kind's rule (S7-09, S7-10, S7-16, D102), whether or not it has ended. Codex F35 (S7-C34): on its own answers, the
 * `served` items its instances named and its own pass mark; only a case mock's core rubric lines come from the rules.
 */
function scoreOf(o: Open, file: MocksFile, first: ReadonlyMap<string, Answer>, rubrics: readonly (readonly string[])[], served: number):
  { correct: number; total: number; passes: boolean } {
  const mock = o.mock;
  if (mock === 'screen' || mock === 'knowledge') {
    const correct = [...first.values()].filter((a) => a.pass).length;
    return { correct, total: Math.max(file[mock].questions, served), passes: correct >= o.passCorrect };
  }
  const auto = AUTO_GRADED.filter((cp) => first.get(cp)?.pass === true).length;
  // S7-16: CP6 passed once any rubric self-check of the run ticked every core line; S7-05: a later, smaller one does not undo it.
  const cp6 = rubrics.some((ticked) => file[mock].core_rubric.every((line) => ticked.includes(line)));
  return { correct: auto + (cp6 ? 1 : 0), total: CASE_CHECKPOINTS, passes: cp6 && auto >= o.passCorrect };
}

/**
 * Ruling S7-C36 (F4-1-1): the knowledge mock's own showings, for its draw and its unseen date. Every question a knowledge block's records
 * name (its answers and its run end's item_close run_end, S7-06) counts as shown at that block's mock_open time, answered or not, as a
 * fixed form is spent once opened. Every other run keeps S2-97 (seenIn): an unreached question there was never seen.
 */
export function knowledgeShowings(records: readonly object[]): { item_id: string; started_at: string }[] {
  const opened = new Map<string, string>();
  for (const r of records as readonly Rec[]) {
    const block = str(r.block_id), ts = str(r.ts);
    if (r.record === 'mock_open' && r.mock === 'knowledge' && block !== null && ts !== null && !opened.has(block)) opened.set(block, ts);
  }
  const out: { item_id: string; started_at: string }[] = [];
  const named = new Set<string>();
  for (const r of records as readonly Rec[]) {
    const block = str(r.block_id), item = str(r.item_id);
    const at = block === null ? undefined : opened.get(block);
    if ((r.record !== 'attempt' && r.record !== 'item_close') || item === null || at === undefined || named.has(`${block}\u0000${item}`)) continue;
    named.add(`${block}\u0000${item}`);
    out.push({ item_id: item, started_at: at });
  }
  return out;
}

/**
 * S7-05: each mock's stage, met by its first counting pass. Ruling S7-C24 (L84, F2-4-2): a run has one date, the Amsterdam date of its
 * mock_open (the day it was taken). The met stage and the history row both show it, whenever a case mock's rubric is ticked and whatever a
 * recovery block_close writes; so the first counting pass is the one opened first. A met stage stays met.
 */
export function stagesMet(runs: readonly MockRun[]): Map<MockKind, string> {
  const out = new Map<MockKind, string>();
  const counting = runs.filter((r) => r.counts && r.ended_at !== null).sort((a, b) => Date.parse(a.opened_at) - Date.parse(b.opened_at));
  for (const r of counting) if (!out.has(r.mock)) out.set(r.mock, amsterdamDate(new Date(r.opened_at)));
  return out;
}

/**
 * The mocks a start can take now (S7-04), whose stage is open rather than "not yet available" (S2-38): a fixed-form mock with at least
 * one form, so nextForm is not null; and the knowledge mock, which has no forms, when `knowledgeReady` says its pools can fill a draw
 * (S7-C21: server/run.ts knowledgeReady).
 */
export function mocksAvailable(file: MocksFile, knowledgeReady = false): Set<MockKind> {
  return new Set(MOCK_KINDS.filter((m) => (m === 'knowledge' ? knowledgeReady : file[m].forms.length > 0)));
}

/**
 * S7-04: the form a fixed-form mock's start takes: the first form in file order with no mock_open, unseen; once every form is taken, the
 * one whose latest mock_open is the oldest (ties: file order), as practice. Null when the mock has no form yet.
 */
export function nextForm(mock: FormMockKind, runs: readonly MockRun[], file: MocksFile): { form_id: string; on_unseen: boolean } | null {
  const forms = file[mock].forms;
  if (forms.length === 0) return null;
  const latest = new Map<string, number>();
  for (const r of runs) if (r.mock === mock) latest.set(r.form_id, Math.max(latest.get(r.form_id) ?? -Infinity, Date.parse(r.opened_at)));
  const fresh = forms.find((f) => !latest.has(f.id));
  if (fresh) return { form_id: fresh.id, on_unseen: true };
  const oldest = forms.reduce((best, f) => (latest.get(f.id)! < latest.get(best.id)! ? f : best));
  return { form_id: oldest.id, on_unseen: false };
}

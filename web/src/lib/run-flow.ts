// web/src/lib/run-flow.ts: the GA4 timed run screens' rules, wording and review rows, kept pure so they are testable (design §8,
// §14; rulings S3-02 to S3-04, S3-10, S3-12; Task B3). Nothing here shows or holds answer keys: the half-mock review is a
// number, a topic and right or wrong. The time left is display only: the server is the clock.
import {
  ApiError, type RunBlueprint, type RunHistoryRow, type RunKind, type RunMode, type RunPreview, type RunReviewItem, type RunStarted, type TopicScore,
} from '../api.ts';

export type { RunKind, RunMode };

// ---- the mode rules (S3-02, S3-04) -----------------------------------------------------------------------------------------------

export interface ModeRules { goBack: boolean; jump: boolean; flag: boolean; list: boolean; changeAnswer: boolean }
/** Practice (a mini drill): any question, flags, a changed answer. Exam (a half-mock): forward only, one answer, no list. */
export function modeRules(mode: RunMode): ModeRules {
  const open = mode === 'practice';
  return { goBack: open, jump: open, flag: open, list: open, changeAnswer: open };
}
/** Question indexes are 0-based. Practice moves to any question in range; exam only to the next one. */
export function canMoveTo(mode: RunMode, from: number, to: number, total: number): boolean {
  if (!Number.isInteger(to) || to < 0 || to >= total) return false;
  return modeRules(mode).jump ? true : to === from + 1;
}
/** Exam: a question takes one answer. Practice: any change is a new answer. */
export const canSaveAnswer = (mode: RunMode, alreadySaved: boolean): boolean => modeRules(mode).changeAnswer || !alreadySaved;

/** What a question shows in a run: never help or a result (S3-03); confidence only in a mini drill (S3-04); concept labels hidden (S2-39). */
export function questionView(kind: RunKind, mode: RunMode) {
  const r = modeRules(mode);
  return { confidence: kind === 'mini_drill', showAnswer: false as const, resultAfterAnswer: false as const, flag: r.flag, list: r.list, conceptLabels: false as const };
}

// ---- the clock and the end -------------------------------------------------------------------------------------------------------

/** "mm:ss", both padded: the time left is a test rule, shown while a run is on. */
export function timeLeft(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
export const TIME_UP = 'Time is up.';

/** 1-based numbers of the questions with no saved answer, in order. `answered` holds 0-based indexes; out-of-range ones are ignored. */
export function unansweredNumbers(total: number, answered: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < total; i++) if (!answered.has(i)) out.push(i + 1);
  return out;
}
/** The confirmation shown in the page (no browser dialog) before "End now". */
export function endNowText(unanswered: readonly number[]): string {
  if (unanswered.length === 0) return 'End the run now? Your answers are scored and the review opens.';
  const n = unanswered.length;
  const who = n === 1 ? '1 question is unanswered' : `${n} questions are unanswered`;
  return `End the run now? ${who} (${unanswered.join(', ')}) and ${n === 1 ? 'counts' : 'count'} as wrong.`;
}

// ---- the question list and flags (practice only; flags live in the browser, S3-02) -----------------------------------------------

export function flagsAfter(flags: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(flags);
  if (next.has(index)) next.delete(index); else next.add(index);
  return next;
}
export interface ListRow { n: number; answered: boolean; flagged: boolean; current: boolean; label: string }
export function listRows(total: number, answered: ReadonlySet<number>, flagged: ReadonlySet<number>, current: number): ListRow[] {
  return Array.from({ length: total }, (_, i) => {
    const a = answered.has(i), f = flagged.has(i);
    return { n: i + 1, answered: a, flagged: f, current: i === current, label: `Question ${i + 1}${a ? ', answered' : ''}${f ? ', flagged' : ''}` };
  });
}

/** Every question's panel stays mounted, so a half-written answer survives a move; only the current one shows. */
export const hiddenFlags = (count: number, index: number): boolean[] => Array.from({ length: count }, (_, i) => i !== index);

// ---- wording ---------------------------------------------------------------------------------------------------------------------

const DEFAULT_BLUEPRINT = { mini_drill: { questions: 20, minutes: 30 }, half_mock: { questions: 25, minutes: 37.5 } } as const;
const KIND_LABEL: Record<RunKind, string> = { mini_drill: 'Mini drill', half_mock: 'Half-mock' };
export const kindLabel = (k: RunKind): string => KIND_LABEL[k];
/** The entry button: from the server's blueprint when it is known, else the shipped values. A time limit is a test rule, so it may show. */
export function entryLabel(kind: RunKind, bp: { questions: number; minutes: number } | null): string {
  const { questions, minutes: limit } = bp ?? DEFAULT_BLUEPRINT[kind];
  return `${KIND_LABEL[kind]} (${questions} questions, ${limit} minutes)`;
}
export const unseenComesBack = (date: string): string => `Unseen questions come back on ${date}`;

export const runHeading = (k: RunKind): string => `GA4 ${k === 'mini_drill' ? 'mini drill' : 'half-mock'}`;
export function runLine(r: { kind: RunKind; questions: number; minutes: number; pass_pct: number; mode: RunMode }): string {
  const limit = r.minutes;          // a run's time limit is a test rule, so it may be shown
  const head = `${r.questions} questions, ${limit} minutes, pass at ${r.pass_pct}%.`;
  return r.mode === 'exam'
    ? `${head} One question at a time, no going back, one answer each. Unanswered questions count as wrong.`
    : `${head} Go back, flag a question and change an answer at any time. Help opens in the review.`;
}
export const HELP_LINE = 'Help opens in the end-of-run review.';

export function scoreLine(s: { correct: number; of: number; pct: number; pass: boolean; pass_pct: number }): string {
  return `Score: ${s.correct} of ${s.of} (${s.pct}%). Pass mark ${s.pass_pct}%. ${s.pass ? 'Passed.' : 'Not passed.'}`;
}
/** S3-10: a half-mock says whether it was on unseen items (D27); a mini drill gives the unseen share. */
export function unseenLine(r: { kind: 'half_mock'; on_unseen: boolean | null | undefined } | { kind: 'mini_drill'; unseen: number | null | undefined; unseen_pct: number | null | undefined }): string {
  if (r.kind === 'half_mock') return `On unseen items: ${r.on_unseen ? 'yes' : 'no'}.`;
  return `Unseen questions: ${r.unseen ?? 0} (${r.unseen_pct ?? 0}%).`;
}

export type TopicNames = Readonly<Record<string, string>>;
/** A GA4 topic by its name (content/ga4/exam.json); with no name, by number: "T-GA4-03" is "Topic 3". Any other ID shows as it is. */
export function topicLabel(topic: string, names?: TopicNames): string {
  const named = names?.[topic];
  if (named) return named;
  const m = /^T-GA4-0*(\d+)$/.exec(topic);
  return m ? `Topic ${m[1]}` : topic;
}
export const TOPIC_COLUMNS = ['Topic', 'Right', 'Share'] as const;
export const topicRows = (rows: readonly TopicScore[], names?: TopicNames): string[][] => rows.map((t) => [topicLabel(t.topic, names), `${t.correct} of ${t.of}`, `${t.pct}%`]);

// ---- the review (S3-03, S3-12) ----------------------------------------------------------------------------------------------------

export interface ReviewRow { n: number; topic: string; verdict: string; item_id?: string; item_instance_id?: string; chosen?: string | null }
const verdictOf = (i: { answered: boolean; correct: boolean }): string => (i.correct ? 'Right' : i.answered ? 'Wrong' : 'Wrong (unanswered)');
/**
 * A half-mock row is a number, a topic and right or wrong, and nothing else: no item, stem, option, key or explanation (S3-12).
 * A mini drill row also names its item and instance, so the screen can show the question and open its answer (S3-03).
 */
export function reviewRows(kind: RunKind, items: readonly RunReviewItem[], names?: TopicNames): ReviewRow[] {
  return items.map((i): ReviewRow => {
    const row: ReviewRow = { n: i.n, topic: topicLabel(i.topic, names), verdict: verdictOf(i) };
    if (kind === 'half_mock' || i.item_id === undefined || i.item_instance_id === undefined) return row;
    return { ...row, item_id: i.item_id, item_instance_id: i.item_instance_id, chosen: i.chosen ?? null };
  });
}

// ---- the history (S3-10: never minutes) ------------------------------------------------------------------------------------------

export const HISTORY_COLUMNS = ['Date', 'Kind', 'Score', 'Passed', 'Unseen', 'By topic'] as const;
export function historyCells(r: RunHistoryRow, names?: TopicNames): string[] {
  const unseen = r.kind === 'half_mock' ? `On unseen items: ${r.on_unseen ? 'yes' : 'no'}` : `${r.unseen ?? 0} of ${r.of} unseen`;
  return [r.date, kindLabel(r.kind), `${r.correct} of ${r.of} (${r.pct}%)`, r.pass ? 'Yes' : 'No', unseen, r.by_topic.map((t) => `${topicLabel(t.topic, names)} ${t.correct} of ${t.of}`).join('; ')];
}

// ---- refusals (a second start, a second answer) -----------------------------------------------------------------------------------

/**
 * A 409 to an answer, read from the server's code and never from its message text (B3 M1): the half-mock's "one answer per
 * question", or a run that has ended. Any other 409 (a question not opened here) is another error and never ends a run.
 * The codes are server/run.ts's CODE_ONE_ANSWER and CODE_RUN_OVER; tests/web/run-flow.test.ts imports them to catch drift.
 */
export function classifyRunRefusal(e: unknown): 'answered' | 'over' | 'other' {
  if (!(e instanceof ApiError) || e.status !== 409) return 'other';
  const code = (e.body as { code?: unknown } | undefined)?.code;
  return code === 'ONE_ANSWER' ? 'answered' : code === 'RUN_OVER' ? 'over' : 'other';
}
/** M1: a refusal read as "over" ends the run only when the server no longer has that run on (it asked /api/run/current). */
export const overConfirmed = (current: { block_id: string } | null, block: string): boolean => current?.block_id !== block;
/**
 * S1: an answer refused with a 404 (the half-mock's "Unknown question.") or a 409 with no code (the mini drill's "not opened here") may mean the
 * server no longer has the run (a restart, or an end in another tab). The screen then asks /api/run/current; a refusal during a live run only
 * shows its message. A 409 that carries a code is classified by classifyRunRefusal and is not read here.
 */
export function runMayBeGone(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 404) return true;
  return e.status === 409 && typeof (e.body as { code?: unknown } | undefined)?.code !== 'string';
}
/** S1: the note when /api/run/end says 404: the run was never logged (no answer was saved before the app restarted). */
export const RUN_GONE_NOTE = 'This run ended when the app restarted, before any answer was saved.';
export const endRefusalNote = (e: unknown): string | null => (e instanceof ApiError && e.status === 404 ? RUN_GONE_NOTE : null);
/** B3 M2: "Time is up." only when the clock reached ends_at; an end in another tab or a session end gets a neutral line. */
export const reachedEnd = (endsAt: string, now: number): boolean => now >= Date.parse(endsAt);
export const RUN_ENDED = 'This run has ended.';
export const endReasonLine = (byTime: boolean): string => (byTime ? TIME_UP : RUN_ENDED);
/** B2 M7: after a crash or restart the review lists only the logged questions while the score is out of the blueprint. */
export const UNSAVED_NOT_LISTED = 'Questions the app had not saved an answer for are not listed.';
/** F13: the log keeps no form order, so a run startup recovery closed numbers its questions in the order they were answered. */
export const RECOVERED_NUMBERING = 'The app restarted during this run, so its questions are numbered in the order you answered them.';
export const recoveredLine = (review: { recovered?: boolean }): string | null => (review.recovered === true ? RECOVERED_NUMBERING : null);
export const unlistedLine = (questions: number, rows: number): string | null => (rows < questions ? UNSAVED_NOT_LISTED : null);

/** The GA4 run a refused start carries (a second start while one runs answers 409 with that run), so the screen resumes it. */
export function ga4RunFromRefusal(e: unknown): RunStarted | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const run = (e.body as { run?: RunStarted } | undefined)?.run;
  return run && run.section === 'ga4' && Array.isArray(run.servings) && typeof run.ends_at === 'string' ? run : null;
}

// ---- what the learner did, kept for the tab so a resumed run shows it ------------------------------------------------------------

export interface TabStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
const tabStore = (): TabStore | null => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
type SetKind = 'answered' | 'flags';
export function rememberSet(kind: SetKind, block: string, set: ReadonlySet<number>, store: TabStore | null = tabStore()): void {
  try { store?.setItem(`run:${kind}:${block}`, JSON.stringify([...set])); } catch { /* optional */ }
}
export function recallSet(kind: SetKind, block: string, count: number, store: TabStore | null = tabStore()): Set<number> {
  try {
    const v: unknown = JSON.parse(store?.getItem(`run:${kind}:${block}`) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < count) : []);
  } catch { return new Set(); }
}
export function rememberIndex(block: string, index: number): void { try { tabStore()?.setItem(`run:at:${block}`, String(index)); } catch { /* optional */ } }
export function recallIndex(block: string, count: number): number {
  try { const n = Number(tabStore()?.getItem(`run:at:${block}`)); return Number.isInteger(n) && n >= 0 && n < count ? n : 0; } catch { return 0; }
}

// ---- the fix round: active time, resuming, past reviews, the entry note (B3 I1, I2, I3, Ruling A) --------------------------------

/**
 * I1: when the panel's active time starts. A question counts from when it is current (not from when the run began, which every
 * panel of a practice run shares) and again after each save. A hidden panel's load does not start it.
 */
export function shownAtAfter(prev: number, event: 'loaded' | 'visible' | 'saved', visible: boolean, now: number): number {
  if (event === 'loaded') return visible ? now : prev;
  return now;
}

/**
 * I2: where a resumed run opens. The server's answered positions are the truth. An exam opens at the first position after the last
 * answered one (a second tab or cleared storage never shows question 1 again), and never before the position this tab remembers;
 * practice opens at the remembered question.
 */
export function resumeIndex(mode: RunMode, answered: readonly number[], total: number, remembered: number): number {
  const ok = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < total;
  const rem = ok(remembered) ? remembered : 0;
  if (mode === 'practice') return rem;
  const last = answered.filter(ok).reduce((m, n) => Math.max(m, n), -1);
  return Math.min(total - 1, Math.max(last + 1, rem));
}
/** The panels a run mounts: practice keeps every one (a half-written answer survives a move); an exam only the current one. */
export const questionsShown = (mode: RunMode, index: number, total: number): number[] => (modeRules(mode).jump ? Array.from({ length: total }, (_, i) => i) : [index]);

/** I3: a history row opens that run's review at #/ga4/run/<block_id>. */
export const reviewHref = (block: string): string => `#/ga4/run/${encodeURIComponent(block)}`;
/** The block a run-screen hash names (parts of #/ga4/run/<block_id>), or null. */
export function blockFromParts(parts: readonly string[]): string | null {
  const raw = parts[2];
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}

/** Ruling A: the line under an entry when D27 applies (only a half-mock has a date, and only when the server gave one). */
export function entryNote(kind: RunKind, preview: RunPreview | null): string | null {
  const date = preview?.next_unseen_date[kind] ?? null;
  return date ? unseenComesBack(date) : null;
}

export type { RunBlueprint };

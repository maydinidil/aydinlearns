// web/src/lib/exercise.ts
import { DEFAULT_RULES, type GradingRules } from '../../../schemas/item.ts';
import type { DatasetResult, DiffSample, GradeOutcome, PartialScore } from '../../../server/grader/types.ts';
import type { DisplayOk } from '../../../server/runner/protocol.ts';
import { ApiError } from '../api.ts';

/** One showing of an exercise, as the browser tracks it. The server knows it by `id`, and closes it once. */
export interface Instance {
  id: string; startedAt: string; started: number;
  failed: number;                       // failed graded attempts
  passed: boolean; helped: boolean; closed: boolean;
  hints: number;                        // hint levels opened on this instance
}
export function newInstance(now = Date.now()): Instance {
  return { id: crypto.randomUUID(), startedAt: new Date(now).toISOString(), started: now, failed: 0, passed: false, helped: false, closed: false, hints: 0 };
}

/**
 * The session ends this page has asked for (the header's "End session"), counted for the whole page. A session end closes
 * every open instance on the server, so an exercise opened before it must not send its close when it leaves the screen
 * afterwards: the close would start a session nobody asked for and log a stray close in it (Task B15, fix round 1).
 */
let sessionEnds = 0;
export function noteSessionEnd(): void { sessionEnds++; }
export const sessionEndsSeen = (): number => sessionEnds;
/** Whether an exercise leaving the screen sends its close: not when closed already, nor when a session end came after it opened. */
export function closesOnUnmount(i: { closed: boolean }, endsWhenOpened: number, endsNow: number): boolean {
  return !i.closed && endsWhenOpened === endsNow;
}

/** The server refused because it has closed the instance (a session end closes every open one): a 409. */
export function isClosedError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
}

/**
 * Calls the server for the open instance. The server answers 409 for an instance it has already
 * closed (a session end closes every open one), so on a 409 this starts a new instance and tries
 * once more. Any other failure, or a second 409, is thrown.
 */
export async function retryIfClosed<T>(current: () => Instance, reopen: () => void, call: (i: Instance) => Promise<T>): Promise<T> {
  try {
    return await call(current());
  } catch (e) {
    if (!isClosedError(e)) throw e;
    reopen();
    return await call(current());
  }
}

/**
 * "I was right" for the open instance. When the server has closed it (a 409 after a session end), the
 * disputed attempt can no longer be overridden: the exercise reopens and nothing is retried, because the new
 * instance has no failed attempt. True when the override was saved, false when the exercise was reopened
 * instead; any other failure is thrown.
 */
export async function overrideOrReopen(call: () => Promise<unknown>, reopen: () => void): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (e) {
    if (!isClosedError(e)) throw e;
    reopen();
    return false;
  }
}

/** The exercise screen's result area: the table from the last Run and the last grade. Each action clears what it makes stale. */
export interface ResultArea<G> { run: DisplayOk | null; grade: G | null }
/** A Run that worked replaces the table and the last grade; a Run that failed clears only the table. */
export function afterRun<G>(s: ResultArea<G>, run: DisplayOk | null): ResultArea<G> { return run ? { run, grade: null } : { ...s, run: null }; }
/** Submitting clears the last grade at once. */
export function beforeSubmit<G>(s: ResultArea<G>): ResultArea<G> { return { ...s, grade: null }; }
/** A grade brings its own table, or none (an engine error or time-out), so an older Run table never sits beside it. */
export function afterGrade<G extends { display: DisplayOk | null }>(g: G): ResultArea<G> { return { run: g.display, grade: g }; }
/** The learner's table shows unless the grade's diff tables take its place. */
export function showsRunTable<G extends { diff: DiffSample | null }>(s: ResultArea<G>): s is ResultArea<G> & { run: DisplayOk } {
  return s.run !== null && !s.grade?.diff;
}

/**
 * The true row counts behind the diff tables, which show a sample of at most 10 rows each. The
 * diff is taken on the first failing dataset. A row with a changed value is listed in both tables
 * (the expected row, and the learner's), so mismatched rows count on both sides.
 */
export function diffTotals(datasets: DatasetResult[], diff: DiffSample): { missing: number; extra: number } {
  const failing = datasets.find((d) => !d.passed);
  if (!failing) return { missing: diff.missing.length, extra: diff.extra.length };
  return { missing: failing.missing + failing.mismatched, extra: failing.extra + failing.mismatched };
}
/** The count line over a diff table: "first 10 of 37 rows" when the sample is not all of them. */
export function sampleCount(shown: number, total: number): string {
  const n = Math.max(shown, total);
  return shown < n ? `first ${shown} of ${n} rows` : `${n} row${n === 1 ? '' : 's'}`;
}

/** "I was right" is for a result that ran and differed ('fail'), never an error or a time-out, and goes once that attempt is overridden. */
export function canDispute(g: { outcome: GradeOutcome; attempt_id: string | null }, overriddenAttemptId: string | null): boolean {
  return g.outcome === 'fail' && g.attempt_id !== overriddenAttemptId;
}

/** Leaving after a pass (or an "I was right") closes the item as passed, by the Next button or by navigating away. */
export function closeReason(i: { passed: boolean }): 'pass' | 'left' { return i.passed ? 'pass' : 'left'; }

/**
 * The grain sentence after the output contract ("One row per customer."), or '' when the item has none. S4-04: the content decides
 * where the line fades (it is null on re-test, pool, drill and opener items at level 3), so the screen shows it whenever it is set.
 */
export function grainLine(contract: { grain: string | null } | null | undefined): string {
  const g = contract?.grain;
  return g ? `. ${g[0]!.toUpperCase()}${g.slice(1)}.` : '';
}

/** One plain-English line per graded rule: row order and column names always, every other rule when it is not the default. */
export function rulesBadge(r: GradingRules): string[] {
  const out = [r.order_matters ? `Row order is checked: ${r.sort_keys.map((k) => `${k.column} (${k.desc ? 'high to low' : 'low to high'})`).join(', ')}` : 'Row order is not checked'];
  out.push(r.check_names ? 'Column names are checked' : 'Column names are not checked');
  if (r.strict_column_order) out.push('Column order is checked');
  if (r.allow_extra_columns) out.push('Extra columns are allowed');
  if (r.strict_temporal_type) out.push('Date and time types must match exactly');
  if (r.trim_strings) out.push('Spaces around text are ignored');
  if (r.case_insensitive) out.push('Upper and lower case are treated the same');
  if (r.set_semantics) out.push('Duplicate rows are ignored');
  if (r.tie_policy === 'stated') out.push('Ties are broken as the question says');
  if (r.key_columns.length > 0) out.push(`Each ${r.key_columns.length === 1 ? r.key_columns[0] : `(${r.key_columns.join(', ')})`} appears once`);
  if (r.timeout_ms !== DEFAULT_RULES.timeout_ms) { const s = r.timeout_ms / 1000; out.push(`Time limit: ${s} second${s === 1 ? '' : 's'}`); }
  for (const c of r.columns) {
    if (c.require_rounding !== undefined) out.push(`${c.name}: rounded to ${c.require_rounding} decimals`);
    else if (c.precision === 'money') out.push(`${c.name}: within half a cent`);
    else if (c.precision === 'ratio') out.push(`${c.name}: within 0.000001`);
  }
  return out;
}

export function checklist(p: PartialScore): { label: string; points: number; max: number; ok: boolean; shown: string }[] {
  const rows = [
    { label: 'Right columns', points: p.shape, max: 20, ok: p.shape === 20 },
    { label: 'One row per thing asked for', points: p.grain, max: 20, ok: p.grain === 20 },
    { label: `Values match (${p.valuesDetail.matched} of ${p.valuesDetail.of} rows)`, points: p.values, max: 40, ok: p.values === 40 },
    { label: 'Works on the hidden test data', points: p.edge, max: 20, ok: p.edge === 20 },
  ].map((r) => ({ ...r, shown: `${r.points}/${r.max}` }));
  // The order line is a penalty, not a part out of 100, so it shows as "−20".
  if (p.orderWrong) rows.push({ label: 'Rows in the order asked for', points: -20, max: 0, ok: false, shown: '−20' });
  return rows;
}

const OUTCOME: Record<GradeOutcome, string> = {
  pass: 'Correct', fail: 'Not yet', engine_error: 'The query has an error', timeout: 'Stopped: took too long',
  crash: 'The SQL runner restarted; try again', rejected: 'Not run',
};
export function outcomeText(o: GradeOutcome): string { return OUTCOME[o]; }

/** The grader could not check the submission because the exercise's own answer key failed: a content fault, not the learner's. */
export function keyFailed(g: { notes: string[] }): boolean {
  return g.notes.some((n) => n.split(':')[0] === 'CHK-KEY-FAILED');
}
/** The grade's heading. A key failure comes back as a crash, but the runner did not restart, so it says what happened instead. */
export function gradeHeading(g: { outcome: GradeOutcome; notes: string[] }): string {
  return keyFailed(g) ? 'This exercise could not be checked' : outcomeText(g.outcome);
}

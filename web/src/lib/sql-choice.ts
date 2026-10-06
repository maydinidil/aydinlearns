// web/src/lib/sql-choice.ts: what each SQL choice kind shows (S3-13), the phase a panel names (S3-17) and the state of the
// optional "why this clause?" question (S3-18). Pure, so node tests cover it (tests/web/sql-choice.test.ts). Nothing here is
// locked: every question stays open, and the "why this clause?" question is never graded, sent or logged.
import type { Phase } from '../../../core/envelope.ts';
import { isSqlChoiceKind, type SqlChoiceKind, type UniqueCheck } from '../../../schemas/item.ts';
import type { OptionTable, TypedSpec } from '../../../schemas/choice-types.ts';
import type { WhyClause } from '../../../schemas/lesson.ts';

/** True for the kinds the choice panel shows (predict_rows, predict_result, choose_query, which_table, is_unique). */
export const usesChoicePanel = (kind: unknown): kind is SqlChoiceKind => isSqlChoiceKind(kind);

/** How the options are drawn: none (a typed count), small tables, code, table names, or plain text (Yes and No). */
export type OptionStyle = 'none' | 'table' | 'code' | 'name' | 'plain';
export interface SqlChoiceLayout { shownSql: string | null; optionStyle: OptionStyle; note: string | null }

const STYLE: Record<SqlChoiceKind, OptionStyle> = { predict_rows: 'none', predict_result: 'table', choose_query: 'code', which_table: 'name', is_unique: 'plain' };

/** What a served SQL choice item shows besides its question: the query to read, how its options look, and a line for is_unique. */
export function sqlChoiceLayout(item: { sql_kind: SqlChoiceKind; shown_sql: string | null; unique_check: UniqueCheck | null; typed: TypedSpec | null }): SqlChoiceLayout {
  const shown = item.shown_sql?.trim() ? item.shown_sql : null;
  const note = item.sql_kind === 'is_unique' && item.unique_check ? `Table: ${item.unique_check.table}. Column: ${item.unique_check.column}.` : null;
  return { shownSql: shown, optionStyle: STYLE[item.sql_kind], note };
}

/** One option table as the screen draws it: every cell as text, a missing value (NULL) as "missing". */
export function optionTableView(t: OptionTable): { columns: string[]; rows: string[][]; count: string } {
  const rows = t.rows.map((r) => r.map((v) => (v === null ? 'missing' : String(v))));
  return { columns: t.columns, rows, count: rows.length === 0 ? 'no rows' : `${rows.length} row${rows.length === 1 ? '' : 's'}` };
}

/** The phase a choice panel names to the server: only a pretest says so (S3-17); the server refuses any other word. */
export const choicePhaseFor = (phase: Phase): 'pretest' | 'free' => (phase === 'pretest' ? 'pretest' : 'free');

// ---- "why this clause?" (S3-18) ---------------------------------------------------------------------------------------------

export type WhyState = { status: 'open' } | { status: 'answered'; chosenId: string } | { status: 'skipped' };
export const startWhy = (): WhyState => ({ status: 'open' });
/** The first choice stands. An id that is not an option (when the question is given) is ignored. */
export function chooseWhy(s: WhyState, id: string, why?: Pick<WhyClause, 'options'>): WhyState {
  if (s.status !== 'open') return s;
  if (why && !why.options.some((o) => o.id === id)) return s;
  return { status: 'answered', chosenId: id };
}
/** Skip closes an open question; an answered one stays answered. */
export const skipWhy = (s: WhyState): WhyState => (s.status === 'open' ? { status: 'skipped' } : s);

export interface WhyView {
  status: WhyState['status']; chosenId: string | null; correct: boolean | null;
  /** The answer and the explanation show at once after a choice, never after a skip. */
  showAnswer: boolean; correctId: string | null; explanation: string | null;
}
export function whyView(why: WhyClause, s: WhyState): WhyView {
  if (s.status !== 'answered') return { status: s.status, chosenId: null, correct: null, showAnswer: false, correctId: null, explanation: null };
  return { status: 'answered', chosenId: s.chosenId, correct: s.chosenId === why.correct_id, showAnswer: true, correctId: why.correct_id, explanation: why.explanation };
}

/** A closed choice item in the shape the lesson and item screens read from an exercise (ClosedResult): a reveal counts as help (S2-11). */
export function choiceClosedResult(r: { correct: boolean; helped?: boolean }): { passed: boolean; failedGraded: number; helped: boolean } {
  return { passed: r.correct, failedGraded: r.correct ? 0 : 1, helped: r.helped ?? false };
}

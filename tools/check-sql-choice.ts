// tools/check-sql-choice.ts: the content checks for SQL choice items (S3-13; Task C4; Review Focus 5) and the lessons'
// "why this clause?" questions (S3-18). tools/check-content.ts runs them with the other SQL checks. Every query an item holds
// runs through the app's own runner and gate, against the course data, so a key that drifts from the data fails by item ID.
//
// | Check | What fails                                                                                              | Items          |
// |-------|---------------------------------------------------------------------------------------------------------|----------------|
// | C01   | The item fails validateSqlChoiceItem, has no key in keys/sql-choice, or the key does not fit it          | every choice   |
// | C31   | predict_rows: the key's value is not the row count of shown_sql on the visible data                      | predict_rows   |
// | C32   | predict_result: not exactly one option's table is shown_sql's result (columns by name, rows as a          | predict_result |
// |       | multiset, cells as the result table shows them), or that option is not the key's                          |                |
// | C33   | choose_query: an option does not run, or gives the key's result on both the visible and the edge data     | choose_query   |
// |       | (same column names, the same rows, and the same row order when the key's outermost query sorts). A result |                |
// |       | over the result table's 1,000-row cap differs from a key that fits, and a key over it fails. An option    |                |
// |       | that differs only in row order is a WARN: the key's ORDER BY may leave ties, which the review confirms    |                |
// | C34   | which_table: an option is not a table of the item's schema (whether the question needs it is the review's)| which_table    |
// | C35   | is_unique: the key's Yes or No is not COUNT(*) = COUNT(DISTINCT column) on the visible table, or on the   | is_unique      |
// |       | edge schema's table when there is one                                                                     |                |
// | C14   | No fresh choice solver record: missing, made for another prompt, shown query, options or schema, or no    | every choice   |
// |       | longer the key when replayed through the choice grader                                                    |                |
// | C36   | A lesson's why_clause names a correct_id that is not one of its options                                   | lessons        |
// | C37   | Two options of a lesson's why_clause have the same text                                                   | lessons        |
//
// Key safety (non-negotiable 2): results name item and concept IDs, dataset names and fixed reasons only. No detail quotes a
// query, an option, a table cell, an explanation or the key's answer, and none says which option is the key's.
import { createHash } from 'node:crypto';
import type { RunnerClient } from '../server/runner/client.ts';
import type { DisplayOk, RowsOk } from '../server/runner/protocol.ts';
import { maskSql, stripLeading, stripTrailing } from '../server/runner/tables.ts';
import { gradeChoice, gradeTyped, parseTyped } from '../server/choice/grade.ts';
import type { SqlChoiceKind, SqlItem } from '../schemas/item.ts';
import { isSqlChoiceKind } from '../schemas/item.ts';
import { sqlChoiceShape, validateChoiceKey, validateSqlChoiceItem, type ChoiceKey, type OptionTable, type TypedSpec } from '../schemas/choice.ts';
import type { Lesson } from '../schemas/lesson.ts';
import { cell } from '../web/src/lib/cell.ts';
import type { CheckResult } from './check-content.ts';

export const SQL_CHOICE_CHECKS = ['C31', 'C32', 'C33', 'C34', 'C35', 'C36', 'C37'] as const;
const KIND_CHECK: Record<SqlChoiceKind, string> = { predict_rows: 'C31', predict_result: 'C32', choose_query: 'C33', which_table: 'C34', is_unique: 'C35' };
/** Rows a check reads of one result: the result table's own cap (server/app.ts DISPLAY_CAP). */
const DISPLAY_CAP = 1000;
const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COULD_NOT_RUN = 'the check could not run; see C01';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** A query as it goes inside (...): no semicolons, comments or whitespace at either end (server/grader/sql.ts). */
const inner = (sql: string): string => stripLeading(stripTrailing(sql));

/** Masked text with everything inside brackets blanked: only the outermost query's own clauses are left. Offsets are kept. */
export function outermost(masked: string): string {
  let depth = 0;
  let out = '';
  for (const ch of masked) {
    if (ch === '(') depth++;
    out += depth > 0 && ch !== '(' && ch !== ')' ? ' '.repeat(ch.length) : ch;
    if (ch === ')') depth = Math.max(0, depth - 1);
  }
  return out;
}
/** The query's outermost query has an ORDER BY of its own, so its row order is part of its result. */
const sorts = (sql: string): boolean => /\border\s+by\b/i.test(outermost(maskSql(stripTrailing(sql))));

// ---- What a blind solver sees (C14) ---------------------------------------------------------------------------------------

/** What a solver sees of an SQL choice item, as the exported view holds it. */
export interface SqlChoiceSeen {
  kind: string; prompt: string; schema: string; shown_sql: string | null;
  options: { text: string; table?: OptionTable }[] | null; typed: TypedSpec | null; unique_check: { table: string; column: string } | null;
}
/**
 * The hash of what a solver sees: the kind, prompt, schema, shown query, typed spec and unique check, and the options as a set
 * (their order is shuffled for the solver and the learner, so it never counts), each its text and table. The same function
 * hashes an item (C14) and an exported view (record-choice-solver), so the two agree exactly.
 */
export function sqlChoicePromptHashOf(s: SqlChoiceSeen): string {
  const seen = {
    kind: s.kind, prompt: s.prompt, schema: s.schema, shown_sql: s.shown_sql,
    options: s.options === null ? null
      : s.options.map((o) => JSON.stringify({ text: o.text, table: o.table ? { columns: o.table.columns, rows: o.table.rows } : null })).sort(),
    typed: s.typed && { precision: s.typed.precision, scale: s.typed.scale, decimals: s.typed.decimals, unit_label: s.typed.unit_label },
    unique_check: s.unique_check && { table: s.unique_check.table, column: s.unique_check.column },
  };
  return sha(JSON.stringify(seen)).slice(0, 16);
}
export function sqlChoiceSeen(item: SqlItem): SqlChoiceSeen {
  const options = item.options?.length ? item.options.map((o) => (o.table ? { text: o.text, table: o.table } : { text: o.text })) : null;
  return { kind: item.kind, prompt: item.prompt, schema: item.schema, shown_sql: item.shown_sql ?? null, options, typed: item.typed ?? null,
    unique_check: item.unique_check ?? null };
}
export const sqlChoicePromptHash = (item: SqlItem): string => sqlChoicePromptHashOf(sqlChoiceSeen(item));

/** C14: why a key's solver record is not a fresh, right blind answer to the item as it is now, or null when it is (as C26). */
export function sqlChoiceSolverProblem(item: SqlItem, key: ChoiceKey): string | null {
  const s = key.solver;
  if (!s) return 'no solver record';
  if (s.prompt_hash !== sqlChoicePromptHash(item)) return 'the prompt, shown query, options or schema changed since the solver record';
  const shape = sqlChoiceShape(item);
  if (shape.kind === 'mcq') {
    if (typeof s.chosen !== 'string' || !shape.options.some((o) => o.oid === s.chosen)) return 'the recorded answer is not one of the options';
    return gradeChoice(shape, key, s.chosen).correct ? null : 'the recorded answer is not the key';
  }
  const parsed = typeof s.typed === 'string' && shape.typed ? parseTyped(s.typed, shape.typed) : null;
  if (!parsed?.ok) return 'the recorded answer is not a number the app accepts';
  return typeof key.value === 'number' && gradeTyped(parsed.value, key.value, shape.typed!).correct ? null : 'the recorded answer is not the key';
}

// ---- Results as the learner sees them -------------------------------------------------------------------------------------

interface Shown { columns: string[]; rows: unknown[][] }
/**
 * A result table as a set of named columns and a multiset of rows, each cell as the result table shows it (web/src/lib/cell.ts):
 * so 3 and the BIGINT "3" agree, and so do a missing value and "NULL", as they do on screen.
 */
function tableSignature(t: Shown): string {
  const order = t.columns.map((name, i) => ({ name, i })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.i - b.i));
  return JSON.stringify({ columns: order.map((c) => c.name), rows: t.rows.map((r) => JSON.stringify(order.map((c) => cell(r[c.i])))).sort() });
}
/** A query's result, the column names in order with the rows as a multiset, and in order. */
interface Result { columns: string; bag: string; ordered: string }
const resultOf = (d: DisplayOk): Result => {
  const rows = d.rows.map((r) => JSON.stringify(r.map(cell)));
  return { columns: JSON.stringify(d.columns.map((c) => c.name)), bag: JSON.stringify([...rows].sort()), ordered: JSON.stringify(rows) };
};

/** A query's result table; 'truncated' when it has more rows than a result table shows; null when it does not run. */
async function displayState(runner: RunnerClient, schema: string, sql: string, deadlineMs: number): Promise<DisplayOk | 'truncated' | null> {
  const r = await runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql, cap: DISPLAY_CAP, deadlineMs });
  return !r.ok ? null : r.data.truncated ? 'truncated' : r.data;
}
async function display(runner: RunnerClient, schema: string, sql: string, deadlineMs: number): Promise<DisplayOk | null> {
  const d = await displayState(runner, schema, sql, deadlineMs);
  return d === 'truncated' ? null : d;
}
/** The first cell of a composed one-row statement, or undefined when it does not run. The gate checks the whole statement. */
async function oneValue(runner: RunnerClient, schema: string, sql: string, deadlineMs: number): Promise<unknown> {
  const r = await runner.request<RowsOk>({ op: 'one_row', schema, sql, deadlineMs });
  return r.ok && r.data.rows.length === 1 ? r.data.rows[0]![0] : undefined;
}
/** The lower-case names of the tables and views of a schema (an app query on the catalogue; the name is checked first). */
async function tablesOf(runner: RunnerClient, schema: string): Promise<Set<string>> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('bad schema name');
  const r = await runner.request<RowsOk>({ op: 'app_query', sql: `SELECT lower(table_name) FROM information_schema.tables WHERE table_schema = '${schema}'` });
  if (!r.ok) throw new Error('the catalogue could not be read');
  return new Set(r.data.rows.map((x) => String(x[0])));
}

// ---- The checks -----------------------------------------------------------------------------------------------------------

/** What a kind check found: failures, and the points only the content review can confirm (a WARN when there are no failures). */
interface Warned { problems: string[]; warnings: string[] }
type KindCheck = (item: SqlItem, key: ChoiceKey, runner: RunnerClient) => Promise<string[] | Warned>;

const checkPredictRows: KindCheck = async (item, key, runner) => {
  const n = await oneValue(runner, item.schema, `SELECT count(*) AS __al_n FROM (\n${inner(item.shown_sql ?? '')}\n) AS __al_q`, item.rules.timeout_ms);
  if (n === undefined) return [`shown_sql does not run on ${item.schema}`];
  return Number(n) === key.value ? [] : [`the key's row count is not the number of rows shown_sql returns on ${item.schema}`];
};

const checkPredictResult: KindCheck = async (item, key, runner) => {
  const r = await display(runner, item.schema, item.shown_sql ?? '', item.rules.timeout_ms);
  if (!r) return [`shown_sql does not run on ${item.schema}, or returns more rows than a result table shows`];
  const result = tableSignature({ columns: r.columns.map((c) => c.name), rows: r.rows });
  const options = (item.options ?? []).map((o) => ({ oid: o.oid, sig: o.table ? tableSignature(o.table) : null }));
  const matching = options.filter((o) => o.sig === result);
  const problems: string[] = [];
  if (matching.length === 0) problems.push(`no option's table is shown_sql's result on ${item.schema}`);
  else if (matching.length > 1) problems.push(`more than one option's table is shown_sql's result on ${item.schema}`);
  else if (matching[0]!.oid !== key.correct_oid) problems.push('the option whose table is shown_sql\'s result is not the key\'s');
  const others = options.filter((o) => o.sig !== result).map((o) => o.sig);
  if (new Set(others).size !== others.length) problems.push('two options show the same table');
  return problems;
};

const checkChooseQuery: KindCheck = async (item, key, runner) => {
  const datasets = [item.schema, item.edge_schema];
  const keyOption = (item.options ?? []).find((o) => o.oid === key.correct_oid);
  if (!keyOption) return [COULD_NOT_RUN];
  const ordered = sorts(keyOption.text);
  // Per option and dataset: its result, 'truncated' (more rows than a result table shows) or null (does not run).
  type Seen = Result | 'truncated' | null;
  const results = new Map<string, Seen[]>();
  for (const o of item.options ?? []) {
    const per: Seen[] = [];
    for (const schema of datasets) { const d = await displayState(runner, schema, o.text, item.rules.timeout_ms); per.push(d === null || d === 'truncated' ? d : resultOf(d)); }
    results.set(o.oid, per);
  }
  const problems: string[] = [];
  const notRun = [...results.values()].filter((per) => per.some((x) => x === null)).length;
  if (notRun) problems.push(`${plural(notRun, 'option does', 'options do')} not run on ${datasets.join(' or ')}`);
  const keyResults = results.get(keyOption.oid)!;
  for (const [i, schema] of datasets.entries()) if (keyResults[i] === 'truncated') problems.push(`the key returns more rows than a result table shows on ${schema}`);
  if (keyResults.some((x) => x === null || x === 'truncated')) return problems;
  const keyAt = (i: number): Result => keyResults[i] as Result;
  // A key that sorts is compared in order. A second run only shows the order is repeatable (as C08); it cannot show the ORDER BY
  // has no ties, so an option that differs only in row order is left to the content review (the warning below).
  if (ordered) {
    for (const [i, schema] of datasets.entries()) {
      const again = await display(runner, schema, keyOption.text, item.rules.timeout_ms);
      if (!again || resultOf(again).ordered !== keyAt(i).ordered) problems.push(`the key's row order is not the same on a second run on ${schema}`);
    }
  }
  // A result too big to show differs from a key that fits (its row count is not the key's), so it is never a twin.
  const others = (item.options ?? []).filter((o) => o.oid !== keyOption.oid).map((o) => results.get(o.oid)!)
    .filter((per) => per.every((x) => x !== null && x !== 'truncated')) as Result[][];
  const sameBag = (per: Result[]): boolean => per.every((x, i) => x.columns === keyAt(i).columns && x.bag === keyAt(i).bag);
  const twins = others.filter((per) => sameBag(per) && (!ordered || per.every((x, i) => x.ordered === keyAt(i).ordered))).length;
  if (twins) problems.push(`${plural(twins, 'option gives', 'options give')} the key's result on both ${datasets.join(' and ')}`);
  // The same columns and rows on both datasets in another order: the sort may leave ties, so both options could be right.
  const orderOnly = ordered ? others.filter((per) => sameBag(per) && per.some((x, i) => x.ordered !== keyAt(i).ordered)).length : 0;
  const warnings = orderOnly ? [`${plural(orderOnly, 'option differs', 'options differ')} from the key only in row order; the content review must confirm the key's ORDER BY leaves no ties`] : [];
  return { problems, warnings };
};

const checkWhichTable: KindCheck = async (item, _key, runner) => {
  const tables = await tablesOf(runner, item.schema);
  const missing = (item.options ?? []).filter((o) => !PLAIN_NAME.test(o.text.trim()) || !tables.has(o.text.trim().toLowerCase())).length;
  return missing ? [`${plural(missing, 'option is', 'options are')} not a table of ${item.schema}`] : [];
};

const checkIsUnique: KindCheck = async (item, key, runner) => {
  const u = item.unique_check;
  const answer = (item.options ?? []).find((o) => o.oid === key.correct_oid)?.text;
  if (!u || !PLAIN_NAME.test(u.table) || !PLAIN_NAME.test(u.column) || (answer !== 'Yes' && answer !== 'No')) return [COULD_NOT_RUN];
  const unique = (schema: string) => oneValue(runner, schema, `SELECT count(*) = count(DISTINCT "${u.column}") AS __al_u FROM "${u.table}"`, item.rules.timeout_ms);
  const visible = await unique(item.schema);
  if (typeof visible !== 'boolean') return [`the table or column is not in ${item.schema}`];
  const problems: string[] = [];
  if (visible !== (answer === 'Yes')) problems.push(`the key's answer does not match the data on ${item.schema}`);
  if ((await tablesOf(runner, item.edge_schema)).has(u.table.toLowerCase())) {
    const edge = await unique(item.edge_schema);
    if (typeof edge !== 'boolean') problems.push(`the column is not in ${item.edge_schema}'s table`);
    else if (edge !== (answer === 'Yes')) problems.push(`the key's answer does not match the data on ${item.edge_schema}`);
  }
  return problems;
};

const KIND_CHECKS: Record<SqlChoiceKind, KindCheck> = {
  predict_rows: checkPredictRows, predict_result: checkPredictResult, choose_query: checkChooseQuery, which_table: checkWhichTable, is_unique: checkIsUnique,
};

/** C01, the item's own kind check (C31 to C35) and C14, in that order. Never throws: a check that cannot run fails with a fixed reason. */
export async function checkSqlChoiceItem(item: SqlItem, key: ChoiceKey | undefined, ctx: { runner: RunnerClient }): Promise<CheckResult[]> {
  const id = typeof item?.id === 'string' ? item.id : String(key?.item_id ?? '(unknown item)');
  const out: CheckResult[] = [];
  const add = (check: string, problems: string[], warnings: string[] = []) => {
    if (problems.length === 0 && warnings.length > 0) out.push({ id, check, ok: false, warn: true, detail: warnings.join('; ') });
    else out.push({ id, check, ok: problems.length === 0, detail: problems.join('; ') });
  };
  let usable = false;
  try {
    const itemProblems = validateSqlChoiceItem(item);
    const keyProblems = !key ? ['the item has no key in keys/sql-choice']
      : validateChoiceKey(key, itemProblems.length ? undefined : sqlChoiceShape(item)).map((p) => `key: ${p}`);
    add('C01', [...itemProblems, ...keyProblems]);
    usable = !!key && keyProblems.length === 0;
  } catch { add('C01', ['the item or its key could not be read']); }
  const kind = isSqlChoiceKind(item?.kind) ? item.kind : null;
  if (kind) {
    let found: string[] | Warned;
    try { found = usable ? await KIND_CHECKS[kind](item, key!, ctx.runner) : [COULD_NOT_RUN]; } catch { found = [COULD_NOT_RUN]; }
    if (Array.isArray(found)) add(KIND_CHECK[kind], found); else add(KIND_CHECK[kind], found.problems, found.warnings);
  }
  let solver: string[];
  try { solver = usable ? [sqlChoiceSolverProblem(item, key!)].filter((p): p is string => p !== null) : [COULD_NOT_RUN]; } catch { solver = [COULD_NOT_RUN]; }
  add('C14', solver);
  return out;
}

/** C36 and C37 for a lesson with a why_clause (S3-18); none for a lesson without one. A malformed one fails both (C02 says why). */
export function checkWhyClause(lesson: Lesson): CheckResult[] {
  const w = lesson?.why_clause;
  if (w === undefined || w === null) return [];
  const id = String(lesson.concept_id);
  const result = (check: string, fn: () => string[]): CheckResult => {
    let problems: string[];
    try { problems = fn(); } catch { problems = ['the check could not run; see C02']; }
    return { id, check, ok: problems.length === 0, detail: problems.join('; ') };
  };
  const options = () => { if (!Array.isArray(w.options)) throw new Error('no options'); return w.options; };
  return [
    result('C36', () => (options().some((o) => o?.id === w.correct_id) ? [] : ['correct_id is not one of the options'])),
    result('C37', () => {
      const texts = options().map((o) => String(o?.text).replace(/\s+/g, ' ').trim().toLowerCase());
      return new Set(texts).size === texts.length ? [] : ['two options have the same text'];
    }),
  ];
}

/** The line check:content prints for C31 to C37: passes and totals, zeros included, so the counts show before content exists. */
export function sqlChoiceTallyLine(results: readonly CheckResult[]): string {
  const parts = SQL_CHOICE_CHECKS.map((c) => {
    const rs = results.filter((r) => r.check === c);
    return `${c} ${rs.filter((r) => r.ok).length}/${rs.length}`;
  });
  return `sql choice checks (passed / total): ${parts.join(', ')}`;
}


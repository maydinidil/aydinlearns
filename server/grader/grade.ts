// server/grader/grade.ts: the grading pipeline (design §6). Expected rows reach the browser only through `diff`.
import type { ColumnMeta, DisplayOk, GateOk, RowsOk, RunnerError } from '../runner/protocol.ts';
import type { RunnerClient, RunnerResult } from '../runner/client.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';
import type { DatasetResult, Diagnosis, DiffSample, GradeResult, PartialScore } from './types.ts';
import { buildPlans, partialPlan, type ComparePlan } from './plan.ts';
import { composeDiffSql, composeGrainSql, composeOrderSql, composeWitnessSql } from './sql.ts';
import { classifyEngineError } from './engine-errors.ts';
import { extraColumnIsGroupingKey, fill, matchMutant, type Feedback } from './diagnose.ts';
import { partialScore } from './partial.ts';
import { INT_TRUNC_NOTE, intTruncated } from './int-trunc.ts';
import { portabilityNotes } from './portability.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';

export type { Feedback } from './diagnose.ts';
// 1b.1 (sprint 2): the partial score after a shape failure counts the columns that map (design §5).
// 1b.2 (sprint 2, Task B9): CHK-INT-TRUNC (E-055) is logged after a failed comparison; require_rounding rounds the
// key in its own type; G2's bounds allow for DOUBLE rounding, so a value exactly half a cent off passes.
// 1b.3 (sprint 2, Task B10): CHK-INT-TRUNC is also an error signature: with no planted query matched, it diagnoses
// ERR-LOG-05 (E-146) before the ERR-LOG-00 fallback (design §6 step 7).
export const GRADER_VERSION = '1b.3';
const DISPLAY_CAP = 1000;
const DIFF_LIMIT = 10;
const KEY_FAILED = 'This exercise could not be checked. Please report it.';
/** `schemaNotes` give the columns of the item's tables to the portability lint; without them it gives only the `==` note. */
type Deps = { runner: RunnerClient; edge: EdgeDescription | null; feedback: Feedback; schemaNotes?: readonly TableNote[] };

const result = (over: Partial<GradeResult>): GradeResult => ({
  outcome: 'fail', graded: true, display: null, datasets: [], diagnosis: null, partial: null, diff: null,
  edgeDescription: null, matchedMutantId: null, keyIndexUsed: null, notes: [], rejectMessage: null, portabilityNotes: [], ...over,
});

/**
 * A runner failure on the learner's own query, or on a statement the grader composed around it.
 * Every gate reason, 'table_check_unavailable' included, is a rejection, and a crash is not graded
 * (design §6 step 2). A composed statement also holds the key, so only the first line of its
 * message is shown: the excerpt DuckDB adds below it could quote the key.
 */
function fromRunnerError(e: RunnerError, sql: string, deps: Deps, composed: boolean): GradeResult {
  if (e.kind === 'gate') return result({ outcome: 'rejected', graded: false, rejectMessage: e.message });
  if (e.kind === 'crash') return result({ outcome: 'crash', graded: false, notes: ['CHK-RUNNER-CRASH: the SQL runner restarted. Try again.'] });
  if (e.kind === 'timeout') {
    return result({ outcome: 'timeout', notes: ['CHK-TIMEOUT'], diagnosis: { errorId: 'ERR-LOG-00', source: 'engine',
      feedback: { assumed: 'Your query ran past the time limit.', why: 'Your query may be multiplying rows.', model: 'Check each join and filter, then run it again.' } } });
  }
  const c = classifyEngineError(e.message, sql);
  return result({ outcome: 'engine_error', notes: [composed ? e.message.split('\n')[0]! : e.message],
    diagnosis: { errorId: c.errorId, source: 'engine', feedback: fill(deps.feedback, c.errorId, { column: c.column ?? '', table: c.table ?? '' }) } });
}

/** One dataset's comparison counts. A runner failure ends grading, so a returned result never timed out. */
async function witness(deps: Deps, schema: string, sql: string, keySql: string, plan: ComparePlan, deadlineMs: number): Promise<RunnerResult<DatasetResult>> {
  const r = await deps.runner.request<RowsOk>({ op: 'one_row', schema, sql: composeWitnessSql(sql, keySql, plan), deadlineMs });
  if (!r.ok) return r;
  const [extra, missing, mismatched, matched, learnerRows, keyRows] = r.data.rows[0]!.map(Number) as [number, number, number, number, number, number];
  return { ok: true, data: { schema, passed: extra === 0 && missing === 0 && mismatched === 0, extra, missing, mismatched, matched, learnerRows, keyRows, timedOut: false } };
}

/** Where a column the rules name (in sort_keys or key_columns) sits in the key's output. */
function keyColumn(item: SqlItem, keyCols: ColumnMeta[], name: string): number {
  const i = keyCols.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`the rules for ${item.id} name a column its key does not return (content check failure)`);
  return i;
}

/**
 * The partial score after a shape failure (design §5, sprint 2). Shape and Edge stay 0. Grain and Values are
 * worked out on the visible dataset over the key columns that map to a learner column (partialPlan): Values from
 * one witness of the reference key, Grain from its row counts and, where the rules declare key columns, from
 * those columns being unique in the learner's result. A declared key column that does not map loses Grain. When
 * nothing maps, or a runner call fails, the score is 0 as before (build record, Task 14: runner failures after a
 * fail degrade quietly).
 */
async function shapePartial(deps: Deps, item: SqlItem, sql: string, keySql: string, learnerCols: ColumnMeta[], keyCols: ColumnMeta[], learnerRowCount: number): Promise<PartialScore> {
  // keyRows 1 keeps this zero score off the empty rule: no values were compared.
  const none = partialScore({ shapeOk: false, rowsEqual: false, keysUnique: false, matched: 0, learnerRows: learnerRowCount, keyRows: 1, edgePassed: false });
  const plan = partialPlan(learnerCols, keyCols, item.rules);
  if (!plan) return none;
  const deadlineMs = item.rules.timeout_ms;
  const w = await witness(deps, item.schema, sql, keySql, plan, deadlineMs);
  if (!w.ok) return none;
  const { matched, learnerRows, keyRows } = w.data;
  let keysUnique = true;
  if (item.rules.key_columns.length) {
    const positions = item.rules.key_columns.map((name) => plan.keyOrder.indexOf(keyColumn(item, keyCols, name)));
    if (positions.some((j) => j < 0)) keysUnique = false;
    else {
      const g = await deps.runner.request<RowsOk>({ op: 'one_row', schema: item.schema, sql: composeGrainSql(sql, learnerCols.length, positions.map((j) => plan.learnerOrder[j]!)), deadlineMs });
      if (!g.ok) return none;
      keysUnique = Number(g.data.rows[0]![0]) === Number(g.data.rows[0]![1]);
    }
  }
  return partialScore({ shapeOk: false, rowsEqual: learnerRows === keyRows, keysUnique, matched, learnerRows, keyRows, edgePassed: false });
}

export async function grade(input: { item: SqlItem; key: SqlKey; sql: string }, deps: Deps): Promise<GradeResult> {
  const { item, sql } = input;
  const display = await deps.runner.request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql, cap: DISPLAY_CAP, deadlineMs: item.rules.timeout_ms });
  if (!display.ok) return fromRunnerError(display.error, sql, deps, false);
  const r = await compare(input, deps, display.data);
  // S2-53: the learner's query ran, so a graded result carries its portability notes, on a pass and on a fail.
  return r.graded ? { ...r, portabilityNotes: await portabilityNotes(deps.runner, item.schema, sql, deps.schemaNotes ?? []) } : r;
}

/** Everything after the learner's query has run and been shown: the key's shape, the comparisons and the diagnosis. */
async function compare(input: { item: SqlItem; key: SqlKey; sql: string }, deps: Deps, shown: DisplayOk): Promise<GradeResult> {
  const { item, key, sql } = input;
  const deadlineMs = item.rules.timeout_ms;
  /** A runner failure after the learner's query has run, keeping what was shown and compared so far. */
  const stopped = (e: RunnerError, datasets: DatasetResult[] = []): GradeResult => ({ ...fromRunnerError(e, sql, deps, true), display: shown, datasets });
  const keyMeta = await deps.runner.request<GateOk>({ op: 'gate', schema: item.schema, allowedSchemas: [], sql: key.reference_sql });
  if (!keyMeta.ok) {
    if (keyMeta.error.kind === 'crash') return stopped(keyMeta.error);
    // A fault in the content, not the learner's: shown to the learner and logged as not graded
    // (outcome 'crash'), never a server error that loses the attempt. The runner's message could
    // quote the key, so none of it is kept.
    return result({ outcome: 'crash', graded: false, display: shown, notes: [`CHK-KEY-FAILED: ${KEY_FAILED}`], rejectMessage: KEY_FAILED });
  }
  const learnerCols = shown.columns;
  const keyCols = keyMeta.data.columns;
  const plans = buildPlans(learnerCols, keyCols, item.rules);

  if (!plans.ok) {
    const errorId = plans.reason === 'type_class' ? 'ERR-OUT-02' : extraColumnIsGroupingKey(sql, learnerCols, keyCols) ? 'ERR-LOG-07' : 'ERR-OUT-01';
    return result({
      display: shown,
      diagnosis: { errorId, source: 'shape', feedback: fill(deps.feedback, errorId, { expected_columns: keyCols.length, actual_columns: learnerCols.length }) },
      // Grain and Values on the columns that still map (design §5, sprint 2).
      partial: await shapePartial(deps, item, sql, key.reference_sql, learnerCols, keyCols, shown.rowCount),
    });
  }

  // G13: a pass on any one key (reference or alternative) under any one plan, on every dataset.
  const keys = [key.reference_sql, ...key.alternatives];
  let first: { plan: ComparePlan; results: [DatasetResult, DatasetResult] } | null = null;
  let wrongOrder: GradeResult | null = null;
  for (const plan of plans.plans) {
    for (let ki = 0; ki < keys.length; ki++) {
      const visible = await witness(deps, item.schema, sql, keys[ki]!, plan, deadlineMs);
      if (!visible.ok) return stopped(visible.error);
      if (!visible.data.passed && first) continue;                  // the edge run adds nothing here
      const edge = await witness(deps, item.edge_schema, sql, keys[ki]!, plan, deadlineMs);
      if (!edge.ok) return stopped(edge.error, [visible.data]);
      const results: [DatasetResult, DatasetResult] = [visible.data, edge.data];
      first ??= { plan, results };
      if (!visible.data.passed || !edge.data.passed) continue;
      if (item.rules.order_matters) {
        // composeOrderSql leaves NULL placement free (R33). The order is checked on both datasets,
        // since a tie-break may show only on the edge data. It does not depend on the key, so a
        // wrong order settles this plan; another plan may still map the sort keys differently.
        const sortKeys = item.rules.sort_keys.map((s) => ({ index: plan.learnerOrder[keyColumn(item, keyCols, s.column)]!, desc: s.desc }));
        const inOrder: boolean[] = [];
        for (const d of results) {
          const o = await deps.runner.request<RowsOk>({ op: 'one_row', schema: d.schema, sql: composeOrderSql(sql, learnerCols.length, sortKeys), deadlineMs });
          if (!o.ok) return stopped(o.error, results);
          inOrder.push(Number(o.data.rows[0]![0]) === 0);
        }
        const edgeInOrder = inOrder[1]!;
        if (!inOrder[0] || !edgeInOrder) {
          wrongOrder ??= result({ display: shown, datasets: results, keyIndexUsed: ki,
            diagnosis: { errorId: 'ERR-LOG-18', source: 'order', feedback: fill(deps.feedback, 'ERR-LOG-18', {}) },
            partial: partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: visible.data.matched, learnerRows: visible.data.learnerRows, keyRows: visible.data.keyRows, edgePassed: true, orderWrong: true }),
            edgeDescription: !edgeInOrder && deps.edge ? deps.edge.contains : null });
          break;
        }
      }
      return result({ outcome: 'pass', display: shown, datasets: results, keyIndexUsed: ki, notes: [item.why_this_works] });
    }
  }
  if (wrongOrder) return wrongOrder;

  // Fail: diagnose on the first failing dataset, with the first plan and the reference key. Its
  // counts drive the diagnosis, the diff and the partial score, never a later plan's (R33).
  const { plan, results } = first!;
  const [visible, edge] = results;
  const failing = visible.passed ? edge : visible;
  const mutant = await matchMutant(deps.runner, failing.schema, sql, learnerCols, key, item.rules, deadlineMs);
  const diffRows = await deps.runner.request<RowsOk>({ op: 'rows', schema: failing.schema, sql: composeDiffSql(sql, key.reference_sql, plan, DIFF_LIMIT), limit: DIFF_LIMIT * 2, deadlineMs });
  let diff: DiffSample | null = null;
  if (diffRows.ok) {
    // Values come normalised by the comparison (numbers as DOUBLE, dates as TIMESTAMP, the rest as text) and are shown as they are.
    const columns = keyCols.map((c) => c.name);
    const missing = diffRows.data.rows.filter((r) => r[0] === 'missing').map((r) => r.slice(1));
    const extra = diffRows.data.rows.filter((r) => r[0] === 'extra').map((r) => r.slice(1));
    const m0 = missing[0];
    const e0 = extra[0];
    const col = m0 && e0 ? m0.findIndex((v, i) => JSON.stringify(v) !== JSON.stringify(e0[i])) : -1;
    diff = { columns, missing, extra, firstDiff: col >= 0 ? { column: columns[col]!, expected: m0![col], actual: e0![col] } : null };
  }
  let keysUnique = true;
  if (item.rules.key_columns.length) {
    const idx = item.rules.key_columns.map((k) => plan.learnerOrder[keyColumn(item, keyCols, k)]!);
    const g = await deps.runner.request<RowsOk>({ op: 'one_row', schema: item.schema, sql: composeGrainSql(sql, learnerCols.length, idx), deadlineMs });
    keysUnique = g.ok && Number(g.data.rows[0]![0]) === Number(g.data.rows[0]![1]);
  }
  // E-055: on the dataset, plan and key the failure is diagnosed on. A cut column keeps the row count, so other
  // counts skip the check. It adds a check and a note. Design §6 step 7 diagnoses a planted query first, then error
  // signatures, then the fallback: with no planted match, the check is ERR-LOG-05's signature (E-146).
  const truncated = failing.learnerRows === failing.keyRows
    && await intTruncated(deps.runner, failing.schema, sql, key.reference_sql, plan, learnerCols, keyCols, deadlineMs);
  const [errorId, source]: [string, Diagnosis['source']] = mutant ? [mutant.errorId, 'mutant'] : truncated ? ['ERR-LOG-05', 'signature'] : ['ERR-LOG-00', 'fallback'];
  return result({
    display: shown, datasets: results, matchedMutantId: mutant?.id ?? null, diff, notes: truncated ? [INT_TRUNC_NOTE] : [],
    diagnosis: { errorId, source, feedback: fill(deps.feedback, errorId, { missing: failing.missing, extra: failing.extra }) },
    partial: partialScore({ shapeOk: true, rowsEqual: visible.learnerRows === visible.keyRows, keysUnique, matched: visible.matched, learnerRows: visible.learnerRows, keyRows: visible.keyRows, edgePassed: edge.passed }),
    edgeDescription: !edge.passed && deps.edge ? deps.edge.contains : null,
  });
}

/** "Show answer": one item's reference query and its result (a logged key case, design §3). */
export async function revealReference(item: SqlItem, key: SqlKey, runner: RunnerClient): Promise<{ sql: string; display: DisplayOk | null }> {
  const r = await runner.request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql: key.reference_sql, cap: DISPLAY_CAP, deadlineMs: item.rules.timeout_ms });
  return { sql: key.reference_sql, display: r.ok ? r.data : null };
}

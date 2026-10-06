// server/grader/int-trunc.ts: CHK-INT-TRUNC (ERRATA E-055 and E-146, design §6). After a failed comparison, a
// number column whose values are the key's cut to whole numbers points to integer division: // in DuckDB, / between
// two whole numbers elsewhere, or CAST, FLOOR or TRUNC. It adds a check and a note, never a pass.
import type { ColumnMeta, RowsOk } from '../runner/protocol.ts';
import type { RunnerClient } from '../runner/client.ts';
import { stripLeading, stripTrailing } from '../runner/tables.ts';
import type { ComparePlan, PlanColumn } from './plan.ts';
import { keyExpr, tolExpr } from './sql.ts';
import { typeClassOf } from './typeclass.ts';

/** Logged as a check (the server logs every note that starts with CHK-) and shown as a note. */
export const INT_TRUNC_NOTE = 'CHK-INT-TRUNC: Some of your numbers are whole numbers where the answer has decimals: '
  + 'they equal the expected values without their decimals. Integer division does this (// in DuckDB, and / '
  + 'between two whole numbers in PostgreSQL and SQL Server), and so do CAST(... AS INTEGER), FLOOR and TRUNC. '
  + 'Keep the decimals, for example with clicks * 1.0 / views.';

/** Whole-number types: cutting their values changes nothing, so they are never checked. */
const WHOLE = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)\b/i;

/**
 * E-055's three cuts, each on K's own type: trunc, floor, and CAST to a whole number, which rounds (a DOUBLE half
 * to even, a DECIMAL half away from zero). BIGINT rounds exactly as INTEGER does and holds larger values; a value no
 * whole number can hold (infinity, NaN) stays as it is, as trunc and floor leave it, instead of stopping the check.
 */
const CUTS: ((k: string) => string)[] = [
  (k) => `trunc(${k})`,
  (k) => `floor(${k})`,
  (k) => `CASE WHEN isfinite(${k}) THEN TRY_CAST(${k} AS BIGINT) ELSE ${k} END`,
];

const names = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const dbl = (e: string): string => `CAST(${e} AS DOUBLE)`;
/** Whether the learner value l is right for the key value k under the column's own comparison (G2, G3). */
const acceptable = (l: string, k: string, c: PlanColumn): string => (c.compare === 'exact' ? `(${l} IS NOT DISTINCT FROM ${k})` : tolExpr(l, k, c.compare));

/** The plan positions to check: the key column is a number type that can hold decimals, and the learner's is a number. */
export function intTruncColumns(plan: ComparePlan, learner: ColumnMeta[], key: ColumnMeta[]): number[] {
  return plan.columns.flatMap((_, i) => {
    const k = key[plan.keyOrder[i]!]!;
    const l = learner[plan.learnerOrder[i]!]!;
    return typeClassOf(k.type) === 'numeric' && typeClassOf(l.type) === 'numeric' && !WHOLE.test(k.type.trim()) ? [i] : [];
  });
}

/**
 * One statement that reads each side once. For each checked column and each cut, the column is flagged when the
 * learner's values, as a bag, equal the cut key values, and the cut fails the column's own comparison on at least
 * one row: a whole number within half a cent of a money value would pass, so it is no failure. Bags, not pairs,
 * because a cut column cannot pair with the key on its values.
 */
export function composeIntTruncSql(learnerSql: string, keySql: string, plan: ComparePlan, positions: number[]): string {
  const L = names('__al_l', plan.learnerColCount);
  const K = names('__al_k', plan.keyColCount);
  const lSel = positions.map((p) => `list_sort(list(${dbl(L[plan.learnerOrder[p]!]!)})) AS __al_v${p}`).join(', ');
  const kSel = positions.flatMap((p) => {
    const k = K[plan.keyOrder[p]!]!;
    const c = plan.columns[p]!;
    return CUTS.map((cut, j) => `list_sort(list(${dbl(cut(k))})) AS __al_t${p}_${j}, coalesce(bool_or(NOT ${acceptable(dbl(cut(k)), dbl(keyExpr(k, c)), c)}), FALSE) AS __al_f${p}_${j}`);
  }).join(', ');
  const any = positions.flatMap((p) => CUTS.map((_, j) => `(__al_f${p}_${j} AND __al_v${p} IS NOT DISTINCT FROM __al_t${p}_${j})`)).join(' OR ');
  return `WITH __al_l AS (SELECT ${lSel} FROM (
${stripLeading(stripTrailing(learnerSql))}
) AS __al_lr(${L.join(', ')})
), __al_k AS (SELECT ${kSel} FROM (
${stripLeading(stripTrailing(keySql))}
) AS __al_kr(${K.join(', ')}))
SELECT CAST(${any} AS INTEGER) AS __al_int_trunc FROM __al_l, __al_k`;
}

/**
 * True when a number column of the learner's result is the key's cut to whole numbers (E-055). The caller runs it on
 * the dataset and plan the failure is diagnosed on (R33). Nothing to check, or a runner failure, gives false: a check
 * after a fail degrades quietly (build record, Task 14).
 */
export async function intTruncated(runner: RunnerClient, schema: string, learnerSql: string, keySql: string, plan: ComparePlan,
  learner: ColumnMeta[], key: ColumnMeta[], deadlineMs: number): Promise<boolean> {
  const positions = intTruncColumns(plan, learner, key);
  if (!positions.length) return false;
  const r = await runner.request<RowsOk>({ op: 'one_row', schema, sql: composeIntTruncSql(learnerSql, keySql, plan, positions), deadlineMs });
  return r.ok && Number(r.data.rows[0]?.[0]) === 1;
}

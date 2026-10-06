// server/grader/sql.ts (design §6 step 4, §11 grading runs)
import type { ComparePlan, ColumnCompare, PlanColumn } from './plan.ts';
import { stripLeading, stripTrailing } from '../runner/tables.ts';

const names = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
/** A gated query as it goes inside (...): no semicolons, comments or whitespace at either end. */
const inner = (sql: string): string => stripLeading(stripTrailing(sql));
export type Tol = Exclude<ColumnCompare, 'exact'>;

/**
 * The key's side of one compared column, before norm casts it (G3, Task B9). A require_rounding column is
 * rounded in the key's own type, so a half-cent DECIMAL rounds half away from zero: cast to DOUBLE first,
 * 1.005 becomes 1.00499... and rounds down.
 */
export function keyExpr(col: string, c: PlanColumn): string {
  return typeof c.compare === 'object' && 'rounded' in c.compare ? `round(${col}, ${c.compare.rounded})` : col;
}

function norm(col: string, c: PlanColumn): string {
  switch (c.norm) {
    case 'numeric': return `CAST(${col} AS DOUBLE)`;
    case 'temporal': return `CAST(${col} AS TIMESTAMP)`;
    case 'boolean': return `CAST(${col} AS BOOLEAN)`;
    case 'other': return `CAST(${col} AS VARCHAR)`;
    case 'text': {
      // UUID and ENUM are text too. Left as they are, DuckDB casts the other side to their type,
      // and VARCHAR to UUID throws on any text that is not a UUID.
      let e = `CAST(${col} AS VARCHAR)`;
      if (c.trim) e = `trim(${e})`;
      if (c.lower) e = `lower(${e})`;
      return e;
    }
  }
}

/**
 * The G2 and G3 test for one pair. NULL, NaN and infinity compare with IS NOT DISTINCT FROM first.
 * The coalesce matters: with a NULL on one side only, the rest is NULL, and a NULL pair test would
 * count as neither matched nor mismatched. For G3, k is already round(K, n) (keyExpr).
 * G2's bound carries a floating-point allowance of 1e-15 times the larger value (Task B9): two
 * decimals exactly 0.005 apart are a little more than 0.005 apart as DOUBLEs (12.345 - 12.34 is
 * 0.005000000000000782), and "within half a cent" includes half a cent.
 */
export function tolExpr(l: string, k: string, cmp: Tol): string {
  const bound = 'rounded' in cmp ? '1e-9' : `greatest(${cmp.tol}, 1e-9 * abs(${k})) + 1e-15 * greatest(abs(${l}), abs(${k}))`;
  return `coalesce(${l} IS NOT DISTINCT FROM ${k} OR (isfinite(${l}) AND isfinite(${k}) AND abs(${l} - ${k}) <= ${bound}), FALSE)`;
}

function pairedCtes(learnerSql: string, keySql: string, p: ComparePlan): { sql: string; C: string[] } {
  const L = names('__al_l', p.learnerColCount);
  const K = names('__al_k', p.keyColCount);
  // One compared pair per plan column: every key column for a full plan, only the mapped ones for a partial plan.
  const C = names('__al_c', p.columns.length);
  const lSel = p.columns.map((c, i) => `${norm(L[p.learnerOrder[i]!]!, c)} AS ${C[i]}`).join(', ');
  const kSel = p.columns.map((c, i) => `${norm(keyExpr(K[p.keyOrder[i]!]!, c), c)} AS ${C[i]}`).join(', ');
  const exact = C.filter((_, i) => p.columns[i]!.compare === 'exact');
  const tol = C.flatMap((c, i) => { const cmp = p.columns[i]!.compare; return cmp === 'exact' ? [] : [{ c, cmp }]; });
  const over = [exact.length ? `PARTITION BY ${exact.join(', ')}` : '', tol.length ? `ORDER BY ${tol.map((t) => t.c).join(', ')}` : ''].join(' ');
  const on = [...exact.map((c) => `l.${c} IS NOT DISTINCT FROM k.${c}`), 'l.__al_rn = k.__al_rn'].join(' AND ');
  const okExpr = tol.length ? tol.map((t) => tolExpr(`l.${t.c}`, `k.${t.c}`, t.cmp)).join(' AND ') : 'TRUE';
  const pairCols = C.map((c) => `l.${c} AS l_${c}, k.${c} AS k_${c}`).join(', ');
  const sql = `WITH __al_l AS (
SELECT ${lSel} FROM (
${inner(learnerSql)}
) AS __al_lr(${L.join(', ')})
), __al_k AS (
SELECT ${kSel} FROM (
${inner(keySql)}
) AS __al_kr(${K.join(', ')})
), __al_lp AS (SELECT *, row_number() OVER (${over}) AS __al_rn FROM __al_l
), __al_kp AS (SELECT *, row_number() OVER (${over}) AS __al_rn FROM __al_k
), __al_j AS (SELECT l.__al_rn AS __al_lrn, k.__al_rn AS __al_krn, ${pairCols}, (${okExpr}) AS __al_ok
FROM __al_lp l FULL OUTER JOIN __al_kp k ON ${on})`;
  return { sql, C };
}

export function composeWitnessSql(learnerSql: string, keySql: string, p: ComparePlan): string {
  const { sql } = pairedCtes(learnerSql, keySql, p);
  return `${sql}
SELECT
  count(*) FILTER (WHERE __al_krn IS NULL)::BIGINT AS extra,
  count(*) FILTER (WHERE __al_lrn IS NULL)::BIGINT AS missing,
  count(*) FILTER (WHERE __al_lrn IS NOT NULL AND __al_krn IS NOT NULL AND NOT __al_ok)::BIGINT AS mismatched,
  count(*) FILTER (WHERE __al_lrn IS NOT NULL AND __al_krn IS NOT NULL AND __al_ok)::BIGINT AS matched,
  (SELECT count(*) FROM __al_l)::BIGINT AS learner_rows,
  (SELECT count(*) FROM __al_k)::BIGINT AS key_rows
FROM __al_j`;
}

export function composeDiffSql(learnerSql: string, keySql: string, p: ComparePlan, limit: number): string {
  const { sql, C } = pairedCtes(learnerSql, keySql, p);
  return `${sql}
(SELECT 'missing' AS __al_side, ${C.map((c) => `k_${c} AS ${c}`).join(', ')} FROM __al_j WHERE __al_krn IS NOT NULL AND (__al_lrn IS NULL OR NOT __al_ok) LIMIT ${limit})
UNION ALL
(SELECT 'extra' AS __al_side, ${C.map((c) => `l_${c} AS ${c}`).join(', ')} FROM __al_j WHERE __al_lrn IS NOT NULL AND (__al_krn IS NULL OR NOT __al_ok) LIMIT ${limit})`;
}

/**
 * Counts places where the learner's display order breaks the required sort keys (ties may come in
 * any order). NULL position is free unless the prompt states it (design §6), and SortKey has no
 * nulls field, so the count is taken with every key NULLS LAST and with every key NULLS FIRST,
 * and the smaller one is returned.
 */
export function composeOrderSql(learnerSql: string, learnerColCount: number, keys: { index: number; desc: boolean }[]): string {
  const L = names('__al_l', learnerColCount);
  const order = (nulls: 'LAST' | 'FIRST'): string => keys.map((k) => `${L[k.index]} ${k.desc ? 'DESC' : 'ASC'} NULLS ${nulls}`).join(', ');
  return `WITH __al_o AS (SELECT row_number() OVER () AS __al_ord, * FROM (
${inner(learnerSql)}
) AS __al_lr(${L.join(', ')})),
__al_r AS (SELECT __al_ord, rank() OVER (ORDER BY ${order('LAST')}) AS __al_rl, rank() OVER (ORDER BY ${order('FIRST')}) AS __al_rf FROM __al_o),
__al_v AS (SELECT __al_rl, lag(__al_rl) OVER (ORDER BY __al_ord) AS __al_pl, __al_rf, lag(__al_rf) OVER (ORDER BY __al_ord) AS __al_pf FROM __al_r)
SELECT least(count(*) FILTER (WHERE __al_pl > __al_rl), count(*) FILTER (WHERE __al_pf > __al_rf))::BIGINT AS violations FROM __al_v`;
}

export function composeGrainSql(learnerSql: string, learnerColCount: number, keyIndexes: number[]): string {
  const L = names('__al_l', learnerColCount);
  return `WITH __al_g AS (SELECT * FROM (
${inner(learnerSql)}
) AS __al_lr(${L.join(', ')}))
SELECT (SELECT count(*) FROM __al_g)::BIGINT AS n, (SELECT count(*) FROM (SELECT DISTINCT ${keyIndexes.map((i) => L[i]).join(', ')} FROM __al_g))::BIGINT AS distinct_n`;
}

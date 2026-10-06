// server/grader/plan.ts: column mapping and per-column comparison (design §6, G1-G4)
import type { ColumnMeta } from '../runner/protocol.ts';
import type { ColumnRule, GradingRules } from '../../schemas/item.ts';
import { typeClassOf } from './typeclass.ts';

export type ColumnCompare = 'exact' | { tol: number } | { rounded: number };
export interface PlanColumn { norm: 'text' | 'numeric' | 'temporal' | 'boolean' | 'other'; trim: boolean; lower: boolean; compare: ColumnCompare }
/**
 * Plan position i compares learner column learnerOrder[i] with key column keyOrder[i]. A full plan (buildPlans)
 * pairs every key column in key order, so keyOrder is 0..n-1; a partial plan (partialPlan, after a shape failure)
 * pairs only the key columns that map.
 */
export interface ComparePlan { learnerColCount: number; keyColCount: number; learnerOrder: number[]; keyOrder: number[]; columns: PlanColumn[] }
export type PlanResult = { ok: true; plans: ComparePlan[] } | { ok: false; reason: 'column_count' | 'type_class'; detail: string };

const MAX_PLANS = 6;
const WRONG_KIND = 'a column has the wrong kind of value';

/** TIME and TIME WITH TIME ZONE: not TIMESTAMP, which `\b` keeps out. */
const isTimeOnly = (type: string): boolean => /^TIME\b/i.test(type.trim());

function compatible(learner: ColumnMeta, key: ColumnMeta, rules: GradingRules): boolean {
  const l = typeClassOf(learner.type);
  const k = typeClassOf(key.type);
  if (k === 'temporal' && l === 'temporal') {
    if (rules.strict_temporal_type) return learner.type.toUpperCase() === key.type.toUpperCase();
    // Lenient across DATE and TIMESTAMP (G4). A time of day is a different kind of value, and
    // DuckDB cannot cast TIME to TIMESTAMP, so the comparison would fail to bind.
    return isTimeOnly(learner.type) === isTimeOnly(key.type);
  }
  if (isBooleanVsNumber(l, k)) return true;                     // boolean vs 0/1 (G4), either way round
  return l === k;
}

function isBooleanVsNumber(l: string, k: string): boolean {
  return (k === 'boolean' && l === 'numeric') || (k === 'numeric' && l === 'boolean');
}

function compareFor(rule: ColumnRule | undefined): ColumnCompare {
  if (!rule) return 'exact';
  if (rule.require_rounding !== undefined) return { rounded: rule.require_rounding };
  if (rule.precision === 'money') return { tol: 0.005 };
  if (rule.precision === 'ratio') return { tol: 1e-6 };
  return 'exact';
}

/** How one key column and the learner column a plan maps to it are normalised and compared. */
function planColumn(learner: ColumnMeta, key: ColumnMeta, rule: ColumnRule | undefined, rules: GradingRules): PlanColumn {
  const cls = typeClassOf(key.type);
  // Both sides as numbers (true = 1, false = 0), compared exactly whatever the precision rule:
  // CAST(2 AS BOOLEAN) is true, and a money key of 0.996 is within half a cent of true.
  if (isBooleanVsNumber(typeClassOf(learner.type), cls)) return { norm: 'numeric', trim: false, lower: false, compare: 'exact' };
  return {
    norm: cls === 'other' || isTimeOnly(key.type) ? 'other' : cls,   // TIME cannot be cast to TIMESTAMP
    trim: cls === 'text' && rules.trim_strings,
    lower: cls === 'text' && rules.case_insensitive,
    compare: cls === 'numeric' ? compareFor(rule) : 'exact',
  };
}

function* permutations(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i);
  const c = new Array<number>(n).fill(0);
  yield [...a];
  let i = 0;
  while (i < n) {
    if (c[i]! < i) {
      const j = i % 2 === 0 ? 0 : c[i]!;
      [a[j], a[i]] = [a[i]!, a[j]!];
      yield [...a];
      c[i]!++;
      i = 0;
    } else { c[i] = 0; i++; }
  }
}

export function buildPlans(learner: ColumnMeta[], key: ColumnMeta[], rules: GradingRules): PlanResult {
  // Columns are built per plan: a boolean against a number normalises differently from a boolean against a boolean.
  const mk = (order: number[]): ComparePlan => ({
    learnerColCount: learner.length, keyColCount: key.length, learnerOrder: order, keyOrder: key.map((_, ki) => ki),
    columns: order.map((li, ki) => planColumn(learner[li]!, key[ki]!, rules.columns[ki], rules)),
  });
  const fits = (order: number[]): boolean => order.every((li, ki) => compatible(learner[li]!, key[ki]!, rules));
  // A name match needs every key column name to appear exactly once among the learner's columns.
  const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  const byName = key.map((k) => {
    const hits = learner.flatMap((l, i) => (sameName(l.name, k.name) ? [i] : []));
    return hits.length === 1 ? hits[0]! : -1;
  });
  const namesMatch = byName.every((i) => i >= 0) && new Set(byName).size === byName.length;
  const extraAllowed = rules.allow_extra_columns && learner.length > key.length;

  const keyNames = key.map((k) => k.name).join(', ');

  // A count difference fails unless extra columns are allowed (G1), names checked or not.
  if (learner.length !== key.length && !extraAllowed) return { ok: false, reason: 'column_count', detail: `expected ${key.length} columns, got ${learner.length}` };
  // A full name match is the only plan tried (R34), so a permutation cannot rescue swapped labels.
  // With strict_column_order the names must also come in the key's order; extra columns may sit between.
  if (namesMatch) {
    if (rules.strict_column_order && byName.some((li, ki) => ki > 0 && li < byName[ki - 1]!)) {
      return { ok: false, reason: 'column_count', detail: `expected the columns in this order: ${keyNames}` };
    }
    return fits(byName) ? { ok: true, plans: [mk(byName)] } : { ok: false, reason: 'type_class', detail: WRONG_KIND };
  }
  if (rules.check_names || extraAllowed) return { ok: false, reason: 'column_count', detail: `expected columns ${keyNames}` };

  // Names match partly (the counts are equal here). A key column whose name matches exactly one
  // learner column, which no other key column claims, stays paired with it (A4): a column named
  // like one key column cannot be moved into another's place. Only the rest are permuted, the
  // remaining columns in their own order first (the identity order when nothing named has moved).
  // With strict_column_order only that first order is tried, and every named column must be in place.
  const fixed = byName.map((li) => (li >= 0 && byName.indexOf(li) === byName.lastIndexOf(li) ? li : -1));
  const freeKeys = key.flatMap((_, ki) => (fixed[ki]! < 0 ? [ki] : []));
  const freeLearners = learner.flatMap((_, li) => (fixed.includes(li) ? [] : [li]));
  const orderOf = (perm: number[]): number[] => {
    const order = [...fixed];
    freeKeys.forEach((ki, j) => { order[ki] = freeLearners[perm[j]!]!; });
    return order;
  };
  if (rules.strict_column_order) {
    const natural = orderOf(freeKeys.map((_, j) => j));
    if (natural.some((li, ki) => li !== ki)) return { ok: false, reason: 'column_count', detail: `expected the columns in this order: ${keyNames}` };
    return fits(natural) ? { ok: true, plans: [mk(natural)] } : { ok: false, reason: 'type_class', detail: WRONG_KIND };
  }
  const plans: ComparePlan[] = [];
  for (const perm of freeKeys.length <= 6 ? permutations(freeKeys.length) : [freeKeys.map((_, j) => j)]) {
    const order = orderOf(perm);
    if (!fits(order)) continue;
    plans.push(mk(order));
    if (plans.length >= MAX_PLANS) break;
  }
  return plans.length ? { ok: true, plans } : { ok: false, reason: 'type_class', detail: WRONG_KIND };
}

/**
 * After a shape failure (design §5 partial credit, sprint 2): each key column paired with the learner column of
 * the same name (case-insensitive, when exactly one learner column has it), or, when no learner column has its
 * name, with the learner column in the same position if no other key column took it. A pair counts only when the
 * kinds of value are compatible, as for a full plan. Key columns that do not pair, and learner columns left over,
 * are dropped. Null when no column pairs. The pairs are listed in key order.
 */
export function partialPlan(learner: ColumnMeta[], key: ColumnMeta[], rules: GradingRules): ComparePlan | null {
  const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  const hits = key.map((k) => learner.flatMap((l, i) => (sameName(l.name, k.name) ? [i] : [])));
  const pairs = new Map<number, number>();                  // key index -> learner index
  const taken = new Set<number>();
  key.forEach((k, ki) => {
    const li = hits[ki]!.length === 1 ? hits[ki]![0]! : -1;
    if (li >= 0 && !taken.has(li) && compatible(learner[li]!, k, rules)) { pairs.set(ki, li); taken.add(li); }
  });
  key.forEach((k, ki) => {
    if (hits[ki]!.length > 0 || ki >= learner.length || taken.has(ki)) return;
    if (compatible(learner[ki]!, k, rules)) { pairs.set(ki, ki); taken.add(ki); }
  });
  if (!pairs.size) return null;
  const keyOrder = [...pairs.keys()].sort((a, b) => a - b);
  const learnerOrder = keyOrder.map((ki) => pairs.get(ki)!);
  return {
    learnerColCount: learner.length, keyColCount: key.length, learnerOrder, keyOrder,
    columns: keyOrder.map((ki, j) => planColumn(learner[learnerOrder[j]!]!, key[ki]!, rules.columns[ki], rules)),
  };
}

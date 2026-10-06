// server/grader/diagnose.ts: what a failed submission is diagnosed as (design §6, pipeline step 7)
import type { ColumnMeta, GateOk, RowsOk } from '../runner/protocol.ts';
import type { RunnerClient } from '../runner/client.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { DEFAULT_RULES, type GradingRules } from '../../schemas/item.ts';
import type { Diagnosis } from './types.ts';
import { buildPlans } from './plan.ts';
import { composeWitnessSql } from './sql.ts';
import { maskSql } from '../runner/tables.ts';

export type Feedback = Record<string, { assumed: string; why: string; model: string }>;

/** The feedback text for an error ID, with its {placeholders} filled; ERR-LOG-00's text when the ID has none. */
export function fill(feedback: Feedback, errorId: string, vars: Record<string, string | number>): Diagnosis['feedback'] {
  const t = feedback[errorId] ?? feedback['ERR-LOG-00']!;
  const sub = (s: string) => s.replace(/\{([a-z_]+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  return { assumed: sub(t.assumed), why: sub(t.why), model: sub(t.model) };
}

/** An extra column that is also a grouping key means the wrong grain (ERR-LOG-07), not ERR-OUT-01 (design §6). */
export function extraColumnIsGroupingKey(sql: string, learner: ColumnMeta[], key: ColumnMeta[]): boolean {
  if (learner.length !== key.length + 1) return false;
  const keyNames = new Set(key.map((k) => k.name.toLowerCase()));
  const extra = learner.find((l) => !keyNames.has(l.name.toLowerCase()));
  if (!extra) return false;
  const groupBy = maskSql(sql).match(/group\s+by\s+([\s\S]+?)(?:\bhaving\b|\border\s+by\b|\blimit\b|\bqualify\b|;|$)/i)?.[1] ?? '';
  // A grouping item names the column directly, through a table alias, in double quotes, or by its position.
  const named = (item: string): string => {
    const position = /^\d+$/.test(item) ? learner[Number(item) - 1]?.name : undefined;
    return (position ?? item.replace(/^.*\./, '').replace(/^"(.*)"$/, '$1')).toLowerCase();
  };
  return groupBy.split(',').map((s) => named(s.trim())).includes(extra.name.toLowerCase());
}

/** The first planted wrong query whose result equals the learner's on this dataset. */
export async function matchMutant(runner: RunnerClient, schema: string, sql: string, learner: ColumnMeta[], key: SqlKey, rules: GradingRules, deadlineMs: number): Promise<{ id: string; errorId: string } | null> {
  for (const m of key.planted_wrong) {
    const g = await runner.request<GateOk>({ op: 'gate', schema, allowedSchemas: [], sql: m.sql });
    if (!g.ok || g.data.columns.length !== learner.length) continue;
    const mutantRules = learner.length === rules.columns.length ? { ...rules, check_names: false, allow_extra_columns: false } : { ...DEFAULT_RULES, columns: [] };
    const plans = buildPlans(learner, g.data.columns, mutantRules);
    if (!plans.ok) continue;
    const w = await runner.request<RowsOk>({ op: 'one_row', schema, sql: composeWitnessSql(sql, m.sql, plans.plans[0]!), deadlineMs });
    if (w.ok && w.data.rows[0]!.slice(0, 3).every((v) => Number(v) === 0)) return { id: m.id, errorId: m.error_id };
  }
  return null;
}

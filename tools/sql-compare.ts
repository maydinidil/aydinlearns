// tools/sql-compare.ts: the key-query helpers the content checks share (sprint 7d, Task Y2, S7D-08; backlog X5-M3). tools/check-content.ts
// and tools/rank-cutoffs.ts (C53) both import them from here, so neither copies them and neither imports the other. This file imports
// neither of them.
import { stripTrailing } from '../server/runner/tables.ts';
import { grade, type Feedback } from '../server/grader/grade.ts';
import type { GradeResult } from '../server/grader/types.ts';
import type { RunnerClient } from '../server/runner/client.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import type { EdgeDescription } from '../schemas/edge.ts';

/** What grading a key query needs of the checks' context (CheckContext in tools/check-content.ts satisfies it). */
export interface GradeContext { runner: RunnerClient; edge: (schema: string) => EdgeDescription | null; feedback: Feedback }

/** Every run of spaces and line breaks made one space, and the ends trimmed. */
export const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Key text compared as one query: a trailing semicolon dropped and every run of spaces and line breaks made one space. */
export const sameQuery = (a: string, b: string): boolean => squash(stripTrailing(a)) === squash(stripTrailing(b));

/** The grader's verdict, or null when it throws: it does so only for a key that does not run or rules naming a column the key lacks. */
export async function tryGrade(item: SqlItem, key: SqlKey, sql: string, ctx: GradeContext): Promise<GradeResult | null> {
  try { return await grade({ item, key, sql }, { runner: ctx.runner, edge: ctx.edge(item.edge_schema), feedback: ctx.feedback }); } catch { return null; }
}

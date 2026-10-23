// tools/rank-cutoffs.ts: C53, the tie rule of a rank cutoff (sprint 7, Task A1: S7-22, E-204; Task A2b: the keep-one dedup, S7-C06).
// Sprint 7c (Task X5, S7C-09) moved it here from tools/check-content.ts, which still runs it as C53 on every write and fix item
// (checkItem). Like every check, its details name the key query, the function, a column and the edge schema, never SQL (non-negotiable 2).
import { maskSql, stripTrailing } from '../server/runner/tables.ts';
import { grade, type Feedback } from '../server/grader/grade.ts';
import type { GradeResult } from '../server/grader/types.ts';
import type { RunnerClient } from '../server/runner/client.ts';
import type { ParseTreeOk } from '../server/runner/protocol.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import type { EdgeDescription } from '../schemas/edge.ts';

/** What C53 needs of the checks' context (CheckContext in tools/check-content.ts, which satisfies it). */
export interface RankCutoffContext { runner: RunnerClient; edge: (schema: string) => EdgeDescription | null; feedback: Feedback }

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** One key query written twice, as the other way repeats an alternative (C39): the same text but for white space and a trailing semicolon. */
const sameQuery = (a: string, b: string): boolean => squash(stripTrailing(a)) === squash(stripTrailing(b));
/** The grader's verdict, or null when it throws, as tools/check-content.ts grades every key query. */
async function tryGrade(item: SqlItem, key: SqlKey, sql: string, ctx: RankCutoffContext): Promise<GradeResult | null> {
  try { return await grade({ item, key, sql }, { runner: ctx.runner, edge: ctx.edge(item.edge_schema), feedback: ctx.feedback }); } catch { return null; }
}

export type RankingFn = 'ROW_NUMBER' | 'RANK' | 'DENSE_RANK' | 'NTILE';
/** The ranking functions S7-22 names, by their window type in json_serialize_sql's tree. */
const RANKING_TYPES: Readonly<Record<string, RankingFn>> = { WINDOW_ROW_NUMBER: 'ROW_NUMBER', WINDOW_RANK: 'RANK', WINDOW_RANK_DENSE: 'DENSE_RANK', WINDOW_NTILE: 'NTILE' };
/** A cheap look at the text first: a key with no ranking call has no ranking result to filter, and needs no parse tree. */
const RANKING_CALL = /\b(?:row_number|rank|dense_rank|ntile)"?\s*\(/i;

/** One ranking window whose result a filter compares (C53). */
export interface RankCutoff {
  fn: RankingFn;
  /**
   * ROW_NUMBER and NTILE: the plain column, lower case, that ends the window's sort order after at least one other key; else null
   * (RANK and DENSE_RANK have no tie-break, and a window whose sort order is a single key has none either).
   */
  tieBreak: string | null;
  /**
   * The query with the other tie rule: ROW_NUMBER becomes RANK without its tie-break (ties share a place), RANK and DENSE_RANK
   * become ROW_NUMBER (one row a place), and NTILE keeps its tie-break in the other direction. Null when it cannot be written: no
   * tie-break, or the window cannot be found in the text.
   */
  otherRule: string | null;
  /**
   * Every comparison that filters the result keeps place 1 alone: `= 1`, `< 2` or `<= 1`, with the result on either side (S7-C06).
   * False when a filter reaches the result through a SELECT-list flag (S7C-09): only a direct comparison is read as keep-one.
   */
  firstPlaceOnly: boolean;
  /** The plain column, lower case, when it is the window's whole sort order (a single key); else null (S7-C06). */
  soleKey: string | null;
  /** S7C-09: the sole key's direction, ASC when the window writes none (DuckDB's default order); null when there is no sole key. */
  soleDirection: 'ASC' | 'DESC' | null;
}

type TreeObj = Record<string, unknown>;
const isTreeObj = (x: unknown): x is TreeObj => typeof x === 'object' && x !== null && !Array.isArray(x);
const treeList = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/** Visits every object in a parse-tree value depth first, with an explicit stack; `enter` returns false to skip an object's children. */
function walkTree(value: unknown, enter: (o: TreeObj) => boolean): void {
  const stack: unknown[] = [value];
  while (stack.length) {
    const x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    if (!Array.isArray(x) && !enter(x as TreeObj)) continue;
    const children = Array.isArray(x) ? x : Object.values(x);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

const rankingFn = (o: TreeObj): RankingFn | null => (o.class === 'WINDOW' ? RANKING_TYPES[String(o.type)] ?? null : null);
/** A column reference's last name part, lower case: `t.rn` is `rn`. */
const refName = (o: TreeObj): string => String(treeList(o.column_names).at(-1) ?? '').toLowerCase();

/** The operands a comparison, a BETWEEN or an IN list compares; none for anything else. */
function comparedOperands(o: TreeObj): unknown[] {
  if (o.class === 'COMPARISON') return [o.left, o.right];
  if (o.class === 'BETWEEN') return [o.input, o.lower, o.upper];
  if (o.class === 'OPERATOR' && (o.type === 'COMPARE_IN' || o.type === 'COMPARE_NOT_IN')) return treeList(o.children);
  return [];
}

/** ROW_NUMBER's and NTILE's tie-break (RankCutoff.tieBreak). */
function tieBreakOf(w: TreeObj): string | null {
  const fn = rankingFn(w);
  const orders = treeList(w.orders).filter(isTreeObj);
  const last = orders.at(-1)?.expression;
  if ((fn !== 'ROW_NUMBER' && fn !== 'NTILE') || orders.length < 2 || !isTreeObj(last) || last.class !== 'COLUMN_REF') return null;
  return refName(last) || null;
}

/** A window's single sort key, when it is a plain column (RankCutoff.soleKey). */
function soleKeyOf(w: TreeObj): string | null {
  const orders = treeList(w.orders).filter(isTreeObj);
  const only = orders[0]?.expression;
  return orders.length === 1 && isTreeObj(only) && only.class === 'COLUMN_REF' ? refName(only) || null : null;
}

/** S7C-09: the direction of a window's single sort key (RankCutoff.soleDirection): DESCENDING is DESC, ASCENDING and no word are ASC. */
function soleDirectionOf(w: TreeObj): 'ASC' | 'DESC' | null {
  if (soleKeyOf(w) === null) return null;
  return treeList(w.orders).filter(isTreeObj)[0]!.type === 'DESCENDING' ? 'DESC' : 'ASC';
}

/** A comparison's type with its two sides swapped: `2 > rn` reads as `rn < 2`. Equality reads the same both ways. */
const SWAPPED: Readonly<Record<string, string>> = { COMPARE_LESSTHAN: 'COMPARE_GREATERTHAN', COMPARE_GREATERTHAN: 'COMPARE_LESSTHAN',
  COMPARE_LESSTHANOREQUALTO: 'COMPARE_GREATERTHANOREQUALTO', COMPARE_GREATERTHANOREQUALTO: 'COMPARE_LESSTHANOREQUALTO' };
/** S7-C06: the whole-number bound that keeps place 1 alone, by comparison type with the ranking result on the left: `= 1`, `< 2`, `<= 1`. */
const FIRST_PLACE_BOUND: Readonly<Record<string, number>> = { COMPARE_EQUAL: 1, COMPARE_LESSTHAN: 2, COMPARE_LESSTHANOREQUALTO: 1 };

/** Whether filter `o`, which compares the ranking result `x`, keeps place 1 alone (RankCutoff.firstPlaceOnly). */
function keepsFirstPlace(o: TreeObj, x: TreeObj): boolean {
  if (o.class !== 'COMPARISON') return false;
  const onLeft = o.left === x;
  const type = onLeft ? String(o.type) : SWAPPED[String(o.type)] ?? String(o.type);
  const other = onLeft ? o.right : o.left;
  const v = isTreeObj(other) && other.class === 'CONSTANT' && isTreeObj(other.value) ? other.value : null;
  return v !== null && isTreeObj(v.type) && v.type.id === 'INTEGER' && v.is_null === false && v.value === FIRST_PLACE_BOUND[type];
}

/** A parse-tree location, a byte offset into the UTF-8 text, as a character index into `sql`; -1 when there is none. */
function charIndex(sql: string, location: unknown): number {
  if (typeof location !== 'number' || !Number.isSafeInteger(location) || location < 0) return -1;
  const bytes = Buffer.from(sql, 'utf8');
  return location > bytes.length ? -1 : bytes.subarray(0, location).toString('utf8').length;
}

/**
 * The sort term around character `at` in a window's ORDER BY: its [from, to) span between the commas (or the ORDER BY, the frame or the
 * closing bracket that end the list), and whether it is the list's first term. The window spec is the innermost bracket around `at`
 * with an ORDER BY of its own before `at`, so a named window (`WINDOW w AS (...)`) is found as an inline one is. `bare` is the text
 * with strings, comments and quoted names blanked. Null when there is no such bracket.
 */
function sortTermAt(bare: string, at: number): { from: number; to: number; first: boolean } | null {
  if (at < 0) return null;
  const open: number[] = [];
  for (let i = 0; i < at; i++) {
    if (bare[i] === '(') open.push(i);
    else if (bare[i] === ')') open.pop();
  }
  for (let k = open.length - 1; k >= 0; k--) {
    let orderBy = -1;
    let end = -1;
    const commas: number[] = [];
    for (let i = open[k]! + 1, depth = 0; i < bare.length && end < 0; i++) {
      const ch = bare[i]!;
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) end = i; else depth--; }
      else if (depth > 0) continue;
      else if (ch === ',') commas.push(i);
      else if (/[a-z]/i.test(ch) && !/[\w$]/.test(bare[i - 1] ?? ' ')) {
        const word = /^(?:order\s+by|rows|range|groups)\b/i.exec(bare.slice(i))?.[0];
        if (!word) continue;
        if (/^order/i.test(word)) { if (i < at) orderBy = i + word.length; }
        else if (orderBy >= 0 && i > at) end = i;            // the frame ends the sort order
        i += word.length - 1;
      }
    }
    if (orderBy < 0 || end < at) continue;
    const cuts = commas.filter((c) => c > orderBy && c < end);
    const before = cuts.filter((c) => c < at);
    const after = cuts.find((c) => c >= at);
    return { from: before.length ? before.at(-1)! + 1 : orderBy, to: after ?? end, first: before.length === 0 };
  }
  return null;
}

/** RankCutoff.otherRule for window `w` of `sql`; `bare` is `sql` with strings, comments and quoted names blanked. */
function otherRuleSql(sql: string, bare: string, w: TreeObj): string | null {
  const fn = rankingFn(w);
  const at = charIndex(sql, w.query_location);
  if (!fn || at < 0 || /^[a-z_]+/i.exec(bare.slice(at))?.[0].toLowerCase() !== fn.toLowerCase()) return null;
  const edits: { from: number; to: number; text: string }[] = [];
  if (fn !== 'NTILE') edits.push({ from: at, to: at + fn.length, text: fn === 'ROW_NUMBER' ? 'rank' : 'row_number' });
  if (fn === 'ROW_NUMBER' || fn === 'NTILE') {
    const last = treeList(w.orders).filter(isTreeObj).at(-1)?.expression;
    const term = tieBreakOf(w) !== null && isTreeObj(last) ? sortTermAt(bare, charIndex(sql, last.query_location)) : null;
    if (!term || term.first) return null;
    const text = bare.slice(term.from, term.to);
    if (fn === 'ROW_NUMBER') {
      // The comma before the tie-break, and the tie-break with its direction; what follows it (a space, the frame) stays.
      edits.push({ from: term.from - 1, to: term.to - /\s*$/.exec(text)![0].length, text: '' });
    } else {
      const m = /^(\s*)([\s\S]*?)(?:\s+(?:asc|desc))?(?:\s+nulls\s+(?:first|last))?\s*$/i.exec(text)!;
      const exprTo = term.from + m[1]!.length + m[2]!.length;
      const dir = /\b(?:asc|desc)\b/i.exec(bare.slice(exprTo, term.to));
      edits.push(dir ? { from: exprTo + dir.index, to: exprTo + dir.index + dir[0].length, text: dir[0].toLowerCase() === 'asc' ? 'DESC' : 'ASC' }
        : { from: exprTo, to: exprTo, text: ' DESC' });
    }
  }
  return edits.sort((a, b) => b.from - a.from).reduce((s, e) => s.slice(0, e.from) + e.text + s.slice(e.to), sql);
}

/**
 * S7C-09: the SELECT nodes that give a query its columns, in order: the query itself, or each SELECT of a UNION, INTERSECT or EXCEPT,
 * whose columns take the same places. A CTE's or a subquery's column list renames them by place.
 */
function selectsOf(node: unknown): TreeObj[] {
  if (!isTreeObj(node)) return [];
  if (node.type === 'SELECT_NODE') return [node];
  if (node.type === 'SET_OPERATION_NODE') return [node.left, node.right, ...treeList(node.children)].flatMap(selectsOf);
  return [];
}

/**
 * S7C-09: the ranking windows a SELECT-list flag compares: the item is a comparison (`=`, `<`, `<=`, `>`, `>=`, `<>`, BETWEEN or IN) of a
 * ranking result, written there or named by an alias in `byAlias`, alone or joined to others with AND or OR. Anything else (a CASE,
 * arithmetic on the result, a call around it) compares nothing C53 reads.
 */
function flagWindows(e: TreeObj, byAlias: ReadonlyMap<string, TreeObj[]>): TreeObj[] {
  if (e.class === 'CONJUNCTION') return treeList(e.children).filter(isTreeObj).flatMap((c) => flagWindows(c, byAlias));
  return comparedOperands(e).filter(isTreeObj).flatMap((x) => (rankingFn(x) ? [x] : x.class === 'COLUMN_REF' ? byAlias.get(refName(x)) ?? [] : []));
}

/**
 * C53's reading of one key query (S7-22): each ranking window (ROW_NUMBER, RANK, DENSE_RANK, NTILE) whose result a filter compares,
 * in a WHERE, HAVING, QUALIFY or JOIN condition, or in an aggregate's or a window aggregate's FILTER clause (S7C-09), with `=`, `<`,
 * `<=`, `>`, `>=`, `<>`, BETWEEN or IN. The result is compared directly (`QUALIFY rank() OVER (...) <= 3`) or through a name the
 * statement gives it: its alias in any SELECT list (an outer query reading a subquery or a CTE, or QUALIFY in the same query), or its
 * name in a CTE's or a subquery's column list, by place (S7C-09; after a star in that SELECT list the places are not known, so the list
 * is not followed there). S7C-09: a SELECT-list flag, an item that compares a ranking result (flagWindows) under a name, is a cutoff
 * when a filter names it (`WHERE top`, `WHERE NOT top`, `WHERE top AND ...`); otherwise a ranking result compared in a SELECT list is
 * shown, not filtered. Two shapes stay unread, stated limits: arithmetic on the result before the comparison (`WHERE rn - 1 < 2`), and
 * a label made from it, such as a CASE, filtered outside (`WHERE label = 'top'`). `tree` is json_serialize_sql's reply for `sql`.
 */
export function rankCutoffs(tree: unknown, sql: string): RankCutoff[] {
  const byAlias = new Map<string, TreeObj[]>();
  /** Every other named SELECT-list item: a flag when it compares a ranking result (resolved below, once every alias is known). */
  const items: [string, TreeObj][] = [];
  const filters: unknown[] = [];
  const name = (alias: unknown, e: TreeObj): void => {
    if (typeof alias !== 'string' || alias === '') return;
    if (rankingFn(e)) byAlias.set(alias.toLowerCase(), [...(byAlias.get(alias.toLowerCase()) ?? []), e]);
    else items.push([alias.toLowerCase(), e]);
  };
  /** S7C-09: a CTE's or a subquery's column list names the columns of its query by place, up to the first star. */
  const columnList = (aliases: unknown, query: unknown): void => {
    const names = treeList(aliases);
    for (const s of selectsOf(query)) {
      for (const [i, e] of treeList(s.select_list).entries()) {
        if (i >= names.length || !isTreeObj(e) || e.class === 'STAR') break;
        name(names[i], e);
      }
    }
  };
  walkTree(tree, (o) => {
    if (Array.isArray(o.select_list)) {
      for (const e of o.select_list) if (isTreeObj(e)) name(e.alias, e);
      filters.push(o.where_clause, o.having, o.qualify);
    }
    if (o.type === 'JOIN') filters.push(o.condition);
    if (isTreeObj(o.cte_map)) for (const m of treeList(o.cte_map.map)) if (isTreeObj(m) && isTreeObj(m.value)) columnList(m.value.aliases, (m.value.query as TreeObj | undefined)?.node);
    if (o.type === 'SUBQUERY' && isTreeObj(o.subquery)) columnList(o.column_name_alias, o.subquery.node);
    if (o.class === 'FUNCTION') filters.push(o.filter);                  // S7C-09: count(*) FILTER (WHERE rn <= 3)
    if (o.class === 'WINDOW') filters.push(o.filter_expr);               // and a window aggregate's
    return true;
  });
  const flags = new Map<string, TreeObj[]>();
  for (const [n, e] of items) {
    const ws = flagWindows(e, byAlias);
    if (ws.length) flags.set(n, [...(flags.get(n) ?? []), ...ws]);
  }
  const windows: TreeObj[] = [];
  const firstOnly = new Map<TreeObj, boolean>();
  const found = (w: TreeObj, first: boolean): void => {
    if (!windows.includes(w)) windows.push(w);
    firstOnly.set(w, (firstOnly.get(w) ?? true) && first);
  };
  for (const f of filters) {
    walkTree(f, (o) => {
      if (isTreeObj(o.node) && String(o.node.type).endsWith('_NODE')) return false;   // a nested query: its own filters are read above
      for (const x of comparedOperands(o)) {
        if (!isTreeObj(x)) continue;
        const first = keepsFirstPlace(o, x);
        if (rankingFn(x)) found(x, first);
        else if (x.class === 'COLUMN_REF') for (const w of byAlias.get(refName(x)) ?? []) found(w, first);
      }
      // S7C-09: a flag the filter names; through a flag no filter counts as keeping place 1 alone.
      if (o.class === 'COLUMN_REF') for (const w of flags.get(refName(o)) ?? []) found(w, false);
      return true;
    });
  }
  const bare = maskSql(sql).replace(/"(?:[^"]|"")*"/g, (m) => 'x'.repeat(m.length));
  return windows.map((w) => ({ fn: rankingFn(w)!, tieBreak: tieBreakOf(w), otherRule: otherRuleSql(sql, bare, w),
    firstPlaceOnly: firstOnly.get(w) === true, soleKey: soleKeyOf(w), soleDirection: soleDirectionOf(w) }));
}

/** Words that make a sentence of the prompt one about ties. */
const TIE_WORD = /\b(?:ties?|tied|tying|tie-?break(?:s|er|ers)?)\b/i;
/** Words that make a sentence of the prompt one about which copy a keep-one dedup keeps (S7-C06). */
const KEEP_WORD = /\b(?:keep|keeps|kept)\b/i;
const promptSentences = (prompt: string): string[] => prompt.split(/(?<=[.?!])\s+/);
const tieSentences = (prompt: string): string[] => promptSentences(prompt).filter((s) => TIE_WORD.test(s));

/** `column` as a whole name, as written or with spaces for its underscores, in any case; null for an empty name. */
function columnName(column: string): RegExp | null {
  const words = column.split('_').filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return words.length ? new RegExp(`(?<![\\w$])${words.join('[_ ]')}(?![\\w$])`, 'i') : null;
}

/** S7-22: the prompt names `column` as the tie-break: a sentence about ties names it, as written or with spaces for its underscores. */
export function namesTieBreak(prompt: string, column: string): boolean {
  const name = columnName(column);
  return name !== null && tieSentences(prompt).some((s) => name.test(s));
}

/** S7-C06: the sentences of the prompt with keep, kept or keeps that name `column`, as namesTieBreak names it. */
function keepSentences(prompt: string, column: string): string[] {
  const name = columnName(column);
  return name === null ? [] : promptSentences(prompt).filter((s) => KEEP_WORD.test(s) && name.test(s));
}

/** S7-C06: the prompt says which copy a keep-one dedup keeps: a sentence with keep, kept or keeps names `column`, as namesTieBreak does. */
export function namesKeptCopy(prompt: string, column: string): boolean {
  return keepSentences(prompt, column).length > 0;
}

/**
 * S7C-09: which copy the prompt keeps by `column`: 'lowest' or 'highest', the one of the two words its keep sentences (namesKeptCopy)
 * say; null when they say neither, or both.
 */
export function keptCopyWord(prompt: string, column: string): 'lowest' | 'highest' | null {
  const said = new Set(keepSentences(prompt, column).flatMap((s) => [...s.matchAll(/\b(lowest|highest)\b/gi)].map((m) => m[1]!.toLowerCase())));
  return said.size === 1 ? [...said][0] as 'lowest' | 'highest' : null;
}

/** S7C-09: an ID column, the only kind a keep-one dedup may sort its copies by: `id`, or a name that ends in `_id`. */
export const isIdColumn = (column: string): boolean => /^(?:id|\w+_id)$/i.test(column);

/** S7-22: the prompt says that ties share a place: a sentence about ties says they share it, or the same place, rank or position. */
export function saysTiesShare(prompt: string): boolean {
  return tieSentences(prompt).some((s) => /\bshar(?:e|es|ing)\b|\bsame\s+(?:place|rank|position)\b/i.test(s));
}

/**
 * C53 (S7-22, E-204, Review Focus 7): every complete key query (the reference, the alternatives and the other way) that filters a
 * ranking function's result (rankCutoffs) states its tie rule. With ROW_NUMBER (and NTILE, which splits ties as ROW_NUMBER does,
 * E-007), the window's sort order ends in a tie-break column the prompt names in a sentence about ties. With RANK or DENSE_RANK, the
 * prompt says that ties share a place. Then the query with the other tie rule (RankCutoff.otherRule), graded against the reference,
 * must fail on the item's edge schema: a tie there at the cutoff is what tells the two rules apart. Details name the key query, the
 * function, the tie-break column and the edge schema, never SQL.
 *
 * S7-C06 (FIND-01-13), narrowed by S7C-09: a keep-one dedup, a ROW_NUMBER filtered to place 1 alone (RankCutoff.firstPlaceOnly) in an
 * item with `uses_raw` true, whose sort order is a single ID column (isIdColumn), instead needs a sentence of the prompt with keep, kept
 * or keeps that names that column and says lowest or highest (keptCopyWord), and the window sorts that way: lowest ascending, highest
 * descending (RankCutoff.soleDirection). Its other tie rule is not graded: the resent copies are one fact with a new ID (Q-01-01), so
 * which copy is kept changes no count or total. Every other cutoff, a single sort key that is not an ID included, keeps the rules above.
 *
 * What C53 does not read (rankCutoffs): arithmetic on a ranking result before the comparison, and a label made from it, such as a CASE,
 * filtered outside. A key in either shape passes C53 with no stated tie rule, so the generator brief asks for neither, and the blind
 * solver and the review read its prompt.
 */
export async function rankCutoffProblems(item: SqlItem, key: SqlKey, ctx: RankCutoffContext): Promise<string[]> {
  const named: [string, unknown][] = [['the reference', key.reference_sql], ...treeList(key.alternatives).map((s, i): [string, unknown] => [`alternative ${i + 1}`, s]),
    ['the other way', key.other_way?.sql]];
  const usesRaw = (item as { uses_raw?: unknown }).uses_raw === true;
  const problems: string[] = [];
  const read: string[] = [];
  for (const [label, sql] of named) {
    // The other way repeats an alternative (C39): each query is read once, under its first name.
    if (typeof sql !== 'string' || read.some((s) => sameQuery(s, sql))) continue;
    read.push(sql);
    if (!RANKING_CALL.test(maskSql(sql))) continue;
    const t = await ctx.runner.request<ParseTreeOk>({ op: 'parse_tree', schema: item.schema, allowedSchemas: [], sql });
    if (!t.ok || t.data.tree === null) { problems.push(`${label} could not be read (see C03 and C04)`); continue; }
    for (const cut of rankCutoffs(t.data.tree, sql)) {
      if (usesRaw && cut.fn === 'ROW_NUMBER' && cut.firstPlaceOnly && cut.soleKey !== null && isIdColumn(cut.soleKey)) {
        const said = keptCopyWord(item.prompt, cut.soleKey);
        const sorted = cut.soleDirection === 'DESC' ? 'highest' : 'lowest';
        if (said === null) {
          problems.push(`${label} keeps one copy with ROW_NUMBER (a keep-one dedup on raw data), but the prompt does not say which copy is kept: a sentence of the prompt with keep, kept or keeps must name ${cut.soleKey} and say lowest or highest (S7-C06)`);
        } else if (said !== sorted) {
          problems.push(`${label} keeps the copy with the ${sorted} ${cut.soleKey}, but the prompt keeps the one with the ${said} (S7-C06)`);
        }
        continue;
      }
      const keeps = `${label} keeps ${cut.fn}'s result by a comparison`;
      if (cut.fn === 'ROW_NUMBER' || cut.fn === 'NTILE') {
        if (cut.tieBreak === null) { problems.push(`${keeps}, but no tie-break ends its window's sort order (S7-22)`); continue; }
        if (!namesTieBreak(item.prompt, cut.tieBreak)) { problems.push(`${keeps}, but no tie-break is stated: no sentence of the prompt about ties names ${cut.tieBreak} (S7-22)`); continue; }
      } else if (!saysTiesShare(item.prompt)) { problems.push(`${keeps}, but the prompt does not say that ties share a place (S7-22)`); continue; }
      const whose = `${label}'s ${cut.fn} cutoff`;
      if (cut.otherRule === null) { problems.push(`with the other tie rule, ${whose} could not be written, so the tie at the cutoff cannot be tested`); continue; }
      const g = await tryGrade(item, { ...key, alternatives: [] }, cut.otherRule, ctx);
      if (g?.outcome === 'pass') problems.push(`with the other tie rule, ${whose} still passes: ${item.edge_schema} holds no tie at the cutoff`);
      else if (!g || g.datasets.length < 2) problems.push(`with the other tie rule, ${whose} could not be graded`);
      else if (g.datasets[1]!.passed) problems.push(`with the other tie rule, ${whose} gives the same rows on ${item.edge_schema}: it holds no tie at the cutoff`);
    }
  }
  return problems;
}


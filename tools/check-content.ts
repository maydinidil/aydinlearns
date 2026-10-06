// tools/check-content.ts: the content checks (design §12) that gate every SQL item before a learner
// sees it. They run through the app's own grader and runner. Results name item IDs, check IDs and
// reasons only, never SQL (non-negotiable 2): a runner, grader or parser message can quote a query,
// so none is ever copied into a detail or printed. After the SQL checks (C01 to C19 and C29), the CLI runs
// the GA4 and Methodology checks, C20 to C28, from tools/check-choice.ts (Task C3); C30, the readings, is here.
// SQL choice items (S3-13, Task C4) take C01, C14 and C31 to C35 from tools/check-sql-choice.ts instead of the
// write and fix checks, and a lesson's why_clause takes C36 and C37 from there.
// Usage: node tools/check-content.ts [content-root]   (default: content/)
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRunner, type RunnerClient } from '../server/runner/client.ts';
import type { DisplayOk, GateOk, RowsOk } from '../server/runner/protocol.ts';
import { maskSql, stripTrailing } from '../server/runner/tables.ts';
import { grade, type Feedback } from '../server/grader/grade.ts';
import type { GradeResult } from '../server/grader/types.ts';
import { loadContent, type ContentStore } from '../server/content.ts';
import { isSqlChoiceKind, validateSqlItem, type SqlItem } from '../schemas/item.ts';
import { validateSqlKey, type SqlKey } from '../schemas/keys.ts';
import { validateLesson, type Lesson } from '../schemas/lesson.ts';
import { validateCaseRecord } from '../schemas/case.ts';
import type { Curriculum } from '../schemas/concepts.ts';
import type { EdgeDescription } from '../schemas/edge.ts';
import { detectConstructs, helperCalls } from './constructs.ts';
import { checkChoice, tallyLine } from './check-choice.ts';
import { checkSqlChoiceItem, checkWhyClause, outermost, sqlChoiceTallyLine } from './check-sql-choice.ts';

export interface CheckResult { id: string; check: string; ok: boolean; warn?: boolean; detail: string }   // detail never contains SQL
export interface CheckContext {
  runner: RunnerClient; curriculum: Curriculum; feedback: Feedback; edge: (schema: string) => EdgeDescription | null;
  datasetVersion: string; constructs: { construct: string; concept_id: string }[]; helpers: string[];
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const DISPLAY_CAP = 1000;
/** The helpers each helper construct allows when the prompt names them (T-01; ruling R19). */
const HELPER_CONSTRUCTS: Record<string, string[]> = { cast_round: ['ROUND', 'CAST'], coalesce: ['COALESCE'], text_helper: ['LOWER', 'UPPER', 'TRIM'] };
const CLOCK_OR_RANDOM = /\b(current_date|current_timestamp|current_time|localtimestamp|localtime)\b|\b(now|today|random|gen_random_uuid|uuid|get_current_timestamp|get_current_time|transaction_timestamp)\s*\(/i;
const DUCKDB_ONLY: [string, RegExp][] = [
  ['QUALIFY', /\bqualify\b/i], ['ASOF', /\basof\b/i], ['PIVOT', /\b(un)?pivot\b/i], ['GROUP BY ALL', /\bgroup\s+by\s+all\b/i], ['FROM-first', /^\s*from\b/i],
];
/** Where a faded shape may stop: just before a clause starts (a join type counts as the start of its JOIN). */
const CLAUSE_START = /^(select|from|join|left|right|inner|full|cross|on|where|group|having|order|limit)\b/;

/** A prompt names a helper when it writes the function's name in capitals as a word: "with ROUND(x, 2)", not "around". */
const namesHelper = (prompt: string, helper: string): boolean => new RegExp(`\\b${helper}\\b`).test(prompt);

/**
 * What the blind solver saw (R37): the prompt, the contract, the rules and the schema, plus a fix
 * item's starter query. starter_sql joins the hash only when there is one, so the records of items
 * without it stay valid.
 */
export function promptHash(item: SqlItem): string {
  const seen = { prompt: item.prompt, output_contract: item.output_contract, rules: item.rules, schema: item.schema };
  return sha(JSON.stringify(typeof item.starter_sql === 'string' ? { ...seen, starter_sql: item.starter_sql } : seen)).slice(0, 16);
}

/** The tables of the item's visible schema that its reference reads, from the gate's parse-tree table list (R37). */
export async function referenceTables(runner: RunnerClient, item: SqlItem, key: SqlKey): Promise<string[]> {
  const g = await runner.request<GateOk>({ op: 'gate', schema: item.schema, allowedSchemas: [], sql: key.reference_sql });
  if (!g.ok || g.data.tableCheck !== 'parse_tree') throw new Error('the tables the reference reads cannot be listed');
  return [...new Set(g.data.tables.filter((t) => t.schema === null || t.schema === item.schema).map((t) => t.table.toLowerCase()))].sort();
}

/** A hash of the columns and types of the named tables only, so a change elsewhere in the schema leaves it alone (R37). */
export async function schemaVersion(runner: RunnerClient, schema: string, tables: string[]): Promise<string> {
  const name = /^[a-z_][a-z0-9_]*$/;
  if (!name.test(schema) || !tables.every((t) => name.test(t))) throw new Error('bad schema or table name');
  const list = tables.length ? tables.map((t) => `'${t}'`).join(', ') : 'NULL';
  const r = await runner.request<RowsOk>({ op: 'app_query', sql: `SELECT lower(table_name), column_name, data_type FROM information_schema.columns WHERE table_schema = '${schema}' AND lower(table_name) IN (${list}) ORDER BY ALL` });
  if (!r.ok) throw new Error('the schema could not be read');
  return sha(JSON.stringify(r.data.rows)).slice(0, 12);
}

const NAME_PART = '(?:"(?:[^"]|"")+"|[A-Za-z_][\\w$]*)';
const QUALIFIED_NAME = new RegExp(`^${NAME_PART}(?:\\s*\\.\\s*${NAME_PART})*$`);
/** A name without quotes or qualifier, lower case: `t."City"` is `city`. */
const bareName = (s: string): string => {
  const last = s.trim().match(new RegExp(`${NAME_PART}$`))?.[0] ?? s.trim();
  return (last.startsWith('"') ? last.slice(1, -1).replace(/""/g, '"') : last).toLowerCase();
};

/** The [from, to) spans of the outermost text between from and to, split at its own commas. */
function commaSpans(top: string, from: number, to: number): [number, number][] {
  const spans: [number, number][] = [];
  let start = from;
  for (let i = from; i < to; i++) if (top[i] === ',') { spans.push([start, i]); start = i + 1; }
  spans.push([start, to]);
  return spans;
}

/** The outermost SELECT list's aliases, each mapped to its expression as normalised text. */
function selectAliases(sql: string, top: string): Map<string, string> {
  const out = new Map<string, string>();
  const select = /\bselect(?:\s+distinct)?\b/i.exec(top);
  if (!select) return out;
  const start = select.index + select[0].length;
  const from = /\bfrom\b/i.exec(top.slice(start));
  for (const [a, b] of commaSpans(top, start, from ? start + from.index : top.length)) {
    const m = new RegExp(`^(\\s*)([\\s\\S]*?\\S)\\s+(?:as\\s+)?(${NAME_PART})\\s*$`, 'i').exec(top.slice(a, b));
    if (!m || bareName(m[3]!) === 'end') continue;
    const exprFrom = a + m[1]!.length;
    out.set(bareName(m[3]!), squash(sql.slice(exprFrom, exprFrom + m[2]!.length)).toLowerCase());
  }
  return out;
}

/**
 * The query with one sort key's direction reversed in its outermost ORDER BY (A1), or null when
 * no ORDER BY term there sorts by that column: by its name (qualified or quoted), its position
 * in the output, or the expression its SELECT alias stands for. NULLS FIRST or LAST is kept.
 */
export function reverseSortKey(sql: string, column: string, outputColumns: string[]): string | null {
  const s = stripTrailing(sql);
  const top = outermost(maskSql(s));
  const orderBy = [...top.matchAll(/\border\s+by\b/gi)].pop();
  if (!orderBy) return null;
  const start = orderBy.index + orderBy[0].length;
  const tail = /\b(limit|offset|fetch)\b/i.exec(top.slice(start));
  const end = tail ? start + tail.index : s.length;
  const want = column.toLowerCase();
  const aliases = selectAliases(s, top);
  for (const [a, b] of commaSpans(top, start, end)) {
    const m = /^(\s*)([\s\S]*?)(?:\s+(asc|desc))?(?:\s+nulls\s+(?:first|last))?\s*$/i.exec(top.slice(a, b))!;
    const exprFrom = a + m[1]!.length;
    const exprTo = exprFrom + m[2]!.length;
    const expr = s.slice(exprFrom, exprTo);
    const named = QUALIFIED_NAME.test(expr.trim()) && bareName(expr) === want;
    const position = /^\d+$/.test(expr.trim()) && outputColumns[Number(expr.trim()) - 1]?.toLowerCase() === want;
    const aliased = aliases.get(want) === squash(expr).toLowerCase();
    if (!named && !position && !aliased) continue;
    const rest = s.slice(exprTo, b);
    const flipped = m[3] ? rest.replace(/\b(asc|desc)\b/i, (d) => (d.toLowerCase() === 'asc' ? 'DESC' : 'ASC')) : ` DESC${rest}`;
    return s.slice(0, exprTo) + flipped + s.slice(b);
  }
  return null;
}

/** The grader's verdict, or null when it throws: it does so only for a key that does not run or rules naming a column the key lacks. */
async function tryGrade(item: SqlItem, key: SqlKey, sql: string, ctx: CheckContext): Promise<GradeResult | null> {
  try { return await grade({ item, key, sql }, { runner: ctx.runner, edge: ctx.edge(item.edge_schema), feedback: ctx.feedback }); } catch { return null; }
}

/** A query's rows on one dataset as a bag (sorted, so parallel row order never counts), or null when it does not run. */
async function rowBag(runner: RunnerClient, schema: string, sql: string, deadlineMs: number): Promise<string | null> {
  const r = await runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql, cap: DISPLAY_CAP, deadlineMs });
  return r.ok ? JSON.stringify({ rows: r.data.rows.map((row) => JSON.stringify(row)).sort(), truncated: r.data.truncated }) : null;
}

/** Every string anywhere in a value, for the key-text check. */
const stringsIn = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(stringsIn) : x !== null && typeof x === 'object' ? Object.values(x).flatMap(stringsIn) : [];

export async function checkItem(item: SqlItem, key: SqlKey, ctx: CheckContext): Promise<CheckResult[]> {
  const id = typeof item?.id === 'string' ? item.id : String(key?.item_id ?? '(unknown item)');
  const out: CheckResult[] = [];
  const add = (check: string, ok: boolean, detail = '', warn = false) => { out.push({ id, check, ok, detail, ...(warn ? { warn } : {}) }); };
  /** Runs one check. A check that throws (malformed content C01 reports) fails with a fixed reason, never the error's text. */
  const check = async (name: string, fn: () => Promise<void> | void) => {
    try { await fn(); } catch { add(name, false, 'the check could not run; see C01'); }
  };
  const datasets = () => [item.schema, item.edge_schema];
  const otherWay = () => (typeof key.other_way?.sql === 'string' ? [key.other_way.sql] : []);
  /** Every complete correct query in the key: the reference, the alternatives and the other way. */
  const keys = () => [key.reference_sql, ...key.alternatives, ...otherWay()];
  /** Every key query the learner can be shown, hint 3's partial solution included. */
  const shown = () => [...keys(), ...(typeof key.hint3_partial === 'string' ? [key.hint3_partial] : [])];
  /** A helper construct is allowed early only when every call behind it is an allowed helper the prompt names. */
  const helperAllowed = (construct: string, sql: string): boolean => {
    const calls = helperCalls(sql, construct);
    const allowed = HELPER_CONSTRUCTS[construct] ?? [];
    return !!calls && calls.length > 0 && calls.every((h) => allowed.includes(h) && ctx.helpers.includes(h) && namesHelper(item.prompt, h));
  };

  await check('C01', () => {
    const errors = [...validateSqlItem(item), ...validateSqlKey(key)];
    add('C01', errors.length === 0, errors.join('; '));
  });

  await check('C03', async () => {
    const ref = await tryGrade(item, key, key.reference_sql, ctx);
    if (!ref) return add('C03', false, 'the reference does not run, or the rules name a column it does not return');
    const where = ref.datasets.filter((d) => !d.passed).map((d) => d.schema).join(', ');
    add('C03', ref.outcome === 'pass', `the reference gave ${ref.outcome}${where ? ` on ${where}` : ''}`);
  });

  await check('C04', async () => {
    const passes = async (sql: string) => (await tryGrade(item, { ...key, alternatives: [] }, sql, ctx))?.outcome === 'pass';
    const bad: string[] = [];
    for (const [i, alt] of key.alternatives.entries()) if (!(await passes(alt))) bad.push(`alternative ${i + 1}`);
    for (const sql of otherWay()) if (!(await passes(sql))) bad.push('the other way');
    add('C04', bad.length === 0, `${bad.join(', ')} ${bad.length === 1 ? 'disagrees' : 'disagree'} with the reference`);
  });

  // Ruling: a planted wrong query the grader rejects, or that errors, is caught, and must still be
  // diagnosed as its own error ID; an erroring one gets its ID from the engine-error classifier.
  // Only queries that ran have an output, so only they are compared for "the same output".
  await check('C05', async () => {
    const problems: string[] = [];
    const outputs = new Map<string, string>();
    for (const m of key.planted_wrong) {
      const g = await tryGrade(item, key, m.sql, ctx);
      if (!g) { problems.push(`${m.id} could not be graded`); continue; }
      if (g.outcome === 'pass') { problems.push(`${m.id} not caught`); continue; }
      if (g.outcome === 'crash') { problems.push(`${m.id} crashed the runner`); continue; }
      if (g.outcome === 'rejected') problems.push(`${m.id} is rejected by the gate, so it is never diagnosed as ${m.error_id}`);
      else if (g.diagnosis?.errorId !== m.error_id) problems.push(`${m.id} diagnosed as ${g.diagnosis?.errorId ?? 'nothing'}, expected ${m.error_id}`);
      if (g.outcome !== 'fail') continue;
      const bags: (string | null)[] = [];
      for (const schema of datasets()) bags.push(await rowBag(ctx.runner, schema, m.sql, item.rules.timeout_ms));
      const sig = JSON.stringify(bags);
      const same = outputs.get(sig);
      if (same) problems.push(`${m.id} gives the same output as ${same}`);
      else outputs.set(sig, m.id);
    }
    add('C05', problems.length === 0, problems.join('; '));
  });

  // R35. A tie can only be checked on the sort keys' values, after one trailing LIMIT n under an
  // ORDER BY of the outermost query. Anything else fails unless the prompt states the tie-break;
  // a LIMIT with no sort keys fails whatever the tie policy.
  await check('C06', async () => {
    const problems = new Set<string>();
    const sortKeys = item.rules.sort_keys;
    if (sortKeys.length === 0 && keys().some((k) => /\blimit\b/i.test(maskSql(k)))) problems.add('a key uses LIMIT, but the rules give no sort_keys to check ties with');
    const stripped = stripTrailing(key.reference_sql);
    const masked = maskSql(stripped);
    const top = outermost(masked);
    const limit = /\blimit\s+(\d+)\s*$/i.exec(top);
    if (/\blimit\b/i.test(masked) && item.rules.tie_policy !== 'stated') {
      if (!limit || (masked.match(/\blimit\b/gi)?.length ?? 0) !== 1 || /\boffset\b/i.test(masked)) problems.add('the reference LIMIT is not one trailing LIMIT n, so ties cannot be checked');
      if (!/\border\s+by\b/i.test(top)) problems.add('the reference has a LIMIT but no ORDER BY');
    }
    const n = Number(limit?.[1] ?? 0);
    if (problems.size === 0 && limit && n >= 1 && item.rules.tie_policy === 'none' && sortKeys.length > 0) {
      const wider = `${stripped.slice(0, limit.index)}LIMIT ${n + 1}`;
      for (const schema of datasets()) {
        const r = await ctx.runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql: wider, cap: n + 1, deadlineMs: item.rules.timeout_ms });
        if (!r.ok) { problems.add(`the reference does not run on ${schema}`); continue; }
        if (r.data.rows.length <= n) continue;
        const idx = sortKeys.map((s) => r.data.columns.findIndex((c) => c.name.toLowerCase() === s.column.toLowerCase()));
        if (idx.some((i) => i < 0)) { problems.add('a sort key is not a column of the reference output'); continue; }
        const [last, next] = [r.data.rows[n - 1]!, r.data.rows[n]!];
        if (idx.every((i) => JSON.stringify(last[i]) === JSON.stringify(next[i]))) problems.add(`a tie at the LIMIT cutoff on ${schema} and no stated tie-break`);
      }
    }
    add('C06', problems.size === 0, [...problems].join('; '));
  });

  await check('C07', () => {
    add('C07', !shown().some((k) => CLOCK_OR_RANDOM.test(maskSql(k))), 'a key uses the clock or randomness');
  });

  await check('C08', async () => {
    const problems: string[] = [];
    for (const schema of datasets()) {
      const first = await rowBag(ctx.runner, schema, key.reference_sql, item.rules.timeout_ms);
      if (first === null) problems.push(`the reference does not run on ${schema}`);
      else if (first !== (await rowBag(ctx.runner, schema, key.reference_sql, item.rules.timeout_ms))) problems.push(`the reference result changed between runs on ${schema}`);
    }
    add('C08', problems.length === 0, problems.join('; '));
  });

  await check('C09', () => {
    const order = new Map(ctx.curriculum.concepts.map((c) => [c.id, c.order]));
    const targetOrder = order.get(item.target_concept_id) ?? -1;
    const conceptOf = new Map(ctx.constructs.map((c) => [c.construct, c.concept_id]));
    const problems = new Set<string>();
    for (const k of shown()) {
      if (/\bsum\s*\(\s*distinct\b/i.test(maskSql(k))) problems.add('SUM(DISTINCT ...) used');
      for (const c of detectConstructs(k)) {
        const concept = conceptOf.get(c);
        if (!concept || (order.get(concept) ?? Infinity) <= targetOrder || helperAllowed(c, k)) continue;
        problems.add(`uses ${c} (${concept}), which comes later than ${item.target_concept_id}`);
      }
    }
    add('C09', problems.size === 0, [...problems].join('; '));
  });

  await check('C10', async () => {
    const data = await ctx.runner.request<RowsOk>({ op: 'app_query', sql: "SELECT count(*) FROM information_schema.columns WHERE starts_with(lower(column_name), '__al_') OR starts_with(lower(table_name), '__al_')" });
    const inKeys = shown().some((k) => /__al_/i.test(k));
    const inData = !data.ok || Number(data.data.rows[0]![0]) !== 0;
    add('C10', !inKeys && !inData, [inKeys ? 'a key uses the reserved __al_ prefix' : '', inData ? 'the dataset uses the reserved __al_ prefix, or could not be checked' : ''].filter(Boolean).join('; '));
  });

  await check('C11', () => {
    const found = new Set(keys().flatMap((k) => { const t = maskSql(k); return DUCKDB_ONLY.filter(([, re]) => re.test(t)).map(([name]) => name); }));
    add('C11', found.size === 0, found.size ? `DuckDB-only syntax: ${[...found].join(', ')}` : '', found.size > 0);
  });

  // Compared as normalised text, so a trailing semicolon, line breaks or case cannot hide key text.
  // stripTrailing runs on key text only: on prose, an apostrophe would read as an open string.
  // The faded shape and suffix are the reference's opening and closing text by design, often a
  // planted wrong query in full, and a fix item's starter_sql is a broken query, usually a planted
  // one, so planted wrong queries are not looked for in any of them; the answers are looked for everywhere.
  await check('C12', () => {
    const norm = (s: string) => squash(s).toLowerCase();
    const keyText = (list: unknown[]) => list.filter((s): s is string => typeof s === 'string').map((s) => norm(stripTrailing(s))).filter((s) => s !== '');
    const answers = keyText([key.reference_sql, key.hint3_partial, ...key.alternatives, ...otherWay()]);
    const planted = keyText(key.planted_wrong.map((p) => p.sql));
    const everywhere = stringsIn(item).map(norm);
    const elsewhere = stringsIn({ ...item, faded_shape: null, faded_suffix: null, starter_sql: null }).map(norm);
    const leak = answers.some((k) => everywhere.some((t) => t.includes(k))) || planted.some((k) => elsewhere.some((t) => t.includes(k)));
    add('C12', !leak, 'the item contains key text');
  });

  // Two forms. Without a suffix, the shape stops before a clause the learner writes. With one
  // (amended 2026-10-03 by the owner), the learner writes a non-empty blank between the shape and
  // the suffix, and the suffix starts on a new word at a clause start, or is empty.
  await check('C13', () => {
    if (item.fading || item.faded_shape || typeof item.faded_suffix === 'string') {
      const f = item.fading;
      const shape = squash(item.faded_shape ?? '').toLowerCase();
      const ref = squash(stripTrailing(key.reference_sql)).toLowerCase();
      const bounds = !!f && !!item.faded_shape && f.stage1 === item.faded_shape.length && f.stage2 > 0;
      const raw = item.faded_suffix;
      if (typeof raw === 'string') {
        const suffix = squash(raw).toLowerCase();
        const fits = shape !== '' && ref.length >= shape.length + suffix.length && ref.startsWith(shape) && ref.endsWith(suffix);
        const blank = fits ? ref.slice(shape.length, ref.length - suffix.length).trim() : '';
        const ok = bounds && (raw === '' ? f.stage2 < f.stage1 : f.stage2 <= f.stage1) && blank !== ''
          && (raw === '' || (/^\s/.test(raw) && CLAUSE_START.test(suffix)));
        add('C13', ok, 'the fading boundaries, faded_shape or faded_suffix do not fit the reference query: it must start with the shape and end with the suffix, with a blank between them, and the suffix must start with a space or line break, then a clause keyword');
      } else {
        const rest = shape && ref.startsWith(shape) ? ref.slice(shape.length).trimStart() : '';
        const ok = bounds && f.stage2 < f.stage1 && shape.length < ref.length && CLAUSE_START.test(rest);
        add('C13', ok, 'the fading boundaries or faded_shape do not fit the reference query: the shape must stop before a clause the learner writes');
      }
    } else add('C13', item.use !== 'lesson', 'a lesson item has no fading');
  });

  // The owner's decision of 2026-10-03 (design §4): stage 1 never shows a construct of the
  // concept the lesson teaches, so the learner writes the new part, not the clause after it.
  // C02 makes the item's target concept the concept of its lesson. When the item's sub_skill
  // names one of that concept's constructs, the item teaches that one: a DISTINCT item may show
  // the ORDER BY taught just before it, and a LIMIT item the ORDER BY a top list needs.
  await check('C16', () => {
    if (item.use !== 'lesson') return add('C16', true);
    const ofConcept = ctx.constructs.filter((c) => c.concept_id === item.target_concept_id).map((c) => c.construct);
    const taught = item.sub_skill && ofConcept.includes(item.sub_skill) ? [item.sub_skill] : ofConcept;
    const visible = [item.faded_shape, item.faded_suffix].filter((s): s is string => typeof s === 'string').join(' ');
    const given = detectConstructs(visible).filter((c) => taught.includes(c));
    add('C16', given.length === 0, `stage 1 shows ${given.join(', ')}, which this item's lesson (${item.target_concept_id}) teaches: leave it in the blank, using faded_suffix to give the end of the query`);
  });

  // R37: the schema version covers only the tables the reference reads, and the global
  // dataset_version is not compared: replaying the stored query through the grader is the check.
  await check('C14', async () => {
    const s = key.solver;
    let why = '';
    if (!s) why = 'no solver record';
    else if (s.prompt_hash !== promptHash(item)) why = 'the prompt changed since the solver record';
    else if (s.schema_version !== (await schemaVersion(ctx.runner, item.schema, await referenceTables(ctx.runner, item, key)))) why = 'the schema changed since the solver record';
    else if ((await tryGrade(item, key, s.query, ctx))?.outcome !== 'pass') why = 'the stored solver query no longer passes';
    add('C14', why === '', why);
  });

  // A1: every stated sort key must be tested. The reference with one sort key reversed must fail
  // on at least one dataset; if it still passes, no dataset can tell that key's direction apart.
  // A result that is not graded (an error or a time-out) shows nothing, so it fails the check too.
  await check('C15', async () => {
    if (!item.rules.order_matters) return add('C15', true);
    const meta = await ctx.runner.request<GateOk>({ op: 'gate', schema: item.schema, allowedSchemas: [], sql: key.reference_sql });
    if (!meta.ok) return add('C15', false, 'the reference does not run');
    const columns = meta.data.columns.map((c) => c.name);
    const problems: string[] = [];
    for (const s of item.rules.sort_keys) {
      const reversed = reverseSortKey(key.reference_sql, s.column, columns);
      if (reversed === null) { problems.push(`no ORDER BY term in the reference sorts by sort key ${s.column}`); continue; }
      const outcome = (await tryGrade(item, key, reversed, ctx))?.outcome;
      if (outcome === 'pass') problems.push(`the reference with ${s.column} reversed still passes, so no dataset tests that sort key`);
      else if (outcome !== 'fail') problems.push(`the reference with ${s.column} reversed could not be graded`);
    }
    add('C15', problems.length === 0, problems.join('; '));
  });

  // S2-48: a fix item's starter is graded as the learner's first submission would be. It must pass the gate and
  // fail with exactly the error it declares, so the starter and its feedback agree. An engine error is such a fail
  // (a syntax trap is one), as C05 treats planted queries; a time-out or an ungraded result is not.
  await check('C17', async () => {
    if (item.kind !== 'fix') return add('C17', true);
    const starter = item.starter_sql;
    const declared = item.starter_error_id;
    if (typeof starter !== 'string' || typeof declared !== 'string') return add('C17', false, 'a fix item needs starter_sql and starter_error_id');
    const named = /^ERR-[A-Z]+-\d{2}$/.test(declared) ? declared : 'the declared error ID';   // C01 reports a malformed one
    const g = await tryGrade(item, key, starter, ctx);
    let why = '';
    if (!g) why = 'the starter could not be graded';
    else if (g.outcome === 'pass') why = 'the starter passes, so there is nothing to fix';
    else if (g.outcome === 'rejected') why = 'the gate rejects the starter, so it is never graded';
    else if (g.outcome === 'timeout') why = 'the starter runs past the time limit';
    else if (!g.graded) why = 'the starter could not be graded';
    else if (g.diagnosis?.errorId !== declared) why = `the starter is diagnosed as ${g.diagnosis?.errorId ?? 'nothing'}, not ${named}`;
    add('C17', why === '', why);
  });

  // Carry-in from the A4 review: the grader looks each key column up in the key's output, and throws on a failing
  // attempt when one is not there. A passing reference never reaches that lookup, so C03 cannot see it.
  await check('C18', async () => {
    if (!item.rules.key_columns.length) return add('C18', true);
    const meta = await ctx.runner.request<GateOk>({ op: 'gate', schema: item.schema, allowedSchemas: [], sql: key.reference_sql });
    if (!meta.ok) return add('C18', false, 'the reference does not run');
    const returned = new Set(meta.data.columns.map((c) => c.name.toLowerCase()));
    const missing = item.rules.key_columns.filter((k) => !returned.has(String(k).toLowerCase()));
    add('C18', missing.length === 0, `rules.key_columns names ${missing.join(', ')}, which the reference does not return`);
  });

  return out.map((r) => (r.ok ? { ...r, detail: '' } : r));
}

export interface DrillSpec { level: number; questions: number; concepts: string[] }

/**
 * C19: each level's drill pool holds at least `questions` active items with use 'drill', and at least one
 * per concept of the level (design §12). The result is named by level, never by item.
 */
export function checkDrillPools(drills: DrillSpec[], items: SqlItem[]): CheckResult[] {
  const pool = items.filter((i) => i.use === 'drill' && i.status === 'active');
  return drills.map((d, n) => {
    const id = `drill-L${typeof d?.level === 'number' ? d.level : n + 1}`;
    if (!d || !Number.isInteger(d.questions) || d.questions < 1 || !Array.isArray(d.concepts) || d.concepts.length === 0) {
      return { id, check: 'C19', ok: false, detail: 'the drill entry needs questions and concepts' };
    }
    const inLevel = pool.filter((i) => d.concepts.includes(i.target_concept_id));
    const bare = d.concepts.filter((c) => !inLevel.some((i) => i.target_concept_id === c));
    const why: string[] = [];
    if (inLevel.length < d.questions) why.push(`the pool holds ${inLevel.length} items, the drill asks ${d.questions}`);
    if (bare.length) why.push(`no drill item for ${bare.join(', ')}`);
    return { id, check: 'C19', ok: why.length === 0, detail: why.join('; ') };
  });
}

/**
 * C29: each opener's case record is valid, it has a CP3 checkpoint, and that checkpoint's item exists with
 * use 'opener' and no grain line (S2-49, design §7). Names case IDs and item IDs only.
 */
export function checkOpeners(store: ContentStore): CheckResult[] {
  return (store.openers?.() ?? []).map((rec, n) => {
    const id = typeof rec?.case_id === 'string' ? rec.case_id : `sql/openers #${n + 1}`;
    const why = [...validateCaseRecord(rec)];
    const cp3 = Array.isArray(rec?.checkpoints) ? rec.checkpoints.filter((c) => c?.kind === 'CP3') : [];
    if (cp3.length !== 1) why.push('an opener needs exactly one CP3 checkpoint');
    for (const c of cp3) {
      if (typeof c.item_id !== 'string') { why.push('the CP3 checkpoint needs an item_id'); continue; }
      const item = store.item(c.item_id);
      if (!item) why.push(`${c.item_id} is missing`);
      else {
        if (item.use !== 'opener') why.push(`${c.item_id} must have use opener`);
        if (item.output_contract?.grain != null) why.push(`${c.item_id} must have no grain line`);
      }
    }
    return { id, check: 'C29', ok: why.length === 0, detail: why.join('; ') };
  });
}

/**
 * C30 (Task C8): every reading file of GA4 and Methodology passes schemas/reading.ts (the store leaves a failing one out and
 * names it), and every level 1 concept (D12, D13) has a reading. One result per concept, named by concept ID; a failing file is
 * named by the concept its file name stands for. Reports reasons, never a reading's text.
 */
export function checkReadings(store: ContentStore): CheckResult[] {
  const faults = store.readingFaults?.() ?? [];
  const out: CheckResult[] = [];
  const failed = new Set<string>();
  for (const f of faults) {
    const id = /([^/]+)\.json$/.exec(f.file)?.[1] ?? f.file;
    failed.add(id);
    out.push({ id, check: 'C30', ok: false, detail: f.problems.join('; ') });
  }
  for (const section of ['ga4', 'methodology'] as const) {
    const level1 = (store.choiceConcepts?.(section) ?? []).filter((c) => c.level === 1 && c.parent_id === null);
    const have = new Set((store.readings?.(section) ?? []).map((r) => r.concept_id));
    for (const c of level1) if (!failed.has(c.id)) out.push({ id: c.id, check: 'C30', ok: have.has(c.id), detail: have.has(c.id) ? '' : 'a level 1 concept has no reading' });
    for (const r of store.readings?.(section) ?? []) if (!level1.some((c) => c.id === r.concept_id)) out.push({ id: r.concept_id, check: 'C30', ok: true, detail: '' });
  }
  return out;
}

/** The item IDs a lesson names, in serving order; a malformed lesson (C02 reports it) gives what it can. */
function lessonItemIds(lesson: Lesson): string[] {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return [...list(lesson.pretest_item_ids), ...list(lesson.lesson_item_ids), ...list([lesson.retest_item_id]), ...list(lesson.pool_item_ids)];
}

export function checkLesson(lesson: Lesson, store: ContentStore): CheckResult[] {
  const errors = [...validateLesson(lesson)];
  for (const id of lessonItemIds(lesson)) {
    const item = store.item(id);
    if (!item) errors.push(`${id} is missing`);
    else if (item.target_concept_id !== lesson.concept_id) errors.push(`${id} targets ${item.target_concept_id}`);
    // An SQL choice item's key is a choice key, in keys/sql-choice (S3-13).
    const hasKey = item && isSqlChoiceKind(item.kind) ? !!store.sqlChoiceKey?.(id) : !!store.key(id);
    if (!hasKey) errors.push(`${id} has no key`);
  }
  return [{ id: String(lesson.concept_id), check: 'C02', ok: errors.length === 0, detail: errors.join('; ') }];
}

/**
 * loadContent for the command-line tools. A malformed file's parse error quotes the file's text,
 * which in a key is SQL (non-negotiable 2), so only the file's name is printed. Sets exit code 1
 * and returns null on failure.
 */
export async function loadContentForCli(root: string): Promise<ContentStore | null> {
  try { return await loadContent(root); } catch (e) {
    const file = /^([\w./-]+\.json): /.exec(e instanceof Error ? e.message : '')?.[1];
    const code = (e as { code?: unknown } | null)?.code;
    console.error(file ? `cannot load content: ${file} is not valid JSON`
      : `cannot load content: a file could not be read${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ''}`);
    process.exitCode = 1;
    return null;
  }
}

/** The IDs in every item file, so items no lesson names (drill pools, openers) are checked too; files that do not parse are named. */
async function itemFiles(dir: string): Promise<{ ids: string[]; unreadable: string[] }> {
  let names: string[];
  try { names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort(); } catch { return { ids: [], unreadable: [] }; }
  const ids: string[] = [];
  const unreadable: string[] = [];
  for (const n of names) {
    try {
      const id = (JSON.parse(await readFile(join(dir, n), 'utf8')) as { id?: unknown }).id;
      if (typeof id === 'string') ids.push(id);
      else unreadable.push(n);
    } catch { unreadable.push(n); }
  }
  return { ids, unreadable };
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const store = await loadContentForCli(root);
  if (!store) return;
  const results: CheckResult[] = [];
  const ids: string[] = [];
  for (const conceptId of store.conceptsWithContent()) {
    const lesson = store.lesson(conceptId)!;
    results.push(...checkLesson(lesson, store));
    results.push(...checkWhyClause(lesson));
    ids.push(...lessonItemIds(lesson));
  }
  const files = await itemFiles(join(root, 'sql/items'));
  ids.push(...files.ids);
  // An SQL choice key (S3-13) belongs to an SQL choice item and is named after it, as C20 asks of a GA4 or Methodology key.
  for (const n of (await readdir(join(root, 'keys/sql-choice')).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort()) {
    const id = n.replace(/\.json$/, '');
    let keyId: unknown;
    try { keyId = (JSON.parse(await readFile(join(root, 'keys/sql-choice', n), 'utf8')) as { item_id?: unknown } | null)?.item_id; }
    catch { results.push({ id: `keys/sql-choice/${n}`, check: 'C01', ok: false, detail: 'not valid JSON' }); continue; }
    const item = store.item(id);
    if (!item || !isSqlChoiceKind(item.kind) || keyId !== id) results.push({ id: `keys/sql-choice/${n}`, check: 'C01', ok: false, detail: 'a key with no SQL choice item, or not named after its item' });
  }
  for (const o of (store.openers?.() ?? [])) for (const c of Array.isArray(o.checkpoints) ? o.checkpoints : []) if (typeof c?.item_id === 'string') ids.push(c.item_id);
  results.push(...checkOpeners(store));
  results.push(...checkReadings(store));
  // C19 reads content/sql/drills.json; a missing file means no drills yet, an unreadable one is one failure.
  try {
    const drills = JSON.parse(await readFile(join(root, 'sql/drills.json'), 'utf8')).drills as DrillSpec[];
    const all = files.ids.map((i) => store.item(i)).filter((i): i is SqlItem => !!i);
    results.push(...checkDrillPools(drills, all));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') results.push({ id: 'sql/drills.json', check: 'C19', ok: false, detail: 'not valid JSON, or has no drills list' });
  }
  for (const n of files.unreadable) results.push({ id: `sql/items/${n}`, check: 'C01', ok: false, detail: 'not valid JSON, or has no id' });
  const active = [...new Set(ids)].filter((id) => store.item(id)?.status === 'active');
  if (active.length) {
    // The runner and the built data are needed only when there is an item to check.
    const manifest = JSON.parse(await readFile(at('data/manifest.json'), 'utf8'));
    const constructs = JSON.parse(await readFile(join(root, 'sql/constructs.json'), 'utf8'));
    const runner = await startRunner(at('data/course.duckdb'));
    const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
      datasetVersion: manifest.dataset_version, constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
    try {
      for (const id of active) {
        const item = store.item(id)!;
        // S3-13: an SQL choice item has a choice key and its own checks (tools/check-sql-choice.ts), never the write checks.
        if (isSqlChoiceKind(item.kind)) { results.push(...(await checkSqlChoiceItem(item, store.sqlChoiceKey?.(id), ctx))); continue; }
        const key = store.key(id);
        if (key) results.push(...(await checkItem(item, key, ctx)));
        else results.push({ id, check: 'C01', ok: false, detail: 'the item has no key' });
      }
    } finally {
      await runner.close();
    }
  }
  results.push(...(await checkChoice(root)));
  for (const r of results.filter((x) => !x.ok)) console.log(`${r.warn ? 'WARN' : 'FAIL'} ${r.check} ${r.id} ${r.detail}`);
  const tally = tallyLine(results);
  if (tally) console.log(tally);
  console.log(sqlChoiceTallyLine(results));
  const failed = results.filter((r) => !r.ok && !r.warn);
  console.log(`${results.length - failed.length}/${results.length} checks passed, ${new Set(results.map((r) => r.id)).size} items and lessons`);
  if (failed.length) process.exitCode = 1;
}

if (import.meta.main) await main();

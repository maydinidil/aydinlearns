// tools/check-content.ts: the content checks (design §12) that gate every SQL item before a learner
// sees it. They run through the app's own grader and runner. Results name item IDs, check IDs and
// reasons only, never SQL (non-negotiable 2): a runner, grader or parser message can quote a query,
// so none is ever copied into a detail or printed. After the SQL checks (C01 to C19 and C29), the CLI runs
// the GA4 and Methodology checks, C20 to C28, from tools/check-choice.ts (Task C3); C30, the readings, is here.
// SQL choice items (S3-13, Task C4) take C01, C14 and C31 to C35 from tools/check-sql-choice.ts instead of the
// write and fix checks, and a lesson's why_clause takes C36 and C37 from there. Sprint 4a (Task B2) adds the level 3
// rules to the write and fix checks: C38 (the grain line fades), C39 (the other way) and C40 (the level 3 edge schema).
// Sprint 4b (Task B2) adds C41, the cases: the openers and content/sql/cases/, their CP3 items, keys and truth values.
// Sprint 5b (Task B1) adds C42 to C45, the GA4 labs: each lab, its key, its blind solve and the lab guide (checkLabs).
// Sprint 5b (Task B4 fix) adds C46: the full mock of the entry in force today, and of every later-dated entry, asks no more questions than the held-out pool (checkFullMockPool).
// Sprint 6 (Task B3) repairs C41 (the truth queries parsed and run on each case's schema and edge schema, a stale truth, a key with no
// case, a daily case's level), teaches C19 the cumulative drill entry, and adds C47 (raw data), C48 (the level 4 traps), C49 (the level 4
// drill pool and the cumulative entry) and C50 (each case CP1, CP2, CP4 and CP5's blind-solve record). The F2 seams fix round adds C52
// (every table the schema panel shows an item is in its edge schema; C51 is Part 2's) and fails C41 once when the schemas cannot be read.
// Sprint 6 Part 2 (Task G2) adds C51: the dataset registry, its prep scripts and the cases on its data (checkDatasets), and skips by
// name an item whose registry dataset is not prepared (unbuiltItems), as C41 skips its case.
// Usage: node tools/check-content.ts [content-root]   (default: content/)
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRunner, type RunnerClient } from '../server/runner/client.ts';
import type { DisplayOk, GateOk, RowsOk } from '../server/runner/protocol.ts';
import { maskSql, stripTrailing } from '../server/runner/tables.ts';
import { grade, type Feedback } from '../server/grader/grade.ts';
import type { GradeResult } from '../server/grader/types.ts';
import { caseUnavailable, ContentFileError, LAB_GUIDE_FILE, LAB_KEY_DIR, loadContent, truthSourceHash, type ContentStore, type LoadOptions } from '../server/content.ts';
import { parseDrillFile, type DrillFile } from '../server/drill.ts';
import { EM_DASH, sameStructuralAnswer, validateLab, validateLabKey, type Lab, type LabKey } from '../schemas/lab.ts';
import { readingWords } from '../schemas/reading.ts';
import { amsterdamDate } from '../core/time.ts';
import { openerLevel } from '../server/session-composer.ts';
import { isSqlChoiceKind, validateSqlItem, type SqlItem } from '../schemas/item.ts';
import { validateSqlKey, type SqlKey } from '../schemas/keys.ts';
import { validateLesson, type Lesson } from '../schemas/lesson.ts';
import { caseSchema, SOLVED_KINDS, validateCaseKey, validateCaseRecord, type CaseRecord, type SolvedKind } from '../schemas/case.ts';
import type { Curriculum } from '../schemas/concepts.ts';
import type { EdgeDescription } from '../schemas/edge.ts';
import { validateDataset, type DatasetRecord } from '../schemas/dataset.ts';
import { notesForLevel, type TableNote } from '../schemas/schema-notes.ts';
import { detectConstructs, helperCalls } from './constructs.ts';
import { checkChoice, tallyLine } from './check-choice.ts';
import { checkSqlChoiceItem, checkWhyClause, outermost, sqlChoiceTallyLine } from './check-sql-choice.ts';
import { caseKeyHash } from './case-key-hash.ts';
import { casePromptHash } from './export-case-view.ts';

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

/** Each runner's DATE columns by schema, read once (dateColumns). */
const dateColumnCache = new WeakMap<RunnerClient, Map<string, Promise<ReadonlySet<string>>>>();

/**
 * S6-09 (sprint 6, Task A1): the lower-case names of a schema's DATE-typed columns, from the database the checks run on, so C09 can
 * see a DATE column minus a DATE as date arithmetic (tools/constructs.ts). An unsafe name or an unreadable schema gives none.
 * S6-34 (Task K3): a name counts only when every table and view of the schema that has a column of that name types it DATE, since a
 * bare name cannot say which table it reads: `opened_on` that is a DATE in one table and a TIMESTAMP in another is left out.
 */
export function dateColumns(runner: RunnerClient, schema: string): Promise<ReadonlySet<string>> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) return Promise.resolve(new Set());
  let bySchema = dateColumnCache.get(runner);
  if (!bySchema) dateColumnCache.set(runner, bySchema = new Map());
  let found = bySchema.get(schema);
  if (!found) {
    found = runner.request<RowsOk>({ op: 'app_query', sql: `SELECT lower(column_name) FROM information_schema.columns WHERE table_schema = '${schema}' GROUP BY lower(column_name) HAVING bool_and(data_type = 'DATE')` })
      .then((r) => new Set(r.ok ? r.data.rows.map((row) => String(row[0])) : []));
    bySchema.set(schema, found);
  }
  return found;
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

  await check('C09', async () => {
    const order = new Map(ctx.curriculum.concepts.map((c) => [c.id, c.order]));
    const targetOrder = order.get(item.target_concept_id) ?? -1;
    const conceptOf = new Map(ctx.constructs.map((c) => [c.construct, c.concept_id]));
    const problems = new Set<string>();
    // S6-09: the item schema's DATE columns, so a DATE column minus a DATE counts as date arithmetic (S6-34: names typed DATE in
    // every table that has them, also read through min, max, any_value, least, greatest, date_trunc or a cast to DATE).
    const dates = await dateColumns(ctx.runner, item.schema);
    for (const k of shown()) {
      if (/\bsum\s*\(\s*distinct\b/i.test(maskSql(k))) problems.add('SUM(DISTINCT ...) used');
      for (const c of detectConstructs(k, { dateColumns: dates })) {
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

  // Sprint 4a Task B2. C38: the grain line fades from level 3 (S4-04).
  await check('C38', () => {
    const why = grainFadeProblem(item, ctx.curriculum);
    add('C38', why === '', why);
  });

  // C39: the other way (S4-11) is null, or an alternative that passes on the visible and edge data with a short trade-off.
  // It is graded against the reference alone, as C04 grades each alternative. One that uses exactly the reference's
  // constructs may be only another layout, so it warns for the content review; a different method does not.
  await check('C39', async () => {
    const problems = otherWayProblems(key);
    const ow = key.other_way;
    if (problems.length || !ow) return add('C39', problems.length === 0, problems.join('; '));
    if ((await tryGrade(item, { ...key, alternatives: [] }, ow.sql, ctx))?.outcome !== 'pass') return add('C39', false, 'the other way does not pass on the visible and edge data');
    const mine = detectConstructs(ow.sql);
    const ref = detectConstructs(key.reference_sql);
    if (mine.length === ref.length && mine.every((c) => ref.includes(c))) {
      return add('C39', false, 'the other way uses the same constructs as the reference: check it is another method, not only other aliases, order or layout (S4-11)', true);
    }
    add('C39', true);
  });

  // C40 (Review Focus 3): every level 3 key runs on its edge schema, where a fanned-out key that passes on the visible data
  // by luck fails. The item names its concept's edge schema, and each key (the reference, the alternatives and the other
  // way) reads only tables that schema holds and runs there. Tables are counted, never named: they come from the key.
  // A CTE's own name is in neither schema, so only the visible schema's tables are looked for.
  await check('C40', async () => {
    if (conceptLevel(item, ctx.curriculum) < 3) return add('C40', true);
    const problems: string[] = [];
    const want = LEVEL3_EDGE_SCHEMAS[item.target_concept_id];
    if (want && item.use !== 'opener' && item.edge_schema !== want) problems.push(`a level 3 ${item.target_concept_id} item must use the edge schema ${want}`);
    const [visible, edge] = [await tablesIn(ctx.runner, item.schema), await tablesIn(ctx.runner, item.edge_schema)];
    if (!visible || !edge) problems.push('the tables of the visible or the edge schema could not be read');
    const named: [string, string][] = [['the reference', key.reference_sql], ...key.alternatives.map((s, i): [string, string] => [`alternative ${i + 1}`, s]),
      ...otherWay().map((s): [string, string] => ['the other way', s])];
    for (const [label, sql] of named) {
      const g = await ctx.runner.request<GateOk>({ op: 'gate', schema: item.schema, allowedSchemas: [], sql });
      if (!g.ok) { problems.push(`${label} could not be read (see C03 and C04)`); continue; }
      if (visible && edge) {
        const read = new Set(g.data.tables.filter((t) => t.schema === null || t.schema === item.schema).map((t) => t.table.toLowerCase()));
        const missing = [...read].filter((t) => visible.has(t) && !edge.has(t)).length;
        if (missing) problems.push(`${label} reads ${missing} table${missing === 1 ? '' : 's'} the edge schema does not hold`);
      }
      if ((await rowBag(ctx.runner, item.edge_schema, sql, item.rules.timeout_ms)) === null) problems.push(`${label} does not run on ${item.edge_schema}`);
    }
    add('C40', problems.length === 0, problems.join('; '));
  });

  // C47 (sprint 6, S6-01, Review Focus 2): a raw-data item is on voltmarkt_raw with the clean edge schema, names no schema and finds the
  // quirk; a clean item's key reads no raw table.
  await check('C47', async () => {
    const problems = await rawDataProblems(item, key, ctx.runner);
    add('C47', problems.length === 0, problems.join('; '));
  });

  return out.map((r) => (r.ok ? { ...r, detail: '' } : r));
}

// ---- the level 3 rules (sprint 4a Task B2): C38 to C40 ----------------------------------------------------------------

/**
 * C40: the edge schema of each level 3 concept, from Task B3's concept table in the sprint 4a plan. The join edge schema
 * plants the fan-out cases (duplicate bridge rows, an order with no lines, a product in two promotions), the date one the
 * time zone and ISO week cases, and the set one the duplicate rows a UNION would drop.
 */
export const LEVEL3_EDGE_SCHEMAS: Readonly<Record<string, string>> = {
  'SQL-DATE-01': 'voltmarkt_edge_date', 'SQL-JOIN-01': 'voltmarkt_edge_join', 'SQL-JOIN-02': 'voltmarkt_edge_join', 'SQL-CTE-01': 'voltmarkt_edge_join',
  'SQL-JOIN-03': 'voltmarkt_edge_join', 'SQL-JOIN-04': 'voltmarkt_edge_join', 'SQL-JOIN-05': 'voltmarkt_edge_join', 'SQL-SET-01': 'voltmarkt_edge_set',
};
/** S4-11: the most characters an other way's trade-off may have. */
export const TRADEOFF_MAX = 140;

/** The level the level 3 rules read: the target concept's level in the curriculum, else the item's own `level`, else 0. */
function conceptLevel(item: SqlItem, curriculum: Curriculum): number {
  return curriculum.concepts.find((c) => c.id === item.target_concept_id)?.level ?? item.level ?? 0;
}

/**
 * C38 (S4-04, design §11 "that line fades"): from level 3, `output_contract.grain` is null outside the lesson phases. A lesson
 * item (the lesson block) keeps its grain line, a pretest item, also served in the lesson phases, may keep it, and a re-test,
 * pool, drill or opener item has none. Levels 1 and 2 are unchanged. Returns the problem, or '' when there is none.
 */
export function grainFadeProblem(item: SqlItem, curriculum: Curriculum): string {
  if (conceptLevel(item, curriculum) < 3 || item.use === 'pretest') return '';
  const grain = item.output_contract?.grain ?? null;
  if (item.use === 'lesson') return grain ? '' : 'a level 3 lesson item keeps its grain line (S4-04): set output_contract.grain';
  return grain === null ? '' : `the grain line fades from level 3 (S4-04): output_contract.grain must be null on a ${item.use} item`;
}

/** Key text compared as one query: a trailing semicolon dropped and every run of spaces and line breaks made one space. */
const sameQuery = (a: string, b: string): boolean => squash(stripTrailing(a)) === squash(stripTrailing(b));

/**
 * C39's rules on the key file alone (S4-11): `other_way` is null, or `{ sql, tradeoff }` whose `sql` is one of the key's
 * `alternatives` and whose `tradeoff` is one plain sentence (no line break, no second sentence, ending with a full stop) of
 * at most 140 characters. checkItem then grades the other way on the visible and edge data. Never quotes the key.
 */
export function otherWayProblems(key: SqlKey): string[] {
  const ow: unknown = (key as { other_way?: unknown }).other_way;
  if (ow === null || ow === undefined) return [];
  const o = typeof ow === 'object' && !Array.isArray(ow) ? (ow as Record<string, unknown>) : null;
  if (!o || typeof o.sql !== 'string' || typeof o.tradeoff !== 'string') return ['other_way must be null or { sql, tradeoff }'];
  const problems: string[] = [];
  const alternatives = Array.isArray(key.alternatives) ? key.alternatives.filter((s): s is string => typeof s === 'string') : [];
  if (!alternatives.some((a) => sameQuery(a, o.sql as string))) problems.push('the other way is not one of the alternatives');
  const t = o.tradeoff.trim();
  if (t === '') return [...problems, 'the tradeoff is missing'];
  if (t.length > TRADEOFF_MAX) problems.push(`the tradeoff is ${t.length} characters, over ${TRADEOFF_MAX}`);
  if (/[\r\n]/.test(t) || !t.endsWith('.') || /[.!?]\s+\S/.test(t)) problems.push('the tradeoff must be one sentence that ends with a full stop');
  return problems;
}

/** The tables and views a schema holds, lower case, or null when it cannot be read. */
async function tablesIn(runner: RunnerClient, schema: string): Promise<Set<string> | null> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) return null;
  const r = await runner.request<RowsOk>({ op: 'app_query', sql: `SELECT lower(table_name) FROM information_schema.tables WHERE table_schema = '${schema}'` });
  return r.ok ? new Set(r.data.rows.map((row) => String(row[0]))) : null;
}

export interface DrillSpec { level: number; questions: number; concepts: string[]; pool_item_ids?: string[] }

/**
 * C19: each level's drill pool holds at least `questions` active items with use 'drill', and at least one
 * per concept of the level (design §12). The result is named by level, never by item. A drill whose
 * `pool_item_ids` is an empty list is not written yet (sprint 4a: level 3's, until Task B3): the server
 * lists it as not available and starts no run, so it warns instead of failing. When `pool_item_ids` is listed, the level drill draws
 * only those items (server/routes/drill.ts, which drops a bad ID without a word), so each listed ID must be an active drill item
 * of one of the drill's concepts at the drill's level, none may repeat, and every concept keeps at least one of them.
 */
export function checkDrillPools(drills: DrillSpec[], items: SqlItem[]): CheckResult[] {
  const pool = items.filter((i) => i.use === 'drill' && i.status === 'active');
  return drills.map((d, n) => {
    const id = `drill-L${typeof d?.level === 'number' ? d.level : n + 1}`;
    if (!d || !Number.isInteger(d.questions) || d.questions < 1 || !Array.isArray(d.concepts) || d.concepts.length === 0) {
      return { id, check: 'C19', ok: false, detail: 'the drill entry needs questions and concepts' };
    }
    if (Array.isArray(d.pool_item_ids) && d.pool_item_ids.length === 0) {
      return { id, check: 'C19', ok: false, warn: true, detail: 'the drill has no pool yet (pool_item_ids is empty), so the app lists it as not available' };
    }
    const inLevel = pool.filter((i) => d.concepts.includes(i.target_concept_id));
    const bare = d.concepts.filter((c) => !inLevel.some((i) => i.target_concept_id === c));
    const why: string[] = [];
    if (inLevel.length < d.questions) why.push(`the pool holds ${inLevel.length} items, the drill asks ${d.questions}`);
    if (bare.length) why.push(`no drill item for ${bare.join(', ')}`);
    if (Array.isArray(d.pool_item_ids)) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const dup = d.pool_item_ids.filter((x, k) => d.pool_item_ids!.indexOf(x) !== k);
      if (dup.length) why.push(`pool_item_ids repeats ${[...new Set(dup)].join(', ')}`);
      const bad = [...new Set(d.pool_item_ids)].filter((x) => {
        const i = byId.get(x);
        return !i || i.use !== 'drill' || i.status !== 'active' || !d.concepts.includes(i.target_concept_id) || i.level !== d.level;
      });
      if (bad.length) why.push(`pool_item_ids names ${bad.join(', ')}, which ${bad.length === 1 ? 'is' : 'are'} not active drill items of this level's concepts`);
      const listed = new Set(d.pool_item_ids.map((x) => byId.get(x)?.target_concept_id));
      const empty = d.concepts.filter((c) => !listed.has(c));
      if (empty.length) why.push(`pool_item_ids has no item for ${empty.join(', ')}`);
    }
    return { id, check: 'C19', ok: why.length === 0, detail: why.join('; ') };
  });
}

/**
 * C29: each opener's case record is valid, it has a CP3 checkpoint, and that checkpoint's item exists with
 * use 'opener' and no grain line (S2-49, design §7), its item's ID level is the opener's level (s2:L101), and no item_id is shared
 * between openers (s2:L69). Names case IDs and item IDs only.
 */
export function checkOpeners(store: ContentStore): CheckResult[] {
  // s2:L69: the store keeps one credit list per item_id (the last opener wins), so an item_id two openers share is a fault.
  const users = new Map<string, string[]>();
  for (const [n, rec] of (store.openers?.() ?? []).entries()) {
    const owner = typeof rec?.case_id === 'string' ? rec.case_id : `sql/openers #${n + 1}`;
    for (const c of Array.isArray(rec?.checkpoints) ? rec.checkpoints : []) if (typeof c?.item_id === 'string') users.set(c.item_id, [...(users.get(c.item_id) ?? []), owner]);
  }
  return (store.openers?.() ?? []).map((rec, n) => {
    const id = typeof rec?.case_id === 'string' ? rec.case_id : `sql/openers #${n + 1}`;
    const invalid = validateCaseRecord(rec);
    const why = [...invalid];
    for (const [item, owners] of users) if (owners.includes(id) && new Set(owners).size > 1) why.push(`${item} is also used by ${[...new Set(owners)].filter((o) => o !== id).join(', ')}`);
    // Codex F22: openerLevel reads concept_ids and every checkpoint's credits_concepts, so the level comes only from a record that
    // validated; a malformed one skips the level check and fails C29 on the messages above.
    const level = invalid.length === 0 && store.curriculum ? openerLevel(rec, store.curriculum) : null;
    const cp3 = Array.isArray(rec?.checkpoints) ? rec.checkpoints.filter((c) => c?.kind === 'CP3') : [];
    if (cp3.length !== 1) why.push('an opener needs exactly one CP3 checkpoint');
    for (const c of cp3) {
      if (typeof c.item_id !== 'string') { why.push('the CP3 checkpoint needs an item_id'); continue; }
      const item = store.item(c.item_id);
      if (!item) why.push(`${c.item_id} is missing`);
      else {
        if (item.use !== 'opener') why.push(`${c.item_id} must have use opener`);
        if (item.output_contract?.grain != null) why.push(`${c.item_id} must have no grain line`);
        // s2:L101: the level in the item ID (EX-OPENER-L2-01) is the opener's level.
        const named = /-L(\d+)-/.exec(c.item_id)?.[1];
        if (level !== null && named !== undefined && Number(named) !== level) why.push(`${c.item_id} names level ${named} but the opener is level ${level}`);
      }
    }
    return { id, check: 'C29', ok: why.length === 0, detail: why.join('; ') };
  });
}

const CASE_CHOICES = ['CP1', 'CP5'] as const;
const CASE_TRUTHS = ['CP2', 'CP4'] as const;
/** The runner's time limit for one truth query, on the visible or the edge schema (the build has none: it is ours, not a learner's). */
const TRUTH_TIMEOUT_MS = 30_000;

/** Sprint 6 (Task B3): the database C41 runs the truth queries on, and the schemas it holds (schemasIn). */
export interface CaseDb { runner: RunnerClient; schemas: ReadonlySet<string> }
export interface CaseCheckOptions {
  /** The database: each truth query is parsed by the gate and run on the case's schema and its CP3 item's edge schema. */
  db?: CaseDb;
}

/**
 * Every schema the database holds, from the runner: what C41 and C47 run on, and which cases are unavailable (S6-13). Null when the
 * query fails: an empty set would make every case look unavailable, and C41 would skip them all with a warning (F2 seams triage).
 */
export async function schemasIn(runner: RunnerClient): Promise<Set<string> | null> {
  const r = await runner.request<RowsOk>({ op: 'app_query', sql: 'SELECT DISTINCT schema_name FROM information_schema.schemata' });
  return r.ok ? new Set(r.data.rows.map((row) => String(row[0]))) : null;
}

/**
 * C41 with the database the runner reads (check:content's call). When the schemas it holds cannot be read, C41 fails once, by the
 * database's name, and the cases are checked without the database (records, keys and the truth file; a case whose schema the build
 * did not name is still skipped by name), so none is skipped for want of a schema list.
 */
export async function checkCasesOnDb(store: ContentStore, runner: RunnerClient): Promise<CheckResult[]> {
  const schemas = await schemasIn(runner);
  if (schemas === null) {
    return [{ id: 'data/course.duckdb', check: 'C41', ok: false, detail: 'the schemas the database holds could not be read, so no truth query ran on it: check that npm run build:data finished' },
      ...(await checkCases(store))];
  }
  return checkCases(store, { db: { runner, schemas } });
}

/** The type names DuckDB gives a number column: a truth query must return one of them. */
const NUMBER_TYPE = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|DECIMAL(\(\d+,\s*\d+\))?)$/i;
/** A display result's one number: one row, one numeric column, a finite value (a BIGINT or DECIMAL comes back as text); else null. */
export function oneNumber(r: DisplayOk): number | null {
  if (r.columns.length !== 1 || r.rows.length !== 1 || r.truncated || !NUMBER_TYPE.test(r.columns[0]!.type)) return null;
  const v = r.rows[0]![0];
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * B2-M4 and S4C-05: what is wrong with one truth query, parsed by the runner's gate on the case's schema (exactly one statement, a
 * SELECT, its tables named without a schema, so the edge run swaps them) and run on the visible schema and on the edge schema, where
 * it must return one number. `stored` is the truth file's value, which must be what the query returns on the visible schema now.
 * Never quotes the query or a value. P16: on the edge run only, a one-row, one-column missing value is a warning (`warns`), not a
 * failure (`fails`); everything else, and any missing value on the visible schema, fails.
 */
async function truthQueryProblems(db: CaseDb, cp: string, truthKey: string, sql: string, schema: string, edge: string | null, stored: number | undefined): Promise<{ fails: string[]; warns: string[] }> {
  const what = `the truth query for ${cp}`;
  const g = await db.runner.request<GateOk>({ op: 'gate', schema, allowedSchemas: [], sql });
  if (!g.ok) {
    const e = g.error;
    if (e.kind === 'gate' && (e.reason === 'multi_statement' || e.reason === 'empty')) return { fails: [`${what} must be one statement`], warns: [] };
    if (e.kind === 'gate' && e.reason === 'not_select') return { fails: [`${what} must be one SELECT (it may start with WITH)`], warns: [] };
    if (e.kind === 'gate' && e.reason === 'qualified_schema') return { fails: [`${what} must name its tables without a schema`], warns: [] };
    return { fails: [`${what} does not return one number on ${schema}`], warns: [] };
  }
  if (g.data.tables.some((t) => t.schema !== null)) return { fails: [`${what} must name its tables without a schema`], warns: [] };
  const out: string[] = [];
  const warns: string[] = [];
  /** The one number the query returns on `on`, or why it returns none (a kind, never the error's text). */
  const run = async (on: string): Promise<{ n: number } | { why: string }> => {
    const r = await db.runner.request<DisplayOk>({ op: 'display', schema: on, allowedSchemas: [], sql, cap: 2, deadlineMs: TRUTH_TIMEOUT_MS });
    if (!r.ok) return { why: r.error.kind === 'timeout' ? 'it runs past the time limit' : 'it does not run there' };
    const n = oneNumber(r.data);
    if (n !== null) return { n };
    const d = r.data;
    if (d.rows.length !== 1 || d.columns.length !== 1) return { why: `it returns ${d.rows.length === 0 ? 'no row' : d.rows.length > 1 ? 'more than one row' : 'more than one column'}` };
    return { why: d.rows[0]![0] === null ? 'it returns a missing value' : 'it returns something other than a number' };
  };
  const visible = await run(schema);
  if ('why' in visible) out.push(`${what} does not return one number on ${schema} (${visible.why})`);
  else if (stored !== undefined && Math.abs(visible.n - stored) > 1e-9 * Math.max(1, Math.abs(stored))) {
    out.push(`the truth file's value for ${truthKey} is not what its query returns on ${schema}: run npm run build:data`);
  }
  if (edge !== null && !db.schemas.has(edge)) out.push(`the edge schema ${edge} is not in the database`);
  else if (edge !== null) {
    const e = await run(edge);
    if (!('why' in e)) { /* one number */ }
    else if (e.why === 'it returns a missing value') warns.push(`${what} returns a missing value on ${edge}`);
    else out.push(`${what} does not return one number on ${edge} (${e.why})`);
  }
  return { fails: out, warns };
}

/**
 * C41 (sprint 4b, Task B2; S4B-01 to S4B-05, design §7; repaired in sprint 6, Task B3): every case, the level openers and
 * content/sql/cases/ alike, one result per case file, named by case ID, and one per key file with no case. C29 keeps the opener
 * rules; this check adds, for every case:
 * - the record validates (validateCaseRecord, a daily case's CP3 and CP4 only included); a malformed record fails on those
 *   messages alone, and the check finishes;
 * - an opener sits in content/sql/openers/, an inbox or daily case in content/sql/cases/; no case ID and no checkpoint item is
 *   used by two case files (the store keeps one credit list per item);
 * - its CP3 item exists with use `opener` (an opener) or `case` (otherwise), no grain line and the case's schema (S6-13), and the
 *   expected output is that item's output columns and sort keys;
 * - an opener's level is openerLevel's; a daily case's level is its highest credited concept's (B2-M3); every credited concept is
 *   an SQL curriculum concept at or below the case's level;
 * - every `{CP2}` or `{CP4}` in the model answer names a checkpoint the case lists (S4B-10);
 * - every truth_key has a value in the truth file the store read, computed from the key as it is now: a source hash that differs
 *   from the case's schema and truth query says the key changed since the build (C1 fix report, note 5);
 * - its key (content/keys/cases/<case_id>.json, the file named after the case) validates, names that case, has a truth query for
 *   each CP2 and CP4 and a correct option for each CP1 and CP5 the case lists and nothing for any other, and each correct option is
 *   one of that checkpoint's options (the validator's S2-60 rule already makes every oid of a record different);
 * - with the database (`db`): each truth query is one SELECT by the gate's parse, names no schema, and returns one number on the
 *   case's schema, equal to the truth file's value, and on its CP3 item's edge schema (B2-M4, S4C-05).
 * A case whose schema the database does not hold (`db`, or else the schemas the build named) is unavailable until its dataset is
 * prepared (S6-13): once its record and key pass, it is skipped by name with a warning, never failed (Review Focus 3).
 * A detail names case IDs, item IDs, checkpoints, schemas and fields: never a truth query, a value, a correct oid or an explanation.
 */
export async function checkCases(store: ContentStore, options: CaseCheckOptions = {}): Promise<CheckResult[]> {
  const all = store.cases?.() ?? [];
  const openers = new Set<unknown>(store.openers?.() ?? []);
  const idOf = (rec: CaseRecord, n: number): string => (typeof rec?.case_id === 'string' ? rec.case_id : `case file #${n + 1}`);
  const files = new Map<string, number>();
  const itemOwners = new Map<string, number>();
  for (const [n, rec] of all.entries()) {
    files.set(idOf(rec, n), (files.get(idOf(rec, n)) ?? 0) + 1);
    for (const c of Array.isArray(rec?.checkpoints) ? rec.checkpoints : []) if (typeof c?.item_id === 'string') itemOwners.set(c.item_id, (itemOwners.get(c.item_id) ?? 0) + 1);
  }
  const levelOf = new Map(store.curriculum.concepts.map((c) => [c.id, c.level]));
  const built = options.db?.schemas ?? store.builtSchemas?.() ?? null;
  const out: CheckResult[] = [];
  for (const [n, rec] of all.entries()) {
    const id = idOf(rec, n);
    const invalid = validateCaseRecord(rec);
    const why = [...invalid];
    const warns: string[] = [];
    const isOpener = openers.has(rec);
    if ((files.get(id) ?? 0) > 1) why.push(`the case ID ${id} is used by ${files.get(id)} case files`);
    // Codex F22's lesson: the checks below read the record's fields, so they run only on a record that validated.
    if (invalid.length) { out.push({ id, check: 'C41', ok: false, detail: why.join('; ') }); continue; }
    const schema = caseSchema(rec);
    const absent = built !== null && !built.has(schema);
    if (isOpener && rec.kind !== 'opener') why.push('content/sql/openers/ holds the level openers only: an inbox or daily case goes in content/sql/cases/');
    if (!isOpener && rec.kind === 'opener') why.push('a level opener goes in content/sql/openers/, not content/sql/cases/');
    for (const c of rec.checkpoints) if (c.item_id !== undefined && (itemOwners.get(c.item_id) ?? 0) > 1) why.push(`${c.item_id} is also a checkpoint item of another case`);
    // The CP3 item: its use, no grain line, the case's schema, and the expected output it promises.
    const cp3 = rec.checkpoints.find((c) => c.kind === 'CP3')!;
    const item = store.item(cp3.item_id!);
    const use = rec.kind === 'opener' ? 'opener' : 'case';
    if (!item) why.push(`${cp3.item_id} is missing`);
    else {
      if (item.use !== use) why.push(`${cp3.item_id} must have use ${use}`);
      if (item.output_contract?.grain != null) why.push(`${cp3.item_id} must have no grain line`);
      if (item.schema !== schema) why.push(`${cp3.item_id} must read ${schema}, the case's schema (it reads ${String(item.schema)})`);
      const columns = item.output_contract?.columns?.map((c) => c.name) ?? [];
      if (JSON.stringify(rec.expected_output.columns) !== JSON.stringify(columns)) why.push(`expected_output.columns must be ${cp3.item_id}'s output columns, in order`);
      const sort = (item.rules?.sort_keys ?? []).map((k) => ({ column: k.column, desc: k.desc }));
      const promised = rec.expected_output.sort.map((k) => ({ column: k.column, desc: k.desc }));
      if (JSON.stringify(promised) !== JSON.stringify(sort)) why.push(`expected_output.sort must be ${cp3.item_id}'s sort keys`);
    }
    // Levels: an opener opens the level its concepts reach; a daily case is the level of its highest credit (B2-M3); every credit
    // sits at or below the case's level.
    if (rec.kind === 'opener') {
      const opens = openerLevel(rec, store.curriculum);
      if (opens !== rec.level) why.push(`the opener is level ${rec.level}, but its concepts reach level ${opens ?? 'none'} (openerLevel)`);
    }
    const credited = rec.checkpoints.flatMap((c) => c.credits_concepts).map((c) => levelOf.get(c)).filter((l): l is number => l !== undefined);
    if (rec.kind === 'daily' && credited.length && Math.max(...credited) !== rec.level) {
      why.push(`a daily case's level must be ${Math.max(...credited)}, the level of its highest credited concept`);
    }
    for (const c of rec.checkpoints) for (const concept of c.credits_concepts) {
      const level = levelOf.get(concept);
      if (level === undefined) why.push(`${c.kind} credits ${concept}, which is not a concept of the SQL curriculum`);
      else if (level > rec.level) why.push(`${c.kind} credits ${concept}, a level ${level} concept, above the case's level ${rec.level}`);
    }
    // S4B-10: a placeholder the case cannot fill would read "(answer CP4 to see this number)" for good.
    const kinds = new Set<string>(rec.checkpoints.map((c) => c.kind));
    for (const k of new Set([...rec.model_answer_template.matchAll(/\{(CP\d)\}/g)].map((m) => m[1]!))) {
      if (!(CASE_TRUTHS as readonly string[]).includes(k)) why.push(`model_answer_template fills {${k}}, but only {CP2} and {CP4} can be filled`);
      else if (!kinds.has(k)) why.push(`model_answer_template fills {${k}}, but the case has no ${k}`);
    }
    // The key: its shape, then each entry against the checkpoints the case lists.
    const needsKey = [...CASE_CHOICES, ...CASE_TRUTHS].some((k) => kinds.has(k));
    const raw = store.caseKey?.(rec.case_id);
    const shape = raw === undefined ? [] : validateCaseKey(raw);
    const key = raw !== undefined && shape.length === 0 ? raw : null;
    if (raw === undefined) { if (needsKey) why.push(`content/keys/cases/${rec.case_id}.json is missing: its CP1, CP2, CP4 and CP5 need it`); }
    else if (shape.length) why.push(...shape.map((m) => `the key: ${m}`));
    else if (key) {
      if (key.case_id !== rec.case_id) why.push('the key names another case');
      for (const k of CASE_TRUTHS) {
        if (kinds.has(k) && key.truths[k] === undefined) why.push(`the key has no truth query for ${k}`);
        if (!kinds.has(k) && key.truths[k] !== undefined) why.push(`the key has a truth query for ${k}, but the case has no ${k}`);
      }
      for (const k of CASE_CHOICES) {
        const cp = rec.checkpoints.find((c) => c.kind === k);
        const choice = key.choices[k];
        if (cp && !choice) why.push(`the key has no correct option for ${k}`);
        if (!cp && choice) why.push(`the key has a correct option for ${k}, but the case has no ${k}`);
        if (cp && choice && !(cp.options ?? []).some((o) => o.oid === choice.correct_oid)) why.push(`the key's ${k} correct option is not one of its options`);
      }
    }
    // S6-13 and Review Focus 3: a case on a schema the database does not hold has no truth values and nothing to run: skipped by name.
    if (absent) {
      out.push(why.length ? { id, check: 'C41', ok: false, detail: why.join('; ') }
        : { id, check: 'C41', ok: false, warn: true, detail: `skipped: the database has no schema ${schema}, so the case is unavailable until its dataset is prepared` });
      continue;
    }
    // The truth file: every CP2 and CP4 value the build wrote, from the key as it is now (C1 fix report, note 5).
    for (const c of rec.checkpoints) {
      if (c.truth_key === undefined) continue;
      if (store.checkpointTruth?.(c.truth_key) === undefined) { why.push(`${c.truth_key} has no value in the truth file: run npm run build:data, and check the key's truth query`); continue; }
      const query = key?.truths[c.kind as 'CP2' | 'CP4'];
      if (typeof query === 'string' && store.checkpointTruthHash?.(c.truth_key) !== truthSourceHash(schema, query)) {
        why.push(`the truth for ${c.truth_key} is stale: its key or the case's schema changed since the last build. Run npm run build:data`);
      }
    }
    // B2-M4 and S4C-05: each truth query parsed by the gate and run on the visible and the edge data.
    if (options.db && key) {
      const edge = item && typeof item.edge_schema === 'string' ? item.edge_schema : null;
      for (const c of rec.checkpoints) {
        const query = c.truth_key === undefined ? undefined : key.truths[c.kind as 'CP2' | 'CP4'];
        if (typeof query !== 'string') continue;
        const p = await truthQueryProblems(options.db, c.kind, c.truth_key!, query, schema, edge, store.checkpointTruth?.(c.truth_key!));
        why.push(...p.fails);
        warns.push(...p.warns);
      }
    }
    // P16: only warnings (a missing value on the edge data) is a WARN; any failure is a FAIL, with the warnings after it.
    out.push(why.length === 0 && warns.length > 0 ? { id, check: 'C41', ok: false, warn: true, detail: warns.join('; ') }
      : { id, check: 'C41', ok: why.length === 0, detail: [...why, ...warns].join('; ') });
  }
  // A key file named after no case is a key nobody grades with (the store finds a key by its file's name).
  const ids = new Set(all.map((r) => (typeof r?.case_id === 'string' ? r.case_id : '')));
  for (const name of store.caseKeyIds?.() ?? []) {
    if (!ids.has(name)) out.push({ id: `keys/cases/${name}.json`, check: 'C41', ok: false, detail: 'a case key with no case of its name in content/sql/openers/ or content/sql/cases/' });
  }
  return out;
}

// ---- sprint 6 (Task B3): C47 raw data, C48 level 4 traps, C49 the level 4 drill and the cumulative entry, C50 case solves --------

/** S6-01: the raw schema, its clean edge schema, and the clean schema a raw key must give another result on. */
export const RAW_SCHEMA = 'voltmarkt_raw';
export const RAW_EDGE_SCHEMA = 'voltmarkt_edge_clean';
const CLEAN_SCHEMA = 'voltmarkt';
/** `voltmarkt_raw.` with or without quotes, in key text with its strings and comments masked. */
const NAMES_RAW = /(?:\bvoltmarkt_raw|"voltmarkt_raw")\s*\./i;
/** Any Voltmarkt schema written before a dot: a qualified name in a partial query the gate cannot read (hint 3). */
const NAMES_SCHEMA = /(?:\bvoltmarkt[a-z0-9_]*|"voltmarkt[a-z0-9_]*")\s*\./i;

/** S6-01: an item reads raw data when it says so (`uses_raw`), names the raw schema, or names the raw data's edge schema. */
const isRawItem = (item: SqlItem): boolean =>
  (item as { uses_raw?: unknown }).uses_raw === true || item.schema === RAW_SCHEMA || item.edge_schema === RAW_EDGE_SCHEMA;

/** Whether a complete query names a schema, by the gate's parse on the raw schema (it lists a qualified table with its schema). */
async function namesSchema(runner: RunnerClient, sql: string): Promise<boolean> {
  const g = await runner.request<GateOk>({ op: 'gate', schema: RAW_SCHEMA, allowedSchemas: [], sql });
  if (!g.ok) return g.error.kind === 'gate' && g.error.reason === 'qualified_schema';
  return g.data.tables.some((t) => t.schema !== null);
}

/**
 * C47 (S6-01, Review Focus 2) for one item: a raw-data item is on `voltmarkt_raw` with the edge schema `voltmarkt_edge_clean`, its
 * key names no schema (graded runs swap unqualified names only), and its reference gives another result on the clean `voltmarkt`
 * than on `voltmarkt_raw` (the quirk is what it finds). A clean item's key, hint 3 included, reads no raw table. Returns the
 * problems, naming the key's parts, never their text.
 */
export async function rawDataProblems(item: SqlItem, key: SqlKey, runner: RunnerClient): Promise<string[]> {
  const complete: [string, string][] = [['the reference', key.reference_sql],
    ...(Array.isArray(key.alternatives) ? key.alternatives : []).map((s, i): [string, string] => [`alternative ${i + 1}`, s]),
    ...(typeof key.other_way?.sql === 'string' ? [['the other way', key.other_way.sql] as [string, string]] : [])];
  const all: [string, string][] = [...complete, ...(typeof key.hint3_partial === 'string' ? [['hint 3', key.hint3_partial] as [string, string]] : [])];
  if (!isRawItem(item)) {
    return all.filter(([, sql]) => typeof sql === 'string' && NAMES_RAW.test(maskSql(sql)))
      .map(([label]) => `${label} reads a raw table (voltmarkt_raw.): a clean item reads its own schema only (S6-01)`);
  }
  const out: string[] = [];
  if (item.schema !== RAW_SCHEMA) out.push('a raw-data item has the schema voltmarkt_raw');
  if (item.edge_schema !== RAW_EDGE_SCHEMA) out.push('a raw-data item has the edge schema voltmarkt_edge_clean');
  for (const [label, sql] of complete) if (typeof sql === 'string' && (await namesSchema(runner, sql))) out.push(`${label} names a schema: a raw-data key reads its tables by name only (S6-01)`);
  if (typeof key.hint3_partial === 'string' && NAMES_SCHEMA.test(maskSql(key.hint3_partial))) out.push('hint 3 names a schema: a raw-data key reads its tables by name only (S6-01)');
  const timeout = item.rules?.timeout_ms ?? 5000;
  const [clean, raw] = [await rowBag(runner, CLEAN_SCHEMA, key.reference_sql, timeout), await rowBag(runner, RAW_SCHEMA, key.reference_sql, timeout)];
  if (clean !== null && raw !== null && clean === raw) out.push('the key gives the same result on voltmarkt as on voltmarkt_raw, so it finds no quirk (Review Focus 2)');
  return out;
}

/**
 * C47 (S6-01, S6-14, Review Focus 2) for every case, one result each, named by case ID. A case on raw data (`uses_raw`, or the schema
 * `voltmarkt_raw`) has both; its CP3 item is on `voltmarkt_raw` with the edge schema `voltmarkt_edge_clean` and its key finds the
 * quirk (another result on the clean `voltmarkt`); no truth query names a schema. A clean case passes. A record that does not
 * validate is C41's.
 */
export async function checkRawCases(store: ContentStore, runner: RunnerClient): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const [n, rec] of (store.cases?.() ?? []).entries()) {
    const id = typeof rec?.case_id === 'string' ? rec.case_id : `case file #${n + 1}`;
    if (validateCaseRecord(rec).length) { out.push({ id, check: 'C47', ok: false, detail: 'the record is not valid; see C41' }); continue; }
    const raw = rec.uses_raw === true || caseSchema(rec) === RAW_SCHEMA;
    const why: string[] = [];
    if (raw) {
      if (rec.uses_raw !== true) why.push('a case on voltmarkt_raw has uses_raw true');
      if (caseSchema(rec) !== RAW_SCHEMA) why.push('a case with uses_raw has the schema voltmarkt_raw');
      const cp3 = rec.checkpoints.find((c) => c.kind === 'CP3')!.item_id!;
      const item = store.item(cp3);
      const key = store.key(cp3);
      if (item) {
        if (item.schema !== RAW_SCHEMA) why.push(`${cp3} has the schema voltmarkt_raw`);
        if (item.edge_schema !== RAW_EDGE_SCHEMA) why.push(`${cp3} has the edge schema voltmarkt_edge_clean`);
      }
      if (item && key) {
        const timeout = item.rules?.timeout_ms ?? 5000;
        const [clean, dirty] = [await rowBag(runner, CLEAN_SCHEMA, key.reference_sql, timeout), await rowBag(runner, RAW_SCHEMA, key.reference_sql, timeout)];
        if (clean !== null && dirty !== null && clean === dirty) why.push(`${cp3}'s key gives the same result on voltmarkt as on voltmarkt_raw, so it finds no quirk (Review Focus 2)`);
      }
      const caseKey = store.caseKey?.(rec.case_id);
      const truths = caseKey && validateCaseKey(caseKey).length === 0 ? caseKey.truths : {};
      for (const k of CASE_TRUTHS) {
        const q = truths[k];
        if (typeof q === 'string' && (await namesSchema(runner, q))) why.push(`the truth query for ${k} names a schema: it reads its tables by name only (S6-01)`);
      }
    }
    out.push({ id, check: 'C47', ok: why.length === 0, detail: why.join('; ') });
  }
  return out;
}

/**
 * C48 (S6-11, ruling P3): the must-have traps of each level 4 concept, as the generator brief's level 4 table lists them. Task B2
 * writes the same table into docs/content/generator-brief.md; this is the check's own copy.
 */
export const LEVEL4_TRAPS: Readonly<Record<string, readonly string[]>> = {
  'SQL-SUBQ-01': ['ERR-SEM-05', 'ERR-LOG-30', 'ERR-LOG-31'],
  'SQL-SUBQ-02': ['ERR-LOG-07', 'ERR-LOG-20'],
  'SQL-STR-01': ['ERR-LOG-32', 'ERR-LOG-33'],
  'SQL-DATE-02': ['ERR-LOG-34', 'ERR-LOG-06'],
  'SQL-CLEAN-01': ['ERR-LOG-35', 'ERR-LOG-36', 'ERR-LOG-05'],
};

/**
 * C48: every must-have trap of a level 4 concept is planted in at least one active pool item or fix item of that concept: a planted
 * wrong query in its key, or a fix item's starter. One result per concept, named by concept ID; the detail names the traps missing.
 */
export function checkLevel4Traps(items: readonly SqlItem[], keyOf: (id: string) => SqlKey | undefined): CheckResult[] {
  return Object.entries(LEVEL4_TRAPS).map(([concept, traps]) => {
    const planted = new Set<string>();
    for (const i of items) {
      if (i?.target_concept_id !== concept || i.status !== 'active' || (i.use !== 'pool' && i.kind !== 'fix')) continue;
      const plants = keyOf(i.id)?.planted_wrong;
      for (const p of Array.isArray(plants) ? plants : []) if (typeof p?.error_id === 'string') planted.add(p.error_id);
      if (i.kind === 'fix' && typeof i.starter_error_id === 'string') planted.add(i.starter_error_id);
    }
    const missing = traps.filter((t) => !planted.has(t));
    return { id: concept, check: 'C48', ok: missing.length === 0, detail: missing.length ? `${missing.join(', ')} planted in no pool or fix item of ${concept}` : '' };
  });
}

/** S6-19 and the generator brief: the level 4 drill pool holds this many drill items across the level's concepts. */
export const LEVEL4_DRILL_POOL = 30;
/** What a drill serves: an active blank-editor or fix-this-query item with use drill (as server/drill.ts draws it). */
const drillServable = (i: SqlItem | undefined): i is SqlItem => i !== undefined && i.use === 'drill' && i.status === 'active' && (i.kind === 'write' || i.kind === 'fix');

/**
 * C49 (S6-19): the level 4 drill entry's pool holds at least 30 drill items of the level 4 concepts, each concept at least one (one
 * result, `drill-L4`); and each cumulative entry draws from levels whose pools are not empty, asking `per_level` no more than any of
 * them can serve with `unseen_min_pct` of it unseen: a pool of n serves at most n / (unseen_min_pct / 100) (one result per entry,
 * named by its ID). Pools are counted, never listed.
 */
export function checkLevel4Drills(file: DrillFile, items: readonly SqlItem[], curriculum: Curriculum): CheckResult[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const poolOf = (level: number): SqlItem[] | null => {
    const spec = file.levels.find((d) => d.level === level);
    return spec ? [...new Set(spec.pool_item_ids)].map((id) => byId.get(id)).filter(drillServable) : null;
  };
  const out: CheckResult[] = [];
  const level4 = curriculum.concepts.filter((c) => c.level === 4).map((c) => c.id);
  const why4: string[] = [];
  const pool4 = poolOf(4);
  if (pool4 === null) why4.push('content/sql/drills.json has no level 4 entry: Task C1 writes it with its pool');
  else {
    const mine = pool4.filter((i) => level4.includes(i.target_concept_id));
    if (mine.length < LEVEL4_DRILL_POOL) why4.push(`the level 4 pool holds ${mine.length} drill items; it needs ${LEVEL4_DRILL_POOL}`);
    const bare = level4.filter((c) => !mine.some((i) => i.target_concept_id === c));
    if (bare.length) why4.push(`no drill item for ${bare.join(', ')}`);
  }
  out.push({ id: 'drill-L4', check: 'C49', ok: why4.length === 0, detail: why4.join('; ') });
  if (!file.cumulative.length) out.push({ id: 'sql/drills.json', check: 'C49', ok: false, detail: 'there is no cumulative drill entry (S6-19)' });
  for (const c of file.cumulative) {
    const why: string[] = [];
    for (const level of c.levels) {
      const pool = poolOf(level);
      if (!pool?.length) { why.push(`level ${level} has no drill pool`); continue; }
      const serves = c.unseen_min_pct > 0 ? Math.floor((pool.length * 100) / c.unseen_min_pct) : Infinity;
      if (c.per_level > serves) why.push(`per_level is ${c.per_level}, but level ${level}'s pool of ${pool.length} serves at most ${serves} with ${c.unseen_min_pct}% unseen`);
    }
    out.push({ id: c.id, check: 'C49', ok: why.length === 0, detail: why.join('; ') });
  }
  return out;
}

/**
 * C19 for a cumulative drill entry (S6-19, ruling P12), by its own shape, which server/drill.ts parseDrillFile has read: every level it
 * names has concepts in the curriculum, and per_level, minutes and pass_pct are above 0. Its pools are C49's. One result per entry.
 */
export function checkCumulativeDrills(file: DrillFile, curriculum: Curriculum): CheckResult[] {
  const levels = new Set(curriculum.concepts.map((c) => c.level));
  return file.cumulative.map((c) => {
    const why = c.levels.filter((l) => !levels.has(l)).map((l) => `level ${l} has no concept in the curriculum`);
    if (!(c.per_level >= 1)) why.push('per_level must be 1 or more');
    if (!(c.minutes > 0)) why.push('minutes must be above 0');
    if (!(c.pass_pct > 0)) why.push('pass_pct must be above 0');
    return { id: c.id, check: 'C19', ok: why.length === 0, detail: why.join('; ') };
  });
}

/**
 * C50 (the backlog's B2-M6): every CP1, CP2, CP4 and CP5 a case lists has a blind-solve record in its key that passed, for the
 * checkpoint as it is now (casePromptHash: its prompt, options or typed spec, and the case's title, brief and schema). One result per
 * case, named by case ID; the detail names checkpoints, never an answer. A record that does not validate is C41's.
 * A case on a schema the build did not hold (S6-13, Review Focus 3) has no built CP2 or CP4 value to compare: once every record is
 * there and current, it is skipped with a warning naming those checkpoints, as C41 skips the case.
 */
export function checkCaseSolvers(store: ContentStore): CheckResult[] {
  return (store.cases?.() ?? []).map((rec, n) => {
    const id = typeof rec?.case_id === 'string' ? rec.case_id : `case file #${n + 1}`;
    if (validateCaseRecord(rec).length) return { id, check: 'C50', ok: false, detail: 'the record is not valid; see C41' };
    const key = store.caseKey?.(rec.case_id);
    const records = key && validateCaseKey(key).length === 0 ? key.solver ?? {} : {};
    const absent = caseUnavailable(store, rec) !== null;
    const waiting: string[] = [];
    const why: string[] = [];
    for (const cp of rec.checkpoints) {
      if (!(SOLVED_KINDS as readonly string[]).includes(cp.kind)) continue;
      const r = records[cp.kind as SolvedKind];
      if (!r) why.push(`${cp.kind} has no solver record: blind-solve it (npm run export:case-view, then npm run record:case-solver)`);
      else if (r.prompt_hash !== casePromptHash(rec, cp)) why.push(`${cp.kind}: the prompt or the brief changed since the solver record: blind-solve it again`);
      else if (r.key_hash === undefined) why.push(`${cp.kind}: recorded before answer fingerprints (F32): blind-solve it again`);
      else {
        const truth = cp.truth_key ? store.checkpointTruth?.(cp.truth_key) : undefined;
        const now = key && validateCaseKey(key).length === 0 ? caseKeyHash(cp.kind as SolvedKind, key, truth) : null;
        if (now === null && absent && (cp.kind === 'CP2' || cp.kind === 'CP4')) waiting.push(cp.kind);
        else if (now === null) why.push(`${cp.kind}: ${cp.kind === 'CP2' || cp.kind === 'CP4' ? 'no value built: run npm run build:data' : 'the key has no correct option; see C41'}`);
        else if (r.key_hash !== now) why.push(`${cp.kind}: the answer key or its built value changed since the solver record: blind-solve it again`);
        else if (!r.pass) why.push(`${cp.kind}: the blind solver's answer did not pass; read the prompt as ambiguous first`);
      }
    }
    if (why.length === 0 && waiting.length > 0) {
      return { id, check: 'C50', ok: false, warn: true,
        detail: `${waiting.join(', ')}: skipped: the database has no schema ${caseSchema(rec)}, so their values wait until its dataset is prepared` };
    }
    return { id, check: 'C50', ok: why.length === 0, detail: why.join('; ') };
  });
}

// ---- sprint 6, F2 seams fix round: C52, the schema panel's tables on the edge schema ------------------------------------------
// C51 is Part 2's (the plan: the dataset registry), so this check takes C52.

/** C52's facts about one edge schema. */
export interface EdgeFacts {
  /** Its tables and views, lower case; null when they cannot be read. */
  tables: ReadonlySet<string> | null;
  /** How many of its promotions have a day its calendar lacks; null when it holds no calendar or no promotions; 'unreadable' when the count failed. */
  promotionsShort: number | null | 'unreadable';
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * C52 (the F2 seams review's C1, C2 and M5): every table the schema panel shows an active write or fix item at its level (its
 * schema's notes, notesForLevel, as the panel and autocomplete pick them) is in the item's edge schema, so a correct answer that
 * reads it gets no engine error on the hidden run. One result per edge schema, named by schema, in name order, and each problem
 * fails: S6-36 (sprint 6, Task K3) removed the WARN tier once K5 gave the ten edge schemas built before sprint 6 every table their
 * panel shows and every promotion day, so no edge schema is exempt:
 * - a table it lacks fails, naming the table, how many items the panel shows it to and the first of them;
 * - a calendar that lacks a day of one of the schema's own promotions fails, when the panel shows calendar and promotions (C2:
 *   promotion days counted through the calendar come out short there);
 * - a schema that is not in the database, or whose tables, or calendar against its promotions, cannot be read fails.
 * Choice items are never graded on the edge schema, so they are left out. A detail names schemas, tables, counts and item IDs only.
 */
export function checkEdgePanels(items: readonly SqlItem[], notes: readonly TableNote[], facts: (edge: string) => EdgeFacts | undefined): CheckResult[] {
  const byEdge = new Map<string, Map<string, string[]>>();   // edge schema -> table the panel shows -> the items it shows it to
  for (const item of items) {
    if (item?.status !== 'active' || isSqlChoiceKind(item.kind) || typeof item.edge_schema !== 'string' || typeof item.schema !== 'string') continue;
    const shown = byEdge.get(item.edge_schema) ?? new Map<string, string[]>();
    for (const n of notesForLevel(notes.filter((x) => x.schema === item.schema), item.level)) shown.set(n.table, [...(shown.get(n.table) ?? []), item.id]);
    byEdge.set(item.edge_schema, shown);
  }
  return [...byEdge.keys()].sort().map((edge): CheckResult => {
    const shown = byEdge.get(edge)!;
    const f = facts(edge);
    const fails: string[] = [];
    if (!f?.tables) fails.push(`the tables of ${edge} could not be read`);
    else if (f.tables.size === 0) fails.push(`${edge} holds no table: it is not in the database`);
    else {
      fails.push(...[...shown].sort(([a], [b]) => a.localeCompare(b)).filter(([table]) => !f.tables!.has(table))
        .map(([table, ids]) => `${edge} lacks ${table}, which the schema panel shows to ${plural(ids.length, 'item', 'items')} at their level (first ${[...ids].sort()[0]})`));
    }
    if (shown.has('calendar') && shown.has('promotions')) {
      if (f?.promotionsShort === 'unreadable') fails.push(`the calendar of ${edge} could not be compared with its promotions`);
      else if (typeof f?.promotionsShort === 'number' && f.promotionsShort > 0) {
        fails.push(`${plural(f.promotionsShort, 'promotion', 'promotions')} in ${edge} ${f.promotionsShort === 1 ? 'has' : 'have'} days its calendar lacks, so promotion days counted through the calendar come out short there`);
      }
    }
    return { id: edge, check: 'C52', ok: fails.length === 0, detail: fails.join('; ') };
  });
}

/** C52's facts about one edge schema, read through the runner: its tables (tablesIn), then, when it holds both, how many of its promotions have a day its calendar lacks. */
export async function edgeFacts(runner: RunnerClient, edge: string): Promise<EdgeFacts> {
  const tables = await tablesIn(runner, edge);       // null for a name that is not a plain schema name, so `edge` below is one
  if (!tables || !tables.has('calendar') || !tables.has('promotions')) return { tables, promotionsShort: null };
  const r = await runner.request<RowsOk>({ op: 'app_query', sql: `SELECT count(*) FROM ${edge}.promotions p
    WHERE (SELECT count(*) FROM ${edge}.calendar c WHERE c.cal_date BETWEEN p.start_date AND p.end_date) <> date_diff('day', p.start_date, p.end_date) + 1` });
  const n = r.ok ? Number(r.data.rows[0]?.[0]) : Number.NaN;
  return { tables, promotionsShort: Number.isInteger(n) ? n : 'unreadable' };
}

/** C52 on the database the runner reads: the facts of each edge schema an active write or fix item names, then checkEdgePanels. */
export async function checkEdgePanelsOnDb(items: readonly SqlItem[], notes: readonly TableNote[], runner: RunnerClient): Promise<CheckResult[]> {
  const facts = new Map<string, EdgeFacts>();
  for (const item of items) {
    const edge = item?.edge_schema;
    if (item?.status === 'active' && !isSqlChoiceKind(item.kind) && typeof edge === 'string' && !facts.has(edge)) facts.set(edge, await edgeFacts(runner, edge));
  }
  return checkEdgePanels(items, notes, (edge) => facts.get(edge));
}

// ---- sprint 6 Part 2 (Task G2): C51, the dataset registry --------------------------------------------------------------------

/** P35: a real dataset has no questions until H2 writes them, then at least this many (E-064). */
export const REAL_DATASET_QUESTIONS = 5;

/**
 * C51 (S6-21, ruling P35): the dataset registry (content/datasets/registry.json, as loaded) and the cases that read its data.
 * One result per registry record, named by its ID (`registry record #n` when it has none):
 * - the record passes validateDataset (its shape, its label and licence, no question with a relative date);
 * - its prep script exists (`exists` takes a path from the project root);
 * - no other record has its ID, holds its alias as an ID or alias, or claimed its schema first;
 * - a real dataset has no questions yet or at least 5 (P35: 1 to 4 fail).
 * And one result per case that is real (`data_source.real`) or reads a registry schema, named by case ID: a real case reads a schema
 * of a real registry dataset, and a case on a registry schema agrees with its record on `real` and, when real, on the licence. Any
 * other case is not C51's. A detail names IDs, schemas, fields and file paths only.
 */
export function checkDatasets(store: ContentStore, exists: (path: string) => boolean): CheckResult[] {
  const records = store.datasetRecords?.() ?? [];
  const out: CheckResult[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const idOf = (r: unknown, n: number): string => (isObj(r) && typeof r.id === 'string' && r.id !== '' ? r.id : `registry record #${n + 1}`);
  const idCount = new Map<string, number>();
  for (const r of records) if (isObj(r) && typeof r.id === 'string') idCount.set(r.id, (idCount.get(r.id) ?? 0) + 1);
  const schemaOwner = new Map<string, string>();      // the first record to name each schema
  const valid: DatasetRecord[] = [];
  records.forEach((r, n) => {
    const id = idOf(r, n);
    const shape = validateDataset(r);
    const why = [...shape];
    if (isObj(r)) {
      if ((idCount.get(id) ?? 0) > 1) why.push(`the ID ${id} is used by ${idCount.get(id)} records`);
      for (const a of Array.isArray(r.aliases) ? r.aliases : []) {
        const elsewhere = records.some((o, m) => m !== n && isObj(o) && (o.id === a || (Array.isArray(o.aliases) && o.aliases.includes(a))));
        if (elsewhere) why.push(`the alias ${String(a)} is another record's ID or alias`);
      }
      for (const s of Array.isArray(r.schemas) ? r.schemas : []) {
        const name = isObj(s) && typeof s.name === 'string' ? s.name : null;
        if (name === null) continue;
        const owner = schemaOwner.get(name);
        if (owner !== undefined && owner !== id) why.push(`the schema ${name} is also ${owner}'s`);
        else schemaOwner.set(name, id);
      }
      if (typeof r.prep === 'string' && !exists(r.prep)) why.push(`the prep script ${r.prep} does not exist`);
      const asked = Array.isArray(r.questions) ? r.questions.length : 0;
      if (r.real === true && asked > 0 && asked < REAL_DATASET_QUESTIONS) {
        why.push(`a real dataset needs at least ${REAL_DATASET_QUESTIONS} questions (it has ${asked}), or none until they are written`);
      }
    }
    if (shape.length === 0) valid.push(r as DatasetRecord);
    out.push({ id, check: 'C51', ok: why.length === 0, detail: why.join('; ') });
  });
  const bySchema = (schema: string) => valid.find((d) => d.schemas.some((s) => s.name === schema));
  for (const rec of store.cases?.() ?? []) {
    if (!isObj(rec) || typeof rec.case_id !== 'string') continue;   // C41 names a record with no case ID
    const source = isObj(rec.data_source) ? rec.data_source : null;
    const schema = caseSchema(rec);
    const dataset = bySchema(schema);
    const real = source?.real === true;
    if (!real && !dataset) continue;
    const why: string[] = [];
    if (real && !dataset) why.push(`a real-data case must read a schema of a real registry dataset: ${schema} is in none`);
    else if (dataset && real && !dataset.real) why.push(`${schema} is ${dataset.id}'s, which the registry marks fictional: a real-data case needs real data`);
    else if (dataset && !real && dataset.real) why.push(`${rec.case_id} reads ${schema}, ${dataset.id}'s schema, so data_source.real must be true`);
    else if (dataset && real && source?.licence !== dataset.licence.name) {
      why.push(`data_source.licence must be ${dataset.licence.name}, ${dataset.id}'s licence in the registry`);
    }
    out.push({ id: rec.case_id, check: 'C51', ok: why.length === 0, detail: why.join('; ') });
  }
  return out;
}

/**
 * The backlog row "Case build and inbox details" (S6-13): an item whose schema belongs to a registry dataset the database does not
 * hold waits for its dataset to be prepared, as its case does (C41). It is skipped by name with a warning, and the item checks do
 * not run on it. An item on any other missing schema is not skipped, so a misspelt schema still fails. With no schema list (the
 * query failed, and C41 fails once for it) nothing is skipped.
 */
export function unbuiltItems(items: readonly SqlItem[], schemas: ReadonlySet<string> | null, store: Pick<ContentStore, 'datasetOfSchema'>): CheckResult[] {
  if (schemas === null) return [];
  const out: CheckResult[] = [];
  for (const item of items) {
    if (typeof item?.schema !== 'string' || schemas.has(item.schema)) continue;
    const dataset = store.datasetOfSchema?.(item.schema);
    if (!dataset) continue;
    out.push({ id: item.id, check: 'C51', ok: false, warn: true,
      detail: `skipped: the database has no schema ${item.schema}, so the item waits until ${dataset.id} is prepared (npm run prep:datasets)` });
  }
  return out;
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

// ---- the GA4 labs (sprint 5b Task B1): C42 to C45 ---------------------------------------------------------------------

/** C45: the most words the lab guide's body may have, as a reading's (design §4, READING_MAX_WORDS). */
export const LAB_GUIDE_MAX_WORDS = 550;
export const LAB_CHECK_IDS = ['C42', 'C43', 'C44', 'C45'] as const;

/**
 * C42 to C45 (sprint 5b, Task B1; D67, D69, design §8 and §12): the GA4 labs, their keys and their guide. One result per lab for
 * each check, named by lab ID and in ID order; one C45 result for the guide, named by its file; one C43 result per key file with
 * no lab of its name. With no lab and no guide there is nothing to check. A detail names lab and part IDs, fields, versions and
 * counts: never a key's answer or a solver's answer.
 * - C42: the lab is valid (the loader refuses one that is not, so this only re-checks), its concept_id is a GA4 concept and its
 *   topic_id that concept's topic.
 * - C43: its key file exists and fits it (validateLabKey): every structural part keyed and no other part, a choice key one of the
 *   part's options, a multi key some of them.
 * - C44: every structural part has a solver record that passed, for the lab's current version (the key's lab_version and each record's lab_version equal the
 *   lab's version), and its recorded answer still matches the key (replayed, as C26 replays a choice record). It reads only a key
 *   that passed C43 (Codex F22's lesson). A lab with no structural part passes.
 * - C45: the guide exists once there is a lab, has at most 550 words and no em dash; every lab's source_ids name a source.
 * `root` is the content root, read only for the names of the key files.
 */
export async function checkLabs(store: ContentStore, root: string): Promise<CheckResult[]> {
  const labs = store.labs?.() ?? [];
  const guide = store.labGuide?.();
  const out: CheckResult[] = [];
  const add = (check: string, id: string, why: string[]) => out.push({ id, check, ok: why.length === 0, detail: why.join('; ') });
  const concepts = new Map((store.choiceConcepts?.('ga4') ?? []).map((c) => [c.id, c]));
  const idOf = (lab: Lab): string => (typeof lab?.id === 'string' ? lab.id : '(a lab with no ID)');
  const valid = new Set<Lab>();
  for (const lab of labs) {
    const why = validateLab(lab);
    if (!why.length) {
      valid.add(lab);
      const concept = concepts.get(lab.concept_id);
      if (!concept) why.push(`its concept_id ${lab.concept_id} is not a GA4 concept`);
      else if (lab.topic_id !== concept.topic_id) why.push(`its topic_id must be ${concept.topic_id}, the topic of ${lab.concept_id}`);
    }
    add('C42', idOf(lab), why);
  }
  const keys = new Map<Lab, LabKey>();
  for (const lab of labs) {
    if (!valid.has(lab)) { add('C43', idOf(lab), ['the lab is not valid; see C42']); continue; }
    const key = store.labKey?.(lab.id);
    const why = key === undefined ? [`content/${LAB_KEY_DIR}/${lab.id}.json is missing`] : validateLabKey(key, lab);
    if (key !== undefined && !why.length) keys.set(lab, key);
    add('C43', lab.id, why);
  }
  let keyFiles: string[] = [];
  try { keyFiles = (await readdir(join(root, LAB_KEY_DIR))).filter((n) => n.endsWith('.json')).sort(); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  for (const n of keyFiles) if (!labs.some((l) => `${idOf(l)}.json` === n)) add('C43', `${LAB_KEY_DIR}/${n}`, ['a key file with no lab of its name in content/ga4/labs/']);
  for (const lab of labs) {
    if (!valid.has(lab)) { add('C44', idOf(lab), ['the lab is not valid; see C42']); continue; }
    const structural = lab.parts.filter((p) => p.check === 'structural');
    const key = keys.get(lab);
    const why: string[] = [];
    if (!structural.length) { add('C44', lab.id, why); continue; }
    if (!key) why.push('the key is missing or not valid; see C43');
    else if (key.lab_version !== lab.version) {
      why.push(`the key is for version ${key.lab_version} of ${lab.id}, the lab is version ${lab.version}: update the key, then blind-solve its structural parts again`);
    } else {
      for (const p of structural) {
        const rec = key.solver?.[p.id];
        if (!rec) why.push(`${p.id} has no solver record: blind-solve it (npm run export:lab-view, then npm run record:lab-solver)`);
        else if (rec.lab_version !== lab.version) why.push(`${lab.id} ${p.id}: the blind-solve was made on version ${rec.lab_version}, the lab is version ${lab.version}: blind-solve it again`);
        else if (!rec.pass) why.push(`${p.id}: the blind solver's answer did not match the key; read the question as ambiguous first`);
        else if (!sameStructuralAnswer(p, rec.answer, key.structural[p.id]!)) why.push(`${p.id}: the solver's recorded answer no longer matches the key`);
      }
    }
    add('C44', lab.id, why);
  }
  if (labs.length || guide) {
    const why: string[] = [];
    if (!guide) why.push(`the labs need their guide, content/${LAB_GUIDE_FILE}`);
    else {
      const n = readingWords(guide.body_md);
      if (n > LAB_GUIDE_MAX_WORDS) why.push(`the guide has ${n} words; at most ${LAB_GUIDE_MAX_WORDS}`);
      if (JSON.stringify(guide).includes(EM_DASH)) why.push('the guide holds an em dash; use a comma, a colon or a full stop');
    }
    add('C45', LAB_GUIDE_FILE, why);
  }
  for (const lab of labs) {
    const named = Array.isArray(lab?.source_ids) && lab.source_ids.length > 0 && lab.source_ids.every((s) => typeof s === 'string' && s.trim() !== '');
    add('C45', idOf(lab), named ? [] : ['source_ids must name at least one source (the numbered sources of 07 or 10 it uses, E-136)']);
  }
  return out;
}

/**
 * C46 (sprint 5b, Task B4 fix; ruling 8): the full mock of the entry in force on `today` (the latest entry dated on or before it, or
 * the first when all are later) and of every later-dated entry asks no more questions than the held-out pool, the active, core,
 * keyed GA4 items held out (routes/run.ts poolOf draws from the same set). An older entry only scores older runs, so it is not
 * checked; a later entry is, so a future one cannot hide a pool too short for it. One result; none when there is no
 * content/ga4/exam.json. The detail names each failing entry by its `from` date and gives counts only.
 */
export function checkFullMockPool(store: ContentStore, today: string = amsterdamDate(new Date())): CheckResult[] {
  const cfg = store.ga4Exam?.();
  if (!cfg) return [];
  const pool = (store.choiceItems?.('ga4') ?? []).filter((i) => i.section === 'ga4' && (store.heldOut?.(i.id) ?? false) && i.status === 'active'
    && i.exam_relevance === 'core' && store.choiceKey?.(i.id) !== undefined).length;
  const inForce = Math.max(0, cfg.dated.findLastIndex((d) => d.from <= today));
  const why = cfg.dated.slice(inForce).filter((d) => d.full_mock.questions > pool)
    .map((d) => `the full mock from ${d.from} asks ${d.full_mock.questions} questions, more than the ${pool} of the held-out pool (active core GA4 items held out, with a key)`);
  return [{ id: 'ga4/exam.json', check: 'C46', ok: why.length === 0, detail: why.join('; ') }];
}

/** The line check:content prints for the lab checks, or null when there are none. */
export function labTallyLine(results: readonly CheckResult[]): string | null {
  const parts = LAB_CHECK_IDS.map((c) => { const rs = results.filter((r) => r.check === c); return rs.length ? `${c} ${rs.filter((r) => r.ok).length}/${rs.length}` : ''; }).filter(Boolean);
  return parts.length ? `lab checks (passed / total): ${parts.join(', ')}` : null;
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
export async function loadContentForCli(root: string, options: LoadOptions = {}): Promise<ContentStore | null> {
  try { return await loadContent(root, options); } catch (e) {
    // Sprint 5b: a lab or the lab guide that parsed but failed its validator. Its problems name fields and part IDs only.
    if (e instanceof ContentFileError) {
      console.error(`cannot load content: ${e.file} is not valid: ${e.problems.join('; ')}`);
      process.exitCode = 1;
      return null;
    }
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
  // C41 reads every CP2 and CP4 value from the truth file the build wrote (S6-13: checkpoints.json, or an older build's voltmarkt.json),
  // beside the database the item checks run on.
  const store = await loadContentForCli(root, { checkpointsFile: at('data/truth/checkpoints.json'), truthFile: at('data/truth/voltmarkt.json') });
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
  // Every case's CP3 item is an SQL item the item checks run on (the other checkpoints' item IDs name no item file).
  for (const o of (store.cases?.() ?? store.openers?.() ?? [])) for (const c of Array.isArray(o?.checkpoints) ? o.checkpoints : []) if (typeof c?.item_id === 'string' && store.item(c.item_id)) ids.push(c.item_id);
  results.push(...checkOpeners(store));
  results.push(...checkCaseSolvers(store));
  // C51: the dataset registry, its prep scripts (paths from the project root) and the cases on its data.
  results.push(...checkDatasets(store, (p) => existsSync(at(p))));
  results.push(...checkReadings(store));
  results.push(...(await checkLabs(store, root)));
  results.push(...checkFullMockPool(store));
  // C19 and C49 read content/sql/drills.json through the app's own parser (server/drill.ts, which knows the cumulative entry's shape,
  // P12); a missing file means no drills yet, one the parser refuses is one failure, named by its message (fields, never content).
  const allItems = files.ids.map((i) => store.item(i)).filter((i): i is SqlItem => !!i);
  let drillFile: DrillFile | null = null;
  try { drillFile = parseDrillFile(JSON.parse(await readFile(join(root, 'sql/drills.json'), 'utf8'))); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      const why = e instanceof SyntaxError ? 'not valid JSON' : e instanceof Error ? e.message.replace(/^content\/sql\/drills\.json: /, '') : 'it could not be read';
      results.push({ id: 'sql/drills.json', check: 'C19', ok: false, detail: why });
    }
  }
  if (drillFile) {
    results.push(...checkDrillPools(drillFile.levels, allItems), ...checkCumulativeDrills(drillFile, store.curriculum));
    results.push(...checkLevel4Drills(drillFile, allItems, store.curriculum));
  }
  // C48: the level 4 traps, on every SQL item and its key.
  results.push(...checkLevel4Traps(allItems, (id) => store.key(id)));
  for (const n of files.unreadable) results.push({ id: `sql/items/${n}`, check: 'C01', ok: false, detail: 'not valid JSON, or has no id' });
  const active = [...new Set(ids)].filter((id) => store.item(id)?.status === 'active');
  const hasCases = (store.cases?.() ?? []).length > 0;
  if (active.length || hasCases) {
    // The runner and the built data are needed only when there is an item or a case to check.
    const manifest = JSON.parse(await readFile(at('data/manifest.json'), 'utf8'));
    const constructs = JSON.parse(await readFile(join(root, 'sql/constructs.json'), 'utf8'));
    const runner = await startRunner(at('data/course.duckdb'));
    const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
      datasetVersion: manifest.dataset_version, constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
    try {
      // C41 with the database: each truth query parsed and run on its case's schema and edge schema (S4C-05); a case whose schema
      // the database does not hold is skipped by name (S6-13). C47 for the cases on raw data.
      results.push(...(await checkCasesOnDb(store, runner)));
      results.push(...(await checkRawCases(store, runner)));
      // C51 (the backlog row "Case build and inbox details"): an item on a registry dataset that is not prepared is skipped by name, as
      // C41 skips its case; the checks below run on the rest.
      const skips = unbuiltItems(active.map((id) => store.item(id)!), await schemasIn(runner), store);
      results.push(...skips);
      const waiting = new Set(skips.map((r) => r.id));
      const checkable = active.filter((id) => !waiting.has(id));
      // C52 (F2): every table the schema panel shows an item at its level is in the item's edge schema, from the notes the build wrote.
      const notes = JSON.parse(await readFile(at('data/schema-notes.json'), 'utf8')) as TableNote[];
      results.push(...(await checkEdgePanelsOnDb(checkable.map((id) => store.item(id)!), notes, runner)));
      for (const id of checkable) {
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
  const labTally = labTallyLine(results);
  if (labTally) console.log(labTally);
  const failed = results.filter((r) => !r.ok && !r.warn);
  console.log(`${results.length - failed.length}/${results.length} checks passed, ${new Set(results.map((r) => r.id)).size} items and lessons`);
  if (failed.length) process.exitCode = 1;
}

if (import.meta.main) await main();

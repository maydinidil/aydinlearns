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
import { ContentFileError, LAB_GUIDE_FILE, LAB_KEY_DIR, loadContent, type ContentStore, type LoadOptions } from '../server/content.ts';
import { EM_DASH, sameStructuralAnswer, validateLab, validateLabKey, type Lab, type LabKey } from '../schemas/lab.ts';
import { readingWords } from '../schemas/reading.ts';
import { amsterdamDate } from '../core/time.ts';
import { openerLevel } from '../server/session-composer.ts';
import { isSqlChoiceKind, validateSqlItem, type SqlItem } from '../schemas/item.ts';
import { validateSqlKey, type SqlKey } from '../schemas/keys.ts';
import { validateLesson, type Lesson } from '../schemas/lesson.ts';
import { validateCaseKey, validateCaseRecord, type CaseRecord } from '../schemas/case.ts';
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

/**
 * C41 (sprint 4b, Task B2; S4B-01 to S4B-05, design §7): every case, the level openers and content/sql/cases/ alike, one result per
 * case file, named by case ID. C29 keeps the opener rules; this check adds, for every case:
 * - the record validates (validateCaseRecord, a daily case's CP3 and CP4 only included); a malformed record fails on those
 *   messages alone, and the check finishes;
 * - an opener sits in content/sql/openers/, an inbox or daily case in content/sql/cases/; no case ID and no checkpoint item is
 *   used by two case files (the store keeps one credit list per item);
 * - its CP3 item exists with use `opener` (an opener) or `case` (otherwise) and no grain line, and the expected output is that
 *   item's output columns and sort keys;
 * - an opener's level is openerLevel's; every credited concept is an SQL curriculum concept at or below the case's level;
 * - every truth_key has a value in the truth file the store read (`store.checkpointTruth`);
 * - its key (content/keys/cases/<case_id>.json) validates, names the case, has a truth query for each CP2 and CP4 and a correct
 *   option for each CP1 and CP5 the case lists and nothing for any other, and each correct option is one of that checkpoint's
 *   options, whose oids are unique.
 * A detail names case IDs, item IDs, checkpoints and fields: never a truth query, a value, a correct oid or an explanation.
 */
export function checkCases(store: ContentStore): CheckResult[] {
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
  return all.map((rec, n) => {
    const id = idOf(rec, n);
    const invalid = validateCaseRecord(rec);
    const why = [...invalid];
    const isOpener = openers.has(rec);
    if ((files.get(id) ?? 0) > 1) why.push(`the case ID ${id} is used by ${files.get(id)} case files`);
    // Codex F22's lesson: the checks below read the record's fields, so they run only on a record that validated.
    if (invalid.length) return { id, check: 'C41', ok: false, detail: why.join('; ') };
    if (isOpener && rec.kind !== 'opener') why.push('content/sql/openers/ holds the level openers only: an inbox or daily case goes in content/sql/cases/');
    if (!isOpener && rec.kind === 'opener') why.push('a level opener goes in content/sql/openers/, not content/sql/cases/');
    for (const c of rec.checkpoints) if (c.item_id !== undefined && (itemOwners.get(c.item_id) ?? 0) > 1) why.push(`${c.item_id} is also a checkpoint item of another case`);
    // The CP3 item: its use, no grain line, and the expected output it promises.
    const cp3 = rec.checkpoints.find((c) => c.kind === 'CP3')!;
    const item = store.item(cp3.item_id!);
    const use = rec.kind === 'opener' ? 'opener' : 'case';
    if (!item) why.push(`${cp3.item_id} is missing`);
    else {
      if (item.use !== use) why.push(`${cp3.item_id} must have use ${use}`);
      if (item.output_contract?.grain != null) why.push(`${cp3.item_id} must have no grain line`);
      const columns = item.output_contract?.columns?.map((c) => c.name) ?? [];
      if (JSON.stringify(rec.expected_output.columns) !== JSON.stringify(columns)) why.push(`expected_output.columns must be ${cp3.item_id}'s output columns, in order`);
      const sort = (item.rules?.sort_keys ?? []).map((k) => ({ column: k.column, desc: k.desc }));
      const promised = rec.expected_output.sort.map((k) => ({ column: k.column, desc: k.desc }));
      if (JSON.stringify(promised) !== JSON.stringify(sort)) why.push(`expected_output.sort must be ${cp3.item_id}'s sort keys`);
    }
    // Levels: an opener opens the level its concepts reach; every credit sits at or below the case's level.
    if (rec.kind === 'opener') {
      const opens = openerLevel(rec, store.curriculum);
      if (opens !== rec.level) why.push(`the opener is level ${rec.level}, but its concepts reach level ${opens ?? 'none'} (openerLevel)`);
    }
    for (const c of rec.checkpoints) for (const concept of c.credits_concepts) {
      const level = levelOf.get(concept);
      if (level === undefined) why.push(`${c.kind} credits ${concept}, which is not a concept of the SQL curriculum`);
      else if (level > rec.level) why.push(`${c.kind} credits ${concept}, a level ${level} concept, above the case's level ${rec.level}`);
    }
    // The truth file: every CP2 and CP4 value the build wrote.
    for (const c of rec.checkpoints) if (c.truth_key !== undefined && store.checkpointTruth?.(c.truth_key) === undefined) {
      why.push(`${c.truth_key} has no value in the truth file: run npm run build:data, and check the key's truth query`);
    }
    // The key: its shape, then each entry against the checkpoints the case lists.
    const kinds = new Set<string>(rec.checkpoints.map((c) => c.kind));
    const needsKey = [...CASE_CHOICES, ...CASE_TRUTHS].some((k) => kinds.has(k));
    const key = store.caseKey?.(rec.case_id);
    if (!key) { if (needsKey) why.push(`content/keys/cases/${rec.case_id}.json is missing: its CP1, CP2, CP4 and CP5 need it`); }
    else {
      const shape = validateCaseKey(key);
      if (shape.length) why.push(...shape.map((m) => `the key: ${m}`));
      else {
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
          if (!cp || !choice) continue;
          const oids = (cp.options ?? []).map((o) => o.oid);
          if (new Set(oids).size !== oids.length) why.push(`${k}'s options repeat an oid`);
          if (!oids.includes(choice.correct_oid)) why.push(`the key's ${k} correct option is not one of its options`);
        }
      }
    }
    return { id, check: 'C41', ok: why.length === 0, detail: why.join('; ') };
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
  // C41 reads every CP2 and CP4 value from the truth file the build wrote, beside the database the item checks run on.
  const store = await loadContentForCli(root, { truthFile: at('data/truth/voltmarkt.json') });
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
  results.push(...checkCases(store));
  results.push(...checkReadings(store));
  results.push(...(await checkLabs(store, root)));
  results.push(...checkFullMockPool(store));
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
  const labTally = labTallyLine(results);
  if (labTally) console.log(labTally);
  const failed = results.filter((r) => !r.ok && !r.warn);
  console.log(`${results.length - failed.length}/${results.length} checks passed, ${new Set(results.map((r) => r.id)).size} items and lessons`);
  if (failed.length) process.exitCode = 1;
}

if (import.meta.main) await main();

import type { ContentEnvelope } from '../core/content.ts';
import { validateEnvelope } from '../core/content.ts';
// Not from schemas/choice.ts, which imports node:crypto: the browser imports this file (DEFAULT_RULES).
import type { ChoiceOption, TypedSpec } from './choice-types.ts';

/** S3-13: the SQL choice kinds, graded by the choice grader and rated by the multiple-choice map (S3-14, S3-15). */
export type SqlChoiceKind = 'predict_rows' | 'predict_result' | 'choose_query' | 'which_table' | 'is_unique';
export type ItemKind = 'write' | 'fix' | SqlChoiceKind;
/** `case` (S4B-02): an inbox or daily case's CP3 item, with the ID EX-CASE-<case tail>. */
export type ItemUse = 'pretest' | 'lesson' | 'retest' | 'pool' | 'drill' | 'opener' | 'case';
export type Difficulty = 'E1' | 'E2' | 'E3';
export type TypeClass = 'numeric' | 'temporal' | 'boolean' | 'text';
export type PrecisionClass = 'money' | 'ratio' | 'count' | 'exact';
export type Subgoal = 'source_grain' | 'row_filter' | 'output_grain' | 'metrics' | 'group_filter' | 'sort_limit';

export interface ColumnRule {
  name: string;
  type_class: TypeClass;
  precision: PrecisionClass;          // numeric columns; 'exact' for everything else
  require_rounding?: number;          // decimals; set on every exercise that asks for rounding (G3)
}
export interface SortKey { column: string; desc: boolean }
export interface GradingRules {
  order_matters: boolean;
  sort_keys: SortKey[];
  check_names: boolean;
  allow_extra_columns: boolean;
  columns: ColumnRule[];              // entries are matched to the key's output columns by position
  strict_temporal_type: boolean;
  trim_strings: boolean;
  tie_policy: 'none' | 'stated';
  key_columns: string[];
  timeout_ms: number;                 // default 5000
  set_semantics: boolean;             // default false
  case_insensitive: boolean;          // default false
  strict_column_order: boolean;       // default false
}
export interface OutputContract { columns: { name: string; type_class: TypeClass }[]; grain: string | null }
export interface SubgoalLabel { from: number; to: number; subgoal: Subgoal }   // offsets into the reference shape
// faded_shape holds only what the learner sees before the stage 1 blank: the query up to the start of its last clause.
// stage1 = faded_shape.length; stage2 = the shorter prefix that also hides the second-to-last clause.
// With a faded_suffix (amended 2026-10-03 by the owner, design §4), the blank sits on the lesson's new construct
// instead: faded_shape is the start of the query, faded_suffix its locked end, and stage 2 drops the suffix, so
// stage2 may equal stage1.
export interface FadingBoundaries { stage1: number; stage2: number }           // locked-prefix lengths into faded_shape
/** S3-13: the table and column an is_unique item asks about, each a plain name in the item's schema. */
export interface UniqueCheck { table: string; column: string }

export interface SqlItem extends ContentEnvelope {
  section: 'sql';
  kind: ItemKind;
  use: ItemUse;
  target_concept_id: string;
  concept_ids: string[];
  template_id: string;
  template_params: Record<string, string | number>;
  sub_skill: string | null;
  difficulty: Difficulty;
  company: 'voltmarkt';
  schema: string;                     // visible schema, e.g. 'voltmarkt'
  edge_schema: string;                // e.g. 'voltmarkt_edge_filter'
  prompt: string;
  output_contract: OutputContract | null;
  rules: GradingRules;
  hints: [string, string] | [];       // hint 3 (partial solution) is key material; a choice item has none (S3-17)
  subgoals: SubgoalLabel[];
  fading: FadingBoundaries | null;    // lesson-block items only
  faded_shape: string | null;         // lesson items: the stage 1 visible prefix only, never the clauses to write
  faded_suffix?: string | null;       // lesson items: the locked text after the stage 1 blank; absent means null
  starter_sql: string | null;         // fix items: the broken query, written as this item's own content
  starter_error_id?: string | null;   // fix items: the one error ID the grader gives the starter (S2-48, C17); absent means null
  time_target_ms: number;
  why_this_works: string;             // empty on a choice item: its key's explanation is shown after an answer
  // S3-13: the SQL choice kinds' own fields. Each is absent (or null) on every other kind; validateSqlItem says which takes which.
  shown_sql?: string | null;          // predict_rows, predict_result: the query the item shows
  options?: ChoiceOption[];           // predict_result (each with a table), choose_query, which_table, is_unique: oids by S2-60
  typed?: TypedSpec | null;           // predict_rows: a count (precision count, scale plain, 0 decimals)
  unique_check?: UniqueCheck | null;  // is_unique
}

export const DEFAULT_RULES: GradingRules = {
  order_matters: false, sort_keys: [], check_names: false, allow_extra_columns: false, columns: [],
  strict_temporal_type: false, trim_strings: false, tie_policy: 'none', key_columns: [],
  timeout_ms: 5000, set_semantics: false, case_insensitive: false, strict_column_order: false,
};

export const SQL_CHOICE_KINDS: readonly SqlChoiceKind[] = ['predict_rows', 'predict_result', 'choose_query', 'which_table', 'is_unique'];
export const isSqlChoiceKind = (kind: unknown): kind is SqlChoiceKind => SQL_CHOICE_KINDS.includes(kind as SqlChoiceKind);
/** S3-17: the kinds a predict pretest item has. */
export const PREDICT_KINDS: readonly SqlChoiceKind[] = ['predict_rows', 'predict_result'];
const KINDS: ItemKind[] = ['write', 'fix', ...SQL_CHOICE_KINDS];
const USES: ItemUse[] = ['pretest', 'lesson', 'retest', 'pool', 'drill', 'opener', 'case'];
const TYPE_CLASSES: TypeClass[] = ['numeric', 'temporal', 'boolean', 'text'];
const PRECISIONS: PrecisionClass[] = ['money', 'ratio', 'count', 'exact'];
/** The error catalogue's ID shape, as planted wrong queries use it (schemas/keys.ts). */
const ERROR_ID = /^ERR-(SYN|SEM|LOG|CMP|OUT)-\d{2}$/;

// S2-49: an opener item carries the EX-OPENER-L<level>-NN ID, and no other item does.
function checkOpenerId(o: Record<string, unknown>, e: string[]): void {
  if (typeof o.id !== 'string') return;   // the envelope reports a missing ID
  const isForm = /^EX-OPENER-L\d-\d{2}$/.test(o.id);
  if (o.use === 'opener' && !isForm) e.push('an opener item ID must look like EX-OPENER-L1-01');
  else if (o.use !== 'opener' && o.id.startsWith('EX-OPENER-')) e.push('only an opener item may use an EX-OPENER-L<n>-NN ID');
}

// S4B-02: a case item (an inbox or daily case's CP3) carries the EX-CASE-<case tail> ID, such as EX-CASE-PRICE-01, and no other item does.
function checkCaseItemId(o: Record<string, unknown>, e: string[]): void {
  if (typeof o.id !== 'string') return;   // the envelope reports a missing ID
  const isForm = /^EX-CASE-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(o.id);
  if (o.use === 'case' && !isForm) e.push('a case item ID must look like EX-CASE-PRICE-01');
  else if (o.use !== 'case' && o.id.startsWith('EX-CASE-')) e.push('only a case item may use an EX-CASE- ID');
}

// S2-48: a fix item names the one error its starter makes. Other kinds need neither field; one that is there is checked.
function checkStarter(o: Record<string, unknown>, e: string[]): void {
  if (o.kind === 'fix' && typeof o.starter_sql !== 'string') e.push('fix items need starter_sql');
  const id = o.starter_error_id;
  if (id !== undefined && id !== null && typeof id !== 'string') e.push('starter_error_id must be a string or null');
  if (o.kind === 'fix' && typeof id !== 'string') e.push('fix items need starter_error_id');
  else if (typeof id === 'string' && !ERROR_ID.test(id)) e.push('starter_error_id must be an error ID such as ERR-LOG-14');
}

// Lesson items must carry fading boundaries; wherever they are present they must be consistent.
function checkFading(o: Record<string, unknown>, e: string[]): void {
  const suffix = o.faded_suffix;
  if (suffix !== undefined && suffix !== null && typeof suffix !== 'string') e.push('faded_suffix must be a string or null');
  const hasSuffix = typeof suffix === 'string' && suffix !== '';
  if (o.fading === undefined || o.fading === null) {
    if (o.use === 'lesson') e.push('lesson items need fading boundaries');
    if (hasSuffix) e.push('faded_suffix needs fading');
    return;
  }
  if (typeof o.fading !== 'object' || Array.isArray(o.fading)) { e.push('fading must be an object or null'); return; }
  const f = o.fading as Partial<FadingBoundaries>;
  if (typeof o.faded_shape !== 'string') e.push('fading needs faded_shape');
  else if (f.stage1 !== o.faded_shape.length) e.push('fading.stage1 must equal faded_shape.length');
  const { stage1, stage2 } = f;
  // With a suffix, stage 2 may keep the stage 1 prefix: dropping the suffix is the step up.
  const ok = typeof stage1 === 'number' && typeof stage2 === 'number' && stage2 > 0 && (hasSuffix ? stage2 <= stage1 : stage2 < stage1);
  if (!ok) e.push(hasSuffix ? 'fading.stage2 must be above 0 and at most stage1' : 'fading.stage2 must be between 0 and stage1');
}

function checkColumns(columns: unknown[], e: string[]): void {
  columns.forEach((c, i) => {
    const at = `rules.columns[${i}]`;
    if (c === null || typeof c !== 'object' || Array.isArray(c)) { e.push(`${at} must be an object`); return; }
    const col = c as Record<string, unknown>;
    if (typeof col.name !== 'string') e.push(`${at}.name must be a string`);
    if (!TYPE_CLASSES.includes(col.type_class as TypeClass)) e.push(`${at}.type_class must be numeric, temporal, boolean or text`);
    if (!PRECISIONS.includes(col.precision as PrecisionClass)) e.push(`${at}.precision must be money, ratio, count or exact`);
    if (col.require_rounding !== undefined && !(Number.isInteger(col.require_rounding) && (col.require_rounding as number) >= 0)) {
      e.push(`${at}.require_rounding must be a non-negative integer`);
    }
  });
}

// ---- S3-13: the SQL choice kinds ------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
/** A plain table or column name: what an is_unique item names, so a check can quote it safely. */
const PLAIN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const article = (kind: string): string => (/^[aeiou]/.test(kind) ? 'an' : 'a');
/** Each choice field and the kinds that take it; every other kind leaves it out. */
const CHOICE_FIELDS: readonly { field: 'shown_sql' | 'options' | 'typed' | 'unique_check'; kinds: readonly SqlChoiceKind[] }[] = [
  { field: 'shown_sql', kinds: PREDICT_KINDS },
  { field: 'options', kinds: ['predict_result', 'choose_query', 'which_table', 'is_unique'] },
  { field: 'typed', kinds: ['predict_rows'] },
  { field: 'unique_check', kinds: ['is_unique'] },
];
const listed = (kinds: readonly string[]): string => (kinds.length === 1 ? kinds[0]! : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`);
/** Absent: left out, null, or (options) an empty list. */
const isAbsent = (field: string, v: unknown): boolean => v === undefined || v === null || (field === 'options' && Array.isArray(v) && v.length === 0);

/** A result table as a predict_result option shows it: distinct column names, and rows of that many cells. */
function isOptionTable(t: unknown): boolean {
  if (!isObj(t) || !Array.isArray(t.columns) || !Array.isArray(t.rows) || t.columns.length === 0) return false;
  const columns = t.columns as unknown[];
  if (!columns.every(isText) || new Set(columns).size !== columns.length) return false;
  const cell = (v: unknown) => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
  return (t.rows as unknown[]).every((r) => Array.isArray(r) && r.length === columns.length && r.every(cell));
}

/** The options' shape (their S2-60 oids are checked by schemas/choice.ts, which can hash). */
function checkSqlOptions(options: unknown, kind: SqlChoiceKind, e: string[]): void {
  if (!Array.isArray(options) || options.length < 2 || options.length > 8) { e.push('a choice item needs 2 to 8 options'); return; }
  const before = e.length;
  const texts: string[] = [];
  options.forEach((opt: unknown, i) => {
    if (!isObj(opt)) { e.push(`options[${i}] must be an object`); return; }
    if (!isText(opt.oid)) e.push(`options[${i}].oid is missing`);
    if (!isText(opt.text)) e.push(`options[${i}].text is missing`);
    else texts.push(opt.text.trim().toLowerCase());
    if (!(opt.misconception_id === null || typeof opt.misconception_id === 'string')) e.push(`options[${i}].misconception_id must be a string or null`);
    if (kind !== 'predict_result') { if (opt.table !== undefined) e.push(`options[${i}].table belongs on predict_result options only`); }
    else if (opt.table === undefined) e.push(`options[${i}] needs a table: every predict_result option is a result table`);
    else if (!isOptionTable(opt.table)) e.push(`options[${i}].table must have a list of distinct column names and rows of that many cells, each text, a number or null`);
  });
  if (e.length === before && new Set(texts).size !== options.length) e.push('option texts must be different');
  if (kind === 'is_unique' && (options.length !== 2 || !options.every(isObj) || [...options.map((o) => (o as Obj).text)].sort().join('|') !== 'No|Yes')) {
    e.push('an is_unique item has exactly two options, "Yes" and "No"');
  }
}

const sameAsDefaultRules = (r: unknown): boolean => {
  const keys = Object.keys(DEFAULT_RULES) as (keyof GradingRules)[];
  return isObj(r) && Object.keys(r).length === keys.length && keys.every((k) => JSON.stringify(r[k]) === JSON.stringify(DEFAULT_RULES[k]));
};

/**
 * S3-13 for every kind: a choice field on a kind that does not take it is an error, and a choice kind needs its own. Then, for a
 * choice kind, the shape of each field and the fields a choice item never uses (S3-13, S3-16, S3-17).
 */
function checkChoiceFields(o: Obj, e: string[]): void {
  const kind = o.kind as string;
  const choice = isSqlChoiceKind(kind);
  for (const { field, kinds } of CHOICE_FIELDS) {
    const wanted = (kinds as readonly string[]).includes(kind);
    const absent = isAbsent(field, o[field]);
    if (!absent && !wanted) e.push(`${field} belongs on ${listed(kinds)} items only`);
    else if (absent && wanted) e.push(`${article(kind)} ${kind} item needs ${field}`);
    else if (!absent && wanted) {
      if (field === 'shown_sql' && !isText(o.shown_sql)) e.push('shown_sql must be a query');
      if (field === 'options') checkSqlOptions(o.options, kind as SqlChoiceKind, e);
      if (field === 'typed') {
        const t = o.typed;
        if (!(isObj(t) && t.precision === 'count' && t.scale === 'plain' && t.decimals === 0 && typeof t.unit_label === 'string')) {
          e.push('a predict_rows typed spec is a count: precision count, scale plain, decimals 0, and a unit_label');
        }
      }
      if (field === 'unique_check') {
        const u = o.unique_check;
        if (!(isObj(u) && typeof u.table === 'string' && PLAIN_NAME.test(u.table) && typeof u.column === 'string' && PLAIN_NAME.test(u.column))) {
          e.push('unique_check must name a table and a column, each a plain name such as store_id');
        }
      }
    }
  }
  if (!choice) return;
  if (!(o.use === 'pool' || (o.use === 'pretest' && (PREDICT_KINDS as readonly string[]).includes(kind)))) {
    e.push('a choice item\'s use is pool, or pretest for a predict item (S3-16, S3-17)');
  }
  if (o.output_contract !== null) e.push('a choice item has no output_contract');
  if (!sameAsDefaultRules(o.rules)) e.push('a choice item\'s rules are DEFAULT_RULES');
  if (!Array.isArray(o.hints) || o.hints.length !== 0) e.push('a choice item has no hints: the app shows it none (S3-17)');
  if (!Array.isArray(o.subgoals) || o.subgoals.length !== 0) e.push('a choice item has no subgoals');
  if ((o.starter_sql !== null && o.starter_sql !== undefined) || (o.starter_error_id !== null && o.starter_error_id !== undefined)) {
    e.push('a choice item has no starter_sql or starter_error_id');
  }
  if ([o.fading, o.faded_shape, o.faded_suffix].some((v) => v !== null && v !== undefined)) e.push('a choice item has no fading, faded_shape or faded_suffix');
  if (o.why_this_works !== '') e.push('why_this_works must be empty on a choice item: the key\'s explanation is shown after an answer');
}

// Runs on agent-generated JSON: every check tolerates malformed input and returns messages, never throws.
export function validateSqlItem(x: unknown): string[] {
  const e = validateEnvelope(x);
  const o = (x ?? {}) as Record<string, unknown>;
  const choice = isSqlChoiceKind(o.kind);
  if (o.section !== 'sql') e.push('section must be sql');
  if (!KINDS.includes(o.kind as ItemKind)) e.push('kind is not a known item kind');
  if (!USES.includes(o.use as ItemUse)) e.push('use is not a known use');
  if (typeof o.target_concept_id !== 'string' || !/^SQL-[A-Z]+-\d{2}$/.test(o.target_concept_id)) e.push('target_concept_id must be a SQL-* concept');
  if (!Array.isArray(o.concept_ids) || !(o.concept_ids as unknown[]).includes(o.target_concept_id)) e.push('concept_ids must include the target concept');
  if (!['E1', 'E2', 'E3'].includes(o.difficulty as string)) e.push('difficulty must be E1, E2 or E3');
  if (typeof o.prompt !== 'string' || (o.prompt as string).length < 10) e.push('prompt is missing');
  if (!choice && (!Array.isArray(o.hints) || (o.hints as unknown[]).length !== 2)) e.push('hints must hold exactly 2 entries (hint 3 lives in the key)');
  checkOpenerId(o, e);
  checkCaseItemId(o, e);
  checkStarter(o, e);
  checkFading(o, e);
  checkChoiceFields(o, e);
  if (choice) return e;                     // a choice item's rules, hints and why_this_works are checked above
  if (typeof o.why_this_works !== 'string' || !(o.why_this_works as string).trim()) e.push('why_this_works is missing');
  const rules = o.rules as GradingRules | undefined;
  if (!rules || !Array.isArray(rules.columns) || rules.columns.length === 0) e.push('rules.columns must list every output column');
  else checkColumns(rules.columns, e);
  if (rules?.order_matters && (!Array.isArray(rules.sort_keys) || rules.sort_keys.length === 0)) e.push('order_matters needs sort_keys');
  return e;
}

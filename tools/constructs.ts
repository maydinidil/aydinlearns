// tools/constructs.ts: construct detection for the prerequisite rule (design §12, T-01; ruling R19).
// One detector per construct in content/sql/constructs.json. It runs on masked SQL: string
// literals, comments and double-quoted identifiers never count. A detector that fires on a later
// construct's look-alike fails C09 on a correct key, so each one matches the construct's own
// syntax (a call, a keyword pair) rather than a bare word.
import { maskSql } from '../server/runner/tables.ts';

/** Words that can sit right before a sign without being a value: `BETWEEN -5`, `SELECT *`. */
const NOT_OPERAND = 'select|distinct|all|from|where|and|or|not|by|between|when|then|else|case|in|is|like|ilike|on|having|limit|offset|as|return';

/**
 * `computed_alias`: a calculation between two values, or a column alias in a SELECT list (an AS
 * before that SELECT's FROM). A star (`SELECT *`, `t.*`, `COUNT(*)`) is not a calculation, and a
 * table alias comes after FROM. `subquery` skips a bracketed SELECT that is a CTE body
 * (`name AS (SELECT`, R19), a set operation's bracketed operand, or the whole statement in brackets.
 */
export const DETECTORS: Record<string, RegExp> = {
  select_from: /\bselect\b[\s\S]*\bfrom\b/i,
  computed_alias: new RegExp(String.raw`(?:\b(?!(?:${NOT_OPERAND})\b)\w+|\))\s*[-+*/%]\s*(?!from\b)[\w(]|\bselect\b(?:(?!\bfrom\b)[\s\S])*?\bas\s+\w`, 'i'),
  where: /\bwhere\b/i,
  and_or_not: /\b(and|or|not)\b/i,
  in_list: /\bin\s*\((?!\s*select\b)/i,
  between: /\bbetween\b/i,
  like: /\bi?like\b/i,
  order_by: /\border\s+by\b/i,
  limit: /\blimit\s+\d+/i,
  distinct: /\bselect\s+distinct\b/i,
  is_null: /\bis\s+(not\s+)?null\b/i,
  coalesce: /\bcoalesce\s*\(/i,
  aggregate: /\b(count|sum|avg|min|max|count_if|string_agg|array_agg|list|any_value|arg_max|arg_min|max_by|min_by|bool_and|bool_or|stddev|stddev_samp|stddev_pop|variance|var_samp|var_pop)\s*\(/i,
  group_by: /\bgroup\s+by\b/i,
  having: /\bhaving\b/i,
  case: /\bcase\b[\s\S]*\bwhen\b/i,
  filter_agg: /\bfilter\s*\(\s*where\b/i,
  cast_round: /\b(try_cast|cast|round|floor|ceil|ceiling|trunc)\s*\(|::/i,
  date_trunc: /\bdate_trunc\s*\(/i,
  date_part: /\b(extract|date_part|datepart|strftime|year|isoyear|quarter|month|week|weekofyear|day|dayofweek|dayofmonth|dayofyear|isodow|weekday|hour|minute|second|monthname|dayname)\s*\(/i,
  join: /\bjoin\b|\bfrom\s+\w+(\s+(as\s+)?\w+)?\s*,\s*\w+/i,
  left_join: /\bleft\s+(outer\s+)?join\b/i,
  // Sprint 4a Task B2: RIGHT JOIN is its own construct (01 is silent; build record, Task 7 minor), so an
  // "other way" that swaps the sides of a LEFT JOIN reads as another join type (S4-11).
  right_join: /\bright\s+(outer\s+)?join\b/i,
  cte: /(^|\()\s*with\s+(recursive\s+)?\w+/i,
  full_cross_join: /\bfull\s+(outer\s+)?join\b|\bcross\s+join\b/i,
  set_op: /\b(union|intersect|except)\b/i,
  subquery: /(?<!\bas\s*((not\s+)?materialized\s*)?|^\s*|\b(union|intersect|except)(\s+(all|distinct))?\s*)\(\s*select\b/i,
  text_helper: /\b(lower|upper|lcase|ucase|trim|ltrim|rtrim)\s*\(/i,
  string_fn: /\b(substring|substr|replace|concat|concat_ws|length|len|char_length|split_part|left|right|position|strpos|instr|lpad|rpad|reverse|starts_with|ends_with|contains|string_split|regexp_\w+)\s*\(|\|\|/i,
  // S6-09 (sprint 6, Task A1): renamed from date_arith. A minus between two DATE values counts too; dateMinusDate finds it.
  date_arithmetic: /\binterval\b|\b(date_diff|datediff|date_sub|datesub|date_add|age)\s*\(/i,
  window: /\bover\b\s*(\(|[a-z_])/i,
  ranking: /\b(row_number|rank|dense_rank)\s*\(/i,
  lag_lead: /\b(lag|lead)\s*\(/i,
  qualify: /\bqualify\b/i,
  ntile_first_value: /\b(ntile|first_value|last_value|nth_value|percent_rank|cume_dist)\s*\(/i,
  percentile: /\b(median|quantile|quantile_cont|quantile_disc|percentile_cont|percentile_disc)\s*\(/i,
};

/**
 * The calls behind each helper construct, for the named-helper rule in C09. Each lists every call
 * its construct's detector fires on, so a key cannot reach the construct through an unlisted one;
 * `::` counts as CAST. Keep these in step with DETECTORS.
 */
const HELPER_CALLS: Record<string, RegExp> = {
  cast_round: /\b(try_cast|cast|round|floor|ceil|ceiling|trunc)\s*\(|::/gi,
  coalesce: /\b(coalesce)\s*\(/gi,
  text_helper: /\b(lower|upper|lcase|ucase|trim|ltrim|rtrim)\s*\(/gi,
};

/** maskSql keeps double-quoted identifiers visible; a column named "group by" is not a GROUP BY. */
const blankIdentifiers = (masked: string): string => masked.replace(/"[^"]*"?/g, (m) => ' '.repeat(m.length));
const detectable = (sql: string): string => blankIdentifiers(maskSql(sql));

/**
 * `dateColumns`: the lower-case names of the DATE-typed columns of the query's schema (S6-09); since S6-34, only the names every table
 * of the schema that has them types DATE (dateColumns in tools/check-content.ts). Without them, only operands that say DATE themselves count.
 */
export interface DetectOptions { dateColumns?: ReadonlySet<string> }

const NAME = String.raw`"(?:[^"]|"")*"|[A-Za-z_][\w$]*`;
/** A name at the end of the text, qualified or not: the group is its last part. */
const NAME_BEFORE = new RegExp(String.raw`(?:(?:${NAME})\s*\.\s*)*(${NAME})\s*$`);
/** A name at the start of the text, qualified or not. */
const NAME_START = new RegExp(String.raw`^(?:(?:${NAME})\s*\.\s*)*(?:${NAME})`);
/** A text that is one name, qualified or not: the group is its last part. */
const NAME_ONLY = new RegExp(String.raw`^(?:(?:${NAME})\s*\.\s*)*(${NAME})$`);
const unquoted = (name: string): string => (name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name).toLowerCase();
const AS_DATE_END = /\bas\s+date\s*$/i;
/** A `::` cast that ends an operand, with any type arguments (`::DATE`, `::DECIMAL(10, 2)`): the group is the type. */
const CAST_SUFFIX_END = /::\s*([A-Za-z_]\w*)\s*(?:\([^()]*\))?\s*$/;
/** A `::` cast that starts the text, as CAST_SUFFIX_END reads one. */
const CAST_SUFFIX_START = /^\s*::\s*[A-Za-z_]\w*(?:\s*\([^()]*\))?/;
/**
 * S6-34 (sprint 6, Task K3): the calls whose value is a DATE operand when one of their arguments is one: the aggregates and
 * comparisons that keep their input's type, and date_trunc.
 */
const DATE_KEEPING_CALLS: ReadonlySet<string> = new Set(['min', 'max', 'any_value', 'least', 'greatest', 'date_trunc']);

/** The index of the bracket that closes the one at `open`, or -1. */
function closing(bare: string, open: number): number {
  for (let i = open, depth = 0; i < bare.length; i++) {
    if (bare[i] === '(') depth++;
    else if (bare[i] === ')' && --depth === 0) return i;
  }
  return -1;
}
/** The index of the bracket that opens the one at `close`, or -1. */
function opening(bare: string, close: number): number {
  for (let i = close, depth = 0; i >= 0; i--) {
    if (bare[i] === ')') depth++;
    else if (bare[i] === '(' && --depth === 0) return i;
  }
  return -1;
}

/** The [from, to) spans of the arguments between the brackets at `open` and `close`, split at their own commas. */
function argSpans(bare: string, open: number, close: number): [number, number][] {
  const spans: [number, number][] = [];
  let start = open + 1;
  for (let i = open + 1, depth = 0; i < close; i++) {
    const ch = bare[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { spans.push([start, i]); start = i + 1; }
  }
  spans.push([start, close]);
  return spans;
}

/**
 * Whether the text between `from` and `to` is one DATE operand (S6-09, S6-34):
 * - a `DATE '...'` literal, or anything cast to DATE (`CAST(... AS DATE)`, `TRY_CAST`, `::DATE`; the last cast decides);
 * - a column name, qualified or not, that `dates` holds (dateColumns: typed DATE in every table that has it);
 * - min, max, any_value, least, greatest or date_trunc over an argument that is one (DISTINCT before it is skipped).
 * `masked` reads names (a quoted one included) and `bare` brackets, so a bracket inside a quoted name never counts.
 */
function isDateOperand(masked: string, bare: string, from: number, to: number, dates: ReadonlySet<string>): boolean {
  while (from < to && /\s/.test(masked[from]!)) from++;
  while (to > from && /\s/.test(masked[to - 1]!)) to--;
  if (from >= to) return false;
  const b = bare.slice(from, to);
  const cast = CAST_SUFFIX_END.exec(b);
  if (cast) return cast[1]!.toLowerCase() === 'date';
  if (/^date\s*'[^']*'$/i.test(b)) return true;
  if (masked[to - 1] === ')') {
    const open = opening(bare, to - 1);
    if (open < from) return false;
    const call = masked.slice(from, open).trim().toLowerCase();        // empty for a bracketed operand
    if (call === 'cast' || call === 'try_cast') return AS_DATE_END.test(bare.slice(open + 1, to - 1));
    if (!DATE_KEEPING_CALLS.has(call)) return false;
    return argSpans(bare, open, to - 1).some(([f, t]) => {
      const distinct = /^\s*distinct\b/i.exec(bare.slice(f, t));
      return isDateOperand(masked, bare, distinct ? f + distinct[0].length : f, t, dates);
    });
  }
  const name = NAME_ONLY.exec(masked.slice(from, to))?.[1];
  return name !== undefined && dates.has(unquoted(name));
}

/**
 * Where the operand that ends just before `end` starts, or -1: a name, a call (its name and brackets), a literal, or a bracketed
 * operand, with any `::` casts after it. Names are read within the 256 characters before; a qualified name is far shorter.
 */
function operandStart(masked: string, bare: string, end: number): number {
  let p = end;
  for (;;) {
    while (p > 0 && /\s/.test(masked[p - 1]!)) p--;
    const cast = CAST_SUFFIX_END.exec(bare.slice(Math.max(0, p - 128), p));
    if (!cast) break;
    p -= cast[0].length;
  }
  if (masked[p - 1] === "'") {
    const open = masked.lastIndexOf("'", p - 2);           // maskSql blanks a string's text, quotes inside it included
    if (open < 0) return -1;
    const keyword = /\bdate\s*$/i.exec(masked.slice(Math.max(0, open - 16), open));
    return keyword ? open - keyword[0].length : open;
  }
  if (masked[p - 1] === ')') {
    const open = opening(bare, p - 1);
    if (open < 0) return -1;
    const lo = Math.max(0, open - 256);
    const call = NAME_BEFORE.exec(masked.slice(lo, open));
    return call ? lo + call.index : open;
  }
  const lo = Math.max(0, p - 256);
  const name = NAME_BEFORE.exec(masked.slice(lo, p));
  return name ? lo + name.index : -1;
}

/** Where the operand that starts just after `start` ends, or -1, read as operandStart reads one. */
function operandEnd(masked: string, bare: string, start: number): number {
  let p = start;
  while (p < masked.length && /\s/.test(masked[p]!)) p++;
  const literal = /^date\s*'/i.exec(bare.slice(p, p + 16));
  if (literal) {
    const close = bare.indexOf("'", p + literal[0].length);
    if (close < 0) return -1;
    p = close + 1;
  } else {
    const name = NAME_START.exec(masked.slice(p, p + 256));
    if (name) p += name[0].length;
    let q = p;
    while (q < masked.length && /\s/.test(masked[q]!)) q++;
    if (bare[q] === '(') {                                 // a call, or a bracketed operand
      const close = closing(bare, q);
      if (close < 0) return -1;
      p = close + 1;
    } else if (!name) return -1;
  }
  for (let c = CAST_SUFFIX_START.exec(bare.slice(p, p + 128)); c; c = CAST_SUFFIX_START.exec(bare.slice(p, p + 128))) p += c[0].length;
  return p;
}

/**
 * S6-09: a `-` whose two operands are both DATE operands (isDateOperand): a column the schema types as DATE, a `DATE '...'` literal,
 * a cast to DATE, or (S6-34, sprint 6 Task K3) one of those inside min, max, any_value, least, greatest or date_trunc. Read on the
 * masked text, so strings and comments never count; `->` is a lambda, not a minus. DATE minus a number, or a TIMESTAMP minus a DATE,
 * is not this construct.
 */
function dateMinusDate(sql: string, dates: ReadonlySet<string>): boolean {
  const masked = maskSql(sql);
  const bare = blankIdentifiers(masked);
  for (let i = bare.indexOf('-'); i >= 0; i = bare.indexOf('-', i + 1)) {
    if (bare[i + 1] === '>') continue;
    const from = operandStart(masked, bare, i);
    if (from < 0 || !isDateOperand(masked, bare, from, i, dates)) continue;
    const to = operandEnd(masked, bare, i + 1);
    if (to >= 0 && isDateOperand(masked, bare, i + 1, to, dates)) return true;
  }
  return false;
}

/** The constructs a query uses, in DETECTORS order. */
export function detectConstructs(sql: string, opts: DetectOptions = {}): string[] {
  const text = detectable(sql);
  const dates = opts.dateColumns ?? new Set<string>();
  return Object.entries(DETECTORS)
    .filter(([name, re]) => re.test(text) || (name === 'date_arithmetic' && dateMinusDate(sql, dates)))
    .map(([name]) => name);
}

/** The concepts of a curriculum, as S7-21 reads them. */
export interface ConceptOrder { concepts: readonly { id: string; order: number; prerequisites: readonly string[] }[] }

/** S7-21: a concept's prerequisites, followed transitively. An unknown concept has none; a cycle ends. */
export function prerequisitesOf(conceptId: string, curriculum: ConceptOrder): Set<string> {
  const byId = new Map(curriculum.concepts.map((c) => [c.id, c]));
  const found = new Set<string>();
  const stack = [...(byId.get(conceptId)?.prerequisites ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (found.has(id)) continue;
    found.add(id);
    stack.push(...(byId.get(id)?.prerequisites ?? []));
  }
  return found;
}

/**
 * S7-21 (sprint 7, Task A1; the build record's Task 7 minor): the constructs a query fires that belong to a concept later in curriculum
 * order than `conceptId` and not among its prerequisites (prerequisitesOf), in DETECTORS order. A construct's example may fire its
 * own concept's and its prerequisites' constructs (the qualify example fires window: SQL-WIN-01 is SQL-WIN-06's prerequisite through
 * SQL-WIN-02), never a later concept's, which would fail C09 on a correct key of the example's concept. A construct the map does not
 * place, or a concept without an order, is never later.
 */
export function laterConstructs(sql: string, conceptId: string, constructs: readonly { construct: string; concept_id: string }[], curriculum: ConceptOrder): string[] {
  const order = new Map(curriculum.concepts.map((c) => [c.id, c.order]));
  const own = order.get(conceptId) ?? Infinity;
  const before = prerequisitesOf(conceptId, curriculum);
  const conceptOf = new Map(constructs.map((c) => [c.construct, c.concept_id]));
  return detectConstructs(sql).filter((c) => {
    const concept = conceptOf.get(c);
    return concept !== undefined && (order.get(concept) ?? -Infinity) > own && !before.has(concept);
  });
}

/** Every call of a helper construct in a query, as upper-case SQL names in text order; null when the construct has no helpers. */
export function helperCalls(sql: string, construct: string): string[] | null {
  const re = HELPER_CALLS[construct];
  if (!re) return null;
  return [...detectable(sql).matchAll(re)].map((m) => (m[1] ?? 'cast').toUpperCase());
}

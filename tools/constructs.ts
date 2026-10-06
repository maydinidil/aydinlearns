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
  left_join: /\b(left|right)\s+(outer\s+)?join\b/i,
  cte: /(^|\()\s*with\s+(recursive\s+)?\w+/i,
  full_cross_join: /\bfull\s+(outer\s+)?join\b|\bcross\s+join\b/i,
  set_op: /\b(union|intersect|except)\b/i,
  subquery: /(?<!\bas\s*((not\s+)?materialized\s*)?|^\s*|\b(union|intersect|except)(\s+(all|distinct))?\s*)\(\s*select\b/i,
  text_helper: /\b(lower|upper|lcase|ucase|trim|ltrim|rtrim)\s*\(/i,
  string_fn: /\b(substring|substr|replace|concat|concat_ws|length|len|char_length|split_part|left|right|position|strpos|instr|lpad|rpad|reverse|starts_with|ends_with|contains|string_split|regexp_\w+)\s*\(|\|\|/i,
  date_arith: /\binterval\b|\b(date_diff|datediff|date_sub|datesub|date_add|age)\s*\(/i,
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

/** The constructs a query uses, in DETECTORS order. */
export function detectConstructs(sql: string): string[] {
  const text = detectable(sql);
  return Object.entries(DETECTORS).filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** Every call of a helper construct in a query, as upper-case SQL names in text order; null when the construct has no helpers. */
export function helperCalls(sql: string, construct: string): string[] | null {
  const re = HELPER_CALLS[construct];
  if (!re) return null;
  return [...detectable(sql).matchAll(re)].map((m) => (m[1] ?? 'cast').toUpperCase());
}

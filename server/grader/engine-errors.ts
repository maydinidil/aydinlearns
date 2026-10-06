// server/grader/engine-errors.ts: DuckDB error messages to error IDs (02's taxonomy, rewritten for
// DuckDB 1.5.6 by knowledge/ERRATA.md E-145; rulings R20 and R22)
import { maskSql } from '../runner/tables.ts';

export interface EngineErrorClass { errorId: string; column?: string; table?: string }

interface Rule { re: RegExp; id: string; capture?: 'column' | 'table' }
const RULES: Rule[] = [
  { re: /column "([^"]+)" must appear in the GROUP BY clause|must appear in the GROUP BY clause|must be part of an aggregate function/i, id: 'ERR-SEM-01', capture: 'column' },
  { re: /More than one row returned by a subquery/i, id: 'ERR-SEM-05' },
  { re: /Ambiguous reference to column name "([^"]+)"/i, id: 'ERR-SYN-03', capture: 'column' },
  { re: /Referenced column "([^"]+)" not found|does not have a column named "([^"]+)"/i, id: 'ERR-SYN-02', capture: 'column' },
  { re: /Table with name ([^\s!]+) does not exist|Referenced table "([^"]+)" not found/i, id: 'ERR-SYN-02', capture: 'table' },
  // DuckDB's lexer names each kind of open quote: 'string, "identifier and $$dollar-quoted string.
  { re: /unterminated (?:dollar-)?quoted (?:string|identifier)/i, id: 'ERR-SYN-04' },
  { re: /Conversion Error|Could not convert/i, id: 'ERR-OUT-02' },
];

const NAME = String.raw`"(?:[^"]|"")+"|[A-Za-z_][\w$]*`;
const AS_ALIAS = new RegExp(String.raw`\bAS\s+(${NAME})\s*$`, 'i');
/** An alias written without AS straight after a call or bracket, as in `count(*) n`. */
const BARE_ALIAS = new RegExp(String.raw`\)\s*(${NAME})\s*$`);
/** A name that is not qualified (`t.x`), not a qualifier, and not a call. */
const PLAIN_NAME = new RegExp(String.raw`(?<![\w$."])(${NAME})(?![\w$"]|\s*[.(])`, 'g');
const SELECT_END = new Set(['from', 'where', 'group', 'having', 'order', 'limit', 'offset', 'qualify', 'window', 'union', 'except', 'intersect', ';']);
const WHERE_END = new Set(['group', 'having', 'order', 'limit', 'offset', 'qualify', 'window', 'union', 'except', 'intersect', ';']);

const unquote = (name: string): string => (name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name).toLowerCase();

/**
 * The query's text with string literals and comments blanked (maskSql), and `bare`, the same with
 * double-quoted identifiers blanked too (E-145), so neither can hide or fake a bracket or a quote.
 * Offsets match the query's.
 */
function lexed(sql: string): { masked: string; bare: string; openQuote: boolean; unbalanced: boolean } {
  const masked = maskSql(sql);
  let openQuote = false;
  const bare = masked.replace(/"[^"]*("?)/g, (m: string, close: string) => {
    if (!close) openQuote = true;
    return ' '.repeat(m.length);
  });
  // maskSql keeps a string's quote marks and blanks what is between, so an odd count means one never closed.
  if ((bare.match(/'/g)?.length ?? 0) % 2 === 1) openQuote = true;
  let depth = 0;
  let unbalanced = false;
  for (const ch of bare) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) unbalanced = true;
  }
  return { masked, bare, openQuote, unbalanced: unbalanced || depth !== 0 };
}

/**
 * For each `keyword` in the query, at any depth: its clause, as [from, to) spans split at the
 * clause's own commas. A clause ends at a keyword in `stop` or a bracket that closes around it.
 */
function clauses(bare: string, keyword: string, stop: ReadonlySet<string>): [number, number][][] {
  const toks = [...bare.matchAll(/[A-Za-z_][\w$]*|[(),;]/g)].map((m) => ({ t: m[0].toLowerCase(), at: m.index }));
  const out: [number, number][][] = [];
  toks.forEach((k, i) => {
    if (k.t !== keyword) return;
    const spans: [number, number][] = [];
    let from = k.at + keyword.length;
    let end = bare.length;
    let depth = 0;
    for (const tok of toks.slice(i + 1)) {
      if (tok.t === '(') { depth++; continue; }
      if (tok.t === ')') {
        if (depth === 0) { end = tok.at; break; }
        depth--;
        continue;
      }
      if (depth > 0) continue;
      if (stop.has(tok.t)) { end = tok.at; break; }
      if (tok.t === ',') { spans.push([from, tok.at]); from = tok.at + 1; }
    }
    spans.push([from, end]);
    out.push(spans);
  });
  return out;
}

/**
 * Whether a WHERE clause names a SELECT-list alias whose expression contains a call: the way an
 * aggregate reaches WHERE through an alias (ERR-SYN-06). A renamed plain column cannot be behind
 * "WHERE clause cannot contain aggregates", so its alias does not count.
 */
function whereNamesAggregateAlias(sql: string): boolean {
  const { masked, bare } = lexed(sql);
  const aliases = new Set<string>();
  for (const items of clauses(bare, 'select', SELECT_END)) {
    for (const [from, to] of items) {
      const item = masked.slice(from, to);
      const m = AS_ALIAS.exec(item) ?? BARE_ALIAS.exec(item);
      if (!m) continue;
      const name = unquote(m[1]!);
      const expr = bare.slice(from, from + m.index + 1);         // up to AS, or through the bracket
      if (name !== 'end' && expr.includes('(')) aliases.add(name);
    }
  }
  if (!aliases.size) return false;
  return clauses(bare, 'where', WHERE_END).some((spans) =>
    spans.some(([from, to]) => [...masked.slice(from, to).matchAll(PLAIN_NAME)].some((m) => aliases.has(unquote(m[1]!)))));
}

export function classifyEngineError(message: string, sql: string): EngineErrorClass {
  if (/WHERE clause cannot contain aggregates|aggregate functions are not allowed in WHERE/i.test(message)) {
    return { errorId: whereNamesAggregateAlias(sql) ? 'ERR-SYN-06' : 'ERR-SYN-05' };
  }
  for (const r of RULES) {
    const m = message.match(r.re);
    if (!m) continue;
    const captured = m[1] ?? m[2];
    // A double-quoted word is read as a column name in SQL: that is ERR-SYN-07, not an unknown
    // column. Strings and comments are masked, so a quoted name inside them does not count.
    if (r.id === 'ERR-SYN-02' && r.capture === 'column' && captured && maskSql(sql).includes(`"${captured}"`)) return { errorId: 'ERR-SYN-07', column: captured };
    return { errorId: r.id, ...(r.capture && captured ? { [r.capture]: captured } : {}) };
  }
  // Bracket and quote errors are ERR-SYN-04, checked before the ERR-SYN-01 rule (E-145, R22).
  if (/syntax error at end of input/i.test(message)) {
    const l = lexed(sql);
    return { errorId: l.unbalanced || l.openQuote ? 'ERR-SYN-04' : 'ERR-SYN-01' };
  }
  if (/syntax error at or near/i.test(message)) return { errorId: lexed(sql).unbalanced ? 'ERR-SYN-04' : 'ERR-SYN-01' };
  if (/Parser Error/i.test(message)) return { errorId: 'ERR-SYN-01' };
  if (/Binder Error|Catalog Error/i.test(message)) return { errorId: 'ERR-SYN-02' };
  return { errorId: 'ERR-LOG-00' };
}

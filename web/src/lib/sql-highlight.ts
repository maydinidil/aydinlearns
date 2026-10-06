// web/src/lib/sql-highlight.ts: keywords marked in shown, read-only SQL (lessons, worked examples, choice items), so they take the
// SQL colour (visuals spec §5). Text inside quotes, quoted names and comments is never marked; the tokens join back to the input.
export interface SqlToken { text: string; keyword: boolean }
const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'OUTER',
  'CROSS', 'ON', 'USING', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'ILIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'DISTINCT', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'WITH', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'OVER', 'PARTITION',
  'EXISTS', 'TRUE', 'FALSE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'COALESCE', 'CAST',
]);
const PART = /'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[A-Za-z_][A-Za-z0-9_]*|[^'"A-Za-z_\-/]+|[\s\S]/g;

export function sqlTokens(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  for (const m of sql.matchAll(PART)) {
    const text = m[0];
    const keyword = /^[A-Za-z_]/.test(text) && KEYWORDS.has(text.toUpperCase());
    const last = out[out.length - 1];
    if (!keyword && last && !last.keyword) last.text += text;
    else out.push({ text, keyword });
  }
  return out;
}

// web/src/components/SqlCode.tsx: shown, read-only SQL with its keywords in the SQL colour (visuals spec §5).
import { sqlTokens } from '../lib/sql-highlight.ts';

export function SqlCode(p: { sql: string; className?: string }) {
  return (
    <pre className={p.className ? `code ${p.className}` : 'code'}><code>
      {sqlTokens(p.sql).map((t, i) => (t.keyword ? <span key={i} className="kw">{t.text}</span> : t.text))}
    </code></pre>
  );
}

// web/src/components/Markdown.tsx
import type { ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../lib/markdown.ts';
import { SqlCode } from './SqlCode.tsx';

const inline = (xs: Inline[]): ReactNode[] => xs.map((x, i) =>
  x.kind === 'code' ? <code key={i}>{x.text}</code> : x.kind === 'strong' ? <strong key={i}>{x.text}</strong> : x.kind === 'em' ? <em key={i}>{x.text}</em> : <span key={i}>{x.text}</span>);

/** `sql`: the lesson is SQL, so its code blocks show their keywords in the SQL colour (the parser keeps no fence language). */
export function Markdown({ text, sql = false }: { text: string; sql?: boolean }) {
  return <div className="md">{parseMarkdown(text).map((b, i) => {
    switch (b.kind) {
      case 'heading': return b.level === 1 ? <h2 key={i}>{inline(b.inlines)}</h2> : b.level === 2 ? <h3 key={i}>{inline(b.inlines)}</h3> : <h4 key={i}>{inline(b.inlines)}</h4>;
      case 'para': return <p key={i}>{inline(b.inlines)}</p>;
      case 'code': return sql ? <SqlCode key={i} sql={b.text} /> : <pre key={i}><code>{b.text}</code></pre>;
      case 'list': return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
      case 'table': return <table key={i}><thead><tr>{b.header.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody></table>;
    }
  })}</div>;
}

// web/src/components/SchemaPanel.tsx: grain, row count, keys and 1:N links, the values of category-like
// columns (E-019), 5 sample rows (design §11 UI, T-06)
import type { TableNote } from '../../../schemas/schema-notes.ts';
import { allowedValueLines } from '../lib/allowed-values.ts';
import { cell } from '../lib/cell.ts';

export function SchemaPanel({ notes }: { notes: TableNote[] }) {
  return (
    <aside aria-label="Tables" className="card schema-panel">
      <h3>Tables</h3>
      {notes.map((n) => (
        <details key={n.table}>
          <summary><code>{n.table}</code>: <span className="muted">{n.grain}, {n.row_count} rows</span></summary>
          <p>Primary key: <code>{n.primary_key.join(', ')}</code> <span className="chip">key</span></p>
          {n.foreign_keys.map((f) => <p key={f.columns.join()}><code>{f.columns.join(', ')}</code> links to <code>{f.references}</code> ({f.cardinality})</p>)}
          {allowedValueLines(n).map((v) => <p key={`values-${v.column}`}><code>{v.column}</code>: {v.text}</p>)}
          <div className="table-scroll">
            <table>
              <thead><tr>{n.sample.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{n.sample.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{cell(v)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      ))}
    </aside>
  );
}

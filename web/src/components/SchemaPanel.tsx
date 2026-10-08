// web/src/components/SchemaPanel.tsx: grain, row count, keys and 1:N links, the values of category-like
// columns (E-019), 5 sample rows (design §11 UI, T-06). Sprint 4a: an item at a level sees the tables of that
// level (notesForLevel, ruling P-9), and each foreign key reads "order_id → orders (1:N)" (foreignKeyLine).
import { columnNoteLines, foreignKeyLine, notesForLevel, shownForeignKeys, type TableNote } from '../../../schemas/schema-notes.ts';
import { allowedValueLines } from '../lib/allowed-values.ts';
import { cell } from '../lib/cell.ts';
import { rowCountText } from '../lib/polish-p2b.ts';

/** `level` is the item's level (`item.level`); without one every note shows, as before sprint 4a. */
export function SchemaPanel({ notes, level }: { notes: TableNote[]; level?: number | null }) {
  const shown = notesForLevel(notes, level);
  return (
    <aside aria-label="Tables" className="card schema-panel">
      <h3>Tables</h3>
      {shown.map((n) => (
        <details key={n.table}>
          <summary><code>{n.table}</code>: <span className="muted">{n.grain}, {rowCountText(n.row_count)}</span></summary>
          <p>Primary key: <code>{n.primary_key.join(', ')}</code> <span className="chip">key</span></p>
          {shownForeignKeys(n, shown).map((f) => {
            const line = foreignKeyLine(f);
            return <p key={f.columns.join()}><code>{line.columns}</code> <span role="img" aria-label="links to">→</span> <code>{line.table}</code> ({line.cardinality})</p>;
          })}
          {columnNoteLines(n).map((c) => <p key={`note-${c.column}`} className="muted"><code>{c.column}</code>: {c.text}</p>)}
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

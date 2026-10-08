// web/src/components/ResultTable.tsx
import type { DisplayOk } from '../../../server/runner/protocol.ts';
import { cell } from '../lib/cell.ts';
import { formatCount, rowCountText } from '../lib/polish-p2b.ts';

/** `count` replaces the row count line, for a table that shows a sample of a known total (the diff). */
export function ResultTable({ result, caption, count }: { result: DisplayOk; caption?: string; count?: string }) {
  return (
    <div className="result">
      <p className="muted">{caption ? `${caption}: ` : ''}{count ?? (result.truncated ? `first ${formatCount(result.rowCount)} rows shown (more exist)` : rowCountText(result.rowCount))}</p>
      <div className="table-scroll">
        <table>
          <thead><tr>{result.columns.map((c, i) => <th key={i}>{c.name}<br /><span className="muted">{c.type}</span></th>)}</tr></thead>
          <tbody>{result.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{cell(v)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

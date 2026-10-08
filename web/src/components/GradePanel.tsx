// web/src/components/GradePanel.tsx
import type { ReactNode } from 'react';
import type { PublicGrade } from '../api.ts';
import { checklist, diffTotals, gradeHeading, partialScoreLine, sampleCount } from '../lib/exercise.ts';
import { feedbackText } from '../lib/polish-p2b.ts';
import { ResultTable } from './ResultTable.tsx';
import { cell } from '../lib/cell.ts';
import { parseInline } from '../lib/markdown.ts';

/** CHK-INT-TRUNC's note is logged as a check; the learner reads its text without the check ID (Task B10). */
const INT_TRUNC = 'CHK-INT-TRUNC:';
/** A portability note names the alias and the operator in `code`. */
const inline = (s: string) => parseInline(s).map((x, i) => (x.kind === 'code' ? <code key={i}>{x.text}</code> : <span key={i}>{x.text}</span>));

/**
 * `onDispute` is null when "I was right" is not on offer (see canDispute): its buttons are left out.
 * `otherWay` is the "Other ways to write this" block, shown after a pass only (Task D1); the panel's owner decides whether one is on offer.
 * `disputing` disables them while a dispute is being sent, so a double-click sends one (aydinlearns F3).
 */
export function GradePanel({ grade, onDispute, disputing = false, otherWay = null }: { grade: PublicGrade; onDispute: ((row: unknown[] | null) => void) | null; disputing?: boolean; otherWay?: ReactNode }) {
  const pass = grade.outcome === 'pass';
  const totals = grade.diff ? diffTotals(grade.datasets, grade.diff) : null;
  return (
    <section aria-live="polite" className="grade card">
      <h3 className={pass ? 'ok' : 'bad'}>{gradeHeading(grade)}</h3>
      {grade.rejectMessage && <p>{grade.rejectMessage}</p>}
      {pass && grade.notes.map((n) => <p key={n}><strong>Why this works:</strong> {n}</p>)}
      {pass && otherWay}
      {grade.diagnosis && !pass && (
        <div className="diagnosis">
          <p>{inline(feedbackText(grade.diagnosis.feedback.assumed))}</p>
          <p>{inline(feedbackText(grade.diagnosis.feedback.why))}</p>
          <p><strong>Try:</strong> {inline(feedbackText(grade.diagnosis.feedback.model))}</p>
          <p className="muted">{grade.diagnosis.errorId}</p>
        </div>
      )}
      {!pass && grade.notes.filter((n) => n.startsWith(INT_TRUNC)).map((n) => <p key={n}>{n.slice(INT_TRUNC.length).trim()}</p>)}
      {grade.outcome === 'engine_error' && grade.notes[0] && <pre>{grade.notes[0]}</pre>}
      {grade.edgeDescription && <p>Your query did not work on the hidden test data, which contains: {grade.edgeDescription.join('; ')}.</p>}
      {grade.diff && totals && (
        <div className="diff">
          {grade.diff.firstDiff && <p>First difference in <code>{grade.diff.firstDiff.column}</code>: expected {cell(grade.diff.firstDiff.expected)}, you have {cell(grade.diff.firstDiff.actual)}.</p>}
          {grade.diff.missing.length > 0 && <ResultTable caption="✗ Rows you are missing" count={sampleCount(grade.diff.missing.length, totals.missing)} result={{ columns: grade.diff.columns.map((name) => ({ name, type: '' })), rows: grade.diff.missing, rowCount: grade.diff.missing.length, truncated: false }} />}
          {grade.diff.extra.length > 0 && (
            <div>
              <ResultTable caption="✗ Rows that should not be there" count={sampleCount(grade.diff.extra.length, totals.extra)} result={{ columns: grade.diff.columns.map((name) => ({ name, type: '' })), rows: grade.diff.extra, rowCount: grade.diff.extra.length, truncated: false }} />
              {onDispute && <p className="muted">If you think one of these rows is right, use "I was right" and pick it.</p>}
              {onDispute && grade.diff.extra.map((r, i) => <button key={i} type="button" onClick={() => onDispute(r)} disabled={disputing}>I was right about row {i + 1}</button>)}
            </div>
          )}
        </div>
      )}
      {grade.partial && !pass && (
        <ul className="checklist">
          {checklist(grade.partial).map((c) => <li key={c.label} className={c.ok ? 'ok' : 'bad'}>{c.text}</li>)}
          <li>{partialScoreLine(grade.partial.total)}</li>
        </ul>
      )}
      {grade.portabilityNotes.length > 0 && (
        <div className="portability">
          <h4>Portability notes</h4>
          <p className="muted">Your answer is graded on DuckDB. These notes are about other databases and never cost points.</p>
          <ul>{grade.portabilityNotes.map((n) => <li key={n}>{inline(n)}</li>)}</ul>
        </div>
      )}
      {onDispute && <button type="button" onClick={() => onDispute(null)} disabled={disputing}>I was right</button>}
    </section>
  );
}

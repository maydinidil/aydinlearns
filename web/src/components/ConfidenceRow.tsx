// web/src/components/ConfidenceRow.tsx: "How sure are you?" 1 to 4 with a one-click skip (D16), asked before a choice or typed
// result. Picking one sends the answer. Shared by the ChoicePanel and the case screen.
import { confidenceName } from '../lib/choice-flow.ts';

export type Confidence = 1 | 2 | 3 | 4 | null;

export function ConfidenceRow({ busy, onPick, note = 'Your answer is checked when you pick one.' }: { busy: boolean; onPick: (c: Confidence) => void; note?: string }) {
  return (
    <div className="toolbar confidence-row">
      <p>How sure are you? 1 (guessing) to 4 (certain)</p>
      {([1, 2, 3, 4] as const).map((n) => <button key={n} type="button" disabled={busy} aria-label={confidenceName(n)} onClick={() => onPick(n)}>{n}</button>)}
      <button type="button" disabled={busy} aria-label={confidenceName(null)} onClick={() => onPick(null)}>Skip</button>
      <p className="muted">{note}</p>
    </div>
  );
}

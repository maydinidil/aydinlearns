// web/src/components/Cp4Panel.tsx: an opener's typed CP4 (Task C7; design §7; D15; S2-49). It opens after the CP3 pass: a
// follow-up number the manager asks for, typed with the decimals the prompt states. The server grades it against the true
// value and sends that value only with the answer. Nothing is locked: "Skip" leaves it, and the opener works without it.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Cp4Result, type Cp4Served } from '../api.ts';
import { cp4Feedback, cp4Hint } from '../lib/cp4-flow.ts';
import { ConfidenceRow, type Confidence } from './ConfidenceRow.tsx';

export function Cp4Panel({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [served, setServed] = useState<Cp4Served | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Cp4Result | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);     // D16: the typed number is in; confidence is asked before the result
  const shownAt = useRef(Date.now());

  function load() {
    api.cp4Serve(caseId).then((s) => { shownAt.current = Date.now(); setServed(s); }, (e: Error) => {
      if (e instanceof ApiError && e.status === 404) onDone();      // this opener has no typed question
      else setMessage(e.message);
    });
  }
  useEffect(load, [caseId]);

  async function send(confidence: Confidence) {
    if (!served || busy || result || typed.trim() === '') return;
    setBusy(true);
    setMessage(null);
    try { setResult(await api.cp4Answer(caseId, { item_instance_id: served.item_instance_id, typed, confidence, active_ms: Date.now() - shownAt.current })); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) { setServed(null); load(); setMessage('Your session ended, so this question was opened again. Send your answer again.'); }
      else setMessage((e as Error).message);       // a typed answer the server cannot read says why, and nothing is logged
    } finally { setBusy(false); setAsking(false); }
  }

  if (!served) return <section><p>{message ?? 'Loading the follow-up question...'}</p>{message && <button type="button" onClick={onDone}>Skip</button>}</section>;
  return (
    <section className="card">
      <h2>Follow-up question</h2>
      <blockquote className="prompt">{served.prompt}</blockquote>
      <p className="muted">{cp4Hint(served.typed)}</p>
      <form onSubmit={(e) => { e.preventDefault(); if (typed.trim() !== '' && !busy && !result) setAsking(true); }}>
        <label>Your answer <input type="text" inputMode="decimal" value={typed} disabled={busy || asking || result !== null} onChange={(e) => setTyped(e.target.value)} /> {served.typed.unit_label}</label>
        {!result && !asking && <p><button type="submit" className="btn-main" disabled={busy || typed.trim() === ''}>Check</button> <button type="button" onClick={onDone}>Skip</button></p>}
      </form>
      {asking && !result && <ConfidenceRow busy={busy} onPick={(c) => void send(c)} />}
      {message && <p role="alert">{message}</p>}
      {result && (
        <div aria-live="polite" className="grade">
          {cp4Feedback(result, served.typed).map((line, n) => (n === 0 ? <h3 key={n} className={result.correct ? 'ok' : 'bad'}>{line}</h3> : <p key={n}>{line}</p>))}
          <button type="button" onClick={onDone}>Done</button>
        </div>
      )}
    </section>
  );
}

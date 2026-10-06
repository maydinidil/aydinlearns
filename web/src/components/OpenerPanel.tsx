// web/src/components/OpenerPanel.tsx: a level opener (design §4 "A level opens with a manager question"; rulings S2-49, S2-51;
// Task B15 follow-up). First the question, read-only: reading it serves and logs nothing (GET /api/openers and the CP3 item).
// "Try it now" serves the CP3 item in phase case (POST /api/serve) and runs it with hidden labels (S2-39). Nothing is locked:
// Today's preview and the map's link both open it at any time. After the CP3 pass the typed CP4 follows (Task C7); it can be skipped.
import { useEffect, useState } from 'react';
import { api, type Served } from '../api.ts';
import { OPENER_HEADING } from '../lib/labels.ts';
import { openerQuestion, type OpenerQuestion } from '../lib/today-flow.ts';
import { Cp4Panel } from './Cp4Panel.tsx';
import { ExercisePanel } from './ExercisePanel.tsx';

/** `standalone`: its own screen (#/opener/<case_id>), whose page heading is the h1; inside Today it heads itself with an h2. */
export function OpenerPanel({ caseId, onDone, standalone = false }: { caseId: string; onDone: () => void; standalone?: boolean }) {
  const [question, setQuestion] = useState<OpenerQuestion | null | undefined>(undefined);    // undefined while loading
  const [served, setServed] = useState<Served | null>(null);
  const [cp4, setCp4] = useState(false);                                                      // after the CP3 pass: the typed follow-up
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);                                                    // one serving per click

  useEffect(() => { openerQuestion(caseId, { openers: api.openers, item: (id) => api.item(id) }).then(setQuestion, (e: Error) => setError(e.message)); }, [caseId]);

  async function start() {
    setBusy(true);
    setError(null);
    try { setServed(await api.serve({ section: 'sql', purpose: 'opener', case_id: caseId })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (served && cp4) return <Cp4Panel key={`${caseId}:cp4`} caseId={caseId} onDone={onDone} />;
  if (served) {
    return <ExercisePanel key={served.item_instance_id} itemId={served.item_id} phase={served.phase} instanceId={served.item_instance_id}
      hideLabels={served.hide_labels} heading={standalone ? undefined : OPENER_HEADING} labels onClosed={(r) => (r.passed ? setCp4(true) : onDone())} />;
  }
  return (
    <section className="card">
      {!standalone && <h2>{OPENER_HEADING}</h2>}
      <p className="muted">A question from a manager, which this level teaches you to answer. Today suggests solving it once the level's concepts are practised; you can try it at any time.</p>
      {error && <p role="alert">{error}</p>}
      {question === undefined && !error && <p>Loading...</p>}
      {question === null && <p>This opener is not in the content yet.</p>}
      {question && (
        <>
          <p><strong>{question.title}</strong></p>
          <blockquote className="prompt">{question.prompt}</blockquote>
          <button type="button" className="btn-main" onClick={() => void start()} disabled={busy}>Try it now</button>
        </>
      )}
    </section>
  );
}

/** #/opener/<case_id>: an opener opened from the map (S2-51), then "Done" and the way back to the map. */
export function OpenerScreen({ caseId }: { caseId: string }) {
  const [done, setDone] = useState(false);
  if (done) return <p>Done. <a href="#/map">Back to the SQL map</a></p>;
  return (
    <section>
      <h1>{OPENER_HEADING}</h1>
      <OpenerPanel caseId={caseId} onDone={() => setDone(true)} standalone />
    </section>
  );
}

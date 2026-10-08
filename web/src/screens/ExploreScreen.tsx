// web/src/screens/ExploreScreen.tsx: the dataset explorer at #/explore (sprint 4b, Task E2; S4B-28, D39). The schema panel for every
// table of the visible schema, with keys, notes and samples, and a free editor whose autocomplete covers the whole schema. Run only:
// no Submit, no hints, no grade, and nothing is logged. The SQL tab is the current tab (lib/nav.ts).
import { useEffect, useRef, useState } from 'react';
import { createSqlEditor, type SqlEditor } from '../editor/sql-editor.ts';
import { completionSchema } from '../editor/completion-schema.ts';
import { PageHead } from '../components/PageHead.tsx';
import { ResultTable } from '../components/ResultTable.tsx';
import { SchemaPanel } from '../components/SchemaPanel.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { EXPLORE_INTRO, EXPLORE_START, EXPLORE_TITLE, exploreApi, exploreError, type ExploreView } from '../lib/explore-api.ts';
import type { DisplayOk } from '../../../server/runner/protocol.ts';

export function ExploreScreen() {
  const [view, setView] = useState<ExploreView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DisplayOk | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<SqlEditor | null>(null);
  const run = useRef<() => void>(() => {});
  useEffect(() => { exploreApi.view().then(setView, (e: Error) => setError(e.message)); }, []);

  useEffect(() => {
    if (!view || !host.current) return;
    // No level: the autocomplete covers every table and column of the schema, as the panel lists them.
    editor.current = createSqlEditor({ parent: host.current, text: EXPLORE_START, locked: { prefix: 0, suffix: 0 }, schema: completionSchema(view.notes, null),
      onRun: () => run.current(), onSubmit: () => {} });
    return () => editor.current?.destroy();
  }, [view]);

  run.current = () => { void doRun(); };
  async function doRun() {
    if (!editor.current || busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await exploreApi.run(editor.current.getText());
      if ('error' in r) { setResult(null); setMessage(exploreError(r.error)); } else setResult(r);
    } catch (e) { setResult(null); setMessage((e as Error).message); } finally { setBusy(false); }
  }

  const head = <PageHead section="sql" title={EXPLORE_TITLE} crumb={crumbParts({ section: 'sql', hideLabels: false })} />;
  if (!view) return <section className="explore">{head}{error ? <p role="alert">{error}</p> : <p>Loading the tables...</p>}</section>;
  return (
    <section className="explore">
      {head}
      <p className="muted">{EXPLORE_INTRO}</p>
      <div className="exercise">
        {/* P1 finding 5: the editor, Run and the result are one column, with the Tables card beside it as in an exercise. */}
        <div className="explore-main">
          <div ref={host} data-explore-editor />
          <p><button type="button" disabled={busy} onClick={() => void doRun()}>Run</button> <span className="muted">Ctrl+Enter also runs.</span></p>
          {message && <p role="alert" className="notice" data-explore-error>{message}</p>}
          {result && <ResultTable result={result} caption="Your result" />}
        </div>
        <SchemaPanel notes={view.notes} />
      </div>
    </section>
  );
}

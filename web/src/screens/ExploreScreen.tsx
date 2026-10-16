// web/src/screens/ExploreScreen.tsx: the dataset explorer at #/explore (sprint 4b, Task E2; S4B-28, D39; sprint 6 Part 2, Task G3:
// S6-24, S6-25). A dataset picker in groups (Fictional companies, Real datasets, the 8 Week SQL Challenge), the chosen dataset's card,
// the schema panel for every table of the chosen schema, with keys, notes and samples, and a free editor whose autocomplete covers that
// schema. Run only: no Submit, no hints, no grade, and nothing is logged. On a real dataset, "Save as a flagship draft" writes a page to
// fill and the result as a CSV into the portfolio folder (still nothing logged). Datasets not prepared are listed with their prep
// command. The SQL tab is the current tab (lib/nav.ts).
import { useEffect, useRef, useState } from 'react';
import { createSqlEditor, type SqlEditor } from '../editor/sql-editor.ts';
import { completionSchema } from '../editor/completion-schema.ts';
import { DatasetCard } from '../components/DatasetCard.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { ResultTable } from '../components/ResultTable.tsx';
import { SchemaPanel } from '../components/SchemaPanel.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { EXPLORE_INTRO, EXPLORE_TITLE, exploreApi, exploreError, type ExploreView } from '../lib/explore-api.ts';
import {
  FLAGSHIP_BUTTON, FLAGSHIP_HINT, TO_PREPARE_HEADING, chosenOf, flagshipNotice, flagshipOffered, notesOf, pickerGroups, starterQuery, toPrepare,
} from '../lib/explore-flow.ts';
import type { DisplayOk } from '../../../server/runner/protocol.ts';

export function ExploreScreen() {
  const [view, setView] = useState<ExploreView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<string | null>(null);
  const [result, setResult] = useState<DisplayOk | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<SqlEditor | null>(null);
  /** The starter query of the schema now open, and the learner's own text carried over a switch (null while it is the starter). */
  const starter = useRef<string | null>(null);
  const kept = useRef<string | null>(null);
  const run = useRef<() => void>(() => {});
  useEffect(() => { exploreApi.view().then((v) => { setView(v); setSchema(v.schema); }, (e: Error) => setError(e.message)); }, []);

  useEffect(() => {
    if (!view || !host.current || schema === null) return;
    // S6-24: the autocomplete covers every table and column of the chosen schema, as the panel lists them (no level).
    const shown = notesOf(view.notes, schema);
    starter.current = starterQuery(shown);
    editor.current = createSqlEditor({ parent: host.current, text: kept.current ?? starter.current, locked: { prefix: 0, suffix: 0 },
      schema: completionSchema(shown, null), onRun: () => run.current(), onSubmit: () => {} });
    return () => {
      // A switch keeps what the learner wrote; an untouched starter query follows the new schema instead.
      const text = editor.current?.getText() ?? null;
      kept.current = text === null || text === starter.current ? null : text;
      editor.current?.destroy();
      editor.current = null;
    };
  }, [view, schema]);

  const chosen = view ? chosenOf(view.datasets, schema) : null;

  function choose(next: string) {
    if (!view || !chosenOf(view.datasets, next)) return;
    setSchema(next); setResult(null); setMessage(null); setNotice(null);
  }

  run.current = () => { void doRun(); };
  async function doRun() {
    if (!editor.current || busy || schema === null) return;
    setBusy(true); setMessage(null); setNotice(null);
    try {
      const r = await exploreApi.run(schema, editor.current.getText());
      if ('error' in r) { setResult(null); setMessage(exploreError(r.error)); } else setResult(r);
    } catch (e) { setResult(null); setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function saveFlagship() {
    if (!editor.current || busy || !chosen || !flagshipOffered(chosen.dataset)) return;
    setBusy(true); setMessage(null); setNotice(null);
    try { setNotice(flagshipNotice(await exploreApi.flagship(chosen.schema.name, editor.current.getText()))); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  const head = <PageHead section="sql" title={EXPLORE_TITLE} crumb={crumbParts({ section: 'sql', hideLabels: false })} />;
  if (!view) return <section className="explore">{head}{error ? <p role="alert">{error}</p> : <p>Loading the tables...</p>}</section>;
  const waiting = toPrepare(view.datasets);
  return (
    <section className="explore">
      {head}
      <p className="muted">{EXPLORE_INTRO}</p>
      {schema === null && <p className="notice">No dataset is ready yet. Prepare one from the list below.</p>}
      {schema !== null && (
        <div className="exercise">
          {/* P1 finding 5: the editor, Run and the result are one column, with the Tables card beside it as in an exercise. */}
          <div className="explore-main">
            <p>
              <label>Dataset{' '}
                <select value={schema} disabled={busy} onChange={(e) => choose(e.target.value)} data-dataset-picker>
                  {pickerGroups(view.datasets).map((g) => (
                    <optgroup key={g.heading} label={g.heading}>
                      {g.options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.text}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            </p>
            {chosen && <DatasetCard dataset={chosen.dataset} schema={chosen.schema} />}
            <div ref={host} data-explore-editor />
            <p><button type="button" disabled={busy} onClick={() => void doRun()}>Run</button> <span className="muted">Ctrl+Enter also runs.</span></p>
            {chosen && flagshipOffered(chosen.dataset) && (
              <p><button type="button" disabled={busy} onClick={() => void saveFlagship()}>{FLAGSHIP_BUTTON}</button> <span className="muted">{FLAGSHIP_HINT}</span></p>
            )}
            {message && <p role="alert" className="notice" data-explore-error>{message}</p>}
            {notice && <p role="status" className="notice" data-flagship-notice>{notice}</p>}
            {result && <ResultTable result={result} caption="Your result" />}
          </div>
          <SchemaPanel notes={notesOf(view.notes, schema)} />
        </div>
      )}
      {waiting.length > 0 && (
        <section aria-labelledby="explore-to-prepare">
          <h2 id="explore-to-prepare">{TO_PREPARE_HEADING}</h2>
          {waiting.map((d) => <DatasetCard key={d.id} dataset={d} />)}
        </section>
      )}
    </section>
  );
}

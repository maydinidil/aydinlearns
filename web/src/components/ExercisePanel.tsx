import { useEffect, useRef, useState } from 'react';
import { api, type ItemView, type PublicGrade } from '../api.ts';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import type { Phase } from '../../../core/envelope.ts';
import type { DisplayOk, RunnerError } from '../../../server/runner/protocol.ts';
import { createSqlEditor, type SqlEditor } from '../editor/sql-editor.ts';
import { editorStart, type Stage } from '../lib/lesson-flow.ts';
import { afterGrade, afterRun, beforeSubmit, canDispute, closeReason, closesOnUnmount, isClosedError, keyFailed, newInstance, overrideOrReopen, retryIfClosed, rulesBadge, sessionEndsSeen, showsRunTable, type Instance, type ResultArea } from '../lib/exercise.ts';
import { FIX_INTRO, fixStarter, itemLabels, labelsVisible, loadTitles, type Titles } from '../lib/labels.ts';
import { HELP_LINE, stopHandler } from '../lib/drill-flow.ts';
import { SchemaPanel } from './SchemaPanel.tsx';
import { ResultTable } from './ResultTable.tsx';
import { GradePanel } from './GradePanel.tsx';
import { SqlCode } from './SqlCode.tsx';

export interface ClosedResult { passed: boolean; failedGraded: number; helped: boolean }

type Props = {
  itemId: string; phase: Phase; stage?: Stage; onClosed?: (r: ClosedResult) => void;
  /** The instance id /api/serve or /api/mixed/start minted (Task B15); the server then owns the phase, block and repeat flag. Absent: the panel mints its own. */
  instanceId?: string;
  /** S2-39: the concept name, lesson title, level badge and item ID stay hidden until after a submission. */
  hideLabels?: boolean;
  /** A heading over the exercise that names no concept, such as "Review exercise". */
  heading?: string;
  /** Show the line with the item's concept, level and ID (with hideLabels, only after a submission). */
  labels?: boolean;
  /**
   * A timed drill run (Task B16): no hint or "show answer" buttons, only the line that help opens in the end-of-run review; and a 409
   * on an answer means the run has stopped, so the panel calls `onStopped` instead of reopening the item as a new instance.
   */
  run?: { onStopped: () => void };
  /** The end-of-run review is for help: no Run and no Submit (a submit on a closed drill instance would reopen a stray free attempt). */
  reviewOnly?: boolean;
};

const REOPENED = 'Your session ended, so this exercise was reopened. Your query is kept.';
const REOPENED_DISPUTE = 'Your session ended, so this exercise was reopened and "I was right" was not saved. Your query is kept: submit it again, then use "I was right" if you still think your answer is right.';
const runError = (e: RunnerError): string => ('message' in e ? e.message : e.kind === 'timeout' ? 'Stopped: the query took too long. It may be multiplying rows.' : 'The query could not run.');

/** One exercise. Keyed by item, stage, phase and served instance, so every item gets a fresh instance: its own id, flags and close. */
export function ExercisePanel(props: Props) {
  return <ExercisePanelInner key={`${props.itemId}:${props.stage ?? ''}:${props.phase}:${props.instanceId ?? ''}`} {...props} />;
}

function ExercisePanelInner({ itemId, phase, stage = 3, onClosed, instanceId, hideLabels = false, heading, labels = false, run, reviewOnly = false }: Props) {
  const [data, setData] = useState<{ item: ItemView; schemaNotes: TableNote[] } | null>(null);
  // A fix item's own query, run when the item opens (S2-48), so the learner sees the wrong result it gives.
  const [starter, setStarter] = useState<{ result: DisplayOk | null; error: string | null } | null>(null);
  const [titles, setTitles] = useState<Titles | null>(null);
  const [submitted, setSubmitted] = useState(false);              // once a grade came back, hidden labels may show
  const [results, setResults] = useState<ResultArea<PublicGrade>>({ run: null, grade: null });
  const [message, setMessage] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [answer, setAnswer] = useState<{ sql: string; display: DisplayOk | null } | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | null>(null);
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState(false);
  // A help request in flight keeps its button disabled, so a double-click cannot send it twice (aydinlearns F2, F3).
  const [hintBusy, setHintBusy] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [overridden, setOverridden] = useState<string | null>(null);     // the attempt "I was right" was used on
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<SqlEditor | null>(null);
  const instance = useRef<Instance>(instanceId ? { ...newInstance(), id: instanceId } : newInstance());
  // The page's session-end count when this instance opened: a session end after it closed the instance on the server.
  const endsWhenOpened = useRef(sessionEndsSeen());
  const grading = useRef<Promise<unknown>>(Promise.resolve());           // the submission in flight, if any
  const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The editor keeps the callbacks it was created with, so it calls through a ref that always holds the latest ones.
  const keys = useRef({ run: () => {}, submit: () => {} });
  keys.current = { run: () => void doRun(), submit: () => void doSubmit() };

  useEffect(() => {
    // React's development mode unmounts and remounts once on mount; the remount cancels the close the cleanup scheduled.
    clearTimeout(leaving.current);
    let alive = true;
    api.item(itemId, stage).then((d) => alive && setData(d), (e: Error) => setMessage(e.message));   // the stage's faded shape only (Task B13)
    return () => {
      alive = false;
      // Deferred by a tick so that only a real unmount closes the item, and written only after a
      // submission in flight has been logged, so the close never comes before its attempt. Not after a session end that
      // came since the instance opened: that end closed it, and a close would start a new session (Task B15, fix round 1).
      leaving.current = setTimeout(() => {
        void grading.current.then(() => {
          const i = instance.current;
          if (!closesOnUnmount(i, endsWhenOpened.current, sessionEndsSeen())) return;
          i.closed = true;
          return api.itemClose(itemId, i.id, closeReason(i), phase, i.startedAt);
        }).catch(() => {});
      }, 0);
    };
  }, [itemId]);

  useEffect(() => {
    if (!data || !editorHost.current) return;
    // A faded item opens as its locked prefix and suffix with the blank between them; Run and Submit send the whole text.
    const start = editorStart(data.item, stage);
    const schema = Object.fromEntries(data.schemaNotes.map((n) => [n.table, n.sample.columns]));
    editor.current = createSqlEditor({ parent: editorHost.current, text: start.text, locked: start.locked, schema, onRun: () => keys.current.run(), onSubmit: () => keys.current.submit() });
    return () => editor.current?.destroy();
  }, [data, stage]);

  useEffect(() => {
    const sql = data ? fixStarter(data.item) : null;
    if (sql === null) return;
    let alive = true;
    api.run(itemId, sql).then((r) => { if (alive) setStarter('error' in r ? { result: null, error: runError(r.error) } : { result: r, error: null }); },
      (e: Error) => { if (alive) setStarter({ result: null, error: e.message }); });
    return () => { alive = false; };
  }, [data, itemId]);

  // Titles only for the labels line; without them it shows the concept's ID.
  useEffect(() => { if (labels) loadTitles(api.curriculum).then(setTitles, () => {}); }, [labels]);

  /** Shows a failed call's message instead of dropping it. */
  function alertOnError(p: Promise<unknown>) { p.catch((e: Error) => setMessage(e.message)); }

  /**
   * The server closed this instance (a session end), so start a new one: a new id, start time and
   * counters. The editor is left alone. Hints, the answer and the grade belonged to the closed
   * instance, so they go; asking again logs them on the new one.
   */
  function reopen() {
    instance.current = newInstance();
    endsWhenOpened.current = sessionEndsSeen();
    setHints([]);
    setAnswer(null);
    setResults(beforeSubmit);
    setMessage(REOPENED);
  }
  /** Calls the server for the open instance, reopening it and trying once more if the server has closed it. */
  function onInstance<T>(call: (i: Instance) => Promise<T>): Promise<T> {
    if (run) return call(instance.current).catch((e: unknown) => { if (isClosedError(e)) run.onStopped(); throw e; });
    return retryIfClosed(() => instance.current, reopen, call);
  }

  async function doRun() {
    if (!editor.current || busy || reviewOnly) return;
    setBusy(true); setMessage(null);
    try {
      const r = await api.run(itemId, editor.current.getText());
      if ('error' in r) { setResults((s) => afterRun(s, null)); setMessage(runError(r.error)); }
      else setResults((s) => afterRun(s, r));
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function doSubmit() {
    if (!editor.current || busy || disputing || reviewOnly) return;     // the keyboard shortcut too, while "I was right" is sent
    setBusy(true); setMessage(null); setResults(beforeSubmit);
    const sql = editor.current.getText();
    // The grade is counted on the instance it was logged on, which a retry may have replaced.
    const submitted = onInstance(async (i) => ({ i, g: await api.submit({ item_id: itemId, item_instance_id: i.id, sql, phase,
      fading_stage: data?.item.fading ? stage : null, confidence, started_at: i.startedAt, active_ms: Date.now() - i.started }) }));
    grading.current = submitted.catch(() => {});
    try {
      const { i, g } = await submitted;
      setResults(afterGrade(g));
      setSubmitted(true);
      if (g.outcome === 'pass') i.passed = true;
      else if (g.graded) i.failed++;
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function nextHint() {
    setHintBusy(true);
    try {
      const r = await onInstance(async (i) => {
        const level = (i.hints + 1) as 1 | 2 | 3;
        i.helped = true;
        const { text } = await api.hint(itemId, i.id, level, phase);
        i.hints = level;
        return text;
      });
      setHints((h) => [...h, r]);
    } finally { setHintBusy(false); }
  }

  async function showAnswer() {
    if (!confirm('Show the answer? Using it lowers this item\'s rating. You can still try the item yourself.')) return;
    setAnswer(await onInstance((i) => { i.helped = true; return api.showAnswer(itemId, i.id, phase); }));
  }

  async function dispute(grade: PublicGrade, row: unknown[] | null) {
    const i = instance.current;
    setDisputing(true);
    // A session end closed the instance (a 409): it reopens, and nothing is retried, because the new instance has
    // no failed attempt to dispute.
    const saved = await overrideOrReopen(() => api.override(itemId, i.id, row), stopHandler(run, reopen)).finally(() => setDisputing(false));
    if (!saved) { if (!run) setMessage(REOPENED_DISPUTE); return; }
    // An unconfirmed override passes the item for the lesson block, but is never an unassisted solve (ruling I5).
    i.passed = true;
    i.helped = true;
    setOverridden(grade.attempt_id);
    setMessage('Marked as right. It will be checked in the weekly tune-up.');
  }

  // No reopen here: the server answers an already-closed instance's close with 200 and writes nothing.
  async function close() {
    const i = instance.current;
    if (i.closed) return;
    i.closed = true;
    try { await api.itemClose(itemId, i.id, closeReason(i), phase, i.startedAt); } catch (e) { i.closed = false; throw e; }
    onClosed?.({ passed: i.passed, failedGraded: i.failed, helped: i.helped });
  }

  if (!data) return <>{heading && <h2>{heading}</h2>}<p>{message ?? 'Loading the exercise...'}</p></>;
  const { item, schemaNotes } = data;
  const grade = results.grade;
  const fix = fixStarter(item) !== null;
  const shown = labels && labelsVisible(hideLabels, submitted) ? itemLabels(item, titles) : null;
  // When the exercise's own answer key failed, the report form opens right under the grade, so reporting it is the obvious next step.
  const keyFault = grade !== null && keyFailed(grade);
  const reportForm = (
    <details open={keyFault}>
      <summary>Report a content error</summary>
      <textarea value={report} onChange={(e) => setReport(e.target.value)} aria-label="What is wrong with this exercise?" />
      <button type="button" disabled={!report.trim()} onClick={() => alertOnError(api.report(itemId, report).then(() => { setReport(''); setMessage('Thanks, reported.'); }))}>Send</button>
    </details>
  );
  return (
    <div className="exercise">
      <section>
        {heading && <h2>{heading}</h2>}
        {shown && (
          <p className="muted item-labels">Concept: <a href={`#/lesson/${shown.conceptId}`}>{shown.concept}</a>
            {shown.level && <> <span className="badge">{shown.level}</span></>} Exercise <code>{shown.itemId}</code></p>
        )}
        <div className="card exercise-card">
        <p className="prompt">{item.prompt}</p>
        {item.output_contract && (
          <p className="contract">Return: {item.output_contract.columns.map((c) => `${c.name} (${c.type_class})`).join(', ')}
            {item.output_contract.grain && (item.level ?? 1) <= 2 ? `. ${item.output_contract.grain[0]!.toUpperCase()}${item.output_contract.grain.slice(1)}.` : ''}</p>
        )}
        <ul className="badge-list">{rulesBadge(item.rules).map((b) => <li key={b}>{b}</li>)}</ul>
        {fix && (
          <div className="fix-start">
            <p><strong>{FIX_INTRO}</strong></p>
            {starter === null && <p className="muted">Running the query...</p>}
            {starter?.result && <ResultTable result={starter.result} caption="Its result" />}
            {starter?.error && <p role="alert">The query could not be run here: {starter.error}</p>}
          </div>
        )}
        <div ref={editorHost} />
        <div className="toolbar">
          {!reviewOnly && <button type="button" onClick={() => void doRun()} disabled={busy}>Run (Ctrl+Enter)</button>}
          <label>How sure are you? <select value={confidence ?? ''} onChange={(e) => setConfidence(e.target.value ? Number(e.target.value) as 1 | 2 | 3 | 4 : null)}>
            <option value="">skip</option><option value="1">1 guessing</option><option value="2">2 unsure</option><option value="3">3 fairly sure</option><option value="4">4 certain</option></select></label>
          {/* Submit and Leave are disabled while a query runs or grades, so the close is never written before the attempt,
              and while "I was right" is sent, so neither races the override (aydinlearns F4). */}
          {!reviewOnly && <button type="button" className="btn-main" onClick={() => void doSubmit()} disabled={busy || disputing}>Submit (Ctrl+Shift+Enter)</button>}
          <button type="button" onClick={() => alertOnError(close())} disabled={busy || disputing}>{instance.current.passed ? 'Next' : 'Leave this item'}</button>
        </div>
        </div>
        {message && <p role="alert">{message}</p>}
        {grade && <GradePanel grade={grade} onDispute={canDispute(grade, overridden) ? (r) => alertOnError(dispute(grade, r)) : null} disputing={disputing} />}
        {keyFault && reportForm}
        {showsRunTable(results) && <ResultTable result={results.run} caption="Your result" />}
        {run ? <p className="muted help">{HELP_LINE}</p> : <div className="help">
          <p className="muted">Help is always here. Using it lowers this item's rating.</p>
          {hints.map((h, i) => <p key={i}><strong>Hint {i + 1}:</strong> {i === 2 ? <code>{h}</code> : h}</p>)}
          {hints.length < 3 && <button type="button" className="link-quiet" onClick={() => alertOnError(nextHint())} disabled={hintBusy}>{hints.length === 2 ? 'Show part of the answer (hint 3)' : `Hint ${hints.length + 1}`}</button>}
          {!answer && <button type="button" className="link-quiet" onClick={() => alertOnError(showAnswer())}>Show answer</button>}
          {answer && <div><p><strong>One correct answer:</strong></p><SqlCode sql={answer.sql} />{answer.display && <ResultTable result={answer.display} caption="Its result" />}</div>}
        </div>}
        {!keyFault && reportForm}
      </section>
      <SchemaPanel notes={schemaNotes} />
    </div>
  );
}

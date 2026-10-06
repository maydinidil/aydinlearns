// web/src/screens/DrillScreen.tsx: the drill screen (design §14; rulings D9, D10, S2-42 to S2-44, S2-98; Task B16). A timed
// level drill or a drill on concepts the learner picks, the end-of-run review (where help opens), and the score history.
// Nothing is locked: any level's drill and a chosen drill can start at any time. The countdown is display only; the server is
// the clock, so at 0 this screen asks the server to end the run and shows the server's score.
import { useEffect, useRef, useState } from 'react';
import { api, type ConceptView, type DrillEnded, type DrillHistoryRow, type DrillSpecView, type DrillStarted } from '../api.ts';
import { ga4RunFromRefusal } from '../lib/run-flow.ts';
import type { Level } from '../../../schemas/concepts.ts';
import { ExercisePanel } from '../components/ExercisePanel.tsx';
import {
  EndGuard, HELP_LINE, HISTORY_COLUMNS, TIME_UP, countdownText, endWithRetry, hiddenFlags, historyRows, levelLine, recallIndex, remainingSeconds, rememberIndex,
  runFromRefusal, scoreLine, unseenLine, type DrillState,
} from '../lib/drill-flow.ts';

export function DrillScreen() {
  const [state, setState] = useState<DrillState>({ kind: 'choose' });
  const [levels, setLevels] = useState<{ level: Level; spec: DrillSpecView | null }[]>([]);
  const [concepts, setConcepts] = useState<ConceptView[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [history, setHistory] = useState<DrillHistoryRow[]>([]);
  const [run, setRun] = useState<DrillStarted | null>(null);
  const [result, setResult] = useState<DrillEnded | null>(null);
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = useRef(new EndGuard());
  const [endFailed, setEndFailed] = useState(false);       // the end could not be reached after a few tries: stop the clock's retries
  const heading = useRef<HTMLHeadingElement>(null);

  async function loadChoices(): Promise<void> {
    try {
      const [cur, all] = await Promise.all([api.curriculum(), api.drillHistory()]);
      setConcepts(cur.concepts.filter((c) => c.hasContent));
      setHistory(all.runs);
      const specs = await Promise.all(cur.levels.map((l) => api.drillHistory(l.number).then((h) => h.drill, (): null => null)));
      setLevels(cur.levels.map((level, i) => ({ level, spec: specs[i] ?? null })));
    } catch (e) { setMessage((e as Error).message); }
  }
  useEffect(() => { void loadChoices(); void api.drillCurrent().then((c) => { if (c.run) resume(c.run); }, () => {}); }, []);
  // Focus follows the screen change, so a screen reader hears the new heading.
  useEffect(() => { heading.current?.focus(); }, [state.kind]);

  /** Puts a run that is on back on screen (the learner left the screen, or reloaded it): the same instances, the same clock. */
  function resume(r: DrillStarted) {
    guard.current = new EndGuard();
    setEndFailed(false);
    setRun(r); setResult(null); setTimeUp(false); setIndex(recallIndex(r.block_id, r.servings.length));
    setState({ kind: 'running' });
  }
  const goTo = (i: number) => { setIndex(i); if (run) rememberIndex(run.block_id, i); };

  /**
   * Ends the run on the server (idempotent) and shows its score from the answer. One end at a time, none once the run has ended
   * (a late tick after a manual end must not say "Time is up."), and a few tries with a pause before the error shows.
   */
  async function endRun(block: string, byTime: boolean): Promise<void> {
    if (!guard.current.begin()) return;
    try {
      const r = await endWithRetry(() => api.drillEnd(block));
      guard.current.done();
      setResult(r);
      setTimeUp(byTime);
      setIndex(0);
      setState({ kind: 'review' });
      void api.drillHistory().then((h) => setHistory(h.runs), () => {});
    } catch (e) {
      guard.current.failed();
      setEndFailed(true);
      setMessage(`The drill could not be ended: ${(e as Error).message}`);
    }
  }

  // The countdown only displays; at 0 the server is asked to end the run (it has stopped it already).
  useEffect(() => {
    if (state.kind !== 'running' || !run) return;
    const stop = Date.parse(run.ends_at);
    const tick = () => { const s = remainingSeconds(stop, Date.now()); setLeft(s); if (s === 0 && !endFailed) void endRun(run.block_id, true); };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [state.kind, run, endFailed]);

  async function start(body: { level: number } | { concept_ids: string[] }): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.drillStart(body);
      resume(r);
    } catch (e) {
      const on = runFromRefusal(e);
      if (ga4RunFromRefusal(e)) { setMessage('A GA4 timed run is on. Opening it.'); location.hash = '#/ga4/run'; }   // never resumed as an SQL drill
      else if (on) resume(on);                 // a run is already on: pick it up instead of leaving it stranded
      else setMessage((e as Error).message);
    }   // the server's reason: a pool not written yet, or a drill already on
    finally { setBusy(false); }
  }

  function backToChoices() {
    setState({ kind: 'choose' }); setRun(null); setResult(null); setMessage(null);
    void loadChoices();
  }

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const questionNav = run && (
    <nav aria-label="Questions" className="steps">{run.servings.map((s, i) => (
      <button key={s.item_instance_id} type="button" aria-pressed={i === index} onClick={() => goTo(i)}>{i === index ? <strong>Question {i + 1}</strong> : `Question ${i + 1}`}</button>
    ))}</nav>
  );
  const serving = run?.servings[index];
  const next = () => goTo(run ? Math.min(index + 1, run.servings.length - 1) : index);

  if (state.kind === 'running' && run && serving) {
    return (
      <section>
        <h1 ref={heading} tabIndex={-1}>{run.kind === 'level' ? `Level ${run.level} drill` : 'Drill on chosen concepts'}</h1>
        <p><strong role="timer">{countdownText(left)}</strong> <span className="muted">{run.questions} questions, pass at {run.pass_pct}%.</span></p>
        <p className="muted">{HELP_LINE}</p>
        {message && <p role="alert" className="notice">{message}</p>}
        {questionNav}
        {/* Every question's panel stays mounted (hidden when not current), so a half-written answer is kept when moving between questions. */}
        {run.servings.map((sv, i) => (
          <div key={sv.item_instance_id} hidden={hiddenFlags(run.servings.length, index)[i]}>
            <ExercisePanel itemId={sv.item_id} phase="drill" instanceId={sv.item_instance_id} hideLabels
              heading={`Question ${i + 1} of ${run.servings.length}`} run={{ onStopped: () => void endRun(run.block_id, true) }} onClosed={next} />
          </div>
        ))}
        {endFailed && <p><button type="button" onClick={() => { setEndFailed(false); setMessage(null); void endRun(run.block_id, true); }}>Try ending the drill again</button></p>}
        <p><button type="button" onClick={() => void endRun(run.block_id, false)}>End the drill and see the review</button></p>
      </section>
    );
  }

  if (state.kind === 'review' && run && result && serving) {
    return (
      <section>
        <h1 ref={heading} tabIndex={-1}>{run.kind === 'level' ? `Level ${run.level} drill: review` : 'Drill review'}</h1>
        {timeUp && <p role="status"><strong>{TIME_UP}</strong></p>}
        <p role="status">{scoreLine(result.score)}</p>
        <p>{unseenLine(result.score, run)}</p>
        <p className="muted">The review is open: hints and "show answer" work on every item and lower its rating.</p>
        {message && <p role="alert" className="notice">{message}</p>}
        {questionNav}
        {run.servings.map((sv, i) => (
          <div key={sv.item_instance_id} hidden={hiddenFlags(run.servings.length, index)[i]}>
            <ExercisePanel itemId={sv.item_id} phase="drill" instanceId={sv.item_instance_id} heading={`Question ${i + 1} of ${run.servings.length}`}
              labels reviewOnly onClosed={next} />
          </div>
        ))}
        <p><button type="button" onClick={backToChoices}>Back to drills</button></p>
      </section>
    );
  }

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>Drill</h1>
      <p className="muted">A timed run. Every level's drill is open at any time. {HELP_LINE}</p>
      {message && <p role="alert" className="notice">{message}</p>}
      <h2>Level drills</h2>
      <ul>{levels.map(({ level, spec }) => (
        <li key={level.id}>
          <strong>{level.title}</strong>{' '}
          {spec ? levelLine(spec) : 'No drill is written for this level yet.'}{' '}
          <button type="button" className="btn-main" disabled={busy} aria-label={`Start level ${level.number} drill`} onClick={() => void start({ level: level.number })}>Start drill</button>
        </li>
      ))}</ul>
      <h2>Choose your own</h2>
      <fieldset>
        <legend>Concepts for a chosen drill</legend>
        {concepts.length === 0 && <p className="muted">No concepts have exercises yet.</p>}
        {concepts.map((c) => (
          <label key={c.id} style={{ display: 'block' }}><input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} /> {c.title}</label>
        ))}
      </fieldset>
      <p><button type="button" disabled={busy || chosen.length === 0} aria-label="Start a drill on the chosen concepts" onClick={() => void start({ concept_ids: chosen })}>Start chosen drill</button></p>
      <h2>History</h2>
      {history.length === 0 ? <p className="muted">No drills yet.</p> : (
        <table>
          <thead><tr>{HISTORY_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{historyRows(history).map((r) => <tr key={r.key}>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

// web/src/screens/DrillScreen.tsx: the drill screen (design §14; rulings D9, D10, S2-42 to S2-44, S2-98; Task B16). A timed
// level drill or a drill on concepts the learner picks, the end-of-run review (where help opens), and the score history.
// Nothing is locked: any level's drill and a chosen drill can start at any time. The countdown is display only; the server is
// the clock, so at 0 this screen asks the server to end the run and shows the server's score. Either drill may start in screen mode
// (S4B-23): the same items, time limit and pass mark, graded and edited as an online test is (S4B-22); the history shows the mode.
import { useEffect, useRef, useState } from 'react';
import { api, type ConceptView, type DrillEnded, type DrillSpecView, type DrillStarted } from '../api.ts';
import { ga4RunFromRefusal } from '../lib/run-flow.ts';
import { drillFocusKey, focusHeading, shouldFocusDrill } from '../lib/focus-flow.ts';
import { liveRepStart, tickExplainedAloud } from '../lib/live-rep-api.ts';
import type { Level } from '../../../schemas/concepts.ts';
import { ExercisePanel } from '../components/ExercisePanel.tsx';
import { Crumb } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { NO_DRILL_LINE } from '../lib/polish-p2b.ts';
import {
  EXPLAINED_ALOUD_LABEL, EndGuard, HELP_LINE, HISTORY_COLUMNS, LIVE_REP_HINT, LIVE_REP_LABEL, SCREEN_MODE_HINT, SCREEN_MODE_LABEL, TIME_UP, countdownText, endWithRetry, hiddenFlags, historyRows, levelRule, recallIndex,
  isLiveRun, historyTickDisabled, historyTickSaves, liveRepLine, remainingSeconds, rememberIndex, runFromRefusal, scoreLine, startBody, tickFromHistory, unseenLine,
  type DrillState, type HistoryRun,
} from '../lib/drill-flow.ts';

/** The crumb of every drill screen: labels stay hidden in a drill (S2-39), so it names the section and the place only. */
const DRILL_CRUMB = crumbParts({ section: 'sql', place: 'Drill', hideLabels: true });

export function DrillScreen() {
  const [state, setState] = useState<DrillState>({ kind: 'choose' });
  const [levels, setLevels] = useState<{ level: Level; spec: DrillSpecView | null }[]>([]);
  const [concepts, setConcepts] = useState<ConceptView[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [screenMode, setScreenMode] = useState(false);       // S4B-23: the next start is in screen mode
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [run, setRun] = useState<DrillStarted | null>(null);
  const [result, setResult] = useState<DrillEnded | null>(null);
  const [index, setIndex] = useState(0);
  const [passedIds, setPassedIds] = useState<ReadonlySet<string>>(new Set());   // instances that passed in this run: "other ways" in the review (S4-12)
  const [left, setLeft] = useState(0);
  const [timeUp, setTimeUp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [explained, setExplained] = useState(false);       // S4B-26: the live rep's "explained aloud" tick, as the server holds it
  const [runKnown, setRunKnown] = useState(false);         // D50: the first look for a run in progress has settled
  const [saving, setSaving] = useState(false);             // D50: a tick from the history is on its way to the server
  const guard = useRef(new EndGuard());
  const [endFailed, setEndFailed] = useState(false);       // the end could not be reached after a few tries: stop the clock's retries
  const heading = useRef<HTMLHeadingElement>(null);
  const lastFocusKey = useRef<string | null>(null);       // what the screen showed when focus was last considered
  const loaded = useRef(false);                           // the first load (a run that is already on) has settled

  async function loadChoices(): Promise<void> {
    try {
      const [cur, all] = await Promise.all([api.curriculum(), api.drillHistory()]);
      setConcepts(cur.concepts.filter((c) => c.hasContent));
      setHistory(all.runs);
      const specs = await Promise.all(cur.levels.map((l) => api.drillHistory(l.number).then((h) => h.drill, (): null => null)));
      setLevels(cur.levels.map((level, i) => ({ level, spec: specs[i] ?? null })));
    } catch (e) { setMessage((e as Error).message); }
  }
  useEffect(() => { void loadChoices(); void api.drillCurrent().then((c) => {
    loaded.current = true;
    setRunKnown(true);
    // A run picked up on load is not a change the learner made: record it as already shown, so focus stays where it is.
    if (c.run) { lastFocusKey.current = drillFocusKey('running', c.run, recallIndex(c.run.block_id, c.run.servings.length)); resume(c.run); }
  }, () => { loaded.current = true; setRunKnown(true); }); }, []);
  // Focus moves when the question changes (to its heading) or the drill screen changes (to the page heading). Not on a grade
  // result, a timer tick or a message, and not on the first load (Task A2).
  useEffect(() => {
    const key = drillFocusKey(state.kind, run, index);
    const prev = lastFocusKey.current;
    lastFocusKey.current = key;
    if (!shouldFocusDrill(prev, key, loaded.current)) return;
    const sameScreen = prev !== null && prev.split(':')[0] === key.split(':')[0];
    const question = sameScreen ? document.querySelector<HTMLElement>(`[data-question="${index}"] h2`) : null;
    if (!focusHeading(question)) heading.current?.focus();
  }, [state.kind, run, index]);

  /** Puts a run that is on back on screen (the learner left the screen, or reloaded it): the same instances, the same clock. */
  function resume(r: DrillStarted) {
    guard.current = new EndGuard();
    setEndFailed(false);
    setExplained(false);
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
    await launch(() => api.drillStart(startBody(body, screenMode)));
  }
  /** S4B-26: a live rep starts like a drill: one unseen exercise, in screen mode whatever the box above says. */
  const startLive = (): Promise<void> => launch(liveRepStart);

  async function launch(begin: () => Promise<DrillStarted>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await begin();
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

  /** The tick is the server's word: the box follows the answer, and the history is read again. */
  async function tick(checked: boolean): Promise<void> {
    if (!run) return;
    setMessage(null);
    try {
      await tickExplainedAloud(run.block_id, checked);
      setExplained(checked);
      void api.drillHistory().then((h) => setHistory(h.runs), () => {});
    } catch (e) { setMessage((e as Error).message); }
  }
  const live = run !== null && isLiveRun(run.block_id);

  /**
   * D50: the "Explained aloud" box on a live rep's history row, for a rep whose review is closed. It posts the same self-check as the
   * review's box; the row follows the server's answer at once, and the history is read again.
   */
  async function tickRow(blockId: string, checked: boolean): Promise<void> {
    if (!historyTickSaves({ saving })) return;
    setSaving(true);
    setMessage(null);
    try {
      setHistory(await tickFromHistory(blockId, checked, tickExplainedAloud));
      void api.drillHistory().then((h) => setHistory(h.runs), () => {});
    } catch (e) { setMessage((e as Error).message); }
    finally { setSaving(false); }
  }
  const tickOff = historyTickDisabled({ state, runKnown, busy });

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const questionNav = run && (
    <nav aria-label="Questions" className="qstrip">{run.servings.map((s, i) => (
      <button key={s.item_instance_id} type="button" aria-pressed={i === index} aria-label={`Question ${i + 1}`} onClick={() => goTo(i)}>{i === index ? <strong>{i + 1}</strong> : i + 1}</button>
    ))}</nav>
  );
  const serving = run?.servings[index];
  const next = () => goTo(run ? Math.min(index + 1, run.servings.length - 1) : index);

  if (state.kind === 'running' && run && serving) {
    return (
      <section>
        <Crumb section="sql" crumb={DRILL_CRUMB} />
        <h1 ref={heading} tabIndex={-1}>{live ? LIVE_REP_LABEL : run.kind === 'level' ? `Level ${run.level} drill` : 'Drill on chosen concepts'}{run.screen_mode ? ` (${SCREEN_MODE_LABEL.toLowerCase()})` : ''}</h1>
        <div className="card run-bar">
          <div className="run-bar-text">
            <p className="muted">{live ? 'One question.' : `${run.questions} questions, pass at ${run.pass_pct}%.`}</p>
            <p className="muted">{HELP_LINE}</p>
          </div>
          <p className="run-timer"><strong role="timer">{countdownText(left)}</strong></p>
        </div>
        {message && <p role="alert" className="notice">{message}</p>}
        {!live && questionNav}
        {/* Every question's panel stays mounted (hidden when not current), so a half-written answer is kept when moving between questions. */}
        {run.servings.map((sv, i) => (
          <div key={sv.item_instance_id} data-question={i} hidden={hiddenFlags(run.servings.length, index)[i]}>
            <ExercisePanel itemId={sv.item_id} phase="drill" instanceId={sv.item_instance_id} hideLabels
              heading={`Question ${i + 1} of ${run.servings.length}`} run={{ onStopped: () => void endRun(run.block_id, true) }} onClosed={next} screenMode={run.screen_mode === true}
              onPassed={() => setPassedIds((s) => new Set(s).add(sv.item_instance_id))} />
          </div>
        ))}
        {endFailed && <p><button type="button" onClick={() => { setEndFailed(false); setMessage(null); void endRun(run.block_id, true); }}>Try ending the drill again</button></p>}
        <p><button type="button" onClick={() => void endRun(run.block_id, false)}>{live ? 'End the rep and see the review' : 'End the drill and see the review'}</button></p>
      </section>
    );
  }

  if (state.kind === 'review' && run && result && serving) {
    return (
      <section>
        <Crumb section="sql" crumb={DRILL_CRUMB} />
        <h1 ref={heading} tabIndex={-1}>{live ? `${LIVE_REP_LABEL}: review` : run.kind === 'level' ? `Level ${run.level} drill: review` : 'Drill review'}</h1>
        {timeUp && <p role="status"><strong>{TIME_UP}</strong></p>}
        {live ? (
          <>
            <p role="status" data-testid="live-rep-result">{liveRepLine(result.score.passed > 0, explained)}</p>
            <p><label><input type="checkbox" data-testid="live-rep-explained" checked={explained} onChange={(e) => void tick(e.target.checked)} /> {EXPLAINED_ALOUD_LABEL}</label></p>
          </>
        ) : (
          <>
            <p role="status">{scoreLine(result.score)}</p>
            <p>{unseenLine(result.score, run)}</p>
          </>
        )}
        <p className="muted">The review is open: hints and "show answer" work on every item and lower its rating.</p>
        {message && <p role="alert" className="notice">{message}</p>}
        {!live && questionNav}
        {run.servings.map((sv, i) => (
          <div key={sv.item_instance_id} data-question={i} hidden={hiddenFlags(run.servings.length, index)[i]}>
            <ExercisePanel itemId={sv.item_id} phase="drill" instanceId={sv.item_instance_id} heading={`Question ${i + 1} of ${run.servings.length}`}
              labels reviewOnly onClosed={next} passedBefore={passedIds.has(sv.item_instance_id)} />
          </div>
        ))}
        <p><button type="button" onClick={backToChoices}>Back to drills</button></p>
      </section>
    );
  }

  return (
    <section>
      <Crumb section="sql" crumb={DRILL_CRUMB} />
      <h1 ref={heading} tabIndex={-1}>Drill</h1>
      <p className="muted">A timed run. Every level's drill is open at any time. {HELP_LINE}</p>
      {message && <p role="alert" className="notice">{message}</p>}
      <p><label><input type="checkbox" checked={screenMode} onChange={(e) => setScreenMode(e.target.checked)} /> {SCREEN_MODE_LABEL}</label>{' '}
        <span className="muted">{SCREEN_MODE_HINT}</span></p>
      <h2>Level drills</h2>
      {/* P1 findings 4 and 17: a level with no drill shows its line and no button; no button on this screen is the main one. */}
      <ul className="inbox-list card">{levels.map(({ level, spec }) => (
        <li key={level.id} className="row">
          <div className="grow">
            <strong>Level {level.number}, {level.title}</strong>
            <p className="muted">{spec ? levelRule(spec) : NO_DRILL_LINE}</p>
          </div>
          {spec ? (
            <span className="chip-col">
              <button type="button" disabled={busy} aria-label={`Start drill: level ${level.number}`} onClick={() => void start({ level: level.number })}>Start drill</button>
            </span>
          ) : null}
        </li>
      ))}</ul>
      <h2>{LIVE_REP_LABEL}</h2>
      <p className="muted">{LIVE_REP_HINT}</p>
      <p><button type="button" data-testid="live-rep-start" disabled={busy} aria-label="Start a live rep" onClick={() => void startLive()}>Start live rep</button></p>
      <h2>Choose your own</h2>
      <fieldset className="card drill-pick">
        <legend>Concepts for a chosen drill</legend>
        {concepts.length === 0 && <p className="muted">No concepts have exercises yet.</p>}
        {concepts.map((c) => (
          <label key={c.id} style={{ display: 'block' }}><input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} /> {c.title}</label>
        ))}
      </fieldset>
      <p><button type="button" disabled={busy || chosen.length === 0} aria-label={`Start chosen drill on ${chosen.length} ${chosen.length === 1 ? 'concept' : 'concepts'}`} onClick={() => void start({ concept_ids: chosen })}>Start chosen drill</button></p>
      <h2>History</h2>
      {history.length === 0 ? <p className="muted">No drills yet.</p> : (
        <div className="table-scroll card"><table className="history-table">
          <thead><tr>{HISTORY_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{historyRows(history).map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => <td key={i}>{c}</td>)}
              <td>{r.tick && (
                <input type="checkbox" data-testid={`history-explained-${r.tick.block_id}`} aria-label={r.tick.name} checked={r.tick.checked} disabled={tickOff} aria-busy={saving || undefined}
                  onChange={(e) => void tickRow(r.tick!.block_id, e.target.checked)} />
              )}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

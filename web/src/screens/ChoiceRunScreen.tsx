// web/src/screens/ChoiceRunScreen.tsx: the GA4 timed runs at #/ga4/run (design §8, §14; rulings S3-02 to S3-04, S3-10, S3-12;
// Task B3; the full mock, sprint 5b Task B4). A mini drill (practice mode: go back, flag, change an answer), a half-mock or a full
// mock (exam mode: forward only, one answer, no confidence question). Inside a run nothing is graded on screen and help waits
// (S3-03); at the end the review opens. The countdown only displays: the server is the clock, so at 0 this screen asks the server
// to end the run and shows its score. Nothing is locked: any run can start at any time.
import { useEffect, useRef, useState } from 'react';
import {
  api, type ChoiceItemView, type ChoiceReveal, type ChoiceServed, type RunBlueprint, type RunHistoryRow, type RunKind, type RunPreview, type RunReview, type RunStarted,
} from '../api.ts';
import { ChoicePanel } from '../components/ChoicePanel.tsx';
import { RUN_HREF, RunHistoryTable } from '../components/Ga4Runs.tsx';
import { Crumb } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { createBusyGate } from '../lib/busy-gate.ts';
import { EndGuard, endWithRetry, remainingSeconds } from '../lib/drill-flow.ts';
import {
  HELP_LINE, RUN_KINDS, TOPIC_COLUMNS, canMoveTo, endNowText, entryNote, endReasonLine, endRefusalNote, flagsAfter, ga4RunFromRefusal, hiddenFlags, isMock, kindLabel, listRows,
  modeRules, overConfirmed, reachedEnd, questionsShown, questionView, readinessNote, recallIndex, recallSet, rememberIndex, rememberSet, resumeIndex, recoveredLine, reviewNote, reviewRows,
  runHeading, runLine, saveFocusTarget, scoreLine, startLabel, timeLeft, topicRows, unansweredNumbers, unlistedLine, unseenComesBack, unseenLine, verdictClass, type ReviewRow, type TopicNames,
} from '../lib/run-flow.ts';

type State = 'choose' | 'running' | 'review';

/** `block`: #/ga4/run/<block_id> opens that ended run's review (B3 I3); a run that is on still comes first. */
export function ChoiceRunScreen({ block = null }: { block?: string | null }) {
  const [state, setState] = useState<State>('choose');
  const [blueprints, setBlueprints] = useState<Record<RunKind, RunBlueprint> | null>(null);
  const [history, setHistory] = useState<RunHistoryRow[]>([]);
  const [names, setNames] = useState<TopicNames>({});
  const [run, setRun] = useState<RunStarted | null>(null);
  const [review, setReview] = useState<RunReview | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<ReadonlySet<number>>(new Set());
  const [flagged, setFlagged] = useState<ReadonlySet<number>>(new Set());
  const [left, setLeft] = useState(0);
  const [endLine, setEndLine] = useState<string | null>(null);      // why the run ended, when the learner did not press End now
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [endFailed, setEndFailed] = useState(false);
  const guard = useRef(new EndGuard());
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<'next' | 'end' | null>(null);   // S5-25: set by a saved exam answer; the effect below moves focus once the screen has updated

  async function loadChoices(): Promise<void> {
    try { const h = await api.runHistory(); setBlueprints(h.blueprints); setHistory(h.runs); setNames(h.topic_names ?? {}); } catch (e) { setMessage((e as Error).message); }
  }
  useEffect(() => { void loadChoices(); void begin(); }, []);
  useEffect(() => { api.runPreview().then(setPreview, () => {}); }, []);   // read only: no run starts and nothing is logged (Ruling A)

  /** A past run's review when the address names one (B3 I3), else a run that is on. A review of a run still on waits (409), so that run resumes. */
  async function begin(): Promise<void> {
    if (block) {
      try { const r = await api.runReview(block); setReview(r); setEndLine(null); setIndex(0); setState('review'); return; }
      catch (e) { setMessage((e as Error).message); }
    }
    try { const c = await api.runCurrent(); if (c.run) resume(c.run); } catch { /* the chooser shows */ }
  }
  useEffect(() => { heading.current?.focus(); }, [state]);
  useEffect(() => { if (focusNext.current) { (focusNext.current === 'end' ? endButton : nextButton).current?.focus(); focusNext.current = null; } }, [answered]);

  /** Puts a run that is on back on screen (the learner left the screen, or reloaded it): the same instances, the same clock. */
  function resume(r: RunStarted) {
    guard.current = new EndGuard();
    setEndFailed(false); setConfirming(false); setMessage(null);
    setRun(r); setReview(null); setEndLine(null);
    // B3 I2: the server says which positions are answered; an exam never reopens before them, whatever this tab remembers.
    setIndex(resumeIndex(r.mode, r.answered ?? [], r.servings.length, recallIndex(r.block_id, r.servings.length)));
    setAnswered(new Set(r.answered ?? []));
    setFlagged(recallSet('flags', r.block_id, r.servings.length));
    setState('running');
  }

  const goTo = (i: number) => {
    if (!run || !canMoveTo(run.mode, index, i, run.servings.length)) return;
    setIndex(i); rememberIndex(run.block_id, i);
  };
  function saved(i: number) {
    if (!run) return;
    if (!modeRules(run.mode).jump) focusNext.current = saveFocusTarget(i, run.servings.length);
    setAnswered((a) => new Set(a).add(i));
  }
  function toggleFlag(i: number) {
    if (!run) return;
    setFlagged((f) => { const n = flagsAfter(f, i); rememberSet('flags', run.block_id, n); return n; });
  }

  /** The server refused an answer as "the run is over" (a code, not text): confirm with the current-run route before ending anything (B3 M1). */
  async function stopped(r: RunStarted, note?: string): Promise<void> {
    try {
      const c = await api.runCurrent();
      if (!overConfirmed(c.run, r.block_id)) { setMessage(note ?? 'The server still has this run on, so it was not ended. Try again.'); return; }
    } catch (e) { setMessage(`The run could not be checked: ${(e as Error).message}`); return; }
    await endRun(r.block_id, endReasonLine(reachedEnd(r.ends_at, Date.now())));     // B3 M2: "Time is up." only when the clock reached the end
  }

  /** Ends the run on the server (idempotent) and opens its review. One end at a time, none once it has ended. */
  async function endRun(block: string, line: string | null): Promise<void> {
    if (!guard.current.begin()) return;
    setConfirming(false);
    try {
      await endWithRetry(() => api.runEnd(block));
      const r = await endWithRetry(() => api.runReview(block));
      guard.current.done();
      setReview(r); setEndLine(line); setIndex(0); setState('review');
      void loadChoices();
    } catch (e) {
      const gone = endRefusalNote(e);
      if (gone) {      // S1: the server never logged this run (a restart before any answer): nothing to review, and a retry would fail the same way
        guard.current.done();
        setState('choose'); setRun(null); setReview(null); setEndFailed(false); setMessage(gone); void loadChoices();
        return;
      }
      guard.current.failed();
      setEndFailed(true);
      setMessage(`The run could not be ended: ${(e as Error).message}`);
    }
  }

  // The countdown only displays; at 0 the server is asked to end the run (it has stopped it already).
  useEffect(() => {
    if (state !== 'running' || !run) return;
    const stop = Date.parse(run.ends_at);
    const tick = () => { const s = remainingSeconds(stop, Date.now()); setLeft(s); if (s === 0 && !endFailed) void endRun(run.block_id, endReasonLine(true)); };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [state, run, endFailed]);

  async function start(kind: RunKind): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { resume(await api.runStart(kind)); }
    catch (e) {
      const on = ga4RunFromRefusal(e);
      if (on) resume(on);                   // a GA4 run is already on: pick it up instead of leaving it stranded
      else setMessage((e as Error).message);   // the server's reason: a pool not written yet, or an SQL drill already on
    } finally { setBusy(false); }
  }
  function backToChoices() {
    if (block) { location.hash = RUN_HREF; return; }       // the address named a review: leave it, which shows the chooser again
    setState('choose'); setRun(null); setReview(null); setMessage(null); void loadChoices();
  }

  // ---- a run is on ------------------------------------------------------------------------------------------------------------
  if (state === 'running' && run) {
    const rules = modeRules(run.mode);
    const view = questionView(run.kind, run.mode);
    const total = run.servings.length;
    const last = index === total - 1;
    const sv = run.servings[index];
    const panel = (i: number) => {
      const s = run.servings[i]!;
      return (
        <div key={s.item_instance_id} className="card q-card" hidden={rules.jump ? hiddenFlags(total, index)[i] : false}>
          <h2>{`Question ${i + 1} of ${total}`}</h2>
          <ChoicePanel itemId={s.item_id} section="ga4" instanceId={s.item_instance_id}
            run={{ mode: run.mode, kind: run.kind, confidence: view.confidence, answeredBefore: answered.has(i), visible: i === index, onSaved: () => saved(i), onStopped: (note) => void stopped(run, note) }} />
        </div>
      );
    };
    return (
      <section>
        <Crumb section="ga4" crumb={crumbParts({ section: 'ga4', place: kindLabel(run.kind), hideLabels: true })} />
        <h1 ref={heading} tabIndex={-1}>{runHeading(run.kind)}</h1>
        <div className="card run-bar">
          <div className="run-bar-text">
            <p className="muted">{runLine(run)}</p>
            {isMock(run.kind) && run.on_unseen === false && (
              <p className="muted">Some of these questions were seen in the last 21 days. Only a mock on unseen questions counts for the readiness check.{run.next_unseen_date ? ` ${unseenComesBack(run.next_unseen_date)}.` : ''}</p>
            )}
            <p className="muted">{HELP_LINE}</p>
          </div>
          <p className="run-timer"><strong role="timer">Time left {timeLeft(left)}</strong></p>
        </div>
        {message && <p role="alert" className="notice">{message}</p>}
        {view.list && (
          <nav aria-label="Questions" className="steps qstrip">{listRows(total, answered, flagged, index).map((r) => (
            <button key={r.n} type="button" className={r.answered ? 'answered' : undefined} aria-pressed={r.current} aria-label={r.label} onClick={() => goTo(r.n - 1)}>
              {r.current ? <strong>{r.n}</strong> : r.n}{r.answered ? ' ✓' : ''}{r.flagged ? ' ⚑' : ''}
            </button>
          ))}</nav>
        )}
        {/* Practice keeps every panel mounted, so a half-written answer survives a move; an exam shows only the current question. */}
        {sv && questionsShown(run.mode, index, total).map((i) => panel(i))}
        <p className="toolbar">
          {rules.goBack && <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)}>Previous</button>}
          {rules.flag && <button type="button" aria-pressed={flagged.has(index)} onClick={() => toggleFlag(index)}>{flagged.has(index) ? 'Remove flag' : 'Flag this question'}</button>}
          {!last && <button type="button" ref={nextButton} onClick={() => goTo(index + 1)}>{rules.jump ? 'Next' : 'Next question'}</button>}
          {!rules.jump && <span className="muted"> You cannot come back to a question.</span>}
        </p>
        {confirming ? (
          <div role="group" aria-label="End the run" className="notice">
            <p>{endNowText(unansweredNumbers(total, answered))}</p>
            <p>
              <button type="button" onClick={() => void endRun(run.block_id, null)}>End now</button>{' '}
              <button type="button" autoFocus onClick={() => setConfirming(false)}>Keep going</button>
            </p>
          </div>
        ) : (
          <p><button type="button" ref={endButton} onClick={() => setConfirming(true)}>End now</button></p>
        )}
        {endFailed && <p><button type="button" onClick={() => { setEndFailed(false); setMessage(null); void endRun(run.block_id, endReasonLine(reachedEnd(run.ends_at, Date.now()))); }}>Try ending the run again</button></p>}
      </section>
    );
  }

  // ---- the review -------------------------------------------------------------------------------------------------------------
  if (state === 'review' && review) {
    const rows = reviewRows(review.kind, review.items, names);
    const unlisted = unlistedLine(review.of, rows.length);     // B2 M7
    const renumbered = recoveredLine(review);                  // F13
    const notCounted = readinessNote(review, run?.next_unseen_date);   // F2 I1: the readiness check's own test
    return (
      <section>
        <Crumb section="ga4" crumb={crumbParts({ section: 'ga4', place: kindLabel(review.kind), hideLabels: true })} />
        <h1 ref={heading} tabIndex={-1}>{`${runHeading(review.kind)}: review`}</h1>
        <div className="card score-card">
          {endLine && <p role="status"><strong>{endLine}</strong></p>}
          <p role="status" className="score-line">{scoreLine(review)}</p>
          {unlisted && <p className="muted">{unlisted}</p>}
          {renumbered && <p className="muted">{renumbered}</p>}
          <p>{review.kind === 'mini_drill' ? unseenLine({ kind: 'mini_drill', unseen: review.unseen, unseen_pct: review.unseen_pct })
            : unseenLine({ kind: review.kind, on_unseen: review.on_unseen, logged_unseen: review.logged_unseen })}</p>
          {notCounted && <p className="muted">{notCounted}</p>}
        </div>
        <h2>By topic</h2>
        <div className="table-scroll card">
          <table>
            <thead><tr>{TOPIC_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>{topicRows(review.by_topic, names).map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <h2>Questions</h2>
        {isMock(review.kind) ? (
          <>
            <p className="muted">{reviewNote(review.kind)}</p>
            <div className="table-scroll card">
              <table>
                <thead><tr><th scope="col">Question</th><th scope="col">Topic</th><th scope="col">Result</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.n}><td>{r.n}</td><td>{r.topic}</td><td className={verdictClass(r.verdict)}>{r.verdict}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <p className="muted">The review is open. Opening an answer is logged.</p>
            <ol className="review-items card">{rows.map((r) => <li key={r.n}><ReviewItem row={r} /></li>)}</ol>
          </>
        )}
        <p><button type="button" onClick={backToChoices}>Back to GA4 runs</button></p>
      </section>
    );
  }

  // ---- choosing ---------------------------------------------------------------------------------------------------------------
  return (
    <section>
      <Crumb section="ga4" crumb={crumbParts({ section: 'ga4', place: 'Timed runs', hideLabels: true })} />
      <h1 ref={heading} tabIndex={-1}>GA4 timed runs</h1>
      <p className="muted">A timed run is a test. Each one is open at any time. {HELP_LINE}</p>
      {message && <p role="alert" className="notice">{message}</p>}
      <ul>{RUN_KINDS.map((k) => (
        <li key={k}>
          <button type="button" disabled={busy} onClick={() => void start(k)}>{startLabel(k)}</button>
          {blueprints && <><br /><span className="muted">{runLine({ kind: k, ...blueprints[k] })}</span></>}
          {entryNote(k, preview) && <><br /><span className="muted">{`${entryNote(k, preview)}.`}</span></>}
        </li>
      ))}</ul>
      <h2>History</h2>
      <div className="card"><RunHistoryTable runs={history} names={names} /></div>
      <p><a href="#/ga4">Back to the GA4 map</a></p>
    </section>
  );
}

/** One mini drill question in the review: right or wrong, and "Show answer", which loads the question, the key and the explanation (logged). */
function ReviewItem({ row }: { row: ReviewRow }) {
  const [shown, setShown] = useState<{ q: ChoiceServed; key: ChoiceReveal } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const gate = useRef(createBusyGate());
  const { item_id: id, item_instance_id: instance } = row;
  if (!id || !instance) return <>{`Question ${row.n}, ${row.topic}: ${row.verdict}`}</>;

  const open = () => void gate.current.run(async () => {
    setMessage(null);
    try {
      const q = await api.choice(id, 'ga4', instance);
      setShown({ q, key: await api.choiceShowAnswer(id, instance, 'drill') });
    } catch (e) { setMessage((e as Error).message); }
  });

  const item = shown?.q.item as ChoiceItemView | undefined;
  const right = shown?.key.correct_oid ?? undefined;
  return (
    <div>
      <strong>{`Question ${row.n}`}</strong>{`, ${row.topic}: `}<span className={row.verdict === 'Right' ? 'ok' : 'bad'}>{row.verdict}</span>{' '}
      {!shown && <button type="button" onClick={open}>Show answer</button>}
      {message && <p role="alert">{message}</p>}
      {shown && item && (
        <div>
          <p className="prompt">{item.stem}</p>
          {item.kind === 'mcq' ? shown.q.options.map((o) => (
            <div key={o.oid} className={`option ${o.oid === right ? 'ok' : o.oid === row.chosen ? 'bad' : ''}`}>
              {o.text}{o.oid === right && <span className="muted"> (right answer)</span>}{o.oid === row.chosen && o.oid !== right && <span className="muted"> (your answer)</span>}
            </div>
          )) : <p><strong>Answer:</strong> {shown.key.value}{item.typed?.unit_label ? ` ${item.typed.unit_label}` : ''}</p>}
          <p>{shown.key.explanation}</p>
        </div>
      )}
    </div>
  );
}

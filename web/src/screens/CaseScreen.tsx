// web/src/screens/CaseScreen.tsx: one case at #/case/<id>, and a level opener at #/opener/<id> (sprint 4b, Task D2; design §7, §14;
// S4B-07, S4B-10 to S4B-13, S2-39). The manager's message and brief, then the steps: an opener's sketch while it has no passing CP3
// (S4B-13), the optional plan with the model plan and its tick list after it, each checkpoint in the case's order with its own panel
// (CP3 through the exercise panel in phase case, labels hidden until a submission), CP6's insight with the filled model answer and
// the rubric, "say it in 60 seconds" (S4B-11), and the score.
// Nothing is locked: the step strip opens any step at any time, and every step can be skipped and reopened. Each checkpoint takes one
// answer per serving, then its instance closes; answering again serves a new instance (S4B-07). Model texts and correct answers come
// only in the replies to the learner's logged answers (S4B-10); the case view never carries them. CP1 and CP5 show the options of
// their own serving, in the order the answer logs (D1 review M4). Reading the case serves and logs nothing.
import { useEffect, useRef, useState } from 'react';
import { type Served } from '../api.ts';
import { ConfidenceRow, type Confidence } from '../components/ConfidenceRow.tsx';
import { ExercisePanel } from '../components/ExercisePanel.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { amsterdamDate } from '../../../core/time.ts';
import { crumbParts } from '../lib/crumb.ts';
import { cp4Hint } from '../lib/cp4-flow.ts';
import { isClosedError } from '../lib/exercise.ts';
import { formatDate } from '../lib/labels.ts';
import {
  INBOX_HREF, INBOX_TITLE, SAY_PROMPTS, actualRowCount, allBlank, askedStep, caseSteps, checkpointLabel, choiceFeedback, countdown, fieldsFrom,
  heldBackNote, keepLines, kindLabel, lastLine, modelAnswerOf, modelPlanOf, nextStep, rowCountLine, scoreText, sortText, startStep, statusChip, stepName, stepState,
  typedFeedback, viewScore, type StepId, type StepState,
} from '../lib/case-flow.ts';
import {
  casesApi, type AnswerableKind, type CaseCheckpointResult, type CaseCheckpointServed, type CaseCheckpointView, type CaseView, type InsightReply, type PlanReply,
} from '../lib/cases-api.ts';

const BACK = 'Back to the case inbox';
const REOPENED = 'Your session ended, so this question was opened again. Check your answer, then send it again.';
const markClass = (s: StepState): string | undefined => (s === 'passed' || s === 'done' ? 'ok' : s === 'failed' ? 'bad' : undefined);
const dateOf = (ts: string): string => formatDate(amsterdamDate(new Date(ts)), amsterdamDate(new Date()));
const errorText = (e: unknown): string => (e as Error).message;

export function CaseScreen({ caseId }: { caseId: string }) {
  const [view, setView] = useState<CaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<StepId | null>(null);
  // "Say it in 60 seconds" was started on this visit. Nothing is recorded (S4B-11), so a reopened case shows it as not done.
  const [said, setSaid] = useState(false);
  // CP3's row count on the visible data, from this visit's last graded submission. A reopened case has none (S4B-10).
  const [actualRows, setActualRows] = useState<number | null>(null);
  const latest = useRef(0);
  const focusStep = useRef(false);

  /** Reads the case again (status, score, each checkpoint's last result). An answer to an older request is dropped. */
  async function load(): Promise<void> {
    const req = ++latest.current;
    try {
      const v = await casesApi.view(caseId);
      if (req === latest.current) { setView(v); setError(null); }
    } catch (e) {
      if (req === latest.current) setError(errorText(e));
    }
  }
  useEffect(() => { void load(); }, [caseId]);
  // The visit starts on the first load's step, or the one the route asks for (Today's links, Task D3); after that only the learner moves it.
  useEffect(() => { if (view && current === null) setCurrent(startStep(view, { said }, askedStep(location.hash))); }, [view]);
  // A step chosen in the strip or with "Next" takes the focus to its heading.
  useEffect(() => {
    if (!focusStep.current || current === null) return;
    focusStep.current = false;
    document.querySelector<HTMLElement>(`[data-step="${current}"] h2`)?.focus();
  }, [current]);
  function go(id: StepId): void { focusStep.current = true; setCurrent(id); }

  if (error) {
    return <section className="case"><PageHead section="sql" title="Case" crumb={crumbParts({ section: 'sql', hideLabels: false, place: INBOX_TITLE })} />
      <p role="alert">{error}</p><p><a href={INBOX_HREF}>{BACK}</a></p></section>;
  }
  if (!view) return <section className="case"><p>Loading the case...</p></section>;

  const steps = caseSteps(view);
  const shown: StepId = steps.some((s) => s.id === current) ? current! : steps[0]!.id;
  const local = { said };
  const shownState = stepState(shown, view, local);
  const next = nextStep(steps, shown);
  const { passed, total } = viewScore(view);
  const chip = statusChip(view.status);
  const rowLine = rowCountLine(view.plan?.fields?.expected_row_count, actualRows);
  const out = view.expected_output;
  const sort = sortText(out.sort);
  function graded(g: Parameters<typeof actualRowCount>[0]): void {
    const n = actualRowCount(g);
    if (n !== null) setActualRows(n);
    void load();
  }

  function panel(id: StepId) {
    const cp = view!.checkpoints.find((c) => c.kind === id);
    switch (id) {
      case 'sketch': return <SketchStep caseId={caseId} view={view!} onSaved={() => void load()} />;
      case 'plan': return <PlanStep caseId={caseId} view={view!} onSaved={() => void load()} />;
      case 'say': return <SayStep insight={view!.insight?.text ?? null} onStarted={() => setSaid(true)} />;
      case 'score': return <ScoreStep view={view!} rowLine={rowLine} />;
      case 'CP3': return cp ? <QueryStep caseId={caseId} cp={cp} rowLine={rowLine} onGraded={graded} onClosed={() => void load()} /> : null;
      case 'CP6': return cp ? <InsightStep caseId={caseId} cp={cp} view={view!} onSaved={() => void load()} /> : null;
      default: return cp ? <CheckpointStep caseId={caseId} cp={cp} active={shown === id} onAnswered={() => void load()} /> : null;
    }
  }

  return (
    <section className="case">
      <PageHead section="sql" title={view.title} crumb={crumbParts({ section: 'sql', level: view.level, place: kindLabel(view.kind), hideLabels: false })} />
      <p><a href={INBOX_HREF}>{BACK}</a></p>
      <p className="case-status" data-status={view.status}>
        <span className={`chip ${chip.tone}`.trim()}>{chip.label}</span> <span>{scoreText(passed, total)}</span>
        {view.solved_at && <span className="muted"> · Solved {dateOf(view.solved_at)}</span>}
      </p>
      <div className="card case-brief" role="group" aria-label="The manager's message">
        <p className="muted">From {view.persona.name}, {view.persona.role}</p>
        <p><strong>Decision:</strong> {view.brief.decision}</p>
        <p><strong>Deadline:</strong> {view.brief.deadline}</p>
        <p><strong>Tables:</strong> {view.data_needed === null ? <span className="muted">{heldBackNote(view)}</span>
          : view.data_needed.map((t, i) => <span key={t}>{i > 0 && ', '}<code>{t}</code></span>)}</p>
        {out.columns.length > 0 && (
          <p><strong>Return:</strong> {out.columns.map((c, i) => <span key={c}>{i > 0 && ', '}<code>{c}</code></span>)}{sort && <>. {sort}</>}</p>
        )}
        <p><strong>Grain:</strong> {out.grain ?? <span className="muted">{heldBackNote(view)}</span>}</p>
        {view.data_source && <p className="muted">Data: {view.data_source.label}{view.data_source.licence ? `, ${view.data_source.licence}` : ''}</p>}
      </div>
      <nav className="steps" aria-label="Case steps">
        {steps.map((s) => {
          const state = stepState(s.id, view, local);
          return (
            <button key={s.id} type="button" data-step-button={s.id} aria-current={s.id === shown ? 'step' : undefined} aria-label={stepName(s, state)} onClick={() => go(s.id)}>
              <span className={markClass(state)}>{s.label}</span>
            </button>
          );
        })}
      </nav>
      {/* Every step stays mounted while the case is open, so an open query, a half-written plan or a running countdown survives a
          look at another step. Only the chosen one is shown. */}
      {steps.map((s) => <div key={s.id} data-step={s.id} hidden={s.id !== shown}>{panel(s.id)}</div>)}
      {next && (
        <p className="toolbar">
          <button type="button" data-next-step={next.id} onClick={() => go(next.id)}>{shownState === 'todo' ? `Skip to ${next.label}` : `Next: ${next.label}`}</button>
        </p>
      )}
    </section>
  );
}

/** S4B-13: an opener's optional sketch of three fields, logged in phase opener_preview. The first one is the day-1 sketch. */
function SketchStep({ caseId, view, onSaved }: { caseId: string; view: CaseView; onSaved: () => void }) {
  const [fields, setFields] = useState(() => fieldsFrom(view.sketch_fields, null));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save(): Promise<void> {
    if (busy || allBlank(fields)) return;
    setBusy(true); setMessage(null);
    try { await casesApi.sketch(caseId, fields); onSaved(); }
    catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  const saved = view.sketch?.fields ?? null;
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>Sketch</h2>
      <p className="muted">Optional, and not graded. Before you learn how, sketch how you would answer. Your first sketch is kept, so you can compare it with your solution later.</p>
      {saved ? (
        <>
          <h3>Your day-1 sketch{view.sketch && <span className="muted"> ({dateOf(view.sketch.ts)})</span>}</h3>
          <ul>{view.sketch_fields.map((p) => <li key={p.id}><strong>{p.label}:</strong> {saved[p.id]?.trim() ? saved[p.id] : <span className="muted">left blank</span>}</li>)}</ul>
        </>
      ) : (
        <form className="case-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {view.sketch_fields.map((p) => (
            <label key={p.id}>{p.label}
              <input type="text" value={fields[p.id] ?? ''} disabled={busy} onChange={(e) => setFields({ ...fields, [p.id]: e.target.value })} />
            </label>
          ))}
          <p><button type="submit" className="btn-main" disabled={busy || allBlank(fields)}>Save the sketch</button></p>
        </form>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}

/** Design §7 "Plan first": CRAFT-03's six fields, logged as a self-check; then the model plan (once CP1 has an answer) and its ticks. */
function PlanStep({ caseId, view, onSaved }: { caseId: string; view: CaseView; onSaved: () => void }) {
  const [fields, setFields] = useState(() => fieldsFrom(view.plan_fields, view.plan?.fields));
  const [reply, setReply] = useState<PlanReply | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [ticksSaved, setTicksSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function send(): Promise<void> {
    if (busy || allBlank(fields)) return;
    setBusy(true); setMessage(null);
    try { setReply(await casesApi.plan(caseId, fields)); setTicked([]); setTicksSaved(false); onSaved(); }
    catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  async function saveTicks(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await casesApi.planCheck(caseId, ticked); setTicksSaved(true); }
    catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  const model = reply ? modelPlanOf(reply) : null;
  const note = reply && 'note' in reply ? reply.note : null;
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>Plan</h2>
      <p className="muted">Optional. Plan before you write any SQL, then compare your plan with the model plan. Your expected row count is shown beside your query's count at CP3.</p>
      <form className="case-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        {view.plan_fields.map((p) => (
          <label key={p.id}>{p.label}
            <textarea rows={2} value={fields[p.id] ?? ''} disabled={busy} onChange={(e) => setFields({ ...fields, [p.id]: e.target.value })} />
          </label>
        ))}
        <p><button type="submit" className="btn-main" disabled={busy || allBlank(fields)}>{view.plan ? 'Save and compare' : 'Save the plan'}</button>
          {view.plan && <span className="muted"> Last saved {dateOf(view.plan.ts)}</span>}</p>
      </form>
      {note && <p role="status" className="notice">{note}</p>}
      {model !== null && (
        <div className="case-model">
          <h3>The model plan</h3>
          <Markdown text={keepLines(model)} />
          <fieldset className="case-ticks">
            <legend>Tick each part of your plan that matches the model plan.</legend>
            {view.plan_fields.map((p) => (
              <label key={p.id}><input type="checkbox" checked={ticked.includes(p.id)} disabled={busy}
                onChange={(e) => { setTicksSaved(false); setTicked(e.target.checked ? [...ticked, p.id] : ticked.filter((x) => x !== p.id)); }} /> {p.label}</label>
            ))}
          </fieldset>
          <p><button type="button" onClick={() => void saveTicks()} disabled={busy || ticksSaved}>Save the ticks</button></p>
          {ticksSaved && <p role="status">Ticks saved.</p>}
        </div>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}

/**
 * CP1 and CP5 (multiple choice) and CP2 and CP4 (a typed number), on the case routes. A checkpoint with no answer yet is served the
 * first time its step is shown; an answered one waits for "Answer again". One answer per serving: the reply shows the right option
 * and its explanation, or the value, and the instance closes.
 */
function CheckpointStep({ caseId, cp, active, onAnswered }: { caseId: string; cp: CaseCheckpointView; active: boolean; onAnswered: () => void }) {
  const kind = cp.kind as AnswerableKind;
  const [served, setServed] = useState<CaseCheckpointServed | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [asking, setAsking] = useState(false);           // a typed number is in: confidence is asked before the result (D16)
  const [result, setResult] = useState<CaseCheckpointResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(0);
  const autoServed = useRef(false);

  /** A fresh instance. `keep`: after a session end, the learner's answer stays to send again. */
  async function serve(note: string | null = null, keep = false): Promise<void> {
    setBusy(true); setMessage(null);
    try {
      const s = await casesApi.serveCheckpoint(caseId, kind);
      shownAt.current = Date.now();
      setServed(s); setResult(null); setAsking(false);
      if (!keep) { setChosen(null); setTyped(''); }
      setMessage(note);
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!active || autoServed.current || cp.last !== null) return;
    autoServed.current = true;
    void serve();
  }, [active]);

  async function send(confidence: Confidence): Promise<void> {
    if (!served || busy || result) return;
    setBusy(true); setMessage(null);
    const answer = served.options ? { chosen: chosen ?? '', shown_order: served.shown_order } : { typed };
    try {
      setResult(await casesApi.answerCheckpoint(caseId, kind, { item_instance_id: served.item_instance_id, confidence, active_ms: Date.now() - shownAt.current, ...answer }));
      onAnswered();
    } catch (e) {
      // A session end closed the instance: serve it again and keep the answer. Any other refusal says why, and nothing is logged.
      if (isClosedError(e)) await serve(REOPENED, true);
      else setMessage(errorText(e));
    } finally { setBusy(false); setAsking(false); }
  }

  const heading = <h2 tabIndex={-1}>{checkpointLabel(cp.kind)}</h2>;
  const last = lastLine(cp);
  if (!served) {
    return (
      <section className="card case-step">
        {heading}
        <p className="prompt">{cp.prompt}</p>
        {last && <p className={cp.last?.passed ? 'ok' : 'bad'}>{last}</p>}
        {message && <p role="alert">{message}</p>}
        {busy ? <p>Loading the question...</p>
          : <p><button type="button" className="btn-main" data-serve={cp.kind} onClick={() => void serve()}>{cp.last ? 'Answer again' : 'Answer it'}</button></p>}
      </section>
    );
  }
  const lines = result ? (served.typed ? typedFeedback(result, served.typed) : choiceFeedback(result)) : [];
  return (
    <section className="card case-step choice">
      {heading}
      {served.options ? (
        <>
          <fieldset disabled={busy || result !== null}>
            <legend className="prompt">{served.prompt}</legend>
            {served.options.map((o) => {
              const mark = result ? (o.oid === result.correct_oid ? 'ok' : o.oid === chosen ? 'bad' : '') : '';
              return (
                <div key={o.oid} className={`option ${mark}`.trim()}>
                  <label><input type="radio" name={`cp-${served.item_instance_id}`} value={o.oid} checked={chosen === o.oid} onChange={() => setChosen(o.oid)} /> {o.text}</label>
                  {mark === 'ok' && <span className="muted"> (right answer)</span>}
                  {mark === 'bad' && <span className="muted"> (your answer)</span>}
                </div>
              );
            })}
          </fieldset>
          {!result && chosen !== null && <ConfidenceRow busy={busy} onPick={(c) => void send(c)} />}
        </>
      ) : served.typed && (
        <>
          <p className="prompt">{served.prompt}</p>
          <p className="muted">{cp4Hint(served.typed)}</p>
          <form onSubmit={(e) => { e.preventDefault(); if (typed.trim() !== '' && !busy && !result) setAsking(true); }}>
            <label>Your answer <input type="text" inputMode="decimal" value={typed} disabled={busy || asking || result !== null} onChange={(e) => setTyped(e.target.value)} /> {served.typed.unit_label}</label>
            {!result && !asking && <p><button type="submit" className="btn-main" disabled={busy || typed.trim() === ''}>Check</button></p>}
          </form>
          {asking && !result && <ConfidenceRow busy={busy} onPick={(c) => void send(c)} />}
        </>
      )}
      {message && <p role="alert">{message}</p>}
      {result && (
        <div aria-live="polite" className="grade">
          {lines.map((line, n) => (n === 0 ? <h3 key={n} className={result.correct ? 'ok' : 'bad'}>{line}</h3> : <p key={n}>{line}</p>))}
          <p><button type="button" onClick={() => void serve()} disabled={busy}>Answer again</button></p>
        </div>
      )}
    </section>
  );
}

/** CP3: the case's SQL item, served in phase case with labels hidden until a submission (S2-39), run by the exercise panel. */
function QueryStep({ caseId, cp, rowLine, onGraded, onClosed }: {
  caseId: string; cp: CaseCheckpointView; rowLine: string | null; onGraded: (g: Parameters<typeof actualRowCount>[0]) => void; onClosed: () => void;
}) {
  const [served, setServed] = useState<Served | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function start(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { setServed(await casesApi.serveCp3(caseId)); }
    catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  const last = lastLine(cp);
  return (
    <section className="case-step">
      <h2 tabIndex={-1}>{checkpointLabel('CP3')}</h2>
      {rowLine && <p className="callout" data-row-count>{rowLine}</p>}
      {served ? (
        <ExercisePanel key={served.item_instance_id} itemId={served.item_id} phase={served.phase} instanceId={served.item_instance_id} hideLabels={served.hide_labels} labels
          onGraded={onGraded} onClosed={() => { setServed(null); onClosed(); }} />
      ) : (
        <div className="card">
          <p className="prompt">{cp.prompt}</p>
          <p className="muted">Concept names stay hidden until you submit.</p>
          {last && <p className={cp.last?.passed ? 'ok' : 'bad'}>{last}</p>}
          {message && <p role="alert">{message}</p>}
          <p><button type="button" className="btn-main" data-serve="CP3" onClick={() => void start()} disabled={busy}>{cp.last ? 'Write it again' : 'Write the query'}</button></p>
        </div>
      )}
    </section>
  );
}

/** CP6: the written insight, then the filled model answer (once CP5 has an answer) and the rubric to tick. Self-scored (design §7). */
function InsightStep({ caseId, cp, view, onSaved }: { caseId: string; cp: CaseCheckpointView; view: CaseView; onSaved: () => void }) {
  const [text, setText] = useState(view.insight?.text ?? '');
  const [reply, setReply] = useState<InsightReply | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [ticksSaved, setTicksSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function send(): Promise<void> {
    if (busy || text.trim() === '') return;
    setBusy(true); setMessage(null);
    try { setReply(await casesApi.insight(caseId, text)); setTicked([]); setTicksSaved(false); onSaved(); }
    catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  async function saveTicks(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await casesApi.rubric(caseId, ticked); setTicksSaved(true); }
    catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }
  const model = reply ? modelAnswerOf(reply) : null;
  const note = reply && 'note' in reply ? reply.note : null;
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>{checkpointLabel('CP6')}</h2>
      <p className="prompt">{cp.prompt}</p>
      <p className="muted">Write 2 to 4 sentences for the manager. You score it yourself against the model answer; it never decides the case.</p>
      <form className="case-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label>Your insight
          <textarea rows={5} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        </label>
        <p><button type="submit" className="btn-main" disabled={busy || text.trim() === ''}>{view.insight ? 'Save and compare' : 'Save the insight'}</button>
          {view.insight && <span className="muted"> Last saved {dateOf(view.insight.ts)}</span>}</p>
      </form>
      {note && <p role="status" className="notice">{note}</p>}
      {model !== null && (
        <div className="case-model">
          <h3>The model answer</h3>
          <Markdown text={keepLines(model.text)} />
          <fieldset className="case-ticks">
            <legend>Tick each point your insight makes.</legend>
            {model.rubric.map((p) => (
              <label key={p.id}><input type="checkbox" checked={ticked.includes(p.id)} disabled={busy}
                onChange={(e) => { setTicksSaved(false); setTicked(e.target.checked ? [...ticked, p.id] : ticked.filter((x) => x !== p.id)); }} /> {p.label}</label>
            ))}
          </fieldset>
          <p><button type="button" onClick={() => void saveTicks()} disabled={busy || ticksSaved}>Save the rubric</button></p>
          {ticksSaved && <p role="status">Rubric saved.</p>}
        </div>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}

/** S4B-11: four prompts and a countdown the learner starts. Said aloud: nothing is recorded or logged. */
function SayStep({ insight, onStarted }: { insight: string | null; onStarted: () => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const c = countdown(startedAt, now);
  const ticking = startedAt !== null && c.state !== 'done';
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ticking, startedAt]);
  function start(): void {
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
    onStarted();
  }
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>Say it in 60 seconds</h2>
      <p className="muted">Say your answer aloud, as you would to the manager. Nothing is recorded.</p>
      <ol className="say-prompts">{SAY_PROMPTS.map((p) => <li key={p.label}><strong>{p.label}.</strong> {p.text}</li>)}</ol>
      {insight && <><p className="muted">Your insight, to start from:</p><blockquote className="prompt">{insight}</blockquote></>}
      <p className="say-timer" role="timer" aria-label="Time left">{c.state === 'done' ? '0:00' : c.text}</p>
      <p role="status">{c.state === 'done' ? c.text : ''}</p>
      <p><button type="button" className={c.state === 'ready' ? 'btn-main' : undefined} onClick={start}>{c.state === 'ready' ? 'Start the 60 seconds' : 'Start again'}</button></p>
    </section>
  );
}

/** The case's status and score: each auto-graded checkpoint, the row counts, and the manager's next question. */
function ScoreStep({ view, rowLine }: { view: CaseView; rowLine: string | null }) {
  const { passed, total } = viewScore(view);
  const chip = statusChip(view.status);
  const graded = view.checkpoints.filter((c) => c.kind !== 'CP6');
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>Score</h2>
      <p><span className={`chip ${chip.tone}`.trim()}>{chip.label}</span> {scoreText(passed, total)}
        {view.solved_at && <span className="muted"> · Solved {dateOf(view.solved_at)}</span>}</p>
      <p className="muted">The case is solved once each checkpoint from CP1 to CP5 it lists has passed. CP6 is scored by you and never decides it.</p>
      <ul className="checklist">
        {graded.map((c) => {
          const s = stepState(c.kind, view, { said: false });
          return <li key={c.id} className={markClass(s)}>{checkpointLabel(c.kind)}: {s === 'passed' ? 'passed' : s === 'failed' ? 'not passed yet' : 'not answered'}</li>;
        })}
      </ul>
      {rowLine && <p>{rowLine}</p>}
      {view.follow_up_question && (
        <>
          <h3>What the manager asks next</h3>
          <p>{view.follow_up_question}</p>
        </>
      )}
      <p><a href={INBOX_HREF}>{BACK}</a></p>
    </section>
  );
}

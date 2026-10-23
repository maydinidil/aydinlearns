// web/src/screens/CaseMockScreen.tsx: the case-round mock at #/mock/case_round and the take-home mock at #/mock/take_home (CaseMockScreen),
// and their review at #/mock/review/<block_id> (CaseMockReviewScreen) (sprint 7 Part 2; Task N2, split out of the case screen in Task N3,
// L105; S7-03, S7-07, S7-13 to S7-17; D108). A mock is a test: its clock bar (display only; the server is the clock), its plan first (the
// checkpoints open once it is saved), one answer per checkpoint, asked for in the page, whose reply is only that it was recorded; no correct
// option, value or model text until the review; the tutor waits (D108). CP3 is the shared mock question (components/MockSqlQuestion.tsx);
// the brief and "say it in 60 seconds" are the inbox case's parts (components/CaseParts.tsx). The review shows each answer beside the right
// one, the model plan and answer and the rubric, and (S7-17) offers the tutor's second opinion on the written answer while the tutor is on.
import { useEffect, useRef, useState } from 'react';
import type { DisplayOk } from '../../../server/runner/protocol.ts';
import { api } from '../api.ts';
import { CaseBrief, SayAloud } from '../components/CaseParts.tsx';
import { GradePanel } from '../components/GradePanel.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { MockSqlQuestion } from '../components/MockSqlQuestion.tsx';
import { ResultTable } from '../components/ResultTable.tsx';
import { SqlCode } from '../components/SqlCode.tsx';
import { cp4HintFor } from '../lib/cp4-flow.ts';
import { countdownText } from '../lib/drill-flow.ts';
import { grainLine } from '../lib/exercise.ts';
import {
  ANSWERED_LINE, LATE_LINE, LATE_MEMO_LINE, MOCK_CASE_HELP_LINE, MOCK_OUTCOME, PLAN_FIRST_LINE, RECORDED_LINE, SAY_TICKS_LEGEND, allBlank, checkpointLabel, fieldsFrom,
  keepLines, mockClock, mockReviewScoreLine, mockStepState, mockSteps, planFirstLine, rubricGroups, type CaseMockKind, type CaseMockReview, type CaseMockRunView,
  type MockCaseCheckpointView, type MockCaseReviewCheckpoint, type StepId,
} from '../lib/case-flow.ts';
import { caseMockApi, type AnswerableKind, type CaseCheckpointServed, type Point } from '../lib/cases-api.ts';
import {
  MOCK_NAME, MOCK_STAGE, MOCKS_HREF, PRACTICE_LINE, SEND_QUESTION, STAGE_CARDS, UNSEEN_LINE, cardRuleLine, countsLine, formsLine, mockRunFromRefusal, mocksApi,
  refusalCode, reviewHref, type MockCard,
} from '../lib/mock-flow.ts';
import { mockReviewPart, secondOpinionPrompts } from '../lib/tutor-parts.ts';
import { TUTOR_WAITS } from '../tutor/snapshot.ts';
import { AVAILABLE, useTutorAsk, useTutorAvailable, useTutorClosed, useTutorPart, useTutorWaits } from '../tutor/TutorContext.tsx';

const LATE_NOTE = ' It came in late.';
/** S7C-06: in a mock whose case lists a CP1, which may ask it, the grain waits for the review (D1): the brief says when it shows. */
const GRAIN_WAITS = 'Shown in the review.';
/** The review shows the grain; a case written with none says so. */
const NO_GRAIN = 'None given.';
const errorText = (e: unknown): string => (e as Error).message;
type Refresh = () => Promise<void>;

/**
 * #/mock/case_round and #/mock/take_home: the start screen, or the run that is on (a reload, or for a take-home an app restart, picks it up
 * again). A run that has ended (its limit, "Hand in" elsewhere, an app stop) opens its review.
 */
export function CaseMockScreen({ mock }: { mock: CaseMockKind }) {
  const [card, setCard] = useState<MockCard | null>(null);
  const [run, setRun] = useState<CaseMockRunView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Reads the card and the run again. `held`: the run this screen shows; when it is no longer on, its review opens. */
  async function read(held?: string): Promise<void> {
    try {
      const v = await mocksApi.view();
      setCard(v.mocks.find((m) => m.mock === mock) ?? null);
      const on = v.run && v.run.mock === mock ? v.run as CaseMockRunView : null;
      if (held !== undefined && on?.block_id !== held) { location.hash = reviewHref(held); return; }
      setRun(on);
    } catch (e) { setMessage(errorText(e)); } finally { setLoaded(true); }
  }
  useEffect(() => { void read(); }, [mock]);
  async function start(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { setRun(await mocksApi.start(mock) as CaseMockRunView); } catch (e) {
      const on = mockRunFromRefusal(e);
      if (on && on.mock === mock) setRun(on as CaseMockRunView);                 // already on: pick it up
      else setMessage(errorText(e));                                              // another timed run is on, or no form yet
    } finally { setBusy(false); }
  }
  if (run) return <CaseMockRun key={run.block_id} run={run} refresh={() => read(run.block_id)} />;
  const name = MOCK_NAME[mock];
  const head = <div className="page-head"><h1>{name}</h1></div>;
  if (!loaded) return <section>{head}<p>Loading the mock...</p></section>;
  return (
    <section>
      {head}
      <p>{card ? cardRuleLine(card) : STAGE_CARDS[MOCK_STAGE[mock]]!.tests}</p>
      <p className="muted">{MOCK_CASE_HELP_LINE}</p>
      {card && (card.next === null ? <p>{formsLine(card)}</p>
        : <p role={card.next.on_unseen ? undefined : 'note'}>{card.next.on_unseen ? UNSEEN_LINE : PRACTICE_LINE}</p>)}
      {message && <p role="alert" className="notice">{message}</p>}
      {card?.next && <p><button type="button" className="btn-main" disabled={busy} onClick={() => void start()}>{`Start the ${name.toLowerCase()}`}</button></p>}
      <p><a href={MOCKS_HREF}>Back to the recruiter mocks</a></p>
    </section>
  );
}

/** The run: its clock bar, its brief, the plan first, then each checkpoint once, "Hand in" (and the take-home's "Give up"). */
function CaseMockRun(p: { run: CaseMockRunView; refresh: Refresh }) {
  const { run } = p;
  const v = run.case;
  useTutorClosed(TUTOR_WAITS);                                                     // D108: the tutor waits for the review
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState<StepId>('plan');
  const [message, setMessage] = useState<string | null>(null);
  const ending = useRef(false);
  // F4-2-1 (fixer A): CP3's typed query, kept here so it survives the query step reopening on a new instance after an app restart.
  const cp3Draft = useRef<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const clock = mockClock(now, run);
  async function finish(how: 'end' | 'give_up'): Promise<void> {
    if (ending.current) return;
    ending.current = true;
    try {
      await (how === 'end' ? mocksApi.end(run.block_id) : caseMockApi.giveUp(run.block_id));
      location.hash = reviewHref(run.block_id);
    } catch (e) {
      // F4-3-4 (S7-C29): the server has ended the run already (its 24 hours, or a hand-in elsewhere): its review opens, as after "Hand in".
      if (refusalCode(e) === 'RUN_OVER') { location.hash = reviewHref(run.block_id); return; }
      ending.current = false;
      setMessage(`The mock could not be ended: ${errorText(e)}`);
    }
  }
  // S7-06: a case-round's clock is its limit, which the server keeps; at 0 the screen asks it for the end and opens the review. A take-home's
  // deadline only makes later answers late (S7-15).
  useEffect(() => { if (clock.ended) void finish('end'); }, [clock.ended]);
  /**
   * S7-C18: a refusal that says the run is over reads it again: a take-home a restart rebuilt is still on; anything else opens its review.
   * F4-2-1: so does one that says the run no longer holds the step's instance (RUN_CHANGED: the tab was open across an app restart).
   */
  const stopped = (): void => { void p.refresh(); };
  const steps = mockSteps(v, run.mock);
  const shown: StepId = steps.some((s) => s.id === current) ? current : steps[0]!.id;
  function panel(id: StepId) {
    const cp = v.checkpoints.find((c) => c.kind === id);
    // F4-2-1: a question step is keyed by its instance, so a run read again with a new instance (a restart rebuilt it) opens the step afresh.
    switch (id) {
      case 'plan': return <MockPlanStep run={run} onSaved={p.refresh} />;
      case 'say': return <MockSayStep run={run} onSaved={p.refresh} />;
      case 'CP6': return cp ? <MockInsightStep run={run} cp={cp} onSaved={p.refresh} /> : null;
      case 'CP3': return cp ? <MockQueryStep key={cp.item_instance_id ?? cp.id} run={run} cp={cp} active={shown === id} onAnswered={p.refresh} onStopped={stopped} draft={cp3Draft} /> : null;
      default: return cp ? <MockCheckpointStep key={cp.item_instance_id ?? cp.id} run={run} cp={cp} active={shown === id} onAnswered={p.refresh} onStopped={stopped} /> : null;
    }
  }
  return (
    <section className="case">
      <h1 tabIndex={-1}>{MOCK_NAME[run.mock]}</h1>
      <div className="card run-bar">
        <div className="run-bar-text">
          <p className="muted">{MOCK_CASE_HELP_LINE}</p>
          {clock.late && <p role="note" className="notice">{LATE_LINE}</p>}
        </div>
        <p className="run-timer"><strong role="timer">{countdownText(clock.left)}</strong></p>
      </div>
      {message && <p role="alert" className="notice">{message}</p>}
      <CaseBrief persona={v.persona} brief={v.brief} tables={v.data_needed} output={v.expected_output} dataSource={v.data_source} heldBack={GRAIN_WAITS} />
      {v.plan === null && <p role="note" className="notice">{PLAN_FIRST_LINE}</p>}
      <nav className="steps" aria-label="Case steps">
        {steps.map((s) => {
          const done = mockStepState(s.id, v) === 'done';
          const word = s.id === 'plan' || s.id === 'CP6' || s.id === 'say' ? 'saved' : 'answered';
          return (
            <button key={s.id} type="button" data-step-button={s.id} aria-current={s.id === shown ? 'step' : undefined} aria-label={done ? `${s.label}, ${word}` : s.label}
              onClick={() => setCurrent(s.id)}><span className={done ? 'ok' : undefined}>{s.label}</span></button>
          );
        })}
      </nav>
      {/* Every step stays mounted while the run is on, so a half-written answer survives a look at another step. */}
      {steps.map((s) => <div key={s.id} data-step={s.id} hidden={s.id !== shown}>{panel(s.id)}</div>)}
      <p className="toolbar">
        <button type="button" onClick={() => { if (confirm('Hand in the mock now? Checkpoints you have not answered count as not passed.')) void finish('end'); }}>Hand in</button>
        {run.mock === 'take_home' && (
          <button type="button" onClick={() => { if (confirm('Give up this take-home? It ends now, and its review opens.')) void finish('give_up'); }}>Give up</button>
        )}
      </p>
    </section>
  );
}

/** S7-13: the plan, the run's first step (CRAFT-03's six fields). Saved again until the run ends; the model plan opens in the review. */
function MockPlanStep({ run, onSaved }: { run: CaseMockRunView; onSaved: Refresh }) {
  const v = run.case;
  const [fields, setFields] = useState(() => fieldsFrom(v.plan_fields, v.plan));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save(): Promise<void> {
    if (busy || allBlank(fields)) return;
    setBusy(true); setMessage(null);
    try {
      await caseMockApi.plan(run.block_id, fields);
      setMessage('Plan saved. You can change it until you hand in. The model plan opens in the review.');
      await onSaved();
    } catch (e) {
      if (refusalCode(e) === 'RUN_OVER') await onSaved(); else setMessage(errorText(e));
    } finally { setBusy(false); }
  }
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>Plan</h2>
      <p className="muted">{planFirstLine(run.mock)}</p>
      <form className="case-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {v.plan_fields.map((f) => (
          <label key={f.id}>{f.label}
            <textarea rows={2} value={fields[f.id] ?? ''} disabled={busy} onChange={(e) => setFields({ ...fields, [f.id]: e.target.value })} />
          </label>
        ))}
        <p><button type="submit" className="btn-main" disabled={busy || allBlank(fields)}>{v.plan ? 'Save the plan again' : 'Save the plan'}</button></p>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

interface MockStepProps { run: CaseMockRunView; cp: MockCaseCheckpointView; active: boolean; onAnswered: Refresh; onStopped: () => void }

/** A checkpoint whose one answer is in: its prompt and the recorded line, and whether it came in late (S7-15). */
function AnsweredStep({ cp, message }: { cp: MockCaseCheckpointView; message?: string | null }) {
  return <section className="card case-step"><h2 tabIndex={-1}>{checkpointLabel(cp.kind)}</h2><p className="prompt">{cp.prompt}</p><p role="status">{message ?? ANSWERED_LINE}{cp.late && LATE_NOTE}</p></section>;
}

/** S7-03: CP1 and CP5 (options) or CP2 and CP4 (a typed number): served once shown, one answer, asked for in the page, recorded only. */
function MockCheckpointStep({ run, cp, active, onAnswered, onStopped }: MockStepProps) {
  const kind = cp.kind as AnswerableKind;
  const [served, setServed] = useState<CaseCheckpointServed | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // N2 M8: a serve that failed for another reason can be tried again.
  const [failed, setFailed] = useState(false);
  const shownAt = useRef(0);
  const asked = useRef(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  /**
   * A refusal: the run is over (S7-C18) or no longer holds this instance (F4-2-1, RUN_CHANGED), or this checkpoint has its answer or waits for
   * the plan (read the run again); else its line.
   */
  const refused = async (e: unknown): Promise<boolean> => {
    const code = refusalCode(e);
    if (code === 'RUN_OVER' || code === 'RUN_CHANGED') onStopped();
    else if (code === 'ONE_ANSWER' || code === 'PLAN_FIRST') await onAnswered();
    else { setMessage(errorText(e)); return false; }
    return true;
  };
  function serve(): void {
    asked.current = true;
    setBusy(true); setFailed(false); setMessage(null);
    caseMockApi.serve(run.block_id, kind).then((s) => { shownAt.current = Date.now(); setServed(s); }, async (e: unknown) => {
      if (!(await refused(e))) { asked.current = false; setFailed(true); }
    }).finally(() => setBusy(false));
  }
  useEffect(() => { if (active && !cp.answered && !asked.current) serve(); }, [active, cp.answered]);
  // F2-3-6 (N2 M1): the question takes the focus Submit had, on its safer choice.
  useEffect(() => { if (confirming) keepEditing.current?.focus(); }, [confirming]);
  async function send(): Promise<void> {
    if (!served || busy) return;
    setBusy(true); setMessage(null); setConfirming(false);
    const answer = served.options ? { chosen: chosen ?? '', shown_order: served.shown_order } : { typed };
    try {
      await caseMockApi.answer(run.block_id, kind, { item_instance_id: served.item_instance_id, active_ms: Date.now() - shownAt.current, ...answer });
      setMessage(RECORDED_LINE);
      await onAnswered();
    } catch (e) { await refused(e); } finally { setBusy(false); }
  }
  const heading = <h2 tabIndex={-1}>{checkpointLabel(cp.kind)}</h2>;
  if (cp.answered) return <AnsweredStep cp={cp} message={message} />;
  if (!served) {
    return (
      <section className="card case-step">{heading}<p className="prompt">{cp.prompt}</p><p>{message ?? 'Loading the question...'}</p>
        {failed && <p><button type="button" onClick={serve}>Try again</button></p>}</section>
    );
  }
  const hint = served.typed ? cp4HintFor(served.prompt, served.typed) : null;
  const ready = served.options ? chosen !== null : typed.trim() !== '';
  return (
    <section className="card case-step choice">
      {heading}
      {served.options ? (
        <fieldset disabled={busy}>
          <legend className="prompt">{served.prompt}</legend>
          {served.options.map((o) => (
            <div key={o.oid} className="option">
              <label><input type="radio" name={`mock-${served.item_instance_id}`} value={o.oid} checked={chosen === o.oid} onChange={() => setChosen(o.oid)} /> {o.text}</label>
            </div>
          ))}
        </fieldset>
      ) : served.typed && (
        <>
          <p className="prompt">{served.prompt}</p>
          {hint && <p className="muted">{hint}</p>}
          <label>Your answer <input type="text" inputMode="decimal" value={typed} disabled={busy} onChange={(e) => setTyped(e.target.value)} /> {served.typed.unit_label}</label>
        </>
      )}
      <div className="toolbar">
        {confirming ? (
          <div role="group" aria-label={SEND_QUESTION} style={{ display: 'contents' }}>
            <span>{SEND_QUESTION}</span>
            <button type="button" className="btn-main" onClick={() => void send()} disabled={busy}>Send</button>
            <button type="button" ref={keepEditing} onClick={() => setConfirming(false)}>Keep editing</button>
          </div>
        ) : <button type="button" className="btn-main" onClick={() => setConfirming(true)} disabled={busy || !ready}>Submit</button>}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

/**
 * S7-03: CP3, the case's query: the shared mock question (served through the run's instance, Run free, one Submit asked for in the page,
 * recorded only), opened the first time its step is shown.
 */
function MockQueryStep({ run, cp, active, onAnswered, onStopped, draft }: MockStepProps & { draft: { current: string | null } }) {
  const [opened, setOpened] = useState(false);
  useEffect(() => { if (active && !cp.answered) setOpened(true); }, [active, cp.answered]);
  if (cp.answered) return <AnsweredStep cp={cp} />;
  if (!opened || cp.item_instance_id === null) {
    return <section className="card case-step"><h2 tabIndex={-1}>{checkpointLabel('CP3')}</h2><p className="prompt">{cp.prompt}</p></section>;
  }
  // The run is over (S7-C18), or no longer holds this instance (F4-2-1: a restart rebuilt it): read it again. A checkpoint that waits for the
  // plan, or has its answer: read the run again too.
  const refused = (code: string): boolean => {
    if (code === 'RUN_OVER' || code === 'RUN_CHANGED') { onStopped(); return true; }
    if (code === 'PLAN_FIRST') { void onAnswered(); return true; }
    return false;
  };
  return <MockSqlQuestion blockId={run.block_id} instanceId={cp.item_instance_id} heading={checkpointLabel('CP3')} sectionClass="case-step" answered={cp.answered}
    onAnswered={() => void onAnswered()} onRefused={refused} draft={draft} />;
}

/** CP6: the written insight (the take-home's memo), saved again until the run ends; the model answer and the rubric open in the review. */
function MockInsightStep({ run, cp, onSaved }: { run: CaseMockRunView; cp: MockCaseCheckpointView; onSaved: Refresh }) {
  const [text, setText] = useState(run.case.insight ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const memo = run.mock === 'take_home';
  async function save(): Promise<void> {
    if (busy || text.trim() === '') return;
    setBusy(true); setMessage(null);
    try {
      await caseMockApi.insight(run.block_id, text);
      setMessage('Saved. The model answer and the rubric open in the review.');
      await onSaved();
    } catch (e) {
      if (refusalCode(e) === 'RUN_OVER') await onSaved(); else setMessage(errorText(e));
    } finally { setBusy(false); }
  }
  return (
    <section className="card case-step">
      <h2 tabIndex={-1}>{checkpointLabel('CP6')}</h2>
      <p className="prompt">{cp.prompt}</p>
      <p className="muted">{memo ? 'Write the memo for the manager, 4 to 8 sentences.' : 'Write 2 to 4 sentences for the manager.'} You score it against the model answer in the review.</p>
      <form className="case-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label>{memo ? 'Your memo' : 'Your insight'}
          <textarea rows={6} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        </label>
        <p><button type="submit" className="btn-main" disabled={busy || text.trim() === ''}>{run.case.insight ? 'Save it again' : memo ? 'Save the memo' : 'Save the insight'}</button></p>
      </form>
      {cp.late && <p role="note" className="notice">{LATE_MEMO_LINE}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

/** S7-14: "say it in 60 seconds" after CP6: spoken, not recorded; its four points are ticked and saved. It decides nothing. */
function MockSayStep({ run, onSaved }: { run: CaseMockRunView; onSaved: Refresh }) {
  const [ticked, setTicked] = useState<string[]>(run.case.said ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await caseMockApi.sayAloud(run.block_id, ticked); setMessage('Ticks saved.'); await onSaved(); }
    catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <section className="card case-step">
      <SayAloud intro="Say your answer aloud, as you would to the manager. Nothing is recorded; tick what you said." />
      <fieldset className="case-ticks">
        <legend>{SAY_TICKS_LEGEND}</legend>
        {run.case.say_points.map((s) => (
          <label key={s.id}><input type="checkbox" value={s.id} checked={ticked.includes(s.id)} disabled={busy}
            onChange={(e) => setTicked(e.target.checked ? [...ticked, s.id] : ticked.filter((x) => x !== s.id))} /> {s.label}</label>
        ))}
      </fieldset>
      <p><button type="button" onClick={() => void save()} disabled={busy}>Save the ticks</button></p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

/** #/mock/review/<block_id> of a case mock (S7-07): each answer beside the right one, the model plan and answer, and the rubric (S7-16). */
export function CaseMockReviewScreen({ blockId }: { blockId: string }) {
  const [review, setReview] = useState<CaseMockReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = (): void => { caseMockApi.review(blockId).then(setReview, (e: unknown) => setError(errorText(e))); };
  useEffect(load, [blockId]);
  if (!review) return <section><div className="page-head"><h1>Mock review</h1></div>{error ? <p role="alert">{error}</p> : <p>Loading the review...</p>}</section>;
  return (
    <section className="case">
      <div className="page-head"><h1>{`${MOCK_NAME[review.mock]}: review`}</h1></div>
      <p role="status"><strong>{mockReviewScoreLine(review)}</strong></p>
      <p>{countsLine(review)}</p>
      <p className="muted">The mock is over, so its answers, the model texts and the tutor are open now, and "show answer" is free.</p>
      <CaseBrief persona={review.case.persona} brief={review.case.brief} tables={review.case.data_needed} output={review.case.expected_output}
        dataSource={review.case.data_source} heldBack={NO_GRAIN} />
      <ol className="review-items card">{review.checkpoints.filter((c) => c.kind !== 'CP6').map((c) => <MockReviewCheckpoint key={c.id} cp={c} />)}</ol>
      <section className="card case-step">
        <h2>Plan</h2>
        <h3>Your plan</h3>
        {review.plan ? <ul>{review.plan_fields.map((f) => <li key={f.id}><strong>{f.label}:</strong> {review.plan![f.id]?.trim() ? review.plan![f.id] : <span className="muted">left blank</span>}</li>)}</ul>
          : <p className="muted">No plan was saved in this run.</p>}
        <h3>The model plan</h3>
        <Markdown text={keepLines(review.model_plan)} />
      </section>
      <MockReviewInsight review={review} onSaved={load} />
      {review.said && review.said.length > 0 && (
        <p className="muted">Said in 60 seconds: {review.say_points.filter((s) => review.said!.includes(s.id)).map((s) => s.label.toLowerCase()).join(', ')}.</p>
      )}
      <p><a href={MOCKS_HREF}>Back to the recruiter mocks</a></p>
    </section>
  );
}

/** One checkpoint of the review: its result, the learner's answer, the right one; CP3's query, its grade with the diff and "show answer". */
function MockReviewCheckpoint({ cp }: { cp: MockCaseReviewCheckpoint }) {
  const [answer, setAnswer] = useState<{ sql: string; display: DisplayOk | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const show = async (): Promise<void> => {
    if (!cp.item_id || !cp.item_instance_id) return;
    try { setAnswer(await api.showAnswer(cp.item_id, cp.item_instance_id, 'mock')); } catch (e) { setMessage(errorText(e)); }
  };
  const unit = cp.typed ? ` ${cp.typed.unit_label}` : '';
  return (
    <li data-review={cp.kind} data-outcome={cp.outcome}>
      <h2>{`${checkpointLabel(cp.kind)}: ${MOCK_OUTCOME[cp.outcome]}${cp.late ? ', late' : ''}`}</h2>
      <p className="prompt">{cp.prompt}</p>
      {cp.options && (
        <div>
          {cp.options.map((o) => {
            const mark = o.oid === cp.correct_oid ? 'ok' : o.oid === cp.chosen ? 'bad' : '';
            return <div key={o.oid} className={`option ${mark}`.trim()}>{o.text}{o.oid === cp.chosen && ' (your answer)'}{o.oid === cp.correct_oid && ' (right answer)'}</div>;
          })}
          {cp.explanation && <p>{cp.explanation}</p>}
        </div>
      )}
      {cp.typed && (
        <p>Your answer: {cp.answer ?? <span className="muted">none</span>}{cp.answer !== null && unit}. The value: {cp.value === null ? 'not built yet' : `${cp.value.toFixed(cp.typed.decimals)}${unit}`}.</p>
      )}
      {cp.kind === 'CP3' && (
        <>
          {cp.item_prompt && <p className="prompt">{cp.item_prompt}</p>}
          {cp.output_contract && <p className="contract">Return: {cp.output_contract.columns.map((c) => `${c.name} (${c.type_class})`).join(', ')}{grainLine(cp.output_contract)}</p>}
          {cp.query !== null && <><p><strong>Your answer:</strong></p><SqlCode sql={cp.query} /></>}
          {cp.grade && <GradePanel grade={cp.grade} onDispute={null} />}
          {cp.item_instance_id && !answer && <p><button type="button" className="link-quiet" onClick={() => void show()}>Show answer</button></p>}
          {answer && <div><p><strong>One correct answer:</strong></p><SqlCode sql={answer.sql} />{answer.display && <ResultTable result={answer.display} caption="Its result" />}</div>}
        </>
      )}
      {message && <p role="alert">{message}</p>}
    </li>
  );
}

/**
 * S7-16: CP6 in the review: the written answer, the model answer, and the rubric to tick; the core lines decide the checkpoint. S7-17: while
 * the tutor is on, the tutor's second opinion on the written answer, which sees what this panel shows and names no item, so it is not help.
 */
function MockReviewInsight({ review, onSaved }: { review: CaseMockReview; onSaved: () => void }) {
  const [ticked, setTicked] = useState<string[]>(review.rubric_ticked ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const memo = review.mock === 'take_home';
  const wrote = review.insight !== null;
  const late = review.checkpoints.some((c) => c.kind === 'CP6' && c.late);
  // S7-17: the tutor sees the written answer, the model answer and the rubric lines; it reads only whether the tutor is available.
  useTutorPart(() => mockReviewPart({ memo, written: review.insight, modelAnswer: review.model_answer, rubric: review.rubric, core: review.core_rubric }));
  const quick = secondOpinionPrompts(useTutorAvailable() ? AVAILABLE : null, wrote);
  // D117 (S7C-04): while another mock runs the tutor waits here too, and its line stands where the second opinion would.
  const waits = useTutorWaits();
  const ask = useTutorAsk();
  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await caseMockApi.rubric(review.block_id, ticked); setMessage('Rubric saved.'); onSaved(); }
    catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  const groups = rubricGroups(review.rubric);
  const tick = (pt: Point) => (
    <label key={pt.id}><input type="checkbox" value={pt.id} checked={ticked.includes(pt.id)} disabled={busy || !wrote}
      onChange={(e) => setTicked(e.target.checked ? [...ticked, pt.id] : ticked.filter((x) => x !== pt.id))} /> {pt.label}{review.core_rubric.includes(pt.id) ? ' (core)' : ''}</label>
  );
  return (
    <section className="card case-step" data-review-insight="">
      <h2>{checkpointLabel('CP6')}</h2>
      <h3>{memo ? 'Your memo' : 'Your insight'}</h3>
      {wrote ? <blockquote className="prompt">{review.insight}</blockquote>
        : <p className="muted">None was written in the run, so nothing can be ticked. Save the rubric empty to close the run.</p>}
      {late && <p role="note" className="notice">{LATE_MEMO_LINE}</p>}
      <h3>The model answer</h3>
      <Markdown text={keepLines(review.model_answer)} />
      <div data-rubric="">
        <fieldset className="case-ticks">
          <legend>{`Tick each point your ${memo ? 'memo' : 'insight'} makes. The core lines decide this checkpoint.`}</legend>
          {groups.insight.map(tick)}
        </fieldset>
        {groups.habits.length > 0 && (
          <fieldset className="case-ticks">
            <legend>Tick each habit your queries show.</legend>
            {groups.habits.map(tick)}
          </fieldset>
        )}
      </div>
      <p><button type="button" onClick={() => void save()} disabled={busy}>Save the rubric</button></p>
      {quick.length > 0 && <p className="toolbar tutor-quick">{quick.map((q) => <button key={q.label} type="button" onClick={() => ask?.(q.question)}>{q.label}</button>)}</p>}
      {quick.length === 0 && wrote && waits !== null && <p className="muted">{waits}.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

// web/src/screens/MockScreen.tsx: a recruiter mock's start screen and its run at #/mock/<mock>, and an ended run's review at
// #/mock/review/<block_id> (sprint 7, Task M2; design §5, §6; S7-01 to S7-07, S7-09; D108), for the screen and knowledge mocks; the case
// mocks have their own screen (CaseMockScreen.tsx).
// The start screen shows the rules and, for a form taken before, S7-04's practice line. The run: the countdown (display only; the server is
// the clock, so at 0 the screen asks it to end the run), the questions in the form's order, each the shared mock question
// (components/MockSqlQuestion.tsx: screen mode, a blank editor, Run free and one Submit, which asks in the page before it sends, F2-3-6, and
// whose reply says only that the answer is recorded); answers and the tutor wait for the review. A resumed run shows each answered
// question's mark and keeps its Submit closed (Codex F36). "Hand in" ends it; so does the server's run-over refusal (S7-C18).
// The review: each question with its result, the learner's answer, its grade with the diff, and "show answer", free after the run.
// Part 2 (Task N1; S7-04, S7-07, S7-10): the knowledge mock. Its start screen says whether a pass would count (or when unseen questions
// come back); its run is ChoiceRunScreen's exam view (one question at a time in its own section, forward only, one answer, no confidence);
// its review shows the score per section and topic, never a question.
import { useEffect, useRef, useState } from 'react';
import { passCorrect } from '../../../schemas/mock.ts';
import type { DisplayOk } from '../../../server/runner/protocol.ts';
import { api, type ChoiceSection } from '../api.ts';
import { ChoicePanel } from '../components/ChoicePanel.tsx';
import { GradePanel } from '../components/GradePanel.tsx';
import { MockSqlQuestion } from '../components/MockSqlQuestion.tsx';
import { ResultTable } from '../components/ResultTable.tsx';
import { SqlCode } from '../components/SqlCode.tsx';
import { TOPIC_LABEL } from '../lib/choice-flow.ts';
import { EndGuard, countdownText, endWithRetry, hiddenFlags, remainingSeconds } from '../lib/drill-flow.ts';
import { grainLine } from '../lib/exercise.ts';
import { recallIndex, rememberIndex, resumeIndex } from '../lib/run-flow.ts';
import {
  KNOWLEDGE_HELP_LINE, MOCK_HELP_LINE, MOCK_NAME, MOCKS_HREF, OUTCOME_LINE, PRACTICE_LINE, REVIEW_HELP_LINE, RUN_OVER_LINE, UNSEEN_LINE, answeredServings,
  cardRuleLine, countsLine, formsLine, isKnowledgeRules, isScreenRules, knowledgeUnseenLine, mockRunFromRefusal, mocksApi, questionName, reviewHref, reviewScoreLine,
  type MockCard, type MockKind, type MockReview, type MockReviewItem, type MockRunView,
} from '../lib/mock-flow.ts';
import { TUTOR_WAITS } from '../tutor/snapshot.ts';
import { useTutorClosed } from '../tutor/TutorContext.tsx';

const isMockKind = (m: string): m is MockKind => m === 'screen' || m === 'knowledge' || m === 'case_round' || m === 'take_home';

// ---- the knowledge mock (Task N1) ---------------------------------------------------------------------------------------------------------

const SECTION_NAME: Readonly<Record<ChoiceSection, string>> = { methodology: 'Methodology', ga4: 'GA4' };
/** S7-10: the section a question of the run is opened in (the start names it on each serving). */
const sectionOf = (s: MockRunView['servings'][number]): ChoiceSection => (s.section === 'methodology' ? 'methodology' : 'ga4');
/** B3 I2: the positions of the run that have their answer, as the server gives them (resumeIndex drops any out of range). */
const answeredOf = (r: MockRunView): number[] => {
  const a = (r as { answered?: unknown }).answered;
  return Array.isArray(a) ? a.filter((n): n is number => Number.isInteger(n)) : [];
};
/** S7-07: a knowledge mock's review: the score per section and per topic, never a question. */
interface KnowledgeReview extends MockReview {
  sections: { section: ChoiceSection; correct: number; of: number }[];
  topics: { section: ChoiceSection; topic: string; correct: number; of: number }[];
  topic_names: Record<string, string>;
}

/**
 * S7-10: the run's questions in ChoiceRunScreen's exam view: one at a time, forward only, one answer each and no confidence (S3-04). As
 * there (B3 I2), a resumed run opens after its last answered question and never before the one this tab reached. Its saved line names the
 * knowledge mock (N1 M1).
 */
function KnowledgeQuestions(p: { run: MockRunView; onStopped: (note?: string) => void }) {
  const total = p.run.servings.length;
  const [answered, setAnswered] = useState<ReadonlySet<number>>(() => new Set(answeredOf(p.run)));
  const [index, setIndex] = useState(() => resumeIndex('exam', answeredOf(p.run), total, recallIndex(p.run.block_id, total)));
  const s = p.run.servings[index]!;
  const next = () => { setIndex(index + 1); rememberIndex(p.run.block_id, index + 1); };
  return (
    <>
      <div className="card q-card">
        <h2>{`Question ${index + 1} of ${total}`}</h2>
        <ChoicePanel itemId={s.item_id} section={sectionOf(s)} instanceId={s.item_instance_id}
          run={{ mode: 'exam', kind: 'knowledge_mock', confidence: false, answeredBefore: answered.has(index), visible: true,
            onSaved: () => setAnswered((a) => new Set(a).add(index)), onStopped: p.onStopped }} />
      </div>
      {index < total - 1 && <p className="toolbar"><button type="button" onClick={next}>Next question</button></p>}
    </>
  );
}

/** S7-07: the knowledge review's score per section and per topic (GA4 topic names from the review, Methodology's from the maps). */
function KnowledgeReviewScore({ review }: { review: KnowledgeReview }) {
  const names: Record<string, string> = { ...TOPIC_LABEL, ...review.topic_names };
  return (
    <>
      <p role="status"><strong>{`${review.correct} of ${review.total} right. ${review.passed ? 'Passed.' : 'Not passed.'}`}</strong></p>
      <p>{countsLine(review)}</p>
      <p className="muted">The review shows your score, never the questions, so they stay unseen for a later run.</p>
      <div className="table-scroll card"><table>
        <thead><tr><th scope="col">Section</th><th scope="col">Right</th></tr></thead>
        <tbody>{review.sections.map((x) => <tr key={x.section}><td>{SECTION_NAME[x.section]}</td><td>{`${x.correct} of ${x.of}`}</td></tr>)}</tbody>
      </table></div>
      <h2>By topic</h2>
      <div className="table-scroll card"><table>
        <thead><tr><th scope="col">Topic</th><th scope="col">Section</th><th scope="col">Right</th></tr></thead>
        <tbody>{review.topics.map((x) => (
          <tr key={`${x.section}:${x.topic}`}><td>{names[x.topic] ?? x.topic}</td><td>{SECTION_NAME[x.section]}</td><td>{`${x.correct} of ${x.of}`}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

/** The run: its clock, its questions, "Hand in". */
function MockRun(p: { run: MockRunView; card: MockCard | undefined; onEnded: () => void; onOver: () => void }) {
  const { run } = p;
  // S7-C18: the server said the run is over: the countdown stops and no question is offered again.
  const [over, setOver] = useState(false);
  const overRef = useRef(false);
  const [index, setIndex] = useState(0);
  // Codex F36: a resumed run starts with the marks the run view gives.
  const [answered, setAnswered] = useState<ReadonlySet<number>>(() => new Set(answeredServings(run)));
  const [left, setLeft] = useState(() => remainingSeconds(Date.parse(run.ends_at), Date.now()));
  const [message, setMessage] = useState<string | null>(null);
  const guard = useRef(new EndGuard());
  // An end the clock asked for that failed after its tries: the clock stops asking, and "Hand in" tries again.
  const clockGaveUp = useRef(false);
  // D108: the tutor is closed while the mock's clock runs, as help is, and open again in the review.
  useTutorClosed(TUTOR_WAITS);

  async function end(): Promise<void> {
    if (!guard.current.begin()) return;
    try {
      await endWithRetry(() => mocksApi.end(run.block_id));
      guard.current.done();
      p.onEnded();
    } catch (e) {
      guard.current.failed();
      if (overRef.current) { p.onOver(); return; }                       // the server already said the run is over (S7-C18)
      clockGaveUp.current = true;
      setMessage(`The mock could not be ended: ${(e as Error).message}`);
    }
  }
  /**
   * S7-06 (ruling S7-C18): an answer or an open refused because the run is over (its limit passed, or an app stop or a crash ended it while
   * this page stayed open). The countdown stops, and the run's end opens its review as "Hand in" does; when the end cannot be read either,
   * the start screen opens with the plain line. One try: the server has already ended the run.
   */
  async function stopped(): Promise<void> {
    overRef.current = true;
    setOver(true);
    if (!guard.current.begin()) return;
    try {
      await mocksApi.end(run.block_id);
      guard.current.done();
      p.onEnded();
    } catch {
      guard.current.failed();
      p.onOver();
    }
  }
  // The countdown only displays; at 0 the server is asked to end the run (it has stopped it already). It stops once the run is over.
  useEffect(() => {
    if (over) return;
    const stop = Date.parse(run.ends_at);
    const tick = () => { const s = remainingSeconds(stop, Date.now()); setLeft(s); if (s === 0 && !clockGaveUp.current) void end(); };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [run.block_id, over]);

  if (over) return <section><h1 tabIndex={-1}>{MOCK_NAME[run.mock]}</h1><p role="alert" className="notice">{RUN_OVER_LINE}</p></section>;
  const rules = p.card?.rules ?? null;
  const knowledge = run.mock === 'knowledge';
  /**
   * A knowledge question's refusal: the run-over code ends the run (S7-C18). Any other refusal that may mean the run is gone (a 404 after a
   * restart) ends it only once GET /api/mocks no longer has it on; otherwise its message shows.
   */
  async function knowledgeStopped(note?: string): Promise<void> {
    if (note !== undefined && (await mocksApi.view().catch(() => null))?.run?.block_id === run.block_id) { setMessage(note); return; }
    await stopped();
  }
  /** A screen question's refusal the run acts on: the run is over (S7-C18). */
  const screenRefused = (code: string): boolean => { if (code !== 'RUN_OVER') return false; void stopped(); return true; };
  return (
    <section>
      <h1 tabIndex={-1}>{MOCK_NAME[run.mock]}</h1>
      <div className="card run-bar">
        <div className="run-bar-text">
          <p className="muted">{knowledge ? `${run.servings.length} questions${isKnowledgeRules(rules) ? `, pass with ${passCorrect('knowledge', rules)} right` : ''}.`
            : isScreenRules(rules) ? `${run.servings.length} problems, pass with ${rules.pass_correct} exactly right.` : `${run.servings.length} problems.`}</p>
          <p className="muted">{knowledge ? KNOWLEDGE_HELP_LINE : MOCK_HELP_LINE}</p>
        </div>
        <p className="run-timer"><strong role="timer">{countdownText(left)}</strong></p>
      </div>
      {message && <p role="alert" className="notice">{message}</p>}
      {knowledge ? <KnowledgeQuestions run={run} onStopped={(note) => void knowledgeStopped(note)} /> : <>
        <nav aria-label="Questions" className="qstrip">{run.servings.map((s, i) => (
          <button key={s.item_instance_id} type="button" className={answered.has(i) ? 'answered' : undefined} aria-pressed={i === index} aria-label={questionName(i, answered.has(i))}
            onClick={() => setIndex(i)}>{i === index ? <strong>{i + 1}</strong> : i + 1}</button>
        ))}</nav>
        {/* Every question stays mounted (hidden when not current), so a half-written answer is kept when moving between questions. */}
        {run.servings.map((s, i) => (
          <div key={s.item_instance_id} data-question={i} hidden={hiddenFlags(run.servings.length, index)[i]}>
            <MockSqlQuestion blockId={run.block_id} instanceId={s.item_instance_id} heading={`Question ${i + 1} of ${run.servings.length}`} screen
              answered={s.answered === true} onAnswered={() => setAnswered((a) => new Set(a).add(i))} onRefused={screenRefused} />
          </div>
        ))}
      </>}
      <p><button type="button" onClick={() => { if (confirm('Hand in the mock now? Questions you have not answered count as not right.')) void end(); }}>Hand in</button></p>
    </section>
  );
}

/** #/mock/<mock>: the start screen, or the run that is on. */
export function MockScreen(p: { mock: string }) {
  const [card, setCard] = useState<MockCard | null>(null);
  const [run, setRun] = useState<MockRunView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // S7-C18: a run the server said is over, whose end could not be read: the start screen says so, read again.
  const [over, setOver] = useState(false);
  const [reads, setReads] = useState(0);
  const known = isMockKind(p.mock);
  useEffect(() => {
    mocksApi.view().then((v) => {
      setCard(v.mocks.find((m) => m.mock === p.mock) ?? null);
      if (v.run && v.run.mock === p.mock) setRun(v.run);                       // a run on is picked up again after a reload
      setLoaded(true);
    }, (e: Error) => { setMessage(e.message); setLoaded(true); });
  }, [p.mock, reads]);

  async function start(): Promise<void> {
    if (busy || !known) return;
    setBusy(true); setMessage(null); setOver(false);
    try { setRun(await mocksApi.start(p.mock as MockKind)); } catch (e) {
      const on = mockRunFromRefusal(e);
      if (on && on.mock === p.mock) setRun(on);                                 // already on: pick it up instead of leaving it stranded
      else setMessage((e as Error).message);                                     // another timed run is on, or no form yet
    } finally { setBusy(false); }
  }
  // The end opens the run's review, at its own address.
  if (run) {
    return <MockRun run={run} card={card ?? undefined} onEnded={() => { location.hash = reviewHref(run.block_id); }}
      onOver={() => { setRun(null); setOver(true); setReads((n) => n + 1); }} />;
  }
  const title = known ? MOCK_NAME[p.mock as MockKind] : 'Recruiter mock';
  const head = <div className="page-head"><h1>{title}</h1></div>;
  if (!loaded) return <section>{head}<p>Loading the mock...</p></section>;
  if (!known || !card) {
    return <section>{head}{message && <p role="alert">{message}</p>}<p>No such recruiter mock.</p><p><a href={MOCKS_HREF}>Back to the recruiter mocks</a></p></section>;
  }
  const knowledge = card.mock === 'knowledge';
  return (
    <section>
      {head}
      <p>{cardRuleLine(card)}</p>
      {over && <p role="alert" className="notice">{RUN_OVER_LINE}</p>}
      <p className="muted">{knowledge ? KNOWLEDGE_HELP_LINE : MOCK_HELP_LINE}</p>
      {card.next === null ? <p>{formsLine(card)}</p>
        : <p role={card.next.on_unseen ? undefined : 'note'}>{knowledge ? knowledgeUnseenLine(card.next.on_unseen, card.next_unseen_date)
          : card.next.on_unseen ? UNSEEN_LINE : PRACTICE_LINE}</p>}
      {message && <p role="alert" className="notice">{message}</p>}
      {card.next !== null && <p><button type="button" className="btn-main" disabled={busy} onClick={() => void start()}>{`Start the ${MOCK_NAME[card.mock].toLowerCase()}`}</button></p>}
      <p><a href={MOCKS_HREF}>Back to the recruiter mocks</a></p>
    </section>
  );
}

/** One question of the review: its result, the learner's answer and its grade, and "show answer", free after the run (S7-07). */
function ReviewItem(p: { item: MockReviewItem; total: number }) {
  const { item } = p;
  const [answer, setAnswer] = useState<{ sql: string; display: DisplayOk | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const show = async () => {
    if (!item.item_instance_id) return;
    try { setAnswer(await api.showAnswer(item.item_id, item.item_instance_id, 'mock')); } catch (e) { setMessage((e as Error).message); }
  };
  return (
    <li data-outcome={item.outcome}>
      <h2>Question {item.n} of {p.total}: {OUTCOME_LINE[item.outcome]}</h2>
      {item.prompt && <p className="prompt">{item.prompt}</p>}
      {item.output_contract && <p className="contract">Return: {item.output_contract.columns.map((c) => `${c.name} (${c.type_class})`).join(', ')}{grainLine(item.output_contract)}</p>}
      {item.query !== null && <><p><strong>Your answer:</strong></p><SqlCode sql={item.query} /></>}
      {item.grade && <GradePanel grade={item.grade} onDispute={null} />}
      {item.item_instance_id && !answer && <p><button type="button" className="link-quiet" onClick={() => void show()}>Show answer</button></p>}
      {answer && <div><p><strong>One correct answer:</strong></p><SqlCode sql={answer.sql} />{answer.display && <ResultTable result={answer.display} caption="Its result" />}</div>}
      {message && <p role="alert">{message}</p>}
    </li>
  );
}

/** #/mock/review/<block_id>: an ended run's review (S7-07). */
export function MockReviewScreen(p: { blockId: string }) {
  const [review, setReview] = useState<MockReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mocksApi.review(p.blockId).then(setReview, (e: Error) => setError(e.message)); }, [p.blockId]);
  const head = <div className="page-head"><h1>{review ? `${MOCK_NAME[review.mock]}: review` : 'Mock review'}</h1></div>;
  if (!review) return <section>{head}{error ? <p role="alert">{error}</p> : <p>Loading the review...</p>}</section>;
  if (review.mock === 'knowledge') {
    return <section>{head}<KnowledgeReviewScore review={review as KnowledgeReview} /><p><a href={MOCKS_HREF}>Back to the recruiter mocks</a></p></section>;
  }
  return (
    <section>
      {head}
      <p role="status"><strong>{reviewScoreLine(review)}</strong></p>
      <p>{countsLine(review)}</p>
      <p className="muted">{REVIEW_HELP_LINE}</p>
      <ol className="review-items card">{review.items.map((i) => <ReviewItem key={i.n} item={i} total={review.items.length} />)}</ol>
      <p><a href={MOCKS_HREF}>Back to the recruiter mocks</a></p>
    </section>
  );
}

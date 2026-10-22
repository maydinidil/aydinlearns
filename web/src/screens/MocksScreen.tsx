// web/src/screens/MocksScreen.tsx: Recruiter mocks at #/mocks, the tab after Progress (sprint 7, Task M2; design §2.1; S7-04, S7-05, S7-18).
// One card per recruitment stage, in stage order, each with its status from the readiness board. Stage 1: the GA4 exam and two portfolio
// pieces, logged in Settings. Stages 2 to 5 (all live since Part 2, Task N3): the mock's name, what it tests and its rules (questions or the
// case, minutes, pass mark), its forms left unseen or the date unseen questions return, a start (or the way back to its run that is on), and
// its history (date, score, passed, late, practice) with a review link per run. Stage 6: the live reps of G-STAGE-6's window, with a link to
// Drills. #/mocks?stage=N (a Progress board row) focuses that stage's card. Read only (GET /api/mocks); nothing on it is a gate.
import { useEffect, useState } from 'react';
import { criterionLine } from '../lib/labels.ts';
import {
  DRILLS_HREF, HISTORY_COLUMNS, MOCK_NAME, MOCKS_INTRO, MOCKS_TITLE, SETTINGS_HREF, STAGE_CARDS, cardFormsLine, cardRuleLine, historyCells, liveRepsLine, mockHref,
  mocksApi, reviewHref, type MockCard, type MocksView,
} from '../lib/mock-flow.ts';
import { goalChip, type ProgressGoal } from '../lib/progress-api.ts';

/** A mock's part of its card (S7-18): its forms or return date, a start (or the run that is on), and its history with a review per run. */
function MockPart(p: { card: MockCard; view: MocksView }) {
  const { card, view } = p;
  const name = MOCK_NAME[card.mock].toLowerCase();
  const on = view.run !== null && view.run.mock === card.mock;
  const forms = cardFormsLine(card);
  return (
    <>
      {forms && <p className="muted">{forms}</p>}
      {on ? <p>{`A ${name} is on. `}<a className="btn-main" href={mockHref(card.mock)}>{`Back to the ${name}`}</a></p>
        : card.next !== null && <p><a className="btn-main" href={mockHref(card.mock)}>{`Start the ${name}`}</a></p>}
      {card.history.length === 0 ? <p className="muted">{`No ${name} runs yet.`}</p> : (
        <div className="table-scroll card"><table className="history-table">
          <thead><tr>{HISTORY_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{card.history.map((r) => (
            <tr key={r.block_id}>
              {historyCells(r, view.today).map((c, i) => <td key={i}>{c}</td>)}
              <td><a href={reviewHref(r.block_id)} aria-label={`Review the ${name} of ${r.date}`}>Review</a></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

function StageCard(p: { stage: number; goal: ProgressGoal | undefined; card: MockCard | undefined; view: MocksView }) {
  const { stage, goal, card, view } = p;
  const chip = goal ? goalChip(goal) : null;
  return (
    <li className="card q-card" data-stage={stage}>
      <h2 id={`mock-stage-${stage}`} tabIndex={-1}>{STAGE_CARDS[stage]!.name}{chip && <> <span className={chip.className}>{chip.text}</span></>}</h2>
      <p>{card ? cardRuleLine(card) : STAGE_CARDS[stage]!.tests}</p>
      {goal && <ul className="criteria">{goal.criteria.map((c, i) => <li key={i} data-criterion-met={c.met}>{criterionLine(c, null)}</li>)}</ul>}
      {stage === 1 && <p><a href={SETTINGS_HREF}>Log an exam result or a portfolio piece in Settings</a></p>}
      {stage === 6 && <><p>{liveRepsLine(view.live_reps)}</p><p><a href={DRILLS_HREF}>Go to Drills for a live rep</a></p></>}
      {card && <MockPart card={card} view={view} />}
    </li>
  );
}

export function MocksScreen(p: { stage?: number | null }) {
  const [view, setView] = useState<MocksView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mocksApi.view().then(setView, (e: Error) => setError(e.message)); }, []);
  // S7-18: a Progress board row opens its stage's card: once the cards draw, focus moves to its heading.
  useEffect(() => {
    if (!view || !p.stage) return;
    const h = document.getElementById(`mock-stage-${p.stage}`);
    h?.scrollIntoView?.();
    h?.focus();
  }, [view, p.stage]);

  const head = <div className="page-head"><h1>{MOCKS_TITLE}</h1></div>;
  if (!view) return <section className="mocks">{head}{error ? <p role="alert">{error}</p> : <p>Loading the mocks...</p>}</section>;
  const goalOf = (stage: number) => view.stages.find((s) => s.goal.stage === stage);
  const cardOf = (stage: number) => view.mocks.find((m) => m.stage === stage);
  return (
    <section className="mocks">
      {head}
      <p className="muted">{MOCKS_INTRO}</p>
      <ol className="map-list">{[1, 2, 3, 4, 5, 6].map((n) => <StageCard key={n} stage={n} goal={goalOf(n)} card={cardOf(n)} view={view} />)}</ol>
    </section>
  );
}

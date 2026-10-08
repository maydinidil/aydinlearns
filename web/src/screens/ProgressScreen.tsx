// web/src/screens/ProgressScreen.tsx: Progress at #/progress, the fifth top-bar tab (sprint 4b, Task E1; design §2, §2.1, §14; D39, S4B-21,
// S4B-27). Goals against their dates with each criterion's gap, the recruitment readiness board, the skill maps, the trends over 8 ISO
// weeks, the pre-attempt reveal rate, GA4 and Methodology readiness per topic, and the job-ready criteria. Read only (GET /api/progress):
// it serves and logs nothing, and nothing on it is a gate. No study time anywhere ("Goals, not hours").
import { useEffect, useState } from 'react';
import { criterionLine, type Titles } from '../lib/labels.ts';
import {
  PROGRESS_HREF, PROGRESS_INTRO, PROGRESS_LINKS, PROGRESS_SECTIONS, PROGRESS_TITLE, SECTION_LABEL, STATE_LABEL, countsLine, gapFold, gapLine, goalChip, goalDateLine, jobReadyChip, jobReadyLines,
  progressApi, readyLine, revealLine, shareText, stageLabel, stateChipClass, titlesOf, topicLabel, trendRows, type ProgressGoal, type ProgressView,
} from '../lib/progress-api.ts';

function GoalRow(p: { g: ProgressGoal; today: string; titles: Titles; stage?: boolean }) {
  const chip = goalChip(p.g);
  return (
    <li className="row" data-goal={p.g.goal.id} data-goal-status={p.g.status}>
      <div className="grow">
        <strong>{p.stage ? stageLabel(p.g) : p.g.goal.title}</strong>
        <p className="muted">{goalDateLine(p.g, p.today)}</p>
        <ul className="criteria">{p.g.criteria.map((c, i) => {
          const gap = gapLine(c);
          const fold = gapFold(c);
          return (
            <li key={i} data-criterion-met={c.met}>
              {criterionLine(c, p.titles)}
              {gap && (fold
                ? <details className="gap"><summary>{fold}</summary><p className="muted">{gap}</p></details>
                : <p className="muted">{gap}</p>)}
            </li>
          );
        })}</ul>
      </div>
      <span className={chip.className}>{chip.text}</span>
    </li>
  );
}

/** Finding 21: jumps to a section of this page. The address is a hash route, so a plain #id link would leave the screen. */
function jump(e: { preventDefault: () => void }, id: string): void {
  e.preventDefault();
  const h = document.getElementById(id);
  if (!h) return;
  h.scrollIntoView();
  h.setAttribute('tabindex', '-1');
  h.focus();
}

export function ProgressScreen() {
  const [view, setView] = useState<ProgressView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { progressApi.view().then(setView, (e: Error) => setError(e.message)); }, []);

  const links = <p className="progress-links">{PROGRESS_LINKS.map((l, i) => <span key={l.href}>{i > 0 && ' · '}<a href={l.href}>{l.text}</a></span>)}</p>;
  const head = <div className="page-head"><h1>{PROGRESS_TITLE}</h1></div>;
  if (!view) return <section className="progress">{head}{links}{error ? <p role="alert">{error}</p> : <p>Loading your progress...</p>}</section>;
  const titles = titlesOf(view);
  return (
    <section className="progress">
      {head}
      <p className="muted">{PROGRESS_INTRO}</p>
      {links}
      <nav className="progress-sections" aria-label="On this page">
        {PROGRESS_SECTIONS.map((s, i) => <span key={s.id}>{i > 0 && ' · '}<a href={PROGRESS_HREF} onClick={(e) => jump(e, s.id)}>{s.text}</a></span>)}
      </nav>

      <section aria-labelledby="progress-goals" data-progress="goals">
        <h2 id="progress-goals">Goals</h2>
        <ul className="progress-list card">{view.goals.map((g) => <GoalRow key={g.goal.id} g={g} today={view.today} titles={titles} />)}</ul>
      </section>

      <section aria-labelledby="progress-board" data-progress="board">
        <h2 id="progress-board">Recruitment readiness</h2>
        <p data-ready={view.board.ready}>{readyLine(view.board)}</p>
        <ol className="progress-list card">{view.board.stages.map((s) => <GoalRow key={s.goal.id} g={s} today={view.today} titles={titles} stage />)}</ol>
      </section>

      <section aria-labelledby="progress-skills" data-progress="skills">
        <h2 id="progress-skills">Skill maps</h2>
        <div className="progress-grid">{view.skill_maps.map((m) => (
          <div key={m.section} className="card" data-skill-map={m.section}>
            <h3>{SECTION_LABEL[m.section]}</h3>
            <p>{countsLine(m)}</p>
            <details>
              <summary>Each concept</summary>
              <ul className="concept-list">{m.concepts.map((c) => (
                <li key={c.concept_id} className="row" data-concept={c.concept_id}>
                  <span className="grow">{c.title}</span>
                  <span className={stateChipClass(c.state)}>{STATE_LABEL[c.state]}</span>
                </li>
              ))}</ul>
            </details>
          </div>
        ))}</div>
      </section>

      <section aria-labelledby="progress-trends" data-progress="trends">
        <h2 id="progress-trends">Trends</h2>
        <p className="muted">First-attempt accuracy: right on the first graded attempt with no help before it. With help: a hint or the answer was opened.</p>
        <div className="table-scroll card">
          <table className="history-table">
            <thead><tr>
              <th scope="col">Week</th><th scope="col">SQL: first-attempt accuracy</th><th scope="col">SQL: with help</th>
              <th scope="col">Choice: first-attempt accuracy</th><th scope="col">Choice: with help</th>
            </tr></thead>
            <tbody>{trendRows(view.trends, view.today).map((r) => (
              <tr key={r.week} data-week={r.week}>
                <th scope="row">{r.label}</th><td>{r.sql_first}</td><td>{r.sql_help}</td><td>{r.choice_first}</td><td>{r.choice_help}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="progress-reveal" data-progress="reveal">
        <h2 id="progress-reveal">Answers shown before trying</h2>
        <p className="card">{revealLine(view.reveal_rate, view.today)}</p>
      </section>

      <section aria-labelledby="progress-topics" data-progress="topics">
        <h2 id="progress-topics">GA4 and Methodology readiness per topic</h2>
        <p className="muted">How often your first answer was right in the last 30 days, leaving out answers given just after the reading.</p>
        <div className="progress-grid">{view.topic_readiness.map((s) => (
          <div key={s.section} className="table-scroll card" data-topics={s.section}>
            <table className="history-table">
              <caption>{SECTION_LABEL[s.section]}</caption>
              <thead><tr><th scope="col">Topic</th><th scope="col">First answers right</th></tr></thead>
              <tbody>{s.topics.map((t) => (
                <tr key={t.topic_id} data-topic={t.topic_id}><th scope="row">{topicLabel(t)}</th><td>{shareText(t.first_answers, 'No answers yet')}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ))}</div>
      </section>

      <section aria-labelledby="progress-job-ready" data-progress="job-ready">
        <h2 id="progress-job-ready">Job-ready criteria</h2>
        <ol className="progress-list card">{view.job_ready.map((j) => {
          const chip = jobReadyChip(j);
          return (
            <li key={j.id} className="row" data-jr={j.id} data-jr-status={j.status}>
              <div className="grow">
                <strong>{j.id}: {j.title}</strong>
                {jobReadyLines(j).map((l) => <p key={l} className="muted">{l}</p>)}
              </div>
              <span className={chip.className}>{chip.text}</span>
            </li>
          );
        })}</ol>
      </section>
    </section>
  );
}

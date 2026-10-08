// web/src/screens/SetupScreen.tsx: settings and setup (design §14, minimal in 1a). In setup mode it is the only screen.
import { useEffect, useState } from 'react';
import { api, type StatusView } from '../api.ts';
import type { Goal } from '../../../core/goals.ts';
import { PORTFOLIO_HREF, portfolioApi } from '../lib/portfolio-api.ts';

const OUTSIDE_SOURCES = ['SQLBolt', 'LeetCode', 'HackerRank', 'Skillshop', 'Monthly outside benchmark', 'Other'];
const NO_REPORT = { item_id: '', text: '' };
const NO_GA4 = { date: '', score: '', passed: false };
const NO_PIECE = { title: '', data_source: '', real_data: false };

export function SetupScreen() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState('');
  const [portfolio, setPortfolio] = useState('');
  /** D4-m11: the saved portfolio folder has loaded (or failed to): until then its field and Save wait, so Save never clears it. */
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
  const [exam, setExam] = useState('');
  const [goalDates, setGoalDates] = useState<Record<string, string>>({});
  const [report, setReport] = useState(NO_REPORT);
  const [outside, setOutside] = useState({ source: OUTSIDE_SOURCES[0]!, description: '', score: '' });
  const [ga4, setGa4] = useState(NO_GA4);
  const [piece, setPiece] = useState(NO_PIECE);

  useEffect(() => {
    api.status().then((s) => {
      setStatus(s);
      setBackup(s.settings?.backup_folder ?? '');
      setExam(s.settings?.exam_date ?? '');
      setGoalDates(s.settings?.goal_dates ?? {});
      if (!s.degraded) {
        api.goals().then(setGoals, (e: Error) => setError(`The goals could not be loaded: ${e.message}`));
        // S4B-19: the portfolio folder is read from the portfolio route; /api/status stays as it was.
        // A failed load leaves the field empty and usable, as before.
        portfolioApi.view().then((v) => setPortfolio(v.folder ?? ''), (e: Error) => setError(`The portfolio folder could not be loaded: ${e.message}`))
          .finally(() => setPortfolioLoaded(true));
      }
    }, (e: Error) => setError(e.message));
  }, []);

  /** Sends one request at a time (every log entry is permanent). The form is cleared only when it worked. */
  function send(request: () => Promise<unknown>, done: string, clear?: () => void) {
    setBusy(true); setNotice(null); setError(null);
    request().then(() => { setNotice(done); clear?.(); }, (e: Error) => setError(e.message)).finally(() => setBusy(false));
  }

  if (!status) return error ? <p role="alert">{error}</p> : <p>Loading...</p>;
  const ga4Score = ga4.score.trim() === '' ? NaN : Number(ga4.score);
  return (
    <section>
      <h1>Settings and setup</h1>
      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="notice">{error}</p>}

      <div className="card settings-card">
      <h2>Checks</h2>
      {status.degraded && <p className="callout">The app is in setup mode until every check below passes. Fix the first failing one, then restart the server.</p>}
      <ul>{status.checks.map((c) => <li key={c.name} className={c.ok ? 'ok' : 'bad'}><strong>{c.name}</strong> {c.ok ? 'passes' : 'fails'}: {c.detail}</li>)}</ul>
      {status.versions && <p className="muted">Versions: data {status.versions.dataset}, DuckDB {status.versions.duckdb}, content {status.versions.content}, grader {status.versions.grader}</p>}
      </div>

      {!status.degraded && (
        <>
          <div className="card settings-card">
          <h2>Backup and dates</h2>
          <p><label>Backup folder (a copy of the log is saved here after each session){' '}
            <input value={backup} placeholder="D:\Backups\aydinlearns" onChange={(e) => setBackup(e.target.value)} /></label>{' '}
            <button type="button" disabled={busy} onClick={() => send(() => api.settings('backup_folder', backup.trim()), 'Backup folder saved.')}>Save</button></p>
          <p><label>GA4 exam date <input type="date" value={exam} onChange={(e) => setExam(e.target.value)} /></label>{' '}
            <button type="button" disabled={busy} onClick={() => send(() => api.settings('exam_date', exam || null), 'Exam date saved.')}>Save</button></p>

          <h3>Goal dates</h3>
          {goals.length > 0 && (
            <>
              <table>
                <thead><tr><th>Goal</th><th>Target date</th></tr></thead>
                <tbody>{goals.map((g) => (
                  <tr key={g.id}><td>{g.title}</td><td>
                    <input type="date" aria-label={`Target date: ${g.title}`} value={goalDates[g.id] || g.target_date}
                      onChange={(e) => setGoalDates({ ...goalDates, [g.id]: e.target.value })} /></td></tr>
                ))}</tbody>
              </table>
              <button type="button" disabled={busy} onClick={() => send(() => api.settings('goal_dates', goalDates), 'Goal dates saved.')}>Save goal dates</button>
            </>
          )}
          </div>

          <div className="card settings-card">
          <h2>Portfolio</h2>
          <p><label>Portfolio folder (each solved case you export is saved here as a page and a CSV){' '}
            <input value={portfolio} placeholder="D:\Portfolio" disabled={!portfolioLoaded} onChange={(e) => setPortfolio(e.target.value)} /></label>{' '}
            <button type="button" aria-label="Save portfolio folder" disabled={busy || !portfolioLoaded}
              onClick={() => send(() => portfolioApi.setFolder(portfolio.trim()), 'Portfolio folder saved.')}>Save</button></p>
          <p className="muted">Use a full path to a folder that exists. Export your solved cases from the <a href={PORTFOLIO_HREF}>portfolio</a>.</p>
          </div>

          <div className="card settings-card">
          <h2>Report a content error</h2>
          <p><label>Exercise ID, if you know it <input value={report.item_id} onChange={(e) => setReport({ ...report, item_id: e.target.value })} /></label></p>
          <p><label>What is wrong? <textarea value={report.text} onChange={(e) => setReport({ ...report, text: e.target.value })} /></label></p>
          <button type="button" disabled={busy || !report.text.trim()}
            onClick={() => send(() => api.report(report.item_id.trim() || 'general', report.text), 'Reported. Thank you.', () => setReport(NO_REPORT))}>Send</button>
          </div>

          <div className="card settings-card">
          <h2>Practice outside the app</h2>
          <p><label>Where <select value={outside.source} onChange={(e) => setOutside({ ...outside, source: e.target.value })}>
            {OUTSIDE_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select></label></p>
          <p><label>What you did <input value={outside.description} onChange={(e) => setOutside({ ...outside, description: e.target.value })} /></label></p>
          <p><label>Score (optional) <input value={outside.score} onChange={(e) => setOutside({ ...outside, score: e.target.value })} /></label></p>
          <button type="button" disabled={busy || !outside.description.trim()}
            onClick={() => send(() => api.outsidePractice({ source: outside.source, description: outside.description.trim(), ...(outside.score.trim() ? { score: outside.score.trim() } : {}) }),
              'Logged.', () => setOutside((o) => ({ ...o, description: '', score: '' })))}>Log it</button>
          </div>

          <div className="card settings-card">
          <h2>External results</h2>
          <h3>GA4 exam</h3>
          <p><label>Date <input type="date" value={ga4.date} onChange={(e) => setGa4({ ...ga4, date: e.target.value })} /></label>{' '}
            <label>Score <input type="number" value={ga4.score} onChange={(e) => setGa4({ ...ga4, score: e.target.value })} /></label>{' '}
            <label><input type="checkbox" checked={ga4.passed} onChange={(e) => setGa4({ ...ga4, passed: e.target.checked })} /> Passed</label></p>
          <button type="button" disabled={busy || !ga4.date || !Number.isFinite(ga4Score)}
            onClick={() => send(() => api.externalResult({ kind: 'ga4_exam', data: { date: ga4.date, score: ga4Score, passed: ga4.passed } }), 'Exam result logged.', () => setGa4(NO_GA4))}>Log exam</button>
          <h3>Finished portfolio piece</h3>
          <p><label>Title <input value={piece.title} onChange={(e) => setPiece({ ...piece, title: e.target.value })} /></label>{' '}
            <label>Data source <input value={piece.data_source} onChange={(e) => setPiece({ ...piece, data_source: e.target.value })} /></label>{' '}
            <label><input type="checkbox" checked={piece.real_data} onChange={(e) => setPiece({ ...piece, real_data: e.target.checked })} /> Real data</label></p>
          <button type="button" disabled={busy || !piece.title.trim() || !piece.data_source.trim()}
            onClick={() => send(() => api.externalResult({ kind: 'portfolio_piece', data: { title: piece.title.trim(), data_source: piece.data_source.trim(), real_data: piece.real_data } }),
              'Portfolio piece logged.', () => setPiece(NO_PIECE))}>Log piece</button>
          </div>
        </>
      )}
    </section>
  );
}

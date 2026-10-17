// web/src/screens/SetupScreen.tsx: settings and setup (design §14, minimal in 1a). In setup mode it is the only screen.
import { useEffect, useRef, useState } from 'react';
import { api, type StatusView } from '../api.ts';
import { versionLine } from '../lib/version.ts';
import type { Goal } from '../../../core/goals.ts';
import { PORTFOLIO_HREF, portfolioApi } from '../lib/portfolio-api.ts';
import { checksSummary } from '../lib/polish-p2a.ts';
import type { TutorEffort, TutorKeyView, TutorProviderName, TutorStatusView } from '../../../schemas/tutor.ts';
import { saveTutorKey, tutorStatus } from '../tutor/tutor-api.ts';
import { capText, limitToSave, MAX_CAP_USD, MIN_CAP_USD, resetsBudget } from '../lib/tutor-budget.ts';
import {
  canRemoveKey, EFFORT_NOTE, EFFORT_OPTIONS, keepChoice, keyName, keyNotice, keySourceLine, keyToSave, keyView, KEYS_NOTE, modelOptions, modelToSave,
  removeKeyBody, statusLine, SWITCH_LABEL, switchNotice,
} from '../lib/tutor-settings.ts';

const OUTSIDE_SOURCES = ['SQLBolt', 'LeetCode', 'HackerRank', 'Skillshop', 'Monthly outside benchmark', 'Other'];
const NO_REPORT = { item_id: '', text: '' };
const NO_GA4 = { date: '', score: '', passed: false };
const NO_PIECE = { title: '', data_source: '', real_data: false };

const TUTOR_PROVIDERS: readonly TutorProviderName[] = ['claude', 'openai'];

/** `onTutorStatus`: each tutor status this screen reads, so the top bar's "Ask the tutor" follows the switch and the keys (App.tsx). */
export function SetupScreen({ onTutorStatus }: { onTutorStatus?: (s: TutorStatusView) => void } = {}) {
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
  /**
   * The AI tutor (D91, D98; block P, T-20 to T-22): on or off and why, today's spend, the switch, the model, the effort, the daily
   * budget and the two keys. Every control shows the saved state from the status; a model or effort picked but not saved yet stays
   * picked while another control is saved (keepChoice).
   */
  const [tutor, setTutor] = useState<TutorStatusView | null>(null);
  const tutorBefore = useRef<TutorStatusView | null>(null);
  const [tutorLoaded, setTutorLoaded] = useState(false);
  const [cap, setCap] = useState('');
  /** Review T8 I3: the budget field holds input the browser cannot read (validity.badInput), which a number input reports as empty. */
  const [capBad, setCapBad] = useState(false);
  const [noLimit, setNoLimit] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<TutorEffort | null>(null);
  /** The switch as clicked, while its save is on its way; null: as the status says. */
  const [switching, setSwitching] = useState<boolean | null>(null);
  const showTutor = (s: TutorStatusView) => {
    const before = tutorBefore.current;
    tutorBefore.current = s;
    setTutor(s);
    if (resetsBudget(before?.cap_usd, s.cap_usd)) { setCap(capText(s.cap_usd)); setCapBad(false); setNoLimit(s.cap_usd === null); }
    setModel((d) => keepChoice(d, before?.model ?? null, s.model, (id) => modelToSave(id, s) !== null));
    setEffort((d) => keepChoice(d, before?.effort ?? null, s.effort));
    setSwitching(null);
    onTutorStatus?.(s);
  };

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
        tutorStatus().then(showTutor, (e: Error) => setError(`The tutor's status could not be loaded: ${e.message}`)).finally(() => setTutorLoaded(true));
      }
    }, (e: Error) => setError(e.message));
  }, []);

  /** Sends one request at a time (every log entry is permanent). The form is cleared only when it worked. */
  function send(request: () => Promise<unknown>, done: string, clear?: () => void) {
    setBusy(true); setNotice(null); setError(null);
    request().then(() => { setNotice(done); clear?.(); }, (e: Error) => setError(e.message)).finally(() => setBusy(false));
  }
  /** A tutor change: after it, worked or not, the status is read again, so every control shows what is saved (and the top bar follows). */
  function sendTutor(request: () => Promise<unknown>, done: string) {
    send(() => request().finally(() => tutorStatus().then(showTutor, () => {})), done);
  }

  if (!status) return error ? <p role="alert">{error}</p> : <p>Loading...</p>;
  const ga4Score = ga4.score.trim() === '' ? NaN : Number(ga4.score);
  const budget = limitToSave(cap, capBad, noLimit);
  /** Review T8 I3 (the D4-m11 pattern): the field and Save wait for the saved cap, and stay closed if it failed to load, so Save never clears it. */
  const capLoaded = tutor !== null;
  const modelChosen = tutor !== null && model !== null ? modelToSave(model, tutor) : null;
  return (
    <section>
      <h1>Settings and setup</h1>
      {versionLine(status) && <p className="muted">{versionLine(status)}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="notice">{error}</p>}

      <div className="card settings-card">
      <h2>Checks</h2>
      {status.degraded && <p className="callout">The app is in setup mode until every check below passes. Fix the first failing one, then restart the server.</p>}
      <details open={status.checks.some((c) => !c.ok)}>
        <summary>{checksSummary(status.checks)}</summary>
        <ul>{status.checks.map((c) => <li key={c.name} className={c.ok ? 'ok' : 'bad'}><strong>{c.name}</strong> {c.ok ? 'passes' : 'fails'}: {c.detail}</li>)}</ul>
        {status.versions && <p className="muted">Versions: data {status.versions.dataset}, DuckDB {status.versions.duckdb}, content {status.versions.content}, grader {status.versions.grader}</p>}
      </details>
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
          <h2>The AI tutor</h2>
          {tutor === null ? <p className="muted">{tutorLoaded ? 'Its status could not be loaded.' : 'Loading...'}</p> : <p>{statusLine(tutor)}</p>}
          {/* The switch saves as it is clicked (T-22 tutor_enabled). While a save is on its way it takes no click, but keeps focus. */}
          {tutor !== null && (
            <p><label><input type="checkbox" role="switch" checked={switching ?? tutor.switched_on} aria-disabled={busy || undefined}
              onChange={(e) => {
                if (busy) return;
                const on = e.target.checked;
                setSwitching(on);
                sendTutor(() => api.settings('tutor_enabled', on), switchNotice(on));
              }} /> {SWITCH_LABEL}</label></p>
          )}
          {tutor !== null && (
            <>
              <fieldset className="tutor-choice">
                <legend>Model</legend>
                {modelOptions(tutor).map((m, i) => (
                  <p key={m.id}><label><input type="radio" name="tutor-model" value={m.id} checked={model === m.id} disabled={!m.available}
                    aria-describedby={m.note ? `tutor-model-note-${i}` : undefined} onChange={() => setModel(m.id)} /> {m.label}, <span className="muted">{m.price}</span></label>
                    {m.note && <span id={`tutor-model-note-${i}`} className="tutor-model-note">{m.note}</span>}</p>
                ))}
              </fieldset>
              <p><button type="button" aria-label="Save tutor model" disabled={busy || modelChosen === null}
                onClick={() => { if (modelChosen !== null) sendTutor(() => api.settings('tutor_model', modelChosen), 'Tutor model saved.'); }}>Save</button></p>
              <fieldset className="tutor-choice" aria-describedby="tutor-effort-note">
                <legend>Effort</legend>
                {EFFORT_OPTIONS.map((o) => (
                  <label key={o.value}><input type="radio" name="tutor-effort" value={o.value} checked={effort === o.value} onChange={() => setEffort(o.value)} /> {o.label}</label>
                ))}
                <p id="tutor-effort-note" className="muted">{EFFORT_NOTE}</p>
              </fieldset>
              <p><button type="button" aria-label="Save tutor effort" disabled={busy || effort === null}
                onClick={() => { if (effort !== null) sendTutor(() => api.settings('tutor_effort', effort), 'Tutor effort saved.'); }}>Save</button></p>
            </>
          )}
          {/* React skips onChange while the value stays empty (typing "," into an empty field), so onInput reads badInput on every edit. */}
          <p><label>Daily budget in US dollars <input type="number" min={MIN_CAP_USD} max={MAX_CAP_USD} step={0.05} value={cap} disabled={!capLoaded || noLimit}
            aria-invalid={budget.ok ? undefined : true} aria-describedby={budget.ok ? undefined : 'tutor-budget-problem'}
            onChange={(e) => { setCap(e.target.value); setCapBad(e.target.validity.badInput); }}
            onInput={(e) => setCapBad(e.currentTarget.validity.badInput)} /></label>{' '}
            <label><input type="checkbox" checked={noLimit} disabled={!capLoaded} onChange={(e) => setNoLimit(e.target.checked)} /> No daily limit</label>{' '}
            <button type="button" aria-label="Save tutor budget" disabled={busy || !capLoaded || !budget.ok}
              onClick={() => {
                if (!budget.ok) return;
                const value = budget.value;
                sendTutor(() => api.settings('tutor_daily_cap_usd', value), 'Tutor budget saved.');
              }}>Save</button></p>
          {!budget.ok && <p id="tutor-budget-problem" className="notice">{budget.problem}</p>}
          <p className="muted">The tutor stops for the day when this is spent. It is $1 when nothing is set. With no daily limit it never stops, and the spend is still shown.</p>
          {tutor !== null && (
            <>
              <h3>Keys</h3>
              <p className="muted">{KEYS_NOTE}</p>
              {TUTOR_PROVIDERS.map((p) => <TutorKeyRow key={p} view={keyView(tutor, p)} busy={busy} onSend={sendTutor} />)}
            </>
          )}
          </div>

          <div className="card settings-card">
          <h2>Report a content error</h2>
          <p><label>Exercise ID, if you know it <input value={report.item_id} onChange={(e) => setReport({ ...report, item_id: e.target.value })} /></label></p>
          <p><label className="field">What is wrong? <textarea value={report.text} onChange={(e) => setReport({ ...report, text: e.target.value })} /></label></p>
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

/**
 * One provider's key (T-20): a password field that is never filled in, Save, Remove for a key saved in the app, and where the key comes
 * from. What is typed lives only in this row's field; Save empties the field before the key is sent, worked or not, and the key goes only
 * in the request's body. The server's refusal line comes back through `onSend` as it came.
 */
function TutorKeyRow({ view, busy, onSend }: { view: TutorKeyView; busy: boolean; onSend: (request: () => Promise<unknown>, done: string) => void }) {
  const [draft, setDraft] = useState('');
  const name = keyName(view.provider);
  const sourceId = `tutor-key-source-${view.provider}`;
  const body = keyToSave(view.provider, draft);
  return (
    <div className="tutor-key">
      <p><label>{name} <input type="password" autoComplete="off" spellCheck={false} value={draft} aria-describedby={sourceId}
        onChange={(e) => setDraft(e.target.value)} /></label>{' '}
        <button type="button" aria-label={`Save ${name}`} disabled={busy || body === null}
          onClick={() => { if (body === null) return; setDraft(''); onSend(() => saveTutorKey(body), keyNotice(view.provider, true)); }}>Save</button>
        {canRemoveKey(view) && <>{' '}<button type="button" aria-label={`Remove ${name}`} disabled={busy}
          onClick={() => onSend(() => saveTutorKey(removeKeyBody(view.provider)), keyNotice(view.provider, false))}>Remove</button></>}</p>
      <p id={sourceId} className="muted">{keySourceLine(view.source)}</p>
    </div>
  );
}

// web/src/screens/PortfolioScreen.tsx: the Portfolio at #/portfolio (sprint 4b, Task D4; design §7, §14; S4B-16, S4B-19, D39). Each
// solved case with its last export date and an Export button, which writes a markdown page and a CSV of the case's result into the
// portfolio folder. With no folder set, or one the server cannot use, a link to Settings. Reading it serves and logs nothing
// (GET /api/portfolio). The SQL tab is the current tab (lib/nav.ts).
import { useEffect, useState } from 'react';
import { PageHead } from '../components/PageHead.tsx';
import { INBOX_HREF } from '../lib/case-flow.ts';
import { crumbParts } from '../lib/crumb.ts';
import {
  FLAGSHIP_LINE, PORTFOLIO_TITLE, SETTINGS_HREF, exportName, folderState, portfolioApi, portfolioRow, savedNotice, type PortfolioView,
} from '../lib/portfolio-api.ts';

export function PortfolioScreen() {
  const [view, setView] = useState<PortfolioView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { portfolioApi.view().then(setView, (e: Error) => setError(e.message)); }, []);

  /** One export at a time: each one writes files and a log entry, so a double click must not make two. */
  async function exportCase(caseId: string) {
    if (busy) return;
    setBusy(true); setNotice(null); setError(null);
    try {
      setNotice(savedNotice(await portfolioApi.exportCase(caseId)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      // Read again: the new export date, and any folder problem the server found.
      await portfolioApi.view().then(setView, () => {});
      setBusy(false);
    }
  }

  const head = <PageHead section="sql" title={PORTFOLIO_TITLE} crumb={crumbParts({ section: 'sql', hideLabels: false })} />;
  if (!view) return <section className="portfolio">{head}{error ? <p role="alert">{error}</p> : <p>Loading the portfolio...</p>}</section>;
  const folder = folderState(view);
  return (
    <section className="portfolio">
      {head}
      <p className="muted">Each solved case exports as a markdown page, with a CSV of its full result beside it. The page says where the data comes from.</p>
      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="notice">{error}</p>}
      <p className={folder.ready ? undefined : 'callout'} data-folder={folder.ready ? 'ready' : 'not-ready'}>
        {folder.text} <a href={SETTINGS_HREF}>{folder.link}</a>
      </p>
      {view.cases.length === 0 ? <p>No solved case yet. Solve a case from the <a href={INBOX_HREF}>case inbox</a>, then export it here.</p> : (
        <ul className="inbox-list card">
          {view.cases.map((c) => {
            const r = portfolioRow(c);
            return (
              <li key={r.case_id} className="row" data-case={r.case_id}>
                <span className="marker" aria-hidden="true" />
                <div className="grow">
                  <a href={r.href}><strong>{r.title}</strong></a>
                  <p className="muted">{r.meta}</p>
                  <p>{r.solved}. <span className="muted" data-export-date>{r.exported}</span></p>
                </div>
                <span className="chip-col">
                  <button type="button" aria-label={exportName(c)} disabled={busy || !folder.ready} onClick={() => void exportCase(c.case_id)}>Export</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted">{FLAGSHIP_LINE}</p>
    </section>
  );
}

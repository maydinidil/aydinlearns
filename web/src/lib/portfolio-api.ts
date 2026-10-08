// web/src/lib/portfolio-api.ts: the portfolio calls and the Portfolio screen's pure helpers (sprint 4b, Task D4; S4B-16, S4B-19), on
// api.ts's shared fetch wrapper. The shapes are declared here as server/routes/portfolio.ts answers them, since the server module
// brings node types the browser build does not have; tests/web/portfolio.test.ts keeps the two the same at type level.
// Settings reads the portfolio folder from GET /api/portfolio and saves it through /api/settings, like the backup folder.
import { apiCall } from '../api.ts';
import { caseHref, kindLabel } from './case-flow.ts';
import type { CaseKind, DataSource } from './cases-api.ts';

/** One solved case (S4B-19): when it was solved, and its latest export (the Amsterdam date and the files it wrote). */
export interface PortfolioCaseEntry {
  case_id: string; kind: CaseKind; level: number | null; title: string; persona: { name: string; role: string }; data_source: DataSource | null;
  score: number; solved_at: string | null; solved_on: string | null;
  last_export: { ts: string; date: string; files: string[] } | null;
  export_count: number;
}
/** GET /api/portfolio. `folder_problem` is the plain message an export would refuse with now, or null when it can go ahead. */
export interface PortfolioView { folder: string | null; folder_problem: string | null; cases: PortfolioCaseEntry[] }
/** After an export: the two file names written in `folder`, and whether the query still ran. */
export interface ExportReply { case_id: string; folder: string; files: string[]; query_runs: boolean }

export const portfolioApi = {
  /** Read only: serves and logs nothing. */
  view: () => apiCall<PortfolioView>('GET', '/api/portfolio'),
  /** Writes the page and the CSV, then logs one case_export. A 409 for an unsolved case, a 400 for a folder problem. */
  exportCase: (id: string) => apiCall<ExportReply>('POST', `/api/cases/${encodeURIComponent(id)}/export`, {}),
  /** The folder setting (S4B-19), checked like the backup folder: a full path, or '' to clear it. */
  setFolder: (folder: string) => apiCall<{ ok: true }>('POST', '/api/settings', { key: 'portfolio_folder', value: folder }),
};

export const PORTFOLIO_HREF = '#/portfolio';
export const SETTINGS_HREF = '#/setup';
export const PORTFOLIO_TITLE = 'Portfolio';
/** S4B-19. */
export const FLAGSHIP_LINE = 'Flagship pieces on real data arrive with the datasets in sprint 6.';

export interface PortfolioRow { case_id: string; href: string; title: string; meta: string; solved: string; exported: string }
/** A solved case as the screen lists it: the kind, level and data source, when it was solved and when it was last exported. */
export function portfolioRow(e: PortfolioCaseEntry): PortfolioRow {
  const meta = [kindLabel(e.kind), e.level === null ? null : `Level ${e.level}`, e.data_source?.label ?? null].filter((x): x is string => x !== null).join(' · ');
  return { case_id: e.case_id, href: caseHref(e.case_id), title: e.title, meta, solved: e.solved_on ? `Solved ${e.solved_on}` : 'Solved', exported: exportedText(e) };
}
export function exportedText(e: Pick<PortfolioCaseEntry, 'last_export' | 'export_count'>): string {
  if (e.last_export === null) return 'Not exported yet';
  return `Last exported ${e.last_export.date}${e.export_count > 1 ? ` (${e.export_count} exports)` : ''}`;
}
/** The Export button's accessible name: its visible text first, then the case (WCAG 2.5.3). */
export const exportName = (e: Pick<PortfolioCaseEntry, 'title'>): string => `Export: ${e.title}`;

/** The folder line: whether an export can go ahead, what to say, and the words of the link to Settings. */
export function folderState(v: PortfolioView): { ready: boolean; text: string; link: string } {
  if (v.folder === null) return { ready: false, text: 'No portfolio folder is set yet.', link: 'Choose one in Settings' };
  if (v.folder_problem !== null) return { ready: false, text: v.folder_problem, link: 'Open Settings' };
  return { ready: true, text: `Exports are saved in ${v.folder}.`, link: 'Change the folder in Settings' };
}
/** What the screen says after an export. */
export function savedNotice(r: ExportReply): string {
  const saved = `Saved ${r.files.join(' and ')} in ${r.folder}.`;
  return r.query_runs ? saved : `${saved} The query no longer runs, so the page says so and the CSV holds the header only.`;
}

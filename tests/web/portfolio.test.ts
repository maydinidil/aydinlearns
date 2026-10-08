// tests/web/portfolio.test.ts: the Portfolio screen's pure helpers (sprint 4b, Task D4; S4B-16, S4B-19). The browser's portfolio
// types are checked against the routes' at type level, both ways (npm run typecheck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExportReply as ServerExport, PortfolioCaseEntry as ServerEntry, PortfolioView as ServerView } from '../../server/routes/portfolio.ts';
import {
  FLAGSHIP_LINE, PORTFOLIO_HREF, SETTINGS_HREF, exportName, exportedText, folderState, portfolioRow, savedNotice,
  type ExportReply, type PortfolioCaseEntry, type PortfolioView,
} from '../../web/src/lib/portfolio-api.ts';

// The browser's declarations and the routes' are the same shapes.
const sameShape: [
  (x: ServerView) => PortfolioView, (x: PortfolioView) => ServerView, (x: ServerEntry) => PortfolioCaseEntry, (x: PortfolioCaseEntry) => ServerEntry,
  (x: ServerExport) => ExportReply, (x: ExportReply) => ServerExport,
] = [(x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x];
void sameShape;

const entry = (over: Partial<PortfolioCaseEntry> = {}): PortfolioCaseEntry => ({
  case_id: 'CASE-PRICE-01', kind: 'inbox', level: 3, title: 'Did the price cut pay?', persona: { name: 'Joost', role: 'Pricing lead' },
  data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null }, score: 1, solved_at: '2026-10-07T21:30:00.000Z',
  solved_on: '2026-10-07', last_export: null, export_count: 0, ...over,
});

test('the links and the flagship line (S4B-19)', () => {
  assert.equal(PORTFOLIO_HREF, '#/portfolio');
  assert.equal(SETTINGS_HREF, '#/setup');
  assert.equal(FLAGSHIP_LINE, 'Flagship pieces on real data come in a later version.');
});

test('a solved case\'s row: the kind, level and data source, when it was solved, and its last export date', () => {
  assert.deepEqual(portfolioRow(entry()), {
    case_id: 'CASE-PRICE-01', href: '#/case/CASE-PRICE-01', title: 'Did the price cut pay?',
    meta: 'Inbox case · Level 3 · Fictional, generated data: Voltmarkt', solved: 'Solved 2026-10-07', exported: 'Not exported yet',
  });
  assert.equal(portfolioRow(entry({ level: null, data_source: null })).meta, 'Inbox case');
  assert.equal(exportedText(entry({ last_export: { ts: '2026-10-08T08:00:00.000Z', date: '2026-10-08', files: ['a.md', 'a.csv'] }, export_count: 1 })), 'Last exported 2026-10-08');
  assert.equal(exportedText(entry({ last_export: { ts: '2026-10-08T08:00:00.000Z', date: '2026-10-08', files: ['a.md', 'a.csv'] }, export_count: 3 })),
    'Last exported 2026-10-08 (3 exports)');
});

test('the Export button is named by its case, starting with its visible text', () => {
  assert.equal(exportName(entry()), 'Export: Did the price cut pay?');
});

test('the folder line: none set, a problem the server found, or where the files go', () => {
  const view = (over: Partial<PortfolioView>): PortfolioView => ({ folder: null, folder_problem: null, cases: [], ...over });
  assert.deepEqual(folderState(view({ folder_problem: 'No portfolio folder is set. Choose one in Settings.' })),
    { ready: false, text: 'No portfolio folder is set yet.', link: 'Choose one in Settings' });
  assert.deepEqual(folderState(view({ folder: 'D:\\Missing', folder_problem: 'The portfolio folder D:\\Missing does not exist. Create it, or choose another in Settings.' })),
    { ready: false, text: 'The portfolio folder D:\\Missing does not exist. Create it, or choose another in Settings.', link: 'Open Settings' });
  assert.deepEqual(folderState(view({ folder: 'D:\\Portfolio' })), { ready: true, text: 'Exports are saved in D:\\Portfolio.', link: 'Change the folder in Settings' });
});

test('after an export: the two file names and the folder, and a plain line when the query no longer runs', () => {
  const r: ExportReply = { case_id: 'CASE-PRICE-01', folder: 'D:\\Portfolio', files: ['CASE-PRICE-01-2026-10-08.md', 'CASE-PRICE-01-2026-10-08.csv'], query_runs: true };
  assert.equal(savedNotice(r), 'Saved CASE-PRICE-01-2026-10-08.md and CASE-PRICE-01-2026-10-08.csv in D:\\Portfolio.');
  assert.equal(savedNotice({ ...r, query_runs: false }),
    'Saved CASE-PRICE-01-2026-10-08.md and CASE-PRICE-01-2026-10-08.csv in D:\\Portfolio. The query no longer runs, so the page says so and the CSV holds the header only.');
  for (const line of [savedNotice({ ...r, query_runs: false }), FLAGSHIP_LINE]) assert.doesNotMatch(line, /—/);
});

// server/routes/portfolio.ts: the portfolio export (sprint 4b, Task D4; D35, S4B-16 to S4B-19; design §7 Portfolio). The one place
// the app writes files outside its logs, so every check runs before anything is written.
//
// GET  /api/portfolio: each solved case with its last export, the portfolio folder setting and why an export would refuse now (the
//   Portfolio screen and Settings read it). Reads only: it serves and logs nothing.
// POST /api/cases/:id/export: a solved case only (else 409). Writes <case_id>-<YYYY-MM-DD>.md and .csv (the Amsterdam date) into the
//   portfolio folder, then -2, -3 and so on when a name exists: a file is never overwritten. Refuses with a plain message and writes
//   nothing when the folder is not set, not a full path, missing, or inside the logs folder (400). A name that is not a case ID, or
//   no such case, is a 404 before anything else. Then it logs one case_export event { case_id, files, data_source }.
//
// What the files hold (S4B-17, S4B-18): only the learner's own logged texts (the latest plan, the day-1 sketch, the latest insight)
// and the learner's own latest passing CP3 query (when every pass had help before it, the latest pass, marked so: Seams M2),
// re-run now through the runner's gate (`display`, design §11) on the CP3 item's visible schema; the case record's brief and
// labels; and CP4's value, which the learner has answered (a solved case passed it).
// Never a key's SQL, never the model plan or the model answer. The page and the CSV are built by the pure functions below.
import { lstat, open, realpath, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import type { CaseExport } from '../../core/events.ts';
import type { CaseStatus } from '../../core/replay.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { CaseKind, CaseRecord, DataSource } from '../../schemas/case.ts';
import type { RouteDeps } from '../app.ts';
import type { DisplayOk, RunnerError } from '../runner/protocol.ts';
import { PLAN_FIELDS, SKETCH_FIELDS } from './cases.ts';

/** S4B-17: the rows the page shows. */
export const PAGE_ROWS = 50;
/** S4B-18: the rows the CSV holds; a longer result is cut here and the page says so. */
export const CSV_ROWS = 10_000;
export const NO_PLAN = 'No plan written.';
export const NO_INSIGHT = 'No insight written.';
const NO_QUERY = 'No passing query is in the log.';
/** Seams M2: the line under a query that is the latest pass only because no pass without help exists (a reveal, or hint 2 or 3, before it). */
export const AFTER_REVEAL = 'This query followed "Show answer" or a late hint.';
/** The highest -N suffix tried on one day before the export gives up. */
const MAX_SUFFIX = 999;
/** The case ID pattern of schemas/case.ts (validateCaseRecord), where it is not exported: a file name is built from nothing else. */
const CASE_ID = /^CASE-[A-Z0-9]+(-[A-Z0-9]+)*$/;

const NOT_SET = 'No portfolio folder is set. Choose one in Settings.';
const NOT_FULL = 'The portfolio folder must be a full path, such as D:\\Portfolio. Change it in Settings.';
const IN_LOGS = 'The portfolio folder is inside the app\'s logs folder. Choose another in Settings.';
const NOT_SOLVED = 'Only a solved case can be exported. Solve this case first: every checkpoint from CP1 to CP5 it lists needs a pass.';
const NO_RUNNER = 'The SQL runner is not running, so the query cannot be run again. See the setup screen.';
const RUNNER_STOPPED = 'The SQL runner stopped while running the query. Nothing was saved. Try the export again.';
const EXPORT_NOT_LOGGED = 'The export could not be recorded, so its files were removed. Nothing was saved. Try the export again.';
const IS_UNC = 'The portfolio folder cannot be a network path (one that starts with \\\\). Choose a folder on this computer, such as D:\\Portfolio.';
const missing = (folder: string): string => `The portfolio folder ${folder} does not exist. Create it, or choose another in Settings.`;
const refuse = (status: 400 | 404 | 409 | 503, message: string): HTTPException => new HTTPException(status, { message });

// ---- Shapes ----------------------------------------------------------------------------------------------------------------------

/** The learner's query run again through the gate: its columns and rows (up to CSV_ROWS), or why it no longer runs. */
export type Rerun = { ok: true; columns: string[]; /** Each column's DuckDB type, in the same order (D51: the CSV guard reads them). */ types?: string[]; rows: unknown[][]; rowCount: number; truncated: boolean } | { ok: false; reason: string };
/** Everything the page shows, gathered by the route from the case record, replay's case status and the re-run. */
export interface PageInput {
  case_id: string; kind: CaseKind; title: string; level: number | null;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string }; data_source: DataSource | null;
  /** Amsterdam dates. */
  solved_on: string | null; exported_on: string;
  /** The latest plan's fields; the day-1 sketch's fields (an opener's before-and-after line). */
  plan: Record<string, string> | null; sketch: Record<string, string> | null;
  /** The case's expected grain: the grain of the solved query, for the before-and-after line when the plan names none. */
  grain: string | null;
  query: string | null; result: Rerun;
  /** Seams M2: the query is the latest pass, which had help before it, because no pass without help exists (AFTER_REVEAL). */
  query_assisted: boolean;
  /** CP4's question and value with its unit; null for a case with no CP4. */
  headline: { question: string; answer: string } | null;
  insight: string | null;
}
/** One solved case on the Portfolio screen (S4B-19). */
export interface PortfolioCaseEntry {
  case_id: string; kind: CaseKind; level: number | null; title: string; persona: { name: string; role: string }; data_source: DataSource | null;
  score: number; solved_at: string | null; solved_on: string | null;
  /** The latest case_export of the case: when (with its Amsterdam date) and the file names it wrote. */
  last_export: { ts: string; date: string; files: string[] } | null;
  export_count: number;
}
/** GET /api/portfolio. `folder_problem` is the plain message an export would refuse with now, or null. */
export interface PortfolioView { folder: string | null; folder_problem: string | null; cases: PortfolioCaseEntry[] }
/** POST /api/cases/:id/export: the file names written in `folder`, and whether the query still ran. */
export interface ExportReply { case_id: string; folder: string; files: string[]; query_runs: boolean }

// ---- The CSV (S4B-18) ------------------------------------------------------------------------------------------------------------

/** D51: the column types whose cells are text. Only these are guarded; a number, a date or a boolean never is. */
const TEXT_TYPE = /^(VARCHAR|CHAR|BPCHAR|TEXT|STRING|ENUM|JSON)\b/i;
/** D51: a text cell that opens with one of these is read as a formula by a spreadsheet. */
const FORMULA_START = /^[=+\-@\t\r]/;
/** The UTF-8 byte order mark, so Excel opens the file as UTF-8. */
export const CSV_BOM = '\uFEFF';
/**
 * RFC 4180: a field with a comma, a quote or a line break is quoted and its quotes doubled; a missing value is empty. A list or a struct is JSON.
 * D51: with `guard`, a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'` (formula injection).
 */
export function csvField(v: unknown, guard = false): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (guard && typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
/**
 * The BOM, a header row, then each row; every record ends with CRLF (RFC 4180). `types` are the columns' DuckDB types: a text column is
 * guarded (csvField), the rest never. Without `types` every string cell is guarded. A row whose only column is empty is written as `""`
 * so it stays a row and not a blank line.
 */
export function buildCsv(columns: readonly string[], rows: readonly (readonly unknown[])[], types?: readonly string[]): string {
  const isText = (i: number): boolean => types === undefined || TEXT_TYPE.test(types[i] ?? '');
  const line = (r: readonly unknown[], guarded: boolean): string => {
    const fields = r.map((v, i) => csvField(v, guarded && isText(i)));
    return `${fields.length === 1 && fields[0] === '' ? '""' : fields.join(',')}\r\n`;
  };
  return CSV_BOM + line(columns, false) + rows.map((r) => line(r, true)).join('');
}

// ---- The page (S4B-17) -----------------------------------------------------------------------------------------------------------

const count = new Intl.NumberFormat('en-GB');
const lines = (s: string): string => s.replace(/\r\n?/g, '\n').trim();
/** Learner text inside a list item: its later lines indented, so they stay in the item. */
const inItem = (s: string): string => lines(s).replace(/\n/g, '\n  ');
/** A table cell: Markdown punctuation escaped, a line break as <br>, a missing value empty. */
function mdCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replace(/[\\`*_[\]|<>~]/g, '\\$&').replace(/\r\n|\r|\n/g, '<br>');
}
/** A fence longer than any run of backticks in the text, so the query cannot close its own block. */
function fence(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}
/** "label: text" for each field the learner wrote, in the fields' own order. */
const written = (fields: Record<string, string> | null, points: readonly { id: string; label: string }[]): { label: string; text: string }[] =>
  points.map((p) => ({ label: p.label, text: fields?.[p.id]?.trim() ?? '' })).filter((x) => x.text !== '');

function resultSection(r: Rerun): string[] {
  if (!r.ok) return [`This query no longer runs on the course data. ${lines(r.reason)} The CSV beside this page holds the header only.`];
  const out = ['The result below was run again on the course data when this page was made.', ''];
  if (r.rowCount === 0) return [...out, 'The query returns no rows.'];
  const shown = r.rows.slice(0, PAGE_ROWS);
  out.push(`| ${r.columns.map(mdCell).join(' | ')} |`, `| ${r.columns.map(() => '---').join(' | ')} |`, ...shown.map((row) => `| ${row.map(mdCell).join(' | ')} |`), '');
  if (r.truncated) out.push(`Showing the first ${PAGE_ROWS} rows. The result has more than ${count.format(CSV_ROWS)} rows, and the CSV beside this page holds the first ${count.format(CSV_ROWS)}.`);
  else if (r.rowCount > PAGE_ROWS) out.push(`Showing the first ${PAGE_ROWS} of ${count.format(r.rowCount)} rows. The CSV beside this page holds all ${count.format(r.rowCount)}.`);
  else out.push(`${count.format(r.rowCount)} row${r.rowCount === 1 ? '' : 's'}.`);
  if (shown.some((row) => row.some((v) => v === null || v === undefined))) out.push('', 'An empty cell is a missing value.');
  return out;
}

/** S4B-17 and design §7: the portfolio page in Markdown. Built only from what PageInput holds. */
export function buildPage(p: PageInput): string {
  const source = p.data_source === null ? 'not recorded'
    : p.data_source.real ? `${p.data_source.label} (real data, licence: ${p.data_source.licence ?? 'not recorded'})` : p.data_source.label;
  const facts = [`${p.case_id}${p.level === null ? '' : `, level ${p.level}`}.`, p.solved_on ? `Solved ${p.solved_on}.` : null, `Exported ${p.exported_on}.`]
    .filter((x): x is string => x !== null).join(' ');
  const out: string[] = [`# ${p.title}`, '', `**Data source:** ${source}`, '', facts, '',
    '## The brief', '', `- **Asked by:** ${p.persona.name}, ${p.persona.role}`, `- **Decision:** ${p.brief.decision}`, `- **Deadline:** ${p.brief.deadline}`, '',
    '## Approach', ''];
  const plan = written(p.plan, PLAN_FIELDS);
  if (plan.length === 0) out.push(NO_PLAN);
  else out.push(...plan.map((f) => `- **${f.label}:** ${inItem(f.text)}`));
  out.push('');
  if (p.kind === 'opener') {
    // S4B-17: the day-1 sketch, then the plan's grain, or the solved query's grain when the plan names none.
    const sketch = written(p.sketch, SKETCH_FIELDS);
    const after = p.plan?.output_grain?.trim() || p.grain || 'not recorded';
    out.push('## Before and after', '',
      `- **Day 1 sketch:** ${sketch.length === 0 ? 'none written' : inItem(sketch.map((f) => `${f.label.toLowerCase()}: ${f.text}`).join('; '))}`,
      `- **After solving:** ${inItem(after)}`, '');
  }
  out.push('## The query', '');
  if (p.query === null) out.push(NO_QUERY);
  else {
    const f = fence(p.query);
    out.push(`${f}sql`, p.query.replace(/\r\n?/g, '\n').replace(/\n+$/, ''), f);
    if (p.query_assisted) out.push('', AFTER_REVEAL);
  }
  out.push('', '## The result', '', ...(p.query === null ? ['There is no query to run. The CSV beside this page holds the header only.'] : resultSection(p.result)), '',
    '## The headline number', '');
  if (p.headline === null) out.push('This case has no headline number.');
  else out.push(lines(p.headline.question), '', `**${p.headline.answer}**`);
  out.push('', '## Insight', '', p.insight && p.insight.trim() !== '' ? lines(p.insight) : NO_INSIGHT, '');
  return out.join('\n');
}

// ---- The folder and the files (S4B-16) -------------------------------------------------------------------------------------------

/** The real path when it can be read (a junction or a link resolved), otherwise the path made absolute. */
async function real(p: string): Promise<string> {
  try { return await realpath(p); } catch { return resolve(p); }
}
/** D51: the plain message for a UNC path (\\server\share, //server/share or \\?\ ), or null. Settings and the export share it. */
export const uncProblem = (folder: unknown): string | null => (typeof folder === 'string' && /^[\\/]{2}/.test(folder.trim()) ? IS_UNC : null);
/** Why an export into `folder` would be refused, as a plain message, or null when it may go ahead. Reads only. */
export async function folderProblem(folder: string | null | undefined, logsDir: string): Promise<string | null> {
  if (typeof folder !== 'string' || folder.trim() === '') return NOT_SET;
  if (uncProblem(folder) !== null) return IS_UNC;
  if (!isAbsolute(folder)) return NOT_FULL;
  try {
    if (!(await stat(folder)).isDirectory()) return missing(folder);
  } catch {
    return missing(folder);
  }
  // The logs are the source of truth and append-only (CLAUDE.md non-negotiable 5): nothing else is ever written among them.
  // D4-m1: outside means '..' or a path through '..', never a child whose own name starts with two dots ('..mine').
  const rel = relative(await real(logsDir), await real(folder));
  const outside = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  return outside ? null : IN_LOGS;
}

const errCode = (e: unknown): string | undefined => (e as { code?: unknown } | null)?.code as string | undefined;
async function taken(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (e) { if (errCode(e) === 'ENOENT') return false; throw e; }
}
/** A file writeExport created and fills. */
export interface ExportFile { writeFile(text: string): Promise<void>; close(): Promise<void> }
/** How writeExport creates a file: exclusively, failing with EEXIST when the name exists. A test passes its own to fail a write midway. */
export interface ExportFiles { create(path: string): Promise<ExportFile> }
const FILES: ExportFiles = { create: (path) => open(path, 'wx') };

/**
 * Creates `path` exclusively and writes `text` into it: false, with nothing touched, when the name exists. D4-m2: when the write
 * fails after the file was created (a full disk, say), the file this call created is removed before the error goes on.
 */
async function createFile(files: ExportFiles, path: string, text: string): Promise<boolean> {
  let file: ExportFile;
  try {
    file = await files.create(path);
  } catch (e) {
    if (errCode(e) === 'EEXIST') return false;
    throw e;
  }
  try {
    await file.writeFile(text);
    await file.close();
  } catch (e) {
    await file.close().catch(() => {});
    await rm(path, { force: true }).catch(() => {});  // best effort: the write's own error is the one reported
    throw e;
  }
  return true;
}

/**
 * S4B-16: writes `<base>.md` and `<base>.csv`, or `<base>-2`, `-3` and so on when either name exists. Each file is created with the
 * exclusive flag, so an existing file (or link) of that name is never opened, let alone overwritten, even by two exports at once.
 * When either write fails, or the CSV cannot be created, every file this call created is removed (D4-m2). Returns the two file names.
 */
export async function writeExport(folder: string, base: string, page: string, csv: string, files: ExportFiles = FILES): Promise<string[]> {
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const stem = n === 1 ? base : `${base}-${n}`;
    const names = [`${stem}.md`, `${stem}.csv`];
    const [mdPath, csvPath] = names.map((x) => join(folder, x)) as [string, string];
    if (await taken(mdPath) || await taken(csvPath)) continue;
    if (!(await createFile(files, mdPath, page))) continue;
    let made: boolean;
    try {
      made = await createFile(files, csvPath, csv);
    } catch (e) {
      await rm(mdPath, { force: true });             // only the page this call created a moment ago
      throw e;
    }
    if (made) return names;
    await rm(mdPath, { force: true });               // the CSV's name was taken meanwhile: the page moves on with it
  }
  throw new Error(`more than ${MAX_SUFFIX} exports of this case today`);
}

/** D51: why a file write failed, in plain words by error code, never a raw code. 400 when the folder is the cause, 503 otherwise (as F25's log failure). */
export function writeFailure(code: string | undefined, folder: string): { status: 400 | 503; message: string } {
  switch (code) {
    case 'EACCES': case 'EPERM':
      return { status: 400, message: `The app is not allowed to save files in ${folder}. Choose another folder in Settings.` };
    case 'EROFS':
      return { status: 400, message: `The folder ${folder} is read-only. Choose another folder in Settings.` };
    case 'ENOENT':
      return { status: 400, message: `The folder ${folder} is missing. Create it, or choose another in Settings.` };
    case 'ENOTDIR':
      return { status: 400, message: `${folder} is not a folder. Choose a folder in Settings.` };
    case 'ENOSPC': case 'EDQUOT':
      return { status: 503, message: 'The disk is full, so the files could not be saved. Free some space, then try again.' };
    case 'EBUSY': case 'ETXTBSY':
      return { status: 503, message: 'A file is in use by another program, so it could not be saved. Close it, then try again.' };
    default:
      return { status: 503, message: 'The files could not be saved. Check the folder, then try again.' };
  }
}

// ---- The routes ------------------------------------------------------------------------------------------------------------------

/** Why the learner's query did not run again, in plain words. */
function noRunReason(e: RunnerError): string {
  if (e.kind === 'gate') return `The query check refused it: ${e.message}`;
  if (e.kind === 'engine') return `The database said: ${e.message}`;
  if (e.kind === 'timeout') return 'It did not finish within the time limit.';
  return 'The SQL runner stopped while running it.';
}
const sqlOf = (payload: unknown): string | null => {
  const q = (payload as { submitted_query?: unknown } | null)?.submitted_query;
  return typeof q === 'string' && q.trim() !== '' ? q : null;
};
const typedOf = (payload: unknown): string | null => {
  const t = (payload as { typed?: unknown } | null)?.typed;
  return typeof t === 'string' && t.trim() !== '' ? t.trim() : null;
};

export function mountPortfolio(app: Hono, d: RouteDeps): void {
  const all = (): CaseRecord[] => d.content.cases?.() ?? d.content.openers?.() ?? [];
  /** The case named in the path: the case ID pattern first, so no other text reaches a lookup, a file name or a message. */
  const caseOf = (raw: string): CaseRecord => {
    if (!CASE_ID.test(raw)) throw refuse(404, 'Unknown case.');
    const r = d.content.case?.(raw) ?? d.content.opener?.(raw);
    if (!r || r.case_id !== raw) throw refuse(404, 'Unknown case.');
    return r;
  };
  const statusOf = (r: CaseRecord): CaseStatus | undefined => d.state.current().cases.get(r.case_id);
  const levelOf = (r: CaseRecord): number | null => (Number.isInteger(r.level) ? r.level : null);
  /** As the case routes' isOpener: a record in the openers folder is an opener whatever its kind says. */
  const kindOf = (r: CaseRecord): CaseKind => (d.content.opener?.(r.case_id) !== undefined ? 'opener' : r.kind);
  const dateOf = (ts: string | null): string | null => (ts === null ? null : amsterdamDate(new Date(ts)));

  const entry = (r: CaseRecord, s: CaseStatus): PortfolioCaseEntry => {
    const last = s.exports.at(-1) ?? null;
    return { case_id: r.case_id, kind: kindOf(r), level: levelOf(r), title: r.title, persona: r.persona, data_source: r.data_source ?? null,
      score: s.score, solved_at: s.solved_at, solved_on: dateOf(s.solved_at),
      last_export: last === null ? null : { ts: last.ts, date: amsterdamDate(new Date(last.ts)), files: [...last.files] }, export_count: s.exports.length };
  };

  /** CP4's question and its value, which the learner has answered: the truth value to the spec's decimals, else the learner's own answer. */
  const headlineOf = (r: CaseRecord, s: CaseStatus): PageInput['headline'] => {
    const cp = r.checkpoints.find((c) => c.kind === 'CP4');
    if (!cp) return null;
    const truth = cp.truth_key ? d.content.checkpointTruth?.(cp.truth_key) : undefined;
    const typed = typedOf(s.checkpoints.find((c) => c.kind === 'CP4')?.latest_pass?.payload ?? null);
    const value = truth !== undefined ? truth.toFixed(Math.max(0, Math.min(20, cp.typed?.decimals ?? 0))) : typed;
    if (value === null) return null;
    return { question: cp.prompt, answer: [value, cp.typed?.unit_label ?? ''].filter((x) => x.trim() !== '').join(' ') };
  };

  /** The learner's query run again on the CP3 item's visible schema through the gate (the display op), up to CSV_ROWS rows. */
  const rerun = async (r: CaseRecord, query: string | null): Promise<Rerun> => {
    if (query === null) return { ok: false, reason: NO_QUERY };
    const itemId = r.checkpoints.find((c) => c.kind === 'CP3')?.item_id;
    const item = itemId ? d.content.item(itemId) : undefined;
    if (!item) return { ok: false, reason: 'Its exercise is no longer in the course.' };
    if (!d.runner) throw refuse(503, NO_RUNNER);
    const res = await d.runner.request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql: query, cap: CSV_ROWS, deadlineMs: item.rules.timeout_ms });
    // A crash says nothing about the query, so nothing is written and the learner can try again.
    if (!res.ok && res.error.kind === 'crash') throw refuse(503, RUNNER_STOPPED);
    if (!res.ok) return { ok: false, reason: noRunReason(res.error) };
    return { ok: true, columns: res.data.columns.map((c) => c.name), types: res.data.columns.map((c) => c.type), rows: res.data.rows, rowCount: res.data.rowCount, truncated: res.data.truncated };
  };

  app.get('/api/portfolio', async (c) => {
    const folder = d.settings.portfolio_folder ?? null;
    const cases = all().flatMap((r) => { const s = statusOf(r); return s?.solved ? [entry(r, s)] : []; });
    return c.json<PortfolioView>({ folder, folder_problem: await folderProblem(folder, d.logger.dir), cases });
  });

  app.post('/api/cases/:id/export', async (c) => {
    const r = caseOf(c.req.param('id'));
    const s = statusOf(r);
    if (!s?.solved) throw refuse(409, NOT_SOLVED);
    const folder = d.settings.portfolio_folder ?? null;
    const problem = await folderProblem(folder, d.logger.dir);
    if (problem !== null || folder === null) throw refuse(400, problem ?? NOT_SET);
    if (!d.runner) throw refuse(503, NO_RUNNER);

    const at = new Date();
    const exportedOn = amsterdamDate(at);
    // Seams M2: the learner's own latest passing CP3 query (no "show answer" and no hint 2 or 3 before it); when there is none, the
    // latest pass, and the page says it followed "Show answer" or a late hint.
    const cp3 = s.checkpoints.find((x) => x.kind === 'CP3');
    const pass = cp3?.latest_own_pass ?? cp3?.latest_pass ?? null;
    const query = sqlOf(pass?.payload ?? null);
    const result = await rerun(r, query);
    const page = buildPage({
      case_id: r.case_id, kind: kindOf(r), title: r.title, level: levelOf(r), persona: r.persona, brief: r.brief, data_source: r.data_source ?? null,
      solved_on: dateOf(s.solved_at), exported_on: exportedOn, plan: s.plan?.fields ?? null, sketch: s.sketch?.fields ?? null,
      grain: r.expected_output?.grain ?? null, query, query_assisted: pass?.assisted === true, result, headline: headlineOf(r, s), insight: s.insight?.text ?? null,
    });
    // S4B-17: when the query no longer runs, the CSV holds the header only: the case's expected columns.
    const csv = result.ok ? buildCsv(result.columns, result.rows, result.types) : buildCsv(r.expected_output?.columns ?? [], []);

    let files: string[];
    try {
      files = await writeExport(folder, `${r.case_id}-${exportedOn}`, page, csv);
    } catch (e) {
      const f = writeFailure(errCode(e), folder);
      throw refuse(f.status, f.message);
    }
    // D4-m3: the event's time is the one the file names' date came from, so "Last exported" and the names agree across midnight.
    const event: CaseExport = { event: 'case_export', schema_version: SCHEMA_VERSION, ts: at.toISOString(), case_id: r.case_id, files,
      data_source: r.data_source?.label ?? '' };
    try {
      await d.logger.event(event);
    } catch {
      // Codex F25: no event means the export does not exist for replay, so remove the files this request made and a retry starts clean.
      // Best effort: a removal that fails must not hide the failure. 503 as for a runner crash: not the request's fault, nothing is kept.
      await Promise.all(files.map((f) => rm(join(folder, f), { force: true }).catch(() => {})));
      throw refuse(503, EXPORT_NOT_LOGGED);
    }
    return c.json<ExportReply>({ case_id: r.case_id, folder, files, query_runs: result.ok });
  });
}

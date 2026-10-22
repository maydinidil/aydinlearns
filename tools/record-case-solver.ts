// tools/record-case-solver.ts: stores the case blind-solver records (sprint 6, Task B3; design §12; the backlog's B2-M6). A fresh
// solver agent reads the exported views (npm run export:case-view) and writes one answer per checkpoint into
// <answers-dir>/<case_id>-<CP>.txt or .sql (git-ignored; a file name holds no colon): for CP1 and CP5 the oid of the option it picks
// (.txt); for CP2 and CP4 the number it would type (.txt), or one DuckDB SELECT that returns that one number (.sql), which runs through
// the app's locked runner on the case's own schema. This script grades each answer as the case routes do (gradeChoice against the key's
// correct option, gradeTyped against the truth value the build wrote) and writes `solver: { <CP>: { pass, prompt_hash, key_hash, at } }` into the
// case key, passed or not; C50 then wants a passing record for the checkpoint's current prompt hash.
//
// An answer is recorded only against the checkpoint the solver saw: its exported view must give the checkpoint's current prompt hash
// (casePromptHash), else it is skipped. So is an answer to an unknown case or checkpoint, a CP2 or CP4 with no value built, and a case
// whose key does not validate (see C41).
//
// It prints checkpoint IDs and PASS, FAIL or SKIP only, with a fixed reason. Never an answer, an oid or a number: a right answer is the key.
// Sprint 7 (S7-08): a held-out mock case is found through the content store's mock map, so the case mocks are solved like any case.
// Usage: node tools/record-case-solver.ts [content-root] [answers-dir] [view-dir]
//        (defaults: content/, tools/.solver-out/cases/, tools/.solver-view/cases/)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseSchema, SOLVED_KINDS, validateCaseKey, type CaseKey, type CaseRecord, type Checkpoint, type SolvedKind } from '../schemas/case.ts';
import { gradeChoice, gradeTyped, parseTyped } from '../server/choice/grade.ts';
import type { ContentStore } from '../server/content.ts';
import { startRunner, type RunnerClient } from '../server/runner/client.ts';
import type { DisplayOk } from '../server/runner/protocol.ts';
import { loadContentForCli, oneNumber } from './check-content.ts';
import { caseKeyHash } from './case-key-hash.ts';
import { casePromptHash, viewPromptHash } from './export-case-view.ts';

export interface CaseRecordDeps {
  /** The locked runner on the course database, asked for only when a .sql answer needs it. The caller closes it. */
  runner: () => Promise<RunnerClient>;
  at?: Date;
}
/** The grade of one answer: pass or fail, or why it was not graded (then nothing is written). */
type Graded = { outcome: 'pass' | 'fail'; why: string } | { outcome: 'skip'; why: string };

const ANSWER_FILE = /^(CASE-[A-Z0-9]+(?:-[A-Z0-9]+)*)-(CP\d)\.(txt|sql)$/;
/** The runner's time limit for a solver's query. */
const SOLVER_TIMEOUT_MS = 30_000;
const NOT_ONE_NUMBER = 'not one SELECT that returns one number';

/** Grades one answer to one checkpoint. A typed answer in a .sql file runs on the case's schema; its number is written with the
 * checkpoint's decimals, then read and graded as a learner's typed text would be. */
export async function gradeCaseAnswer(record: Pick<CaseRecord, 'schema'>, cp: Checkpoint, key: CaseKey, truth: number | undefined, answer: string, format: 'txt' | 'sql',
  runner: () => Promise<RunnerClient>): Promise<Graded> {
  if (cp.kind === 'CP1' || cp.kind === 'CP5') {
    if (format !== 'txt') return { outcome: 'skip', why: 'a CP1 or CP5 answer is an oid in a .txt file' };
    const choice = key.choices[cp.kind];
    const options = Array.isArray(cp.options) ? cp.options : [];
    if (!choice) return { outcome: 'skip', why: 'the key has no correct option; see C41' };
    const chosen = answer.trim();
    if (!options.some((o) => o.oid === chosen)) return { outcome: 'fail', why: 'not one of the options' };
    const g = gradeChoice({ id: cp.item_id!, options: options.map((o) => ({ oid: o.oid, text: o.text, misconception_id: null })) },
      { item_id: cp.item_id!, item_version: 1, correct_oid: choice.correct_oid, explanation: choice.explanation, solver: null }, chosen);
    return { outcome: g.correct ? 'pass' : 'fail', why: '' };
  }
  if (!cp.typed) return { outcome: 'skip', why: 'the checkpoint has no typed spec; see C41' };
  if (truth === undefined) return { outcome: 'skip', why: 'no value built; run npm run build:data' };
  let typed = answer.trim();
  if (format === 'sql') {
    const r = await (await runner()).request<DisplayOk>({ op: 'display', schema: caseSchema(record), allowedSchemas: [], sql: answer, cap: 2, deadlineMs: SOLVER_TIMEOUT_MS });
    const n = r.ok ? oneNumber(r.data) : null;
    if (n === null) return { outcome: 'fail', why: NOT_ONE_NUMBER };
    typed = n.toFixed(Math.max(0, Math.min(20, cp.typed.decimals)));
  }
  const parsed = parseTyped(typed, cp.typed);
  if (!parsed.ok) return { outcome: 'fail', why: 'not a number the app accepts' };
  return { outcome: gradeTyped(parsed.value, truth, cp.typed).correct ? 'pass' : 'fail', why: '' };
}

/** The view a case's solver read (<viewDir>/<case_id>.json), or null when there is none or it cannot be read. */
async function exportedView(viewDir: string, caseId: string): Promise<unknown> {
  const text = await readFile(join(viewDir, `${caseId}.json`), 'utf8').catch(() => null);
  if (text === null) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

/**
 * Grades every answer file in `answersDir`, in name order, and writes each graded one's record into its case key under `root`
 * (content/keys/cases/<case_id>.json, formatted as the key files are). Returns one line per file.
 */
export async function recordCaseSolver(store: ContentStore, root: string, answersDir: string, viewDir: string, deps: CaseRecordDeps): Promise<string[]> {
  const names = (await readdir(answersDir).catch(() => [] as string[])).sort();
  const written = new Map<string, CaseKey>();
  const at = (deps.at ?? new Date()).toISOString();
  let runner: Promise<RunnerClient> | null = null;
  const lazyRunner = (): Promise<RunnerClient> => (runner ??= deps.runner());
  const lines: string[] = [];
  for (const name of names) {
    const m = ANSWER_FILE.exec(name);
    if (!m) { if (name.endsWith('.txt') || name.endsWith('.sql')) lines.push(`SKIP ${name} (not named <case ID>-<CP>.txt or .sql)`); continue; }
    const [, caseId, kind, format] = m as unknown as [string, string, string, 'txt' | 'sql'];
    const tag = `${caseId}:${kind}`;
    const record = store.case?.(caseId) ?? store.mockCase?.(caseId);
    if (!record) { lines.push(`SKIP ${name} (unknown case)`); continue; }
    if (!(SOLVED_KINDS as readonly string[]).includes(kind)) { lines.push(`SKIP ${name} (not a CP1, CP2, CP4 or CP5 answer)`); continue; }
    const cp = record.checkpoints.find((c) => c.kind === kind);
    if (!cp) { lines.push(`SKIP ${tag} (the case has no ${kind})`); continue; }
    const key = written.get(caseId) ?? store.caseKey?.(caseId);
    if (!key || validateCaseKey(key).length || key.case_id !== caseId) { lines.push(`SKIP ${tag} (no valid key; see C41)`); continue; }
    const hash = casePromptHash(record, cp);
    if (viewPromptHash(await exportedView(viewDir, caseId), kind as SolvedKind) !== hash) {
      lines.push(`SKIP ${tag} (the checkpoint changed since the export; run export:case-view)`);
      continue;
    }
    const truth = cp.truth_key ? store.checkpointTruth?.(cp.truth_key) : undefined;
    const g = await gradeCaseAnswer(record, cp, key, truth, await readFile(join(answersDir, name), 'utf8'), format, lazyRunner);
    if (g.outcome === 'skip') { lines.push(`SKIP ${tag} (${g.why})`); continue; }
    const key_hash = caseKeyHash(kind as SolvedKind, key, truth);
    if (key_hash === null) { lines.push(`SKIP ${tag} (nothing to fingerprint; see C41)`); continue; }
    const next: CaseKey = { ...key, solver: { ...(key.solver ?? {}), [kind]: { pass: g.outcome === 'pass', prompt_hash: hash, key_hash, at } } };
    written.set(caseId, next);
    await writeFile(join(root, 'keys/cases', `${caseId}.json`), JSON.stringify(next, null, 2) + '\n');
    lines.push(`${g.outcome === 'pass' ? 'PASS' : 'FAIL'} ${tag}${g.why ? ` (${g.why})` : ''}`);
  }
  return lines;
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const dir = process.argv[3] ? resolve(process.argv[3]) : at('tools/.solver-out/cases');
  const viewDir = process.argv[4] ? resolve(process.argv[4]) : at('tools/.solver-view/cases');
  if (!(await readdir(dir).catch(() => [] as string[])).some((n) => n.endsWith('.txt') || n.endsWith('.sql'))) { console.log(`no solver answers in ${dir}`); return; }
  // The truth values the build wrote (S6-13), for CP2 and CP4.
  const store = await loadContentForCli(root, { checkpointsFile: at('data/truth/checkpoints.json'), truthFile: at('data/truth/voltmarkt.json') });
  if (!store) return;
  let started: RunnerClient | null = null;
  const lines = await recordCaseSolver(store, root, dir, viewDir, { runner: async () => (started ??= await startRunner(at('data/course.duckdb'))) })
    .finally(async () => { await (started as RunnerClient | null)?.close(); });
  for (const l of lines) console.log(l);
  const count = (w: string) => lines.filter((l) => l.startsWith(`${w} `)).length;
  console.log(`${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
}

if (import.meta.main) await main();

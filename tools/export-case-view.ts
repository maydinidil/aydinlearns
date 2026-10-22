// tools/export-case-view.ts: the case blind solver's view (sprint 6, Task B3; design §12; the backlog's B2-M6). A case's CP1, CP2, CP4
// and CP5 are solved blind as items are: the solver may see what a learner sees of the case when it answers them: the case's title,
// level, schema and brief, each checkpoint's prompt with its options (in a seeded shuffled order with their opaque oids, S2-60) or its
// typed spec, and the schema notes of the case's schema up to its level. Never the case key (truths, correct options, explanations,
// solver records), the truth values, the credits, the model plan, the model answer or the follow-up question; the key is never opened.
// CP3 is an SQL item, in export:solver-view, and CP6 is self-scored.
//
// Writes <out>/<case_id>.json for every case (content/sql/openers/, content/sql/cases/ and, sprint 7, the held-out mock cases in
// content/sql/mocks/, S7-08) with a CP1, CP2, CP4 or CP5. The CASE-*.json
// files of an earlier export are removed first; any other file is left alone. The default out-dir is tools/.solver-view/cases/
// (git-ignored), beside the other views, which leave it alone. Prints case IDs and counts only.
// Usage: node tools/export-case-view.ts [content-root] [out-dir] [--seed <text>] [--notes <schema-notes.json>]
//        (defaults: content/, tools/.solver-view/cases/, seed case-view-1, data/schema-notes.json)
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseSchema, SOLVED_KINDS, type CaseRecord, type Checkpoint, type SolvedKind } from '../schemas/case.ts';
import type { TypedSpec } from '../schemas/choice.ts';
import type { TableNote } from '../schemas/schema-notes.ts';
import { seededOrder } from './export-choice-view.ts';

export const DEFAULT_CASE_SEED = 'case-view-1';
/** One checkpoint as the solver sees it: its item ID, kind and prompt, and its options (CP1, CP5) or typed spec (CP2, CP4). */
export interface CaseViewCheckpoint { id: string; kind: SolvedKind; prompt: string; options?: { oid: string; text: string }[]; typed?: TypedSpec }
/** A case as the solver sees it. */
export interface CaseSolverView {
  case_id: string; title: string; level: number; schema: string; brief: { decision: string; deadline: string };
  checkpoints: CaseViewCheckpoint[]; schema_notes: TableNote[];
}
export interface ExportedCase { id: string; checkpoints: SolvedKind[] }

const CASE_FILE = /^CASE-[A-Z0-9]+(-[A-Z0-9]+)*\.json$/;
const SAFE_CASE_ID = /^CASE-[A-Z0-9]+(-[A-Z0-9]+)*$/;
class Refused extends Error {}
const isSolved = (cp: Checkpoint): cp is Checkpoint & { kind: SolvedKind } => (SOLVED_KINDS as readonly string[]).includes(cp?.kind);

/**
 * What the solver saw of one checkpoint, as a hash: its kind, prompt, option texts (sorted: each view shuffles them) or typed spec,
 * and the case's title, brief and schema. Neither its credits, nor the order of its options, nor any model text joins it. C50 wants a
 * passing solver record at the current hash; record:case-solver checks the exported view gives the same hash before it records.
 */
export function casePromptHash(record: Pick<CaseRecord, 'title' | 'brief' | 'schema'>, cp: Pick<Checkpoint, 'kind' | 'prompt' | 'options' | 'typed'>): string {
  const typed = cp.typed ? { precision: cp.typed.precision, scale: cp.typed.scale, decimals: cp.typed.decimals, unit_label: cp.typed.unit_label } : null;
  const seen = {
    title: record.title, brief: { decision: record.brief?.decision, deadline: record.brief?.deadline }, schema: caseSchema(record),
    kind: cp.kind, prompt: cp.prompt, options: Array.isArray(cp.options) ? cp.options.map((o) => o.text).sort() : null, typed,
  };
  return createHash('sha256').update(JSON.stringify(seen)).digest('hex').slice(0, 16);
}

/** The hash of what an exported view showed for one checkpoint (casePromptHash of the view's fields), or null when it is not there. */
export function viewPromptHash(view: unknown, kind: SolvedKind): string | null {
  if (!view || typeof view !== 'object' || Array.isArray(view)) return null;
  const v = view as Partial<CaseSolverView>;
  const cp = Array.isArray(v.checkpoints) ? v.checkpoints.find((c) => c?.kind === kind) : undefined;
  if (!cp || typeof cp.prompt !== 'string' || typeof v.title !== 'string' || !v.brief || typeof v.schema !== 'string') return null;
  return casePromptHash({ title: v.title, brief: v.brief, schema: v.schema },
    { kind, prompt: cp.prompt, options: Array.isArray(cp.options) ? cp.options.map((o) => ({ oid: o.oid, text: o.text })) : undefined, typed: cp.typed });
}

/** A case's view, or one with no checkpoints when it has no CP1, CP2, CP4 or CP5. `notes` are every table note; its schema's are kept. */
export function caseSolverView(record: CaseRecord, seed: string, notes: readonly TableNote[]): CaseSolverView {
  const schema = caseSchema(record);
  const checkpoints: CaseViewCheckpoint[] = [];
  for (const cp of record.checkpoints.filter(isSolved)) {
    if (typeof cp.item_id !== 'string' || typeof cp.prompt !== 'string') continue;
    const view: CaseViewCheckpoint = { id: cp.item_id, kind: cp.kind, prompt: cp.prompt };
    if (Array.isArray(cp.options)) view.options = seededOrder(cp.options, seed, cp.item_id).map((o) => ({ oid: o.oid, text: o.text }));
    if (cp.typed) { const { precision, scale, decimals, unit_label } = cp.typed; view.typed = { precision, scale, decimals, unit_label }; }
    checkpoints.push(view);
  }
  const level = Number.isInteger(record.level) ? record.level : 1;
  return {
    case_id: record.case_id, title: record.title, level, schema, brief: { decision: record.brief.decision, deadline: record.brief.deadline }, checkpoints,
    schema_notes: notes.filter((n) => n.schema === schema && (n.from_level ?? 1) <= level),
  };
}

const inside = (child: string, parent: string): boolean => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

/** Writes one view per case with a CP1, CP2, CP4 or CP5, and returns the cases written with their checkpoints, in case ID order. */
export async function exportCaseView(contentRoot: string, outDir: string, notesFile: string, seed: string = DEFAULT_CASE_SEED): Promise<ExportedCase[]> {
  const root = resolve(contentRoot);
  const out = resolve(outDir);
  if (inside(out, root) || inside(root, out)) throw new Refused('the output folder must be outside the content folder, and must not hold it');
  // The schema notes the learner sees; none when the build has not written them yet.
  let notes: TableNote[] = [];
  try { const parsed: unknown = JSON.parse(await readFile(notesFile, 'utf8')); if (Array.isArray(parsed)) notes = parsed as TableNote[]; }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Refused('the schema notes file is not valid JSON; run npm run build:data'); }
  const views: CaseSolverView[] = [];
  for (const folder of ['openers', 'cases', 'mocks']) {
    let names: string[] = [];
    try { names = (await readdir(join(root, 'sql', folder))).filter((n) => n.endsWith('.json')).sort(); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    for (const n of names) {
      const record = JSON.parse(await readFile(join(root, 'sql', folder, n), 'utf8')) as CaseRecord;
      if (typeof record?.case_id !== 'string' || !SAFE_CASE_ID.test(record.case_id) || !Array.isArray(record.checkpoints) || !record.brief) continue;
      const view = caseSolverView(record, seed, notes);
      if (view.checkpoints.length) views.push(view);
    }
  }
  views.sort((a, b) => a.case_id.localeCompare(b.case_id));
  // Clear an earlier export: only its CASE-*.json files.
  let old: string[] = [];
  try { old = (await readdir(out)).filter((n) => CASE_FILE.test(n)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  for (const n of old) await rm(join(out, n));
  await mkdir(out, { recursive: true });
  for (const v of views) await writeFile(join(out, `${v.case_id}.json`), JSON.stringify(v, null, 2) + '\n');
  return views.map((v) => ({ id: v.case_id, checkpoints: v.checkpoints.map((c) => c.kind) }));
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const args = process.argv.slice(2);
  const flag = (name: string): string | null => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? '' : null; };
  const seed = flag('--seed') ?? DEFAULT_CASE_SEED;
  const notes = flag('--notes') ?? at('data/schema-notes.json');
  if (!seed.trim() || !notes.trim()) { console.error('--seed and --notes need a value'); process.exitCode = 1; return; }
  const positional = args.filter((a, i) => !a.startsWith('--') && !['--seed', '--notes'].includes(args[i - 1] ?? ''));
  const root = positional[0] ? resolve(positional[0]) : at('content');
  const out = positional[1] ? resolve(positional[1]) : at('tools/.solver-view/cases');
  try {
    const cases = await exportCaseView(root, out, resolve(notes), seed);
    for (const c of cases) console.log(`${c.id}: ${c.checkpoints.join(', ')}`);
    console.log(`wrote the case solver view for ${cases.length} case${cases.length === 1 ? '' : 's'}, ${cases.reduce((n, c) => n + c.checkpoints.length, 0)} checkpoints`);
  } catch (e) {
    // A parse error can quote the file's text, so only this tool's own refusal or an error code is printed.
    const code = (e as { code?: unknown } | null)?.code;
    console.error(e instanceof Refused ? `cannot export the case solver view: ${e.message}`
      : `cannot export the case solver view${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ': a case file is not valid JSON'}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();

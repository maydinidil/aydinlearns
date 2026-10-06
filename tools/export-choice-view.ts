// tools/export-choice-view.ts: the choice blind solver's view of each GA4 and Methodology item (design §12; Task C3; the
// owner default on GA4 blind solves). The solver may see only what a learner sees when the question opens: the stem and the
// options, which the app shows in a shuffled order with their opaque oids (S2-60), or a typed item's spec (its unit and the
// decimals asked for). So each view holds exactly `id`, `stem` and `options` ({ oid, text } in a seeded shuffled order), or
// `id`, `stem` and `typed`. Topics, concepts, misconceptions, flags and sources stay out, and keys are never read.
//
// Writes <out>/<section>/<group>/<item_id>.json for every active item, held-out ones included (each needs a blind solve);
// <group> is the GA4 topic (T-GA4-01) or the Methodology concept, so one solver can be given one or two folders.
// Task C4 (S3-13): an active SQL choice item's view goes to <out>/sql/<target concept>/<item_id>.json. It holds what the
// learner sees: `id`, `kind`, `prompt` and `schema`, plus the kind's own fields: `shown_sql` (predict kinds), `options`
// ({ oid, text } and a predict_result option's `table`, in a seeded shuffled order), `typed` (predict_rows) and `unique_check`
// (is_unique). Never the key, the misconceptions, the edge schema, hints or difficulty. The .json
// files of an earlier export are removed first. The default out-dir sits inside tools/.solver-view/ (git-ignored), and the
// SQL export, which clears only the .json files at its own top level, leaves it alone. Prints counts only.
// Usage: node tools/export-choice-view.ts [content-root] [out-dir] [--seed <text>]
//        (defaults: content/, tools/.solver-view/choice/, seed choice-view-1)
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChoiceItem, ChoiceSection, OptionTable, TypedSpec } from '../schemas/choice.ts';
import { isSqlChoiceKind, type SqlItem } from '../schemas/item.ts';
import { shuffle } from '../server/routes/choice.ts';
import { promptHashOf, SECTIONS } from './check-choice.ts';
import { sqlChoicePromptHashOf, type SqlChoiceSeen } from './check-sql-choice.ts';

export const DEFAULT_SEED = 'choice-view-1';
export interface ChoiceView { id: string; stem: string; options?: { oid: string; text: string }[]; typed?: TypedSpec }
/** Task C4: an SQL choice item's view (S3-13). The fields after `schema` are there only for the kinds that have them. */
export interface SqlChoiceView {
  id: string; kind: string; prompt: string; schema: string; shown_sql?: string; options?: { oid: string; text: string; table?: OptionTable }[];
  typed?: TypedSpec; unique_check?: { table: string; column: string };
}
/** The folders under the output: each choice section, and `sql` for the SQL choice items (Task C4). */
export type ViewSection = ChoiceSection | 'sql';
export interface ExportedGroup { section: ViewSection; group: string; ids: string[] }

/** A folder or file name this tool writes: an ID such as T-GA4-01, MET-RETAIL-06 or Q-GA4-001. */
const SAFE_NAME = /^[A-Z][A-Z0-9-]*$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const UNSORTED = 'UNSORTED';
class Refused extends Error {}

/**
 * The server's Fisher-Yates shuffle with a deterministic draw: draw k for one item is sha256(seed, item ID, k) modulo n. The
 * same seed always gives the same order; another seed gives another. (48 bits modulo at most 8 options: no visible bias.)
 */
export function seededOrder<T>(xs: readonly T[], seed: string, itemId: string): T[] {
  let k = 0;
  return shuffle(xs, (n) => createHash('sha256').update(`choice-view:${seed}:${itemId}:${k++}`).digest().readUIntBE(0, 6) % n);
}

export function choiceView(item: ChoiceItem, seed: string): ChoiceView {
  if (item.kind === 'typed' && item.typed) {
    const { precision, scale, decimals, unit_label } = item.typed;
    return { id: item.id, stem: item.stem, typed: { precision, scale, decimals, unit_label } };
  }
  return { id: item.id, stem: item.stem, options: seededOrder(item.options, seed, item.id).map((o) => ({ oid: o.oid, text: o.text })) };
}

/**
 * The prompt hash of what a solver saw in one exported view file (fix round 1): the same hash choicePromptHash gives the
 * item the view was exported from, or null when the value is not a view. record-choice-solver compares the two, so an answer
 * to an item changed since the export is never recorded.
 */
export function viewPromptHash(view: unknown): string | null {
  if (!view || typeof view !== 'object' || Array.isArray(view)) return null;
  const v = view as Record<string, unknown>;
  if (typeof v.stem !== 'string') return null;
  if (Array.isArray(v.options)) {
    const texts = v.options.map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>).text : undefined));
    return texts.every((t): t is string => typeof t === 'string') ? promptHashOf(v.stem, texts, null) : null;
  }
  const t = v.typed;
  if (!t || typeof t !== 'object') return null;
  const s = t as Record<string, unknown>;
  const spec = typeof s.precision === 'string' && typeof s.scale === 'string' && typeof s.decimals === 'number' && typeof s.unit_label === 'string';
  return spec ? promptHashOf(v.stem, null, t as TypedSpec) : null;
}

/** Task C4: what a learner sees of an SQL choice item, its options in the seeded shuffled order. */
export function sqlChoiceView(item: SqlItem, seed: string): SqlChoiceView {
  const view: SqlChoiceView = { id: item.id, kind: item.kind, prompt: item.prompt, schema: item.schema };
  if (typeof item.shown_sql === 'string') view.shown_sql = item.shown_sql;
  if (item.options?.length) {
    view.options = seededOrder(item.options, seed, item.id)
      .map((o) => (o.table ? { oid: o.oid, text: o.text, table: { columns: o.table.columns, rows: o.table.rows } } : { oid: o.oid, text: o.text }));
  }
  if (item.typed) { const { precision, scale, decimals, unit_label } = item.typed; view.typed = { precision, scale, decimals, unit_label }; }
  if (item.unique_check) view.unique_check = { table: item.unique_check.table, column: item.unique_check.column };
  return view;
}

/**
 * Task C4: the prompt hash of what a solver saw in one exported SQL choice view, the same hash sqlChoicePromptHash gives the
 * item it was exported from, or null when the value is not an SQL choice view.
 */
export function sqlViewPromptHash(view: unknown): string | null {
  if (!view || typeof view !== 'object' || Array.isArray(view)) return null;
  const v = view as Record<string, unknown>;
  if (typeof v.kind !== 'string' || typeof v.prompt !== 'string' || typeof v.schema !== 'string') return null;
  let options: SqlChoiceSeen['options'] = null;
  if (v.options !== undefined) {
    if (!Array.isArray(v.options)) return null;
    const list = v.options.map((o) => (o && typeof o === 'object' ? o as Record<string, unknown> : {}));
    if (!list.every((o) => typeof o.text === 'string')) return null;
    options = list.map((o) => (o.table ? { text: o.text as string, table: o.table as OptionTable } : { text: o.text as string }));
  }
  const typed = v.typed === undefined ? null : v.typed as TypedSpec;
  const unique = v.unique_check === undefined ? null : v.unique_check as { table: string; column: string };
  if (typed !== null && (typeof typed !== 'object' || typeof typed.unit_label !== 'string')) return null;
  if (unique !== null && (typeof unique !== 'object' || typeof unique.table !== 'string' || typeof unique.column !== 'string')) return null;
  return sqlChoicePromptHashOf({ kind: v.kind, prompt: v.prompt, schema: v.schema, shown_sql: typeof v.shown_sql === 'string' ? v.shown_sql : null,
    options, typed, unique_check: unique });
}

const inside = (child: string, parent: string): boolean => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

/** Writes one view file per active item and returns the groups written, each with its item IDs, sorted. */
export async function exportChoiceView(contentRoot: string, outDir: string, seed: string = DEFAULT_SEED): Promise<ExportedGroup[]> {
  const root = resolve(contentRoot);
  const out = resolve(outDir);
  if (inside(out, root) || inside(root, out)) throw new Refused('the output folder must be outside the content folder, and must not hold it');
  const groups = new Map<string, { section: ViewSection; group: string; views: { id: string; view: unknown }[] }>();
  const add = (section: ViewSection, raw: unknown, id: string, view: unknown): void => {
    const group = typeof raw === 'string' && SAFE_NAME.test(raw) ? raw : UNSORTED;
    const g = groups.get(`${section}/${group}`) ?? { section, group, views: [] };
    g.views.push({ id, view });
    groups.set(`${section}/${group}`, g);
  };
  for (const section of SECTIONS) {
    const dir = join(root, section, 'items');
    let names: string[];
    try { names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort(); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
    for (const n of names) {
      const item = JSON.parse(await readFile(join(dir, n), 'utf8')) as ChoiceItem;
      if (item?.status !== 'active' || typeof item.id !== 'string' || !SAFE_ID.test(item.id) || typeof item.stem !== 'string') continue;
      add(section, item.section === 'ga4' ? item.topic_id : item.concept_id, item.id, choiceView(item, seed));
    }
  }
  // Task C4: the SQL choice items, grouped by the concept whose card they rate. Write and fix items have their own view.
  let sqlNames: string[] = [];
  try { sqlNames = (await readdir(join(root, 'sql', 'items'))).filter((n) => n.endsWith('.json')).sort(); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  for (const n of sqlNames) {
    const item = JSON.parse(await readFile(join(root, 'sql', 'items', n), 'utf8')) as SqlItem;
    if (item?.status !== 'active' || !isSqlChoiceKind(item.kind) || typeof item.id !== 'string' || !SAFE_ID.test(item.id) || typeof item.prompt !== 'string') continue;
    add('sql', item.target_concept_id, item.id, sqlChoiceView(item, seed));
  }
  // Clear an earlier export: only .json files, only in group folders this tool names.
  for (const section of [...SECTIONS, 'sql']) {
    const sectionDir = join(out, section);
    let subs: string[];
    try { subs = (await readdir(sectionDir, { withFileTypes: true })).filter((d) => d.isDirectory() && SAFE_NAME.test(d.name)).map((d) => d.name); }
    catch { continue; }
    for (const sub of subs) for (const f of (await readdir(join(sectionDir, sub))).filter((n) => n.endsWith('.json'))) await rm(join(sectionDir, sub, f));
  }
  const written: ExportedGroup[] = [];
  for (const { section, group, views } of [...groups.values()].sort((a, b) => `${a.section}/${a.group}`.localeCompare(`${b.section}/${b.group}`))) {
    const dir = join(out, section, group);
    await mkdir(dir, { recursive: true });
    for (const { id, view } of views) await writeFile(join(dir, `${id}.json`), JSON.stringify(view, null, 2) + '\n');
    written.push({ section, group, ids: views.map((v) => v.id).sort() });
  }
  return written;
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const args = process.argv.slice(2);
  const s = args.indexOf('--seed');
  const seed = s >= 0 ? args[s + 1] ?? '' : DEFAULT_SEED;
  if (!seed.trim()) { console.error('--seed needs a value'); process.exitCode = 1; return; }
  const positional = args.filter((_, i) => s < 0 || (i !== s && i !== s + 1));
  const root = positional[0] ? resolve(positional[0]) : at('content');
  const out = positional[1] ? resolve(positional[1]) : at('tools/.solver-view/choice');
  try {
    const groups = await exportChoiceView(root, out, seed);
    for (const g of groups) console.log(`${g.section} ${g.group}: ${g.ids.length} items`);
    console.log(`wrote the choice solver view for ${groups.reduce((n, g) => n + g.ids.length, 0)} items`);
  } catch (e) {
    // A parse error can quote the file's text, so only this tool's own refusal or an error code is printed (non-negotiable 2).
    const code = (e as { code?: unknown } | null)?.code;
    console.error(e instanceof Refused ? `cannot export the choice solver view: ${e.message}`
      : `cannot export the choice solver view${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ': an item file is not valid JSON'}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();

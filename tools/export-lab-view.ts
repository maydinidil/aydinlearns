// tools/export-lab-view.ts: the lab blind solver's view of each GA4 lab (design §12; sprint 5b D69, Task B1). A structural part is a
// fact about GA4 with a key (a menu, a rule), so it is blind-solved like a choice item, and the solver may see only what the
// learner sees of that part: its `id`, `question`, `answer` kind and `options`, in the lab's order. The lab's other parts (values
// read off a screen, re-checks, self-checks and their rubrics), its steps, path, concept, topic, rules and sources stay out, and the
// key is never opened. Each view also names its lab and the lab's version, so record:lab-solver can tell an answer to an older lab.
//
// Writes <out>/<lab_id>.json for every lab in content/ga4/labs/ that has a structural part. The LAB-NN.json files of an earlier
// export are removed first; any other file is left alone. The default out-dir is tools/.solver-view/labs/ (git-ignored), beside
// the choice and SQL views, which leave it alone. A lab file that is not a valid lab stops the export (check:content names why).
// Prints lab IDs and counts only.
// Usage: node tools/export-lab-view.ts [content-root] [out-dir]   (defaults: content/, tools/.solver-view/labs/)
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLab, type Lab, type LabAnswerKind } from '../schemas/lab.ts';
import { LAB_DIR } from '../server/content.ts';

/** One structural part as the solver sees it. `options` only for a choice or multi part. */
export interface LabViewPart { id: string; question: string; answer: LabAnswerKind; options?: string[] }
export interface LabView { id: string; version: number; parts: LabViewPart[] }
export interface ExportedLab { id: string; parts: string[] }

const LAB_FILE = /^LAB-\d\d\.json$/;
class Refused extends Error {}

/** A lab's view: its structural parts' id, question, answer kind and options, or null when it has no structural part. */
export function labView(lab: Lab): LabView | null {
  const parts = lab.parts.filter((p) => p.check === 'structural').map((p): LabViewPart => (Array.isArray(p.options)
    ? { id: p.id, question: p.question, answer: p.answer, options: [...p.options] }
    : { id: p.id, question: p.question, answer: p.answer }));
  return parts.length ? { id: lab.id, version: lab.version, parts } : null;
}

const inside = (child: string, parent: string): boolean => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

/** Writes one view file per lab with a structural part and returns the labs written, each with its structural part IDs. */
export async function exportLabView(contentRoot: string, outDir: string): Promise<ExportedLab[]> {
  const root = resolve(contentRoot);
  const out = resolve(outDir);
  if (inside(out, root) || inside(root, out)) throw new Refused('the output folder must be outside the content folder, and must not hold it');
  let names: string[] = [];
  try { names = (await readdir(join(root, LAB_DIR))).filter((n) => n.endsWith('.json')).sort(); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const views: LabView[] = [];
  for (const n of names) {
    const lab: unknown = JSON.parse(await readFile(join(root, LAB_DIR, n), 'utf8'));
    if (validateLab(lab).length || `${(lab as Lab).id}.json` !== n) throw new Refused(`${LAB_DIR}/${n} is not a valid lab; run npm run check:content`);
    const view = labView(lab as Lab);
    if (view) views.push(view);
  }
  // Clear an earlier export: only its LAB-NN.json files.
  let old: string[] = [];
  try { old = (await readdir(out)).filter((n) => LAB_FILE.test(n)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  for (const n of old) await rm(join(out, n));
  await mkdir(out, { recursive: true });
  for (const v of views) await writeFile(join(out, `${v.id}.json`), JSON.stringify(v, null, 2) + '\n');
  return views.map((v) => ({ id: v.id, parts: v.parts.map((p) => p.id) }));
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const out = process.argv[3] ? resolve(process.argv[3]) : at('tools/.solver-view/labs');
  try {
    const labs = await exportLabView(root, out);
    for (const l of labs) console.log(`${l.id}: ${l.parts.length} structural part${l.parts.length === 1 ? '' : 's'}`);
    console.log(`wrote the lab solver view for ${labs.length} lab${labs.length === 1 ? '' : 's'}, ${labs.reduce((n, l) => n + l.parts.length, 0)} structural parts`);
  } catch (e) {
    // A parse error can quote the file's text, so only this tool's own refusal or an error code is printed.
    const code = (e as { code?: unknown } | null)?.code;
    console.error(e instanceof Refused ? `cannot export the lab solver view: ${e.message}`
      : `cannot export the lab solver view${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ': a lab file is not valid JSON'}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();

// tools/record-lab-solver.ts: stores lab blind-solver records (design §12; sprint 5b D69, Task B1). A fresh solver agent reads the
// exported views (npm run export:lab-view) and writes one answer per structural part into <answers-dir>/<lab_id>.<part_id>.txt
// (git-ignored): the option it picks, or for a multi part the options it picks joined by "; ". This script grades each answer
// against the lab's key as the app compares a structural answer (sameStructuralAnswer: trimmed, case ignored, a multi answer as a
// set) and writes the result, passed or not, into the key's `solver` map. C44 then wants a passed record for every structural part.
//
// An answer is recorded only against the lab the solver saw: its exported view must still match the lab (the same version, and
// the part's question, kind and options), else it is skipped. A key whose lab_version is not the lab's version is refused: nothing
// is written for it, and the run exits 1 (update the key first).
//
// It prints part IDs and PASS, FAIL, SKIP or REFUSED only, with a fixed reason. Never an answer: a right answer is the key.
// Usage: node tools/record-lab-solver.ts [content-root] [answers-dir] [view-dir]
//        (defaults: content/, tools/.solver-out/labs/, tools/.solver-view/labs/)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameStructuralAnswer, sameText, validateLabKey, type Lab, type LabKey } from '../schemas/lab.ts';
import { LAB_KEY_DIR } from '../server/content.ts';
import { loadContentForCli } from './check-content.ts';
import { labView, type LabView } from './export-lab-view.ts';

export interface LabRecordResult { outcome: 'pass' | 'fail' | 'refused'; key: LabKey; why: string }

const ANSWER_FILE = /^(LAB-\d\d)\.(P\d+)\.txt$/;

/**
 * Grades one blind answer to a structural part and returns the key with that part's solver record ({ answer, pass, lab_version, at }, the lab's current version), right
 * or wrong; any other part's record is kept. A choice answer must be one of the options, a multi answer options joined by "; ",
 * each once. A key for another version of the lab is refused and returned unchanged, as is a part that is not structural or has no
 * key (the CLI checks both first).
 */
export function recordLabSolver(lab: Lab, key: LabKey, partId: string, answer: string, at: Date = new Date()): LabRecordResult {
  if (key.lab_version !== lab.version) {
    return { outcome: 'refused', key, why: `the key is for version ${key.lab_version} of ${lab.id}, the lab is version ${lab.version}: update the key first` };
  }
  const part = lab.parts.find((p) => p.id === partId && p.check === 'structural');
  const expected = key.structural?.[partId];
  if (!part || expected === undefined) return { outcome: 'refused', key, why: 'not a keyed structural part' };
  const options = part.options ?? [];
  let given: string | string[];
  let why = '';
  if (part.answer === 'multi') {
    const list = answer.split(';').map((s) => s.trim()).filter((s) => s !== '');
    given = list;
    if (!list.every((g) => options.some((o) => sameText(o, g)))) why = 'not one of the options';
    else if (new Set(list.map((g) => g.toLowerCase())).size !== list.length) why = 'an option is repeated';
  } else {
    const text = answer.trim();
    given = text;
    if (part.answer === 'choice' && !options.some((o) => sameText(o, text))) why = 'not one of the options';
  }
  const pass = why === '' && sameStructuralAnswer(part, given, expected);
  const solver = { ...(key.solver ?? {}), [partId]: { answer: given, pass, lab_version: lab.version, at: at.toISOString() } };
  return { outcome: pass ? 'pass' : 'fail', key: { ...key, solver }, why };
}

/** The view a lab's solver read (<viewDir>/<lab_id>.json), or null when there is none or it cannot be read. */
async function exportedView(viewDir: string, labId: string): Promise<LabView | null> {
  const text = await readFile(join(viewDir, `${labId}.json`), 'utf8').catch(() => null);
  if (text === null) return null;
  try {
    const v = JSON.parse(text) as LabView;
    return v && typeof v === 'object' && Array.isArray(v.parts) ? v : null;
  } catch { return null; }
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const dir = process.argv[3] ? resolve(process.argv[3]) : at('tools/.solver-out/labs');
  const viewDir = process.argv[4] ? resolve(process.argv[4]) : at('tools/.solver-view/labs');
  const files = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.txt')).sort();
  if (!files.length) { console.log(`no solver answers in ${dir}`); return; }
  const store = await loadContentForCli(root);
  if (!store) return;
  const n = { passed: 0, failed: 0, skipped: 0, refused: 0 };
  /** The keys this run has written, by lab ID: a lab's second answer adds to its first one's record. */
  const written = new Map<string, LabKey>();
  const one = async (name: string): Promise<string> => {
    const m = ANSWER_FILE.exec(name);
    if (!m) return `SKIP ${name} (not named <LAB>.<part>.txt)`;
    const [, labId, partId] = m as unknown as [string, string, string];
    const tag = `${labId}.${partId}`;
    const lab = store.lab?.(labId);
    if (!lab) return `SKIP ${tag} (unknown lab)`;
    const part = lab.parts.find((p) => p.id === partId);
    if (!part || part.check !== 'structural') return `SKIP ${tag} (not a structural part)`;
    const key = written.get(labId) ?? store.labKey?.(labId);
    if (!key || validateLabKey(key, lab).length) return `SKIP ${tag} (no valid key; see C43)`;
    if (key.lab_version !== lab.version) return `REFUSED ${tag} (${recordLabSolver(lab, key, partId, '').why})`;
    const seen = await exportedView(viewDir, labId);
    if (seen === null) return `SKIP ${tag} (no exported view; run export:lab-view)`;
    const now = labView(lab)?.parts.find((p) => p.id === partId);
    const then = seen.id === lab.id && seen.version === lab.version ? seen.parts.find((p) => p?.id === partId) : undefined;
    if (!now || !then || JSON.stringify(now) !== JSON.stringify(then)) return `SKIP ${tag} (the lab changed since the export)`;
    const r = recordLabSolver(lab, key, partId, await readFile(join(dir, name), 'utf8'));
    written.set(labId, r.key);
    await writeFile(join(root, LAB_KEY_DIR, `${labId}.json`), JSON.stringify(r.key, null, 2) + '\n');
    return `${r.outcome === 'pass' ? 'PASS' : 'FAIL'} ${tag}${r.why ? ` (${r.why})` : ''}`;
  };
  for (const name of files) {
    const line = await one(name);
    const word = line.split(' ', 1)[0];
    if (word === 'PASS') n.passed++;
    else if (word === 'FAIL') n.failed++;
    else if (word === 'REFUSED') { n.refused++; process.exitCode = 1; }
    else n.skipped++;
    console.log(line);
  }
  console.log(`${n.passed} passed, ${n.failed} failed, ${n.skipped} skipped${n.refused ? `, ${n.refused} refused` : ''}`);
}

if (import.meta.main) await main();

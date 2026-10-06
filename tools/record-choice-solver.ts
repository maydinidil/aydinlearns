// tools/record-choice-solver.ts: stores choice blind-solver records (design §12; Task C3). A fresh solver agent writes one
// answer per item into <answers-dir>/<section>/<item_id>.txt (git-ignored): the oid of the option it picks, or the number it
// would type. This script grades each one through the app's own choice grader (server/choice/grade.ts) and, on a right
// answer, stores the solver record in the item's key file. C26 replays that record.
//
// The record's prompt hash must describe what the solver saw, not the item as it is when this runs (review, fix round 1): if a
// fix round rewrote a distractor in place and an old answer file stayed, the old oid could still grade right. So each answer
// is checked against its exported view (<view-dir>/<section>/<group>/<id>.json): when the hash rebuilt from the view differs
// from the item's, or there is no view, nothing is written and the item is skipped.
//
// Task C4 (S3-13): an SQL choice item's answer is <answers-dir>/sql/<item_id>.txt, checked against its view in
// <view-dir>/sql/<concept>/, graded by the same choice grader on the item's sqlChoiceShape, and its record goes into
// keys/sql-choice/<item_id>.json. C14 replays it.
//
// It prints item IDs and PASS, FAIL or SKIP only, with a fixed reason. Never an answer: a right answer is the key.
// Usage: node tools/record-choice-solver.ts [content-root] [answers-dir] [view-dir]
//        (defaults: content/, tools/.solver-out/choice/, tools/.solver-view/choice/)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlChoiceShape, validateChoiceKey, type ChoiceItem, type ChoiceKey, type ChoiceShape } from '../schemas/choice.ts';
import { isSqlChoiceKind, type SqlItem } from '../schemas/item.ts';
import { CHOICE_GRADER_VERSION, gradeChoice, gradeTyped, parseTyped } from '../server/choice/grade.ts';
import { choicePromptHash, SECTIONS } from './check-choice.ts';
import { loadContentForCli } from './check-content.ts';
import { sqlChoicePromptHash } from './check-sql-choice.ts';
import { sqlViewPromptHash, viewPromptHash, type ViewSection } from './export-choice-view.ts';

export interface ChoiceRecordResult { ok: boolean; key: ChoiceKey; why: string }

/**
 * Grades one blind answer. A right one returns the key with a fresh solver record (the prompt hash C26 compares, the choice
 * grader version, what was chosen or typed, and when); a wrong or unreadable one returns the key unchanged.
 */
export function recordChoiceSolver(item: ChoiceItem, key: ChoiceKey, answer: string, at: Date = new Date()): ChoiceRecordResult {
  return record(item, choicePromptHash(item), key, answer, at);
}
/** Task C4: the same for an SQL choice item (S3-13), graded on its sqlChoiceShape, with the hash C14 compares. */
export function recordSqlChoiceSolver(item: SqlItem, key: ChoiceKey, answer: string, at: Date = new Date()): ChoiceRecordResult {
  return record(sqlChoiceShape(item), sqlChoicePromptHash(item), key, answer, at);
}

function record(item: Pick<ChoiceShape, 'id' | 'kind' | 'options' | 'typed'>, promptHash: string, key: ChoiceKey, answer: string, at: Date): ChoiceRecordResult {
  const a = answer.trim();
  let right: boolean;
  if (item.kind === 'mcq') {
    if (!item.options.some((o) => o.oid === a)) return { ok: false, key, why: 'not one of the options' };
    right = gradeChoice(item, key, a).correct;
  } else {
    const parsed = item.typed ? parseTyped(a, item.typed) : null;
    if (!parsed?.ok) return { ok: false, key, why: 'not a number the app accepts' };
    right = typeof key.value === 'number' && gradeTyped(parsed.value, key.value, item.typed!).correct;
  }
  if (!right) return { ok: false, key, why: '' };
  const solver = { prompt_hash: promptHash, grader_version: CHOICE_GRADER_VERSION,
    chosen: item.kind === 'mcq' ? a : null, typed: item.kind === 'typed' ? a : null, at: at.toISOString() };
  return { ok: true, key: { ...key, solver }, why: '' };
}

async function answerFiles(dir: string): Promise<{ section: ViewSection; name: string }[]> {
  const out: { section: ViewSection; name: string }[] = [];
  for (const section of [...SECTIONS, 'sql'] as const) {
    const names = await readdir(join(dir, section)).catch(() => [] as string[]);
    for (const name of names.filter((n) => n.endsWith('.txt')).sort()) out.push({ section, name });
  }
  return out;
}

/**
 * The prompt hash of the exported view an item's solver read: <viewDir>/<section>/<any group>/<id>.json. Null when there is
 * no such view, or it is not one (a view that cannot be read counts as missing).
 */
async function exportedViewHash(viewDir: string, section: ViewSection, id: string): Promise<string | null> {
  const groups = await readdir(join(viewDir, section), { withFileTypes: true }).catch(() => []);
  for (const g of groups.filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const text = await readFile(join(viewDir, section, g, `${id}.json`), 'utf8').catch(() => null);
    if (text === null) continue;
    try { return (section === 'sql' ? sqlViewPromptHash : viewPromptHash)(JSON.parse(text)); } catch { return null; }
  }
  return null;
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const dir = process.argv[3] ? resolve(process.argv[3]) : at('tools/.solver-out/choice');
  const viewDir = process.argv[4] ? resolve(process.argv[4]) : at('tools/.solver-view/choice');
  const files = await answerFiles(dir);
  if (!files.length) { console.log(`no solver answers in ${dir}`); return; }
  const store = await loadContentForCli(root);
  if (!store) return;
  const n = { passed: 0, failed: 0, skipped: 0 };
  /** Task C4: one SQL choice answer, as below for a GA4 or Methodology one. */
  const recordSql = async (id: string, name: string): Promise<string> => {
    const item = store.item(id);
    const key = store.sqlChoiceKey?.(id);
    if (!item || !isSqlChoiceKind(item.kind)) return `SKIP ${id} (unknown item)`;
    if (item.status !== 'active') return `SKIP ${id} (not active)`;
    if (!key || validateChoiceKey(key, sqlChoiceShape(item)).length) return `SKIP ${id} (no valid key; see C01)`;
    const seen = await exportedViewHash(viewDir, 'sql', id);
    if (seen === null) return `SKIP ${id} (no exported view; run export:choice-view)`;
    if (seen !== sqlChoicePromptHash(item)) return `SKIP ${id} (the item changed since the export)`;
    const r = recordSqlChoiceSolver(item, key, await readFile(join(dir, 'sql', name), 'utf8'));
    if (r.ok) await writeFile(join(root, 'keys', 'sql-choice', `${id}.json`), JSON.stringify(r.key, null, 2) + '\n');
    n[r.ok ? 'passed' : 'failed']++;
    return `${r.ok ? 'PASS' : 'FAIL'} ${id}${r.why ? ` (${r.why})` : ''}`;
  };
  for (const { section, name } of files) {
    const id = name.replace(/\.txt$/, '');
    if (section === 'sql') {
      const line = await recordSql(id, name);
      if (line.startsWith('SKIP')) n.skipped++;
      console.log(line);
      continue;
    }
    const item = store.choiceItem?.(id);
    const key = store.choiceKey?.(id);
    let line: string;
    let seen: string | null = null;
    if (!item || item.section !== section) line = `SKIP ${id} (unknown item)`;
    else if (item.status !== 'active') line = `SKIP ${id} (not active)`;
    else if (!key || validateChoiceKey(key, item).length) line = `SKIP ${id} (no valid key; see C20)`;
    else if ((seen = await exportedViewHash(viewDir, section, id)) === null) line = `SKIP ${id} (no exported view; run export:choice-view)`;
    else if (seen !== choicePromptHash(item)) line = `SKIP ${id} (the item changed since the export)`;
    else {
      const r = recordChoiceSolver(item, key, await readFile(join(dir, section, name), 'utf8'));
      if (r.ok) await writeFile(join(root, 'keys', section, `${id}.json`), JSON.stringify(r.key, null, 2) + '\n');
      line = `${r.ok ? 'PASS' : 'FAIL'} ${id}${r.why ? ` (${r.why})` : ''}`;
      n[r.ok ? 'passed' : 'failed']++;
    }
    if (line.startsWith('SKIP')) n.skipped++;
    console.log(line);
  }
  console.log(`${n.passed} passed, ${n.failed} failed, ${n.skipped} skipped`);
}

if (import.meta.main) await main();

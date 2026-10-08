// tools/report-window.ts: the mastery-window report (owner decision D31; sprint 3 decision 2). Run it with `npm run report:window`.
//
// For every SQL concept it prints how many first attempts sit in the last-4 window by kind (write, fix, choice), how many of
// them qualify for Mastered, and the concept's state. Counts only: no item ID, no query text, no key ever appears in the output.
// It reads the logs folder given on the command line (default: logs/ in the project), replays it in memory and writes nothing.
// The mastery rule changes only if Aydin decides so after reading it.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openJsonlLog } from '../core/jsonl.ts';
import { buildCatalog, LearnerState } from '../server/state.ts';
import { loadContent, type ContentStore } from '../server/content.ts';

export interface WindowRow {
  concept_id: string; state: string;
  /** First attempts in the last-4 window. */
  window: number;
  write: number; fix: number; choice: number; other: number;
  /** Of those, the ones that count towards Mastered (unassisted, in a mixed set, on a later day than the first exposure). */
  qualifying: number;
  /** Mastered needs 3 qualifying solves on 3 different items over 2 or more days. */
  qualifyingItems: number; qualifyingDays: number;
}

/** Replays the folder's logs and counts the window of every SQL concept. Read-only. */
export async function windowReport(logsDir: string, content: ContentStore): Promise<WindowRow[]> {
  const log = openJsonlLog(logsDir);
  const [attempts, events] = [await log.readAll('attempts'), await log.readAll('events')];
  const state = new LearnerState({ content, attempts, events, examDate: () => null });
  const catalog = buildCatalog(content);
  const rows: WindowRow[] = [];
  for (const c of state.current().concepts.values()) {
    if (c.section !== 'sql') continue;
    const row: WindowRow = { concept_id: c.concept_id, state: c.state, window: c.window.length, write: 0, fix: 0, choice: 0, other: 0,
      qualifying: 0, qualifyingItems: 0, qualifyingDays: 0 };
    const q = c.window.filter((e) => e.qualifying);
    for (const e of c.window) {
      const family = catalog.familyOf(e.item_id, '');
      if (family === 'write') row.write++;
      else if (family === 'fix') row.fix++;
      else if (family === 'choice') row.choice++;
      else row.other++;
    }
    row.qualifying = q.length;
    row.qualifyingItems = new Set(q.map((e) => e.item_id)).size;
    row.qualifyingDays = new Set(q.map((e) => e.local_date)).size;
    rows.push(row);
  }
  return rows.sort((a, b) => a.concept_id.localeCompare(b.concept_id));
}

/** The printed report: one line per concept, then a total. The text holds concept IDs and numbers only. */
export function formatWindowReport(rows: WindowRow[]): string {
  const seen = rows.filter((r) => r.window > 0);
  if (seen.length === 0) return 'No SQL first attempts in any concept window yet.';
  const lines = ['Mastery window report (counts only). Window = the last 4 first attempts of a concept.',
    'Mastered needs 3 qualifying solves on 3 different items over 2 or more days, within the window.', ''];
  for (const r of seen) {
    const kinds = `write ${r.write}, fix ${r.fix}, choice ${r.choice}${r.other ? `, other ${r.other}` : ''}`;
    lines.push(`${r.concept_id}  ${r.state}  window ${r.window} of 4 (${kinds})  qualifying ${r.qualifying} (${r.qualifyingItems} items, ${r.qualifyingDays} days)`);
  }
  const sum = (f: (r: WindowRow) => number): number => seen.reduce((n, r) => n + f(r), 0);
  lines.push('', `${seen.length} concepts with a window: write ${sum((r) => r.write)}, fix ${sum((r) => r.fix)}, choice ${sum((r) => r.choice)}; ` +
    `qualifying ${sum((r) => r.qualifying)} of ${sum((r) => r.window)}.`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const at = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const dir = process.argv[2] ? resolve(process.argv[2]) : at('logs');
  const content = await loadContent(at('content'));
  let rows: WindowRow[];
  try { rows = await windowReport(dir, content); } catch (e) {
    console.error(`could not read the logs folder: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  console.log(formatWindowReport(rows));
}

if (import.meta.main) await main();

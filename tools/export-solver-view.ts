// tools/export-solver-view.ts: the blind solver's view of each item (design §12, ruling R36). The
// solver may see only an item's prompt, output contract, rules and schema, so this writes exactly
// those fields, with the item ID, to tools/.solver-view/<item_id>.json (gitignored). A fix item's
// solver must also see the query it is asked to fix, so starter_sql is written when it is a string,
// as promptHash (R37) covers it (S2-48, Task B9); items without one keep the same five fields, byte
// for byte. Hints, why_this_works, the faded shape, the starter's error ID and every key stay out.
// Only active write and fix items are exported, as only they are checked here (SQL choice items: export:choice-view); .json files from an earlier export are
// removed first. It prints counts only, never SQL. A case's CP3 item (sprint 4b: use `case`, EX-CASE-<case tail>; an opener's,
// use `opener`) is an SQL item like any other, so it is exported here with the same fields; the case's CP1, CP2, CP4 and CP5 are
// in export:choice-view, and the case record, its key and its model texts are never exported.
// Usage: node tools/export-solver-view.ts [content-root] [out-dir]   (defaults: content/, tools/.solver-view/)
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSqlChoiceKind, type SqlItem } from '../schemas/item.ts';

export type SolverView = Pick<SqlItem, 'id' | 'prompt' | 'output_contract' | 'rules' | 'schema'> & { starter_sql?: string };

export const solverView = (item: SqlItem): SolverView => {
  const view: SolverView = { id: item.id, prompt: item.prompt, output_contract: item.output_contract, rules: item.rules, schema: item.schema };
  return typeof item.starter_sql === 'string' ? { ...view, starter_sql: item.starter_sql } : view;
};

/** Writes one view file per active item and returns their IDs, sorted. */
export async function exportSolverView(contentRoot: string, outDir: string): Promise<string[]> {
  const dir = join(contentRoot, 'sql/items');
  const items: SqlItem[] = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()) {
    const item = JSON.parse(await readFile(join(dir, name), 'utf8')) as SqlItem;
    // An SQL choice item (S3-13) has its own solver view, in tools/export-choice-view.ts.
    if (item.status === 'active' && typeof item.id === 'string' && !isSqlChoiceKind(item.kind)) items.push(item);
  }
  await mkdir(outDir, { recursive: true });
  for (const old of (await readdir(outDir)).filter((n) => n.endsWith('.json'))) await rm(join(outDir, old));
  for (const item of items) await writeFile(join(outDir, `${item.id}.json`), JSON.stringify(solverView(item), null, 2) + '\n');
  return items.map((i) => i.id).sort();
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const out = process.argv[3] ? resolve(process.argv[3]) : at('tools/.solver-view');
  try {
    const ids = await exportSolverView(root, out);
    console.log(`wrote the solver view for ${ids.length} items`);
  } catch (e) {
    // A parse error can quote the file's text, so only the error code is printed (non-negotiable 2).
    const code = (e as { code?: unknown } | null)?.code;
    console.error(`cannot export the solver view${typeof code === 'string' && /^[A-Z_]+$/.test(code) ? ` (${code})` : ': an item file is not valid JSON'}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();

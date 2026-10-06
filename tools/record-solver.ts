// tools/record-solver.ts: stores blind-solver records (design §12). The blind solver agent writes
// one query per item into tools/.solver-out/<item_id>.sql (gitignored). This script grades each
// one through the app's grader and, on a pass, stores the solver record in the item's key file.
// It prints item IDs and PASS, FAIL or SKIP only, never SQL.
// Usage: node tools/record-solver.ts [content-root]   (default: content/)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRunner } from '../server/runner/client.ts';
import { grade, GRADER_VERSION } from '../server/grader/grade.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import { loadContentForCli, promptHash, referenceTables, schemaVersion, type CheckContext } from './check-content.ts';

export async function recordSolver(item: SqlItem, key: SqlKey, query: string, ctx: CheckContext): Promise<{ ok: boolean; key: SqlKey }> {
  let passed = false;
  try {
    passed = (await grade({ item, key, sql: query }, { runner: ctx.runner, edge: ctx.edge(item.edge_schema), feedback: ctx.feedback })).outcome === 'pass';
  } catch { /* the key itself does not run: no record */ }
  if (!passed) return { ok: false, key };
  // R37: the schema version covers only the tables the reference reads; dataset_version is kept as a record, and C14 no longer compares it.
  const schema_version = await schemaVersion(ctx.runner, item.schema, await referenceTables(ctx.runner, item, key));
  return { ok: true, key: { ...key, solver: { prompt_hash: promptHash(item), schema_version,
    dataset_version: ctx.datasetVersion, grader_version: GRADER_VERSION, query, at: new Date().toISOString() } } };
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const root = process.argv[2] ? resolve(process.argv[2]) : at('content');
  const store = await loadContentForCli(root);
  if (!store) return;
  const files = (await readdir(at('tools/.solver-out')).catch(() => [] as string[])).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) { console.log('no solver queries in tools/.solver-out'); return; }
  const manifest = JSON.parse(await readFile(at('data/manifest.json'), 'utf8'));
  const constructs = JSON.parse(await readFile(join(root, 'sql/constructs.json'), 'utf8'));
  const runner = await startRunner(at('data/course.duckdb'));
  const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
    datasetVersion: manifest.dataset_version, constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
  try {
    for (const f of files) {
      const id = f.replace(/\.sql$/, '');
      const item = store.item(id);
      const key = store.key(id);
      if (!item || !key) { console.log(`SKIP ${id} (unknown item)`); continue; }
      const r = await recordSolver(item, key, await readFile(at(`tools/.solver-out/${f}`), 'utf8'), ctx);
      if (r.ok) await writeFile(join(root, 'keys/sql', `${id}.json`), JSON.stringify(r.key, null, 2) + '\n');
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${id}`);
    }
  } finally {
    await runner.close();
  }
}

if (import.meta.main) await main();

// core/ must stay domain-free so aydindutch can copy it (design §15).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [/duckdb/i, /^\.\.\/(server|schemas|tools|web|pipeline)\//];
const SPECIFIER = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

export interface ForbiddenImport { file: string; specifier: string }

export function findForbiddenImports(files: Record<string, string>): ForbiddenImport[] {
  const out: ForbiddenImport[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[1]!;
      if (FORBIDDEN.some((re) => re.test(spec))) out.push({ file, specifier: spec });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const names = (await readdir('core', { recursive: true })).filter((n) => n.endsWith('.ts'));
  const files: Record<string, string> = {};
  for (const n of names) files[join('core', n).replaceAll('\\', '/')] = await readFile(join('core', n), 'utf8');
  const bad = findForbiddenImports(files);
  for (const b of bad) console.error(`core import not allowed: ${b.file} -> ${b.specifier}`);
  if (bad.length) process.exit(1);
  console.log(`core imports clean (${names.length} files)`);
}

if (import.meta.main) await main();

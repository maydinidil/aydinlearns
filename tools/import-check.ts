// core/ must stay domain-free so aydindutch can copy it (design §15), and web/ must not import schemas/presets.ts.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [/duckdb/i, /^\.\.\/(server|schemas|tools|web|pipeline)\//];
// `from '...'`, `import('...')`, and a bare side-effect `import '...'` with no binding (Codex F23).
const SPECIFIER = /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g;

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

/** s2:L102: web/ must never import schemas/presets.ts (its rule presets are server-side; a web copy would ship them). */
const PRESETS = /(?:^|\/)schemas\/presets(?:\.ts)?$/;
export function findWebPresetImports(files: Record<string, string>): ForbiddenImport[] {
  const out: ForbiddenImport[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(SPECIFIER)) if (PRESETS.test(m[1]!)) out.push({ file, specifier: m[1]! });
  }
  return out;
}

async function main(): Promise<void> {
  const names = (await readdir('core', { recursive: true })).filter((n) => n.endsWith('.ts'));
  const files: Record<string, string> = {};
  for (const n of names) files[join('core', n).replaceAll('\\', '/')] = await readFile(join('core', n), 'utf8');
  const bad = findForbiddenImports(files);
  for (const b of bad) console.error(`core import not allowed: ${b.file} -> ${b.specifier}`);
  const webNames = (await readdir('web/src', { recursive: true })).filter((n) => /\.tsx?$/.test(n));
  const web: Record<string, string> = {};
  for (const n of webNames) web[join('web/src', n).replaceAll('\\', '/')] = await readFile(join('web/src', n), 'utf8');
  const presets = findWebPresetImports(web);
  for (const b of presets) console.error(`web import not allowed: ${b.file} -> ${b.specifier}`);
  if (bad.length || presets.length) process.exit(1);
  console.log(`core imports clean (${names.length} files), web imports clean (${webNames.length} files)`);
}

if (import.meta.main) await main();

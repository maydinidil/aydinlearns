// tests/helpers/tsx-hooks.ts: the module hook behind register-tsx.ts. The .ts and .tsx files under web/src/, and the .tsx files under
// tests/ (small test components), are compiled with Vite's transformWithOxc (the compiler the web build uses) and React's automatic
// JSX runtime. Every other file loads as Node loads it.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

type LoadContext = { format?: string | null };
type LoadResult = { format: string; source?: string | Buffer | Uint8Array; shortCircuit?: boolean };
type NextLoad = (url: string, context: LoadContext) => Promise<LoadResult>;

/** The test for a file URL (always forward slashes): web/src code in .ts or .tsx, or a .tsx under tests/. */
function isCompiled(url: string): boolean {
  if (url.includes('/node_modules/')) return false;
  if (url.includes('/web/src/')) return url.endsWith('.ts') || url.endsWith('.tsx');
  return url.includes('/tests/') && url.endsWith('.tsx');
}

export async function load(url: string, context: LoadContext, nextLoad: NextLoad): Promise<LoadResult> {
  if (!url.startsWith('file:') || !isCompiled(url)) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const code = await readFile(file, 'utf8');
  const out = await transformWithOxc(code, file, { jsx: { runtime: 'automatic' } });
  return { format: 'module', source: out.code, shortCircuit: true };
}

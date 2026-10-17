// core/ must stay domain-free so aydindutch can copy it (design §15), web/ must not import schemas/presets.ts, and no tutor file
// reaches an answer key (sprint T).
import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { join, posix } from 'node:path';

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

/**
 * Sprint T (AI tutor design §9; review T6, I3): no tutor file reaches an answer key. Course content reaches the tutor only through
 * server/tutor-source.ts. Every file in server/tutor/ (any extension) and server/tutor-source.ts are scanned, with three rules:
 * - Imports are an allow-list: node built-ins, the two SDKs, files under server/tutor/, the domain-free core/, server/drill.ts
 *   (HELP_WAITS) and the three schema modules whose types the tutor uses. Anything else is a finding, a computed import too, so the
 *   store under a new name, the app or any other server module needs a deliberate edit here. server/tutor-source.ts may also import
 *   the content store, by name.
 * - Text: a key or truth accessor however it is called, a key type or key field, the keys or truth folder, createRequire.
 * - server/tutor-source.ts reads only the store members it uses, by name (TUTOR_STORE_READS).
 */
const TUTOR_SOURCE = 'server/tutor-source.ts';
/** `from '...'`, `import('...')`, a bare `import '...'` and `require('...')`, in any of the three quotes. */
const TUTOR_IMPORT = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)(['"`])([^'"`\n]*)\1/g;
const TUTOR_COMPUTED_IMPORT = /\b(?:import|require)\s*\((?!\s*['"`])/g;
const TUTOR_PACKAGES = /^(?:@anthropic-ai\/sdk|openai)(?:\/|$)/;
const TUTOR_MAY_IMPORT: ReadonlySet<string> = new Set(['schemas/case.ts', 'schemas/item.ts', 'schemas/schema-notes.ts', 'server/drill.ts']);
const TUTOR_TEXT: readonly RegExp[] = [
  /\.key\s*(?:\?\.\s*)?\(/g,                                             // the store's key(id): .key(, .key?.(, .key (
  /\[\s*['"`]key['"`]\s*\]/g,                                            // ['key']
  /\{[^{}]*\bkey\b[^{}]*\}\s*=\s*(?:content|store)\b/g,                  // const { key } = content
  /\b(?:caseKey|caseKeyIds|choiceKey|sqlChoiceKey|labKey|checkpointTruth|checkpointTruthHash)\b/g,
  /\b(?:SqlKey|CaseKey|CaseChoiceKey|ChoiceKey|LabKey|hint3_partial|reference_sql|planted_wrong|correct_oid)\b/g,
  /content\/keys|data\/truth/g,
  /\bcreateRequire\b/g,
];
/** What server/tutor-source.ts reads from the store (`content`); a key accessor would also be caught by TUTOR_TEXT. */
const TUTOR_STORE_READS: ReadonlySet<string> = new Set(['item', 'heldOut', 'choiceItem', 'curriculum', 'lesson', 'choiceConcepts', 'case', 'feedback']);
const STORE_MEMBER = /(?<![\w$./])content\s*(?:\?\.|\.)([A-Za-z_$][\w$]*)/g;
const STORE_WHOLE = /(?<![\w$./])content\s*(?:\?\.\s*)?\[|\}\s*=\s*content\b/g;

function tutorImportAllowed(file: string, spec: string): boolean {
  if (spec.startsWith('node:') || builtinModules.includes(spec) || TUTOR_PACKAGES.test(spec)) return true;
  if (!/^\.\.?\//.test(spec) || spec.includes('${')) return false;
  const path = posix.normalize(posix.join(posix.dirname(file), spec));
  if (path.startsWith('server/tutor/') || path.startsWith('core/') || TUTOR_MAY_IMPORT.has(path)) return true;
  return file === TUTOR_SOURCE && path === 'server/content.ts';
}

export function findTutorKeyAccess(files: Record<string, string>): ForbiddenImport[] {
  const out: ForbiddenImport[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(TUTOR_IMPORT)) if (!tutorImportAllowed(file, m[2]!)) out.push({ file, specifier: m[2]! });
    for (const m of text.matchAll(TUTOR_COMPUTED_IMPORT)) out.push({ file, specifier: m[0] });
    for (const re of TUTOR_TEXT) for (const m of text.matchAll(re)) out.push({ file, specifier: m[0] });
    if (file !== TUTOR_SOURCE) continue;
    for (const m of text.matchAll(STORE_MEMBER)) if (!TUTOR_STORE_READS.has(m[1]!)) out.push({ file, specifier: `content.${m[1]!}` });
    for (const m of text.matchAll(STORE_WHOLE)) out.push({ file, specifier: m[0] });
  }
  return out;
}

/** Every file under server/tutor/ (any extension, any depth) and server/tutor-source.ts, by repo path. Throws when one cannot be read. */
async function readTutorFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const d of await readdir('server/tutor', { recursive: true, withFileTypes: true })) {
    if (d.isDirectory()) continue;
    const path = join(d.parentPath, d.name);
    files[path.replaceAll('\\', '/')] = await readFile(path, 'utf8');
  }
  files[TUTOR_SOURCE] = await readFile(TUTOR_SOURCE, 'utf8');
  return files;
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
  // A scan that could not be made fails: it never prints clean.
  let tutor: Record<string, string>;
  try {
    tutor = await readTutorFiles();
  } catch (e) {
    console.error(`tutor check could not read server/tutor/ or ${TUTOR_SOURCE}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const keyAccess = findTutorKeyAccess(tutor);
  for (const b of keyAccess) console.error(`tutor key access not allowed: ${b.file} -> ${b.specifier}`);
  if (bad.length || presets.length || keyAccess.length) process.exit(1);
  console.log(`core imports clean (${names.length} files), web imports clean (${webNames.length} files), tutor clean (${Object.keys(tutor).length} files)`);
}

if (import.meta.main) await main();

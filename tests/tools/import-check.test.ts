import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findForbiddenImports, findTutorKeyAccess, findWebPresetImports } from '../../tools/import-check.ts';

test('flags DuckDB and app imports inside core', () => {
  const files = {
    'core/a.ts': "import { x } from '@duckdb/node-api';\nimport type { Y } from '../schemas/item.ts';",
    'core/b.ts': "import { readFile } from 'node:fs/promises';\nimport { z } from './c.ts';",
    'core/c.ts': "const m = await import('../server/runner/client.ts');",
  };
  const found = findForbiddenImports(files);
  assert.deepEqual(found.map((f) => `${f.file}:${f.specifier}`).sort(), [
    'core/a.ts:../schemas/item.ts',
    'core/a.ts:@duckdb/node-api',
    'core/c.ts:../server/runner/client.ts',
  ]);
});

test('flags a web import of schemas/presets.ts, however it is spelled (s2:L102)', () => {
  const files = {
    'web/src/a.ts': "import { P } from '../../schemas/presets.ts';",
    'web/src/b.tsx': "const m = await import('../../../schemas/presets');",
    'web/src/c.ts': "import { Item } from '../../schemas/item.ts';\nimport { x } from './presets.ts';",
  };
  assert.deepEqual(findWebPresetImports(files).map((f) => `${f.file}:${f.specifier}`).sort(), ['web/src/a.ts:../../schemas/presets.ts', 'web/src/b.tsx:../../../schemas/presets']);
});

test('flags a bare side-effect import too, in the web presets guard and the core check (Codex F23)', () => {
  const web = { 'web/src/a.ts': "import '../../schemas/presets.ts';", 'web/src/b.tsx': 'import "../../schemas/presets";' };
  assert.deepEqual(findWebPresetImports(web).map((f) => `${f.file}:${f.specifier}`).sort(), ['web/src/a.ts:../../schemas/presets.ts', 'web/src/b.tsx:../../schemas/presets']);
  const core = { 'core/a.ts': "import '@duckdb/node-api';", 'core/b.ts': 'import "../server/log.ts";\nimport "./c.ts";' };
  assert.deepEqual(findForbiddenImports(core).map((f) => `${f.file}:${f.specifier}`).sort(), ['core/a.ts:@duckdb/node-api', 'core/b.ts:../server/log.ts']);
});

test('the three stylesheet imports in web/src/main.tsx are not flagged (Codex F23)', async () => {
  const main = await readFile(new URL('../../web/src/main.tsx', import.meta.url), 'utf8');
  assert.equal(main.match(/^import '\.\/styles\/[a-z]+\.css';$/gm)?.length, 3, 'main.tsx still has the three bare stylesheet imports this test guards');
  assert.deepEqual(findWebPresetImports({ 'web/src/main.tsx': main }), []);
});

test('sprint T: a tutor file may not read a key, import the content store, the grader or the key schemas', () => {
  const files = {
    'server/tutor/a.ts': "const k = content.key(id);",
    'server/tutor/b.ts': "import type { ContentStore } from '../content.ts';",
    'server/tutor/c.ts': "import { grade } from '../grader/grade.ts';\nconst h = item.hint3_partial;",
    'server/tutor/d.ts': "import type { SqlKey } from '../../schemas/keys.ts';\nconst r = store.caseKey(id) ?? store.choiceKey?.(id);",
    'server/tutor/ok.ts': "import type { SqlItem } from '../../schemas/item.ts';\nimport { redact } from './redact.ts';",
  };
  assert.deepEqual(findTutorKeyAccess(files).map((f) => `${f.file}:${f.specifier}`).sort(), [
    'server/tutor/a.ts:.key(',
    'server/tutor/b.ts:../content.ts',
    'server/tutor/c.ts:../grader/grade.ts',
    'server/tutor/c.ts:hint3_partial',
    'server/tutor/d.ts:../../schemas/keys.ts',
    'server/tutor/d.ts:SqlKey',
    'server/tutor/d.ts:caseKey',
    'server/tutor/d.ts:choiceKey',
  ]);
});

// Review T6, I3: one probe per gap the review found, each file on its own, plus the imports a tutor file may make. Every name in
// these probes is made up; none of them reads a real key.
test('sprint T: the tutor check catches every way the review found to reach a key, and passes what a tutor file may import', async () => {
  const source = await readFile(new URL('../../server/tutor-source.ts', import.meta.url), 'utf8');
  const probes: [file: string, text: string, expected: string[]][] = [
    // the store's own call styles
    ['server/tutor/optional-call.ts', 'export const k = (content: any, id: string) => content.key?.(id);', ['.key?.(']],
    ['server/tutor/spaced-call.ts', 'export const k = (content: any, id: string) => content.key (id);', ['.key (']],
    ['server/tutor/bracket.ts', "export const k = (content: any, id: string) => content['key'](id);", ["['key']"]],
    ['server/tutor/destructure.ts', 'export function k(content: any) { const { key } = content; return key; }', ['{ key } = content']],
    // the key and truth accessors, the truth folder, the key types and the key fields
    ['server/tutor/sql-choice.ts', 'export const k = (store: any, id: string) => store.sqlChoiceKey?.(id);', ['sqlChoiceKey']],
    ['server/tutor/truth.ts', 'export const t = (store: any, k: string) => store.checkpointTruth?.(k) ?? store.checkpointTruthHash?.(k);', ['checkpointTruth', 'checkpointTruthHash']],
    ['server/tutor/truth-path.ts', "export const file = 'data/truth/checkpoints.json';", ['data/truth']],
    ['server/tutor/key-types.ts', 'export type K = CaseKey | CaseChoiceKey | ChoiceKey | LabKey | SqlKey;', ['CaseChoiceKey', 'CaseKey', 'ChoiceKey', 'LabKey', 'SqlKey']],
    ['server/tutor/key-fields.ts', 'export const f = (k: any) => [k.reference_sql, k.planted_wrong, k.correct_oid];', ['correct_oid', 'planted_wrong', 'reference_sql']],
    // a module that holds the store, under any name: the import rule is an allow-list
    ['server/tutor/app.ts', "import type { AppDeps } from '../app.ts';", ['../app.ts']],
    ['server/tutor/renamed.ts', "import { loadStore } from '../content-store.ts';\nexport { gradeLab } from '../labs.ts';", ['../content-store.ts', '../labs.ts']],
    // imports the old pattern did not read
    ['server/tutor/backtick.ts', 'const m = await import(`../content.ts`);', ['../content.ts']],
    ['server/tutor/template.ts', 'export const load = (name: string) => import(`./${name}.ts`);', ['./${name}.ts']],
    ['server/tutor/computed.ts', 'export const load = (name: string) => import(name);', ['import(']],
    ['server/tutor/require.ts', "const s = require('../content.ts');", ['../content.ts']],
    ['server/tutor/create-require.ts', "import { createRequire } from 'node:module';\nconst s = createRequire(import.meta.url)('../content.ts');", ['createRequire', 'createRequire']],
    // server/tutor-source.ts holds the store: its own reads pass by name, anything wider is caught
    ['server/tutor-source.ts', source, []],
    ['server/tutor-source.ts', `${source}\nexport const widened = (content: ContentStore) => ({ key: content.key, all: content.sqlItems?.() });`, ['content.key', 'content.sqlItems']],
    // what a tutor file may import: node built-ins, the two SDKs, its own folder, the domain-free core, HELP_WAITS and the schema types
    ['server/tutor/providers/allowed.ts', [
      "import Anthropic from '@anthropic-ai/sdk';", "import OpenAI from 'openai';", "import type { Stream } from 'openai/streaming';",
      "import { readFile } from 'node:fs/promises';", "import { homedir } from 'os';", "import type { TutorModel } from '../types.ts';",
      "import { failureOf } from './errors.ts';", "import { amsterdamDate } from '../../../core/time.ts';", "import { HELP_WAITS } from '../../drill.ts';",
      "import type { SqlItem } from '../../../schemas/item.ts';", "import type { CaseRecord } from '../../../schemas/case.ts';",
      "import type { TableNote } from '../../../schemas/schema-notes.ts';", "const fake = await import('../providers/fake.ts');",
    ].join('\n'), []],
  ];
  const found = probes.map(([file, text]) => [file, findTutorKeyAccess({ [file]: text }).map((f) => f.specifier).sort()]);
  assert.deepEqual(found, probes.map(([file, , expected]) => [file, expected]));
});

// The scan itself (tools/import-check.ts main): run the command in a made-up tree.
const SCRIPT = fileURLToPath(new URL('../../tools/import-check.ts', import.meta.url));
async function runImportCheck(tree: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const root = await mkdtemp(join(tmpdir(), 'aydinlearns-import-check-'));
  try {
    await mkdir(join(root, 'core'));
    await mkdir(join(root, 'web', 'src'), { recursive: true });
    for (const [path, text] of Object.entries(tree)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('sprint T scan: a clean tree passes, counting every tutor file and server/tutor-source.ts', async () => {
  const r = await runImportCheck({ 'server/tutor/a.ts': "import { b } from './b.ts';", 'server/tutor/b.ts': 'export const b = 1;',
    'server/tutor-source.ts': "import type { ContentStore } from './content.ts';\nexport const one = (content: ContentStore) => content.item('X');" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /tutor clean \(3 files\)/);
});

test('sprint T scan: a tutor folder that cannot be read fails the check instead of printing clean', async () => {
  const r = await runImportCheck({ 'server/tutor': 'a file where the folder should be', 'server/tutor-source.ts': '' });
  assert.doesNotMatch(r.stdout, /tutor clean/);
  assert.equal(r.status, 1);
});

test('sprint T scan: a file in server/tutor/ that is not .ts is scanned too', async () => {
  const r = await runImportCheck({ 'server/tutor/a.ts': 'export const a = 1;', 'server/tutor/old/b.mts': 'export const k = (s: any, id: string) => s.key(id);',
    'server/tutor/c.js': "import { x } from '../app.ts';", 'server/tutor-source.ts': '' });
  assert.match(r.stderr, /server\/tutor\/old\/b\.mts -> \.key\(/);
  assert.match(r.stderr, /server\/tutor\/c\.js -> \.\.\/app\.ts/);
  assert.equal(r.status, 1);
});

test('sprint T scan: server/tutor-source.ts is scanned, so a wider read of the store fails', async () => {
  const r = await runImportCheck({ 'server/tutor/a.ts': 'export const a = 1;',
    'server/tutor-source.ts': "import type { ContentStore } from './content.ts';\nexport const leak = (content: ContentStore) => ({ key: content.key });" });
  assert.match(r.stderr, /server\/tutor-source\.ts -> content\.key/);
  assert.equal(r.status, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findForbiddenImports, findWebPresetImports } from '../../tools/import-check.ts';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findForbiddenImports } from '../../tools/import-check.ts';

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

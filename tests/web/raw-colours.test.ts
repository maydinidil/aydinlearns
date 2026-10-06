// tests/web/raw-colours.test.ts: no raw hex colour in web/src outside tokens.css, so every colour goes through the tokens and the
// contrast test (visuals spec §3; Review Focus 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../../web/src', import.meta.url));
const ALLOWED = join(WEB, 'styles', 'tokens.css');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(css|ts|tsx)$/.test(n) ? [p] : [];
  });
}

test('no raw hex colour outside web/src/styles/tokens.css', () => {
  const found: string[] = [];
  for (const f of files(WEB)) {
    if (f === ALLOWED) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) found.push(`${relative(WEB, f)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

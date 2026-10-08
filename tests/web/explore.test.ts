// tests/web/explore.test.ts: the dataset explorer's words and wiring (sprint 4b, Task E2; S4B-28). The editor and the screen run in the
// browser; what is checked here is what they are built from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { completionSchema } from '../../web/src/editor/completion-schema.ts';
import { EXPLORE_HREF, PROGRESS_LINKS } from '../../web/src/lib/progress-api.ts';
import { EXPLORE_INTRO, EXPLORE_START, exploreError } from '../../web/src/lib/explore-api.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';

const n = (table: string, from_level?: number): TableNote => ({ schema: 'voltmarkt', table, sample: { columns: ['a', 'b'], rows: [] }, ...(from_level === undefined ? {} : { from_level }) } as unknown as TableNote);
const src = (p: string) => readFile(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');

test('autocomplete with no level covers every table, including the late-level ones', () => {
  assert.deepEqual(Object.keys(completionSchema([n('stores'), n('orders', 3), n('prices', 6)], null)), ['stores', 'orders', 'prices']);
});
test('runner failures read in plain words', () => {
  assert.equal(exploreError({ kind: 'timeout' } as never), 'Stopped: the query took too long. It may be multiplying rows.');
  assert.equal(exploreError({ kind: 'rejected', message: 'Only one statement is allowed.' } as never), 'Only one statement is allowed.');
});
test('the screen text has no em dash and the starter is a SELECT', () => {
  assert.ok(!/—/.test(EXPLORE_INTRO));
  assert.match(EXPLORE_START, /^SELECT/);
});
test('the explorer is routed, and linked from Progress and the SQL map', async () => {
  assert.ok(PROGRESS_LINKS.some((l) => l.href === EXPLORE_HREF));
  assert.match(await src('App.tsx'), /parts\[0\] === 'explore'\) screen = <ExploreScreen \/>/);
  assert.match(await src('screens/MapScreen.tsx'), /EXPLORE_HREF/);
});
test('the explorer has Run only: it never calls submit, hint or answer', async () => {
  const screen = await src('screens/ExploreScreen.tsx');
  assert.match(screen, /exploreApi\.run/);
  assert.doesNotMatch(screen, /api\.submit|api\.hint|showAnswer|\/api\/run\b/);
});

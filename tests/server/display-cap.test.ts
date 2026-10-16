// tests/server/display-cap.test.ts: the display cap is written once (server/runner/protocol.ts) and read by the run, grade and
// explore routes (Task K4, S6-38; sprint 4b E2-m1). A second copy of the number in any of them fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DISPLAY_CAP } from '../../server/runner/protocol.ts';
import { EXPLORE_CAP } from '../../server/routes/explore.ts';

test('K4: the explore cap is the shared display cap', () => {
  assert.equal(DISPLAY_CAP, 1000);
  assert.equal(EXPLORE_CAP, DISPLAY_CAP);
});

test('K4: app.ts, grade.ts and explore.ts import the cap and declare none of their own', async () => {
  for (const file of ['server/app.ts', 'server/grader/grade.ts', 'server/routes/explore.ts']) {
    const text = await readFile(file, 'utf8');
    assert.match(text, /\bDISPLAY_CAP\b/, `${file} uses DISPLAY_CAP`);
    assert.doesNotMatch(text, /(const|let)\s+\w*CAP\s*=\s*\d/, `${file} declares no cap of its own`);
  }
});

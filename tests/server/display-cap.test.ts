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

const FILES = ['server/app.ts', 'server/grader/grade.ts', 'server/routes/explore.ts'];
/** The ways a file could keep a number of its own: a CAP-named constant with a typed, underscored or `as const` literal, or `cap: 1000`. */
const OWN_CAP = [/\b(?:const|let|var)\s+\w*cap\w*\s*(?::[^=]+)?=\s*[\d_]/i, /\bcap\s*:\s*[\d_]/];

test('K4: app.ts, grade.ts and explore.ts import the cap and declare none of their own', async () => {
  for (const file of FILES) {
    const text = await readFile(file, 'utf8');
    assert.match(text, /\bDISPLAY_CAP\b/, `${file} uses DISPLAY_CAP`);
    for (const pattern of OWN_CAP) assert.doesNotMatch(text, pattern, `${file} declares no cap of its own`);
  }
});

test('S7-30: the pattern that finds a second copy of the cap does find one, in each form it takes', () => {
  for (const own of ['const CAP = 1000;', 'export const ROW_CAP: number = 1000;', 'let displayCap = 1_000', 'const CAP=1000', 'request({ cap: 1000 })', 'request({ cap : 1_000 })']) {
    assert.ok(OWN_CAP.some((p) => p.test(own)), own);
  }
  for (const fine of ['cap: DISPLAY_CAP', 'export const EXPLORE_CAP = DISPLAY_CAP;', 'const capped = rows.length > DISPLAY_CAP']) {
    assert.ok(!OWN_CAP.some((p) => p.test(fine)), fine);
  }
});

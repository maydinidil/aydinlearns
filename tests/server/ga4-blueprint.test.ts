// tests/server/ga4-blueprint.test.ts: pins the GA4 run blueprint values in content/ga4/exam.json (aydinlearns F14).
// choiceRuns() scores every logged run against the blueprint in force today, and the log does not record which one a run
// was taken under. A silent change would rescore old runs (a passed 16 of 20 becoming a failed 16 of 25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const raw = JSON.parse(await readFile(fileURLToPath(new URL('../../content/ga4/exam.json', import.meta.url)), 'utf8')) as {
  mini_drill: { questions: number; pass_pct: number };
  half_mock: { questions: number; pass_pct: number; minutes: number; retake_days: number };
};

const KEEP = 'content/ga4/exam.json no longer has the values the logged runs were scored under. Before changing them, keep the old '
  + 'values in the file with the date they stopped applying, and pick each run\'s blueprint by its start date, or past runs are '
  + 'rescored (docs/reviews/codex-findings.md, F14).';

test('the GA4 blueprint values stay as written until old values are kept with their end date (aydinlearns F14)', () => {
  assert.deepEqual({
    mini_drill: { questions: raw.mini_drill.questions, pass_pct: raw.mini_drill.pass_pct },
    half_mock: { questions: raw.half_mock.questions, pass_pct: raw.half_mock.pass_pct, minutes: raw.half_mock.minutes, retake_days: raw.half_mock.retake_days },
  }, {
    mini_drill: { questions: 20, pass_pct: 80 },
    half_mock: { questions: 25, pass_pct: 80, minutes: 37.5, retake_days: 21 },
  }, KEEP);
});

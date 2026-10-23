// tests/web/tutor-status-shape.test.ts: GET /api/tutor/status as the browser declares it against the route's reply (sprint 7c, Task X3; D117,
// S7C-04). The route answers the shared status view (schemas/tutor.ts) and whether the run that is on is a mock's (`mock_on`); the browser
// declares the same (web/src/tutor/TutorContext.tsx TutorStatusRead), since the route module brings node types the browser build does not
// have. The two are checked at type level, both ways, by npm run typecheck; the closing line of a status with mock_on is checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TutorStatusReply } from '../../server/routes/tutor.ts';
import { MOCK_WAITS, mockWaitsIn, type TutorStatusRead } from '../../web/src/tutor/TutorContext.tsx';

const sameShape: [(x: TutorStatusReply) => TutorStatusRead, (x: TutorStatusRead) => TutorStatusReply] = [(x) => x, (x) => x];
void sameShape;

test('D117: a status with mock_on closes the tutor with the waiting line; one without, or with mock_on false, does not', () => {
  const base = { enabled: true, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium' as const, reason: null, models: [], keys: [],
    spent_today_usd: 0, cap_usd: 1, run_on: true };
  assert.equal(mockWaitsIn({ ...base, mock_on: true } as TutorStatusRead), MOCK_WAITS);
  assert.equal(mockWaitsIn({ ...base, mock_on: false } as TutorStatusRead), null);
  assert.equal(mockWaitsIn(base), null, 'a status from before D117 closes nothing');
  assert.doesNotMatch(MOCK_WAITS, /\u2014|\.$/, 'no em dash; the panel adds the full stop');
});

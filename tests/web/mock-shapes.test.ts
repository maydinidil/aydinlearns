// tests/web/mock-shapes.test.ts: the browser's declarations of the recruiter mocks' shapes against the routes' (sprint 7c, Task X3; F4-2-3).
// web/src/lib/case-flow.ts and web/src/lib/mock-flow.ts redeclare what server/routes/mock-cases.ts, server/routes/mocks.ts and
// server/drill.ts answer, since the server modules bring node types the browser build does not have. As the inbox's (tests/web/case-flow.test.ts),
// each pair is checked at type level, both ways, by npm run typecheck; the one test below only keeps the file a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  MockCaseCheckpointView as ServerCaseCheckpoint, MockCaseReviewCheckpoint as ServerReviewCheckpoint, MockCaseView as ServerCaseView,
} from '../../server/routes/mock-cases.ts';
import type {
  CaseMockReview as ServerCaseReview, MockAnswerView as ServerAnswer, MockCardView as ServerCard, MockHistoryRow as ServerRow, MockReview as ServerReview,
  MockReviewItem as ServerReviewItem, MocksView as ServerMocks,
} from '../../server/routes/mocks.ts';
import type { CaseMockReview, MockCaseCheckpointView, MockCaseReviewCheckpoint, MockCaseView } from '../../web/src/lib/case-flow.ts';
import type { MockAnswer, MockCard, MockHistoryRow, MockReview, MockReviewItem, MocksRun, MocksView } from '../../web/src/lib/mock-flow.ts';

// The browser's declarations and the routes' are the same shapes. F4-2-5 (sprint 7c): a checkpoint's prompt is null until the plan, on both sides.
const sameShape: [
  (x: ServerCaseCheckpoint) => MockCaseCheckpointView, (x: MockCaseCheckpointView) => ServerCaseCheckpoint,
  (x: ServerCaseView) => MockCaseView, (x: MockCaseView) => ServerCaseView,
  (x: ServerReviewCheckpoint) => MockCaseReviewCheckpoint, (x: MockCaseReviewCheckpoint) => ServerReviewCheckpoint,
  (x: ServerCaseReview) => CaseMockReview, (x: CaseMockReview) => ServerCaseReview,
  (x: ServerRow) => MockHistoryRow, (x: MockHistoryRow) => ServerRow,
  (x: ServerCard) => MockCard, (x: MockCard) => ServerCard,
  (x: ServerAnswer) => MockAnswer, (x: MockAnswer) => ServerAnswer,
  (x: ServerReviewItem) => MockReviewItem, (x: MockReviewItem) => ServerReviewItem,
  // S7D-11 (X3-M3): the three shapes the browser once read more loosely are exact now: `not_reached` on the screen review, `answered` on the
  // servings of GET /api/mocks, and `deadline_at` on the run view.
  (x: ServerReview) => MockReview, (x: MockReview) => ServerReview,
  (x: ServerMocks) => MocksView, (x: MocksView) => ServerMocks,
  (x: NonNullable<ServerMocks['run']>) => MocksRun, (x: MocksRun) => NonNullable<ServerMocks['run']>,
] = [(x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x,
  (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x];
void sameShape;

test('F4-2-3, S7D-11: the mock shapes are checked at type level (npm run typecheck): 11 pairs, both ways', () => {
  assert.equal(sameShape.length, 22);
});

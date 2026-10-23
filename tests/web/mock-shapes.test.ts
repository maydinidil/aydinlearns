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
import type { MockAnswer, MockCard, MockHistoryRow, MockReview, MockReviewItem, MockRunView, MocksView } from '../../web/src/lib/mock-flow.ts';

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
] = [(x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x];
void sameShape;
// What the server sends satisfies what the browser reads, for the shapes the browser reads more loosely: its MockReview takes `not_reached` as
// optional, its run view has no `deadline_at` (a case mock's adds it) and marks `answered` optional, and the run view of GET /api/mocks, a
// case mock's included, is the start's (server/drill.ts mockRunView) with its servings marked. These are checked one way.
type ServerRun = NonNullable<ServerMocks['run']>;
const readable: [(x: ServerReview) => MockReview, (x: ServerMocks) => MocksView, (x: ServerRun) => MockRunView] = [(x) => x, (x) => x, (x) => x];
void readable;

test('F4-2-3: the mock shapes are checked at type level (npm run typecheck): 8 pairs both ways, 3 from the server to the browser', () => {
  assert.deepEqual([sameShape.length, readable.length], [16, 3]);
});

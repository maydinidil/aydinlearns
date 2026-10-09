// tests/tools/check-fullmock-pool.test.ts: content check C46 (sprint 5b, Task B4 fix; ruling 8). The full mock of the entry in force today and every later entry
// asks no more questions than the held-out pool (active, core, keyed GA4 held-out items). It left the content load, so a short pool
// fails this check and the start route's refusal, and never stops the app loading. The stores here are invented stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFullMockPool } from '../../tools/check-content.ts';
import { parseGa4Exam } from '../../schemas/ga4-exam.ts';
import type { ContentStore } from '../../server/content.ts';

const WEIGHTS = { 'T-GA4-01': 1 };
const entry = (from: string, full: number) => ({
  from,
  mini_drill: { questions: 5, minutes: 10, pass_pct: 80, mode: 'practice' },
  half_mock: { questions: 10, minutes: 20, pass_pct: 80, mode: 'exam', retake_days: 21 },
  full_mock: { questions: full, minutes: 40, pass_pct: 80, mode: 'exam', retake_days: 21 },
});
const exam = (...entries: object[]) => parseGa4Exam({ topic_weights: WEIGHTS, blueprints: entries });
type Spec = { held?: boolean; status?: string; core?: boolean; keyed?: boolean; section?: string };
/** A stub store: `n` GA4 items shaped by `spec`, the exam config, nothing else. */
function stub(cfg: ReturnType<typeof exam> | undefined, n: number, spec: Spec = {}): ContentStore {
  const items = Array.from({ length: n }, (_, i) => ({ id: `Q-${i}`, section: spec.section ?? 'ga4', status: spec.status ?? 'active',
    exam_relevance: spec.core === false ? 'supporting' : 'core' }));
  return {
    ga4Exam: () => cfg, choiceItems: (s: string) => (s === 'ga4' ? items : []), heldOut: () => spec.held !== false,
    choiceKey: () => (spec.keyed === false ? undefined : {}),
  } as unknown as ContentStore;
}

test('C46 passes when the pool holds the full mock, and fails with the two counts when it is one short', () => {
  const cfg = exam(entry('2026-10-06', 20));
  const ok = checkFullMockPool(stub(cfg, 20));
  assert.deepEqual(ok.map((r) => [r.check, r.ok]), [['C46', true]]);
  const short = checkFullMockPool(stub(cfg, 19));
  assert.equal(short[0]!.ok, false);
  assert.match(short[0]!.detail, /20/);
  assert.match(short[0]!.detail, /19/);
});

test('C46 counts only active, core, keyed, held-out GA4 items', () => {
  const cfg = exam(entry('2026-10-06', 11));
  for (const spec of [{ held: false }, { status: 'retired' }, { core: false }, { keyed: false }, { section: 'methodology' }] as Spec[]) {
    assert.equal(checkFullMockPool(stub(cfg, 11, spec))[0]!.ok, false, JSON.stringify(spec));
  }
});

const TODAY = '2026-10-09';

test('C46 checks the entry in force today and every later one; an older entry only scores older runs', () => {
  const cfg = exam(entry('2026-09-01', 30), entry('2026-10-06', 12), entry('2026-11-01', 12));
  assert.deepEqual(checkFullMockPool(stub(cfg, 12), TODAY).map((r) => [r.check, r.ok, r.detail]), [['C46', true, '']]);
});

test('C46 fails an entry in force today with a short pool even when a later entry is fine, naming its date and counts', () => {
  const cfg = exam(entry('2026-10-06', 30), entry('2026-11-01', 12));
  const r = checkFullMockPool(stub(cfg, 12), TODAY);
  assert.equal(r[0]!.ok, false);
  assert.match(r[0]!.detail, /2026-10-06/);
  assert.match(r[0]!.detail, /asks 30 questions, more than the 12 of the held-out pool/);
  assert.doesNotMatch(r[0]!.detail, /2026-11-01/);
});

test('C46 fails a future-dated entry with a short pool, and names every failing entry', () => {
  const cfg = exam(entry('2026-10-06', 12), entry('2026-11-01', 40), entry('2026-12-01', 50));
  const r = checkFullMockPool(stub(cfg, 12), TODAY);
  assert.equal(r[0]!.ok, false);
  assert.match(r[0]!.detail, /2026-11-01/);
  assert.match(r[0]!.detail, /2026-12-01/);
  assert.doesNotMatch(r[0]!.detail, /2026-10-06/);
});

test('C46 checks the first entry when every entry is dated after today (a run keeps the oldest rules known)', () => {
  const cfg = exam(entry('2026-11-01', 30));
  assert.equal(checkFullMockPool(stub(cfg, 12), TODAY)[0]!.ok, false);
});

test('C46 has nothing to check with no exam file', () => {
  assert.deepEqual(checkFullMockPool(stub(undefined, 0)), []);
});

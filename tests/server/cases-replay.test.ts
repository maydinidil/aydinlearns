// tests/server/cases-replay.test.ts: Review Focus 1 of sprint 4b, for Task B2. A self_check or a case_export record changes no card,
// state, mastery window, error log or drill history: the smoke test's seeded history (tests/fixtures/replay/smoke-history-v2.json)
// replays to the same result with and without them, apart from the case status they feed, and gives the same drill history. The
// records name a real case (the level 1 opener), so the case status changes, and only in its self-check and export fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCHEMA_VERSION, type SelfCheck } from '../../core/envelope.ts';
import type { CaseExport } from '../../core/events.ts';
import { replay, type ReplayResult } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { drillRuns, loadDrills } from '../../server/drill.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { blockClose, instance, plus, snapshot } from '../helpers/replay-fixture.ts';

const fixture = JSON.parse(await readFile('tests/fixtures/replay/smoke-history-v2.json', 'utf8')) as {
  now: string; attempts: Record<string, unknown>[]; events: Record<string, unknown>[];
};
const content = await loadContent('content');
const catalog = buildCatalog(content);
const specs = await loadDrills();
const CASE_ID = 'CASE-VOLT-L1';
const replayed = (attempts: object[], events: object[]): ReplayResult => replay(attempts, events, replayOptions(catalog, new Date(fixture.now)));
const history = (attempts: object[], events: object[]) => drillRuns(attempts, events, (id) => content.item(id), specs);
/** Everything replay derives except the case status. */
const withoutCases = (r: ReplayResult) => { const { cases: _cases, ...rest } = snapshot(r); return rest; };

const times = fixture.attempts.map((r) => String(r.submitted_at ?? r.ts)).sort();
const mid = times[Math.floor(times.length / 2)]!;
const late = times.at(-1)!;
const selfCheck = (ts: string, kind: SelfCheck['kind'], over: Partial<SelfCheck> = {}): SelfCheck => ({
  record: 'self_check', schema_version: SCHEMA_VERSION, ts, session_id: 'S-V4', kind, phase: kind === 'sketch' ? 'opener_preview' : kind === 'explained_aloud' ? 'drill' : 'case',
  case_id: kind === 'explained_aloud' ? null : CASE_ID, item_instance_id: null, block_id: kind === 'explained_aloud' ? 'live-1' : null,
  text: kind === 'insight' ? 'Deeper discounts sold more.' : null, fields: kind === 'plan' || kind === 'sketch' ? { metric: 'average price' } : null, ticked: [], ...over,
});
// The seeded history has no drill run, so a short level 1 run after it is added on both sides: the drill history then has a run to compare.
const drillItems = (content.sqlItems?.() ?? []).filter((i) => i.use === 'drill' && i.level === 1 && i.status === 'active').slice(0, 2);
const drillStart = plus(late, 3600);
const drill = [...drillItems.flatMap((it, n) => instance({ id: `I-DRILL-${n}`, item: it.id, concept: it.target_concept_id, phase: 'drill', block: 'D-SMOKE', session: 'S-DRILL',
  start: plus(drillStart, n * 120), steps: [{ at: plus(drillStart, n * 120 + 60), submit: n === 0 ? 'pass' : 'fail' }] })), blockClose('D-SMOKE', plus(drillStart, 600))];
const attempts = [...fixture.attempts, ...drill];
const kinds: SelfCheck['kind'][] = ['sketch', 'plan', 'plan_check', 'insight', 'rubric', 'explained_aloud'];
const extra = [...kinds.map((k) => selfCheck(mid, k)), selfCheck(late, 'plan', { fields: { metric: 'a later plan' } })];
const exported: CaseExport = { event: 'case_export', schema_version: SCHEMA_VERSION, ts: late, case_id: CASE_ID,
  files: [`${CASE_ID}-2026-11-04.md`, `${CASE_ID}-2026-11-04.csv`], data_source: 'Fictional, generated data: Voltmarkt' };

test('the seeded history is the one Review Focus 1 names, and it has drill runs to compare', () => {
  assert.ok(content.case!(CASE_ID), 'the level 1 opener is a case of the store');
  assert.equal(drillItems.length, 2);
  assert.equal(history(attempts, fixture.events).length, 1, 'the history with the added run holds one drill run');
});
test('Review Focus 1: self_check and case_export records change no card, state, mastery window, error log or drill history', () => {
  const plain = replayed(attempts, fixture.events);
  const withRecords = replayed([...attempts, ...extra], [...fixture.events, exported]);
  assert.deepEqual(withoutCases(withRecords), withoutCases(plain), 'cards, instances, concepts (states and the last-4 window), blocks, sessions, mistake cards and warnings');
  assert.deepEqual(history([...attempts, ...extra], [...fixture.events, exported]), history(attempts, fixture.events), 'the drill history');
  // What they do change: the case's self-check and export fields, and nothing it derives from checkpoint attempts.
  const before = plain.cases.get(CASE_ID)!;
  const after = withRecords.cases.get(CASE_ID)!;
  assert.deepEqual({ ...after, started: before.started, sketch: null, plan: null, insight: null, exports: [] }, before);
  assert.deepEqual([after.started, after.sketch?.ts, after.plan?.fields, after.insight?.text, after.exports.map((e) => e.ts)],
    [true, new Date(mid).toISOString(), { metric: 'a later plan' }, 'Deeper discounts sold more.', [new Date(late).toISOString()]]);
});

// tests/web/drill-flow.test.ts: the drill screen's wording, countdown and states (design §14; rulings D9, D10, S2-42 to S2-44, S2-98; Task B16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../web/src/api.ts';
import {
  HELP_LINE, TIME_UP, clockLeft, countdownText, helpAllowed, levelLine, remainingSeconds, scoreLine, unseenLine, historyRows, HISTORY_COLUMNS,
  type DrillScoreView,
} from '../../web/src/lib/drill-flow.ts';

const score = (passed: number, unseen: number, over: Partial<DrillScoreView> = {}): DrillScoreView => ({
  passed, questions: 10, pct: passed * 10, run_passed: passed >= 9, unseen, unseen_pct: unseen * 10, counts_for_level: passed >= 9 && unseen >= 7, ...over,
});

test('the countdown shows minutes and seconds at 0, 59 and 1500 seconds', () => {
  assert.equal(clockLeft(0), '0:00');
  assert.equal(clockLeft(59), '0:59');
  assert.equal(clockLeft(754), '12:34');
  assert.equal(clockLeft(1500), '25:00');
  assert.equal(clockLeft(-3), '0:00');
  assert.equal(countdownText(754), 'Time left 12:34');
});

test('the remaining seconds round up and never go below 0', () => {
  const end = Date.parse('2026-10-04T10:20:00Z');
  assert.equal(remainingSeconds(end, end - 59_200), 60);
  assert.equal(remainingSeconds(end, end), 0);
  assert.equal(remainingSeconds(end, end + 5000), 0);
});

test('the level line names the questions, the minutes and the pass mark', () => {
  assert.equal(levelLine({ level: 1, questions: 10, minutes: 20, pass_pct: 90 }), 'Level 1 drill: 10 questions, 20 minutes, pass at 90%.');
  assert.equal(levelLine({ level: 2, questions: 10, minutes: 25, pass_pct: 90 }), 'Level 2 drill: 10 questions, 25 minutes, pass at 90%.');
});

test('the score line at the 90% boundary', () => {
  assert.equal(scoreLine(score(9, 9)), 'Score: 9 of 10 (90%). Passed.');
  assert.equal(scoreLine(score(8, 9)), 'Score: 8 of 10 (80%). Not passed.');
});

test('the unseen line at the 70% boundary', () => {
  const level = { kind: 'level' as const, unseen_min_pct: 70 };
  assert.equal(unseenLine(score(9, 9), level), 'Unseen items: 9 of 10. This run counts toward level completion.');
  assert.equal(unseenLine(score(9, 7), level), 'Unseen items: 7 of 10. This run counts toward level completion.');
  assert.equal(unseenLine(score(9, 6), level), 'This run does not count toward level completion: fewer than 7 of 10 items were unseen.');
  // Unseen enough, but the run did not pass: it still does not count, and the line says why.
  assert.match(unseenLine(score(8, 9), level), /^Unseen items: 9 of 10\. This run does not count toward level completion/);
  // A learner-chosen drill never counts.
  assert.match(unseenLine(score(10, 10), { kind: 'chosen', unseen_min_pct: 70 }), /^Unseen items: 10 of 10\. .*never counts/);
});

test('help is closed during the run and open in the review', () => {
  assert.equal(helpAllowed({ kind: 'choose' }), false);
  assert.equal(helpAllowed({ kind: 'running' }), false);
  assert.equal(helpAllowed({ kind: 'review' }), true);
  assert.equal(HELP_LINE, 'Help opens in the end-of-run review.');
  assert.equal(TIME_UP, 'Time is up.');
});

test('the history table has the four columns and one row per run', () => {
  assert.deepEqual(HISTORY_COLUMNS, ['Date', 'Score', 'Passed', 'Unseen']);
  const rows = historyRows([{ block_id: 'b', kind: 'level', level: 1, date: '2026-10-03', ...score(9, 8) }]);
  assert.deepEqual(rows, [{ key: 'b', cells: ['2026-10-03', '9 of 10 (90%)', 'Yes', '8 of 10'] }]);
});

test('the drill calls use the drill routes', async (t) => {
  const calls: { path: string; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    calls.push({ path, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return new Response('{}', { status: 200 });
  });
  await api.drillStart({ level: 1 });
  await api.drillStart({ concept_ids: ['A'] });
  await api.drillEnd('b1');
  await api.drillHistory();
  await api.drillHistory(2);
  assert.deepEqual(calls.map((c) => c.path), ['/api/drill/start', '/api/drill/start', '/api/drill/end', '/api/drill/history', '/api/drill/history?level=2']);
  assert.deepEqual(calls[2]!.body, { block_id: 'b1' });
});

// ---- fix round 1 ----
import { ApiError } from '../../web/src/api.ts';
import { EndGuard, endWithRetry, hiddenFlags, runFromRefusal, stopHandler } from '../../web/src/lib/drill-flow.ts';

test('a refused start (409) keeps the body, and a body with a running run resumes it', async (t) => {
  const run = { block_id: 'b', kind: 'level', level: 1, phase: 'drill', questions: 1, minutes: 20, pass_pct: 90, unseen_min_pct: 70, ends_at: '2026-10-04T10:00:00Z',
    hide_labels: true, servings: [{ item_id: 'I', item_instance_id: 'x' }] };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'A drill is already running.', run }), { status: 409 }));
  const e = await api.drillStart({ level: 1 }).catch((x: unknown) => x);
  assert.ok(e instanceof ApiError);
  assert.deepEqual(runFromRefusal(e)?.servings, run.servings);
  assert.equal(runFromRefusal(new ApiError('x', 409)), null);
  assert.equal(runFromRefusal(new ApiError('x', 404)), null);
  assert.equal(runFromRefusal(new Error('x')), null);
});

test('every question panel stays mounted: only the current one is shown, so drafts survive moving between questions', () => {
  assert.deepEqual(hiddenFlags(3, 1), [true, false, true]);
});

test('an override or answer refused as closed under a run calls onStopped, not the reopen', () => {
  const calls: string[] = [];
  const run = { onStopped: () => calls.push('stopped') };
  stopHandler(run, () => calls.push('reopen'))();
  stopHandler(undefined, () => calls.push('reopen'))();
  assert.deepEqual(calls, ['stopped', 'reopen']);
});

test('a second end after the run ended is ignored, and a failed end may try again', () => {
  const g = new EndGuard();
  assert.equal(g.begin(), true);
  assert.equal(g.begin(), false, 'one end at a time');
  g.failed();
  assert.equal(g.begin(), true);
  g.done();
  assert.equal(g.begin(), false, 'ended: the late end is ignored');
});

test('the end retries a few times with a pause, then gives up with the error', async () => {
  let n = 0;
  const waits: number[] = [];
  const ok = await endWithRetry(async () => { if (++n < 3) throw new Error('down'); return 'done'; }, async (ms) => { waits.push(ms); });
  assert.equal(ok, 'done');
  assert.deepEqual(waits, [500, 1500]);
  await assert.rejects(endWithRetry(async () => { throw new Error('still down'); }, async () => {}), /still down/);
});

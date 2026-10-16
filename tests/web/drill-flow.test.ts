// tests/web/drill-flow.test.ts: the drill screen's wording, countdown and states (design §14; rulings D9, D10, S2-42 to S2-44, S2-98; Task B16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../web/src/api.ts';
import {
  HELP_LINE, TIME_UP, clockLeft, countdownText, helpAllowed, levelLine, remainingSeconds, scoreLine, unseenLine, historyRows, HISTORY_COLUMNS,
  SCREEN_BANNER, SCREEN_MODE_HINT, SCREEN_MODE_LABEL, startBody, type DrillScoreView, NOT_ANSWERED_LINE, outcomeClass, questionLabel, reviewOutcomes, showsEditor,
  type DrillQuestionOutcome,
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
  assert.equal(levelLine({ level: 1, questions: 10, minutes: 20, pass_pct: 90 }, 'Foundations: one table'), 'Level 1, Foundations: one table. 10 questions, 20 minutes, pass at 90%.');
  assert.equal(levelLine({ level: 2, questions: 10, minutes: 25, pass_pct: 90 }, 'Joins'), 'Level 2, Joins. 10 questions, 25 minutes, pass at 90%.');
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

test('the history table has seven columns, the mode (S4B-23) and "Explained aloud" (D50) among them, and one row per run', () => {
  assert.deepEqual(HISTORY_COLUMNS, ['Date', 'Drill', 'Mode', 'Score', 'Passed', 'Unseen', 'Explained aloud']);
  const rows = historyRows([
    { block_id: 'b', kind: 'level', level: 1, date: '2026-10-03', screen_mode: false, ...score(9, 8) },
    { block_id: 's', kind: 'level', level: 1, date: '2026-10-04', screen_mode: true, ...score(10, 7) },
  ], '2026-10-09');
  assert.deepEqual(rows, [
    { key: 'b', cells: ['3 October', 'Level 1', 'Normal', '9 of 10 (90%)', 'Yes', '8 of 10'], tick: null },
    { key: 's', cells: ['4 October', 'Level 1', 'Screen mode', '10 of 10 (100%)', 'Yes', '7 of 10'], tick: null },
  ]);
});

test('S4B-22: the screen mode banner and the choice offered at the start, in plain words', () => {
  assert.equal(SCREEN_BANNER, 'Screen mode: no autocomplete, and types and rounding are checked as an online test does');
  assert.equal(SCREEN_MODE_LABEL, 'Screen mode');
  assert.ok(!/—/.test(SCREEN_BANNER + SCREEN_MODE_HINT), 'no em dash');
  assert.match(SCREEN_MODE_HINT, /same questions, time limit and pass mark/);
});

test('S4B-23: a drill start sends screen_mode only when it is chosen', async (t) => {
  const bodies: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (_path: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  });
  await api.drillStart(startBody({ level: 2 }, true));
  await api.drillStart(startBody({ concept_ids: ['A'] }, true));
  await api.drillStart(startBody({ level: 1 }, false));
  assert.deepEqual(bodies, [{ level: 2, screen_mode: true }, { concept_ids: ['A'], screen_mode: true }, { level: 1 }]);
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

// ---- Task E4: live reps (S4B-26, D42) ----
import {
  EXPLAINED_ALOUD_LABEL, LIVE_REP_HINT, LIVE_REP_LABEL, isLiveRun, liveRepLine, liveSelfCheckBody,
} from '../../web/src/lib/drill-flow.ts';
import { liveRepStart, tickExplainedAloud } from '../../web/src/lib/live-rep-api.ts';

test('S4B-26: a live block is told by its ID; the wording is plain and short', () => {
  assert.equal(isLiveRun('live-3f2a'), true);
  assert.equal(isLiveRun('3f2a-live-'), false);
  assert.equal(LIVE_REP_LABEL, 'Live rep');
  assert.match(LIVE_REP_HINT, /10 minutes/);
  assert.match(LIVE_REP_HINT, /screen mode/i);
  assert.equal(EXPLAINED_ALOUD_LABEL, 'I explained my answer aloud');
  for (const t of [LIVE_REP_HINT, EXPLAINED_ALOUD_LABEL, liveRepLine(true, true), liveRepLine(true, false), liveRepLine(false, true)]) {
    assert.ok(!t.includes('—'), 'no em dash');
    assert.ok(!/\b(he|she|his|her)\b/i.test(t), 'no gendered pronoun');
  }
});

test('D42: the end line says passed with the item passed and the tick, logged only without the tick, and not passed with the item failed', () => {
  assert.equal(liveRepLine(true, true), 'Live rep passed.');
  assert.match(liveRepLine(true, false), /^Logged only/);
  assert.match(liveRepLine(true, false), /explained aloud/);
  assert.match(liveRepLine(false, true), /^Logged\. The exercise was not passed/);
  assert.match(liveRepLine(false, false), /not passed/);
});

test('the explained-aloud request names the block and a boolean, nothing else', () => {
  assert.deepEqual(liveSelfCheckBody('live-1', true), { block_id: 'live-1', ticked: true });
  assert.deepEqual(liveSelfCheckBody('live-1', false), { block_id: 'live-1', ticked: false });
});

test('the history lists a live rep as "Live rep", and passed, logged only or no', () => {
  const row = (block_id: string, run_passed: boolean, passed: number) => ({ block_id, kind: 'live_rep' as const, level: null, date: '2026-10-08', screen_mode: true,
    explained_aloud: run_passed, passed, questions: 1, pct: passed * 100, run_passed, unseen: 1, unseen_pct: 100, counts_for_level: false });
  assert.deepEqual(historyRows([row('a', true, 1), row('b', false, 1), row('c', false, 0)]).map((r) => [r.cells[2], r.cells[4]]),
    [['Live rep', 'Yes'], ['Live rep', 'Logged only'], ['Live rep', 'No']]);
});

test('the live rep calls go through apiCall to the drill module', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    await liveRepStart();
    await tickExplainedAloud('live-9', true);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace(/^https?:\/\/[^/]+/, ''), c.body]),
    [['POST', '/api/drill/live/start', {}], ['POST', '/api/drill/self-check', { block_id: 'live-9', ticked: true }]]);
});

// ---- Sprint 4c, Task B1: D50, the "Explained aloud" box on a live rep's history row ----
import {
  applyTick, historyTickDisabled, historyTickSaves, historyTickName, tickFromHistory, type HistoryRun,
} from '../../web/src/lib/drill-flow.ts';

const liveRun = (block_id: string, itemPassed: boolean, explained: boolean): HistoryRun => ({ block_id, kind: 'live_rep', level: null, date: '2026-10-08', screen_mode: true,
  explained_aloud: explained, passed: itemPassed ? 1 : 0, questions: 1, pct: itemPassed ? 100 : 0, run_passed: itemPassed && explained, unseen: 1, unseen_pct: 100, counts_for_level: false });
const levelRun: HistoryRun = { block_id: 'lvl', kind: 'level', level: 1, date: '2026-10-07', screen_mode: false, ...score(9, 8) };

test('D50: only a live rep\'s row has the box; it shows the server\'s tick and is named by the column and the date', () => {
  const rows = historyRows([liveRun('live-a', true, false), levelRun, liveRun('live-b', true, true)]);
  assert.deepEqual(rows.map((r) => r.tick), [
    { block_id: 'live-a', checked: false, name: 'Explained aloud: live rep on 2026-10-08' },
    null,
    { block_id: 'live-b', checked: true, name: 'Explained aloud: live rep on 2026-10-08' },
  ]);
  assert.deepEqual(rows.map((r) => r.cells.length), [6, 6, 6], 'six text cells; the box is the seventh column');
  assert.ok(historyTickName('2026-10-08').startsWith(HISTORY_COLUMNS[6]), 'the name starts with the visible column header (WCAG 2.5.3)');
  const noField = { ...liveRun('live-c', false, false) } as Partial<HistoryRun>;
  delete noField.explained_aloud;
  assert.equal(historyRows([noField as HistoryRun])[0]!.tick!.checked, false, 'a row without the field reads as not ticked');
});

test('D50: a tick flips the row\'s Passed cell from "Logged only" to "Yes", an untick takes it back; a failed exercise stays "No"', () => {
  const passedCell = (runs: HistoryRun[], key: string) => historyRows(runs).find((r) => r.key === key)!.cells[4];
  const runs = [liveRun('live-a', true, false), levelRun, liveRun('live-f', false, false)];
  assert.equal(passedCell(runs, 'live-a'), 'Logged only');
  const ticked = applyTick(runs, 'live-a', true);
  assert.equal(passedCell(ticked, 'live-a'), 'Yes');
  assert.equal(ticked.find((r) => r.block_id === 'live-a')!.explained_aloud, true);
  assert.deepEqual(ticked[1], levelRun, 'other rows are untouched');
  assert.equal(passedCell(applyTick(ticked, 'live-a', false), 'live-a'), 'Logged only');
  const failed = applyTick(runs, 'live-f', true);
  assert.equal(passedCell(failed, 'live-f'), 'No', 'D42: the exercise must pass too');
  assert.equal(failed.find((r) => r.block_id === 'live-f')!.explained_aloud, true);
  assert.deepEqual(applyTick(runs, 'lvl', true), runs, 'a level run has no tick');
});

test('D50: ticking from the history posts one self-check for the row\'s block, and the row follows the server\'s answer', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url).replace(/^https?:\/\/[^/]+/, ''), method: init.method ?? 'GET', body });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  let runs = [liveRun('live-a', true, false), levelRun];
  try {
    runs = (await tickFromHistory('live-a', true, tickExplainedAloud))(runs);
    assert.deepEqual(calls, [{ url: '/api/drill/self-check', method: 'POST', body: { block_id: 'live-a', ticked: true } }], 'one self-check, nothing else');
    assert.equal(historyRows(runs)[0]!.cells[4], 'Yes');
    assert.equal(historyRows(runs)[0]!.tick!.checked, true);
    runs = (await tickFromHistory('live-a', false, tickExplainedAloud))(runs);
    assert.deepEqual(calls[1]!.body, { block_id: 'live-a', ticked: false });
    assert.equal(historyRows(runs)[0]!.cells[4], 'Logged only');
  } finally { globalThis.fetch = real; }
});

test('D50: a refused tick changes no row', async () => {
  const refused = async (): Promise<{ block_id: string; ticked: boolean }> => { throw new ApiError('The rep is still running. Tick this when it has ended.', 409); };
  await assert.rejects(tickFromHistory('live-a', true, refused), /still running/);
});

test('D50: the box is disabled while a run is on or starting, and before the screen knows whether one is on; never while its own tick saves (F2 I1)', () => {
  const free = { state: { kind: 'choose' } as const, runKnown: true, busy: false, saving: false };
  assert.equal(historyTickDisabled(free), false);
  assert.equal(historyTickDisabled({ ...free, state: { kind: 'running' } }), true, 'a rep runs');
  assert.equal(historyTickDisabled({ ...free, busy: true }), true, 'a start is on its way');
  assert.equal(historyTickDisabled({ ...free, runKnown: false }), true, 'the run in progress is not known yet');
  assert.equal(historyTickDisabled({ ...free, saving: true }), false, 'a tick being saved keeps the box enabled, so it keeps keyboard focus');
  assert.equal(historyTickSaves({ saving: false }), true);
  assert.equal(historyTickSaves({ saving: true }), false, 'a second click while a tick saves is ignored');
});

// ---- H3: the review marks each question by outcome ----

const servings = [1, 2, 3, 4].map((n) => ({ item_id: `I${n}`, item_instance_id: `inst-${n}` }));

test('H3: the review lines the end reply\'s marks up with the run\'s questions by instance, whatever the reply\'s order', () => {
  const items: DrillQuestionOutcome[] = [
    { item_instance_id: 'inst-3', item_id: 'I3', outcome: 'failed' }, { item_instance_id: 'inst-1', item_id: 'I1', outcome: 'passed' },
    { item_instance_id: 'inst-2', item_id: 'I2', outcome: 'not_answered' }, { item_instance_id: 'inst-4', item_id: 'I4', outcome: 'passed' },
  ];
  assert.deepEqual(reviewOutcomes(servings, items), ['passed', 'not_answered', 'failed', 'passed']);
});

test('H3: a reply with no marks, or none for a question, marks nothing wrong: the question reads as unknown', () => {
  assert.deepEqual(reviewOutcomes(servings, undefined), [null, null, null, null]);
  assert.deepEqual(reviewOutcomes(servings, [{ item_instance_id: 'inst-2', item_id: 'I2', outcome: 'passed' }]), [null, 'passed', null, null]);
});

test('H3: a square on the question strip says its outcome in words, not colour only', () => {
  assert.equal(questionLabel(0, 'passed'), 'Question 1: Passed');
  assert.equal(questionLabel(1, 'failed'), 'Question 2: Not passed');
  assert.equal(questionLabel(2, 'not_answered'), 'Question 3: Not answered');
  assert.equal(questionLabel(3, null), 'Question 4', 'while running, or when the outcome is not known');
  assert.equal(outcomeClass('passed'), 'q-passed');
  assert.equal(outcomeClass('failed'), 'q-failed');
  assert.equal(outcomeClass('not_answered'), 'q-not-answered');
  assert.equal(outcomeClass(null), '');
});

test('H3: an unanswered question reads "Not answered" and shows no editor; a passed, failed or unknown one shows what it shows today', () => {
  assert.equal(NOT_ANSWERED_LINE, 'Not answered');
  assert.equal(showsEditor('not_answered'), false);
  for (const o of ['passed', 'failed', null] as const) assert.equal(showsEditor(o), true, String(o));
});

// ---- the cumulative drill (sprint 6 Task B4; S6-19) ----
import {
  CUMULATIVE_LABEL, CUMULATIVE_NAME, cumulativeRule, fillLines, isCumulativeRun, type CumulativeOffer,
} from '../../web/src/lib/drill-flow.ts';
import { drillKindText } from '../../web/src/lib/polish-p2b.ts';

const OFFER: CumulativeOffer = { id: 'cumulative-1-4', levels: [1, 2, 3, 4], questions: 12, minutes: 30, pass_pct: 80, unseen_min_pct: 70, available: true, overall: { questions: 12, from_seen: 0, unseen_pct: 100 },
  fill: [{ level: 1, wanted: 3, taken: 3, from_seen: 0 }, { level: 2, wanted: 3, taken: 3, from_seen: 0 }, { level: 3, wanted: 3, taken: 3, from_seen: 0 }, { level: 4, wanted: 3, taken: 3, from_seen: 0 }] };

test('S6-19: the drill screen names the cumulative drill and states its rule in the brief\'s words', () => {
  assert.equal(CUMULATIVE_LABEL, 'Cumulative drill, levels 1 to 4 (screen mode)');
  assert.equal(cumulativeRule(OFFER),
    '12 questions from levels 1 to 4, 30 minutes, pass at 80%. Screen mode: no autocomplete, and types and rounding are checked as an online test does.');
  assert.equal(cumulativeRule({ ...OFFER, levels: [1, 2, 3], questions: 9, minutes: 25, pass_pct: 75 }),
    '9 questions from levels 1 to 3, 25 minutes, pass at 75%. Screen mode: no autocomplete, and types and rounding are checked as an online test does.');
  assert.ok(!/—/.test(cumulativeRule(OFFER)), 'no em dash');
});

test('S6-19: a cum- block is a cumulative run; the history names it and its unseen line never mentions level credit as earned', () => {
  assert.equal(isCumulativeRun('cum-1234'), true);
  assert.equal(isCumulativeRun('live-1234'), false);
  assert.equal(isCumulativeRun('1234-cum-'), false);
  assert.equal(CUMULATIVE_NAME, 'Cumulative drill');
  assert.equal(drillKindText({ kind: 'cumulative', level: null }), 'Cumulative drill');
  assert.match(unseenLine(score(10, 9, { questions: 12 }), { kind: 'cumulative', unseen_min_pct: 70 }), /^Unseen items: 9 of 12\. A cumulative drill never counts toward level completion\.$/);
  const rows = historyRows([{ block_id: 'cum-a', kind: 'cumulative', level: null, date: '2026-10-05', screen_mode: true, ...score(10, 9, { questions: 12, pct: 83, run_passed: true, counts_for_level: false }) }], '2026-10-06');
  assert.deepEqual([rows[0]!.cells[1], rows[0]!.cells[2], rows[0]!.cells[3], rows[0]!.cells[4]], ['Cumulative drill', 'Screen mode', '10 of 12 (83%)', 'Yes']);
  assert.equal(rows[0]!.tick, null);
});

test('S6-19: a level that gave seen items or came up short says so, level by level, and a full draw says nothing', () => {
  assert.deepEqual(fillLines(OFFER.fill), []);
  assert.deepEqual(fillLines([
    { level: 1, wanted: 3, taken: 3, from_seen: 0 }, { level: 2, wanted: 3, taken: 3, from_seen: 1 }, { level: 3, wanted: 3, taken: 3, from_seen: 3 },
    { level: 4, wanted: 3, taken: 0, from_seen: 0 }, { level: 5, wanted: 3, taken: 2, from_seen: 0 },
  ]), [
    'Level 2: 1 of 3 questions come from exercises you have seen before.',
    'Level 3: 3 of 3 questions come from exercises you have seen before.',
    'Level 4: no exercises are written yet, so it adds no questions.',
    'Level 5: only 2 of 3 questions are available.',
  ]);
});

test('S6-19: api.drillCumulativeStart posts to the cumulative route with no body fields', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{"block_id":"cum-1"}', { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  try { await api.drillCumulativeStart(); } finally { globalThis.fetch = real; }
  assert.equal(calls[0]!.url, '/api/drill/cumulative/start');
  assert.equal(calls[0]!.init.method, 'POST');
});

import { runTitle } from '../../web/src/lib/drill-flow.ts';
test('S6-19: a run\'s heading names a level, the cumulative drill or a chosen drill, in the run and in its review', () => {
  assert.equal(runTitle({ kind: 'level', level: 2 }), 'Level 2 drill');
  assert.equal(runTitle({ kind: 'level', level: 2 }, true), 'Level 2 drill: review');
  assert.equal(runTitle({ kind: 'cumulative', level: null }), 'Cumulative drill');
  assert.equal(runTitle({ kind: 'cumulative', level: null }, true), 'Cumulative drill: review');
  assert.equal(runTitle({ kind: 'chosen', level: null }), 'Drill on chosen concepts');
  assert.equal(runTitle({ kind: 'chosen', level: null }, true), 'Drill review');
});

import { overallLine } from '../../web/src/lib/drill-flow.ts';
test('P15: one overall line when the run is below its unseen floor, built from the server numbers; none at or above it', () => {
  assert.equal(overallLine({ questions: 12, from_seen: 5, unseen_pct: 58 }, 70),
    '5 of 12 questions are ones you have seen before (the drill aims for at most 30%).');
  assert.equal(overallLine({ questions: 12, from_seen: 6, unseen_pct: 50 }, 70),
    '6 of 12 questions are ones you have seen before (the drill aims for at most 30%).');
  assert.equal(overallLine({ questions: 10, from_seen: 3, unseen_pct: 70 }, 70), null, 'exactly at the floor');
  assert.equal(overallLine({ questions: 12, from_seen: 0, unseen_pct: 100 }, 70), null);
  assert.equal(overallLine({ questions: 12, from_seen: 4, unseen_pct: 67 }, 80), '4 of 12 questions are ones you have seen before (the drill aims for at most 20%).');
  assert.equal(overallLine(undefined, 70), null);
  assert.equal(overallLine({ questions: 0, from_seen: 0, unseen_pct: 100 }, 70), null);
  assert.deepEqual(fillLines(OFFER.fill), [], 'the per-level lines stay as they were');
});

test('K2: the Cumulative heading renders only when the server offers a cumulative drill', async () => {
  const { cumulativeHeading, CUMULATIVE_NAME } = await import('../../web/src/lib/drill-flow.ts');
  assert.equal(cumulativeHeading([]), null, 'no offer, no heading');
  const offer = { id: 'cumulative-1-4', levels: [1, 2, 3, 4], questions: 12, minutes: 30, pass_pct: 80, unseen_min_pct: 70, available: false, fill: [], overall: { questions: 0, from_seen: 0, unseen_pct: 100 } };
  assert.equal(cumulativeHeading([offer]), CUMULATIVE_NAME, 'an offer, even one that is not open yet, has its heading');
});

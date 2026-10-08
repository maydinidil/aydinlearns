// tests/core/replay-cases.test.ts: Task B2 of sprint 4b. Replay derives each case's status from its checkpoint attempts (S4B-08):
// each checkpoint's latest answer and whether it has a pass, `solved`, `score` and `solved_at`; and from the self_check and
// case_export records (S4B-09, S4B-13): the day-1 sketch, the latest plan, the latest insight and the exports. Every case here is
// invented, and so is every record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SelfCheck } from '../../core/envelope.ts';
import type { ReplayCase, ReplayCatalog, ReplayResult } from '../../core/replay.ts';
import { A, C, instance, override, primed, run, sessionEnd, sessionStart, testCatalog, type Log } from '../helpers/replay-fixture.ts';

const OPENER = 'CASE-FAKE-L1';           // CP3 and CP4 only, as the level 1 and 2 openers: no CP1
const INBOX = 'CASE-FAKE-01';            // CP1, CP3, CP4 and CP6 (CP6 is never auto-graded)
const CASES: ReplayCase[] = [
  { case_id: OPENER, checkpoints: [{ kind: 'CP3', item_id: 'EX-OPENER-L1-02' }, { kind: 'CP4', item_id: `${OPENER}:CP4` }] },
  { case_id: INBOX, checkpoints: [{ kind: 'CP1', item_id: `${INBOX}:CP1` }, { kind: 'CP3', item_id: 'EX-CASE-FAKE-01' }, { kind: 'CP4', item_id: `${INBOX}:CP4` }] },
];
/** The replay tests' catalog with two cases. A case's CP1 and CP4 credit nothing (S2-106) except INBOX's CP4, which credits C. */
const catalog: ReplayCatalog = {
  ...testCatalog,
  familyOf: (id, kind) => (id.startsWith('CASE-') || id.startsWith('EX-CASE-') ? 'checkpoint' : testCatalog.familyOf(id, kind)),
  creditsOf: (id) => (id === `${INBOX}:CP4` ? [C] : id.startsWith('CASE-') ? [] : id.startsWith('EX-CASE-') ? [A] : testCatalog.creditsOf(id)),
  cases: () => CASES,
};
const replayed = (log: Log): ReplayResult => run(log, { catalog });
const statusOf = (log: Log, caseId: string) => replayed(log).cases.get(caseId)!;
const d1 = (hms: string) => `2026-11-02T${hms}.000Z`;   // replay reports every time as an ISO string with milliseconds
const d2 = (hms: string) => `2026-11-05T${hms}.000Z`;
const cp3 = (id: string, at: string, steps: Parameters<typeof instance>[0]['steps'], over: Partial<Parameters<typeof instance>[0]> = {}) =>
  instance({ id, item: 'EX-OPENER-L1-02', concept: A, phase: 'case', start: at, steps, ...over });
const typed = (id: string, item: string, at: string, steps: Parameters<typeof instance>[0]['steps'], over: Partial<Parameters<typeof instance>[0]> = {}) =>
  instance({ id, item, concept: A, kind: 'typed', phase: 'case', start: at, steps, close: { at: steps.at(-1)!.at, reason: steps.some((s) => 'submit' in s && s.submit === 'pass') ? 'pass' : 'left' }, ...over });
const selfCheck = (ts: string, kind: SelfCheck['kind'], over: Partial<SelfCheck> = {}): SelfCheck => ({
  record: 'self_check', schema_version: 4, ts, session_id: 'S1', kind, phase: kind === 'sketch' ? 'opener_preview' : 'case', case_id: OPENER,
  item_instance_id: null, block_id: null, text: null, fields: null, ticked: [], ...over,
});

test('every case of the catalog has a status, in the catalog\'s order; a case with no records is new, unsolved and scores 0', () => {
  const r = replayed({ attempts: [], events: [] });
  assert.deepEqual([...r.cases.keys()], [OPENER, INBOX]);
  const s = r.cases.get(INBOX)!;
  assert.deepEqual(s, {
    case_id: INBOX, started: false, solved: false, score: 0, solved_at: null, sketch: null, plan: null, insight: null, exports: [],
    checkpoints: CASES[1]!.checkpoints.map((c) => ({ kind: c.kind, item_id: c.item_id, latest: null, latest_pass: null, latest_own_pass: null, passed: false, passed_at: null })),
  });
});
test('a catalog without cases() gives no case statuses', () => {
  assert.equal(run({ attempts: [], events: [] }).cases.size, 0);
});

// ---- S4B-08, one test per clause ---------------------------------------------------------------------------------------
test('S4B-08: solved across two sessions; the score is the share of its checkpoints with a pass, the solve time the last one\'s', () => {
  const first: Log = {
    attempts: cp3('I-CP3', d1('09:00:00'), [{ at: d1('09:05:00'), submit: 'pass', id: 'A-CP3' }], { session: 'S1' }),
    events: [sessionStart('S1', d1('08:59:00')), sessionEnd('S1', d1('09:30:00'))],
  };
  const half = statusOf(first, OPENER);
  assert.deepEqual([half.started, half.solved, half.score, half.solved_at], [true, false, 0.5, null], 'CP3 alone: half the checkpoints');
  assert.deepEqual(half.checkpoints.map((c) => [c.kind, c.passed, c.passed_at]), [['CP3', true, d1('09:05:00')], ['CP4', false, null]]);
  const both: Log = {
    attempts: [...first.attempts, ...typed('I-CP4', `${OPENER}:CP4`, d2('10:00:00'), [{ at: d2('10:01:00'), submit: 'pass', id: 'A-CP4' }], { session: 'S2' })],
    events: [...first.events, sessionStart('S2', d2('09:59:00')), sessionEnd('S2', d2('10:30:00'))],
  };
  const done = statusOf(both, OPENER);
  assert.deepEqual([done.solved, done.score, done.solved_at], [true, 1, d2('10:01:00')], 'solved when the last missing checkpoint passed, a session later');
});
test('S4B-08: a failed then passed checkpoint has a pass, from the later instance; its latest answer is the pass', () => {
  const wrong = typed('I-CP4-1', `${OPENER}:CP4`, d1('10:00:00'), [{ at: d1('10:01:00'), submit: 'fail', id: 'A-WRONG' }]);
  const once = statusOf({ attempts: wrong, events: [] }, OPENER).checkpoints[1]!;
  assert.deepEqual([once.passed, once.passed_at, once.latest?.attempt_id, once.latest?.passed, once.latest_pass], [false, null, 'A-WRONG', false, null]);
  const right = typed('I-CP4-2', `${OPENER}:CP4`, d1('11:00:00'), [{ at: d1('11:02:00'), submit: 'pass', id: 'A-RIGHT' }]);
  const twice = statusOf({ attempts: [...wrong, ...right], events: [] }, OPENER).checkpoints[1]!;
  assert.deepEqual([twice.passed, twice.passed_at, twice.latest?.attempt_id, twice.latest?.instance_id, twice.latest?.passed, twice.latest_pass?.attempt_id],
    [true, d1('11:02:00'), 'A-RIGHT', 'I-CP4-2', true, 'A-RIGHT']);
  // A wrong answer after the pass is the latest answer; the checkpoint keeps its pass and its pass time.
  const again = typed('I-CP4-3', `${OPENER}:CP4`, d1('12:00:00'), [{ at: d1('12:01:00'), submit: 'fail', id: 'A-LATER' }]);
  const later = statusOf({ attempts: [...wrong, ...right, ...again], events: [] }, OPENER).checkpoints[1]!;
  assert.deepEqual([later.passed, later.passed_at, later.latest?.attempt_id, later.latest?.passed, later.latest_pass?.attempt_id], [true, d1('11:02:00'), 'A-LATER', false, 'A-RIGHT']);
});
test('S4B-08: a case with no CP1 is solved by its CP3 and CP4; a case that lists a CP1 needs it too', () => {
  const attempts = [
    ...cp3('I-O3', d1('09:00:00'), [{ at: d1('09:01:00'), submit: 'pass' }]),
    ...typed('I-O4', `${OPENER}:CP4`, d1('09:10:00'), [{ at: d1('09:11:00'), submit: 'pass' }]),
    ...instance({ id: 'I-B3', item: 'EX-CASE-FAKE-01', concept: A, phase: 'case', start: d1('10:00:00'), steps: [{ at: d1('10:01:00'), submit: 'pass' }] }),
    ...typed('I-B4', `${INBOX}:CP4`, d1('10:10:00'), [{ at: d1('10:11:00'), submit: 'pass' }]),
  ];
  const r = replayed({ attempts, events: [] });
  assert.deepEqual([r.cases.get(OPENER)!.solved, r.cases.get(OPENER)!.score], [true, 1], 'no CP1 listed: none needed');
  const inbox = r.cases.get(INBOX)!;
  assert.deepEqual([inbox.solved, inbox.score, inbox.solved_at], [false, 2 / 3, null], 'CP1 listed and unanswered');
  const cp1 = instance({ id: 'I-B1', item: `${INBOX}:CP1`, concept: A, kind: 'mcq', phase: 'case', start: d1('11:00:00'),
    steps: [{ at: d1('11:00:30'), submit: 'pass' }], close: { at: d1('11:00:30'), reason: 'pass' } });
  const solved = statusOf({ attempts: [...attempts, ...cp1], events: [] }, INBOX);
  assert.deepEqual([solved.solved, solved.score, solved.solved_at], [true, 1, d1('11:00:30')]);
});
test('S4B-08 with S2-105: a CP4 answered wrong, then right in a later assisted instance, still makes the case solved; its rating keeps the §5 rule', () => {
  // C's card is rated first, so the reveal's Again has a card to land on (design §5, the case-checkpoint table).
  const attempts = [
    ...primed(C, '2026-11-01'),
    ...instance({ id: 'I-B1', item: `${INBOX}:CP1`, concept: A, kind: 'mcq', phase: 'case', start: d1('09:00:00'), steps: [{ at: d1('09:00:30'), submit: 'pass' }] }),
    ...instance({ id: 'I-B3', item: 'EX-CASE-FAKE-01', concept: A, phase: 'case', start: d1('09:10:00'), steps: [{ at: d1('09:12:00'), submit: 'pass' }] }),
    ...typed('I-B4-1', `${INBOX}:CP4`, d1('10:00:00'), [{ at: d1('10:01:00'), submit: 'fail' }], { concept: C }),
    // S2-105: the value was shown by the wrong answer, so the CP4 route logs "answer shown" before the next graded attempt.
    ...typed('I-B4-2', `${INBOX}:CP4`, d2('10:00:00'), [{ at: d2('10:00:10'), solution: true }, { at: d2('10:01:00'), submit: 'pass', id: 'A-ASSISTED' }], { concept: C }),
  ];
  const r = replayed({ attempts, events: [] });
  const s = r.cases.get(INBOX)!;
  assert.deepEqual([s.solved, s.score, s.solved_at], [true, 1, d2('10:01:00')], 'a pass after a reveal counts toward solving');
  assert.deepEqual(s.checkpoints.find((c) => c.kind === 'CP4')!.latest_pass?.attempt_id, 'A-ASSISTED');
  const assisted = r.instances.get('I-B4-2')!;
  assert.deepEqual([assisted.countsAsPass, assisted.rating, assisted.card_reviews.map((c) => c.card_id)], [false, 1, [`CARD-${C}`]],
    'not a counted pass; Again for the credited concept, as a reveal before any attempt rates (design §5)');
});

// ---- Seams M2: which pass is the learner's own -----------------------------------------------------------------------------
test('Seams M2: an answer is assisted when "show answer" or a hint at level 2 or higher came before it in its instance', () => {
  const own = cp3('I-OWN', d1('09:00:00'), [{ at: d1('09:00:30'), hint: 1 }, { at: d1('09:02:00'), submit: 'pass', id: 'A-OWN' }]);
  const shown = cp3('I-SHOWN', d1('10:00:00'), [{ at: d1('10:00:30'), solution: true }, { at: d1('10:02:00'), submit: 'pass', id: 'A-SHOWN' }]);
  const hinted = cp3('I-HINT2', d1('11:00:00'), [{ at: d1('11:00:30'), hint: 2 }, { at: d1('11:02:00'), submit: 'pass', id: 'A-HINT2' }]);
  const hint3 = cp3('I-HINT3', d1('12:00:00'), [{ at: d1('12:00:30'), hint: 3 }, { at: d1('12:02:00'), submit: 'pass', id: 'A-HINT3' }]);
  // Help after the pass, in the same instance, does not reach back: the fail before the reveal is not assisted either.
  const late = cp3('I-LATE', d1('13:00:00'), [{ at: d1('13:01:00'), submit: 'pass', id: 'A-LATE' }, { at: d1('13:01:30'), solution: true }]);
  const cp3Of = (...logs: object[][]) => statusOf({ attempts: logs.flat(), events: [] }, OPENER).checkpoints[0]!;
  const pick = (c: ReturnType<typeof cp3Of>) => [c.latest_pass?.attempt_id, c.latest_pass?.assisted, c.latest_own_pass?.attempt_id ?? null, c.latest_own_pass?.assisted];

  assert.deepEqual(pick(cp3Of(own)), ['A-OWN', false, 'A-OWN', false], 'a hint at level 1 is not a reveal');
  assert.deepEqual(pick(cp3Of(own, shown)), ['A-SHOWN', true, 'A-OWN', false], 'after "show answer": latest_pass keeps it, latest_own_pass does not');
  assert.deepEqual(pick(cp3Of(own, hinted)), ['A-HINT2', true, 'A-OWN', false], 'hint 2 counts');
  assert.deepEqual(pick(cp3Of(own, hint3)), ['A-HINT3', true, 'A-OWN', false], 'hint 3 counts');
  assert.deepEqual(pick(cp3Of(shown)), ['A-SHOWN', true, null, undefined], 'no own pass: latest_own_pass is null and latest_pass says it was assisted');
  assert.deepEqual(pick(cp3Of(shown, late)), ['A-LATE', false, 'A-LATE', false], 'help after a pass does not make it assisted');
  const failThenShown = cp3('I-MIX', d1('14:00:00'), [{ at: d1('14:01:00'), submit: 'fail', id: 'A-MIX-1' }, { at: d1('14:02:00'), solution: true },
    { at: d1('14:03:00'), submit: 'pass', id: 'A-MIX-2' }]);
  const mixed = cp3Of(failThenShown);
  assert.deepEqual([mixed.latest?.attempt_id, mixed.latest?.assisted, mixed.latest_own_pass], ['A-MIX-2', true, null], 'per answer: the pass after the reveal');
  const failOnly = cp3Of(cp3('I-MIX', d1('14:00:00'), [{ at: d1('14:01:00'), submit: 'fail', id: 'A-MIX-1' }, { at: d1('14:02:00'), solution: true }]));
  assert.deepEqual([failOnly.latest?.attempt_id, failOnly.latest?.assisted], ['A-MIX-1', false], 'the fail before the reveal is not assisted');
  // Derived state only: the case is solved by an assisted pass as before (S4B-08), and the rating of each instance is unchanged.
  const cp4 = typed('I-O4', `${OPENER}:CP4`, d1('15:00:00'), [{ at: d1('15:01:00'), submit: 'pass' }]);
  assert.equal(statusOf({ attempts: [...shown, ...cp4], events: [] }, OPENER).solved, true);
});

// ---- what counts as a pass ------------------------------------------------------------------------------------------------
test('an "I was right" override counts as a pass from its own time until an override_revert; an auto pass in an open instance counts too', () => {
  const overridden = cp3('I-O3', d1('09:00:00'), [{ at: d1('09:01:00'), submit: 'fail', id: 'A-DISPUTED' }, { at: d1('09:02:00'), override: true, id: 'OVR-1' }]);
  const cp4 = typed('I-O4', `${OPENER}:CP4`, d1('09:10:00'), [{ at: d1('09:11:00'), submit: 'pass' }]);
  const s = statusOf({ attempts: [...overridden, ...cp4], events: [] }, OPENER);
  const c3 = s.checkpoints[0]!;
  assert.deepEqual([s.solved, c3.passed, c3.passed_at, c3.latest?.attempt_id, c3.latest?.passed], [true, true, d1('09:02:00'), 'A-DISPUTED', true],
    'the disputed answer is the latest answer, and it is a pass while the override stands');
  const reverted = statusOf({ attempts: [...overridden, ...cp4], events: [override('override_revert', 'OVR-1', d1('12:00:00'))] }, OPENER);
  assert.deepEqual([reverted.solved, reverted.score, reverted.checkpoints[0]!.passed, reverted.checkpoints[0]!.latest?.passed], [false, 0.5, false, false]);
  const open = cp3('I-OPEN', d1('09:00:00'), [{ at: d1('09:03:00'), submit: 'pass' }], { close: null });
  assert.equal(statusOf({ attempts: [...open, ...cp4], events: [] }, OPENER).solved, true, 'a passed attempt counts before its instance closes');
});
test('the latest answer carries the logged payload; a crash is no answer', () => {
  const attempts = [
    ...typed('I-O4-1', `${OPENER}:CP4`, d1('10:00:00'), [{ at: d1('10:01:00'), submit: 'fail', id: 'A-1' }]),
    ...typed('I-O4-2', `${OPENER}:CP4`, d1('11:00:00'), [{ at: d1('11:01:00'), submit: 'crash', id: 'A-CRASH' }]),
  ];
  const latest = statusOf({ attempts, events: [] }, OPENER).checkpoints[1]!.latest!;
  assert.equal(latest.attempt_id, 'A-1');
  assert.deepEqual(latest.payload, (attempts[0] as { payload: unknown }).payload);
  assert.equal(latest.submitted_at, d1('10:01:00'));
});

// ---- S4B-09 and S4B-13: the self-checks and the exports, which rate nothing -----------------------------------------------
test('the day-1 sketch is the first sketch; the plan and the insight are the latest; exports are listed; a self-check starts the case', () => {
  const records = [
    selfCheck(d1('08:00:00'), 'sketch', { fields: { row: 'one promotion', tables: 'promotions', metric: 'price' } }),
    selfCheck(d1('08:30:00'), 'plan', { fields: { metric: 'first plan' } }),
    selfCheck(d2('08:00:00'), 'sketch', { fields: { row: 'later sketch', tables: 'promotions', metric: 'price' } }),
    selfCheck(d2('08:10:00'), 'plan', { fields: { metric: 'second plan' } }),
    selfCheck(d2('09:00:00'), 'insight', { text: 'Deeper discounts sold more.' }),
    selfCheck(d2('09:01:00'), 'rubric', { ticked: ['number', 'caveat'] }),
    selfCheck(d2('09:02:00'), 'plan', { case_id: 'CASE-NOT-IN-THE-CATALOG' }),
  ];
  const events = [{ event: 'case_export', schema_version: 4, ts: d2('10:00:00'), case_id: OPENER, files: [`${OPENER}-2026-11-05.md`, `${OPENER}-2026-11-05.csv`],
    data_source: 'Fictional, generated data: Voltmarkt' }];
  const r = replayed({ attempts: records, events });
  const s = r.cases.get(OPENER)!;
  assert.equal(s.started, true);
  assert.deepEqual(s.sketch, { ts: d1('08:00:00'), session_id: 'S1', phase: 'opener_preview', item_instance_id: null, text: null,
    fields: { row: 'one promotion', tables: 'promotions', metric: 'price' }, ticked: [] });
  assert.deepEqual([s.plan?.ts, s.plan?.fields], [d2('08:10:00'), { metric: 'second plan' }]);
  assert.deepEqual([s.insight?.ts, s.insight?.text], [d2('09:00:00'), 'Deeper discounts sold more.']);
  assert.deepEqual(s.exports, [{ ts: d2('10:00:00'), files: [`${OPENER}-2026-11-05.md`, `${OPENER}-2026-11-05.csv`], data_source: 'Fictional, generated data: Voltmarkt' }]);
  assert.deepEqual([s.solved, s.score], [false, 0], 'a self-check passes nothing');
  assert.equal(r.cases.get(INBOX)!.started, false);
  assert.deepEqual([r.instances.size, r.cards.size, r.concepts.size, r.warnings], [0, 0, 0, []], 'self-checks and exports make no instance, card, concept or warning');
});

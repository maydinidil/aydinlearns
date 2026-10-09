// tests/server/labs.test.ts: GA4 lab grading and lab state (sprint 5b, Task B2; D69, Ruling 1). Pure: server/labs.ts does no I/O.
// The labs are the invented fixtures in tests/fixtures/labs/ (tests/helpers/lab-fixture.ts); their keys are invented too, so a
// message here may show a fixture value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedMonth, gradeFirst, gradeRecheck, labStatus, parseLabNumber, suggestedMode, withinTolerance, type PartOutcome } from '../../server/labs.ts';
import type { Lab, LabKey } from '../../schemas/lab.ts';
import type { LabAnswer, LabPartAnswer } from '../../schemas/log-ext.ts';
import { fixtureKey, fixtureLab } from '../helpers/lab-fixture.ts';

const NUMBER_HELP = 'Type a number, for example 12,345 or 61.2';
const lab = async (id: string): Promise<Lab> => (await fixtureLab(id)) as Lab;
const key = async (id: string): Promise<LabKey> => (await fixtureKey(id)) as LabKey;
const byId = (outs: PartOutcome[]): Record<string, PartOutcome> => Object.fromEntries(outs.map((o) => [o.part_id, o]));

// ---- parseLabNumber ---------------------------------------------------------------------------------------------------------

test('parseLabNumber accepts plain numbers, thousands commas, a unit sign, and either decimal mark when both marks appear', () => {
  const ok = (s: string, unit: 'count' | 'percent' | 'eur', value: number) => assert.deepEqual(parseLabNumber(s, unit), { ok: true, value }, s);
  ok('12,345', 'count', 12345);
  ok('12345', 'count', 12345);
  ok('61.2%', 'percent', 61.2);
  ok('€1,234.50', 'eur', 1234.5);
  ok('1.234,5', 'count', 1234.5);
  ok('1,234.5', 'count', 1234.5);
  // Beyond the brief's list: outer spaces, groups of three repeated, and the unit sign with a space.
  ok('  1,234,567 ', 'count', 1234567);
  ok('1.234.567,89', 'eur', 1234567.89);
  ok('€ 99', 'eur', 99);
  ok('61.2 %', 'percent', 61.2);
  ok('0', 'count', 0);
  ok('60.0', 'percent', 60);
});

test('parseLabNumber refuses 1.234 as ambiguous, and anything else that is not a number with the plain message', () => {
  assert.deepEqual(parseLabNumber('1.234', 'count'), { ok: false, message: 'Is that 1234 or 1.234? Type it without a separator.' });
  assert.deepEqual(parseLabNumber('5.678', 'eur'), { ok: false, message: 'Is that 5678 or 5.678? Type it without a separator.' });
  for (const s of ['12,34', 'abc', '', '   ', '1,2345', '12 345', '1.2.3', '1,234,5', '.5', '5.']) {
    assert.deepEqual(parseLabNumber(s, 'count'), { ok: false, message: NUMBER_HELP }, JSON.stringify(s));
  }
  // A unit sign is dropped only for its own unit.
  assert.deepEqual(parseLabNumber('61.2%', 'count'), { ok: false, message: NUMBER_HELP });
  assert.deepEqual(parseLabNumber('€12', 'percent'), { ok: false, message: NUMBER_HELP });
  // A number too large to be finite is refused too.
  assert.deepEqual(parseLabNumber('9'.repeat(400), 'count'), { ok: false, message: NUMBER_HELP });
});

// ---- fixedMonth and withinTolerance ---------------------------------------------------------------------------------------

test('fixedMonth is the month before today from the 5th on, and the month before that until then', () => {
  assert.equal(fixedMonth('2026-10-08'), '2026-09');
  assert.equal(fixedMonth('2026-10-04'), '2026-08');
  assert.equal(fixedMonth('2026-01-10'), '2025-12');
  assert.equal(fixedMonth('2026-10-05'), '2026-09');
  assert.equal(fixedMonth('2026-02-01'), '2025-12');
  assert.equal(fixedMonth('2026-01-04'), '2025-11');
});

test('withinTolerance: relative, points and exact', () => {
  assert.equal(withinTolerance(1000, 1019, { relative_pct: 2 }), true);
  assert.equal(withinTolerance(1000, 1020, { relative_pct: 2 }), true);
  assert.equal(withinTolerance(1000, 1021, { relative_pct: 2 }), false);
  assert.equal(withinTolerance(1000, 979, { relative_pct: 2 }), false);
  assert.equal(withinTolerance(61.0, 61.3, { points: 0.3 }), true);
  assert.equal(withinTolerance(1.0, 1.3, { points: 0.3 }), true);         // 1.3 - 1.0 is 0.30000000000000004 in floating point
  assert.equal(withinTolerance(61.0, 61.4, { points: 0.3 }), false);
  assert.equal(withinTolerance(42, 42, { exact: true }), true);
  assert.equal(withinTolerance(42, 43, { exact: true }), false);
});

// ---- gradeFirst ------------------------------------------------------------------------------------------------------------

test('gradeFirst on LAB-12: the rate rule passes within its points and fails with its message; re-check parts wait; the key grades P4', async () => {
  const [l, k] = [await lab('LAB-12'), await key('LAB-12')];
  const at = (rate: number, marker = 'Teal marker') => byId(gradeFirst(l, k, { P1: 1000, P2: 600, P3: rate, P4: marker }, {}));

  const good = at(60.0);
  assert.deepEqual(good.P1, { part_id: 'P1', result: 'pending', message: null });
  assert.deepEqual(good.P2, { part_id: 'P2', result: 'pending', message: null });
  assert.deepEqual(good.P3, { part_id: 'P3', result: 'pass', message: null });
  assert.deepEqual(good.P4, { part_id: 'P4', result: 'pass', expected: 'Teal marker', message: null });

  assert.deepEqual(at(61.0).P3, { part_id: 'P3', result: 'fail', message: 'Engagement rate should be about 60.0% from your two numbers (600 / 1,000).' });
  assert.equal(at(60.4).P3!.result, 'pass');
  assert.equal(at(60.5).P3!.result, 'pass');
  assert.equal(at(59.4).P3!.result, 'fail');

  // A structural choice is compared after trimming and ignoring case; `expected` is the key's answer, pass or fail.
  assert.equal(at(60, '  teal MARKER ').P4!.result, 'pass');
  assert.deepEqual(at(60, 'Amber marker').P4, { part_id: 'P4', result: 'fail', expected: 'Teal marker', message: null });
  // Only a structural part carries `expected`.
  for (const o of gradeFirst(l, k, { P1: 1000, P2: 600, P3: 61, P4: 'Plum marker' }, {})) assert.equal('expected' in o, o.part_id === 'P4', o.part_id);
  // Number values may come as text and are read as parseLabNumber reads them.
  assert.equal(byId(gradeFirst(l, k, { P1: '1,000', P2: '600', P3: '60.0%', P4: 'Teal marker' }, {})).P3!.result, 'pass');
});

test('gradeFirst: the member rule both ways (LAB-07)', async () => {
  const [l, k] = [await lab('LAB-07'), await key('LAB-07')];
  const flag = (set: string[], p2: string) => byId(gradeFirst(l, k, { P1: set, P2: p2, P3: 'Admin > Invented B' }, {})).P2!;
  const disagree = { part_id: 'P2', result: 'fail', message: 'Your two answers disagree about purchase.' };
  assert.deepEqual(flag(['purchase', 'sign_up'], 'Yes'), { part_id: 'P2', result: 'pass', message: null });
  assert.deepEqual(flag(['purchase', 'sign_up'], 'No'), disagree);
  assert.deepEqual(flag(['sign_up'], 'No'), { part_id: 'P2', result: 'pass', message: null });
  assert.deepEqual(flag(['sign_up'], 'Yes'), disagree);
  assert.deepEqual(flag([], 'No'), { part_id: 'P2', result: 'pass', message: null });
  assert.deepEqual(flag([' Purchase '], ' yes'), { part_id: 'P2', result: 'pass', message: null });
  // P1 is a re-check part: it waits, even though the rule names it.
  assert.equal(byId(gradeFirst(l, k, { P1: ['purchase'], P2: 'No', P3: 'Admin > Invented B' }, {})).P1!.result, 'pending');
});

test('gradeFirst on LAB-20: at_most, a structural multi as a set, and the self-check', async () => {
  const [l, k] = [await lab('LAB-20'), await key('LAB-20')];
  const grade = (p3: number, p4: string[], self: boolean) =>
    byId(gradeFirst(l, k, { P1: 'Step 2', P2: 5000, P3: p3, P4: p4, P5: 'It shows the invented step.' }, { P5: self }));
  const good = grade(4000, ['Oval marker', 'circle marker'], true);
  assert.equal(good.P3!.result, 'pass');
  assert.deepEqual(good.P4, { part_id: 'P4', result: 'pass', expected: ['Circle marker', 'Oval marker'], message: null });
  assert.deepEqual(good.P5, { part_id: 'P5', result: 'self_yes', message: null });
  assert.equal(good.P1!.result, 'pending');
  assert.equal(good.P2!.result, 'pending');
  assert.equal(grade(5000, ['Circle marker', 'Oval marker'], true).P3!.result, 'pass');
  const bad = grade(5001, ['Circle marker'], false);
  // LAB-20 reads the Last 28 days: its at_most message names the dates, not a month (M-C1-1).
  assert.deepEqual(bad.P3, { part_id: 'P3', result: 'fail', message: 'Step 2 users cannot be more than Step 1 users: check you read the same row and the same dates.' });
  assert.deepEqual(bad.P4, { part_id: 'P4', result: 'fail', expected: ['Circle marker', 'Oval marker'], message: null });
  assert.deepEqual(bad.P5, { part_id: 'P5', result: 'self_no', message: null });
  assert.equal(grade(4000, ['Circle marker', 'Oval marker', 'Square marker'], true).P4!.result, 'fail');
});

test('gradeFirst: a consistency part takes every rule that names it; a rate it cannot compute is not checked', async () => {
  const base = await lab('LAB-12');
  const k = await key('LAB-12');
  // A second rule on P3: P3 at most P1. Both fail: both messages, in rule order.
  const two: Lab = { ...base, rules: [...base.rules, { kind: 'at_most', part: 'P3', of: 'P2' }] };
  assert.deepEqual(byId(gradeFirst(two, k, { P1: 1000, P2: 50, P3: 61, P4: 'Teal marker' }, {})).P3, {
    part_id: 'P3', result: 'fail',
    message: 'Engagement rate should be about 5.0% from your two numbers (50 / 1,000). Engagement rate cannot be more than Engaged sessions: check you read the same row and the same month.',
  });
  // Both pass: the part passes.
  assert.deepEqual(byId(gradeFirst(two, k, { P1: 1000, P2: 50, P3: 5, P4: 'Teal marker' }, {})).P3, { part_id: 'P3', result: 'pass', message: null });
  // One passes and one fails: the part fails with the failing rule's message only.
  assert.deepEqual(byId(gradeFirst(two, k, { P1: 50, P2: 20, P3: 40, P4: 'Teal marker' }, {})).P3, {
    part_id: 'P3', result: 'fail', message: 'Engagement rate cannot be more than Engaged sessions: check you read the same row and the same month.',
  });
  // A rate over a denominator of 0 cannot be computed.
  assert.deepEqual(byId(gradeFirst(base, k, { P1: 0, P2: 0, P3: 0, P4: 'Teal marker' }, {})).P3, {
    part_id: 'P3', result: 'not_checked', message: 'Sessions is 0, so Engagement rate cannot be checked.',
  });
});

test('gradeFirst: the at_most message follows the lab\'s date (M-C1-1): the same month, the same dates, or the same row only', async () => {
  const base = await lab('LAB-12');
  const k = await key('LAB-12');
  // LAB-12 with its rate rule swapped for one at_most rule on its consistency part P3, under each of the three dates.
  const atMost = (date: Lab['date']) =>
    byId(gradeFirst({ ...base, date, rules: [{ kind: 'at_most', part: 'P3', of: 'P2' }] }, k, { P1: 1000, P2: 50, P3: 60, P4: 'Teal marker' }, {})).P3;
  assert.deepEqual(atMost('fixed_month'),
    { part_id: 'P3', result: 'fail', message: 'Engagement rate cannot be more than Engaged sessions: check you read the same row and the same month.' });
  assert.deepEqual(atMost('last_28_days'),
    { part_id: 'P3', result: 'fail', message: 'Engagement rate cannot be more than Engaged sessions: check you read the same row and the same dates.' });
  assert.deepEqual(atMost('none'),
    { part_id: 'P3', result: 'fail', message: 'Engagement rate cannot be more than Engaged sessions: check you read the same row.' });
});

// ---- gradeRecheck ----------------------------------------------------------------------------------------------------------

const part = (part_id: string, value: LabPartAnswer['value'], result: LabPartAnswer['result'] = 'pending'): LabPartAnswer => ({ part_id, value, result });
let seq = 0;
/** A lab answer logged at `ts` (UTC). */
const answer = (lab_id: string, kind: 'first' | 'recheck', ts: string, parts: LabPartAnswer[], extra: Partial<LabAnswer> = {}): LabAnswer => ({
  record: 'lab_answer', schema_version: 5, ts, session_id: `S-${++seq}`, lab_id, lab_version: 1, kind, month: null, range: null, parts, note: null, ...extra,
});

test('gradeRecheck grades only the re-check parts against the baseline: numbers by tolerance, choices and texts by text, multi as sets', async () => {
  const twelve = await lab('LAB-12');
  const first = answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', [part('P1', 1000), part('P2', 600), part('P3', 60, 'pass'), part('P4', 'Teal marker', 'pass')]);
  assert.deepEqual(gradeRecheck(twelve, first, { P1: 1019, P2: '612', P3: 99, P4: 'Plum marker' }), [
    { part_id: 'P1', result: 'pass', message: null },
    { part_id: 'P2', result: 'pass', message: null },
  ]);
  assert.deepEqual(gradeRecheck(twelve, first, { P1: 1021, P2: 600 }), [
    { part_id: 'P1', result: 'fail', message: 'This does not match your first answer. Check the dates and the steps, then read it again.' },
    { part_id: 'P2', result: 'pass', message: null },
  ]);

  const twenty = await lab('LAB-20');
  const base20 = answer('LAB-20', 'first', '2026-10-08T10:00:00.000Z', [part('P1', 'Step 2'), part('P2', 5000)]);
  assert.deepEqual(gradeRecheck(twenty, base20, { P1: ' step 2 ', P2: 4950 }).map((o) => o.result), ['pass', 'pass']);
  assert.deepEqual(gradeRecheck(twenty, base20, { P1: 'Step 3', P2: 4899 }).map((o) => o.result), ['fail', 'fail']);

  const seven = await lab('LAB-07');
  const base7 = answer('LAB-07', 'first', '2026-10-08T10:00:00.000Z', [part('P1', ['purchase', 'sign_up'])]);
  assert.deepEqual(gradeRecheck(seven, base7, { P1: ['Sign_up', 'purchase'] }), [{ part_id: 'P1', result: 'pass', message: null }]);
  assert.equal(gradeRecheck(seven, base7, { P1: ['purchase'] })[0]!.result, 'fail');
  // A part the baseline has no value for cannot be compared.
  const blank = answer('LAB-07', 'first', '2026-10-08T10:00:00.000Z', []);
  assert.deepEqual(gradeRecheck(seven, blank, { P1: ['purchase'] }), [{ part_id: 'P1', result: 'not_checked', message: null }]);
});

// ---- labStatus -------------------------------------------------------------------------------------------------------------

test('labStatus: new, waiting, due on day 7, an early re-check that does not count, done, and look_again', async () => {
  const l = await lab('LAB-12');
  const firstParts = [part('P1', 1000), part('P2', 600), part('P3', 60, 'pass'), part('P4', 'Teal marker', 'pass')];
  // 22:30 UTC on 7 October is 00:30 on 8 October in Amsterdam: the baseline's date is the Amsterdam date.
  const first = answer('LAB-12', 'first', '2026-10-07T22:30:00.000Z', firstParts, { month: '2026-09' });
  const status = (answers: LabAnswer[], today: string) => labStatus(l, answers, today);

  assert.deepEqual(status([], '2026-10-08'), { lab_id: 'LAB-12', state: 'new', baseline_date: null, recheck_from: null, month: null, range: null });
  assert.deepEqual(status([first], '2026-10-14'), {
    lab_id: 'LAB-12', state: 'recheck_waiting', baseline_date: '2026-10-08', recheck_from: '2026-10-15', month: '2026-09', range: null,
  });
  assert.equal(status([first], '2026-10-15').state, 'recheck_due');
  assert.equal(status([first], '2026-11-30').state, 'recheck_due');

  // A re-check on day 6 (Amsterdam) is logged but does not count, pass or fail.
  const early = answer('LAB-12', 'recheck', '2026-10-14T21:59:00.000Z', [part('P1', 1000, 'pass'), part('P2', 600, 'pass')], { month: '2026-09' });
  assert.equal(status([first, early], '2026-10-14').state, 'recheck_waiting');
  assert.equal(status([first, early], '2026-10-15').state, 'recheck_due');
  const earlyFail = answer('LAB-12', 'recheck', '2026-10-10T10:00:00.000Z', [part('P1', 2000, 'fail'), part('P2', 600, 'pass')]);
  assert.equal(status([first, earlyFail], '2026-10-15').state, 'recheck_due');

  // 22:00 UTC on 14 October is midnight on 15 October in Amsterdam: day 7, so it counts.
  const pass = answer('LAB-12', 'recheck', '2026-10-14T22:00:00.000Z', [part('P1', 1010, 'pass'), part('P2', 605, 'pass')]);
  const fail = answer('LAB-12', 'recheck', '2026-10-16T10:00:00.000Z', [part('P1', 1100, 'fail'), part('P2', 605, 'pass')]);
  assert.deepEqual(status([first, early, pass], '2026-10-15'), {
    lab_id: 'LAB-12', state: 'done', baseline_date: '2026-10-08', recheck_from: '2026-10-15', month: '2026-09', range: null,
  });
  // The latest counted re-check decides.
  assert.equal(status([first, pass, fail], '2026-10-16').state, 'look_again');
  const again = answer('LAB-12', 'recheck', '2026-10-17T10:00:00.000Z', [part('P1', 1000, 'pass'), part('P2', 600, 'pass')]);
  assert.equal(status([first, pass, fail, again], '2026-10-17').state, 'done');

  // A fail or a self_no in the baseline is look_again at once.
  const wrong = answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', [part('P1', 1000), part('P2', 600), part('P3', 70, 'fail'), part('P4', 'Teal marker', 'pass')]);
  assert.equal(status([wrong], '2026-10-08').state, 'look_again');
  // The latest first answer is the baseline: a new first answer starts the week again.
  const later = answer('LAB-12', 'first', '2026-10-20T10:00:00.000Z', firstParts, { month: '2026-09' });
  assert.deepEqual(status([first, pass, later], '2026-10-21'), {
    lab_id: 'LAB-12', state: 'recheck_waiting', baseline_date: '2026-10-20', recheck_from: '2026-10-27', month: '2026-09', range: null,
  });
  assert.equal(status([wrong, later], '2026-10-21').state, 'recheck_waiting');
});

test('labStatus: a self_no is look_again, a lab with no re-check part is done after a clean first answer, and the range is the baseline\'s', async () => {
  const twenty = await lab('LAB-20');
  const range = { from: '2026-09-10', to: '2026-10-07' };
  const parts = (self: 'self_yes' | 'self_no') => [part('P1', 'Step 2'), part('P2', 5000), part('P3', 4000, 'pass'), part('P4', ['Circle marker', 'Oval marker'], 'pass'), part('P5', 'Shown.', self)];
  const yes = answer('LAB-20', 'first', '2026-10-08T10:00:00.000Z', parts('self_yes'), { range });
  const no = answer('LAB-20', 'first', '2026-10-08T10:00:00.000Z', parts('self_no'), { range });
  assert.deepEqual(labStatus(twenty, [yes], '2026-10-09'), {
    lab_id: 'LAB-20', state: 'recheck_waiting', baseline_date: '2026-10-08', recheck_from: '2026-10-15', month: null, range,
  });
  assert.equal(labStatus(twenty, [no], '2026-10-09').state, 'look_again');

  // LAB-12 with its two read values turned into consistency parts: no re-check part, so a clean first answer is done.
  const base = await lab('LAB-12');
  const noRecheck: Lab = { ...base, parts: base.parts.map((p) => (p.check === 'recheck_fixed' ? { id: p.id, question: p.question, answer: p.answer, unit: p.unit, check: 'consistency' } : p)) };
  const clean = answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', [part('P1', 1000, 'pass'), part('P2', 600, 'pass'), part('P3', 60, 'pass'), part('P4', 'Teal marker', 'pass')]);
  assert.deepEqual(labStatus(noRecheck, [clean], '2026-10-08'), {
    lab_id: 'LAB-12', state: 'done', baseline_date: '2026-10-08', recheck_from: null, month: null, range: null,
  });
});

test('labStatus ignores answers to an older lab version and to other labs', async () => {
  const l = { ...(await lab('LAB-12')), version: 2 };
  const old = answer('LAB-12', 'first', '2026-10-01T10:00:00.000Z', [part('P1', 1000), part('P2', 600), part('P3', 60, 'pass'), part('P4', 'Teal marker', 'pass')]);
  const other = answer('LAB-07', 'first', '2026-10-01T10:00:00.000Z', [], { lab_version: 2 });
  assert.equal(labStatus(l, [old, other], '2026-10-09').state, 'new');
  const current = { ...old, lab_version: 2, ts: '2026-10-02T10:00:00.000Z' };
  const oldRecheck = answer('LAB-12', 'recheck', '2026-10-09T10:00:00.000Z', [part('P1', 1000, 'pass'), part('P2', 600, 'pass')]);
  assert.equal(labStatus(l, [old, current, oldRecheck], '2026-10-09').state, 'recheck_due');
});

test('suggestedMode: a re-check while one is waiting, due, or failed; the first answer otherwise', async () => {
  const l = await lab('LAB-12');
  const good = [part('P1', 1000), part('P2', 600), part('P3', 60, 'pass'), part('P4', 'Teal marker', 'pass')];
  const first = answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', good);
  const wrong = answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', [...good.slice(0, 3), part('P4', 'Plum marker', 'fail')]);
  const failed = answer('LAB-12', 'recheck', '2026-10-15T10:00:00.000Z', [part('P1', 1100, 'fail'), part('P2', 600, 'pass')]);
  const passed = answer('LAB-12', 'recheck', '2026-10-15T10:00:00.000Z', [part('P1', 1000, 'pass'), part('P2', 600, 'pass')]);
  assert.equal(suggestedMode(l, [], '2026-10-08'), 'first');
  assert.equal(suggestedMode(l, [first], '2026-10-09'), 'recheck');
  assert.equal(suggestedMode(l, [first], '2026-10-15'), 'recheck');
  assert.equal(suggestedMode(l, [first, failed], '2026-10-15'), 'recheck');
  assert.equal(suggestedMode(l, [first, passed], '2026-10-15'), 'first');
  assert.equal(suggestedMode(l, [wrong], '2026-10-15'), 'first');
});

test('labStatus across the late-October clock change: a baseline on 2026-10-20 is due on 2026-10-27', async () => {
  const l = await lab('LAB-12');
  const parts = [part('P1', 1000), part('P2', 600), part('P3', 60, 'pass'), part('P4', 'Teal marker', 'pass')];
  // 10:00 UTC on 20 October is still summer time in Amsterdam; 27 October is after the clocks went back on the 25th.
  const first = answer('LAB-12', 'first', '2026-10-20T10:00:00.000Z', parts, { month: '2026-09' });
  assert.deepEqual(labStatus(l, [first], '2026-10-26'), {
    lab_id: 'LAB-12', state: 'recheck_waiting', baseline_date: '2026-10-20', recheck_from: '2026-10-27', month: '2026-09', range: null,
  });
  assert.deepEqual(labStatus(l, [first], '2026-10-27'), {
    lab_id: 'LAB-12', state: 'recheck_due', baseline_date: '2026-10-20', recheck_from: '2026-10-27', month: '2026-09', range: null,
  });
});

test('a text re-check part ignores extra spaces and spaces around a slash; a choice part still matches its option as before', async () => {
  const twelve = await lab('LAB-12');
  const textLab: Lab = { ...twelve, parts: [{ id: 'P1', question: 'What does the screen show?', answer: 'text', check: 'recheck_fixed' }] };
  const base = answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', [part('P1', 'alpha / beta  gamma')]);
  for (const typed of ['alpha/beta gamma', '  Alpha  /  Beta   Gamma ', 'alpha /beta gamma']) {
    assert.equal(gradeRecheck(textLab, base, { P1: typed })[0]!.result, 'pass', typed);
  }
  assert.equal(gradeRecheck(textLab, base, { P1: 'alpha / beta delta' })[0]!.result, 'fail');
  assert.equal(gradeRecheck(textLab, answer('LAB-12', 'first', '2026-10-08T10:00:00.000Z', [part('P1', 'alpha/beta gamma')]), { P1: 'alpha / beta gamma' })[0]!.result, 'pass');
});

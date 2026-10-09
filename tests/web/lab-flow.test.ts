// tests/web/lab-flow.test.ts: the GA4 lab screens' pure helpers (sprint 5b, Task B3; design §8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Lab, LabPart } from '../../schemas/lab.ts';
import { ApiError } from '../../web/src/api.ts';
import type { LabState, LabStatus } from '../../server/labs.ts';
import {
  answerBody, dayMonth, dateLine, dueRechecks, guideOpen, monthText, outcomeLine, partLabel, recheckHint, refusedPart, shownParts, stateChip, firstMonth, showStartOverNote,
} from '../../web/src/lib/lab-flow.ts';

const status = (o: Partial<LabStatus>): LabStatus => ({ lab_id: 'LAB-01', state: 'new', baseline_date: null, recheck_from: null, month: null, range: null, ...o });
const part = (o: Partial<LabPart> & { id: string }): LabPart => ({ question: `Question ${o.id}`, answer: 'text', check: 'structural', ...o });
const lab = (o: Partial<Lab> = {}): Lab => ({
  id: 'LAB-01', version: 1, title: 'Lab one', concept_id: 'GA4-X-01', topic_id: 'GA4-T-01', property: 'MS', path: 'Reports > Acquisition', path_verified: true,
  date: 'fixed_month', steps: ['Open it'], parts: [], rules: [], interview_relevant: false, source_ids: [], as_of: '2026-10-01', ...o,
});

test('dates read as 15 October and September 2026', () => {
  assert.equal(dayMonth('2026-10-15'), '15 October');
  assert.equal(dayMonth('2026-01-05'), '5 January');
  assert.equal(monthText('2026-09'), 'September 2026');
});

test('the state chip for each state', () => {
  assert.equal(stateChip(status({ state: 'new' })).text, 'New');
  assert.equal(stateChip(status({ state: 'recheck_waiting', recheck_from: '2026-10-15' })).text, 'Re-check from 15 October');
  assert.equal(stateChip(status({ state: 'recheck_due', recheck_from: '2026-10-15' })).text, 'Re-check due');
  assert.equal(stateChip(status({ state: 'done' })).text, 'Done');
  assert.equal(stateChip(status({ state: 'look_again' })).text, 'Look again');
  assert.equal(stateChip(status({ state: 'recheck_waiting', recheck_from: null })).text, 'Re-check waiting');
});

test('the date line for each lab date and mode', () => {
  assert.equal(dateLine(lab({ date: 'fixed_month' }), 'first', '2026-09', null), 'September 2026');
  assert.equal(dateLine(lab({ date: 'fixed_month' }), 'recheck', '2026-08', null), 'August 2026');
  assert.equal(dateLine(lab({ date: 'last_28_days' }), 'first', null, null), 'Choose Last 28 days, then type the dates GA4 shows into From and To');
  assert.equal(dateLine(lab({ date: 'last_28_days' }), 'recheck', null, { from: '2026-09-01', to: '2026-09-28' }), '1 September 2026 to 28 September 2026');
  assert.equal(dateLine(lab({ date: 'none' }), 'first', null, null), null);
  assert.equal(dateLine(lab({ date: 'fixed_month' }), 'first', null, null), null);
});

test('a re-check shows only the re-check parts', () => {
  const l = lab({ parts: [part({ id: 'P1' }), part({ id: 'P2', answer: 'number', unit: 'count', check: 'recheck_fixed' }), part({ id: 'P3', check: 'recheck_range', answer: 'number', unit: 'count' })] });
  assert.deepEqual(shownParts(l, 'first').map((p) => p.id), ['P1', 'P2', 'P3']);
  assert.deepEqual(shownParts(l, 'recheck').map((p) => p.id), ['P2', 'P3']);
});

test('a field is labelled by the question, never its short label or its ID', () => {
  const withLabel = partLabel(part({ id: 'P1', label: 'Sessions', question: 'How many sessions?' }));
  assert.equal(withLabel, 'How many sessions?');
  assert.equal(partLabel(part({ id: 'P2', question: 'Which channel?' })), 'Which channel?');
  assert.ok(!withLabel.includes('Sessions') && !withLabel.includes('P1'));
});

test('refusedPart names the part an API refusal carries, and null otherwise', () => {
  assert.equal(refusedPart(new ApiError('P2 needs an answer.', 400, { error: 'x', part_id: 'P2' })), 'P2');
  assert.equal(refusedPart(new ApiError('Type the dates.', 400, { error: 'x', part_id: 'range' })), 'range');
  assert.equal(refusedPart(new ApiError('Bad.', 400, { error: 'x' })), null);
  assert.equal(refusedPart(new ApiError('Bad.', 500)), null);
  assert.equal(refusedPart(new ApiError('Bad.', 400, { part_id: 7 })), null);
  assert.equal(refusedPart(new Error('network')), null);
  assert.equal(refusedPart(undefined), null);
});

test('a first answer during a re-check reads the current fixed month; a lab with no fixed month reads none', () => {
  assert.equal(firstMonth(lab({ date: 'fixed_month' }), '2026-10-08'), '2026-09');
  assert.equal(firstMonth(lab({ date: 'fixed_month' }), '2026-10-03'), '2026-08');
  assert.equal(firstMonth(lab({ date: 'last_28_days' }), '2026-10-08'), null);
  assert.equal(firstMonth(lab({ date: 'none' }), '2026-10-08'), null);
});

test('outcome line for each result', () => {
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'pass', message: null }, null), { mark: '✓', text: 'Right', tone: 'pass' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'fail', message: 'Check the row.', expected: 'Direct' }, null),
    { mark: '✗', text: 'Check the row. Right answer: Direct', tone: 'fail' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'fail', message: null, expected: ['A', 'B'] }, null),
    { mark: '✗', text: 'Not right. Right answer: A, B', tone: 'fail' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'fail', message: 'This does not match your first answer.' }, null),
    { mark: '✗', text: 'This does not match your first answer.', tone: 'fail' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'pending', message: null }, '2026-10-15'), { mark: '', text: 'Re-check from 15 October', tone: 'wait' });
  assert.equal(outcomeLine({ part_id: 'P1', result: 'pending', message: null }, null).text, 'Saved. The re-check waits for a first answer with every part right.');
  assert.equal(recheckHint('2026-10-15'), 'Re-check: read the same screen again from 15 October. An earlier re-check does not count.');
  assert.equal(recheckHint(null), 'Re-check: read the same screen again.');
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'self_yes', message: null }, null), { mark: '', text: 'Self-checked', tone: 'self' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'self_no', message: null }, null), { mark: '', text: 'Self-checked', tone: 'self' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'not_checked', message: 'P2 is 0.' }, null), { mark: '', text: 'P2 is 0.', tone: 'wait' });
  assert.deepEqual(outcomeLine({ part_id: 'P1', result: 'not_checked', message: null }, null), { mark: '', text: 'Not checked', tone: 'wait' });
});

test('the guide is open until a lab has an answer', () => {
  assert.equal(guideOpen([{ state: 'new' }, { state: 'new' }]), true);
  assert.equal(guideOpen([{ state: 'new' }, { state: 'recheck_waiting' }]), false);
  assert.equal(guideOpen([]), true);
});

test('labs due for a re-check, in order', () => {
  const row = (id: string, state: LabState) => ({ id, title: id.toLowerCase(), state });
  const rows = [row('A', 'done'), row('B', 'recheck_due'), row('C', 'recheck_waiting'), row('D', 'recheck_due')];
  assert.deepEqual(dueRechecks(rows).map((r) => r.id), ['B', 'D']);
});

test('the answer body: values per shown part, self-checks, range and note', () => {
  const l = lab({ date: 'last_28_days', parts: [
    part({ id: 'P1', answer: 'choice', options: ['a', 'b'] }),
    part({ id: 'P2', answer: 'number', unit: 'count', check: 'recheck_fixed', tolerance: { exact: true } }),
    part({ id: 'P3', answer: 'text', check: 'self_rubric', rubric: 'r' }),
  ] });
  const form = { values: { P1: 'a', P2: ' 1,234 ' }, self: { P3: true }, from: '2026-09-01', to: '2026-09-28', note: '  hi  ' };
  assert.deepEqual(answerBody(l, 'first', form), {
    kind: 'first', values: { P1: 'a', P2: '1,234' }, self: { P3: true }, range: { from: '2026-09-01', to: '2026-09-28' }, note: 'hi',
  });
  assert.deepEqual(answerBody(l, 'recheck', { ...form, self: {} }), { kind: 'recheck', values: { P2: '1,234' }, note: 'hi' });
  const no = answerBody(l, 'first', { ...form, self: { P3: false } });
  assert.deepEqual(no.self, { P3: false });
  assert.ok(!('P3' in no.values), 'a self-check part sends no value');
  assert.deepEqual(answerBody(l, 'first', { ...form, self: {} }).self, {});
});

test('answerBody sends the month shown on a first answer to a fixed_month lab, and [] for an untouched multi part', () => {
  const l = lab({ parts: [part({ id: 'P1', answer: 'multi', options: ['a', 'b'] }), part({ id: 'P2', answer: 'text' })] });
  const form = { values: { P2: 'x' }, self: {}, from: '', to: '', note: '' };
  const first = answerBody(l, 'first', form, '2026-09');
  assert.equal(first.month, '2026-09');
  assert.deepEqual(first.values, { P1: [], P2: 'x' });
  assert.ok(!('month' in answerBody(l, 'recheck', form, '2026-09')));
  assert.ok(!('month' in answerBody(lab({ date: 'last_28_days', parts: l.parts }), 'first', form, '2026-09')));
  assert.ok(!('month' in answerBody(l, 'first', form)));
  assert.deepEqual(answerBody(l, 'first', { ...form, values: { P1: ['a'], P2: 'x' } }).values, { P1: ['a'], P2: 'x' });
});

test('the start-over note shows on a first answer whenever the lab has a baseline', () => {
  assert.equal(showStartOverNote(status({ baseline_date: '2026-10-01' }), 'first'), true);
  assert.equal(showStartOverNote(status({ baseline_date: '2026-10-01' }), 'recheck'), false);
  assert.equal(showStartOverNote(status({}), 'first'), false);
});

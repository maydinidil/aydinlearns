// tests/web/case-mock-flow.test.ts: the case-round and take-home mocks' pure helpers (web/src/lib/case-flow.ts; sprint 7 Part 2, Task N2; S7-03,
// S7-13 to S7-16). The routes a case mock owns, the steps in mock mode (the plan first, then every checkpoint, then "say it in 60 seconds" in a
// case-round), each step's state, the clock line (the take-home past its minutes is late, never over), and the review's lines. Every value
// here is invented. Task N3: the web kind guard agrees with schemas/case.ts's (N2 M5); the calls in lib/cases-api.ts (N2 M7) and their paths (M10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCaseMockKind as caseReExport, isMockCaseKind } from '../../schemas/case.ts';
import { isCaseMockKind } from '../../schemas/mock.ts';
import {
  isCaseMockBlock, mockClock, mockReviewScoreLine, mockStepState, mockSteps, type CaseMockRunView, type MockCaseView,
} from '../../web/src/lib/case-flow.ts';
import { caseMockApi } from '../../web/src/lib/cases-api.ts';
import { caseMockRuleLine, countsLine } from '../../web/src/lib/mock-flow.ts';

const cps = (answered: string[] = []): MockCaseView['checkpoints'] => ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'].map((kind) => ({
  id: kind, kind: kind as MockCaseView['checkpoints'][number]['kind'], prompt: `The ${kind} question.`, item_id: kind === 'CP6' ? null : `X:${kind}`,
  item_instance_id: kind === 'CP6' ? null : `I-${kind}`, answered: answered.includes(kind), late: false,
}));
const view = (over: Partial<MockCaseView> = {}): MockCaseView => ({
  case_id: 'CASE-MOCK-A', title: 'An invented case', level: 3, persona: { name: 'Joost', role: 'Pricing lead' }, brief: { decision: 'Which stores', deadline: 'Friday' },
  data_needed: ['stores'], expected_output: { columns: ['city'], sort: [{ column: 'city', desc: false }], grain: null }, data_source: null,
  checkpoints: cps(), plan: null, insight: null, said: null, plan_fields: [{ id: 'metric_formula', label: 'Metric formula' }], say_points: [{ id: 'number', label: 'The number' }],
  ...over,
});
const T0 = Date.parse('2026-11-02T09:00:00.000Z');
const run = (mock: 'case_round' | 'take_home'): CaseMockRunView => ({
  block_id: `mock-${mock}-1`, kind: 'mock', mock, form_id: mock === 'case_round' ? 'CASE-ROUND-A' : 'TAKE-HOME-A', phase: 'mock', hide_labels: true,
  minutes: mock === 'case_round' ? 45 : 120, on_unseen: true, deadline_at: new Date(T0 + (mock === 'case_round' ? 45 : 120) * 60_000).toISOString(),
  ends_at: new Date(T0 + (mock === 'case_round' ? 45 * 60_000 : 24 * 3_600_000)).toISOString(), servings: [], case: view(),
});

test('a case mock\'s own routes: #/mock/case_round and #/mock/take_home, and the review of a case mock block', () => {
  const kinds = ['case_round', 'take_home', 'screen', 'knowledge', 'review'];
  assert.deepEqual(kinds.map(isCaseMockKind), [true, true, false, false, false]);
  assert.deepEqual(kinds.map(isCaseMockKind), kinds.map(isMockCaseKind), 'the one guard in schemas/mock.ts agrees with schemas/case.ts (N2 M5)');
  assert.equal(caseReExport, isCaseMockKind, 'schemas/case.ts re-exports that guard; the web keeps no second copy (N3 M2)');
  assert.deepEqual(['mock-case_round-1', 'mock-take_home-1', 'mock-screen-1', 'mock-knowledge-1'].map(isCaseMockBlock), [true, true, false, false]);
});

test('S7-13: in mock mode the plan is the only step until it is saved; then every checkpoint, and "say it in 60 seconds" in a case-round only', () => {
  assert.deepEqual(mockSteps(view(), 'case_round').map((s) => s.id), ['plan']);
  const planned = view({ plan: { metric_formula: 'x' } });
  assert.deepEqual(mockSteps(planned, 'case_round').map((s) => s.id), ['plan', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'say']);
  assert.deepEqual(mockSteps(planned, 'take_home').map((s) => s.id), ['plan', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6']);
});

test('S7-03: a step is done once its one answer is recorded (never right or wrong), the plan or the insight saved, or the four points ticked', () => {
  const v = view({ plan: { metric_formula: 'x' }, checkpoints: cps(['CP1', 'CP3']), insight: 'An insight.', said: ['number'] });
  assert.deepEqual(['plan', 'CP1', 'CP2', 'CP3', 'CP6', 'say'].map((id) => mockStepState(id as never, v)), ['done', 'done', 'todo', 'done', 'done', 'done']);
  assert.deepEqual(['plan', 'CP1', 'CP6', 'say'].map((id) => mockStepState(id as never, view())), ['todo', 'todo', 'todo', 'todo']);
});

test('S7-14, S7-15: the clock counts down to the deadline; a case-round ends there; a take-home past it is late, not over', () => {
  const at = (min: number) => T0 + min * 60_000;
  assert.deepEqual(mockClock(at(30), run('case_round')), { left: 15 * 60, late: false, ended: false });
  assert.deepEqual(mockClock(at(46), run('case_round')), { left: 0, late: false, ended: true });
  assert.deepEqual(mockClock(at(100), run('take_home')), { left: 20 * 60, late: false, ended: false });
  assert.deepEqual(mockClock(at(121), run('take_home')), { left: 0, late: true, ended: false });
});

test('S7-14, S7-15: the start screen\'s rule line names the limit, the pass rule and, for the take-home, its wall clock', () => {
  const round = caseMockRuleLine('case_round', { minutes: 45, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step'] });
  assert.match(round, /^Stage 4: case interview\./);
  assert.match(round, /45 minutes/);
  assert.match(round, /at least 4 of checkpoints 1 to 5 right/);
  const take = caseMockRuleLine('take_home', { minutes: 120, close_after_hours: 24, auto_min: 4, core_rubric: ['number', 'reconciliation'] });
  assert.match(take, /^Stage 5: take-home\./);
  assert.match(take, /120 minutes/);
  assert.match(take, /keeps running/);
  assert.match(take, /late/);
  assert.match(take, /24 hours/);
});

test('S7-16, S7-05: the review\'s lines: waiting for the rubric, passed or not; whether it counts toward its stage', () => {
  const row = { correct: 5, total: 6, passed: false, status: 'waiting_rubric' as const, practice: false, counts: false, late: false };
  assert.equal(mockReviewScoreLine(row), '5 of 6 checkpoints passed. Waiting for your rubric: tick it below.');
  assert.equal(mockReviewScoreLine({ ...row, status: 'ended', passed: true }), '5 of 6 checkpoints passed. Passed.');
  assert.equal(mockReviewScoreLine({ ...row, status: 'ended' }), '5 of 6 checkpoints passed. Not passed.');
  assert.equal(countsLine({ ...row, mock: 'case_round', passed: true, counts: true }), 'A pass on an unseen form: it meets stage 4.');
  assert.equal(countsLine({ ...row, mock: 'take_home', practice: true }), 'A practice run: it does not count toward the stage.');
  assert.match(countsLine({ ...row, mock: 'take_home', late: true }), /late/);
});

test('the case mock calls go to the run\'s own routes (N2 M10: each method and path, the block encoded), every POST with a JSON body', async () => {
  assert.deepEqual(Object.keys(caseMockApi).sort(), ['answer', 'giveUp', 'insight', 'plan', 'review', 'rubric', 'sayAloud', 'serve']);
  const g = globalThis as unknown as { fetch: unknown };
  const before = g.fetch;
  const calls: [string, string, unknown][] = [];
  const types: string[] = [];
  g.fetch = async (input: unknown, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    // The server answers a POST without a JSON content type with 415 (F3's smoke rows 7b-2 and 7b-3 found serve and give-up sent none).
    if (init?.method === 'POST') types.push(String(init.headers?.['content-type'] ?? init.headers?.['Content-Type'] ?? ''));
    calls.push([init?.method ?? 'GET', String(input), init?.body === undefined ? undefined : JSON.parse(init.body)]);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const b = 'mock-case_round-1 x';
    await caseMockApi.plan(b, { metric_formula: 'x' });
    await caseMockApi.serve(b, 'CP2');
    await caseMockApi.answer(b, 'CP2', { item_instance_id: 'I-1', typed: '3', active_ms: 5 });
    await caseMockApi.insight(b, 'An insight.');
    await caseMockApi.sayAloud(b, ['number']);
    await caseMockApi.rubric(b, ['number']);
    await caseMockApi.giveUp(b);
    await caseMockApi.review(b);
  } finally { g.fetch = before; }
  const at = '/api/mocks/mock-case_round-1%20x';
  assert.deepEqual(calls, [
    ['POST', `${at}/plan`, { fields: { metric_formula: 'x' } }], ['POST', `${at}/checkpoints/CP2/serve`, {}],
    ['POST', `${at}/checkpoints/CP2/answer`, { item_instance_id: 'I-1', typed: '3', active_ms: 5 }], ['POST', `${at}/insight`, { text: 'An insight.' }],
    ['POST', `${at}/say-aloud`, { ticked: ['number'] }], ['POST', `${at}/rubric`, { ticked: ['number'] }], ['POST', `${at}/give-up`, {}],
    ['GET', `${at}/review`, undefined]]);
  assert.deepEqual(types, Array(7).fill('application/json'), 'every POST says it sends JSON');
});

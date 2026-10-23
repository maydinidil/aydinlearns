// tests/server/mock-shared-rules.test.ts: the knowledge mock's shared rules (sprint 7c, Task X2; reviews N1 M4, N1 M5, N3 M1, F4-4-2; ruling
// S7C-03, D116). One reading of a knowledge run's questions and first answers for its history row (server/mocks.ts mockRuns) and its review's
// sections and topics (server/run.ts knowledgeScore), so they add up; one "ready" rule counting usable questions (knowledgeReadiness); one
// deadline rule and one minutes reader for every mock (deadlineOf, openMinutes); and a case run's own core rubric lines before the file's
// (runCoreRubric). Every record, item and topic here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AttemptFileRecord } from '../../core/envelope.ts';
import { mockRunView, openTakeHomes, type MockPlan, type RunEntry } from '../../server/drill.ts';
import { deadlineOf, mockRuns, openMinutes, runCoreRubric } from '../../server/mocks.ts';
import { knowledgeReadiness, knowledgeReady, knowledgeScore, type KnowledgePools, type KnowledgeQuestion, type KnowledgeTopic } from '../../server/run.ts';
import type { ChoiceItem } from '../../schemas/choice.ts';
import type { MocksFile } from '../../schemas/mock.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { blockClose, instance } from '../helpers/replay-fixture.ts';

const FILE = JSON.parse(await readFile('content/mocks.json', 'utf8')) as MocksFile;
/** The rules asking more questions than an earlier run had (F4-4-2). */
const RAISED: MocksFile = { ...FILE, knowledge: { ...FILE.knowledge, questions: 35, per_section: { methodology: 25, ga4: 10 } } };
/** Minutes after 09:00 UTC on 2 November 2026. */
const T0 = Date.parse('2026-11-02T09:00:00.000Z');
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString();
const NOW = new Date(T0 + 30 * 86_400_000);
const KNOW = Array.from({ length: 30 }, (_, n) => `Q-K-${String(n + 1).padStart(2, '0')}`);
/** Questions 1 to 15 on Methodology topic A, 16 to 20 on Methodology topic B, 21 to 30 on one GA4 topic. */
const topicOf = (id: string): KnowledgeTopic | undefined => {
  const n = Number(id.slice(-2));
  if (!(n >= 1 && n <= 30)) return undefined;
  return n <= 20 ? { section: 'methodology', topic: n <= 15 ? 'T-A' : 'T-B' } : { section: 'ga4', topic: 'T-G' };
};
const knowledgeOpen = (block: string, listed: readonly string[] | null) => ({ record: 'mock_open', schema_version: 7, ts: at(0), session_id: 'S-1', block_id: block,
  mock: 'knowledge', form_id: 'KNOWLEDGE', minutes: 40, on_unseen: true, pass_correct: 24, ...(listed === null ? {} : { item_ids: [...listed] }) });
/** One question in its own instance, answered at `min` (a minute later for each further step), closed run_end at `closeAt` (null: never closed). */
const answer = (block: string, item: string, min: number, steps: ('pass' | 'fail' | 'crash' | 'override')[], closeAt: number | null, id = `${block}~${item}`): object[] =>
  instance({ id, item, concept: FIXTURE_CONCEPT, phase: 'mock', block, start: at(min - 1), version: 2, kind: 'mcq', section: n(item) <= 20 ? 'methodology' : 'ga4',
    steps: steps.map((s, k) => (s === 'override' ? { at: at(min + k), override: true as const } : { at: at(min + k), submit: s })),
    close: closeAt === null ? null : { at: at(closeAt), reason: 'run_end' } });
const n = (id: string): number => Number(id.slice(-2));
const sum = (rows: readonly { correct: number; of: number }[]): [number, number] => [rows.reduce((s, r) => s + r.correct, 0), rows.reduce((s, r) => s + r.of, 0)];

// ---- N1 M4, F4-4-2: the review adds up to the history row ------------------------------------------------------------------------------

test('N1 M4 (F4-4-2, S7C-03, S7C-C04): a knowledge review\'s sections and topics add up to its history row, with or without item_ids, whatever the rules say now', () => {
  const logs: Record<string, object[]> = {
    // D116: a crash after 5 answers; recovery closed those and the block. Its 30 drawn questions are listed.
    'listed, crashed': [knowledgeOpen('K-1', KNOW), ...KNOW.slice(0, 5).flatMap((id, k) => answer('K-1', id, 1 + k, ['pass'], 10)), blockClose('K-1', at(10))],
    // A log before 0.7.2: every question closed run_end at its end, 24 right.
    'old, every question closed': [knowledgeOpen('K-2', null), ...KNOW.flatMap((id, k) => answer('K-2', id, 1 + k, [k < 24 ? 'pass' : 'fail'], 39)), blockClose('K-2', at(39))],
    // A log before 0.7.2 that a crash cut short: only its 3 answered questions are named (S7C-C04: still out of 30).
    'old, crashed': [knowledgeOpen('K-3', null), ...KNOW.slice(18, 21).flatMap((id, k) => answer('K-3', id, 1 + k, ['pass'], 5)), blockClose('K-3', at(5))],
    // The first answer that counts stands: a crash is no answer; a fail then a pass is a fail; an "I was right" copy is no answer; a second
    // instance of an answered question does not replace it; an answer after the end is not the run's.
    'first answers': [knowledgeOpen('K-4', KNOW), ...answer('K-4', KNOW[0]!, 1, ['crash', 'pass'], 39), ...answer('K-4', KNOW[1]!, 3, ['fail', 'pass'], 39),
      ...answer('K-4', KNOW[2]!, 5, ['fail', 'override'], 39), ...answer('K-4', KNOW[22]!, 7, ['pass'], 39), ...answer('K-4', KNOW[22]!, 9, ['fail'], 39, 'K-4~again'),
      ...answer('K-4', KNOW[25]!, 41, ['pass'], 41), blockClose('K-4', at(39))],
  };
  // The questions each run names: all it lists, or (a 0.7.1 log) what its records name. A topic is known only for those.
  const named: Record<string, number> = { 'listed, crashed': 30, 'old, every question closed': 30, 'old, crashed': 3, 'first answers': 30 };
  for (const [name, records] of Object.entries(logs)) {
    for (const file of [FILE, RAISED]) {
      const [row] = mockRuns(records as AttemptFileRecord[], file, NOW);
      const score = knowledgeScore(records, row!.block_id, Date.parse(row!.ended_at!), file.knowledge, topicOf);
      assert.deepEqual(sum(score.sections), [row!.correct, row!.total], `${name}: the sections add up to the row`);
      assert.deepEqual(sum(score.topics), [row!.correct, named[name]], `${name}: the topics add up to the questions it names`);
    }
  }
  const rowOf = (name: string, file = FILE) => { const r = mockRuns(logs[name] as AttemptFileRecord[], file, NOW)[0]!; return [r.correct, r.total]; };
  assert.deepEqual([rowOf('listed, crashed'), rowOf('listed, crashed', RAISED)], [[5, 30], [5, 30]], 'F4-4-2: a listed run keeps its own count');
  assert.deepEqual([rowOf('old, every question closed'), rowOf('old, every question closed', RAISED)], [[24, 30], [24, 35]], 'S7C-C04: an old run reads as 0.7.1 did');
  assert.deepEqual(rowOf('old, crashed'), [3, 30], 'S7C-C04: 0.7.1\'s total, never 3 of 3');
  assert.deepEqual(rowOf('first answers'), [2, 30], 'the crash-then-pass question and the one second instance passed');
  const split = knowledgeScore(logs['listed, crashed']!, 'K-1', Date.parse(at(10)), FILE.knowledge, topicOf);
  assert.deepEqual(split.sections, [{ section: 'methodology', correct: 5, of: 20 }, { section: 'ga4', correct: 0, of: 10 }], 'each section out of the run\'s own questions there');
  assert.deepEqual(split.topics, [{ section: 'methodology', topic: 'T-A', correct: 5, of: 15 }, { section: 'methodology', topic: 'T-B', correct: 0, of: 5 },
    { section: 'ga4', topic: 'T-G', correct: 0, of: 10 }]);
  // S7C-C04: an old run's unreached questions go to the sections short of their share, Methodology first, as 0.7.1 counted each section.
  const old = knowledgeScore(logs['old, crashed']!, 'K-3', Date.parse(at(5)), FILE.knowledge, topicOf);
  assert.deepEqual(old.sections, [{ section: 'methodology', correct: 2, of: 20 }, { section: 'ga4', correct: 1, of: 10 }]);
});

test('X2-M1: a question whose topic the content no longer holds still counts in its section, listed or not, so the sections add up to the row', () => {
  const gone = (id: string): KnowledgeTopic | undefined => (id === KNOW[3] ? undefined : topicOf(id));
  const listed = [knowledgeOpen('K-5', KNOW), ...KNOW.slice(0, 5).flatMap((id, k) => answer('K-5', id, 1 + k, ['pass'], 10)), blockClose('K-5', at(10))];
  const old = [knowledgeOpen('K-6', null), ...KNOW.flatMap((id, k) => answer('K-6', id, 1 + k, ['pass'], 39)), blockClose('K-6', at(39))];
  for (const [block, records] of [['K-5', listed], ['K-6', old]] as const) {
    const [row] = mockRuns(records as AttemptFileRecord[], FILE, NOW);
    const score = knowledgeScore(records, block, Date.parse(row!.ended_at!), FILE.knowledge, gone);
    assert.equal(sum(score.sections)[1], row!.total, `${block}: the sections add up to the row's total`);
    assert.equal(sum(score.sections)[1], 30, `${block}: out of 30`);
    assert.equal(score.sections[0]!.of, 20, `${block}: Methodology out of 20`);
  }
});

// ---- N1 M5, F4-1-6: one "ready" rule ---------------------------------------------------------------------------------------------------

const question = (id: string, section: 'methodology' | 'ga4'): KnowledgeQuestion =>
  ({ item: { id, section, enemy_group: null } as unknown as ChoiceItem, topic: section === 'ga4' ? 'T-G' : 'T-A' });
const pools = (methodology: number, ga4: number): KnowledgePools => ({
  methodology: Array.from({ length: methodology }, (_, k) => question(`Q-M-${k}`, 'methodology')), ga4: Array.from({ length: ga4 }, (_, k) => question(`Q-G-${k}`, 'ga4')),
});

test('N1 M5 (F4-1-6, S7-C21): knowledgeReadiness counts each pool\'s usable questions against its section\'s share; knowledgeReady is its verdict', () => {
  const rules = FILE.knowledge;
  assert.deepEqual(knowledgeReadiness(pools(20, 10), rules), { usable: { methodology: 20, ga4: 10 }, need: { methodology: 20, ga4: 10 }, short: [] });
  assert.deepEqual(knowledgeReadiness(pools(20, 9), rules).short, ['ga4']);
  assert.deepEqual(knowledgeReadiness(pools(19, 10), rules).short, ['methodology']);
  assert.deepEqual(knowledgeReadiness(pools(0, 0), rules).short, ['methodology', 'ga4']);
  assert.deepEqual([pools(20, 10), pools(20, 9), pools(19, 10)].map((p) => knowledgeReady(p, rules)), [true, false, false]);
});

// ---- N3 M1: one deadline rule and one minutes reader -------------------------------------------------------------------------------------

test('N3 M1: a mock run view\'s deadline is deadlineOf its start and minutes; one reader takes a mock_open\'s minutes for the score, the take-home rebuild and the review', () => {
  const plan: MockPlan = { kind: 'mock', mock: 'take_home', form_id: 'TAKE-HOME-A', minutes: 120.4, on_unseen: true, started_at: T0 };
  const run = { block_id: 'mock-take_home-1', plan, started_at: T0, ends_at: T0 + 24 * 3_600_000, servings: [], last: T0, inFlight: new Set<Promise<void>>() } as RunEntry & { plan: MockPlan };
  assert.equal(mockRunView(run).deadline_at, new Date(deadlineOf(T0, 120.4)).toISOString());
  assert.deepEqual([openMinutes({ minutes: 40 }), openMinutes({ minutes: 0.5 }), openMinutes({ minutes: 0 }), openMinutes({ minutes: -5 }), openMinutes({ minutes: '60' }), openMinutes({})],
    [40, 0.5, null, null, null, null], 'a number above 0, or none');
  // A take-home mock_open whose minutes is not a number: the rebuild reads none (the rules' then), as the score does.
  const open = { record: 'mock_open', schema_version: 7, ts: at(0), session_id: 'S-1', block_id: 'T-1', mock: 'take_home', form_id: 'TAKE-HOME-A', minutes: '60', on_unseen: true };
  assert.equal(openTakeHomes([open])[0]!.minutes, null);
  const answered = [open, ...answer('T-1', 'CASE-TAKE-A:CP1', 100, ['pass'], 101), blockClose('T-1', at(130))];
  assert.equal(mockRuns(answered as AttemptFileRecord[], FILE, NOW)[0]!.late, false, 'at 100 minutes, inside the rules\' 120, not the record\'s "60"');
});

// ---- D116: a case run's own core rubric lines -----------------------------------------------------------------------------------------

test('D116 (S7C-03): runCoreRubric reads a case run\'s own core lines from its mock_open, else the file\'s', () => {
  const caseOpen = (block: string, lines?: unknown) => ({ record: 'mock_open', schema_version: 7, ts: at(0), session_id: 'S-1', block_id: block, mock: 'case_round',
    form_id: 'CASE-ROUND-A', minutes: 45, on_unseen: true, pass_correct: 4, ...(lines === undefined ? {} : { core_rubric: lines }) });
  const records = [caseOpen('C-1', ['number', 'caveat']), caseOpen('C-2'), caseOpen('C-3', []), caseOpen('C-4', ['number', 7])];
  assert.deepEqual(runCoreRubric(records, 'C-1', 'case_round', FILE), ['number', 'caveat'], 'its own');
  for (const block of ['C-2', 'C-3', 'C-4', 'C-9']) assert.deepEqual(runCoreRubric(records, block, 'case_round', FILE), FILE.case_round.core_rubric, `${block}: the file's`);
  assert.deepEqual(runCoreRubric(records, 'C-2', 'case_round', undefined), [], 'no file, no lines');
});

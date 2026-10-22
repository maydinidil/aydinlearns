// tests/tools/tutor-eval-cases.test.ts: which questions the live eval asks (sprint 7 K1, S7-36), on an invented content store only: a typed
// (number) question and a case checkpoint join the GA4 and Methodology multiple-choice questions, each built from the app's own part, with
// its answer kept for the checks and its course text and snapshot free of any key. The eval's reply deadline is the effort's (L62). No
// provider, no key, no real content, no network, and the eval is never run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ContentStore } from '../../server/content.ts';
import { evalCases, type EvalCase } from '../../tools/tutor-eval.ts';

const OPTIONS = [{ oid: 'o1', text: 'Counts every page view twice' }, { oid: 'o2', text: 'Counts each user once per day' }, { oid: 'o3', text: 'Counts sessions started on a phone only' }];
const mcq = { id: 'GA4-X-01-Q1', section: 'ga4', kind: 'mcq', concept_id: 'GA4-X-01', stem: 'Which invented metric counts each person once?', options: OPTIONS, typed: null, held_out: false };
const typed = { id: 'MET-X-01-T1', section: 'methodology', kind: 'typed', concept_id: 'MET-X-01', stem: 'An invented shop had 80 visitors and 10 of them bought. What share bought?',
  options: [], typed: { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' }, held_out: false };
const heldTyped = { ...typed, id: 'MET-X-01-T0', stem: 'An invented held-out stem', held_out: true };
const CP1_OPTIONS = [{ oid: 'c1', text: 'Only completed orders placed this quarter' }, { oid: 'c2', text: 'Every order ever placed in any status' }, { oid: 'c3', text: 'Orders from the top ten customers only' }];
const caseRecord = (id: string, withCp1 = true) => ({ case_id: id, title: 'An invented case', world: 'RETAIL', level: 3, kind: 'inbox', persona: { name: 'Ada', role: 'Analyst' },
  brief: { decision: 'Which orders count?', deadline: 'Friday' }, data_needed: ['orders'], concept_ids: [],
  checkpoints: [...(withCp1 ? [{ id: `${id}:CP1`, kind: 'CP1', prompt: 'Which orders are in scope?', credits_concepts: [], item_id: `${id}:CP1`, options: CP1_OPTIONS }] : []),
    { id: `${id}:CP3`, kind: 'CP3', prompt: 'Write the query.', credits_concepts: [] }] });

function store(over: Partial<Record<string, unknown>> = {}): ContentStore {
  const items = { ga4: [mcq], methodology: [heldTyped, typed] } as Record<string, unknown[]>;
  const cases = [caseRecord('CASE-X-02', false), caseRecord('CASE-X-01'), caseRecord('CASE-X-03')];
  return {
    curriculum: { concepts: [] }, lesson: () => undefined, item: () => undefined, key: () => undefined, feedback: {}, builtSchemas: () => null,
    heldOut: (id: string) => id === heldTyped.id,
    choiceItems: (s: string) => items[s] ?? [], choiceItem: (id: string) => [mcq, typed, heldTyped].find((q) => q.id === id),
    choiceConcepts: (s: string) => (s === 'ga4' ? [{ id: 'GA4-X-01', title: 'An invented GA4 concept' }] : [{ id: 'MET-X-01', title: 'An invented methodology concept' }]),
    choiceKey: (id: string) => (id === mcq.id ? { correct_oid: 'o2' } : id === typed.id || id === heldTyped.id ? { value: 12.5 } : undefined),
    cases: () => cases, case: (id: string) => cases.find((c) => c.case_id === id),
    caseKey: (id: string) => (id === 'CASE-X-02' ? { choices: {} } : { choices: { CP1: { correct_oid: 'c2', explanation: 'Because.' } } }),
    ...over,
  } as unknown as ContentStore;
}
const noGrader = async () => null;
const kinds = (cs: EvalCase[]): string[] => cs.map((c) => `${c.kind}:${c.screen}`);

test('K1: the eval adds a typed (number) question and a case checkpoint after the multiple-choice questions, in a fixed order', async () => {
  const cases = await evalCases(store(), [], noGrader);
  assert.deepEqual(kinds(cases), ['choice:practice', 'typed:practice', 'checkpoint:case']);
  assert.deepEqual(cases.map((c) => [c.n, c.id]), [[1, 'GA4-X-01-Q1'], [2, 'MET-X-01-T1'], [3, 'CASE-X-01:CP1']], 'numbered after the others, so saved folders still match');
});

test('K1: the typed question: the stem on the screen, the number kept for the checks, the open item only', async () => {
  const q = (await evalCases(store(), [], noGrader)).find((c) => c.kind === 'typed')!;
  assert.deepEqual(q.answer, { kind: 'number', value: 12.5, decimals: 1 });
  assert.equal(q.id, 'MET-X-01-T1', 'never the held-out one, which sorts first');
  assert.match(q.snapshot, /80 visitors/, 'the stem is on the screen');
  assert.doesNotMatch(q.snapshot, /12\.5/, 'the number is not');
  assert.match(q.snapshot, /Status: not answered/);
  assert.doesNotMatch(q.snapshot, /Options, from the top/, 'a typed question has no options');
  assert.ok(q.words.includes('visitors'), 'a reply may name what the screen shows');
  assert.match(q.course ?? '', /^Question MET-X-01-T1 \(Methodology\):/m);
  assert.doesNotMatch(q.course ?? '', /12\.5/);
});

test('K1: the case checkpoint: the first case with a scope question and a key, its options listed top down, the correct one kept for the checks', async () => {
  const q = (await evalCases(store(), [], noGrader)).find((c) => c.kind === 'checkpoint')!;
  assert.equal(q.id, 'CASE-X-01:CP1', 'the case without a scope question is passed over');
  assert.deepEqual(q.answer, { kind: 'option', options: CP1_OPTIONS.map((o) => o.text), position: 2 });
  assert.match(q.snapshot, /^## Checkpoint: Scope$/m, 'labelled as the case screen labels it');
  assert.match(q.snapshot, /^First option: Only completed orders placed this quarter$/m);
  assert.match(q.snapshot, /^Second option: Every order ever placed in any status$/m);
  assert.doesNotMatch(q.snapshot, /c2|Because\./, 'no option ID and no explanation reach the snapshot');
  assert.match(q.course ?? '', /This question is CP1: Which orders are in scope\?/, 'the case brief and the checkpoint asked');
  assert.ok(q.words.includes('scope') || q.words.some((w) => /^order/i.test(w)), 'words of the screen');
});

test('K1: with no typed item or no checkpoint that qualifies, the eval simply asks the others', async () => {
  const none = store({ choiceItems: (s: string) => (s === 'ga4' ? [mcq] : []), cases: () => [caseRecord('CASE-X-02', false)], case: (id: string) => (id === 'CASE-X-02' ? caseRecord(id, false) : undefined) });
  assert.deepEqual(kinds(await evalCases(none, [], noGrader)), ['choice:practice']);
  const vague = store({ caseKey: () => ({ choices: { CP1: { correct_oid: 'c9', explanation: '' } } }) });
  assert.ok(!kinds(await evalCases(vague, [], noGrader)).includes('checkpoint:case'), 'a key that names no option is not a question');
});

test('L62: the eval gives each reply the effort\'s deadline (1, 2 or 4 minutes), not a fixed 120 seconds', async () => {
  const source = await readFile(new URL('../../tools/tutor-eval.ts', import.meta.url), 'utf8');
  assert.match(source, /AbortSignal\.timeout\(replyDeadlineMs\(effort\)\)/);
  assert.doesNotMatch(source, /REPLY_DEADLINE_MS|120_000/);
});

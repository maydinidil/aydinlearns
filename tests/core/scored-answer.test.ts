// Task B2 (S3-02, S3-07; Review Focus 4): a choice instance in a practice-mode run may hold several answers. Its rating reads
// the scored answer, the last one before the close; the cold-answer test reads the scored answer of the item's first instance
// that has an attempt. An instance with one answer (every sprint 2 instance, S2-61) rates exactly as before: the golden
// comparison replays a sprint 2 history and compares the whole result with the one written before this change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rateChoiceInstance, scoredAnswer, summarise, SQL_RATING_RULES, type AttemptFact, type InstanceFacts } from '../../core/rating.ts';
import { GA4, blockClose, card, exposure, instance, plus, run, snapshot, type Step } from '../helpers/replay-fixture.ts';
import { sprint2SingleAnswerLog } from '../helpers/s2-golden.ts';

const T0 = '2026-10-13T09:00:00Z';
const fact = (n: number, outcome: 'pass' | 'fail', confidence: 1 | 2 | 3 | 4 | null = null): AttemptFact => ({
  attempt_id: `A-${n}`, submitted_at: plus(T0, 10 * n), local_date: '2026-10-13', outcome, is_correct: outcome === 'pass', error_ids: [],
  grading_source: 'auto', active_ms: 5_000, target_ms: null, confidence,
});
const facts = (attempts: AttemptFact[]): InstanceFacts => ({
  instance_id: 'I-1', item_id: 'Q-GA4-801', family: 'choice', section: 'ga4', target_concept_id: GA4, phase: 'drill', block_id: 'MINI-1',
  repeat_exposure: false, started_at: T0, attempts, help: [], closed_at: plus(T0, 600), close_reason: 'run_end', override: 'none',
});
const rate = (attempts: AttemptFact[]) => rateChoiceInstance(summarise(facts(attempts), SQL_RATING_RULES), facts(attempts),
  { cardRated: true, lessonPhase: false, easyAllowed: true });

test('S3-02: the scored answer is the last one; the choice map rates it, its confidence included', () => {
  assert.equal(scoredAnswer(summarise(facts([fact(1, 'pass'), fact(2, 'fail')]), SQL_RATING_RULES))?.attempt_id, 'A-2');
  assert.equal(scoredAnswer(summarise(facts([]), SQL_RATING_RULES)), null);
  assert.deepEqual([rate([fact(1, 'pass', 4), fact(2, 'fail', 4)]).rating, rate([fact(1, 'pass', 4), fact(2, 'fail', 4)]).countsAsPass], [1, false],
    'right, then changed to wrong: Again');
  assert.deepEqual([rate([fact(1, 'fail', 4), fact(2, 'pass', 4)]).rating, rate([fact(1, 'fail', 4), fact(2, 'pass', 4)]).countsAsPass], [3, true],
    'wrong, then changed to right: Good');
  assert.equal(rate([fact(1, 'pass', 4), fact(2, 'pass', 2)]).rating, 2, 'the scored answer\'s confidence: Hard at 1 or 2');
  assert.equal(rate([]).why, 'not reached before the run ended');
});

/** A mini drill's instance: answered at +20 s, changed at +40 s and +60 s (practice mode), closed run_end at +5 min. */
const mini = (id: string, n: string, block: string, start: string, answers: ('pass' | 'fail')[]): object[] =>
  instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', phase: 'drill', block, version: 2, targetMs: null, start,
    steps: answers.map((submit, k): Step => ({ at: plus(start, 20 * (k + 1)), submit, confidence: 3, activeMs: 5_000, errors: [] })),
    close: { at: plus(start, 300), reason: 'run_end' } });

test('Review Focus 4: answer, change twice, then time runs out: the last answer is scored and rated at the block_close', () => {
  const read = exposure(GA4, '2026-10-12T08:00:00Z');
  const lastRight = run({ attempts: [read, ...mini('M-1', '801', 'MINI-1', T0, ['fail', 'fail', 'pass']), blockClose('MINI-1', plus(T0, 300))], events: [] });
  assert.equal(lastRight.instances.get('M-1')!.rating, 3);
  assert.deepEqual(lastRight.blocks.get('MINI-1')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(GA4), 3]]);
  const lastWrong = run({ attempts: [read, ...mini('M-1', '801', 'MINI-1', T0, ['pass', 'pass', 'fail']), blockClose('MINI-1', plus(T0, 300))], events: [] });
  assert.equal(lastWrong.instances.get('M-1')!.rating, 1, 'the first two answers were right; the scored one is wrong');
  assert.deepEqual(lastWrong.blocks.get('MINI-1')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(GA4), 1]]);
  // An answer logged after the close is no answer of the run (replay ignores it, as for any instance).
  const late = { ...(mini('M-1', '801', 'MINI-1', T0, ['pass'])[0] as object), attempt_id: 'LATE', submitted_at: plus(T0, 400), outcome: 'fail', is_correct: false };
  const withLate = run({ attempts: [read, ...mini('M-1', '801', 'MINI-1', T0, ['pass']), late, blockClose('MINI-1', plus(T0, 300))], events: [] });
  assert.equal(withLate.instances.get('M-1')!.rating, 3);
});

test('S3-07: the cold answer is the scored answer of the item\'s first instance with an attempt', () => {
  const read = exposure(GA4, '2026-10-12T08:00:00Z');
  const later = '2026-10-14T09:00:00Z';
  const practice = (id: string, start: string, submit: 'pass' | 'fail') => instance({ id, item: 'Q-GA4-801', concept: GA4, kind: 'mcq', section: 'ga4',
    version: 2, targetMs: null, start, steps: [{ at: plus(start, 20), submit, confidence: 3, activeMs: 5_000, errors: [] }] });
  const changedToRight = run({ attempts: [read, ...mini('M-1', '801', 'MINI-1', T0, ['fail', 'pass']), blockClose('MINI-1', plus(T0, 300)),
    ...practice('P-2', later, 'pass')], events: [] });
  assert.equal(changedToRight.instances.get('M-1')!.qualifying, true, 'scored right on the first instance: a cold answer');
  assert.equal(changedToRight.instances.get('P-2')!.qualifying, false, 'answered before');
  const changedToWrong = run({ attempts: [read, ...mini('M-1', '801', 'MINI-1', T0, ['pass', 'fail']), blockClose('MINI-1', plus(T0, 300)),
    ...practice('P-2', later, 'pass')], events: [] });
  assert.equal(changedToWrong.instances.get('M-1')!.qualifying, false, 'the first answer was right, the scored one wrong');
  assert.equal(changedToWrong.instances.get('P-2')!.qualifying, false, 'only the first instance with an attempt decides');
  // An unreached item of a run has no attempt, so the item's first instance with an attempt is the later one.
  const unreachedFirst = run({ attempts: [read, ...mini('M-1', '801', 'MINI-1', T0, []), blockClose('MINI-1', plus(T0, 300)),
    ...practice('P-2', later, 'pass')], events: [] });
  assert.equal(unreachedFirst.instances.get('P-2')!.qualifying, true);
});

test('golden: a sprint 2 history (one answer per choice instance) replays exactly as it did before Task B2', async () => {
  const stored = JSON.parse(await readFile('tests/fixtures/replay/sprint2-single-answer.json', 'utf8')) as unknown;
  const now = JSON.parse(JSON.stringify(snapshot(run(sprint2SingleAnswerLog())))) as unknown;
  assert.deepEqual(now, stored);
});

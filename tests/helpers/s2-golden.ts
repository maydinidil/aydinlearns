// tests/helpers/s2-golden.ts: a sprint 2 history in the shapes the sprint 2 server writes, with every choice instance answered
// once (S2-61), for the golden comparison of Task B2 (S3-02, S3-07): replay must give it exactly the result it gave before a
// choice instance could hold more than one answer. tests/fixtures/replay/sprint2-single-answer.json holds that result, written
// from this log by the replay of commit b5d6f01 (before Task B2). Every item here is invented.
import { A, B, GA4, blockClose, exposure, golden, instance, item, plus, primed, sessionEnd, sessionStart, type Log, type Step } from './replay-fixture.ts';

const MET = 'MET-TEST-01';
const at = (day: string, hms: string): string => `${day}T${hms}Z`;

/** golden() plus a sprint 2 study of GA4, Methodology and SQL choice items, a mixed block and an SQL drill. */
export function sprint2SingleAnswerLog(): Log {
  const g = golden();
  const d1 = '2026-10-12', d2 = '2026-10-13', d3 = '2026-10-14';
  const choice = (id: string, n: string, start: string, steps: Step[], over: Partial<Parameters<typeof instance>[0]> = {}): object[] =>
    instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start, steps, version: 2, ...over });
  const answer = (t: string, submit: 'pass' | 'fail', confidence: 1 | 2 | 3 | 4 | null = null): Step => ({ at: t, submit, confidence, activeMs: 5_000, errors: [] });
  const attempts: object[] = [
    ...g.attempts,
    exposure(GA4, at(d1, '08:00:00'), 'reading'),
    // Within 15 minutes of the reading: no review, not cold (S2-62).
    ...choice('C-LESSON', '01', at(d1, '08:05:00'), [answer(at(d1, '08:05:20'), 'pass', 4)]),
    // The first answer of item 02, correct, after the window: cold (S2-24) and the card's first rating.
    ...choice('C-COLD', '02', at(d1, '08:30:00'), [answer(at(d1, '08:30:20'), 'pass', 3)]),
    ...choice('C-WRONG', '03', at(d1, '08:40:00'), [answer(at(d1, '08:40:20'), 'fail', 4)]),
    // Item 02 again: answered before, so not cold.
    ...choice('C-AGAIN', '02', at(d2, '09:00:00'), [answer(at(d2, '09:00:20'), 'pass', 4)]),
    ...choice('C-UNSURE', '04', at(d2, '09:10:00'), [answer(at(d2, '09:10:20'), 'pass', 2)]),
    // The answer shown before answering: Again on a rated card (D14).
    ...choice('C-SHOWN', '05', at(d2, '09:20:00'), [{ at: at(d2, '09:20:10'), solution: true }, answer(at(d2, '09:20:40'), 'pass', 4)]),
    ...choice('C-REPEAT', '06', at(d2, '09:30:00'), [answer(at(d2, '09:30:20'), 'pass', 4)], { repeat: true, phase: 'review' }),
    // Shown after the answer: free.
    ...choice('C-AFTER', '07', at(d2, '09:40:00'), [answer(at(d2, '09:40:20'), 'fail', 3), { at: at(d2, '09:40:30'), solution: true }]),
    // Methodology: a typed answer and a multiple-choice one.
    exposure(MET, at(d1, '10:00:00'), 'reading'),
    ...instance({ id: 'M-TYPED', item: 'Q-MET-01', concept: MET, kind: 'typed', section: 'methodology', targetMs: null, start: at(d2, '10:00:00'), version: 2,
      steps: [answer(at(d2, '10:00:30'), 'pass', 3)] }),
    ...instance({ id: 'M-MCQ', item: 'Q-MET-02', concept: MET, kind: 'mcq', section: 'methodology', targetMs: null, start: at(d2, '10:10:00'), version: 2,
      steps: [answer(at(d2, '10:10:30'), 'fail', 1)] }),
    // An SQL predict item (other_sql: the choice map).
    ...instance({ id: 'S-PREDICT', item: item(A, 'P1-01'), concept: A, kind: 'predict_rows', phase: 'review', targetMs: null, start: at(d2, '11:00:00'), version: 2,
      steps: [answer(at(d2, '11:00:30'), 'pass', 2)] }),
    // A mixed block with a choice item and an SQL item.
    ...choice('B-CHOICE', '08', at(d3, '09:00:00'), [answer(at(d3, '09:00:20'), 'fail', 4)], { phase: 'mixed', block: 'MIX-1' }),
    ...instance({ id: 'B-SQL', item: item(A, 'E1-70'), concept: A, phase: 'mixed', block: 'MIX-1', start: at(d3, '09:01:00'), version: 2,
      steps: [{ at: at(d3, '09:02:00'), submit: 'pass', activeMs: 60_000 }] }),
    blockClose('MIX-1', at(d3, '09:03:00')),
    // An SQL drill: a pass, a fail, and an item the run never reached (S2-97).
    ...primed(B, '2026-10-11'),
    ...instance({ id: 'D-PASS', item: item(B, 'E1-31'), concept: B, phase: 'drill', block: 'DRL-1', start: at(d3, '10:00:00'), version: 2,
      steps: [{ at: at(d3, '10:01:00'), submit: 'pass', activeMs: 60_000 }], close: { at: at(d3, '10:20:00'), reason: 'run_end' } }),
    ...instance({ id: 'D-FAIL', item: item(A, 'E1-31'), concept: A, phase: 'drill', block: 'DRL-1', start: at(d3, '10:02:00'), version: 2,
      steps: [{ at: at(d3, '10:03:00'), submit: 'fail', activeMs: 60_000 }], close: { at: at(d3, '10:20:00'), reason: 'run_end' } }),
    ...instance({ id: 'D-UNREACHED', item: item(B, 'E2-32'), concept: B, phase: 'drill', block: 'DRL-1', start: at(d3, '10:20:00'), version: 2,
      steps: [], close: { at: at(d3, '10:20:00'), reason: 'run_end' } }),
    blockClose('DRL-1', at(d3, '10:20:00')),
  ];
  const events: object[] = [...g.events,
    sessionStart('S3', at(d1, '07:59:00')), sessionEnd('S3', plus(at(d1, '10:00:00'), 60)),
    sessionStart('S4', at(d2, '08:59:00')), sessionEnd('S4', at(d2, '11:30:00')),
    sessionStart('S5', at(d3, '08:59:00')), sessionEnd('S5', at(d3, '10:30:00'))];
  return { attempts, events };
}

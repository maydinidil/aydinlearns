// tests/helpers/replay-logs.ts: the log builders of the log version 5 and 6 replay tests (tests/core/replay-v5.test.ts and
// replay-v6.test.ts), shared so the log version 7 test (tests/server/log-v7.test.ts) replays them too (sprint 7 Part 2, Task N2; L86).
// Version 5: a short SQL and GA4 history with two lab_answer records put in. Version 6: an SQL pass and a GA4 pass, each on a rated card,
// with answered tutor questions put in. Every record here is invented.
import type { LabAnswer } from '../../schemas/log-ext.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { instance, item, primed, A, C, GA4, type Log } from './replay-fixture.ts';

const at = (hms: string): string => `2026-11-03T${hms}Z`;

// ---- version 5 (D68): lab_answer ------------------------------------------------------------------------------------------------------

export const labAnswer = (ts: string, over: Partial<LabAnswer> = {}): LabAnswer => ({
  record: 'lab_answer', schema_version: SCHEMA_VERSION, ts, session_id: 'S-V5', lab_id: 'LAB-GA4-01', lab_version: 1, kind: 'first',
  month: '2026-10', range: null,
  parts: [{ part_id: 'P1', value: 'Sessions', result: 'pass' }, { part_id: 'P2', value: 42, result: 'fail' }, { part_id: 'P3', value: null, result: 'not_checked' }],
  note: null, ...over,
});

/** Two SQL instances and a GA4 one, version 2 records, on 3 November 2026. */
export function attemptsOnly(): Log {
  const attempts = [
    ...instance({ id: 'V5-1', item: item(A, 'E1-01'), concept: A, start: at('09:01:00'), steps: [{ at: at('09:02:00'), submit: 'fail', errors: ['ERR-LOG-00'] }, { at: at('09:03:00'), submit: 'pass' }], version: 2 }),
    ...instance({ id: 'V5-2', item: item(C, 'E1-02'), concept: C, start: at('09:05:00'), steps: [{ at: at('09:06:30'), submit: 'pass' }], version: 2 }),
    ...instance({ id: 'V5-3', item: 'EX-GA4-SETUP-01-Q1', concept: GA4, section: 'ga4', kind: 'mcq', start: at('09:10:00'), steps: [{ at: at('09:11:00'), submit: 'pass' }], version: 2 }),
  ];
  return { attempts, events: [] };
}
/** The log with a first lab answer and a recheck put in among its records. */
export const withLab = (log: Log): Log => ({ ...log, attempts: [log.attempts[0], labAnswer(at('09:02:30')), ...log.attempts.slice(1, 4), labAnswer(at('09:07:00'), { kind: 'recheck', range: { from: '2026-10-01', to: '2026-10-31' }, month: null, note: 'again' }), ...log.attempts.slice(4)] });

// ---- version 6 (D95): tutor_asked ------------------------------------------------------------------------------------------------------

export const SQL_ITEM = item(A, 'E1-01');
/** A tutor_asked record, answered unless `over` says otherwise; with `id` null it names no instance. */
export const tutor = (id: string | null, ts: string, over: object = {}) => ({
  record: 'tutor_asked', schema_version: 6, ts, session_id: 'S-1', screen: 'item', item_instance_id: id,
  item_id: id === null ? null : SQL_ITEM, target_concept_id: id === null ? null : A, phase: id === null ? null : 'free',
  provider: 'fake', model: 'fake', prompt_version: 1, input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, cost_usd: 0, outcome: 'answered', ...over,
});
/** Both cards are rated the day before, so S2-02 holds no rating back; 90 s against a 120 s target is Good, not Easy. */
export const BASE = [...primed(A, '2026-11-02'), ...primed(GA4, '2026-11-02')];
export const sqlPass = (): object[] => instance({ id: 'T-1', item: SQL_ITEM, concept: A, start: at('09:00:00'), steps: [{ at: at('09:02:00'), submit: 'pass', activeMs: 90_000 }], version: 2 });
export const ga4Pass = (): object[] => instance({ id: 'T-2', item: 'EX-GA4-SETUP-01-Q1', concept: GA4, section: 'ga4', kind: 'mcq', start: at('09:10:00'),
  steps: [{ at: at('09:11:00'), submit: 'pass', confidence: 3 }], version: 2 });
/** The records with `extra` put in at `index`. */
export const put = (records: object[], index: number, extra: object): object[] => [...records.slice(0, index), extra, ...records.slice(index)];
/** A version 6 history: both passes, each after an answered tutor question, and a question that names no instance. */
export const tutorLog = (): Log => ({ attempts: [...BASE, ...put(sqlPass(), 0, tutor('T-1', at('09:01:00'))),
  ...put(ga4Pass(), 0, tutor('T-2', at('09:10:30'), { item_id: 'EX-GA4-SETUP-01-Q1', target_concept_id: GA4, screen: 'practice' })),
  tutor(null, at('09:20:00'), { screen: 'today' })], events: [] });

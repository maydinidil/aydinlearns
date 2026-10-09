// tests/core/replay-v5.test.ts: log version 5 (owner decision D68, Task A1). A lab_answer record rates no card: replay and the
// progress views give the same result with or without it. Every record here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { LabAnswer } from '../../schemas/log-ext.ts';
import { AttemptLogger } from '../../server/log.ts';
import { instanceFacts, revealRate, topicReadiness, trends } from '../../server/progress.ts';
import { instance, item, run, snapshot, A, C, GA4, card, type Log } from '../helpers/replay-fixture.ts';

const at = (hms: string): string => `2026-11-03T${hms}Z`;
const TODAY = '2026-11-03';

const labAnswer = (ts: string, over: Partial<LabAnswer> = {}): LabAnswer => ({
  record: 'lab_answer', schema_version: SCHEMA_VERSION, ts, session_id: 'S-V5', lab_id: 'LAB-GA4-01', lab_version: 1, kind: 'first',
  month: '2026-10', range: null,
  parts: [{ part_id: 'P1', value: 'Sessions', result: 'pass' }, { part_id: 'P2', value: 42, result: 'fail' }, { part_id: 'P3', value: null, result: 'not_checked' }],
  note: null, ...over,
});

function attemptsOnly(): Log {
  const attempts = [
    ...instance({ id: 'V5-1', item: item(A, 'E1-01'), concept: A, start: at('09:01:00'), steps: [{ at: at('09:02:00'), submit: 'fail', errors: ['ERR-LOG-00'] }, { at: at('09:03:00'), submit: 'pass' }], version: 2 }),
    ...instance({ id: 'V5-2', item: item(C, 'E1-02'), concept: C, start: at('09:05:00'), steps: [{ at: at('09:06:30'), submit: 'pass' }], version: 2 }),
    ...instance({ id: 'V5-3', item: 'EX-GA4-SETUP-01-Q1', concept: GA4, section: 'ga4', kind: 'mcq', start: at('09:10:00'), steps: [{ at: at('09:11:00'), submit: 'pass' }], version: 2 }),
  ];
  return { attempts, events: [] };
}
const withLab = (log: Log): Log => ({ ...log, attempts: [log.attempts[0], labAnswer(at('09:02:30')), ...log.attempts.slice(1, 4), labAnswer(at('09:07:00'), { kind: 'recheck', range: { from: '2026-10-01', to: '2026-10-31' }, month: null, note: 'again' }), ...log.attempts.slice(4)] });

test('the log version is 5', () => assert.equal(SCHEMA_VERSION, 5));

test('replay over a log with lab_answer records gives the same result and no warnings', () => {
  const plain = attemptsOnly();
  const labbed = withLab(plain);
  assert.equal(labbed.attempts.filter((r) => (r as { record: string }).record === 'lab_answer').length, 2);
  const before = run(plain);
  const after = run(labbed);
  assert.deepEqual(after.warnings, []);
  assert.deepEqual(snapshot(after), snapshot(before));
});

test('trends, revealRate and topicReadiness give the same result with and without lab_answer records', () => {
  const plain = attemptsOnly();
  const labbed = withLab(plain);
  const views = (log: Log) => {
    const facts = instanceFacts(run(log), log.attempts, log.events);
    return {
      trends: trends(facts, TODAY),
      reveal: revealRate(facts, TODAY),
      readiness: topicReadiness({ section: 'ga4', facts, records: log.attempts, today: TODAY, topics: [{ topic_id: 'T-GA4-01', title: 'Setup' }],
        topicOf: (f) => (f.concept_id === GA4 ? 'T-GA4-01' : null), cardOf: card, windowMs: 15 * 60_000 }),
    };
  };
  assert.deepEqual(views(labbed), views(plain));
  assert.equal(views(plain).readiness.topics[0].first_answers.total, 1, 'the log does hold a GA4 answer, so the comparison is not empty');
});

test('Logger.labAnswer appends one line to the attempt file of the record month', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-v5-'));
  const logger = new AttemptLogger(openJsonlLog(dir));
  const seen: string[] = [];
  logger.onWrite((file, r) => seen.push(`${file}:${(r as { record?: string }).record}`));
  const a = labAnswer('2026-11-04T09:30:00.000Z');
  await logger.labAnswer(a);
  assert.deepEqual(await readdir(dir), ['attempts-2026-11.jsonl']);
  const lines = (await readFile(join(dir, 'attempts-2026-11.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), a);
  assert.match(lines[0], /"schema_version":5/);
  assert.deepEqual(seen, ['attempts:lab_answer']);
});

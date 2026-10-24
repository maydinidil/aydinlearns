// tests/core/replay-v5.test.ts: log version 5 (owner decision D68, Task A1). A lab_answer record rates no card: replay and the
// progress views give the same result with or without it. Every record here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { instanceFacts, revealRate, topicReadiness, trends } from '../../server/progress.ts';
import { run, snapshot, GA4, card, type Log } from '../helpers/replay-fixture.ts';
// L86 (Task N2): the builders live in a helper, so the log version 7 test replays this log too.
import { attemptsOnly, labAnswer, withLab } from '../helpers/replay-logs.ts';

const TODAY = '2026-11-03';

test('the log version is 8 (5 added lab_answer; 8 is D123, tests/server/log-v8.test.ts)', () => assert.equal(SCHEMA_VERSION, 8));

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
  assert.match(lines[0], new RegExp(`"schema_version":${SCHEMA_VERSION}`));
  assert.deepEqual(seen, ['attempts:lab_answer']);
});

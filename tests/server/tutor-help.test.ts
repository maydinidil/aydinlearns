// tests/server/tutor-help.test.ts: the readers outside replay that treat a tutor question as help (T-05): startup recovery closes an
// instance that was only asked about, the Progress facts mark it helped, the logger writes version 6, and the journey gets counts only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, type TutorAsked } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { recoveredCloses } from '../../server/app.ts';
import { AttemptLogger } from '../../server/log.ts';
import { instanceFacts } from '../../server/progress.ts';
import { journeyTap } from '../../server/journey-tap.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { instance, item, run, A } from '../helpers/replay-fixture.ts';

const SQL_ITEM = item(A, 'E1-01');
const asked = (over: Partial<TutorAsked> = {}): TutorAsked => ({
  record: 'tutor_asked', schema_version: SCHEMA_VERSION, ts: '2026-11-03T09:01:00.000Z', session_id: 'S-1', screen: 'item',
  item_instance_id: 'T-9', item_id: SQL_ITEM, target_concept_id: A, phase: 'free', provider: 'claude', model: 'claude-haiku-5-5', effort: 'high', prompt_version: 1,
  input_tokens: 2400, cached_input_tokens: 0, output_tokens: 500, cost_usd: 0.00049, outcome: 'answered', ...over,
});

test('recovery closes an instance that was only asked about; a failed question opens nothing', () => {
  const closes = recoveredCloses([asked(), asked({ item_instance_id: 'T-10', outcome: 'error' })], new Map(), []);
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.item_id, c.reason, c.raw_outcome.max_hint_level]), [['T-9', SQL_ITEM, 'session_end', 0]]);
});

test('Progress marks an instance helped when a tutor question came before its close', () => {
  const records = instance({ id: 'T-9', item: SQL_ITEM, concept: A, start: '2026-11-03T09:00:00.000Z', steps: [{ at: '2026-11-03T09:02:00.000Z', submit: 'pass' }], version: 2 });
  const log = { attempts: [asked(), ...records], events: [] };
  const fact = instanceFacts(run(log), log.attempts, log.events).find((f) => f.instance_id === 'T-9')!;
  assert.equal(fact.helped, true);
  assert.equal(fact.summary.maxHintBeforePass, 1);
  const failedLog = { attempts: [asked({ outcome: 'error' }), ...records], events: [] };
  assert.equal(instanceFacts(run(failedLog), failedLog.attempts, failedLog.events).find((f) => f.instance_id === 'T-9')!.helped, false);
});

test("S7-33: Progress's help share leaves out a tutor question asked after the pass; one before it, or on an item never passed, counts", () => {
  // Passed at 09:02, closed at 09:02:30: a question asked at 09:02:10 came after the pass, within the instance.
  const passed = instance({ id: 'T-9', item: SQL_ITEM, concept: A, start: '2026-11-03T09:00:00.000Z', steps: [{ at: '2026-11-03T09:02:00.000Z', submit: 'pass' }], version: 2 });
  const failed = instance({ id: 'T-9', item: SQL_ITEM, concept: A, start: '2026-11-03T09:00:00.000Z', steps: [{ at: '2026-11-03T09:02:00.000Z', submit: 'fail' }], version: 2 });
  const helped = (attempts: object[]): boolean => instanceFacts(run({ attempts, events: [] }), attempts, []).find((f) => f.instance_id === 'T-9')!.helped;
  const after = asked({ ts: '2026-11-03T09:02:10.000Z' });
  assert.equal(helped([...passed, after]), false, 'asked after the pass: no help');
  assert.equal(helped([asked(), ...passed]), true, 'asked before the pass: help');
  assert.equal(helped([...failed, after]), true, 'never passed: a question before the close is help');
  // A hint after the pass keeps its old reading: help before the close.
  const hint = { record: 'hint_opened', schema_version: 2, ts: '2026-11-03T09:02:10.000Z', item_instance_id: 'T-9', level: 1, item_id: SQL_ITEM, target_concept_id: A, phase: 'free' };
  assert.equal(helped([...passed, hint]), true);
});

test('the logger writes the record as version 6; the journey gets its counts and effort (block P), never text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-tutor-log-'));
  const jdir = await mkdtemp(join(tmpdir(), 'al-tutor-journey-'));
  try {
    startJourney({ dir: jdir });
    const logger = new AttemptLogger(openJsonlLog(dir));
    logger.onWrite(journeyTap({ topicOf: () => null, states: () => new Map() }));
    await logger.tutorAsked(asked({ ts: new Date().toISOString() }));
    await stopJourney();
    const [file] = await readdir(dir);
    assert.match(await readFile(join(dir, file!), 'utf8'), /"record":"tutor_asked","schema_version":8/);
    const events: JourneyRecord[] = [];
    for (const f of await readdir(jdir)) events.push(...(await readFile(join(jdir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
    const e = events.find((x) => x.event === 'tutor_asked')!;
    assert.deepEqual({ screen: e.screen, item_id: e.item_id, provider: e.provider, model: e.model, effort: e.effort, input_tokens: e.input_tokens, output_tokens: e.output_tokens, cost_usd: e.cost_usd, outcome: e.outcome },
      { screen: 'item', item_id: SQL_ITEM, provider: 'claude', model: 'claude-haiku-5-5', effort: 'high', input_tokens: 2400, output_tokens: 500, cost_usd: 0.00049, outcome: 'answered' });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(jdir, { recursive: true, force: true });
  }
});

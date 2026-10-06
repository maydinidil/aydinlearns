// tests/server/state.test.ts: the learner state the server holds (Task B7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, type ItemClose } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { replay } from '../../core/replay.ts';
import { PRESETS } from '../../schemas/presets.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { A, C, card, cardReset, configChange, exposure, instance, item, override, snapshot, type InstanceSpec, type Step } from '../helpers/replay-fixture.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const newState = (attempts: object[] = [], events: object[] = []) => new LearnerState({ content, attempts, events, examDate: () => null });
const draft = (over: Partial<ItemClose>): ItemClose => ({
  record: 'item_close', schema_version: 2, ts: '2026-10-12T08:31:00.000Z', item_instance_id: 'I-1', item_id: item(A, 'E1-06'), target_concept_id: A,
  phase: 'free', block_id: null, reason: 'pass',
  raw_outcome: { graded_attempts: 1, passed: true, first_attempt_pass: true, max_hint_level: 0, revealed_before_attempt: false, active_ms: 60_000 },
  instance_rating: null, card_reviews: [], ...over });

test('the catalog maps concepts, cards, item families and errors from the content (S2-50)', () => {
  const cat = buildCatalog(content);
  assert.deepEqual([cat.sectionOf(FIXTURE_CONCEPT), cat.sectionOf('SQL-AGG-01'), cat.sectionOf('GA4-SETUP-01'), cat.sectionOf('NOPE-01')], ['sql', 'sql', null, null]);
  assert.equal(cat.cardOf(FIXTURE_CONCEPT), 'CARD-SQL-FILTER-02');
  assert.deepEqual([cat.familyOf(lesson.pool_item_ids[0]!, ''), cat.familyOf('EX-SQL-GONE-01-E1-01', ''), cat.familyOf('EX-SQL-GONE-01-E1-02', 'fix'),
    cat.familyOf('Q-GA4-01', 'mcq'), cat.familyOf('EX-SQL-GONE-01-E1-03', 'predict_rows')], ['write', 'write', 'fix', 'choice', 'other_sql']);
  assert.deepEqual([cat.conceptForError('ERR-LOG-13'), cat.conceptForError('ERR-NOPE-01')], ['SQL-FILTER-01', null]);
  assert.deepEqual([cat.creditsOf(lesson.pool_item_ids[0]!), cat.pretestCount], [null, 2]);
});
test('the catalog takes the openers\' credits and the GA4 parents from the content once later tasks provide them', () => {
  const extended: ContentStore = { ...content,
    checkpointCredits: (id) => (id === 'EX-OPENER-L1' ? ['SQL-BASICS-01', 'SQL-FILTER-01'] : undefined),
    choiceConcept: (id) => (id === 'GA4-ADMIN-20' ? { section: 'ga4', card_concept_id: 'GA4-METRICS-01' } : undefined) };
  const cat = buildCatalog(extended);
  assert.deepEqual([cat.creditsOf('EX-OPENER-L1'), cat.familyOf('EX-OPENER-L1', 'write')], [['SQL-BASICS-01', 'SQL-FILTER-01'], 'checkpoint']);
  assert.deepEqual([cat.sectionOf('GA4-ADMIN-20'), cat.cardOf('GA4-ADMIN-20')], ['ga4', 'CARD-GA4-METRICS-01']);
});
test('current() is memoised on the record count; a report never changes it (S2-15)', () => {
  const s = newState();
  const first = s.current();
  assert.equal(s.current(), first, 'the same object until a record arrives');
  s.record('reports', { event: 'content_report', schema_version: 2, ts: '2026-10-12T08:00:00Z', item_id: 'x', text: 'y' });
  assert.equal(s.current(), first, 'reports are not replayed');
  s.record('attempts', exposure(A, '2026-10-12T08:00:00Z'));
  const second = s.current();
  assert.notEqual(second, first);
  assert.equal(second.concepts.get(A)!.state, 'learning');
});
test('rateClose rates a draft by a replay that includes it, and leaves the state alone until the close is written', () => {
  const recs = [exposure(A, '2026-10-12T08:00:00Z'), ...instance({ id: 'I-1', item: item(A, 'E1-06'), start: '2026-10-12T08:30:00Z',
    steps: [{ at: '2026-10-12T08:30:30Z', submit: 'pass', activeMs: 100_000 }], close: null })];
  const s = newState(recs);
  const before = s.current();
  const rated = s.rateClose(draft({}));
  assert.equal(rated.instance_rating, 3);
  assert.deepEqual(rated.card_reviews, replay([...recs, draft({})], [], replayOptions(buildCatalog(content), new Date())).instances.get('I-1')!.card_reviews);
  assert.equal(s.current(), before, 'a draft is not a record');
  s.record('attempts', rated);
  assert.deepEqual(s.current().instances.get('I-1')!.card_reviews, rated.card_reviews);
  assert.deepEqual(s.current().warnings, [], 'the written close matches the replay');
});
test('rateBlockClose writes one review per card with the worst rating in the block (S2-04)', () => {
  const s = newState([exposure(A, '2026-10-12T08:00:00Z'),
    ...instance({ id: 'M-1', item: item(A, 'E1-30'), phase: 'mixed', block: 'BLK-1', start: '2026-10-12T09:00:00Z', steps: [{ at: '2026-10-12T09:00:30Z', submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'M-2', item: item(A, 'E1-31'), phase: 'mixed', block: 'BLK-1', start: '2026-10-12T09:02:00Z', steps: [{ at: '2026-10-12T09:02:30Z', submit: 'fail' }] })]);
  const b = s.rateBlockClose({ record: 'block_close', schema_version: 2, ts: '2026-10-12T09:10:00.000Z', block_id: 'BLK-1', card_reviews: [] });
  assert.deepEqual(b.card_reviews.map((c) => [c.card_id, c.rating]), [['CARD-SQL-BASICS-01', 1]]);
});

// Design §17 (Task B17): "Replay reproduces the cached state, including config changes, resets, override confirms and reverts".
// The cached state is what the server logged as it went: every close and block close rated by the live state, with its card
// reviews and their snapshots. A later start rebuilds the state from the files alone.
test('replay reproduces the cached state: closes and a block close rated live, across a config_change, a reset, an override confirm and a revert, rebuild from the files to the same state and the same reviews, with no warning (design §17, S2-15)', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-cached-')));
  const logger = new AttemptLogger(log);
  const live = newState();
  logger.onWrite((file, r) => live.record(file, r));
  /** An instance as the server writes it: its attempts, then its close, rated by a replay that includes it (S2-15). */
  const work = async (spec: InstanceSpec): Promise<void> => {
    const recs = instance({ version: 2, ...spec });
    for (const r of recs.slice(0, -1)) await logger.attempt(r as never);
    await logger.itemClose(live.rateClose(recs.at(-1) as ItemClose, new Date(spec.close!.at)));
  };
  const seen = (concept: string, ts: string) => logger.exposure({ record: 'exposure', schema_version: SCHEMA_VERSION, ts, concept_id: concept, kind: 'reading' });
  const pass = (at: string): Step => ({ at, submit: 'pass', activeMs: 100_000 });
  const fail = (at: string): Step => ({ at, submit: 'fail' });
  const at = (day: string, hms: string): string => `2026-10-${day}T${hms}.000Z`;

  // 12 October: both concepts read and rated Good from the map (S2-03), under sql-v1.
  await seen(A, at('12', '08:00:00'));
  await seen(C, at('12', '08:01:00'));
  await work({ id: 'P-A', item: item(A, 'E1-06'), concept: A, start: at('12', '08:30:00'), steps: [pass(at('12', '08:30:30'))], close: { at: at('12', '08:31:00') } });
  await work({ id: 'P-C', item: item(C, 'E1-06'), concept: C, start: at('12', '08:40:00'), steps: [pass(at('12', '08:40:30'))], close: { at: at('12', '08:41:00') } });
  // A config change from 13 October; then reviews under it, and an "I was right" on each card.
  await logger.event(configChange('sql-v2', { ...PRESETS.sql, desired_retention: 0.85 }, at('13', '00:00:00')) as never);
  await work({ id: 'V-A', item: item(A, 'E1-07'), concept: A, phase: 'review', start: at('14', '09:00:00'), steps: [pass(at('14', '09:00:30'))], close: { at: at('14', '09:01:00') } });
  await work({ id: 'O-A', item: item(A, 'E1-08'), concept: A, phase: 'review', start: at('14', '09:10:00'),
    steps: [fail(at('14', '09:10:30')), { at: at('14', '09:11:00'), override: true, id: 'OVR-A' }], close: { at: at('14', '09:11:30') } });
  await work({ id: 'O-C', item: item(C, 'E1-08'), concept: C, phase: 'review', start: at('14', '09:20:00'),
    steps: [fail(at('14', '09:20:30')), { at: at('14', '09:21:00'), override: true, id: 'OVR-C' }], close: { at: at('14', '09:21:30') } });
  // The weekly tune-up confirms the first and reverts the second.
  await logger.event(override('override_confirm', 'OVR-A', at('15', '08:00:00')) as never);
  await logger.event(override('override_revert', 'OVR-C', at('15', '08:01:00')) as never);
  // A mixed block on both cards, closed with one review per card at the worst rating (S2-04).
  await work({ id: 'M-A', item: item(A, 'E1-09'), concept: A, phase: 'mixed', block: 'BLK-1', start: at('16', '09:00:00'), steps: [pass(at('16', '09:00:30'))], close: { at: at('16', '09:01:00') } });
  await work({ id: 'M-C', item: item(C, 'E1-09'), concept: C, phase: 'mixed', block: 'BLK-1', start: at('16', '09:02:00'), steps: [fail(at('16', '09:02:30'))], close: { at: at('16', '09:03:00') } });
  await logger.blockClose(live.rateBlockClose({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: at('16', '09:03:00'), block_id: 'BLK-1', card_reviews: [] }, new Date(at('16', '09:03:00'))));
  // A reset (the card_event the server writes for a leech, S2-27): a new empty card. The next record is the new first exposure,
  // a reading, and the new card's first rating comes from an attempt 15 minutes or more after it (S2-03).
  await logger.event(cardReset(card(A), at('17', '08:00:00')) as never);
  await seen(A, at('17', '08:05:00'));
  await work({ id: 'R-A', item: item(A, 'E1-10'), concept: A, phase: 'review', start: at('17', '08:40:00'), steps: [pass(at('17', '08:40:30'))], close: { at: at('17', '08:41:00') } });

  // The next start: a state built from the files alone.
  const files = new LearnerState({ content, attempts: await log.readAll('attempts'), events: await log.readAll('events'), examDate: () => null });
  const r = files.current();
  assert.deepEqual(snapshot(r), snapshot(live.current()), 'the state rebuilt from the files equals the state the server held');
  assert.deepEqual(r.warnings, [], 'every logged rating and card review agrees with the replay');
  // What each close logged is what the replay gives, review snapshots included, except the close a revert decided later (S2-75).
  const logged = (await log.readAll('attempts')) as Record<string, any>[];
  for (const c of logged.filter((x) => x.record === 'item_close')) {
    const i = r.instances.get(c.item_instance_id)!;
    if (c.item_instance_id === 'O-C') assert.deepEqual([c.instance_rating, i.rating, i.countsAsPass], [2, 1, false], 'logged Hard while pending; the revert makes it Again (S2-19)');
    else assert.deepEqual([c.instance_rating, c.card_reviews], [i.rating, i.card_reviews], c.item_instance_id);
  }
  const block = logged.find((x) => x.record === 'block_close')!;
  assert.deepEqual(block.card_reviews, r.blocks.get('BLK-1')!.card_reviews);
  assert.deepEqual(block.card_reviews.map((x: any) => [x.card_id, x.rating, x.scheduler_config_id]), [[card(A), 3, 'sql-v2'], [card(C), 1, 'sql-v2']]);
  const config = (id: string) => logged.find((x) => x.item_instance_id === id && x.record === 'item_close')!.card_reviews.map((x: any) => x.scheduler_config_id);
  assert.deepEqual([config('P-A'), config('V-A'), config('R-A')], [['sql-v1'], ['sql-v2'], ['sql-v2']], 'the preset in force at each review (S2-13)');
  assert.deepEqual([r.instances.get('O-A')!.rating, r.instances.get('O-A')!.qualifying], [2, true], 'a confirmed first-attempt override stays Hard and qualifies (S2-10)');
  const a = r.cards.get(card(A))!;
  assert.deepEqual([a.origin, a.snapshot.reps, a.last_review], ['reset', 1, at('17', '08:41:00')], 'after the reset, only R-A has reviewed the new card');
  assert.deepEqual([r.concepts.get(A)!.firstExposureAt, r.concepts.get(A)!.state, r.concepts.get(A)!.practisedItems], [at('17', '08:05:00'), 'learning', 1],
    'Practised and the first exposure start again from the reset (S2-27)');
});

// tests/server/journey-tap.test.ts: the journey events the app's own log tells (D77). Each record maps to one event with IDs and
// outcomes, and never the learner's words; concept state changes are reported once; nothing a tap does can fail a write. IDs are made up.
// Every temporary folder is removed at the end.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConceptStateName } from '../../core/states.ts';
import { journey, startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { journeyTap, topicFinder } from '../../server/journey-tap.ts';

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const tmp = async () => { const d = await mkdtemp(join(tmpdir(), 'al-journey-tap-')); made.push(d); return d; };
const later = () => new Promise<void>((done) => setImmediate(done));
async function lines(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of await readdir(dir)) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  return out;
}
const events = async (dir: string): Promise<JourneyRecord[]> =>
  (await lines(dir)).filter((r) => r.event !== 'session_started' && r.event !== 'session_ended');
const base = { schema_version: 5, ts: '2026-10-13T08:00:00.000Z', item_instance_id: 'I-1' };

test('help, closes, exposures and app events become journey events, with IDs and outcomes only', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const tap = journeyTap({ topicOf: (id) => (id.startsWith('SQL-') ? 'SQL' : null), states: () => new Map() });
  tap('attempts', { ...base, record: 'hint_opened', level: 2, item_id: 'SQL-A-01-W01', target_concept_id: 'SQL-A-01', phase: 'practice' });
  tap('attempts', { ...base, record: 'solution_opened', item_id: 'SQL-A-01-W01', target_concept_id: 'SQL-A-01', phase: 'review', card_id: 'CARD-1' });
  tap('attempts', { ...base, record: 'other_way_opened', item_id: 'SQL-A-01-W01', target_concept_id: 'SQL-A-01', phase: 'practice' });
  tap('attempts', { ...base, record: 'item_close', item_id: 'SQL-A-01-W02', target_concept_id: 'SQL-A-01', phase: 'practice', block_id: null,
    reason: 'left', raw_outcome: { graded_attempts: 0, passed: false, first_attempt_pass: false, max_hint_level: 2, revealed_before_attempt: false,
      active_ms: 61_400 }, instance_rating: null, card_reviews: [] });
  tap('attempts', { ...base, record: 'exposure', concept_id: 'SQL-A-01', kind: 'reading' });
  tap('attempts', { ...base, record: 'self_check', session_id: 'S', kind: 'insight', phase: 'case', case_id: 'CASE-1', item_instance_id: null,
    block_id: null, text: 'my private words', fields: { plan: 'my plan' }, ticked: ['point'] });
  tap('attempts', { ...base, record: 'lab_answer', session_id: 'S', lab_id: 'LAB-01', lab_version: 1, kind: 'first', month: '2026-09',
    range: null, parts: [{ answer: 'my secret answer' }], note: 'my note' });
  tap('events', { event: 'session', schema_version: 5, ts: base.ts, session_id: 'S', section: 'all', phase: 'end', reason: 'explicit', active_minutes: 12 });
  tap('events', { event: 'card_event', schema_version: 5, ts: base.ts, card_id: 'CARD-1', kind: 'reset' });
  tap('events', { event: 'case_export', schema_version: 5, ts: base.ts, case_id: 'CASE-1', files: ['C:/Users/someone/case.md'], data_source: 'Voltmarkt' });
  tap('reports', { event: 'content_report', schema_version: 5, ts: base.ts });
  await later();
  await stopJourney();
  const r = await events(dir);
  assert.deepEqual(r.map((x) => x.event), ['hint_opened', 'answer_shown', 'other_way_opened', 'item_closed', 'material_studied',
    'case_self_check', 'lab_answered', 'study_session_ended', 'review_card_changed', 'case_exported']);
  const [hint, shown, , closed, studied, check, lab, ended, card, exported] = r;
  assert.deepEqual([hint!.item_id, hint!.concept_id, hint!.topic, hint!.phase, hint!.hint_level, hint!.review], ['SQL-A-01-W01', 'SQL-A-01', 'SQL', 'practice', 2, false]);
  assert.equal(shown!.review, true);
  assert.deepEqual([closed!.reason, closed!.graded_attempts, closed!.passed, closed!.max_hint_level, closed!.active_s], ['left', 0, false, 2, 61]);
  assert.equal(closed!.rating, undefined);
  assert.deepEqual([studied!.concept_id, studied!.kind], ['SQL-A-01', 'reading']);
  assert.deepEqual([check!.kind, check!.case_id], ['insight', 'CASE-1']);
  assert.deepEqual([lab!.lab_id, lab!.kind], ['LAB-01', 'first']);
  assert.deepEqual([ended!.reason, ended!.active_minutes], ['explicit', 12]);
  assert.deepEqual([card!.card_id, card!.kind], ['CARD-1', 'reset']);
  assert.deepEqual([exported!.case_id, exported!.data_source], ['CASE-1', 'Voltmarkt']);
  const text = JSON.stringify(r);
  for (const words of ['my private words', 'my plan', 'point', 'my secret answer', 'my note', '2026-09', 'C:/Users']) assert.ok(!text.includes(words), words);
});

test('a change in a concept\'s state is reported once, against the state when the tap started', async () => {
  const dir = await tmp();
  startJourney({ dir });
  let now = new Map<string, ConceptStateName>([['SQL-A-01', 'practised'], ['SQL-B-01', 'new']]);
  const tap = journeyTap({ topicOf: () => 'SQL', states: () => now });
  now = new Map([['SQL-A-01', 'mastered'], ['SQL-B-01', 'new'], ['SQL-C-01', 'learning']]);
  tap('attempts', { ...base, record: 'block_close', block_id: 'B-1', card_reviews: [] });
  await later();
  tap('attempts', { ...base, record: 'attempt' });                          // nothing changed since
  await later();
  await stopJourney();
  const changes = (await events(dir)).filter((x) => x.event === 'concept_state_changed');
  assert.deepEqual(changes.map((c) => [c.concept_id, c.topic, c.state_from, c.state_to]),
    [['SQL-A-01', 'SQL', 'practised', 'mastered'], ['SQL-C-01', 'SQL', 'new', 'learning']]);
});

test('what an idle end writes 30 minutes on keeps its logged time, so it joins the visit it belongs to and does not stretch it', async () => {
  const dir = await tmp();
  let t = Date.parse(base.ts);
  startJourney({ dir, now: () => new Date(t) });
  let now = new Map<string, ConceptStateName>([['SQL-A-01', 'learning']]);
  const tap = journeyTap({ topicOf: () => 'SQL', states: () => now });
  tap('attempts', { ...base, record: 'hint_opened', level: 1, item_id: 'SQL-A-01-W01', target_concept_id: 'SQL-A-01', phase: 'practice' });
  t += 30.5 * 60_000;                                                        // the idle timer notices the gap; the end hooks stamp 08:00
  now = new Map([['SQL-A-01', 'practised']]);
  tap('events', { event: 'session', schema_version: 5, ts: base.ts, session_id: 'S', section: 'all', phase: 'end', reason: 'idle', active_minutes: 0 });
  tap('attempts', { ...base, record: 'item_close', item_id: 'SQL-A-01-W01', target_concept_id: 'SQL-A-01', phase: 'practice', block_id: null,
    reason: 'session_end', raw_outcome: { graded_attempts: 0, passed: false, active_ms: 0 }, instance_rating: null, card_reviews: [] });
  await later();
  await stopJourney();
  const r = await lines(dir);
  assert.deepEqual(r.map((x) => x.event),
    ['session_started', 'hint_opened', 'study_session_ended', 'item_closed', 'concept_state_changed', 'session_ended']);
  assert.equal(new Set(r.map((x) => x.session_id)).size, 1);
  assert.ok(r.every((x) => x.ts === base.ts), JSON.stringify(r.map((x) => x.ts)));
  assert.equal(r.at(-1)!.duration_s, 0);
});

test('a state change an answer causes sorts after the answer\'s funnel steps, though the attempt\'s submitted_at is earlier', async () => {
  const dir = await tmp();
  let t = Date.parse('2026-10-13T07:59:00.000Z');
  startJourney({ dir, now: () => new Date(t) });
  let now = new Map<string, ConceptStateName>([['SQL-A-01', 'learning']]);
  const tap = journeyTap({ topicOf: () => 'SQL', states: () => now });
  journey('item_viewed', { item_id: 'SQL-A-01-W01' });                       // 07:59 opens the visit
  t = Date.parse(base.ts);
  const submitted = new Date(t).toISOString();                              // POST /api/submit takes submitted_at before the write
  t += 15;                                                                   // the write and its fsync; the funnel steps come after it
  now = new Map([['SQL-A-01', 'practised']]);
  tap('attempts', { record: 'attempt', schema_version: 5, submitted_at: submitted, item_instance_id: 'I-1', item_id: 'SQL-A-01-W01',
    target_concept_id: 'SQL-A-01' });
  journey('exercise_submitted', { item_id: 'SQL-A-01-W01' });
  journey('exercise_passed', { item_id: 'SQL-A-01-W01' });
  await later();                                                             // the deferred look reports the change
  await stopJourney();
  const r = await lines(dir);
  assert.deepEqual(r.map((x) => x.event),
    ['session_started', 'item_viewed', 'exercise_submitted', 'exercise_passed', 'concept_state_changed', 'session_ended']);
  const passed = r.find((x) => x.event === 'exercise_passed')!;
  const changed = r.find((x) => x.event === 'concept_state_changed')!;
  assert.deepEqual([changed.state_from, changed.state_to], ['learning', 'practised']);
  assert.ok(changed.ts >= passed.ts, `${changed.ts} before ${passed.ts}`);
  const ordered = [...r].sort((a, b) => a.ts.localeCompare(b.ts) || a.seq - b.seq);         // as tools/journey.ts orders them
  assert.deepEqual(ordered.map((x) => x.seq), r.map((x) => x.seq));
});

test('a replay that throws, or a record of an odd shape, never fails a write or crashes later', async () => {
  startJourney({ dir: null });
  let calls = 0;
  const tap = journeyTap({ topicOf: () => null, states: () => { calls++; throw new Error('replay fault'); } });
  assert.doesNotThrow(() => {
    tap('attempts', { record: 'item_close' });
    tap('attempts', null as unknown as object);
    tap('events', { event: 'card_event' });
  });
  await later();                                                             // the deferred look runs here, and must not throw
  assert.equal(calls, 3, 'the baseline, then one look after the close and one after the card change');
  await stopJourney();
});

test('a concept the content does not know is never reported: free text sent as a concept stays out of the journey', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const tap = journeyTap({ topicOf: (id) => (id === 'SQL-A-01' ? 'SQL' : null), states: () => new Map() });
  tap('attempts', { ...base, record: 'exposure', concept_id: 'Jane Doe, jane@example.com, 06-12345678', kind: 'reading' });
  tap('attempts', { ...base, record: 'hint_opened', level: 1, item_id: 'SQL-A-01-W01', target_concept_id: 'some free words', phase: 'practice' });
  tap('attempts', { ...base, record: 'exposure', concept_id: 'SQL-A-01', kind: 'reading' });
  await later();
  await stopJourney();
  const r = await events(dir);
  assert.deepEqual(r.map((x) => [x.event, x.concept_id ?? null, x.topic ?? null, x.kind ?? null]),
    [['material_studied', null, null, 'reading'], ['hint_opened', null, null, null], ['material_studied', 'SQL-A-01', 'SQL', 'reading']]);
  for (const words of ['Jane', 'example.com', '12345678', 'free words']) assert.ok(!JSON.stringify(r).includes(words), words);
});

test('a state change the last write before the stop causes still joins the visit, before its end', async () => {
  const dir = await tmp();
  startJourney({ dir });
  let now = new Map<string, ConceptStateName>([['SQL-A-01', 'new']]);
  const tap = journeyTap({ topicOf: () => 'SQL', states: () => now });
  now = new Map([['SQL-A-01', 'learning']]);
  tap('attempts', { ...base, record: 'item_close', item_id: 'SQL-A-01-W01', target_concept_id: 'SQL-A-01', phase: 'practice', block_id: null,
    reason: 'session_end', raw_outcome: { graded_attempts: 1, passed: true, active_ms: 1000 }, instance_rating: null, card_reviews: [] });
  await stopJourney();                                                       // at once: nothing else awaited first (setup mode, no backup)
  const r = await lines(dir);
  assert.deepEqual(r.map((x) => x.event), ['session_started', 'item_closed', 'concept_state_changed', 'session_ended']);
  assert.equal(new Set(r.map((x) => x.session_id)).size, 1);
});

test('an attempt\'s change is reported at its submitted_at when the visit has nothing later', async () => {
  const dir = await tmp();
  let t = Date.parse('2026-10-13T08:00:00.000Z');
  startJourney({ dir, now: () => new Date(t) });
  let now = new Map<string, ConceptStateName>([['SQL-A-01', 'learning']]);
  const tap = journeyTap({ topicOf: () => 'SQL', states: () => now });
  journey('item_viewed', { item_id: 'SQL-A-01-W01' });                       // 08:00 opens the visit
  t = Date.parse('2026-10-13T08:05:00.000Z');                                // the tap runs at 08:05; the answer was logged at 08:03
  now = new Map([['SQL-A-01', 'practised']]);
  tap('attempts', { record: 'attempt', schema_version: 5, submitted_at: '2026-10-13T08:03:00.000Z', item_instance_id: 'I-1', item_id: 'SQL-A-01-W01',
    target_concept_id: 'SQL-A-01' });
  await later();
  await stopJourney();
  assert.equal((await lines(dir)).find((x) => x.event === 'concept_state_changed')!.ts, '2026-10-13T08:03:00.000Z');
});

test('topics: SQL from the curriculum, GA4 and Methodology from their concept lists, else none', () => {
  const content = {
    curriculum: { concepts: [{ id: 'SQL-A-01' }] },
    choiceConcepts: (section: 'ga4' | 'methodology') => (section === 'ga4' ? [{ id: 'C-GA4-01' }] : [{ id: 'EXP-AB-01' }]),
  };
  const topicOf = topicFinder(content as never);
  assert.deepEqual(['SQL-A-01', 'C-GA4-01', 'EXP-AB-01', 'X'].map(topicOf), ['SQL', 'GA4', 'Methodology', null]);
});

// tests/server/startup.test.ts: what the server does with the logs at startup (Task B7; design §13, §16)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ItemClose } from '../../core/envelope.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { replay } from '../../core/replay.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { bootState, loadContentOrSetup, readLogs, stateCheck } from '../../server/main.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { flakyLog } from '../helpers/flaky-log.ts';
import { A, card, exposure, golden, growLeech, instance, item, primed, run, sessionEnd, sessionStart, snapshot, type InstanceSpec, type Log } from '../helpers/replay-fixture.ts';

const content = await loadContent(await makeContentFixture());
async function logWith(l: Log): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-start-')));
  for (const r of l.attempts) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  for (const e of l.events) await log.append('events', e as { ts?: string });
  return log;
}
/** What main.ts does at startup, up to the first request. */
async function boot(log: JsonlLog, store: ContentStore = content): Promise<LearnerState> {
  const logger = new AttemptLogger(log);
  return bootState(logger, new SessionTracker(logger, async () => {}), store, await readLogs(logger), () => null, true);
}
const cardsOf = (r: ReturnType<typeof run>) => [...r.cards.values()].map((c) => [c.card_id, c.rated, c.origin, c.snapshot]);
/** An instance the live server closed: its close rated as the server rated it then, by a replay of the records before it. */
function closedLive(before: object[], events: object[], spec: InstanceSpec): object[] {
  const recs = instance({ version: 2, ...spec });
  const rest = recs.slice(0, -1);
  return [...rest, new LearnerState({ content, attempts: [...before, ...rest], events, examDate: () => null }).rateClose(recs.at(-1) as ItemClose)];
}
/** A state over the files as they are now, as the next start builds it. */
const fromFiles = async (log: JsonlLog) =>
  new LearnerState({ content, attempts: await log.readAll('attempts'), events: await log.readAll('events'), examDate: () => null });
/** Every replay warning, from the state startup left and from a fresh replay of the files. */
async function warningsAfter(log: JsonlLog, state: LearnerState): Promise<string[][]> {
  return [state.current().warnings, (await fromFiles(log)).current().warnings];
}
const counts = async (log: JsonlLog) => [(await log.readAll('attempts')).length, (await log.readAll('events')).length];

test('startup over the replay golden fixture writes nothing, warns nothing, and gives the replay tests\' cards', async () => {
  const g = golden();
  const log = await logWith(g);
  const state = await boot(log);
  assert.deepEqual([(await log.readAll('attempts')).length, (await log.readAll('events')).length], [g.attempts.length, g.events.length], 'nothing left to recover');
  assert.deepEqual(state.current().warnings, []);
  assert.deepEqual(cardsOf(state.current()), cardsOf(run(g)), 'the server\'s catalog and the replay tests\' agree on these records');
});

test('restart identity: after a crash, the state mirrored through recovery equals a fresh replay of the files (design §16)', async () => {
  const log = await logWith(golden({ crashed: true }));
  const state = await boot(log);
  const records = (await log.readAll('attempts')) as any[];
  const f4 = records.find((r) => r.record === 'item_close' && r.item_instance_id === 'I-F4');
  assert.deepEqual([f4?.reason, f4?.instance_rating], ['session_end', 1], 'recovery closed and rated the crashed instance');
  const restarted = new LearnerState({ content, attempts: records, events: await log.readAll('events'), examDate: () => null });
  assert.deepEqual(snapshot(restarted.current()), snapshot(state.current()));
  const reference = replay(golden({ sessions: 1 }).attempts, golden({ sessions: 1 }).events, replayOptions(buildCatalog(content), new Date()));
  assert.deepEqual(cardsOf(state.current()), cardsOf(reference), 'the same cards as when the slice 1a server recovered it');
});

test('startup closes a crashed block: the recovered close names its block, then the missing block_close follows at the worst rating (S2-16)', async () => {
  const day = '2025-06-03';
  const log = await logWith({ attempts: [exposure(A, '2025-06-01T08:00:00Z'),
    ...instance({ id: 'K-1', item: item(A, 'E1-06'), phase: 'mixed', block: 'B-9', session: 'S9', start: `${day}T10:00:00Z`,
      steps: [{ at: `${day}T10:00:30Z`, submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'K-2', item: item(A, 'E1-07'), phase: 'mixed', block: 'B-9', session: 'S9', start: `${day}T10:02:00Z`,
      steps: [{ at: `${day}T10:02:30Z`, submit: 'fail' }], close: null })],
  events: [sessionStart('S9', `${day}T09:59:00Z`)] });
  const state = await boot(log);
  const recs = (await log.readAll('attempts')) as any[];
  const k2 = recs.find((r) => r.record === 'item_close' && r.item_instance_id === 'K-2');
  assert.deepEqual([k2.reason, k2.block_id, k2.instance_rating, k2.card_reviews], ['session_end', 'B-9', 1, []]);
  assert.deepEqual(recs.filter((r) => r.record === 'block_close').map((b) => [b.block_id, b.ts, b.card_reviews.map((c: any) => [c.card_id, c.rating])]),
    [['B-9', '2025-06-03T10:02:30.000Z', [[card(A), 1]]]]);
  assert.equal(state.current().blocks.get('B-9')!.closed_at, '2025-06-03T10:02:30.000Z');
  const again = await boot(log);
  assert.equal(((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'block_close').length, 1, 'a second start writes nothing more');
  assert.deepEqual(again.current().warnings, [], 'the written records match the replay');
});

test('recovered closes are rated in time order, so every one of them says what a later replay says (S2-15)', async () => {
  // Card A is rated. Two sessions were left open (a start whose recovery could not write). S8 holds H, help-only (the answer
  // shown, which rates Again on a rated card); S9 holds X, which passed. Recovery lists X first, but H's close comes first.
  const day = '2025-06-03';
  const log = await logWith({ attempts: [...primed(A, '2025-06-02'),
    ...instance({ id: 'H', item: item(A, 'E1-07'), phase: 'review', version: 2, start: `${day}T09:01:00Z`,
      steps: [{ at: `${day}T09:01:00Z`, solution: true }], close: null }),
    ...instance({ id: 'X', item: item(A, 'E1-06'), phase: 'review', session: 'S9', version: 2, start: `${day}T10:00:30Z`,
      steps: [{ at: `${day}T10:02:00Z`, submit: 'pass' }], close: null })],
  events: [sessionStart('S8', `${day}T09:00:00Z`), sessionStart('S9', `${day}T10:00:00Z`)] });
  const state = await boot(log);
  const closes = ((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close' && r.reason === 'session_end');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.ts, c.instance_rating]),
    [['H', '2025-06-03T09:01:00.000Z', 1], ['X', '2025-06-03T10:02:00.000Z', closes[1]?.instance_rating]], 'written in time order');
  assert.deepEqual(await warningsAfter(log, state), [[], []], 'the replay agrees with every recovered close');
});

test('a recovered help-only close is stamped at its session\'s end, after a live close on the same card (S2-85)', async () => {
  // Card A is rated. In S9, H showed the answer at 10:01 (help-only, left open by a crash); X passed and was closed live at
  // 10:05, rated by the replay of that moment. H's close at its own record (10:01) would come before X's and change it.
  const day = '2025-06-03';
  const events = [sessionStart('S9', `${day}T10:00:00Z`)];
  const before = [...primed(A, '2025-06-02'),
    ...instance({ id: 'H', item: item(A, 'E1-07'), phase: 'review', version: 2, start: `${day}T10:01:00Z`,
      steps: [{ at: `${day}T10:01:00Z`, solution: true }], close: null })];
  const x = closedLive(before, events, { id: 'X', item: item(A, 'E1-06'), phase: 'review', session: 'S9', start: `${day}T10:02:00Z`,
    steps: [{ at: `${day}T10:03:00Z`, submit: 'pass' }], close: { at: `${day}T10:05:00Z` } });
  const log = await logWith({ attempts: [...before, ...x], events });
  assert.deepEqual((await fromFiles(log)).current().warnings, [], 'the live log replays cleanly before the start');
  const state = await boot(log);
  const h = ((await log.readAll('attempts')) as any[]).find((r) => r.record === 'item_close' && r.item_instance_id === 'H');
  assert.deepEqual([h?.reason, h?.ts, h?.instance_rating], ['session_end', '2025-06-03T10:05:00.000Z', 1], 'at the recovered end of S9');
  assert.deepEqual(await warningsAfter(log, state), [[], []], 'no warning after recovery, nor on a later replay');
  assert.deepEqual(await warningsAfter(log, await boot(log)), [[], []], 'nor after another start');
});

test('a block whose items closed before a crash is closed at its session\'s end, after a later live close on its card (S2-85, S2-16)', async () => {
  const day = '2025-06-03';
  const events = [sessionStart('S9', `${day}T09:59:00Z`)];
  const before = [exposure(A, '2025-06-01T08:00:00Z'),
    ...instance({ id: 'K-1', item: item(A, 'E1-06'), phase: 'mixed', block: 'B-9', session: 'S9', start: `${day}T10:00:00Z`,
      steps: [{ at: `${day}T10:00:30Z`, submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'K-2', item: item(A, 'E1-07'), phase: 'mixed', block: 'B-9', session: 'S9', start: `${day}T10:02:00Z`,
      steps: [{ at: `${day}T10:02:30Z`, submit: 'fail' }] })];
  const x = closedLive(before, events, { id: 'X', item: item(A, 'E1-08'), phase: 'review', session: 'S9', start: `${day}T10:06:00Z`,
    steps: [{ at: `${day}T10:07:00Z`, submit: 'pass' }], close: { at: `${day}T10:08:00Z` } });
  const log = await logWith({ attempts: [...before, ...x], events });
  const state = await boot(log);
  const blocks = ((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'block_close');
  assert.deepEqual(blocks.map((b) => [b.block_id, b.ts, b.card_reviews.map((c: any) => [c.card_id, c.rating])]), [['B-9', '2025-06-03T10:08:00.000Z', [[card(A), 1]]]],
    'at the recovered end of S9, not at K-2\'s close (10:03)');
  assert.deepEqual(await warningsAfter(log, state), [[], []]);
});

test('while the content cannot load, startup writes nothing; the next start with the content recovers and rates (S2-89)', async () => {
  const log = await logWith(golden({ crashed: true }));
  const before = await counts(log);
  const failed = await loadContentOrSetup(await mkdtemp(join(tmpdir(), 'al-no-content-')));
  assert.equal(failed.check?.name, 'content loaded', 'the setup check that starts setup mode');
  const logger = new AttemptLogger(log);
  await bootState(logger, new SessionTracker(logger, async () => {}), failed.content, await readLogs(logger), () => null, failed.check === null);
  assert.deepEqual(await counts(log), before, 'no session end and no unrated close');
  const state = await boot(log);
  const f4 = ((await log.readAll('attempts')) as any[]).find((r) => r.record === 'item_close' && r.item_instance_id === 'I-F4');
  assert.deepEqual([f4?.reason, f4?.instance_rating], ['session_end', 1], 'recovered and rated once the content is back');
  assert.deepEqual(await warningsAfter(log, state), [[], []]);
});

test('a history that cannot be replayed starts setup mode with a "learner state" check; nothing is written (Review Focus 1)', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const broken: ContentStore = { ...content, choiceConcept: () => { throw new Error('the catalog broke'); } };
  const log = await logWith(golden({ crashed: true }));
  const before = await counts(log);
  const state = await boot(log, broken);
  assert.deepEqual(await counts(log), before, 'recovery waits: the open session and the open instance stay as they are');
  const check = stateCheck(state);
  assert.deepEqual([check?.name, check?.ok], ['learner state', false]);
  assert.match(check!.detail, /study history could not be replayed/);
  assert.match(check!.detail, /the catalog broke/);
  assert.match(check!.detail, /logs are safe and untouched/);
  assert.ok(!/EX-SQL|I-F4|SQL-BASICS/.test(check!.detail), 'the error message only, never a record');
  assert.ok(!errors.mock.calls.some((c) => /could not be written/.test(String(c.arguments[0]))), 'not a write failure');
  assert.equal(stateCheck(await boot(await logWith(golden()))), null, 'a history that replays passes');
});

test('a replay fault during recovery is reported as one, not as a failed write; a real write failure still is (Review Focus 1)', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const said = () => errors.mock.calls.map((c) => String(c.arguments[0]));
  // The crashed instance's item breaks the catalog only once recovery closes it.
  const failing: ContentStore = { ...content, item: (id) => { if (id === item(A, 'E2-03')) throw new Error('item lookup failed'); return content.item(id); } };
  const state = await boot(await logWith(golden({ crashed: true })), failing);
  assert.ok(said().some((m) => /study history could not be replayed \(item lookup failed\)/.test(m)), said().join(' | '));
  assert.ok(!said().some((m) => /could not be written/.test(m)), 'the logger is still writable');
  assert.equal(stateCheck(state)?.name, 'learner state');
  errors.mock.resetCalls();
  const logger = new AttemptLogger(flakyLog(await logWith(golden({ crashed: true })), 0));
  await bootState(logger, new SessionTracker(logger, async () => {}), content, await readLogs(logger), () => null, true);
  assert.equal(logger.writable, false);
  assert.ok(said().some((m) => /log could not be written \(disk hiccup\)/.test(m)), said().join(' | '));
});

test('startup writes the reset of a leech whose next session ended without its micro-lesson (S2-28)', async () => {
  const grown = growLeech(A, ['E1-01', 'E1-02', 'E1-03'].map((n) => item(A, n)), '2025-06-01T08:00:00Z');
  const last = Date.parse(run(grown).cards.get(card(A))!.last_review!);
  const start = new Date(last + 86_400_000).toISOString();
  const end = new Date(last + 86_400_000 + 3_600_000).toISOString();
  const log = await logWith({ attempts: grown.attempts, events: [sessionStart('S-N', start), sessionEnd('S-N', end)] });
  const state = await boot(log);
  const resets = ((await log.readAll('events')) as any[]).filter((e) => e.event === 'card_event');
  assert.deepEqual(resets.map((e) => [e.card_id, e.kind, e.ts]), [[card(A), 'reset', end]]);
  assert.deepEqual([state.current().pendingResets, state.current().cards.get(card(A))!.origin], [[], 'reset']);
});

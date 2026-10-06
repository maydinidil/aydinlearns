import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import type { BlockClose, Exposure, HintOpened, ItemClose, SolutionOpened } from '../../core/envelope.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { backupLogs } from '../../server/backup.ts';
import { flakyLog } from '../helpers/flaky-log.ts';

const ev = { event: 'outside_practice' as const, schema_version: 1, ts: '2026-10-09T10:00:00Z', source: 'SQLBolt', description: 'lesson 1' };

const freshLog = async () => openJsonlLog(await mkdtemp(join(tmpdir(), 'al-log-')));
const sessionRows = (events: any[]) => events.map((e) => `${e.event}:${e.phase}:${e.reason ?? ''}`);

test('a failed write marks the logger not writable and rethrows', async () => {
  const broken: JsonlLog = { dir: 'x', append: async () => { throw new Error('disk full'); }, readAll: async () => [] };
  const logger = new AttemptLogger(broken);
  await assert.rejects(logger.event(ev), /disk full/);
  assert.equal(logger.writable, false);
});
test('content reports go to reports.jsonl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  await new AttemptLogger(openJsonlLog(dir)).event({ event: 'content_report', schema_version: 1, ts: ev.ts, item_id: 'EX-1', text: 'typo' });
  assert.deepEqual(await readdir(dir), ['reports.jsonl']);
});
test('attempt, item close, block close, hint, solution and exposure records all land in the monthly attempts file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  const logger = new AttemptLogger(openJsonlLog(dir));
  const ts = '2026-10-09T10:00:00Z';
  const attempt: AydinAttempt = {
    record: 'attempt', schema_version: 1, attempt_id: 'A1', app: 'aydinlearns', section: 'sql', session_id: 'S1', item_instance_id: 'I1',
    started_at: '2026-10-09T09:59:00Z', submitted_at: ts, local_date: '2026-10-09', item_id: 'EX-1', item_version: 1, item_kind: 'sql',
    target_concept_id: 'SQL-SELECT-01', concept_ids: ['SQL-SELECT-01'], template_id: null, level: 1, phase: 'free', block_id: null,
    fading_stage: null, repeat_exposure: false, screen_mode: false, submission_no: 1, hint_level: 0, solution_viewed: false, active_ms: 1000,
    target_ms: null, outcome: 'pass', is_correct: true, partial_score: null, error_ids: [], checks: [], grading_source: 'auto', confidence: null,
    content_version: 'c1', grader_version: 'g1', payload: { kind: 'free_text', text: 'x' },
    world: null, difficulty: null, sub_skill: null, dataset_version: 'd1', duckdb_version: '1.5.6',
  };
  const itemClose: ItemClose = {
    record: 'item_close', schema_version: 1, ts, item_instance_id: 'I1', item_id: 'EX-1', target_concept_id: 'SQL-SELECT-01', phase: 'free', block_id: null,
    reason: 'pass', raw_outcome: { graded_attempts: 1, passed: true, first_attempt_pass: true, max_hint_level: 0, revealed_before_attempt: false, active_ms: 1000 },
    instance_rating: null, card_reviews: [],
  };
  const blockClose: BlockClose = { record: 'block_close', schema_version: 1, ts, block_id: 'B1', card_reviews: [] };
  const hint: HintOpened = { record: 'hint_opened', schema_version: 1, ts, item_instance_id: 'I1', level: 1 };
  const solution: SolutionOpened = { record: 'solution_opened', schema_version: 1, ts, item_instance_id: 'I1' };
  const exposure: Exposure = { record: 'exposure', schema_version: 1, ts, concept_id: 'SQL-SELECT-01', kind: 'lesson' };
  await logger.attempt(attempt);
  await logger.itemClose(itemClose);
  await logger.blockClose(blockClose);
  await logger.hintOpened(hint);
  await logger.solutionOpened(solution);
  await logger.exposure(exposure);
  assert.deepEqual(await readdir(dir), ['attempts-2026-10.jsonl']);
  assert.deepEqual((await logger.readAll('attempts')).map((r: any) => r.record), ['attempt', 'item_close', 'block_close', 'hint_opened', 'solution_opened', 'exposure']);
  assert.deepEqual(await logger.readAll('events'), []);
});
test('sessions start on first touch and end after idle time', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-log-')));
  let ended = 0;
  const s = new SessionTracker(new AttemptLogger(log), async () => { ended++; }, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  const id = await s.touch(t0);
  assert.equal(await s.touch(new Date(t0.getTime() + 500)), id);
  await s.endIfIdle(new Date(t0.getTime() + 1000));
  assert.equal(ended, 0, 'not idle yet');
  await s.endIfIdle(new Date(t0.getTime() + 3000));
  assert.equal(ended, 1);
  const id2 = await s.touch(new Date(t0.getTime() + 4000));
  assert.notEqual(id2, id);
  const events = (await log.readAll('events')) as any[];
  assert.deepEqual(events.map((e) => `${e.event}:${e.phase}:${e.reason ?? ''}`), ['session:start:', 'session:end:idle', 'session:start:']);
  assert.equal(events[1].ts, new Date(t0.getTime() + 500).toISOString(), 'an idle session ends at its last activity');
});
test('a session is idle only after more than idleMs: exactly idleMs keeps it open, idleMs + 1 ends it', async () => {
  const log = await freshLog();
  let ended = 0;
  const s = new SessionTracker(new AttemptLogger(log), async () => { ended++; }, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  const id = await s.touch(t0);
  await s.endIfIdle(new Date(t0.getTime() + 1000));
  assert.equal(s.currentId, id, 'exactly idleMs of silence is not idle');
  assert.equal(ended, 0);
  await s.endIfIdle(new Date(t0.getTime() + 1001));
  assert.equal(s.currentId, null);
  assert.equal(ended, 1);
  assert.equal(((await log.readAll('events')) as any[])[1].ts, t0.toISOString(), 'the end is stamped at the last activity, not at the check');
});
test('an explicit end writes reason explicit and the active minutes; ending with no open session writes nothing', async () => {
  const log = await freshLog();
  let ended = 0;
  const s = new SessionTracker(new AttemptLogger(log), async () => { ended++; }, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  await s.touch(t0);
  const stop = new Date(t0.getTime() + 120_000);
  await s.end('explicit', stop);
  assert.equal(s.currentId, null);
  assert.equal(ended, 1);
  await s.end('explicit', new Date(stop.getTime() + 1000));
  await s.end('idle', new Date(stop.getTime() + 2000));
  assert.equal(ended, 1, 'no second end, no second onEnd');
  const events = (await log.readAll('events')) as any[];
  assert.deepEqual(sessionRows(events), ['session:start:', 'session:end:explicit']);
  assert.equal(events[1].ts, stop.toISOString());
  assert.equal(events[1].active_minutes, 2);
});
test('recover writes the missing end of a session a stopped server left open', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-log-')));
  const logger = new AttemptLogger(log);
  const s = new SessionTracker(logger, async () => {}, 1000);
  const events = [{ event: 'session', session_id: 'S1', phase: 'start', ts: '2026-10-09T10:00:00Z' }];
  await s.recover([{ record: 'attempt', submitted_at: '2026-10-09T10:20:00Z' }], events);
  const written = (await log.readAll('events')) as any[];
  assert.deepEqual([written[0].session_id, written[0].phase, written[0].reason, written[0].ts], ['S1', 'end', 'recovered', '2026-10-09T10:20:00Z']);
});
test('recover does nothing when the last session already ended, or when there is no session at all', async () => {
  const run = async (events: object[]) => {
    const log = await freshLog();
    await new SessionTracker(new AttemptLogger(log), async () => {}, 1000).recover([{ record: 'attempt', submitted_at: '2026-10-09T10:20:00Z' }], events);
    return log.readAll('events');
  };
  const start = { event: 'session', session_id: 'S1', phase: 'start', ts: '2026-10-09T10:00:00Z' };
  assert.deepEqual(await run([start, { ...start, phase: 'end', ts: '2026-10-09T10:30:00Z', reason: 'explicit' }]), [], 'already ended');
  assert.deepEqual(await run([]), [], 'no events');
  assert.deepEqual(await run([ev]), [], 'events but no session');
});
test('recover ends every session that has no end, each at its own last activity, and is safe to run twice', async () => {
  const log = await freshLog();
  const s = new SessionTracker(new AttemptLogger(log), async () => {}, 1000);
  const session = (session_id: string, phase: string, ts: string) => ({ event: 'session', session_id, phase, ts });
  const events = [
    session('S0', 'start', '2026-10-08T09:00:00Z'),
    session('S0', 'end', '2026-10-08T09:30:00Z'),
    session('S1', 'start', '2026-10-09T10:00:00Z'),
    session('S2', 'start', '2026-10-09T11:00:00Z'),
    { event: 'outside_practice', ts: '2026-10-09T11:05:00Z' },
    session('S3', 'start', '2026-10-09T12:00:00Z'),
    session('S4', 'start', '2026-10-09T13:00:00Z'),
  ];
  const attempts = [
    { record: 'attempt', submitted_at: '2026-10-09T10:20:00Z' },
    { record: 'item_close', ts: '2026-10-09T10:25:00Z' },
    { record: 'attempt', submitted_at: '2026-10-09T11:02:00Z' },
    { record: 'attempt', submitted_at: '2026-10-09T12:30:00Z' },
  ];
  await s.recover(attempts, events);
  const written = (await log.readAll('events')) as any[];
  assert.deepEqual(written.map((e) => `${e.session_id}:${e.phase}:${e.reason}:${e.ts}`), [
    'S1:end:recovered:2026-10-09T10:25:00Z',   // not 12:30: the next session start bounds the window
    'S2:end:recovered:2026-10-09T11:05:00Z',   // an event counts as activity, like an attempt
    'S3:end:recovered:2026-10-09T12:30:00Z',
    'S4:end:recovered:2026-10-09T13:00:00Z',   // no activity: its own start
  ]);
  await s.recover(attempts, [...events, ...written]);
  assert.equal((await log.readAll('events')).length, 4, 'a second recover finds nothing left to close');
});
test('a failed start write leaves no open session and no bogus record, and the next touch starts clean', async () => {
  const log = await freshLog();
  const s = new SessionTracker(new AttemptLogger(flakyLog(log, 0)), async () => {}, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  await assert.rejects(s.touch(t0), /disk hiccup/);
  assert.equal(s.currentId, null);
  await s.endIfIdle(new Date(t0.getTime() + 10_000_000));
  assert.deepEqual(await log.readAll('events'), [], 'a failed start must not later produce an end');
  const id = await s.touch(new Date(t0.getTime() + 5000));
  await s.end('explicit', new Date(t0.getTime() + 65_000));
  const events = (await log.readAll('events')) as any[];
  assert.deepEqual(sessionRows(events), ['session:start:', 'session:end:explicit']);
  assert.equal(events[0].session_id, id);
  assert.equal(events[0].ts, new Date(t0.getTime() + 5000).toISOString());
  for (const e of events) {
    assert.ok(!e.ts.startsWith('1970'), 'no epoch timestamp');
    assert.ok(e.active_minutes === undefined || e.active_minutes >= 0, 'no negative minutes');
  }
  assert.equal(events[1].active_minutes, 1);
});
test('a failed end write writes nothing bogus later, and recover supplies the lost end', async () => {
  const log = await freshLog();
  let ended = 0;
  const s = new SessionTracker(new AttemptLogger(flakyLog(log, 1)), async () => { ended++; }, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  const first = await s.touch(t0);
  await assert.rejects(s.end('explicit', new Date(t0.getTime() + 60_000)), /disk hiccup/);
  assert.equal(ended, 0, 'onEnd (the backup) does not run for an end that was not logged');
  assert.equal(s.currentId, null);
  await s.endIfIdle(new Date(t0.getTime() + 10_000_000));
  const second = await s.touch(new Date(t0.getTime() + 120_000));
  assert.notEqual(second, first);
  assert.deepEqual(sessionRows((await log.readAll('events')) as any[]), ['session:start:', 'session:start:'], 'no end was retried or invented');
  await s.recover([], await log.readAll('events'));
  const events = (await log.readAll('events')) as any[];
  assert.deepEqual(events.slice(2).map((e) => `${e.session_id === first ? 'first' : 'second'}:${e.reason}:${e.ts}`), [
    `first:recovered:${t0.toISOString()}`,
    `second:recovered:${new Date(t0.getTime() + 120_000).toISOString()}`,
  ]);
});
test('two touches at the same moment share one session and write one start', async () => {
  const real = await freshLog();
  const slow: JsonlLog = { dir: real.dir, readAll: (f) => real.readAll(f), append: async (f, r) => { await sleep(10); await real.append(f, r); } };
  const s = new SessionTracker(new AttemptLogger(slow), async () => {}, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  const [a, b] = await Promise.all([s.touch(t0), s.touch(new Date(t0.getTime() + 1))]);
  assert.equal(a, b);
  assert.deepEqual(sessionRows((await real.readAll('events')) as any[]), ['session:start:']);
});
test('backup copies logs into a dated folder; an unreachable folder is reported, not thrown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  await openJsonlLog(join(dir, 'logs')).append('events', { ts: '2026-10-09T10:00:00Z' });
  const r = await backupLogs(join(dir, 'logs'), join(dir, 'backup'), new Date('2026-10-09T11:00:00Z'));
  assert.equal(r.ok, true);
  assert.deepEqual(await readdir((r as any).path), ['events.jsonl']);
  const bad = await backupLogs(join(dir, 'logs'), join(dir, 'logs', 'events.jsonl', 'nested'), new Date());
  assert.equal(bad.ok, false);
});
test('backup reports an invalid date or a missing logs folder instead of throwing, and leaves no empty dated folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  await openJsonlLog(join(dir, 'logs')).append('events', { ts: '2026-10-09T10:00:00Z' });
  const badDate = await backupLogs(join(dir, 'logs'), join(dir, 'backup'), new Date('not a date'));
  assert.equal(badDate.ok, false);
  const noLogs = await backupLogs(join(dir, 'no-such-logs'), join(dir, 'backup'), new Date('2026-10-09T11:00:00Z'));
  assert.equal(noLogs.ok, false);
  assert.deepEqual((await readdir(dir)).sort(), ['logs'], 'neither failure created the backup folder or a dated folder');
});
test('onWrite sees each record after it is written, with its file, and never a failed write (Task B7)', async () => {
  const logger = new AttemptLogger(flakyLog(await freshLog(), 1));
  const seen: [string, string][] = [];
  logger.onWrite((file, r) => seen.push([file, String((r as any).record ?? (r as any).event)]));
  await logger.exposure({ record: 'exposure', schema_version: 2, ts: ev.ts, concept_id: 'SQL-BASICS-01', kind: 'reading' });
  await assert.rejects(logger.event(ev), /disk hiccup/);
  await logger.event({ event: 'content_report', schema_version: 2, ts: ev.ts, item_id: 'EX-1', text: 'typo' });
  assert.deepEqual(seen, [['attempts', 'exposure'], ['reports', 'content_report']]);
});

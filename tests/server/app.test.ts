import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContentOrSetup, loggedInstanceIds, readLogs, recoverLogs, shutdown } from '../../server/main.ts';
import { loadContent } from '../../server/content.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { startRunner, type RunnerClient, type RunnerResult } from '../../server/runner/client.ts';
import type { RunnerError } from '../../server/runner/protocol.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { flakyLog } from '../helpers/flaky-log.ts';
import { replay } from '../../core/replay.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { Servings } from '../../server/servings.ts';
import { exposure, growLeech, instance, plus } from '../helpers/replay-fixture.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string, headers: Record<string, string> = H) => app.request(`http://127.0.0.1:5174${path}`, { headers });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

// A small Voltmarkt-shaped database. The pool items ask for the city of store 8 and up: no rows on either dataset.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

/** App dependencies wired the way main.ts wires them: the tracker's onEnd runs the end hooks. */
async function deps(over: Partial<AppDeps> = {}, log?: JsonlLog): Promise<AppDeps> {
  const logger = new AttemptLogger(log ?? openJsonlLog(await mkdtemp(join(tmpdir(), 'al-app-'))));
  const endHooks: AppDeps['endHooks'] = [];
  // As main.ts: the state starts from what the log holds and mirrors every write from then on.
  const state = over.state ?? new LearnerState({ content: over.content ?? content, attempts: await logger.readAll('attempts'),
    events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [],
    schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' }, settings: { backup_folder: null, exam_date: null, goal_dates: {} },
    tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell', state, ...over };
}
const attempts = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
/** A runner that answers every request with the next of `errors`, for failures the real one cannot give on demand. */
const failingRunner = (errors: RunnerError[]): RunnerClient => ({
  restarts: 0, close: async () => {},
  request: async <T>() => ({ ok: false, error: errors.shift()! }) as RunnerResult<T>,
});

test('degraded mode serves status and the setup shell only', async () => {
  const app = createApp(await deps({ checks: [{ name: 'SQL runner', ok: false, detail: 'Install the VC++ Redistributable' }] }));
  const status = await get(app, '/api/status');
  assert.equal(status.status, 200);
  assert.deepEqual([(await status.json() as any).degraded, (await json(get(app, '/api/status'))).ok], [true, false]);
  assert.equal((await get(app, '/api/curriculum')).status, 503);
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 503);
  assert.match(await (await get(app, '/')).text(), /FIXTURE SHELL/);
});
test('status reports the versions and settings', async () => {
  const body = await json(get(createApp(await deps()), '/api/status'));
  assert.deepEqual([body.ok, body.degraded], [true, false]);
  assert.deepEqual(Object.keys(body.versions), ['dataset', 'duckdb', 'content', 'grader']);
  assert.equal(body.versions.content, content.contentVersion);
  assert.deepEqual(body.settings, { backup_folder: null, exam_date: null, goal_dates: {} });
});
test('item responses never contain key text', async () => {
  const app = createApp(await deps());
  for (const id of [...lesson.pretest_item_ids, ...lesson.lesson_item_ids]) {
    const body = await (await get(app, `/api/items/${id}`)).text();
    const key = content.key(id)!;
    for (const secret of [key.reference_sql, key.hint3_partial, ...key.alternatives]) assert.ok(!body.includes(secret), id);
  }
});
test('curriculum shows states and "coming in slice N"; nothing is locked', async () => {
  const body = await json(get(createApp(await deps()), '/api/curriculum'));
  assert.equal(body.concepts.find((c: any) => c.id === 'SQL-JOIN-01').comingInSlice, '3');
  assert.equal(body.concepts.find((c: any) => c.id === FIXTURE_CONCEPT).hasContent, true);
  assert.equal(body.concepts.find((c: any) => c.id === FIXTURE_CONCEPT).state, 'new');
  assert.ok(!JSON.stringify(body).includes('locked'));
});
test('static files cannot escape the dist folder', async () => {
  const app = createApp(await deps());
  for (const path of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/..\\package.json', '/%2e%2e%5cpackage.json']) {
    const body = await (await get(app, path)).text();
    assert.ok(!body.includes('"name": "aydinlearns"'), path);
  }
});
test('the Host check covers static files, and unknown API paths answer JSON 404', async () => {
  const app = createApp(await deps());
  assert.equal((await get(app, '/', { host: 'evil.example:5174' })).status, 403);
  const r = await get(app, '/api/nothing-here');
  assert.equal(r.status, 404);
  assert.ok((await r.json() as any).error);
});
test('a failed log write pauses grading until restart; reading still works and status says why', async () => {
  const broken: JsonlLog = { dir: 'x', append: async () => { throw new Error('disk full'); }, readAll: async () => [] };
  const app = createApp(await deps({}, broken));
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 500);
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 503);
  assert.equal((await get(app, '/api/curriculum')).status, 200);
  const status = await json(get(app, '/api/status'));
  assert.equal(status.degraded, true);
  assert.equal(status.checks.find((c: any) => c.name === 'log writable').ok, false);
});
test('a malformed body is a 400', async () => {
  const app = createApp(await deps());
  const r = await app.request('http://127.0.0.1:5174/api/report', { method: 'POST', headers: P, body: 'not json' });
  assert.equal(r.status, 400);
  assert.equal((await post(app, '/api/hint', { item_id: lesson.pool_item_ids[0], item_instance_id: 'I-1', level: 4 })).status, 400);
  assert.equal((await post(app, '/api/submit', { item_id: 'EX-NOPE', item_instance_id: 'I-1', sql: 'SELECT 1' })).status, 404);
});
test('a study flow is logged end to end', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;            // asks for the city of store 8: no rows on either dataset
  const inst = 'I-1';
  const ran = await json(post(app, '/api/run', { item_id, sql: 'SELECT city FROM stores' }));
  assert.equal(ran.rowCount, 3);
  const wrong = await json(post(app, '/api/submit', { item_id, item_instance_id: inst, sql: 'SELECT city FROM stores', phase: 'free' }));
  assert.equal(wrong.outcome, 'fail');
  assert.ok(wrong.attempt_id);
  assert.equal((await json(post(app, '/api/hint', { item_id, item_instance_id: inst, level: 1 }))).text, content.item(item_id)!.hints[0]);
  await post(app, '/api/hint', { item_id, item_instance_id: inst, level: 3 });
  const right = await json(post(app, '/api/submit', { item_id, item_instance_id: inst, sql: 'SELECT city FROM stores WHERE store_id = 8;', phase: 'free' }));
  assert.equal(right.outcome, 'pass');
  await post(app, '/api/item-close', { item_id, item_instance_id: inst, reason: 'pass' });
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => r.record), ['attempt', 'hint_opened', 'hint_opened', 'attempt', 'item_close'], 'Run is not logged');
  assert.deepEqual([recs[3].submission_no, recs[3].hint_level, recs[3].is_correct], [2, 3, true]);
  assert.equal(recs[3].session_id, d.session.currentId);
  assert.ok(!recs[0].checks.includes('CHK-TABLE-CHECK-TEXT'), 'the parse tree ran');
  assert.deepEqual(recs[4].raw_outcome.graded_attempts, 2);
  assert.equal(recs[4].raw_outcome.first_attempt_pass, false);
  assert.equal(recs[4].raw_outcome.revealed_before_attempt, false, 'hint 3 came after the first attempt');
  const rejected = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-2', sql: 'SELECT 1; SELECT 2', phase: 'free' }));
  assert.deepEqual([rejected.outcome, rejected.attempt_id], ['rejected', null]);
  assert.equal((await attempts(d)).length, 5, 'a rejected statement is not logged');
  assert.equal((await json(get(app, '/api/curriculum'))).concepts.find((c: any) => c.id === FIXTURE_CONCEPT).state, 'learning');
});
test('a crash is logged and not graded; a time-out is a graded attempt (design §18)', async () => {
  const d = await deps({ runner: failingRunner([{ kind: 'crash', message: 'runner exited (code 1)' }, { kind: 'timeout' }]) });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  const crash = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }));
  assert.equal(crash.outcome, 'crash');
  assert.ok(crash.attempt_id);
  const timeout = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }));
  assert.equal(timeout.outcome, 'timeout');
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'left' });
  const [a, b, close] = await attempts(d);
  assert.deepEqual([a.outcome, a.checks, a.submission_no, a.is_correct], ['crash', ['CHK-RUNNER-CRASH'], 1, false]);
  assert.deepEqual([b.outcome, b.checks, b.submission_no, b.error_ids], ['timeout', ['CHK-TIMEOUT'], 2, ['ERR-LOG-00']]);
  assert.equal(close.raw_outcome.graded_attempts, 1, 'the crash is not a graded attempt');
});
test('every attempt logged on a text-check runner carries CHK-TABLE-CHECK-TEXT, display-stage outcomes included', async () => {
  const textRunner = await startRunner(db, { useParseTree: false });
  try {
    const d = await deps({ runner: textRunner, tableCheck: 'text' });
    const app = createApp(d);
    const item_id = lesson.pool_item_ids[0];
    // An engine error ends grading at the learner's own display, before any gate reply reports the table check.
    const engine = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT no_such_column FROM stores', phase: 'free' }));
    assert.equal(engine.outcome, 'engine_error');
    // A shape failure, which stops before the composed comparison statements (the text check rejects those).
    const shape = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT store_id, city FROM stores', phase: 'free' }));
    assert.equal(shape.outcome, 'fail');
    assert.deepEqual((await attempts(d)).map((a) => [a.outcome, a.checks.includes('CHK-TABLE-CHECK-TEXT')]), [['engine_error', true], ['fail', true]]);
  } finally { await textRunner.close(); }
});
test('a stop ends the session first: open instances close, the log is backed up, then the runner closes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'al-backup-'));
  const d = await deps({ runner, settings: { backup_folder: folder, exam_date: null, goal_dates: {} } });
  const app = createApp(d);
  await post(app, '/api/hint', { item_id: lesson.retest_item_id, item_instance_id: 'I-1', level: 1 });
  const order: string[] = [];
  await shutdown({
    server: { close: () => { order.push('server closed'); } },
    session: { endIfIdle: (at) => d.session.endIfIdle(at), end: async (reason) => { await d.session.end(reason); order.push(`session ended (${reason})`); } },
    runner: { close: async () => { order.push('runner closed'); } },        // the shared runner stays open for the other tests
  });
  assert.deepEqual(order, ['server closed', 'session ended (explicit)', 'runner closed']);
  const close = (await attempts(d)).find((r) => r.record === 'item_close');
  assert.deepEqual([close?.item_instance_id, close?.reason], ['I-1', 'session_end']);
  const sessions = ((await d.logger.readAll('events')) as any[]).filter((e) => e.event === 'session').map((e) => `${e.phase}:${e.reason ?? ''}`);
  assert.deepEqual(sessions, ['start:', 'end:explicit']);
  assert.equal((await readdir(folder)).length, 1, 'one dated backup');
});
test('a stop still closes the runner when the session end fails', async () => {
  const order: string[] = [];
  await shutdown({
    server: { close: () => { order.push('server closed'); } },
    session: { endIfIdle: async () => {}, end: async () => { throw new Error('disk full'); } },
    runner: { close: async () => { order.push('runner closed'); } },
  });
  assert.deepEqual(order, ['server closed', 'runner closed']);
});
test('"show answer" is logged and marks the instance as revealed before an attempt', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pretest_item_ids[0]!;          // the city of store 1
  const shown = await json(post(app, '/api/show-answer', { item_id, item_instance_id: 'I-1' }));
  assert.equal(shown.sql, content.key(item_id)!.reference_sql);
  assert.deepEqual(shown.display.rows, [['Amsterdam']]);
  const passed = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 1', phase: 'pretest' }));
  assert.equal(passed.outcome, 'pass');
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'pass' });
  const [opened, attempt, close] = await attempts(d);
  assert.equal(opened.record, 'solution_opened');
  assert.equal(attempt.solution_viewed, true);
  assert.deepEqual([close.phase, close.raw_outcome.passed, close.raw_outcome.first_attempt_pass, close.raw_outcome.revealed_before_attempt], ['pretest', true, false, true]);
});
test('"I was right" logs an override attempt and a content report, once', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 400, 'nothing to override yet');
  const failed = await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }));
  assert.deepEqual(await json(post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: ['Gent'] })), { ok: true });
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 400, 'already overridden');
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'pass' });
  const [, override, close] = await attempts(d);
  assert.deepEqual([override.grading_source, override.outcome, override.is_correct], ['override', 'pass', true]);
  assert.notEqual(override.attempt_id, failed.attempt_id);
  assert.equal(close.raw_outcome.passed, true);
  const [report] = (await d.logger.readAll('reports')) as any[];
  assert.equal(report.text, `"I was right" on attempt ${failed.attempt_id}; override attempt ${override.attempt_id}; disputed row: ["Gent"]`, 'the report names both attempts');
});
test('"I was right" needs a result that ran: a time-out or an engine error is refused in plain words', async () => {
  const d = await deps({ runner: failingRunner([{ kind: 'timeout' }, { kind: 'engine', phase: 'bind', message: 'Binder Error: Referenced column "nope" not found' }]) });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  const refused = async (inst: string, sql: string): Promise<[number, string]> => {
    await post(app, '/api/submit', { item_id, item_instance_id: inst, sql, phase: 'free' });
    const r = await post(app, '/api/override', { item_id, item_instance_id: inst, disputed_row: null });
    return [r.status, (await r.json() as any).error];
  };
  const [timeoutStatus, timeoutError] = await refused('I-1', 'SELECT city FROM stores');
  const [engineStatus, engineError] = await refused('I-2', 'SELECT nope FROM stores');
  assert.deepEqual([timeoutStatus, engineStatus], [400, 400]);
  assert.match(timeoutError, /timed out/);
  assert.match(engineError, /stopped with an error/);
  assert.deepEqual((await attempts(d)).map((r) => [r.outcome, r.grading_source]), [['timeout', 'auto'], ['engine_error', 'auto']], 'no override was logged');
  assert.deepEqual(await d.logger.readAll('reports'), [], 'and no content report');
});
test('a session end closes open instances once, with the phase a later submission named', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.retest_item_id;
  await post(app, '/api/hint', { item_id, item_instance_id: 'I-1', level: 1 });     // a hint carries no phase
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'retest' });
  const ended = await json(post(app, '/api/session-end', {}));
  assert.deepEqual(ended, { ok: true, backup: { ok: false, error: 'No backup folder chosen yet.' } });
  assert.deepEqual((await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'left' })).status, 200);
  assert.equal((await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'retest' })).status, 409);
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => r.record), ['hint_opened', 'attempt', 'item_close'], 'one close per instance');
  assert.deepEqual([recs[2].reason, recs[2].phase, recs[2].raw_outcome.max_hint_level], ['session_end', 'retest', 1]);
  const sessions = ((await d.logger.readAll('events')) as any[]).filter((e) => e.event === 'session').map((e) => `${e.phase}:${e.reason ?? ''}`);
  assert.deepEqual(sessions, ['start:', 'end:explicit', 'start:'], 'the later requests start a new session');
});
test('a hint or "show answer" names the phase, so a session end closes the instance with it', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const [hinted, shown] = lesson.lesson_item_ids;
  assert.equal((await post(app, '/api/hint', { item_id: hinted, item_instance_id: 'I-1', level: 1, phase: 'lesson_block' })).status, 200);
  assert.equal((await post(app, '/api/show-answer', { item_id: shown, item_instance_id: 'I-2', phase: 'faded_2' })).status, 200);
  await post(app, '/api/session-end', {});
  const closes = (await attempts(d)).filter((r) => r.record === 'item_close').map((r) => [r.item_instance_id, r.reason, r.phase]);
  assert.deepEqual(closes, [['I-1', 'session_end', 'lesson_block'], ['I-2', 'session_end', 'faded_2']]);
});
test('an item-close alone names the phase and when the item was first shown', async () => {
  const d = await deps();
  const app = createApp(d);
  const item_id = lesson.pretest_item_ids[0]!;
  const started_at = new Date(Date.now() - 90_000).toISOString();
  assert.equal((await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'left', phase: 'pretest', started_at })).status, 200);
  assert.equal((await post(app, '/api/item-close', { item_id, item_instance_id: 'I-2', reason: 'left', phase: 'warm-up', started_at: 'soon' })).status, 200);
  const [first, second] = await attempts(d);
  assert.equal(first.phase, 'pretest');
  assert.ok(first.raw_outcome.active_ms >= 90_000 && first.raw_outcome.active_ms < 150_000, `active_ms runs from started_at: ${first.raw_outcome.active_ms}`);
  assert.equal(second.phase, 'free', 'an unknown phase is not taken; a close with none falls back to free');
  assert.ok(second.raw_outcome.active_ms < 60_000, 'an unreadable started_at is ignored');
});
test('an idle end closes open instances at the idle end time, not at the time of writing', async () => {
  const d = await deps();
  const app = createApp(d);
  // The session's last activity, an hour ahead of the clock, so it cannot be mistaken for the moment the close is written.
  const last = new Date(Date.now() + 3_600_000);
  await d.session.touch(last);
  await post(app, '/api/hint', { item_id: lesson.pool_item_ids[0], item_instance_id: 'I-1', level: 1, phase: 'free' });
  await d.session.endIfIdle(new Date(last.getTime() + 31 * 60_000));
  const end = ((await d.logger.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  const close = (await attempts(d)).find((r) => r.record === 'item_close');
  assert.deepEqual([end?.reason, end?.ts], ['idle', last.toISOString()]);
  assert.deepEqual([close?.reason, close?.ts], ['session_end', last.toISOString()]);
  assert.ok(close.raw_outcome.active_ms >= 3_500_000, `active time runs to the session end: ${close.raw_outcome.active_ms}`);
});
test('item-close takes pass or left from the server\'s own record; the browser\'s reason only has to be valid', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;             // the city of store 8: no rows
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-2', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free' });
  assert.equal((await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'done' })).status, 400);
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'pass' });          // it failed
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-2', reason: 'left' });          // it passed
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-3', reason: 'session_end' });   // never tried
  const closes = (await attempts(d)).filter((r) => r.record === 'item_close').map((r) => [r.item_instance_id, r.reason]);
  assert.deepEqual(closes, [['I-1', 'left'], ['I-2', 'pass'], ['I-3', 'left']]);
});
test('after a restart, every instance from before stays closed, and recovery closes the open ones (D4: hint-only ones too)', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-restart-')));
  const app1 = createApp(await deps({ runner }, log));
  const item_id = lesson.pool_item_ids[0]!;             // the city of store 8: no rows
  await post(app1, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'lesson_block' });
  await post(app1, '/api/hint', { item_id, item_instance_id: 'I-1', level: 3, phase: 'lesson_block' });   // after the first graded attempt
  await post(app1, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'lesson_block' });
  await post(app1, '/api/submit', { item_id, item_instance_id: 'I-2', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app1, '/api/item-close', { item_id, item_instance_id: 'I-2', reason: 'left' });
  await post(app1, '/api/hint', { item_id, item_instance_id: 'I-3', level: 2, phase: 'free' });          // a hint, no attempt
  // The server stops without ending the session, for example after a crash. What main.ts does at the next start:
  const records = await log.readAll('attempts');
  const events = await log.readAll('events');
  const d2 = await deps({ runner, closedInstances: loggedInstanceIds(records) }, log);
  await recoverLogs(d2.logger, d2.session, records, events, d2.state);
  const end = ((await log.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.equal(end?.reason, 'recovered');
  const recs = (await log.readAll('attempts')) as any[];
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.reason]), [['I-2', 'left'], ['I-1', 'session_end'], ['I-3', 'session_end']],
    'I-2 was closed already; I-3 has only a version 2 hint, which names its item (D4)');
  const recovered = closes[1];
  const firstAttempt = recs.find((r) => r.record === 'attempt' && r.item_instance_id === 'I-1');
  assert.equal(recovered.ts, end.ts, 'stamped with the recovered session end');
  assert.deepEqual([recovered.item_id, recovered.target_concept_id, recovered.phase], [item_id, FIXTURE_CONCEPT, 'lesson_block']);
  assert.deepEqual(recovered.raw_outcome, { graded_attempts: 2, passed: true, first_attempt_pass: false, max_hint_level: 3,
    revealed_before_attempt: false, active_ms: Date.parse(end.ts) - Date.parse(firstAttempt.started_at) });
  const counts = async () => [(await log.readAll('attempts')).length, (await log.readAll('events')).length];
  const before = await counts();
  await recoverLogs(d2.logger, new SessionTracker(d2.logger, async () => {}), await log.readAll('attempts'), await log.readAll('events'), d2.state);
  assert.deepEqual(await counts(), before, 'a second start finds nothing left to recover');
  // The restarted app refuses every instance the logs name, so nothing from before carries on with a lost help history.
  const app2 = createApp(d2);
  assert.equal((await post(app2, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT 1', phase: 'free' })).status, 409);
  assert.equal((await post(app2, '/api/hint', { item_id, item_instance_id: 'I-3', level: 1, phase: 'free' })).status, 409);
  assert.equal((await post(app2, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'left' })).status, 200);
  assert.equal(((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close').length, 3, 'no second close');
  assert.equal((await post(app2, '/api/hint', { item_id, item_instance_id: 'I-4', level: 1, phase: 'free' })).status, 200, 'a new instance id works');
});
test('D4: SCHEMA_VERSION is 2, every record the app writes carries it, and help records name their item', async () => {
  assert.equal(SCHEMA_VERSION, 2);
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'reading' });
  await post(app, '/api/hint', { item_id, item_instance_id: 'I-1', level: 1, phase: 'free' });
  await post(app, '/api/show-answer', { item_id, item_instance_id: 'I-1', phase: 'free' });
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app, '/api/settings', { key: 'exam_date', value: '2026-11-13' });
  await post(app, '/api/session-end', {});
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => r.record), ['exposure', 'hint_opened', 'solution_opened', 'attempt', 'item_close']);
  const all = [...recs, ...(await d.logger.readAll('events')), ...(await d.logger.readAll('reports'))] as any[];
  assert.equal(all.length, 8, 'five attempt-file records, a session start, a setting change and a session end');
  assert.deepEqual([...new Set(all.map((r) => r.schema_version))], [2]);
  const help = recs.filter((r) => r.record === 'hint_opened' || r.record === 'solution_opened');
  assert.deepEqual(help.map((r) => [r.record, r.item_id, r.target_concept_id, r.phase]),
    [['hint_opened', item_id, FIXTURE_CONCEPT, 'free'], ['solution_opened', item_id, FIXTURE_CONCEPT, 'free']]);
});
test('D4: recovery closes a help-only instance from its version 2 help records, as the live session end would (S2-17)', async () => {
  const item_id = lesson.pool_item_ids[0]!;
  const flow = async (app: Hono): Promise<void> => {
    await post(app, '/api/hint', { item_id, item_instance_id: 'H-1', level: 1 });                                   // names no phase: logged as free
    // Names one, which the instance keeps. A phase the browser may name: since the B15 follow-up an unserved instance that names
    // a served-only phase (review, mixed, drill, case) is recorded as free.
    await post(app, '/api/show-answer', { item_id, item_instance_id: 'H-1', phase: 'lesson_block' });
    await post(app, '/api/hint', { item_id, item_instance_id: 'H-2', level: 2 });                                   // no phase yet...
    await post(app, '/api/submit', { item_id, item_instance_id: 'H-2', sql: 'SELECT city FROM stores', phase: 'retest' });   // ...the attempt names it
  };
  // The live run: the session ends normally and the end hook closes both instances.
  const live = await deps({ runner });
  await flow(createApp(live));
  await live.session.end('explicit');
  const liveCloses = (await attempts(live)).filter((r) => r.record === 'item_close');
  // The crashed run: no session end, so the next start recovers.
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-help-only-')));
  await flow(createApp(await deps({ runner }, log)));
  const records = await log.readAll('attempts');
  const help = (records as any[]).filter((r) => r.record !== 'attempt');
  assert.deepEqual(help.map((r) => [r.record, r.schema_version, r.item_instance_id, r.item_id, r.target_concept_id, r.phase]), [
    ['hint_opened', 2, 'H-1', item_id, FIXTURE_CONCEPT, 'free'],
    ['solution_opened', 2, 'H-1', item_id, FIXTURE_CONCEPT, 'lesson_block'],
    ['hint_opened', 2, 'H-2', item_id, FIXTURE_CONCEPT, 'free']]);
  const d2 = await deps({ runner, closedInstances: loggedInstanceIds(records) }, log);
  await recoverLogs(d2.logger, d2.session, records, await log.readAll('events'), d2.state);
  const closes = ((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.reason, c.item_id, c.target_concept_id, c.phase]),
    [['H-2', 'session_end', item_id, FIXTURE_CONCEPT, 'retest'], ['H-1', 'session_end', item_id, FIXTURE_CONCEPT, 'lesson_block']],
    'both at the session end, instances with attempts first, taking the phase from their attempts; then help-only ones, taking their latest help record\'s phase');
  const h1 = closes[1];
  const end = ((await log.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.equal(h1.ts, end.ts, 'help records name no session: the close is stamped with the recovered end of the session whose window holds them (S2-85)');
  assert.deepEqual(h1.raw_outcome, { graded_attempts: 0, passed: false, first_attempt_pass: false, max_hint_level: 1,
    revealed_before_attempt: true, active_ms: Date.parse(end.ts) - Date.parse(help[0].ts) });
  assert.deepEqual([h1.schema_version, h1.instance_rating, h1.card_reviews], [2, null, []], 'closes are rated from Task B7');
  // Apart from the time stamps, the recovered closes say what the live session end said.
  const same = (xs: any[]) => [...xs].sort((a, b) => a.item_instance_id.localeCompare(b.item_instance_id))
    .map((c) => ({ ...c, ts: null, raw_outcome: { ...c.raw_outcome, active_ms: null } }));
  assert.deepEqual(same(closes), same(liveCloses));
});
test('D4: a version 1 help record names no item, so its help-only instance stays unrecoverable', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-help-v1-')));
  const ts = '2026-10-05T09:00:00.000Z';
  // Typed as object: append() has no index signature for the extra fields (as in tests/core/jsonl.test.ts).
  const start: object = { event: 'session', schema_version: 1, ts, session_id: 'S-1', section: 'all', phase: 'start' };
  const v1Hint: object = { record: 'hint_opened', schema_version: 1, ts, item_instance_id: 'V1-1', level: 2 };
  await log.append('events', start);
  await log.append('attempts', v1Hint);
  const records = await log.readAll('attempts');
  const d = await deps({ runner, closedInstances: loggedInstanceIds(records) }, log);
  await recoverLogs(d.logger, d.session, records, await log.readAll('events'), d.state);
  assert.deepEqual(((await log.readAll('attempts')) as any[]).map((r) => r.record), ['hint_opened'], 'no close is written');
  const end = ((await log.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.deepEqual([end?.session_id, end?.reason], ['S-1', 'recovered'], 'the session still ends');
  const app = createApp(d);
  assert.equal((await post(app, '/api/hint', { item_id: lesson.pool_item_ids[0], item_instance_id: 'V1-1', level: 1, phase: 'free' })).status, 409,
    'the instance is named in the log, so it stays closed to new requests');
});
test('content that cannot load starts setup mode with a check that names the file, never its text', async () => {
  const root = await makeContentFixture();
  const id = lesson.pool_item_ids[0]!;
  await writeFile(join(root, 'keys/sql', `${id}.json`), '{"reference_sql": "SELECT secret_key_text FROM stores" oops}');
  const bad = await loadContentOrSetup(root);
  assert.equal(bad.check?.ok, false);
  assert.match(bad.check!.detail, new RegExp(`content could not be loaded: keys/sql/${id}\\.json`));
  assert.ok(!bad.check!.detail.includes('secret_key_text'), 'the check never quotes the file');
  await rm(join(root, 'sql/curriculum.json'));
  assert.match((await loadContentOrSetup(root)).check!.detail, /content could not be loaded: sql\/curriculum\.json/, 'a missing file is named too');
  const app = createApp(await deps({ content: bad.content, checks: [bad.check!] }));
  const status = await json(get(app, '/api/status'));
  assert.deepEqual([status.degraded, status.versions.content], [true, 'none']);
  assert.equal((await get(app, '/api/curriculum')).status, 503);
  assert.equal((await loadContentOrSetup(await makeContentFixture())).check, null, 'good content has no check');
});
test('logs that cannot be read start setup mode with a check that says why', async () => {
  const unreadable: JsonlLog = { dir: 'x', append: async () => {}, readAll: async () => { throw new Error('EACCES: permission denied, scandir \'D:\\logs\''); } };
  const r = await readLogs(new AttemptLogger(unreadable));
  assert.deepEqual([r.events, r.records], [[], []]);
  assert.equal(r.check?.ok, false);
  assert.match(r.check!.detail, /logs could not be read: EACCES: permission denied/);
  const fine = await readLogs(new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-logs-')))));
  assert.equal(fine.check, null);
});
test('settings accept real calendar dates, including a leap day', async () => {
  const app = createApp(await deps({ runner }));
  for (const good of ['2026-02-28', '2028-02-29']) assert.equal((await post(app, '/api/settings', { key: 'exam_date', value: good })).status, 200, good);
});
test('settings are validated, logged, and back up the log at the session end', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const folder = await mkdtemp(join(tmpdir(), 'al-backup-'));
  assert.equal((await post(app, '/api/settings', { key: 'theme', value: 'dark' })).status, 400);
  assert.equal((await post(app, '/api/settings', { key: 'backup_folder', value: 'relative/folder' })).status, 400);
  assert.equal((await post(app, '/api/settings', { key: 'exam_date', value: '9 October' })).status, 400);
  assert.equal((await post(app, '/api/settings', { key: 'goal_dates', value: { G1: 'soon' } })).status, 400);
  // Real calendar dates only: the shape alone is not enough.
  for (const bad of ['2026-13-01', '2026-02-30', '2027-02-29']) assert.equal((await post(app, '/api/settings', { key: 'exam_date', value: bad })).status, 400, bad);
  assert.equal((await post(app, '/api/settings', { key: 'goal_dates', value: { G1: '2026-02-30' } })).status, 400);
  assert.equal((await post(app, '/api/settings', { key: 'exam_date', value: '2026-11-20' })).status, 200);
  assert.equal((await post(app, '/api/settings', { key: 'backup_folder', value: folder })).status, 200);
  assert.deepEqual((await json(get(app, '/api/status'))).settings, { backup_folder: folder, exam_date: '2026-11-20', goal_dates: {} });
  const changes = ((await d.logger.readAll('events')) as any[]).filter((e) => e.event === 'setting_change').map((e) => e.key);
  assert.deepEqual(changes, ['exam_date', 'backup_folder']);
  const ended = await json(post(app, '/api/session-end', {}));
  assert.equal(ended.backup.ok, true);
  assert.ok((await stat(ended.backup.path)).isDirectory());
});
test('exposure, outside practice, external results and reports are logged', async () => {
  const d = await deps();
  const app = createApp(d);
  assert.equal((await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'video' })).status, 400);
  assert.equal((await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'reading' })).status, 200);
  assert.equal((await post(app, '/api/outside-practice', { source: 'SQLBolt', description: 'lesson 3', score: 0 })).status, 200);
  assert.equal((await post(app, '/api/external-result', { kind: 'ga4_exam', data: { date: '2026-11-20', score: '80', passed: true } })).status, 400);
  assert.equal((await post(app, '/api/external-result', { kind: 'ga4_exam', data: { date: '2026-11-20', score: 80, passed: true } })).status, 200);
  assert.equal((await post(app, '/api/external-result', { kind: 'portfolio_piece', data: { title: 'Price test', data_source: 'Voltmarkt', real_data: false } })).status, 200);
  assert.equal((await post(app, '/api/report', { item_id: 'general', text: 'typo in lesson 1' })).status, 200);
  assert.deepEqual((await attempts(d)).map((r) => [r.record, r.kind]), [['exposure', 'reading']]);
  const events = ((await d.logger.readAll('events')) as any[]).filter((e) => e.event !== 'session');
  assert.deepEqual(events.map((e) => [e.event, e.kind ?? e.score]), [['outside_practice', '0'], ['external_result', 'ga4_exam'], ['external_result', 'portfolio_piece']]);
  assert.equal(((await d.logger.readAll('reports')) as any[])[0].text, 'typo in lesson 1');
});

// Codex review of PR #28, aydinlearns F1 and F3 (docs/reviews/codex-findings.md).
/** Wraps a runner so every request waits until `release()`: a submission held mid-grading. */
function heldRunner(inner: RunnerClient) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const reached = new Promise<void>((r) => { entered = r; });
  const held: RunnerClient = { restarts: 0, close: async () => {},
    request: async <T>(req: Parameters<RunnerClient['request']>[0]) => { entered(); await gate; return inner.request<T>(req); } };
  return { runner: held, release, reached };
}
test('F1: ending the session while a submission is grading waits for it, so the attempt comes before its close', async () => {
  const h = heldRunner(runner);
  const d = await deps({ runner: h.runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  const submitting = json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }));
  await h.reached;                                         // the submission is now grading
  const session = d.session.currentId;
  const ending = json(post(app, '/api/session-end', {}));
  await new Promise((r) => setTimeout(r, 50));             // give the end every chance to run ahead
  h.release();
  const [graded] = await Promise.all([submitting, ending]);
  assert.equal(graded.outcome, 'fail');
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => r.record), ['attempt', 'item_close'], 'the attempt is logged before the close');
  assert.equal(recs[0].session_id, session, 'the attempt belongs to the session it was made in');
  assert.equal(recs[1].raw_outcome.graded_attempts, 1, 'the close counts the attempt');
  const events = ((await d.logger.readAll('events')) as any[]).filter((e) => e.event === 'session');
  assert.ok(Date.parse(events.find((e) => e.phase === 'end').ts) >= Date.parse(recs[0].submitted_at), 'the session ends after its last attempt');
});
test('F3: two "I was right" requests at once log one override and one report', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  const both = await Promise.all([1, 2].map(() => post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 400], 'the second request is refused');
  assert.equal((await attempts(d)).filter((r) => r.grading_source === 'override').length, 1);
  assert.equal(((await d.logger.readAll('reports')) as any[]).length, 1);
});

// Codex review of PR #29, aydinlearns F4, and "I was right" after a session end (sprint 2, Task A3).
/** A log whose append number `at` (0-based, every file counted) waits until `release()` and then fails. */
function heldFailingLog(real: JsonlLog, at: number) {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const reached = new Promise<void>((r) => { entered = r; });
  const log: JsonlLog = {
    dir: real.dir,
    readAll: (f) => real.readAll(f),
    append: async (f, r) => {
      if (calls++ === at) { entered(); await gate; throw new Error('disk hiccup'); }
      await real.append(f, r);
    },
  };
  return { log, release, reached };
}
const freshLog = async () => openJsonlLog(await mkdtemp(join(tmpdir(), 'al-f4-')));
const overrides = async (d: AppDeps) => (await attempts(d)).filter((r) => r.grading_source === 'override').length;

test('F4: a failed override write gives the claim back, so a later session end logs no pass and no override', async () => {
  // Appends: 0 the session start, 1 the failed attempt, 2 the override attempt, which fails once.
  const d = await deps({ runner }, flakyLog(await freshLog(), 2));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;             // the city of store 8: no rows
  assert.equal((await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }))).outcome, 'fail');
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 500);
  // HTTP writes now get 503, but the session end hooks still run: the idle timer, shutdown(), or this direct end.
  await d.session.end('explicit');
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => [r.record, r.grading_source ?? null]), [['attempt', 'auto'], ['item_close', null]], 'no override attempt');
  assert.deepEqual([recs[1].reason, recs[1].raw_outcome.passed], ['session_end', false]);
  assert.deepEqual(await d.logger.readAll('reports'), [], 'no content report');
});
test('F4: a failed override write restores the earlier pass, not false', async () => {
  // Appends: 0 the session start, 1 a passing attempt, 2 a failed one, 3 the override attempt, which fails once.
  const d = await deps({ runner }, flakyLog(await freshLog(), 3));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  assert.equal((await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free' }))).outcome, 'pass');
  assert.equal((await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }))).outcome, 'fail');
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 500);
  await d.session.end('explicit');
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close')?.raw_outcome.passed, true, 'the instance had passed before the override');
  assert.equal(await overrides(d), 0);
});
test('F4: a failed report write after the override attempt landed keeps the claim', async () => {
  // Appends: 0 the session start, 1 the failed attempt, 2 the override attempt, 3 the content report, which fails once.
  const d = await deps({ runner }, flakyLog(await freshLog(), 3));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 500);
  await d.session.end('explicit');
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close')?.raw_outcome.passed, true, 'the override attempt is in the log, so the close passes');
  assert.equal(await overrides(d), 1);
  assert.deepEqual(await d.logger.readAll('reports'), []);
});
test('F4: while a failing override write is pending, a second request is refused, and neither logs an override', async () => {
  const h = heldFailingLog(await freshLog(), 2);        // 0 the session start, 1 the failed attempt, 2 the override attempt
  const d = await deps({ runner }, h.log);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  const first = post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null });
  await h.reached;                                       // the first override's write is pending
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 400, 'refused while pending');
  h.release();
  assert.equal((await first).status, 500);
  await d.session.end('explicit');
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close')?.raw_outcome.passed, false);
  assert.equal(await overrides(d), 0);
});
test('"I was right" after a session end gets 409, like every request on a closed instance, and logs nothing', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app, '/api/session-end', {});
  const r = await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null });
  assert.equal(r.status, 409);
  assert.equal((await r.json() as any).error, 'This exercise is closed. Leave it and open it again.');
  assert.equal(await overrides(d), 0);
  assert.deepEqual(await d.logger.readAll('reports'), []);
});
// Fix round (A3 review): a submission or a close on the instance must not read a claim that a failing write gives back.
/** `p` if it settles within `ms`, else undefined. The fixed routes hold `p` until the override settles, so the test moves on. */
const within = <T>(p: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([p, new Promise<undefined>((r) => setTimeout(r, ms))]);
test('F4: a pass submitted while an override write is pending still counts when that write fails', async () => {
  const h = heldFailingLog(await freshLog(), 2);        // 0 the session start, 1 the failed attempt, 2 the override attempt
  const d = await deps({ runner }, h.log);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  const overriding = post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null });
  await h.reached;                                       // the override's write is pending
  const submitting = json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free' }));
  await within(submitting, 500);                         // time to grade; without the wait the pass is logged here
  h.release();
  assert.equal((await overriding).status, 500);
  assert.equal((await submitting).outcome, 'pass');
  await d.session.end('explicit');
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => [r.record, r.outcome ?? null]), [['attempt', 'fail'], ['attempt', 'pass'], ['item_close', null]]);
  assert.deepEqual([recs[2].reason, recs[2].raw_outcome.passed], ['session_end', true], 'the logged pass stands');
});
test('F4: item closes sent while an override write is pending wait for it: one close, which says left when that write fails', async () => {
  const h = heldFailingLog(await freshLog(), 2);        // 0 the session start, 1 the failed attempt, 2 the override attempt
  const d = await deps({ runner }, h.log);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  const overriding = post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null });
  await h.reached;                                       // the override's write is pending
  const closing = Promise.all([1, 2].map(() => post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'pass' })));   // a double-click
  await within(closing, 200);                            // without the wait the close is written here
  h.release();
  assert.equal((await overriding).status, 500);
  assert.deepEqual((await closing).map((r) => r.status), [200, 200]);
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => r.record), ['attempt', 'item_close'], 'one close, and no override attempt');
  assert.deepEqual([recs[1].reason, recs[1].raw_outcome.passed], ['left', false], 'no pass without an override in the log');
});

// Task B7: rated closes, servings, block closes, leech resets and the map's states, all from the replay.
/** A temporary log holding `records`: events go to events.jsonl, everything else to the attempts file. */
async function logWith(records: object[]): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-b7-')));
  for (const r of records) await log.append('event' in r ? 'events' : 'attempts', r as { ts?: string; submitted_at?: string });
  return log;
}
/** The fixture concept was first read `minutes` ago, so a graded attempt now may give its card the first rating (S2-03). */
const readAgo = (minutes: number) => exposure(FIXTURE_CONCEPT, new Date(Date.now() - minutes * 60_000).toISOString());
const CARD = `CARD-${FIXTURE_CONCEPT}`;

test('B7: a live close carries the instance rating and card reviews that a fresh replay of the log gives (S2-15)', async () => {
  const log = await logWith([readAgo(20)]);
  const d = await deps({ runner }, log);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;            // the city of store 8: no rows on either dataset
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'pass' });
  const close = (await attempts(d)).find((r) => r.record === 'item_close');
  assert.equal(close.instance_rating, 3, 'first attempt, no help, within twice the target, on a card with no rating yet: Good');
  assert.deepEqual(close.card_reviews.map((c: any) => [c.card_id, c.rating, c.scheduler_config_id, c.model]), [[CARD, 3, 'sql-v1', 'fsrs-6']]);
  const fresh = replay(await log.readAll('attempts'), await log.readAll('events'), replayOptions(buildCatalog(content), new Date()));
  assert.deepEqual([close.instance_rating, close.card_reviews], [fresh.instances.get('I-1')!.rating, fresh.instances.get('I-1')!.card_reviews]);
  assert.deepEqual(fresh.warnings, []);
  assert.deepEqual(d.state.current().cards.get(CARD)!.snapshot, close.card_reviews[0].state_after, 'the mirrored state saw the write');
});

test('B7: a close written by startup recovery equals the live close for the same records', async () => {
  const seed = readAgo(20);
  const liveLog = await logWith([seed]);
  const d = await deps({ runner }, liveLog);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free', active_ms: 30_000 });   // a graded failure
  const attempt = (await attempts(d)).find((r) => r.record === 'attempt');
  // The live server ends the session at the attempt's own time, which is where recovery stamps its close.
  await d.session.end('explicit', new Date(attempt.submitted_at));
  const live = (await attempts(d)).find((r) => r.record === 'item_close');
  assert.equal(live.instance_rating, 1, 'a graded failure rates Again');
  // The same records, from a server that stopped before the session end:
  const start = ((await liveLog.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'start');
  const crashLog = await logWith([seed, attempt, start]);
  const d2 = await deps({ runner }, crashLog);
  await recoverLogs(d2.logger, d2.session, await crashLog.readAll('attempts'), await crashLog.readAll('events'), d2.state);
  const recovered = ((await crashLog.readAll('attempts')) as any[]).find((r) => r.record === 'item_close');
  assert.deepEqual(recovered, live);
});

test('B7: served items carry the server\'s phase, block and repeat flag; the session end writes the missing block_close at the worst rating (S2-04, S2-16)', async () => {
  const servings = new Servings();
  const d = await deps({ runner, servings }, await logWith([readAgo(20)]));
  const app = createApp(d);
  const [a, b] = lesson.pool_item_ids as [string, string];        // the cities of stores 8 and 9: no rows
  const ia = servings.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: a });
  const ib = servings.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: true, section: 'sql', item_id: b });
  assert.equal((await post(app, '/api/submit', { item_id: b, item_instance_id: ia, sql: 'SELECT 1', phase: 'mixed' })).status, 400, 'a serving belongs to its item');
  await post(app, '/api/submit', { item_id: a, item_instance_id: ia, sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free', active_ms: 30_000 });   // the browser's phase is ignored
  await post(app, '/api/item-close', { item_id: a, item_instance_id: ia, reason: 'pass', phase: 'free' });
  await post(app, '/api/submit', { item_id: b, item_instance_id: ib, sql: 'SELECT city FROM stores', phase: 'free' });            // a graded failure, left open
  assert.equal((await json(post(app, '/api/session-end', {}))).ok, true);
  const recs = await attempts(d);
  assert.deepEqual(recs.filter((r) => r.record === 'attempt').map((r) => [r.phase, r.block_id, r.repeat_exposure]), [['mixed', 'B-1', false], ['mixed', 'B-1', true]]);
  assert.deepEqual(recs.filter((r) => r.record === 'item_close').map((c) => [c.item_instance_id, c.reason, c.block_id, c.instance_rating, c.card_reviews.length]),
    [[ia, 'pass', 'B-1', 3, 0], [ib, 'session_end', 'B-1', 1, 0]], 'inside a block no review is written at the close');
  const end = ((await d.logger.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  const blockRec = recs.at(-1);
  assert.deepEqual([blockRec.record, blockRec.block_id, blockRec.ts, blockRec.card_reviews.map((c: any) => [c.card_id, c.rating])], ['block_close', 'B-1', end.ts, [[CARD, 1]]]);
  assert.equal((await post(app, '/api/submit', { item_id: a, item_instance_id: ia, sql: 'SELECT 1', phase: 'mixed' })).status, 409);
});

test('B7: only the server writes run_end: a browser close says pass or left from the server\'s record', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  assert.equal((await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'run_end' })).status, 200);
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close').reason, 'left');
});

test('B7: a micro-lesson exposure resets a leech card at once; without one, the next session end resets it (S2-28)', async () => {
  const grown = growLeech(FIXTURE_CONCEPT, lesson.pool_item_ids, '2025-06-01T08:00:00Z');
  const resets = async (x: AppDeps) => ((await x.logger.readAll('events')) as any[]).filter((e) => e.event === 'card_event');
  const done = await deps({}, await logWith([...grown.attempts, ...grown.events]));
  assert.ok(done.state.current().cards.get(CARD)!.snapshot.lapses >= 4, 'the fixture is a leech');
  const app = createApp(done);
  assert.equal((await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'micro_lesson' })).status, 200);
  const shown = (await attempts(done)).at(-1);
  assert.deepEqual((await resets(done)).map((e) => [e.card_id, e.kind, e.ts, e.due, e.rating, e.state]), [[CARD, 'reset', shown.ts, shown.ts, 0, 'New']]);
  assert.deepEqual([done.state.current().cards.get(CARD)!.origin, done.state.current().pendingResets], ['reset', []]);
  await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'micro_lesson' });
  assert.equal((await resets(done)).length, 1, 'a card that is no longer a leech is not reset again');

  const skipped = await deps({}, await logWith([...grown.attempts, ...grown.events]));
  const app2 = createApp(skipped);
  await post(app2, '/api/report', { item_id: 'general', text: 'this request starts a session' });
  assert.deepEqual(await resets(skipped), [], 'not while the session is open');
  await post(app2, '/api/session-end', {});
  const end = ((await skipped.logger.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.deepEqual((await resets(skipped)).map((e) => [e.card_id, e.ts]), [[CARD, end.ts]]);
});

test('B7: the map shows the replay\'s states, mastered included (design §5)', async () => {
  const [p1, p2, p3] = lesson.pool_item_ids as [string, string, string];
  const solve = (id: string, item: string, start: string) => instance({ id, item, concept: FIXTURE_CONCEPT, phase: 'review', start,
    steps: [{ at: plus(start, 60), submit: 'pass', activeMs: 100_000 }] });
  const log = await logWith([exposure(FIXTURE_CONCEPT, '2025-06-01T08:00:00Z'),
    ...solve('M-1', p1, '2025-06-03T10:00:00Z'), ...solve('M-2', p2, '2025-06-03T14:00:00Z'), ...solve('M-3', p3, '2025-06-04T10:00:00Z')]);
  const body = await json(get(createApp(await deps({}, log)), '/api/curriculum'));
  assert.equal(body.concepts.find((c: any) => c.id === FIXTURE_CONCEPT).state, 'mastered');
  assert.equal(body.concepts.find((c: any) => c.id === 'SQL-BASICS-01').state, 'new');
});

// ---- B15 follow-up: phases only the server hands out ----------------------------------------------------------------
// review and case (/api/serve), mixed (/api/mixed/start) and drill (the drill start) belong to an instance the server served
// in this session. A browser naming one for any other instance gets 'free': graded, never rated as a review, a drill or a
// block member, and never a qualifying solve (S2-24). free, the lesson phases and retest stay as the browser names them.

/** A rated card and a first exposure two Amsterdam dates back, so an unassisted first-attempt pass in a review would qualify. */
function ratedHistory(): object[] {
  const start = new Date(Date.now() - 2 * 86_400_000).toISOString();
  return [exposure(FIXTURE_CONCEPT, plus(start, -30 * 60)),
    ...instance({ id: 'PRIOR', item: lesson.pool_item_ids[0]!, concept: FIXTURE_CONCEPT, version: 2, start, steps: [{ at: plus(start, 30), submit: 'pass' }], close: { at: plus(start, 60) } })];
}
/** Pool item n asks for the city of store 8 + n: no rows on either dataset, so this query passes. */
const passFor = (n: number) => ({ item_id: lesson.pool_item_ids[n]!, sql: `SELECT city FROM stores WHERE store_id = ${8 + n}` });
/** One instance from the browser, as ExercisePanel sends it: optional hints, a submission and a close, all naming `phase`. */
async function browserInstance(app: Hono, id: string, phase: string, n: number, hint?: 1 | 2): Promise<void> {
  const { item_id, sql } = passFor(n);
  if (hint) for (let level = 1; level <= hint; level++) assert.equal((await post(app, '/api/hint', { item_id, item_instance_id: id, level, phase })).status, 200);
  assert.equal((await post(app, '/api/submit', { item_id, item_instance_id: id, sql, phase, active_ms: 60_000 })).status, 200);
  assert.equal((await post(app, '/api/item-close', { item_id, item_instance_id: id, reason: 'pass', phase })).status, 200);
}
const phasesOf = async (d: AppDeps, id: string) => (await attempts(d)).filter((r) => r.item_instance_id === id).map((r) => [r.record, r.phase, r.block_id ?? null]);
const closeOf = async (d: AppDeps, id: string) => (await attempts(d)).find((r) => r.record === 'item_close' && r.item_instance_id === id);
const ratingOf = (c: any) => [c.instance_rating, c.card_reviews.map((x: any) => [x.card_id, x.rating])];

test('B15: an unserved instance that names review is recorded as free: no qualifying solve, and its card changes as free study does', async () => {
  const named = await deps({ runner }, await logWith(ratedHistory()));
  await browserInstance(createApp(named), 'U-1', 'review', 1);
  assert.deepEqual(await phasesOf(named, 'U-1'), [['attempt', 'free', null], ['item_close', 'free', null]]);
  assert.equal(named.state.current().instances.get('U-1')?.qualifying, false, 'never a qualifying solve (S2-24)');
  const free = await deps({ runner }, await logWith(ratedHistory()));
  await browserInstance(createApp(free), 'U-1', 'free', 1);
  assert.deepEqual(ratingOf(await closeOf(named, 'U-1')), ratingOf(await closeOf(free, 'U-1')), 'the same card review as the same work called free');
});

test('B15: an unserved instance that names drill is recorded as free: the drill row never rates it', async () => {
  // Hint 2 before the pass: free study rates Again; the drill row would have rated Good.
  const named = await deps({ runner }, await logWith(ratedHistory()));
  await browserInstance(createApp(named), 'U-2', 'drill', 2, 2);
  assert.deepEqual(await phasesOf(named, 'U-2'), [['hint_opened', 'free', null], ['hint_opened', 'free', null], ['attempt', 'free', null], ['item_close', 'free', null]]);
  const free = await deps({ runner }, await logWith(ratedHistory()));
  await browserInstance(createApp(free), 'U-2', 'free', 2, 2);
  const close = await closeOf(named, 'U-2');
  assert.deepEqual(ratingOf(close), ratingOf(await closeOf(free, 'U-2')));
  assert.equal(close.instance_rating, 1, 'Again, as free study with hint 2');
  for (const phase of ['mixed', 'case']) {
    const d = await deps({ runner }, await logWith(ratedHistory()));
    await browserInstance(createApp(d), `U-${phase}`, phase, 3);
    assert.deepEqual(await phasesOf(d, `U-${phase}`), [['attempt', 'free', null], ['item_close', 'free', null]], phase);
  }
});

test('B15: free, the lesson phases and retest stay as the browser names them; a served instance keeps its serving\'s phase', async () => {
  const servings = new Servings();
  const d = await deps({ runner, servings }, await logWith(ratedHistory()));
  const app = createApp(d);
  for (const [i, phase] of ['retest', 'lesson_block', 'pretest', 'free'].entries()) {
    await browserInstance(app, `B-${phase}`, phase, i + 1);
    assert.equal((await closeOf(d, `B-${phase}`)).phase, phase);
  }
  for (const phase of ['review', 'case'] as const) {
    const id = servings.serve({ phase, block_id: null, repeat_exposure: false, section: 'sql', item_id: passFor(5).item_id });
    await browserInstance(app, id, 'free', 5);
    assert.deepEqual(await phasesOf(d, id), [['attempt', phase, null], ['item_close', phase, null]], `served ${phase}`);
  }
});

test('B15: after an idle session end, a reopened review or mixed exercise names its old phase and is recorded as free', async () => {
  const servings = new Servings();
  const d = await deps({ runner, servings }, await logWith(ratedHistory()));
  const app = createApp(d);
  const review = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: passFor(1).item_id });
  const [m1, m2] = [2, 3].map((n) => servings.serve({ phase: 'mixed', block_id: 'B-IDLE', repeat_exposure: false, section: 'sql', item_id: passFor(n).item_id })) as [string, string];
  const last = new Date(Date.now() + 3_600_000);
  await d.session.touch(last);
  await post(app, '/api/hint', { item_id: passFor(1).item_id, item_instance_id: review, level: 1, phase: 'review' });
  await post(app, '/api/hint', { item_id: passFor(2).item_id, item_instance_id: m1, level: 1, phase: 'mixed' });
  await d.session.endIfIdle(new Date(last.getTime() + 31 * 60_000));
  assert.deepEqual([(await closeOf(d, review)).phase, (await closeOf(d, m1)).phase], ['review', 'mixed'], 'the idle end closes them with their servings\' phases');
  // The panel's next request on each served id is refused; it reopens with a new id of its own, naming the phase it had.
  assert.equal((await post(app, '/api/hint', { item_id: passFor(1).item_id, item_instance_id: review, level: 2, phase: 'review' })).status, 409);
  assert.equal((await post(app, '/api/hint', { item_id: passFor(3).item_id, item_instance_id: m2, level: 1, phase: 'mixed' })).status, 409, 'the block closed with the session');
  await browserInstance(app, 'R-review', 'review', 1);
  await browserInstance(app, 'R-mixed', 'mixed', 3);
  assert.deepEqual(await phasesOf(d, 'R-review'), [['attempt', 'free', null], ['item_close', 'free', null]]);
  assert.deepEqual(await phasesOf(d, 'R-mixed'), [['attempt', 'free', null], ['item_close', 'free', null]]);
});

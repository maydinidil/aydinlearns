import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import { GATE_DEADLINE_MS } from '../../server/runner/child.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';
import { EXIT_SQL, PING_SQL } from '../helpers/hang-child.ts';

const db = await makeFixtureDb(SHOP);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const HANG = fileURLToPath(new URL('../helpers/hang-child.ts', import.meta.url));
const ask = (sql: string, deadlineMs: number): RunnerReq => ({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 1, deadlineMs });
const TIMEOUT = { ok: false, error: { kind: 'timeout' } };

test('Review Focus 5: a runaway query is stopped and the runner stays usable', async () => {
  const runner = await startRunner(db, { graceMs: 1000 });
  const t0 = Date.now();
  const r = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT count(*) FROM big a, big b, big c', cap: 10, deadlineMs: 500 });
  assert.deepEqual(r, { ok: false, error: { kind: 'timeout' } });
  assert.ok(Date.now() - t0 < 500 + 1000 + 1500, 'within deadline plus grace');
  const next = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT city FROM stores', cap: 10, deadlineMs: 2000 });
  assert.equal(next.ok, true);
  await runner.close();
});

test('a child that stops answering is killed after deadline plus grace, then respawned', async () => {
  const runner = await startRunner(db, { graceMs: 200, childPath: fileURLToPath(new URL('../helpers/hang-child.ts', import.meta.url)) });
  const r = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT 1', cap: 1, deadlineMs: 100 });
  assert.deepEqual(r, { ok: false, error: { kind: 'timeout' } });
  await sleep(500);
  assert.equal(runner.restarts, 1);
  await runner.close();
});

test('requests queue in order', async () => {
  const runner = await startRunner(db);
  const sqls = ['SELECT 1 AS a', 'SELECT 2 AS a', 'SELECT 3 AS a'];
  const rs = await Promise.all(sqls.map((sql) => runner.request<any>({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 5, deadlineMs: 2000 })));
  assert.deepEqual(rs.map((r: any) => Number(r.data.rows[0][0])), [1, 2, 3]);
  await runner.close();
});

test('startRunner rejects when the database cannot be opened', async () => {
  await assert.rejects(startRunner('C:/does/not/exist/nope.duckdb'), /runner/i);
});

test('Review Focus 5: a real child stuck in one long call is killed at deadline plus grace, and its replacement answers', async () => {
  const runner = await startRunner(db, { graceMs: 10 });
  try {
    // About 600 ms of constant folding in one call, which sees the interrupt only when it returns (spike A, X3b).
    assert.deepEqual(await runner.request(ask("SELECT length(repeat('ab', 200000000)) AS n", 50)), TIMEOUT);
    assert.equal(runner.restarts, 1, 'killed by the client, not stopped by the child');
    const next = await runner.request<{ rows: unknown[][] }>({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT city FROM stores ORDER BY store_id', cap: 10, deadlineMs: 2000 });
    assert.deepEqual(next.ok && next.data.rows, [['Amsterdam'], ['Gent'], ['Luxembourg']]);
  } finally {
    await runner.close();
  }
});

// R31. The client keeps its own copy of the gate deadline (importing child.ts would load DuckDB
// into the server), so this pins that copy to the child's value.
test("R31: a gate request is killed at the child's gate deadline plus grace, not at 30 seconds", async () => {
  const grace = 100;
  const runner = await startRunner(db, { graceMs: grace, childPath: HANG });
  try {
    const t0 = Date.now();
    const r = await runner.request({ op: 'gate', schema: 'vis', allowedSchemas: [], sql: 'SELECT 1' });
    const took = Date.now() - t0;
    assert.deepEqual(r, TIMEOUT);
    assert.ok(took >= GATE_DEADLINE_MS + grace - 50 && took < GATE_DEADLINE_MS + grace + 1500, `took ${took} ms`);
    assert.equal(runner.restarts, 1);
  } finally {
    await runner.close();
  }
});

test('a request queued behind a killed one goes to the new child, not the dying one', async () => {
  const runner = await startRunner(db, { graceMs: 200, childPath: HANG });
  try {
    const rs = await Promise.all([runner.request(ask('SELECT 1', 100)), runner.request(ask('SELECT 2', 100))]);
    assert.deepEqual(rs, [TIMEOUT, TIMEOUT]);
    assert.equal(runner.restarts, 2);
  } finally {
    await runner.close();
  }
});

test('a child that dies mid-request resolves that request as a crash, and its replacement takes the next one', async () => {
  const runner = await startRunner(db, { graceMs: 100, childPath: HANG });
  try {
    const r = await runner.request(ask(EXIT_SQL, 5000));
    assert.ok(!r.ok && r.error.kind === 'crash', JSON.stringify(r));
    assert.equal(runner.restarts, 1);
    assert.deepEqual(await runner.request(ask('SELECT 1', 100)), TIMEOUT, 'answered by the replacement, which never answers');
  } finally {
    await runner.close();
  }
});

// `restarts` counts every child started after the first, so it also counts spawn attempts.
const isCrash = (r: RunnerResult, message: RegExp): boolean => !r.ok && r.error.kind === 'crash' && message.test(r.error.message);

/** A runner on the hang child whose replacement cannot start: its database file is gone. */
async function withFailedReplacement(): Promise<{ runner: RunnerClient; file: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'al-runner-'));
  const file = join(dir, 'course.duckdb');
  await writeFile(file, '');
  const runner = await startRunner(file, { graceMs: 100, childPath: HANG });
  await rm(file);
  const r = await runner.request(ask(EXIT_SQL, 5000));   // the child dies; its replacement finds no database
  assert.ok(isCrash(r, /runner exited/), JSON.stringify(r));
  return { runner, file, dir };
}

test('a replacement that cannot start is not respawned in the background, and a request after 2 seconds retries it', async () => {
  const { runner, file, dir } = await withFailedReplacement();
  try {
    const inWindow = await runner.request(ask(PING_SQL, 2000));   // waits for the replacement to fail
    assert.ok(isCrash(inWindow, /failed to start/), JSON.stringify(inWindow));
    assert.equal(runner.restarts, 1, 'one respawn, and no retry inside the 2-second window');
    await writeFile(file, '');
    await sleep(2100);
    assert.equal(runner.restarts, 1, 'nothing is spawned in the background');
    assert.deepEqual(await runner.request(ask(PING_SQL, 2000)), { ok: true, data: 'pong' });
    assert.equal(runner.restarts, 2, 'that request made one spawn');
  } finally {
    await runner.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('requests inside the 2-second window resolve as a crash without spawning; a failed retry starts a new window; close stops retries', async () => {
  const { runner, file, dir } = await withFailedReplacement();
  try {
    for (let i = 0; i < 3; i++) {
      const r = await runner.request(ask(PING_SQL, 2000));
      assert.ok(isCrash(r, /failed to start/), JSON.stringify(r));
    }
    assert.equal(runner.restarts, 1, 'no spawn inside the window');
    await sleep(2100);
    const retry = await runner.request(ask(PING_SQL, 2000));   // the database is still missing
    assert.ok(isCrash(retry, /failed to start/), JSON.stringify(retry));
    assert.equal(runner.restarts, 2, 'one retry');
    assert.ok(isCrash(await runner.request(ask(PING_SQL, 2000)), /failed to start/));
    assert.equal(runner.restarts, 2, 'the failed retry starts a new window');
    await writeFile(file, '');
    await sleep(2100);
    await runner.close();
    assert.deepEqual(await runner.request(ask(PING_SQL, 2000)), { ok: false, error: { kind: 'crash', message: 'runner closed' } });
    assert.equal(runner.restarts, 2, 'no spawn after close, though a start would now succeed');
  } finally {
    await runner.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('close ends a child that ignores shutdown; requests in flight or made later resolve as a crash', async () => {
  const runner = await startRunner(db, { childPath: HANG });
  const inFlight = runner.request(ask('SELECT 1', 60_000));
  await sleep(50);
  await runner.close();
  const r = await inFlight;
  assert.ok(!r.ok && r.error.kind === 'crash', JSON.stringify(r));
  assert.deepEqual(await runner.request(ask('SELECT 1', 100)), { ok: false, error: { kind: 'crash', message: 'runner closed' } });
});

// tests/server/log-v7.test.ts: log version 7 (owner decision D112; sprint 7, Task M1). `mock_open` is a new record in the attempt
// files, written when a recruiter mock starts (S7-01); the logger writes it like every other record. Replay reads versions 1 to 7 and
// rates nothing from a mock_open: every replay fixture, stamped as version 7 and with mock_open records among its records, replays to
// exactly the state it gave as written (Review Focus 5). Every record here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, type MockOpen } from '../../core/envelope.ts';
import { openJsonlLog, type LogFile } from '../../core/jsonl.ts';
import { replay, type ReplayResult } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { golden, growLeech, run, snapshot, A, type Log } from '../helpers/replay-fixture.ts';
import { attemptsOnly, tutorLog, withLab } from '../helpers/replay-logs.ts';
import { sprint2SingleAnswerLog } from '../helpers/s2-golden.ts';

const mockOpen = (ts: string, over: Partial<MockOpen> = {}): MockOpen => ({
  record: 'mock_open', schema_version: SCHEMA_VERSION, ts, session_id: 'S-V7', block_id: 'mock-screen-00000000-0000-4000-8000-000000000001',
  mock: 'screen', form_id: 'SCREEN-A', minutes: 45, on_unseen: true, ...over,
});

test('D112: the log version is 7', () => assert.equal(SCHEMA_VERSION, 7));

test('S7-01: mock_open goes to the monthly attempts file through the logger and reaches the onWrite listeners', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-v7-'));
  const logger = new AttemptLogger(openJsonlLog(dir));
  const seen: [LogFile, string][] = [];
  logger.onWrite((file, r) => seen.push([file, String((r as { record?: string }).record)]));
  const r = mockOpen('2026-11-04T09:30:00.000Z');
  await logger.mockOpen(r);
  assert.deepEqual(await readdir(dir), ['attempts-2026-11.jsonl']);
  assert.deepEqual(await logger.readAll('attempts'), [r]);
  assert.deepEqual(seen, [['attempts', 'mock_open']]);
  assert.match(await readFile(join(dir, 'attempts-2026-11.jsonl'), 'utf8'), /"record":"mock_open","schema_version":7/);
});

type Rec = Record<string, unknown>;
/** The records with every schema_version stamped `v`. */
const stamped = (records: object[], v: number): object[] => records.map((r) => ({ ...r, schema_version: v }));
/**
 * One mock_open of each kind, at times spread through the log's own records, put at the end of the attempt file. The knowledge and take-home
 * ones carry Part 2's additive pass_correct (S7-C34, F4-4-6), and the others are as Part 1 wrote them, so replay meets both shapes.
 */
function withMocks(log: Log): Log {
  const times = (log.attempts as Rec[]).map((r) => String(r.ts ?? r.submitted_at ?? '')).filter((t) => t !== '').sort();
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]!;
  const opens = [
    mockOpen(at(0.1), { block_id: 'mock-screen-1' }),
    mockOpen(at(0.4), { block_id: 'mock-knowledge-1', mock: 'knowledge', form_id: 'KNOWLEDGE', minutes: 40, on_unseen: false, pass_correct: 24 }),
    mockOpen(at(0.6), { block_id: 'mock-case_round-1', mock: 'case_round', form_id: 'CASE-ROUND-A' }),
    mockOpen(at(0.9), { block_id: 'mock-take_home-1', mock: 'take_home', form_id: 'TAKE-HOME-A', minutes: 120, pass_correct: 4 }),
  ];
  return { attempts: [...log.attempts, ...opens], events: log.events };
}
const json = (r: ReplayResult): string => JSON.stringify(snapshot(r));

// A version 1 record carries no logged rating, so replay compares none (S2-15): a log is restamped from 6 to 7, never from 1, and the
// version 6 copy is the baseline. The fixtures as written (versions 1 and 2) are compared with themselves plus the mock_open records.
test('Review Focus 5: each replay fixture with mock_open records replays as written; stamped as version 7, as it does stamped as version 6', () => {
  const logs: [string, Log][] = [
    ['golden', golden()], ['golden over two sessions', golden({ sessions: 2 })], ['golden with a crash', golden({ crashed: true })],
    ['sprint 2 with one answer per choice instance', sprint2SingleAnswerLog()],
    ['a leech', growLeech(A, ['EX-SQL-BASICS-01-E1-01', 'EX-SQL-BASICS-01-E1-02', 'EX-SQL-BASICS-01-E1-03'], '2026-10-05T09:00:00Z')],
    // L86 (Task N2): the version 5 and version 6 replay tests' logs (tests/helpers/replay-logs.ts).
    ['version 5, with lab answers', withLab(attemptsOnly())], ['version 6, with tutor questions', tutorLog()],
  ];
  const as = (log: Log, v: number): Log => ({ attempts: stamped(log.attempts, v), events: stamped(log.events, v) });
  for (const [name, log] of logs) {
    assert.equal(json(run(withMocks(log))), json(run(log)), `${name}: as written, with a mock_open of each kind`);
    const v6 = json(run(as(log, 6)));
    assert.equal(json(run(as(log, 7))), v6, `${name}: version 7 with no mock`);
    assert.equal(json(run(withMocks(as(log, 7)))), v6, `${name}: version 7 with a mock_open of each kind`);
  }
});

// tests/fixtures/replay/smoke-history-v2.json holds the smoke test's seeded history and the replay result the code before log version 3
// gave it (see tests/server/history-v2.test.ts and log-v4.test.ts, which compare it the same way).
const fixture = JSON.parse(await readFile('tests/fixtures/replay/smoke-history-v2.json', 'utf8')) as {
  now: string; attempts: Rec[]; events: Rec[]; result: Rec;
};
const catalog = buildCatalog(await loadContent('content'));
const replayed = (log: Log): ReplayResult => replay(log.attempts, log.events, replayOptions(catalog, new Date(fixture.now)));
/** The result in the fixture's JSON shape, without what sprint 4a and sprint 4b added (as history-v2.test.ts compares it). */
function asBefore(r: ReplayResult): unknown {
  const { mistakeCards: _cards, mistakeCandidatesWithoutTraps: _candidates, cases: _cases, ...rest } = JSON.parse(JSON.stringify(snapshot(r))) as Rec;
  rest.concepts = (rest.concepts as [string, { flags: Rec }][]).map(([id, v]) => {
    const { wheelSpinning: _w, ...flags } = v.flags;
    return [id, { ...v, flags }];
  });
  return rest;
}

test('Review Focus 5: the smoke test\'s seeded history, stamped as version 6 and as version 7 with mock_open records, replays to the result it gave before', () => {
  const plain = replayed({ attempts: fixture.attempts, events: fixture.events });
  for (const v of [6, 7]) {
    const log: Log = { attempts: stamped(fixture.attempts, v), events: stamped(fixture.events, v) };
    for (const l of [log, withMocks(log)]) {
      const r = replayed(l);
      assert.deepEqual(asBefore(r), fixture.result, `version ${v}`);
      assert.deepEqual(r.warnings, []);
      assert.equal(json(r), json(plain), `version ${v}: the whole state, the case statuses and mistake cards included`);
    }
  }
});

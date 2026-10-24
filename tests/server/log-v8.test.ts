// tests/server/log-v8.test.ts: log version 8 (owner decision D123; sprint 7d, Task Y3; backlog M-B4-4). `run_open` is a new record in
// the attempt files, written when a GA4 run (a mini drill, a half-mock or a full mock) starts: its block, its run kind and the `from` date of
// the exam entry its blueprint came from. The GA4 run history dates a run by it when present, else by its earliest record as before
// (server/run.ts choiceRuns). Replay reads versions 1 to 8 and rates nothing from a run_open: every replay fixture, stamped as version 8 and
// with run_open records among its records, replays to exactly the state it gave as version 7. Every record here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog, type LogFile } from '../../core/jsonl.ts';
import { replay, type ReplayResult } from '../../core/replay.ts';
import type { ChoiceItem } from '../../schemas/choice.ts';
import { parseGa4Exam } from '../../schemas/ga4-exam.ts';
import type { RunOpen } from '../../schemas/log-ext.ts';
import { loadContent } from '../../server/content.ts';
import { journeyTap } from '../../server/journey-tap.ts';
import { startJourney, stopJourney } from '../../server/journey.ts';
import { AttemptLogger } from '../../server/log.ts';
import { choiceRuns } from '../../server/run.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { golden, growLeech, run, snapshot, A, type Log } from '../helpers/replay-fixture.ts';
import { attemptsOnly, tutorLog, withLab } from '../helpers/replay-logs.ts';
import { sprint2SingleAnswerLog } from '../helpers/s2-golden.ts';

const runOpen = (ts: string, over: Partial<RunOpen> = {}): RunOpen => ({
  record: 'run_open', schema_version: SCHEMA_VERSION, ts, block_id: '00000000-0000-4000-8000-000000000001', run_kind: 'half_mock',
  blueprint_from: '2026-10-06', ...over,
});

test('D123: the log version is 8', () => assert.equal(SCHEMA_VERSION, 8));

test('D123: run_open goes to the monthly attempts file through the logger and reaches the onWrite listeners', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-v8-'));
  const logger = new AttemptLogger(openJsonlLog(dir));
  const seen: [LogFile, string][] = [];
  logger.onWrite((file, r) => seen.push([file, String((r as { record?: string }).record)]));
  const r = runOpen('2026-11-04T09:30:00.000Z');
  await logger.runOpen(r);
  assert.deepEqual(await readdir(dir), ['attempts-2026-11.jsonl']);
  assert.deepEqual(await logger.readAll('attempts'), [r]);
  assert.deepEqual(seen, [['attempts', 'run_open']]);
  assert.match(await readFile(join(dir, 'attempts-2026-11.jsonl'), 'utf8'), /"record":"run_open","schema_version":8/);
});

type Rec = Record<string, unknown>;
/** The records with every schema_version stamped `v`. */
const stamped = (records: object[], v: number): object[] => records.map((r) => ({ ...r, schema_version: v }));
/** One run_open of each GA4 run kind, at times spread through the log's own records, put at the end of the attempt file. */
function withRuns(log: Log): Log {
  const times = (log.attempts as Rec[]).map((r) => String(r.ts ?? r.submitted_at ?? '')).filter((t) => t !== '').sort();
  const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))]!;
  const opens = [
    runOpen(at(0.2), { block_id: 'RUN-MINI-1', run_kind: 'mini_drill' }),
    runOpen(at(0.5), { block_id: 'RUN-HALF-1', run_kind: 'half_mock' }),
    runOpen(at(0.8), { block_id: 'RUN-FULL-1', run_kind: 'full_mock' }),
  ];
  return { attempts: [...log.attempts, ...opens], events: log.events };
}
const json = (r: ReplayResult): string => JSON.stringify(snapshot(r));

// A version 1 record carries no logged rating, so replay compares none (S2-15): a log is restamped from 7 to 8, never from 1, and the
// version 7 copy is the baseline. The fixtures as written (versions 1 and 2) are compared with themselves plus the run_open records.
test('D123: each replay fixture with run_open records replays as written; stamped as version 8, as it does stamped as version 7', () => {
  const logs: [string, Log][] = [
    ['golden', golden()], ['golden over two sessions', golden({ sessions: 2 })], ['golden with a crash', golden({ crashed: true })],
    ['sprint 2 with one answer per choice instance', sprint2SingleAnswerLog()],
    ['a leech', growLeech(A, ['EX-SQL-BASICS-01-E1-01', 'EX-SQL-BASICS-01-E1-02', 'EX-SQL-BASICS-01-E1-03'], '2026-10-05T09:00:00Z')],
    ['version 5, with lab answers', withLab(attemptsOnly())], ['version 6, with tutor questions', tutorLog()],
  ];
  const as = (log: Log, v: number): Log => ({ attempts: stamped(log.attempts, v), events: stamped(log.events, v) });
  for (const [name, log] of logs) {
    assert.equal(json(run(withRuns(log))), json(run(log)), `${name}: as written, with a run_open of each kind`);
    const v7 = json(run(as(log, 7)));
    assert.equal(json(run(as(log, 8))), v7, `${name}: version 8 with no run`);
    assert.equal(json(run(withRuns(as(log, 8)))), v7, `${name}: version 8 with a run_open of each kind`);
  }
});

// tests/fixtures/replay/smoke-history-v2.json holds the smoke test's seeded history (see log-v7.test.ts, which compares it the same way).
const fixture = JSON.parse(await readFile('tests/fixtures/replay/smoke-history-v2.json', 'utf8')) as { now: string; attempts: Rec[]; events: Rec[] };
const catalog = buildCatalog(await loadContent('content'));
const replayed = (log: Log): ReplayResult => replay(log.attempts, log.events, replayOptions(catalog, new Date(fixture.now)));

test('D123: the smoke test\'s seeded history, stamped as version 8 with run_open records, replays to the state it gives as version 7', () => {
  const v7 = replayed({ attempts: stamped(fixture.attempts, 7), events: stamped(fixture.events, 7) });
  const v8: Log = { attempts: stamped(fixture.attempts, 8), events: stamped(fixture.events, 8) };
  for (const l of [v8, withRuns(v8)]) {
    const r = replayed(l);
    assert.deepEqual(r.warnings, []);
    assert.equal(json(r), json(v7), 'the whole state, the case statuses and mistake cards included');
  }
});

// ---- the GA4 run history (server/run.ts choiceRuns) --------------------------------------------------------------------------------

const WEIGHTS = { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 };
const ENTRY = {
  from: '2026-10-06',
  mini_drill: { questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' },
  half_mock: { questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam', retake_days: 21 },
  full_mock: { questions: 50, minutes: 75, pass_pct: 80, mode: 'exam', retake_days: 21 },
};
const cfg = parseGa4Exam({ topic_weights: WEIGHTS, blueprints: [ENTRY] });
const itemOf = (id: string): ChoiceItem | undefined => (id.startsWith('Q-INV-') ? ({ id, section: 'ga4', topic_id: 'T-GA4-01' } as unknown as ChoiceItem) : undefined);
/** An ended mini drill whose first instance starts at `first`: three questions answered, two right, every item closed run_end. */
function miniDrill(block: string, first: number): object[] {
  const at = (s: number) => new Date(first + s * 1000).toISOString();
  const out: object[] = [];
  for (let n = 0; n < 3; n++) {
    out.push({ record: 'attempt', schema_version: 7, attempt_id: `${block}-a${n}`, item_instance_id: `${block}-I${n}`, item_id: `Q-INV-${block}-${n}`, section: 'ga4',
      phase: 'drill', block_id: block, started_at: at(n * 10), submitted_at: at(n * 10 + 5), outcome: n < 2 ? 'pass' : 'fail', is_correct: n < 2,
      grading_source: 'auto', payload: { kind: 'mcq', shown_order: ['a', 'b'], chosen: 'a', run_kind: 'mini_drill' } });
  }
  for (let n = 0; n < 3; n++) {
    out.push({ record: 'item_close', schema_version: 7, ts: at(60), item_instance_id: `${block}-I${n}`, item_id: `Q-INV-${block}-${n}`, phase: 'drill', block_id: block,
      reason: 'run_end', raw_outcome: { active_ms: 1000 } });
  }
  out.push({ record: 'block_close', schema_version: 7, ts: at(60), block_id: block, card_reviews: [] });
  return out;
}

test('D123: a version 7 GA4 run (no run_open) is read as before, dated by its earliest record; a run_open at that time changes nothing', () => {
  const first = Date.parse('2026-10-20T10:00:00.000Z');
  const v7 = miniDrill('RUN-1', first);
  const before = choiceRuns(v7, { cfg, itemOf });
  assert.deepEqual(before.map((r) => [r.kind, r.date, r.started_at, r.score.correct, r.score.of]), [['mini_drill', '2026-10-20', '2026-10-20T10:00:00.000Z', 2, 20]]);
  const opened = [runOpen(new Date(first).toISOString(), { block_id: 'RUN-1', run_kind: 'mini_drill' }), ...v7];
  assert.deepEqual(choiceRuns(opened, { cfg, itemOf }), before, 'the run_open only names the time the earliest record already gave');
  const elsewhere = [runOpen('2026-10-19T08:00:00.000Z', { block_id: 'RUN-OTHER', run_kind: 'mini_drill' }), ...v7];
  assert.deepEqual(choiceRuns(elsewhere, { cfg, itemOf }), before, 'a run_open of another block, with no record of its own, is no run and dates no other');
});

test('D123: with a run_open, the run starts at its time: its started_at and date are the run_open\'s, and its score is unchanged', () => {
  const first = Date.parse('2026-10-20T10:00:00.000Z');
  const runs = choiceRuns([runOpen('2026-10-20T09:58:00.000Z', { block_id: 'RUN-1', run_kind: 'mini_drill' }), ...miniDrill('RUN-1', first)], { cfg, itemOf });
  assert.deepEqual(runs.map((r) => [r.kind, r.date, r.started_at, r.score.correct, r.score.of]), [['mini_drill', '2026-10-20', '2026-10-20T09:58:00.000Z', 2, 20]]);
});

// ---- the study journey (D77) -------------------------------------------------------------------------------------------------------

test('D123: the journey tap maps a run_open to no event (the start\'s run_started already marks it), while a known record still maps', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-v8-journey-'));
  try {
    startJourney({ dir });
    const tap = journeyTap({ topicOf: () => 'SQL', states: () => new Map() });
    tap('attempts', runOpen('2026-11-04T09:30:00.000Z'));
    tap('attempts', { record: 'exposure', schema_version: SCHEMA_VERSION, ts: '2026-11-04T09:31:00.000Z', concept_id: 'SQL-A-01', kind: 'reading' });
    await new Promise<void>((done) => setImmediate(done));
    await stopJourney();
    const events = (await readFile(join(dir, (await readdir(dir))[0]!), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { event: string })
      .map((e) => e.event).filter((e) => e !== 'session_started' && e !== 'session_ended');
    assert.deepEqual(events, ['material_studied'], 'the exposure is a journey event; the run_open is none');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

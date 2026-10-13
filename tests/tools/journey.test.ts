// tests/tools/journey.test.ts: `npm run journey` (D77). Two made-up visits load into DuckDB, and each starter view answers what it
// promises: visits, the funnel, screen paths, exits, time on screens, exercises (one per visit, though sent twice) and those left
// unanswered, help against results, confidence, runs (one finish each), hour of day in Amsterdam time, and minutes on answers counted
// once however many tries. A line that is not JSON, or whose time is not a time, is skipped and counted; a key the tool does not know
// becomes a text column. The printer shows each value as DuckDB's own text (a day, a plain timestamp, a time, an interval, a list or
// a map of counts, infinity) and a timestamp with time zone in Amsterdam time. The command: a missing folder is left alone, the
// database rebuilds on every run, a CSV that cannot be written is named while the rest are written, and a query of the owner's own
// runs with no file access at all (R7). Every instance has no extension autoloading and Amsterdam time (R17). Every temporary folder
// is removed at the end.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { journeyCommand, loadJourney, lockDown, table, VIEWS } from '../../tools/journey.ts';

const S1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const S2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const at = (hhmm: string) => `2026-10-13T${hhmm}:00.000Z`;
const e = (session: string, seq: number, hhmm: string, event: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, ts: at(hhmm), session_id: session, seq, event, app_version: '1.3.0', ...extra });
const VISITS = [
  e(S1, 1, '08:00', 'session_started', { reason: 'app_start' }),
  e(S1, 2, '08:00', 'screen_viewed', { screen: 'today' }),
  e(S1, 3, '08:01', 'screen_viewed', { screen: 'lesson', from_screen: 'today', subject_id: 'SQL-A-01' }),
  e(S1, 4, '08:01', 'lesson_started', { topic: 'SQL', case_theme: 'pricing', difficulty: 'L1', funnel_step: 'lesson_started' }),
  e(S1, 5, '08:02', 'item_viewed', { item_id: 'SQL-A-01-W01', topic: 'SQL' }),
  e(S1, 6, '08:02', 'item_viewed', { item_id: 'SQL-A-01-W01', topic: 'SQL' }),       // the same open: the screen fetches it twice (R8)
  e(S1, 7, '08:03', 'hint_opened', { item_id: 'SQL-A-01-W01', hint_level: 1, review: false }),
  e(S1, 8, '08:04', 'exercise_submitted', { item_id: 'SQL-A-01-W01', topic: 'SQL', outcome: 'passed', hints_used: 1, answer_shown: false, confidence: 3, time_spent_s: 120, try_number: 1 }),
  e(S1, 9, '08:04', 'exercise_passed', { item_id: 'SQL-A-01-W01', topic: 'SQL' }),
  e(S1, 10, '08:05', 'item_viewed', { item_id: 'SQL-A-01-W02', topic: 'SQL' }),
  e(S1, 11, '08:06', 'item_closed', { item_id: 'SQL-A-01-W02', reason: 'left', graded_attempts: 0, passed: false }),
  e(S1, 12, '08:07', 'screen_viewed', { screen: 'map', from_screen: 'lesson' }),
  e(S1, 13, '08:07', 'session_ended', { reason: 'idle', duration_s: 420, event_count: 11 }),
  'this line is not JSON',
  e(S2, 1, '18:00', 'session_started', { reason: 'idle', previous_session_id: S1 }),
  e(S2, 2, '18:00', 'screen_viewed', { screen: 'today', extra_key: 'x' }),
  e(S2, 3, '18:00', 'screen_viewed', { screen: 'ga4_run', from_screen: 'today' }),
  e(S2, 4, '18:01', 'run_started', { section: 'ga4', run_kind: 'mini_drill', block_id: 'B-1', questions: 20 }),
  e(S2, 5, '18:02', 'exercise_submitted', { item_id: 'GA4-Q-01', topic: 'GA4', outcome: 'failed', confidence: 4, time_spent_s: 30, try_number: 1 }),
  e(S2, 6, '18:02', 'exercise_failed', { item_id: 'GA4-Q-01', topic: 'GA4' }),
  e(S2, 7, '18:10', 'run_finished', { section: 'ga4', run_kind: 'mini_drill', block_id: 'B-1', score_pct: 55, run_passed: false }),
  e(S2, 8, '18:11', 'run_finished', { section: 'ga4', run_kind: 'mini_drill', block_id: 'B-1', score_pct: 55, run_passed: false }),
  e(S2, 9, '18:11', 'concept_state_changed', { concept_id: 'SQL-A-01', topic: 'SQL', state_from: 'practised', state_to: 'mastered' }),
];

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
async function folder(lines: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'al-journey-tool-'));
  made.push(dir);
  if (lines.length) await writeFile(join(dir, 'events-2026-10.jsonl'), `${lines.join('\n')}\n`);
  return dir;
}
const load = async (lines: string[]) => loadJourney(await folder(lines), null);
const rows = async (db: Awaited<ReturnType<typeof load>>, sql: string) => (await db.connection.runAndReadAll(sql)).getRowObjectsJS();
const plain = (r: Record<string, unknown>[]) => r.map((x) => Object.values(x).map((v) => (typeof v === 'bigint' ? Number(v) : v)));
const exists = (p: string) => stat(p).then(() => true, () => false);

test('two visits load with every starter view answering', async () => {
  const db = await load(VISITS);
  try {
    assert.deepEqual([db.events, db.skipped, db.files], [22, 1, 1]);
    const visits = await rows(db, 'SELECT minutes, screens, answers, passed, help_used, last_screen FROM sessions ORDER BY started_at');
    assert.deepEqual(plain(visits), [[7, 3, 1, 1, 1, 'map'], [11, 2, 1, 0, 0, 'ga4_run']]);
    assert.deepEqual(plain(await rows(db, 'SELECT step, visits, pct_of_first FROM funnel')),
      [['opened a screen', 2, 100], ['started studying', 2, 100], ['answered an exercise', 2, 100], ['passed one', 1, 50]]);
    assert.deepEqual((await rows(db, 'SELECT from_screen, to_screen, times FROM paths')).map((r) => [r.from_screen, r.to_screen, Number(r.times)]),
      [['lesson', 'map', 1], ['today', 'ga4_run', 1], ['today', 'lesson', 1]]);
    assert.deepEqual((await rows(db, 'SELECT last_screen, visits FROM exits')).map((r) => [r.last_screen, Number(r.visits)]), [['ga4_run', 1], ['map', 1]]);
    assert.deepEqual(plain(await rows(db, "SELECT views, median_seconds, total_minutes FROM screen_time WHERE screen = 'lesson'")), [[1, 360, 6]]);
    const items = await rows(db, `SELECT item_id, visits_opened, answers, passes, left_unanswered, hints, answers_shown, answer_minutes FROM items
      WHERE item_id LIKE 'SQL-A-01-%' ORDER BY item_id`);
    assert.deepEqual(plain(items), [['SQL-A-01-W01', 1, 1, 1, 0, 1, 0, 2], ['SQL-A-01-W02', 1, 0, 0, 1, 0, 0, null]], 'W01 was sent twice on one open: one visit');
    assert.deepEqual(plain(await rows(db, 'SELECT * FROM help_and_results')), [[0, false, 1, 0], [1, false, 1, 100]]);
    assert.deepEqual(plain(await rows(db, 'SELECT * FROM confidence')), [[3, 1, 100], [4, 1, 0]]);
    const runs = await rows(db, 'SELECT run_kind, score_pct, minutes FROM runs');
    assert.deepEqual(runs.map((r) => [r.run_kind, r.score_pct, r.minutes]), [['mini_drill', 55, 9]]);
    assert.deepEqual(plain(await rows(db, 'SELECT hour, answers, pass_pct FROM time_of_day')), [[10, 1, 100], [20, 1, 0]]);
    assert.equal((await rows(db, 'SELECT count(*) AS n FROM mastery'))[0]!.n, 1n);
    assert.deepEqual((await rows(db, 'SELECT extra_key FROM events WHERE extra_key IS NOT NULL')).map((r) => r.extra_key), ['x']);
    for (const v of VIEWS) await db.connection.run(`SELECT * FROM ${v}`);
  } finally { db.close(); }
});

test('minutes on answers count each exercise\'s time once: a later try adds only the time since the try before', async () => {
  // time_spent_s runs from opening the exercise, so tries at 1, 2 and 3 minutes took 3 minutes in all, not 6. The third try comes in
  // a later visit (more than 30 idle minutes after the second) and still counts only its own minute.
  const db = await load([
    e(S1, 1, '08:00', 'session_started'),
    e(S1, 2, '08:01', 'exercise_submitted', { item_id: 'SQL-A-01-W01', outcome: 'failed', time_spent_s: 60, try_number: 1 }),
    e(S1, 3, '08:02', 'exercise_submitted', { item_id: 'SQL-A-01-W01', outcome: 'failed', time_spent_s: 120, try_number: 2 }),
    e(S1, 4, '08:02', 'exercise_submitted', { item_id: 'SQL-A-01-W02', outcome: 'passed', time_spent_s: 30, try_number: 1 }),
    e(S2, 1, '08:40', 'session_started'),
    e(S2, 2, '08:40', 'exercise_submitted', { item_id: 'SQL-A-01-W01', outcome: 'passed', time_spent_s: 180, try_number: 3 }),
    e(S2, 3, '08:50', 'exercise_submitted', { item_id: 'SQL-A-01-W01', outcome: 'passed', time_spent_s: 60, try_number: 1 }),   // a new opening
  ]);
  try {
    assert.deepEqual(plain(await rows(db, 'SELECT item_id, answers, answer_minutes FROM items ORDER BY item_id')),
      [['SQL-A-01-W01', 4, 4], ['SQL-A-01-W02', 1, 0.5]]);
    assert.deepEqual(plain(await rows(db, 'SELECT answers, answer_minutes FROM days')), [[5, 4.5]]);
  } finally { db.close(); }
});

test('a line whose time is not a time is skipped and counted, like a line that is not JSON', async () => {
  const db = await load([e(S1, 1, '08:00', 'session_started'), JSON.stringify({ v: 1, ts: 'yesterday', session_id: S1, seq: 2, event: 'item_viewed' }),
    e(S1, 3, '08:01', 'item_viewed', { item_id: 'A' })]);
  try {
    assert.deepEqual([db.events, db.skipped], [2, 1]);
  } finally { db.close(); }
});

test('the printer shows each value as DuckDB prints it, and a timestamp with time zone in Amsterdam time', async () => {
  const db = await load(VISITS);
  try {
    const out = await table(db.connection, `SELECT session_id, max(ts) - min(ts) AS length, [count(*)] AS events, histogram(screen) AS screens
      FROM events GROUP BY ALL ORDER BY session_id`, 50);
    assert.match(out, new RegExp(`${S1}\\s+00:07:00\\s+\\[13\\]\\s+\\{.*'map': 1`));
    assert.match(out, new RegExp(`${S2}\\s+00:11:00\\s+\\[9\\]\\s+\\{.*'today': 1`));
    const days = await table(db.connection, 'SELECT * FROM days', 10);
    assert.match(days, /^2026-10-13\s+2\s+2\s+1\s+2\.5/m, 'a DATE prints as the day alone');
    assert.doesNotMatch(days, /\d:\d\d/);
    const kinds = await table(db.connection, `SELECT TIMESTAMP '2026-10-13 10:00' AS plain, min(ts) AS first_event, TIME '12:34:56' AS t,
      'infinity'::TIMESTAMP AS a, 'infinity'::DATE AS b, '-infinity'::DATE AS c, 'infinity'::TIMESTAMPTZ AS d FROM events`, 50);
    assert.match(kinds, /^2026-10-13 10:00:00\s+13-10-2026, 10:00\s+12:34:56\s+infinity\s+infinity\s+-infinity\s+infinity/m,
      'a plain TIMESTAMP prints as given; a TIMESTAMPTZ (08:00 UTC) in Amsterdam time');
  } finally { db.close(); }
});

test('an empty journey folder loads, and every view answers with no rows', async () => {
  const db = await load([]);
  try {
    assert.equal(db.events, 0);
    for (const v of VIEWS) await db.connection.run(`SELECT * FROM ${v}`);
  } finally { db.close(); }
});

test('every instance loads no extension by itself and shows Amsterdam time (R17)', async () => {
  const dir = await folder(VISITS);
  for (const dbPath of [null, join(dir, 'journey.duckdb')]) {
    const db = await loadJourney(dir, dbPath);
    try {
      assert.deepEqual(plain(await rows(db, `SELECT current_setting('autoinstall_known_extensions') AS i, current_setting('autoload_known_extensions') AS l,
        current_setting('TimeZone') AS z`)), [[false, false, 'Europe/Amsterdam']], String(dbPath));
    } finally { db.close(); }
  }
});

test('the database file is rebuilt from the files on every run', async () => {
  const dir = await folder(VISITS);
  const dbPath = join(dir, 'journey.duckdb');
  for (const run of [1, 2]) {
    const db = await loadJourney(dir, dbPath);
    try {
      assert.equal(Number((await rows(db, 'SELECT count(*) AS n FROM events'))[0]!.n), 22, `run ${run}`);
    } finally { db.close(); }
  }
});

test('locked down, a query reads and writes no file and changes no setting (R7)', async () => {
  const dir = await folder(VISITS);
  const db = await loadJourney(dir, null);
  try {
    await lockDown(db.connection);
    assert.deepEqual(plain(await rows(db, `SELECT current_setting('allowed_directories')::VARCHAR AS d, current_setting('allowed_paths')::VARCHAR AS p`)),
      [['[]', '[]']], 'no folder or file is left open: no temporary folder, no database file');
    const csv = join(dir, 'x.csv');
    for (const sql of [`COPY (SELECT 1 AS a) TO '${csv}'`, `SELECT * FROM read_json_auto('${join(dir, 'events-2026-10.jsonl')}')`,
      `SELECT * FROM read_text('${join(dir, 'events-2026-10.jsonl')}')`, `ATTACH '${join(dir, 'other.duckdb')}'`,
      'SET enable_external_access = true', 'SET lock_configuration = false']) {
      await assert.rejects(db.connection.run(sql), /disabled by configuration|configuration has been locked/, sql);
    }
    assert.equal(await exists(csv), false);
    assert.equal(Number((await rows(db, 'SELECT count(*) AS n FROM events'))[0]!.n), 22, 'the journey itself still answers');
  } finally { db.close(); }
});

/** journeyCommand with its lines caught: what it said, what it complained of, and its exit code. */
async function command(args: string[], dir: string): Promise<{ said: string[]; complained: string[]; code: number }> {
  const said: string[] = [];
  const complained: string[] = [];
  const code = await journeyCommand(args, dir, (l) => said.push(l), (l) => complained.push(l));
  return { said, complained, code };
}

test('npm run journey -- --sql runs the query with no file access at all, not even to the database\'s own files', async () => {
  const dir = await folder(VISITS);
  const { said, code } = await command(['--sql', 'SELECT count(*) AS n FROM events'], dir);
  assert.equal(code, 0);
  assert.match(said.join('\n'), /^n\s*\n-+\s*\n22\s*$/m);
  for (const own of [`COPY (SELECT 'typed' AS a) TO '${join(dir, 'journey.duckdb.wal.recovery')}' (HEADER false)`,
    `COPY (SELECT 'typed' AS a) TO '${join(dir, 'journey.duckdb.tmp', 'x.csv')}'`, `SELECT * FROM read_text('${join(dir, 'journey.duckdb')}')`]) {
    await assert.rejects(command(['--sql', own], dir), /disabled by configuration|Permission/, own);
  }
  assert.deepEqual((await readdir(dir)).sort(), ['events-2026-10.jsonl', 'journey.duckdb']);
});

test('npm run journey -- --csv names a file it cannot write, writes the rest, still prints the views, and fails', async () => {
  const dir = await folder(VISITS);
  await mkdir(join(dir, 'out', 'sessions.csv'), { recursive: true });     // as a file Excel holds open: it cannot be replaced
  const { said, complained, code } = await command(['--csv'], dir);
  assert.equal(code, 1);
  assert.equal(complained.length, 1);
  assert.match(complained[0]!, /sessions\.csv could not be written/);
  assert.match(complained[0]!, /Excel/);
  const written = (await readdir(join(dir, 'out'))).filter((n) => n !== 'sessions.csv').sort();
  assert.deepEqual(written, VIEWS.filter((v) => v !== 'sessions').map((v) => `${v}.csv`).sort());
  assert.ok(said.some((l) => l.includes('== runs')), 'the views are still printed');
});

test('npm run journey on a folder that does not exist says so and creates nothing', async () => {
  const parent = await folder([]);
  const missing = join(parent, 'none', 'deeper');
  const { said, code } = await command([], missing);
  assert.equal(code, 0);
  assert.match(said.join('\n'), /No journey folder at .*deeper/);
  assert.equal(await exists(join(parent, 'none')), false);
});

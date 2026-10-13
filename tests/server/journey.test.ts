// tests/server/journey.test.ts: the study journey (owner decision D77). Visits, their order and idle end, screens with the screen
// before them, the fixed fields, the OpenTelemetry side (against in-memory exporters: no network), a folder that cannot be
// written, and no folder at all until startJourney() names one. IDs here are made up. Every temporary folder is removed at the end.
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { metrics, trace } from '@opentelemetry/api';
import { logs as logsApi } from '@opentelemetry/api-logs';
import { logs, metrics as sdkMetrics, node, tracing } from '@opentelemetry/sdk-node';
import { journey, journeyDirFrom, journeyFolder, journeyScreen, journeySettingNote, startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';

const spans = new tracing.InMemorySpanExporter();
new node.NodeTracerProvider({ spanProcessors: [new tracing.SimpleSpanProcessor(spans)] }).register();
const points = new sdkMetrics.InMemoryMetricExporter(sdkMetrics.AggregationTemporality.CUMULATIVE);
const reader = new sdkMetrics.PeriodicExportingMetricReader({ exporter: points, exportIntervalMillis: 3_600_000 });
metrics.setGlobalMeterProvider(new sdkMetrics.MeterProvider({ readers: [reader] }));
const records = new logs.InMemoryLogRecordExporter();
logsApi.setGlobalLoggerProvider(new logs.LoggerProvider({ processors: [new logs.SimpleLogRecordProcessor({ exporter: records })] }));
beforeEach(() => { records.reset(); spans.reset(); });

/** A clock the test moves by hand. */
function clock(start = '2026-10-13T08:00:00.000Z') {
  let t = Date.parse(start);
  return { now: () => new Date(t), add: (minutes: number) => { t += minutes * 60_000; } };
}
const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const tmp = async () => { const d = await mkdtemp(join(tmpdir(), 'al-journey-')); made.push(d); return d; };
async function lines(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of (await readdir(dir)).sort()) {
    out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  }
  return out;
}

// First in the file, so it runs before any startJourney() (each test file runs in its own process). It only reads the real folder,
// and looks for its own marker there, so an app or `npm run journey` writing that folder meanwhile cannot fail it.
test('before startJourney() there is no folder: events reach telemetry only, and the real journey/ gets nothing', async () => {
  const real = resolve(import.meta.dirname, '../../journey');
  const files = async () => (await readdir(real).catch((): string[] => [])).filter((n) => /^events-.*\.jsonl$/.test(n));
  const before = await files();
  const marker = `TEST-${randomUUID()}`;
  journey('item_viewed', { item_id: marker });
  await stopJourney();
  assert.ok(records.getFinishedLogRecords().some((r) => r.eventName === 'item_viewed' && r.attributes.item_id === marker));
  const now = await files();
  assert.deepEqual(now.filter((n) => !before.includes(n)), [], 'no new journey file');
  for (const n of now) assert.ok(!(await readFile(join(real, n), 'utf8')).includes(marker), `${n} holds the test's event`);
});

test('the first event opens a visit: session_started, then the event, one session ID, numbered in order', async () => {
  const dir = await tmp();
  startJourney({ dir, now: clock().now });
  journey('hint_opened', { item_id: 'SQL-X-01-W01', hint_level: 1 });
  await stopJourney();
  const [start, hint, end] = await lines(dir);
  assert.deepEqual([start!.event, hint!.event, end!.event], ['session_started', 'hint_opened', 'session_ended']);
  assert.equal(start!.reason, 'app_start');
  assert.equal(new Set([start, hint, end].map((r) => r!.session_id)).size, 1);
  assert.deepEqual([start!.seq, hint!.seq, end!.seq], [1, 2, 3]);
  assert.equal(hint!.v, 1);
  assert.equal(hint!.ts, '2026-10-13T08:00:00.000Z');
  assert.equal(typeof hint!.app_version, 'string');
  assert.equal(hint!.item_id, 'SQL-X-01-W01');
  assert.equal(hint!.hint_level, 1);
  assert.equal(end!.reason, 'app_stop');
  assert.equal(end!.event_count, 1);
  assert.deepEqual(await readdir(dir), ['events-2026-10.jsonl']);
});

test('30 idle minutes keep the visit; more ends it at its last event and opens the next', async () => {
  const dir = await tmp();
  const c = clock();
  startJourney({ dir, now: c.now });
  journey('item_viewed', { item_id: 'A' });
  c.add(30);
  journey('item_viewed', { item_id: 'B' });                    // exactly 30 minutes later: the same visit
  c.add(31);
  journey('item_viewed', { item_id: 'C' });
  await stopJourney();
  const r = await lines(dir);
  assert.deepEqual(r.map((x) => x.event),
    ['session_started', 'item_viewed', 'item_viewed', 'session_ended', 'session_started', 'item_viewed', 'session_ended']);
  const [first, second] = [r[0]!.session_id, r[4]!.session_id];
  assert.notEqual(first, second);
  assert.deepEqual([r[1]!.session_id, r[2]!.session_id, r[3]!.session_id], [first, first, first]);
  assert.equal(r[3]!.ts, '2026-10-13T08:30:00.000Z');            // the visit's last event, not the moment the gap was noticed
  assert.equal(r[3]!.duration_s, 1800);
  assert.equal(r[3]!.reason, 'idle');
  assert.equal(r[3]!.event_count, 2);
  assert.equal(r[4]!.reason, 'idle');
  assert.equal(r[4]!.previous_session_id, first);
});

test('the 30 minutes run from the last event, not from the visit\'s start: a busy visit lasts as long as its events keep coming', async () => {
  const dir = await tmp();
  const c = clock();
  startJourney({ dir, now: c.now });
  journey('item_viewed', { item_id: 'A' });                    // 08:00
  c.add(20);
  journey('item_viewed', { item_id: 'B' });                    // 08:20
  c.add(30);
  journey('item_viewed', { item_id: 'C' });                    // 08:50: 30 minutes after B, 50 after the start, the same visit
  c.add(31);
  journey('item_viewed', { item_id: 'D' });                    // 09:21: a new visit
  await stopJourney();
  const r = await lines(dir);
  const ended = r.filter((x) => x.event === 'session_ended');
  assert.deepEqual(r.filter((x) => x.event === 'item_viewed').map((x) => x.session_id === r[0]!.session_id), [true, true, true, false]);
  assert.deepEqual([ended[0]!.ts, ended[0]!.duration_s, ended[0]!.event_count], ['2026-10-13T08:50:00.000Z', 3000, 3]);
});

test('an event the app logged earlier keeps its time: it joins the open visit without stretching it, never precedes the visit, and never lies ahead', async () => {
  const dir = await tmp();
  const c = clock();
  startJourney({ dir, now: c.now });
  journey('item_viewed', { item_id: 'A' });                                          // 08:00 opens the visit
  c.add(45);                                                                          // written at 08:45 (an idle end), about 08:00
  journey('item_closed', { item_id: 'A' }, new Date('2026-10-13T08:00:00.000Z'));
  journey('hint_opened', { item_id: 'A' }, new Date('2026-10-13T07:00:00.000Z'));    // before the visit's latest event: at it
  journey('answer_shown', { item_id: 'A' }, new Date('2026-10-13T10:00:00.000Z'));   // ahead of now: now, so a new visit
  journey('other_way_opened', { item_id: 'A' }, new Date(Number.NaN));               // no time: now
  await stopJourney();
  const r = await lines(dir);
  assert.deepEqual(r.map((x) => [x.event, x.ts.slice(11, 16)]), [
    ['session_started', '08:00'], ['item_viewed', '08:00'], ['item_closed', '08:00'], ['hint_opened', '08:00'], ['session_ended', '08:00'],
    ['session_started', '08:45'], ['answer_shown', '08:45'], ['other_way_opened', '08:45'], ['session_ended', '08:45']]);
  assert.deepEqual([r[4]!.reason, r[4]!.duration_s, r[4]!.event_count], ['idle', 0, 3]);
  assert.equal(new Set(r.slice(0, 5).map((x) => x.session_id)).size, 1);
});

test('an earlier time moves up to the visit\'s latest event, not to its start', async () => {
  const dir = await tmp();
  const c = clock();
  startJourney({ dir, now: c.now });
  journey('item_viewed', { item_id: 'A' });                                          // 08:00 opens the visit
  c.add(10);
  journey('item_viewed', { item_id: 'B' });                                          // 08:10, the visit's latest event
  journey('hint_opened', { item_id: 'B' }, new Date('2026-10-13T08:05:00.000Z'));    // logged at 08:05: at 08:10
  await stopJourney();
  assert.equal((await lines(dir)).find((x) => x.event === 'hint_opened')!.ts, '2026-10-13T08:10:00.000Z');
});

test('a visit that went idle before the app stops ends as idle, at its last event; after the stop nothing reaches the file', async () => {
  const dir = await tmp();
  const c = clock();
  startJourney({ dir, now: c.now });
  journey('hint_opened', { item_id: 'A' });                    // 08:00, then the learner walks away
  c.add(31);
  await stopJourney();                                         // the console closes at 08:31
  journey('item_viewed', { item_id: 'late' });                 // a request that finished after the stop
  await stopJourney();
  const r = await lines(dir);
  assert.deepEqual(r.map((x) => x.event), ['session_started', 'hint_opened', 'session_ended']);
  assert.deepEqual([r[2]!.reason, r[2]!.ts, r[2]!.duration_s], ['idle', '2026-10-13T08:00:00.000Z', 0]);
});

test('a screen view names the screen before it in the same visit, and none first in a new visit', async () => {
  const dir = await tmp();
  const c = clock();
  startJourney({ dir, now: c.now });
  journeyScreen('today');
  journeyScreen('lesson', 'SQL-SEL-01');
  c.add(45);
  journeyScreen('map');
  await stopJourney();
  const views = (await lines(dir)).filter((x) => x.event === 'screen_viewed');
  assert.deepEqual(views.map((v) => [v.screen, v.from_screen ?? null, v.subject_id ?? null]),
    [['today', null, null], ['lesson', 'today', 'SQL-SEL-01'], ['map', null, null]]);
});

test('an attribute cannot overwrite the fixed fields', async () => {
  const dir = await tmp();
  startJourney({ dir, now: clock().now });
  journey('item_viewed', { event: 'x', session_id: 'x', seq: 99, ts: 'x', v: 2, app_version: 'x', item_id: 'A' });
  await stopJourney();
  const r = (await lines(dir))[1]!;
  assert.equal(r.event, 'item_viewed');
  assert.equal(r.seq, 2);
  assert.equal(r.v, 1);
  assert.equal(r.ts, '2026-10-13T08:00:00.000Z');
  assert.notEqual(r.session_id, 'x');
  assert.notEqual(r.app_version, 'x');
});

/** The session.duration histogram as last exported: the sum of its points and each point's attributes. */
async function durations(): Promise<{ sum: number; attributes: object[] }> {
  await reader.forceFlush();
  const m = points.getMetrics().at(-1)?.scopeMetrics.flatMap((s) => s.metrics).find((x) => x.descriptor.name === 'aydinlearns.session.duration');
  return { sum: (m?.dataPoints ?? []).reduce((a, p) => a + (p.value as { sum: number }).sum, 0), attributes: (m?.dataPoints ?? []).map((p) => p.attributes) };
}

test('telemetry gets each event as a log record named by event.name, with session.id, a count, and the visit length at its end', async () => {
  const c = clock();
  startJourney({ dir: null, now: c.now });
  trace.getTracer('test').startActiveSpan('GET /api/items/:id', (span) => { journey('item_viewed', { item_id: 'A', topic: 'SQL' }); span.end(); });
  c.add(5);
  journeyScreen('today');                                      // five minutes after the visit opened
  const before = await durations();
  await stopJourney();
  const viewed = records.getFinishedLogRecords().find((r) => r.eventName === 'item_viewed')!;
  const start = records.getFinishedLogRecords().find((r) => r.eventName === 'session_started')!;
  assert.equal(viewed.body, 'item_viewed');
  assert.equal(viewed.attributes.item_id, 'A');
  assert.equal(viewed.attributes['session.id'], start.attributes['session.id']);
  assert.equal(spans.getFinishedSpans()[0]!.attributes['session.id'], viewed.attributes['session.id']);
  await reader.forceFlush();
  const all = points.getMetrics().at(-1)!.scopeMetrics.flatMap((m) => m.metrics);
  const counted = all.find((m) => m.descriptor.name === 'aydinlearns.journey.events')!;
  assert.ok(counted.dataPoints.some((p) => p.attributes.event === 'item_viewed' && p.attributes.topic === 'SQL'));
  assert.ok(counted.dataPoints.some((p) => p.attributes.event === 'screen_viewed' && p.attributes.screen === 'today'));
  assert.ok(counted.dataPoints.every((p) => p.attributes.item_id === undefined && p.attributes['session.id'] === undefined));
  const after = await durations();
  assert.equal(after.sum - before.sum, 300, 'this visit\'s five minutes, in seconds');
  assert.ok(after.attributes.every((a) => Object.keys(a).length === 0), 'the visit length carries no attributes (R6: never session.id)');
});

test('a visit that ended idle is not the next request\'s: its end carries no trace of that request', async () => {
  const c = clock();
  startJourney({ dir: null, now: c.now });
  journey('item_viewed', { item_id: 'A' });
  c.add(31);
  let traceId = '';
  trace.getTracer('test').startActiveSpan('GET /api/items/:id', (span) => { traceId = span.spanContext().traceId; journey('item_viewed', { item_id: 'B' }); span.end(); });
  await stopJourney();
  const all = records.getFinishedLogRecords();
  const idleEnd = all.find((r) => r.eventName === 'session_ended' && r.attributes.reason === 'idle')!;
  assert.equal(idleEnd.spanContext?.traceId, undefined);
  assert.equal(all.find((r) => r.attributes.item_id === 'B')!.spanContext?.traceId, traceId);
});

test('a folder that cannot be written says so once, without a path, and the file picks up again once it can be written', async () => {
  const parent = await tmp();
  const blocked = join(parent, 'journey');
  await writeFile(blocked, 'a file where the folder should be');
  const said: string[] = [];
  const log = console.log;
  console.log = (m: unknown) => { said.push(String(m)); };
  try {
    startJourney({ dir: blocked, now: clock().now });
    assert.doesNotThrow(() => { journey('item_viewed', { item_id: 'A' }); journey('item_viewed', { item_id: 'B' }); });
    for (let i = 0; i < 400 && !said.length; i++) await new Promise((done) => setTimeout(done, 5));   // A's write has failed
    await rm(blocked);                                         // the lock is gone
    journey('item_viewed', { item_id: 'C' });
    await stopJourney();
  } finally { console.log = log; }
  const told = said.filter((m) => m.includes('journey'));
  assert.equal(told.length, 1);
  assert.ok(!told[0]!.includes(parent) && !told[0]!.includes(tmpdir()), 'the console line names no folder');
  const r = await lines(blocked);
  assert.ok(!r.some((x) => x.item_id === 'A'));
  assert.ok(r.some((x) => x.item_id === 'C'));
  assert.equal(r.at(-1)!.event, 'session_ended');
  assert.ok(records.getFinishedLogRecords().some((x) => x.eventName === 'item_viewed' && x.attributes.item_id === 'A'));
});

test('the journey folder: off, a chosen folder, or journey/ in the app; blank values mean the default', () => {
  for (const off of ['off', ' OFF ', 'false', '0', 'No']) assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY: off }, 'C:/app'), null, off);
  assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY_DIR: 'C:/tmp/j' }, 'C:/app'), resolve('C:/tmp/j'));
  assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY: '', AYDINLEARNS_JOURNEY_DIR: '' }, 'C:/app'), resolve('C:/app/journey'));
  for (const on of ['on', 'true', '1', 'yes', 'disabled']) assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY: on }, 'C:/app'), resolve('C:/app/journey'), on);
});

test('a word that is neither on nor off leaves the journey on, and the start says so', () => {
  for (const quiet of [undefined, '', ' ', 'on', 'off', 'OFF', 'false', '0', 'no', 'true', '1', 'yes']) {
    assert.equal(journeySettingNote({ AYDINLEARNS_JOURNEY: quiet }), null, String(quiet));
  }
  const note = journeySettingNote({ AYDINLEARNS_JOURNEY: ' disabled ' });
  assert.match(note!, /AYDINLEARNS_JOURNEY is "disabled"/);
  assert.match(note!, /stays on/);
  assert.match(note!, /off/);
});

test('a server on a temporary logs folder writes no journey unless AYDINLEARNS_JOURNEY_DIR names one (a test server)', () => {
  assert.equal(journeyDirFrom({ AYDINLEARNS_LOGS_DIR: 'C:/tmp/logs' }, 'C:/app'), null);
  assert.equal(journeyDirFrom({ AYDINLEARNS_LOGS_DIR: 'C:/tmp/logs', AYDINLEARNS_JOURNEY_DIR: ' ' }, 'C:/app'), null);
  assert.equal(journeyDirFrom({ AYDINLEARNS_LOGS_DIR: 'C:/tmp/logs', AYDINLEARNS_JOURNEY_DIR: 'C:/tmp/j' }, 'C:/app'), resolve('C:/tmp/j'));
});

test('the folder npm run journey reads: the chosen one or journey/ in the app, whether the journey is on or off', () => {
  assert.equal(journeyFolder({ AYDINLEARNS_JOURNEY: 'off', AYDINLEARNS_JOURNEY_DIR: 'C:/tmp/j' }, 'C:/app'), resolve('C:/tmp/j'));
  assert.equal(journeyFolder({ AYDINLEARNS_JOURNEY: 'off' }, 'C:/app'), resolve('C:/app/journey'));
  assert.equal(journeyFolder({ AYDINLEARNS_LOGS_DIR: 'C:/tmp/logs', AYDINLEARNS_JOURNEY_DIR: '' }, 'C:/app'), resolve('C:/app/journey'));
});

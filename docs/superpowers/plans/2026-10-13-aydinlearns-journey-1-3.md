# aydinlearns 1.3: the study journey (D77) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every visit to the app as one ordered journey (screens, exercises, help, runs, cases, labs, concept states), keep a local copy of it, and let Aydin load it into DuckDB with `npm run journey` and analyse it in SQL. With telemetry on (D75), the same events go to Dash0.

**Architecture:** A new `server/journey.ts` owns the journey session (a visit: 30 idle minutes end it) and writes each event three ways:
- one JSON line in `journey/events-YYYY-MM.jsonl`;
- one OpenTelemetry log record named by `event.name`, with `session.id`;
- one count on a low-cardinality counter.

The events come from three places:
- a tap on the app's own log writes (help, closes, exposures, self-checks, labs, study sessions, cards, exports, concept state changes);
- a few route hooks for what is not logged (an exercise, case or lab opened; timed runs and drills started and finished);
- one browser call per screen shown.

`tools/journey.ts` loads the files into DuckDB with ready-made views.

**Tech Stack:** Node 24 (type stripping, erasable syntax only), Hono, React 19, `@opentelemetry/api` and `api-logs` (already installed), `@duckdb/node-api` 1.5.6-r.1 (already installed). No new packages.

**Spec:** the owner's decisions of 2026-10-13 and the rulings below, which together are this plan's spec, plus the Telemetry row (D75, D76) of `aydinlearns/CLAUDE.md`. There is no separate spec file.

| Owner decision (2026-10-13) | Choice |
|---|---|
| Signals | Full journey: `session.id`; browser screen views; hints, answer shown, other ways, exercises left unanswered; runs, cases, labs, review cards and concept state changes |
| Analysis | A local JSONL copy and `npm run journey` (DuckDB, ready-made queries) |
| History | From the release on; no backfill from old logs |
| Timing | Its own branch, PR and public release (1.3), before sprint 6 |

| Ruling (confirmed by the owner, 2026-10-13) | Why | Cost if wrong |
|---|---|---|
| R1. The journey file is on by default, in `journey/` (gitignored), not in `logs/`. `AYDINLEARNS_JOURNEY=off` stops it; `AYDINLEARNS_JOURNEY_DIR` moves it. `false`, `0` and `no` also stop it, and any other word leaves it on with a line at the start saying so. A server on a temporary logs folder (`AYDINLEARNS_LOGS_DIR`, a test server) writes none unless `AYDINLEARNS_JOURNEY_DIR` names a folder (both added in the branch review) | The analysis must work without Dash0 and after the trial. Outside `logs/`, a coding agent may read it (IDs only), while `logs/` stays closed to agents | One `.env` line turns it off |
| R2. A journey session (a "visit") is the journey's own: it starts at the first event and ends after 30 idle minutes or at app stop. The app's study session (`server/session.ts`) is untouched and appears as `study_session_started` and `study_session_ended` events | Browsing must not start a study session, which is a logged fact the app replays | Two session ideas to explain; the README does |
| R3. The browser sends screen views only. Everything else comes from the server | Server events cannot be lost when a tab closes, and need no new browser code per feature | Time on a screen is estimated from the next event |
| R4. GA4 timed runs and SQL drills share `run_started` and `run_finished`, with `section` and `run_kind`. An end route may answer twice for one run (a reload), so the `runs` view keeps the first finish | One shape for every timed run | A duplicate count on the Dash0 counter, which the view ignores |
| R5. Concept state changes come from comparing every concept's replayed state after each attempt, close, exposure and card change, deferred with `setImmediate` so the request answers first | The state is the app's own derived truth | One replay per such write, which the next request reuses (memoised) |
| R6. Dash0 gets the log events (with `session.id`, so one visit can be followed in the log explorer), `session.id` on the request's span, `aydinlearns.journey.events` (labels `event`, and `screen` or `topic` when present) and `aydinlearns.session.duration`. `session.id` goes on no metric, and neither journey metric carries an item ID; D76's `aydinlearns.answer.time` keeps its exercise ID (wording made exact in the branch review) | Metrics stay few series | None |
| R7. `npm run journey` rebuilds `journey/journey.duckdb` from the files on every run. `--sql` runs one query of Aydin's own in a fresh copy held in memory, with no temporary folder, after `enable_external_access` is off and the configuration is locked (changed in the branch review: in the file's own instance a query could still write the database's side files) | The files are the source; the database is disposable. A query typed at the console then cannot read or write files or reach anything | None |
| R8. `item_viewed` means the exercise was sent to the browser, not that it was seen. A screen may fetch one exercise twice as it opens (once to learn its kind), and a drill or a practice run sends every question at its start. So the `items` view counts the visits an exercise was sent in (`visits_opened`), not its `item_viewed` events (added after the Task 4 review) | The server cannot tell a fetch from a look, and R3 keeps the browser to screen views | The raw events and the Dash0 count of `item_viewed` overstate opens (about twice on the usual path), and a drill's unreached questions count as opened in that visit |
| R9. An event's `ts` is when the app logged what happened. A tap event carries its log record's `ts` (an attempt's `submitted_at` when it has none), and a concept state change the latest watched record's time, so `journey()` takes a third argument, `journey(event, attributes?, at?)`. A route hook, a screen view and a funnel step use the moment of the call. A time ahead of now is now, and a time before the visit's latest event moves up to it, so a visit read by `ts` and then `seq` is in the order of sending (added after the Task 3 review) | An idle study-session end, written 30 minutes on with its last activity's time, then joins the visit it belongs to while that visit is still open (Review Focus 4; the README names the one exception, branch review N2), and a state change never sorts before the answer that caused it | `ts` is not the moment the line was written, and no column holds that moment |

## Global Constraints

- Events carry IDs, counts, times, outcomes and screen names only. Never send or write:
  - an item's text, a query, an answer or a key;
  - a self-check's `text`, `fields` or `ticked`;
  - a lab's `parts`, `note`, `month` or `range`;
  - a case export's `files` (local paths);
  - personal data.
- The journey never writes the app's logs, never calls `SessionTracker.touch()`, and never fails a request. Every journey call catches its own errors, and so does every deferred callback.
- `POST /api/journey` is excluded from the `/api/*` middleware's `touch()` (as `/api/session-end` is).
- No new packages. Node runs the `.ts` files directly: erasable syntax only (no enums, namespaces or parameter properties), and relative imports end in `.ts`.
- Every DuckDB instance is created with `autoinstall_known_extensions: 'false'` and `autoload_known_extensions: 'false'`, and sets TimeZone with `SET` after opening (R17).
- Tests never write to the real `journey/`. In a test the journey has no folder unless the test passes one, and the browser smoke test sets `AYDINLEARNS_JOURNEY_DIR` to a temporary folder.
- Docs for Aydin: plain English, tables, no em dashes, no gendered pronouns.
- Commit only the paths each task lists (never `git add -A`). Each message ends with the session's attribution lines.
- The worktree is `C:\zehirlab\.claude\worktrees\aydinlearns-s2`, on branch `feat/aydinlearns-journey` (from main 7bce3c5, no upstream). The browser smoke test there uses port 5184.

## Review Focus

1. A screen view while the log is fine must not start a study session or write to `logs/`. A reasonable person expects browsing to leave the study history as it was. Pinned in Task 4.
2. A journey folder that cannot be written (a file in its place, a locked disk), or a replay that throws inside the state watcher, must not fail or crash anything. The learner's request answers as usual. Pinned in Task 1 (folder) and Task 3 (deferred replay).
3. The learner's own words must never reach the journey: self-check text, lab answers and notes, export paths. Pinned in Task 3.
4. A gap of exactly 30 minutes keeps the visit, and anything longer starts a new one. The ending visit's `session_ended` carries its last activity's time, not the moment the gap was noticed. Pinned in Task 1.
5. A test run must never write into the owner's real `journey/` folder. Pinned in Task 1 (no folder by default) and Task 7 (the smoke test's folder).

---

### Task 1: The journey core

**Files:**
- Create: `schemas/journey.ts`
- Create: `server/journey.ts`
- Test: `tests/server/journey.test.ts`

**Interfaces:**
- Consumes: `APP_VERSION` from `server/version.ts`.
- Produces:
  - `schemas/journey.ts`: `SCREENS`, `type Screen`, `type JourneyEventName`, `JOURNEY_PATH = '/api/journey'`, `SUBJECT_ID: RegExp`.
  - `server/journey.ts`:
    - `type JourneyAttributes = Record<string, string | number | boolean>`
    - `type JourneyRecord`
    - `journeyDirFrom(env, appDir): string | null`
    - `startJourney({ dir, now?, idleMs? }): void`
    - `journey(event, attributes?): void`
    - `journeyScreen(screen, subjectId?): void`
    - `stopJourney(): Promise<void>`

- [ ] **Step 1: Write `schemas/journey.ts`** (types and constants only, so the test can import them)

```ts
// schemas/journey.ts: the study journey's event names and screens (owner decision D77, 2026-10-13). The server writes the events;
// the browser names its screens with these, and the server checks them.

/** The screens the browser reports, one per route family in web/src/App.tsx. A route App.tsx does not know shows Today. */
export const SCREENS = ['today', 'map', 'drill', 'mistakes', 'ga4_run', 'ga4_labs', 'ga4_lab', 'ga4_map', 'methodology_map',
  'reading', 'practice', 'lesson', 'inbox', 'case', 'opener', 'portfolio', 'progress', 'explore', 'item', 'setup'] as const;
export type Screen = typeof SCREENS[number];

/** The route the browser posts a screen view to. */
export const JOURNEY_PATH = '/api/journey';
/** A screen's subject: an item, concept, case or lab ID from the address. Anything else is dropped (browser) or refused (server). */
export const SUBJECT_ID = /^[A-Za-z0-9._:-]{1,80}$/;

export type JourneyEventName =
  | 'session_started' | 'session_ended' | 'screen_viewed'
  | 'lesson_started' | 'exercise_submitted' | 'exercise_passed' | 'exercise_failed'
  | 'item_viewed' | 'hint_opened' | 'answer_shown' | 'other_way_opened' | 'item_closed' | 'material_studied'
  | 'run_started' | 'run_finished'
  | 'case_opened' | 'case_self_check' | 'case_exported'
  | 'lab_opened' | 'lab_answered'
  | 'review_card_changed' | 'concept_state_changed'
  | 'study_session_started' | 'study_session_ended';
```

- [ ] **Step 2: Write the failing tests** in `tests/server/journey.test.ts`

```ts
// tests/server/journey.test.ts: the study journey (owner decision D77). Visits, their order and idle end, screens with the screen
// before them, the fixed fields, the OpenTelemetry side (against in-memory exporters: no network), and a folder that cannot be
// written. IDs here are made up.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { metrics, trace } from '@opentelemetry/api';
import { logs as logsApi } from '@opentelemetry/api-logs';
import { logs, metrics as sdkMetrics, node, tracing } from '@opentelemetry/sdk-node';
import { journey, journeyDirFrom, journeyScreen, startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';

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
const tmp = () => mkdtemp(join(tmpdir(), 'al-journey-'));
async function lines(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of (await readdir(dir)).sort()) {
    out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  }
  return out;
}

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
  assert.notEqual(r.session_id, 'x');
  assert.notEqual(r.app_version, 'x');
});

test('telemetry gets each event as a log record named by event.name, with session.id, a count, and the visit length at its end', async () => {
  startJourney({ dir: null, now: clock().now });
  trace.getTracer('test').startActiveSpan('GET /api/items/:id', (span) => { journey('item_viewed', { item_id: 'A', topic: 'SQL' }); span.end(); });
  await stopJourney();
  const viewed = records.getFinishedLogRecords().find((r) => r.eventName === 'item_viewed')!;
  const start = records.getFinishedLogRecords().find((r) => r.eventName === 'session_started')!;
  assert.equal(viewed.body, 'item_viewed');
  assert.equal(viewed.attributes.item_id, 'A');
  assert.equal(viewed.attributes['session.id'], start.attributes['session.id']);
  assert.equal(spans.getFinishedSpans()[0]!.attributes['session.id'], viewed.attributes['session.id']);
  await reader.forceFlush();
  const all = points.getMetrics().flatMap((r) => r.scopeMetrics).flatMap((m) => m.metrics);
  const counted = all.find((m) => m.descriptor.name === 'aydinlearns.journey.events')!;
  assert.ok(counted.dataPoints.some((p) => p.attributes.event === 'item_viewed' && p.attributes.topic === 'SQL'));
  assert.ok(counted.dataPoints.every((p) => p.attributes.item_id === undefined && p.attributes['session.id'] === undefined));
  assert.ok(all.some((m) => m.descriptor.name === 'aydinlearns.session.duration'));
});

test('a folder that cannot be written turns the file off with one line, and nothing throws', async () => {
  const blocked = join(await tmp(), 'journey');
  await writeFile(blocked, 'a file where the folder should be');
  const said: string[] = [];
  const log = console.log;
  console.log = (m: unknown) => { said.push(String(m)); };
  try {
    startJourney({ dir: blocked, now: clock().now });
    assert.doesNotThrow(() => { journey('item_viewed', { item_id: 'A' }); journey('item_viewed', { item_id: 'B' }); });
    await stopJourney();
  } finally { console.log = log; }
  assert.equal(said.filter((m) => m.includes('journey')).length, 1);
  assert.ok(records.getFinishedLogRecords().some((r) => r.eventName === 'item_viewed'));
});

test('the journey folder: off, a chosen folder, or journey/ in the app; blank values mean the default', () => {
  assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY: 'off' }, 'C:/app'), null);
  assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY: ' OFF ' }, 'C:/app'), null);
  assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY_DIR: 'C:/tmp/j' }, 'C:/app'), resolve('C:/tmp/j'));
  assert.equal(journeyDirFrom({ AYDINLEARNS_JOURNEY: '', AYDINLEARNS_JOURNEY_DIR: '' }, 'C:/app'), resolve('C:/app/journey'));
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `node --test tests/server/journey.test.ts`
Expected: FAIL, `Cannot find module '.../server/journey.ts'`.

- [ ] **Step 4: Write `server/journey.ts`**

```ts
// server/journey.ts: the study journey (owner decision D77, 2026-10-13). Every event the app records about a visit goes through
// journey():
// - one line in the local journey file (journey/events-YYYY-MM.jsonl, which `npm run journey` loads into DuckDB);
// - when telemetry is on (D75), one OpenTelemetry log record named by event.name with session.id, and one count on
//   aydinlearns.journey.events;
// - session.id on the request's span.
// A visit (a journey session) starts at its first event and ends after 30 idle minutes or when the app stops. It is the journey's
// own: the app's study session (server/session.ts) is never touched here. Events carry IDs, counts, times and outcomes only, never
// an item's text, a query, an answer, a note or personal data. Nothing here may fail a request. Every error is caught, and a folder
// that cannot be written turns the file off with one console line.
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { metrics, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import type { JourneyEventName, Screen } from '../schemas/journey.ts';
import { APP_VERSION } from './version.ts';

export type JourneyAttributes = Record<string, string | number | boolean>;
/** One line of the journey file. The attributes sit beside the fixed fields, so DuckDB reads each as a column. */
export type JourneyRecord = { v: 1; ts: string; session_id: string; seq: number; event: JourneyEventName; app_version: string } & JourneyAttributes;

export interface JourneyOptions {
  /** The folder for the journey files, or null for none (AYDINLEARNS_JOURNEY=off, and any test that passes none). */
  dir: string | null;
  now?: () => Date;
  idleMs?: number;
}

const IDLE_MS = 30 * 60_000;
const RESERVED = new Set(['v', 'ts', 'session_id', 'seq', 'event', 'app_version']);
/** Seconds: from a quick look to a long evening. */
const SESSION_BUCKETS = [60, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800];
interface Visit { id: string; started: number; last: number; seq: number; count: number }

let dir: string | null = null;
let now: () => Date = () => new Date();
let idleMs = IDLE_MS;
let visit: Visit | null = null;
let lastScreen: Screen | null = null;
let writes: Promise<void> = Promise.resolve();

/** The journey folder from the environment: null when AYDINLEARNS_JOURNEY is off, else AYDINLEARNS_JOURNEY_DIR or <app>/journey. */
export function journeyDirFrom(env: Record<string, string | undefined>, appDir: string): string | null {
  if (env.AYDINLEARNS_JOURNEY?.trim().toLowerCase() === 'off') return null;
  return resolve(env.AYDINLEARNS_JOURNEY_DIR?.trim() || join(appDir, 'journey'));
}

/** Starts the journey (main.ts; tests restart it). No visit is open until the first event. Before it, events go to telemetry only. */
export function startJourney(o: JourneyOptions): void {
  dir = o.dir;
  now = o.now ?? (() => new Date());
  idleMs = o.idleMs ?? IDLE_MS;
  visit = null;
  lastScreen = null;
  writes = Promise.resolve();
}

/** Ends the open visit (reason app_stop) and waits for the file writes. */
export async function stopJourney(): Promise<void> {
  try {
    if (visit) close(visit, 'app_stop');
  } catch { /* the journey never stops the app */ }
  visit = null;
  await writes;
}

/** One event of the current visit. A new visit opens first when none is open or the last event was over 30 minutes ago. */
export function journey(event: JourneyEventName, attributes: JourneyAttributes = {}): void {
  try {
    const at = now();
    emit(current(at), event, attributes, at, true);
  } catch { /* telemetry never fails a request */ }
}

/** A screen the browser showed, with the screen before it in the same visit. */
export function journeyScreen(screen: Screen, subjectId?: string): void {
  try {
    const at = now();
    const v = current(at);
    emit(v, 'screen_viewed', { screen, ...(subjectId ? { subject_id: subjectId } : {}), ...(lastScreen ? { from_screen: lastScreen } : {}) }, at, true);
    lastScreen = screen;
  } catch { /* as journey() */ }
}

function current(at: Date): Visit {
  if (visit && at.getTime() - visit.last <= idleMs) return visit;
  const previous = visit;
  if (previous) close(previous, 'idle');
  const v: Visit = { id: randomUUID(), started: at.getTime(), last: at.getTime(), seq: 0, count: 0 };
  visit = v;
  lastScreen = null;
  emit(v, 'session_started', { reason: previous ? 'idle' : 'app_start', ...(previous ? { previous_session_id: previous.id } : {}) }, at, true);
  return v;
}

/** The visit's end, stamped with its last activity. Its span is not the current request's, so nothing goes on that. */
function close(v: Visit, reason: 'idle' | 'app_stop'): void {
  const seconds = Math.round((v.last - v.started) / 1000);
  emit(v, 'session_ended', { reason, duration_s: seconds, event_count: v.count }, new Date(v.last), false);
  metrics.getMeter('aydinlearns').createHistogram('aydinlearns.session.duration', { description: 'How long a study visit lasted, first event to last',
    unit: 's', advice: { explicitBucketBoundaries: SESSION_BUCKETS } }).record(seconds);
}

const pick = (a: JourneyAttributes, k: string): JourneyAttributes => (typeof a[k] === 'string' ? { [k]: a[k] } : {});

function emit(v: Visit, event: JourneyEventName, attributes: JourneyAttributes, at: Date, onSpan: boolean): void {
  v.seq += 1;
  if (event !== 'session_started' && event !== 'session_ended') v.count += 1;
  v.last = Math.max(v.last, at.getTime());
  const attrs: JourneyAttributes = {};
  for (const [k, x] of Object.entries(attributes)) if (!RESERVED.has(k) && x !== undefined) attrs[k] = x;
  const record: JourneyRecord = { v: 1, ts: at.toISOString(), session_id: v.id, seq: v.seq, event, app_version: APP_VERSION, ...attrs };
  if (dir) append(dir, record);
  if (onSpan) trace.getActiveSpan()?.setAttribute('session.id', v.id);
  logs.getLogger('aydinlearns').emit({ eventName: event, timestamp: at, severityNumber: SeverityNumber.INFO, severityText: 'INFO', body: event,
    attributes: { ...attrs, 'session.id': v.id, 'session.seq': v.seq } });
  metrics.getMeter('aydinlearns').createCounter('aydinlearns.journey.events', { description: 'Study journey events', unit: '{event}' })
    .add(1, { event, ...pick(attrs, 'screen'), ...pick(attrs, 'topic') });
}

/** Appends one line, in order. A failure turns the file off for this run, with one console line (the code only, never a path). */
function append(folder: string, r: JourneyRecord): void {
  const file = join(folder, `events-${r.ts.slice(0, 7)}.jsonl`);
  const line = `${JSON.stringify(r)}\n`;
  writes = writes.then(async () => {
    if (dir !== folder) return;
    await mkdir(folder, { recursive: true });
    await appendFile(file, line, 'utf8');
  }).catch((e: unknown) => {
    if (dir === folder) {
      console.log(`aydinlearns: journey: events are no longer written to the journey folder (${(e as NodeJS.ErrnoException).code ?? 'error'}). Telemetry, when on, still gets them.`);
    }
    dir = null;
  });
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `node --test tests/server/journey.test.ts`
Expected: PASS, 7 tests. If `eventName` is missing on the SDK's log records, check `node_modules/@opentelemetry/sdk-logs/build/src/export/ReadableLogRecord.d.ts`: the 0.222 SDK has it.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` (expected: 0 errors).
Commit: `schemas/journey.ts`, `server/journey.ts`, `tests/server/journey.test.ts`. Message: `aydinlearns: the study journey core (D77)`.

---

### Task 2: The funnel joins the journey

**Files:**
- Modify: `server/observe.ts` (the header comment, `funnel()`, imports)
- Modify: `tests/server/observe.test.ts:33-34`

**Interfaces:**
- Consumes: `journey`, `type JourneyAttributes` (Task 1).
- Produces: every funnel step (`lesson_started`, `exercise_submitted`, `exercise_passed`, `exercise_failed`) is also a journey event with `session.id`. Its log record is now the journey's (it has `eventName`). The span event and the `aydinlearns.funnel.steps` counter are unchanged.

- [ ] **Step 1: Change the test first.** In `tests/server/observe.test.ts`, replace

```ts
  const [r] = records.getFinishedLogRecords();
  assert.equal(r!.body, 'exercise_passed');
```

with

```ts
  const r = records.getFinishedLogRecords().find((x) => x.eventName === 'exercise_passed');
  assert.equal(r!.body, 'exercise_passed');
  assert.equal(typeof r!.attributes['session.id'], 'string');            // D77: every step belongs to a visit
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/server/observe.test.ts`
Expected: FAIL on the first test (no record has `eventName`).

- [ ] **Step 3: Route the step's log record through the journey.** In `server/observe.ts`:
  - drop `import { logs, SeverityNumber } from '@opentelemetry/api-logs';`;
  - add `import { journey, type JourneyAttributes } from './journey.ts';`;
  - replace the last line of `funnel()`:

```ts
  logs.getLogger('aydinlearns').emit({ severityNumber: SeverityNumber.INFO, severityText: 'INFO', body: step, attributes });
```

with

```ts
  journey(step, journeyAttributes(attributes));                    // D77: the log record (with session.id) and the journey file
```

and add above `funnel()`:

```ts
/** The scalar attributes, as the journey takes them (OpenTelemetry's type also allows arrays, which no funnel step uses). */
const journeyAttributes = (a: Attributes): JourneyAttributes =>
  Object.fromEntries(Object.entries(a).filter((e): e is [string, string | number | boolean] =>
    typeof e[1] === 'string' || typeof e[1] === 'number' || typeof e[1] === 'boolean'));
```

  Then update the doc comment on `funnel()`: replace "and a log record, which carries the trace's ID" with "and a journey event (server/journey.ts, D77): the log record, which carries the trace's ID and session.id, and a line in the journey file". In the file header, add a line: "Since D77 each step is also a study journey event."

- [ ] **Step 4: Run the telemetry tests**

Run: `node --test tests/server/observe.test.ts tests/server/journey.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Paths: `server/observe.ts`, `tests/server/observe.test.ts`. Message: `aydinlearns: funnel steps are journey events (D77)`.

---

### Task 3: The log tap, concept states, and the wiring in main.ts

**Files:**
- Create: `server/journey-tap.ts`
- Modify: `server/main.ts` (after `bootState`, line ~206; in `stop`, line ~244)
- Test: `tests/server/journey-tap.test.ts`

**Interfaces:**
- Consumes: `journey`, `startJourney`, `stopJourney`, `journeyDirFrom` (Task 1). `LogFile` from `core/jsonl.ts`, `ConceptStateName` from `core/states.ts`, `ReplayResult` (the type `LearnerState.current()` returns, from `core/replay.ts`), `ContentStore` from `server/content.ts`.
- Produces:
  - `journeyTap(deps: TapDeps): (file: LogFile, r: object) => void`
  - `topicFinder(content): (conceptId: string) => string | null`
  - `conceptStates(r: ReplayResult): ReadonlyMap<string, ConceptStateName>`

- [ ] **Step 1: Write the failing tests** in `tests/server/journey-tap.test.ts`

```ts
// tests/server/journey-tap.test.ts: the journey events the app's own log tells (D77). Each record maps to one event with IDs and
// outcomes, and never the learner's words; concept state changes are reported once; nothing a tap does can fail a write. IDs are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConceptStateName } from '../../core/states.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { journeyTap, topicFinder } from '../../server/journey-tap.ts';

const tmp = () => mkdtemp(join(tmpdir(), 'al-journey-tap-'));
const later = () => new Promise<void>((done) => setImmediate(done));
async function events(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of await readdir(dir)) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  return out.filter((r) => r.event !== 'session_started' && r.event !== 'session_ended');
}
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
  assert.ok(calls >= 2);
  await stopJourney();
});

test('topics: SQL from the curriculum, GA4 and Methodology from their concept lists, else none', () => {
  const content = {
    curriculum: { concepts: [{ id: 'SQL-A-01' }] },
    choiceConcepts: (section: 'ga4' | 'methodology') => (section === 'ga4' ? [{ id: 'C-GA4-01' }] : [{ id: 'EXP-AB-01' }]),
  };
  const topicOf = topicFinder(content as never);
  assert.deepEqual(['SQL-A-01', 'C-GA4-01', 'EXP-AB-01', 'X'].map(topicOf), ['SQL', 'GA4', 'Methodology', null]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/server/journey-tap.test.ts`
Expected: FAIL, `Cannot find module '.../server/journey-tap.ts'`.

- [ ] **Step 3: Write `server/journey-tap.ts`**

```ts
// server/journey-tap.ts: the journey events the app's own log already tells (D77). main.ts registers it with the logger's onWrite
// after the learner state's mirror, so the state it reads includes the record just written. Each record maps to one event with its
// IDs, counts and outcomes. A field that holds the learner's words (a self-check's text, fields and ticks; a lab's answers, note and
// dates; an export's file paths) is never read. After an attempt, close, exposure or card change it compares every concept's state
// with its last look, after the request has answered, and reports each change. Nothing here may fail a write.
import type { LogFile } from '../core/jsonl.ts';
import type { ReplayResult } from '../core/replay.ts';
import type { ConceptStateName } from '../core/states.ts';
import type { ContentStore } from './content.ts';
import { journey, type JourneyAttributes } from './journey.ts';

export interface TapDeps {
  /** SQL, GA4 or Methodology for a concept ID, or null for one the content does not know. */
  topicOf: (conceptId: string) => string | null;
  /** Every concept's state now: a replay of the logs, memoised by the learner state on the record count. */
  states: () => ReadonlyMap<string, ConceptStateName>;
}

type Rec = Record<string, unknown>;
/** The field under `name` when it holds a string, number or boolean; else nothing. */
const field = (r: Rec, k: string, name = k): JourneyAttributes =>
  (typeof r[k] === 'string' || typeof r[k] === 'number' || typeof r[k] === 'boolean' ? { [name]: r[k] as string | number | boolean } : {});
const WATCHED = new Set(['attempt', 'item_close', 'block_close', 'exposure']);

/** Every concept's state in a replay. */
export const conceptStates = (r: ReplayResult): ReadonlyMap<string, ConceptStateName> =>
  new Map([...r.concepts].map(([id, c]) => [id, c.state]));

/** A concept's section: SQL from the curriculum, GA4 and Methodology from their concept lists. */
export function topicFinder(content: Pick<ContentStore, 'curriculum' | 'choiceConcepts'>): (conceptId: string) => string | null {
  const sql = new Set(content.curriculum.concepts.map((x) => x.id));
  const ga4 = new Set((content.choiceConcepts?.('ga4') ?? []).map((x) => x.id));
  const methodology = new Set((content.choiceConcepts?.('methodology') ?? []).map((x) => x.id));
  return (id) => (sql.has(id) ? 'SQL' : ga4.has(id) ? 'GA4' : methodology.has(id) ? 'Methodology' : null);
}

export function journeyTap(d: TapDeps): (file: LogFile, r: object) => void {
  let seen: ReadonlyMap<string, ConceptStateName> | null = null;
  try { seen = d.states(); } catch { seen = null; }                // the baseline: changes from here on are reported
  const concept = (r: Rec): JourneyAttributes => {
    const id = typeof r.target_concept_id === 'string' ? r.target_concept_id : typeof r.concept_id === 'string' ? r.concept_id : null;
    if (!id) return {};
    const topic = d.topicOf(id);
    return { concept_id: id, ...(topic ? { topic } : {}) };
  };
  const help = (r: Rec): JourneyAttributes => ({ ...field(r, 'item_id'), ...concept(r), ...field(r, 'phase'), review: typeof r.card_id === 'string' });
  const look = (): void => {
    const now = d.states();
    if (seen) {
      for (const [id, state] of now) {
        const before = seen.get(id) ?? 'new';
        if (before !== state) journey('concept_state_changed', { ...concept({ concept_id: id }), state_from: before, state_to: state });
      }
    }
    seen = now;
  };
  // After the request has answered: the replay is one the next request reuses (memoised), and its errors stay here.
  const lookLater = (): void => { setImmediate(() => { try { look(); } catch { /* a replay fault is the setup check's to report */ } }); };

  return (file, raw) => {
    try {
      const r = raw as Rec;
      if (file === 'attempts') {
        if (r.record === 'hint_opened') journey('hint_opened', { ...help(r), ...field(r, 'level', 'hint_level') });
        else if (r.record === 'solution_opened') journey('answer_shown', help(r));
        else if (r.record === 'other_way_opened') journey('other_way_opened', help(r));
        else if (r.record === 'exposure') journey('material_studied', { ...concept(r), ...field(r, 'kind') });
        else if (r.record === 'self_check') journey('case_self_check', { ...field(r, 'kind'), ...field(r, 'phase'), ...field(r, 'case_id') });
        else if (r.record === 'lab_answer') journey('lab_answered', { ...field(r, 'lab_id'), ...field(r, 'kind') });
        else if (r.record === 'item_close') {
          const o = (r.raw_outcome ?? {}) as Rec;
          journey('item_closed', { ...field(r, 'item_id'), ...concept(r), ...field(r, 'phase'), ...field(r, 'reason'),
            ...field(o, 'graded_attempts'), ...field(o, 'passed'), ...field(o, 'first_attempt_pass'), ...field(o, 'max_hint_level'),
            ...(typeof o.active_ms === 'number' ? { active_s: Math.round(o.active_ms / 1000) } : {}), ...field(r, 'instance_rating', 'rating') });
        }
        if (WATCHED.has(r.record as string)) lookLater();
      } else if (file === 'events') {
        if (r.event === 'session') journey(r.phase === 'end' ? 'study_session_ended' : 'study_session_started', { ...field(r, 'reason'), ...field(r, 'active_minutes') });
        else if (r.event === 'card_event') { journey('review_card_changed', { ...field(r, 'card_id'), ...field(r, 'kind') }); lookLater(); }
        else if (r.event === 'case_export') journey('case_exported', { ...field(r, 'case_id'), ...field(r, 'data_source') });
      }
    } catch { /* the journey never fails a write */ }
  };
}
```

Check that `ReplayResult` is exported from `core/replay.ts` and that `r.concepts` is a `Map` whose values have `state` (`server/progress.ts:22` reads it that way). If the export name differs, import the type `LearnerState.current()` returns.

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test tests/server/journey-tap.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it in `server/main.ts`.** Add imports:

```ts
import { journeyDirFrom, startJourney, stopJourney } from './journey.ts';
import { conceptStates, journeyTap, topicFinder } from './journey-tap.ts';
```

After `const state = await bootState(logger, session, content, logs, () => settings.exam_date, contentCheck === null);` add:

```ts
  // D77: the study journey. Its folder comes from .env (AYDINLEARNS_JOURNEY, AYDINLEARNS_JOURNEY_DIR). The tap turns what the app
  // logs from here on into journey events; the recovery bootState just ran is not part of a visit. Without content, no tap.
  startJourney({ dir: journeyDirFrom(process.env, at('')) });
  if (contentCheck === null) logger.onWrite(journeyTap({ topicOf: topicFinder(content), states: () => conceptStates(state.current()) }));
```

In `stop`, between `await shutdown({ server, session, runner });` and `await stopTelemetry();`, add:

```ts
    await stopJourney();                                       // D77: ends the visit and writes what is pending, before telemetry flushes
```

- [ ] **Step 6: Run the server suite and typecheck**

Run: `node --test "tests/server/**/*.test.ts"` and `npm run typecheck`.
Expected: all pass, 0 errors.

- [ ] **Step 7: Commit**

Paths: `server/journey-tap.ts`, `server/main.ts`, `tests/server/journey-tap.test.ts`. Message: `aydinlearns: journey events from the app's own log, and concept state changes (D77)`.

---

### Task 4: Route hooks and the screen-view route

**Files:**
- Modify: `server/app.ts`:
  - the `/api/*` middleware condition (line ~585);
  - `GET /api/items/:id` (line ~609);
  - a new `POST /api/journey` beside `/api/session-end`;
  - imports.
- Modify: `server/routes/choice.ts`: extract `funnelOf`, and hook `GET /api/choice/:id`.
- Modify: `server/routes/cases.ts:404` (`GET /api/cases/:id`)
- Modify: `server/routes/labs.ts:127` (`GET /api/labs/:id`)
- Modify: `server/routes/run.ts`: `/api/run/start` (line ~90) and `/api/run/end` (line ~117).
- Modify: `server/routes/drill.ts`: `/api/drill/start` (line ~152) and `/api/drill/end` (line ~154).
- Test: `tests/server/journey-routes.test.ts`

**Interfaces:**
- Consumes: `journey`, `journeyScreen` (Task 1); `SCREENS`, `JOURNEY_PATH`, `SUBJECT_ID`, `type Screen` (Task 1); `sqlFunnel`, `choiceFunnel`, `levelName` (`server/observe.ts`).
- Produces: `POST /api/journey` with body `{ event: 'screen_viewed', screen: Screen, subject_id?: string }`, which answers `{ ok: true }`, or 400. Task 5's browser call uses it.

- [ ] **Step 1: Write the failing tests** in `tests/server/journey-routes.test.ts`

```ts
// tests/server/journey-routes.test.ts: the journey's route hooks (D77). Opening an exercise records item_viewed; a screen view is
// recorded and opens no study session (nothing reaches logs/); a bad screen view is refused. Fixture content, no SQL runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { FIXTURE_CONCEPT, makeContentFixture } from '../helpers/content-fixture.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) =>
  app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });

/** As tests/server/app.test.ts wires the app, without a runner. */
async function deps(): Promise<AppDeps> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-journey-app-'))));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, endHooks, state,
    session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell' };
}
async function journal(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of await readdir(dir)) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  return out;
}

test('opening an exercise records item_viewed with its ID and funnel attributes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-journey-'));
  startJourney({ dir });
  const app = createApp(await deps());
  const id = lesson.pool_item_ids[0]!;
  assert.equal((await get(app, `/api/items/${id}`)).status, 200);
  await stopJourney();
  const viewed = (await journal(dir)).find((r) => r.event === 'item_viewed');
  assert.equal(viewed?.item_id, id);
  assert.equal(viewed?.topic, 'SQL');
});

test('a screen view is recorded, and opens no study session: nothing reaches the logs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-journey-'));
  startJourney({ dir });
  const d = await deps();
  const app = createApp(d);
  assert.equal((await post(app, '/api/journey', { event: 'screen_viewed', screen: 'lesson', subject_id: FIXTURE_CONCEPT })).status, 200);
  await stopJourney();
  const views = (await journal(dir)).filter((r) => r.event === 'screen_viewed');
  assert.deepEqual(views.map((v) => [v.screen, v.subject_id]), [['lesson', FIXTURE_CONCEPT]]);
  assert.equal(d.session.currentId, null);
  assert.deepEqual(await d.logger.readAll('events'), []);
  assert.deepEqual(await d.logger.readAll('attempts'), []);
});

test('a screen view with an unknown event, screen or subject is refused and records nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-journey-'));
  startJourney({ dir });
  const app = createApp(await deps());
  for (const body of [{ event: 'clicked', screen: 'today' }, { event: 'screen_viewed', screen: 'admin' },
    { event: 'screen_viewed', screen: 'item', subject_id: '../../etc/passwd' }, { event: 'screen_viewed', screen: 'item', subject_id: 7 }]) {
    assert.equal((await post(app, '/api/journey', body)).status, 400, JSON.stringify(body));
  }
  await stopJourney();
  assert.deepEqual(await readdir(dir), []);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/server/journey-routes.test.ts`
Expected: FAIL. There is no `item_viewed` yet, and `/api/journey` is a 404.

- [ ] **Step 3: Add the hooks in `server/app.ts`**
  - Imports: `import { journey, journeyScreen } from './journey.ts';` and `import { JOURNEY_PATH, SCREENS, SUBJECT_ID, type Screen } from '../schemas/journey.ts';`.
  - In the `/api/*` middleware, change `} else if (!READS.has(c.req.method) && c.req.path !== '/api/session-end' && c.req.path !== EXPLORE_RUN_PATH) {` to:

```ts
    } else if (!READS.has(c.req.method) && c.req.path !== '/api/session-end' && c.req.path !== EXPLORE_RUN_PATH && c.req.path !== JOURNEY_PATH) {
```

  and extend the comment above `touch()`: "A screen view (D77) starts none either: browsing is not study."
  - In `GET /api/items/:id`, change the success line to:

```ts
    if (item) {
      journey('item_viewed', { item_id: item.id, ...sqlFunnel(item.difficulty) });     // D77: the exercise was sent
      return c.json({ item: publicItem(item, c.req.query('stage'), d.content.key(item.id)?.other_way != null), schemaNotes: d.schemaNotes.filter((n) => n.schema === item.schema) });
    }
```

  - After the `/api/session-end` route, add:

```ts
  // D77: the screen the browser shows, for the study journey. It writes nothing to the logs and opens no study session (the
  // middleware above lets it pass without touch()); a screen or subject the app does not know is refused.
  app.post(JOURNEY_PATH, async (c) => {
    const b = await readBody(c);
    if (b.event !== 'screen_viewed' || !SCREENS.includes(b.screen as Screen)) throw refuse(400, 'Unknown screen.');
    if (b.subject_id !== undefined && (typeof b.subject_id !== 'string' || !SUBJECT_ID.test(b.subject_id))) throw refuse(400, 'Unknown subject.');
    journeyScreen(b.screen as Screen, b.subject_id as string | undefined);
    return c.json({ ok: true });
  });
```

- [ ] **Step 4: Add the hooks in the route files**
  - `server/routes/choice.ts`: split `funnelAnswer` so the funnel attributes have their own helper, and use it when a question opens:

```ts
  const funnelOf = (q: Question): FunnelAttributes => {
    const own = q.section === 'sql' ? undefined : d.content.choiceItem?.(q.shape.id)?.concept_id;
    return q.section === 'sql' ? sqlFunnel(q.difficulty ?? levelName(q.level)) : choiceFunnel(d.content, q.section, own ?? q.target_concept_id);
  };
  const funnelAnswer = (q: Question, attempt: AydinAttempt, correct: boolean): void => {
    answered(funnelOf(q), attempt, correct ? 'passed' : 'failed');            // D76: with its exercise, time, confidence and mode
  };
```

    Keep the doc comment above `funnelAnswer` (it now describes `funnelOf`). Import `type FunnelAttributes` from `../observe.ts` and `journey` from `../journey.ts`. In `GET /api/choice/:id`, after `const phase: Phase = ...;`, add:

```ts
    journey('item_viewed', { item_id: item.id, phase, ...funnelOf(q) });             // D77
```

  - `server/routes/cases.ts`: replace the one-line `GET /api/cases/:id` with:

```ts
  app.get('/api/cases/:id', (c) => {
    const body = view(caseOf(c.req.param('id')));
    journey('case_opened', { case_id: c.req.param('id') });                         // D77: after caseOf, so only a known case
    return c.json(body);
  });
```

  - `server/routes/labs.ts`: in `GET /api/labs/:id`, after `const lab = labOf(c.req.param('id'));`, add `journey('lab_opened', { lab_id: lab.id });`.
  - `server/routes/run.ts`:
    - in `/api/run/start`, before `return c.json(runView(run));`, add `journey('run_started', { section: 'ga4', run_kind: kind, block_id, questions: bp.questions });`;
    - in `/api/run/end`, before `return c.json(historyRow(r));`, add `journey('run_finished', { section: 'ga4', run_kind: r.kind, block_id: block, score_pct: r.score.pct, run_passed: r.score.pass });`.
  - `server/routes/drill.ts`:
    - in `/api/drill/live/start` (added after the Task 4 review, so a live rep is in the `runs` view), replace the one-line return with `const run = runs.start({ ... });`, then `journey('run_started', { section: 'sql', run_kind: 'live_rep', block_id, questions: 1, screen_mode: true });`, then `return c.json(view(run));`;
    - in `/api/drill/start`, before `return c.json(view(run));`, add `journey('run_started', { section: 'sql', run_kind: plan.kind, block_id, questions: plan.questions, screen_mode, ...(plan.level === null ? {} : { level: plan.level }) });`;
    - in `/api/drill/end`, in the live branch, before `if (live) return ...`, add `if (live) journey('run_finished', { section: 'sql', run_kind: 'live_rep', block_id: live.block_id });`;
    - before the final `return c.json({ block_id: r.block_id, kind: r.kind, ...})`, add `journey('run_finished', { section: 'sql', run_kind: r.kind, block_id: r.block_id, score_pct: r.score.pct, run_passed: r.score.run_passed, ...(r.level === null ? {} : { level: r.level }) });`.

  Each hook takes the comment `// D77` at the end of its line, as in app.ts.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/server/journey-routes.test.ts`, then `npm test` and `npm run typecheck`.
Expected: all pass (the full suite was 1954 before this branch; the new files add theirs).

- [ ] **Step 6: Commit**

Paths:
- `server/app.ts`
- `server/routes/choice.ts`, `server/routes/cases.ts`, `server/routes/labs.ts`, `server/routes/run.ts`, `server/routes/drill.ts`
- `tests/server/journey-routes.test.ts`

Message: `aydinlearns: journey hooks for exercises, cases, labs and runs, and the screen-view route (D77)`.

---

### Task 5: The browser reports each screen

**Files:**
- Create: `web/src/lib/journey.ts`
- Modify: `web/src/api.ts` (imports; one method in `api`)
- Modify: `web/src/App.tsx` (one effect in the component that calls `useHash()`)
- Test: `tests/web/journey.test.ts`

**Interfaces:**
- Consumes: `SCREENS`, `SUBJECT_ID`, `JOURNEY_PATH`, `type Screen` (Task 1); `POST /api/journey` (Task 4).
- Produces: `screenOf(hash: string): { screen: Screen; subject_id?: string }`; `api.journey(screen, subjectId?)`.

- [ ] **Step 1: Write the failing test** in `tests/web/journey.test.ts`

```ts
// tests/web/journey.test.ts: the screen a route shows (D77), as web/src/App.tsx picks it, and the subject taken from its address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS } from '../../schemas/journey.ts';
import { screenOf } from '../../web/src/lib/journey.ts';

test('each route family names its screen, with an item, concept, case or lab ID as its subject', () => {
  const cases: [string, ReturnType<typeof screenOf>][] = [
    ['', { screen: 'today' }], ['#/', { screen: 'today' }], ['#/nowhere', { screen: 'today' }],
    ['#/setup', { screen: 'setup' }], ['#/map', { screen: 'map' }], ['#/drill', { screen: 'drill' }], ['#/mistakes', { screen: 'mistakes' }],
    ['#/ga4/run', { screen: 'ga4_run' }], ['#/ga4/run/0b6c-block', { screen: 'ga4_run' }], ['#/ga4/labs', { screen: 'ga4_labs' }],
    ['#/ga4/lab/LAB-08', { screen: 'ga4_lab', subject_id: 'LAB-08' }], ['#/ga4', { screen: 'ga4_map' }],
    ['#/methodology', { screen: 'methodology_map' }],
    ['#/reading/ga4/C-GA4-01', { screen: 'reading', subject_id: 'C-GA4-01' }], ['#/practice/methodology/EXP-AB-01', { screen: 'practice', subject_id: 'EXP-AB-01' }],
    ['#/reading/ga4', { screen: 'today' }],
    ['#/lesson/SQL-SEL-01', { screen: 'lesson', subject_id: 'SQL-SEL-01' }],
    ['#/inbox', { screen: 'inbox' }], ['#/case', { screen: 'inbox' }], ['#/case/CASE-DAILY-L3-03', { screen: 'case', subject_id: 'CASE-DAILY-L3-03' }],
    ['#/opener/CASE-OPEN-L2', { screen: 'opener', subject_id: 'CASE-OPEN-L2' }],
    ['#/portfolio', { screen: 'portfolio' }], ['#/progress', { screen: 'progress' }], ['#/explore', { screen: 'explore' }],
    ['#/item/SQL-SEL-01-W03?phase=retest', { screen: 'item', subject_id: 'SQL-SEL-01-W03' }],
  ];
  for (const [hash, want] of cases) assert.deepEqual(screenOf(hash), want, hash);
});

test('a subject that is not a plain ID is dropped, and a bad escape does not throw', () => {
  assert.deepEqual(screenOf('#/item/a%20b'), { screen: 'item' });
  assert.deepEqual(screenOf('#/item/%E0%A4%A'), { screen: 'item' });
  assert.deepEqual(screenOf(`#/item/${'x'.repeat(81)}`), { screen: 'item' });
});

test('every screen the server accepts is one a route can show', () => {
  const shown = new Set(['#/', '#/setup', '#/map', '#/drill', '#/mistakes', '#/ga4/run', '#/ga4/labs', '#/ga4/lab/L', '#/ga4', '#/methodology',
    '#/reading/ga4/C', '#/practice/ga4/C', '#/lesson/C', '#/inbox', '#/case/C', '#/opener/C', '#/portfolio', '#/progress', '#/explore', '#/item/I']
    .map((h) => screenOf(h).screen));
  assert.deepEqual([...shown].sort(), [...SCREENS].sort());
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/web/journey.test.ts`
Expected: FAIL, `Cannot find module '.../web/src/lib/journey.ts'`.

- [ ] **Step 3: Write `web/src/lib/journey.ts`**

```ts
// web/src/lib/journey.ts: the screen a route shows, for the study journey (D77). It mirrors the route order in App.tsx: a route
// App.tsx does not know shows Today, and so does a reading or practice address without its concept.
import { SUBJECT_ID, type Screen } from '../../../schemas/journey.ts';

export function screenOf(hash: string): { screen: Screen; subject_id?: string } {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return ''; } });
  const [a, b, c] = parts;
  const at = (screen: Screen, subject?: string) => (subject && SUBJECT_ID.test(subject) ? { screen, subject_id: subject } : { screen });
  if (a === 'setup') return at('setup');
  if (a === 'map') return at('map');
  if (a === 'drill') return at('drill');
  if (a === 'mistakes') return at('mistakes');
  if (a === 'ga4' && b === 'run') return at('ga4_run');
  if (a === 'ga4' && b === 'labs') return at('ga4_labs');
  if (a === 'ga4' && b === 'lab' && c) return at('ga4_lab', c);
  if (a === 'ga4') return at('ga4_map');
  if (a === 'methodology') return at('methodology_map');
  if ((a === 'reading' || a === 'practice') && c) return at(a, c);
  if (a === 'lesson') return at('lesson', b);
  if (a === 'inbox' || ((a === 'case' || a === 'opener') && !b)) return at('inbox');
  if (a === 'case' || a === 'opener') return at(a, b);
  if (a === 'portfolio') return at('portfolio');
  if (a === 'progress') return at('progress');
  if (a === 'explore') return at('explore');
  if (a === 'item') return at('item', b);
  return at('today');
}
```

- [ ] **Step 4: Add the call and the effect**
  - `web/src/api.ts`: add `import { JOURNEY_PATH, type Screen } from '../../schemas/journey.ts';`. In `api`, add:

```ts
  /** D77: the screen now shown, for the study journey. Fire and forget: a failure never shows. */
  journey: (screen: Screen, subject_id?: string) =>
    call<{ ok: true }>('POST', JOURNEY_PATH, subject_id ? { event: 'screen_viewed', screen, subject_id } : { event: 'screen_viewed', screen }),
```

  - `web/src/App.tsx`: import `screenOf` from `./lib/journey.ts`. In the component with `const hash = useHash();` and the `status` state, after the focus effect, add:

```tsx
  // D77: each screen shown, for the study journey; once the status says the app is up and not in setup mode. Never shown on failure.
  const journeyOn = status !== null && !status.degraded;
  useEffect(() => {
    if (!journeyOn) return;
    const { screen, subject_id } = screenOf(hash);
    api.journey(screen, subject_id).catch(() => {});
  }, [hash, journeyOn]);
```

  Put it above the early `return` for a missing status, so the hook order never changes.

- [ ] **Step 5: Run the tests and typecheck**

Run: `node --test tests/web/journey.test.ts` and `npm run typecheck` (it covers `web/tsconfig.json`), then `npm run check:imports`.
Expected: PASS, 0 errors, the import check clean (web may import `schemas/`, except `presets.ts`).

- [ ] **Step 6: Commit**

Paths: `web/src/lib/journey.ts`, `web/src/api.ts`, `web/src/App.tsx`, `tests/web/journey.test.ts`. Message: `aydinlearns: the browser reports each screen to the journey (D77)`.

---

### Task 6: `npm run journey`

**Files:**
- Create: `tools/journey.ts`
- Create: `tools/journey-views.sql`
- Modify: `package.json` (scripts)
- Test: `tests/tools/journey.test.ts`

**Interfaces:**
- Consumes: `journeyDirFrom` (Task 1). The journey file format (`JourneyRecord`, Task 1).
- Produces:
  - `loadJourney(dir: string, dbPath: string | null): Promise<Loaded>`, where `Loaded = { connection, close(), events, skipped, files }`;
  - `VIEWS` (the starter views' names);
  - `COLUMNS`;
  - the command `npm run journey [-- --sql "<query>"] [-- --csv]`.

- [ ] **Step 1: Write the failing test** in `tests/tools/journey.test.ts`

```ts
// tests/tools/journey.test.ts: `npm run journey` (D77). Two made-up visits load into DuckDB, and each starter view answers what it
// promises: visits, the funnel, screen paths, exits, time on screens, exercises (one per visit, though sent twice) and those left
// unanswered, runs (one finish each), hour of day in Amsterdam time. A line that is not JSON is skipped and counted; a key the tool
// does not know becomes a text column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadJourney, VIEWS } from '../../tools/journey.ts';

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
  e(S1, 8, '08:04', 'exercise_submitted', { item_id: 'SQL-A-01-W01', topic: 'SQL', outcome: 'passed', hints_used: 1, answer_shown: false, confidence: 3, time_spent_s: 120 }),
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
  e(S2, 5, '18:02', 'exercise_submitted', { item_id: 'GA4-Q-01', topic: 'GA4', outcome: 'failed', confidence: 4, time_spent_s: 30 }),
  e(S2, 6, '18:02', 'exercise_failed', { item_id: 'GA4-Q-01', topic: 'GA4' }),
  e(S2, 7, '18:10', 'run_finished', { section: 'ga4', run_kind: 'mini_drill', block_id: 'B-1', score_pct: 55, run_passed: false }),
  e(S2, 8, '18:11', 'run_finished', { section: 'ga4', run_kind: 'mini_drill', block_id: 'B-1', score_pct: 55, run_passed: false }),
  e(S2, 9, '18:11', 'concept_state_changed', { concept_id: 'SQL-A-01', topic: 'SQL', state_from: 'practised', state_to: 'mastered' }),
];

async function load(lines: string[]) {
  const dir = await mkdtemp(join(tmpdir(), 'al-journey-tool-'));
  if (lines.length) await writeFile(join(dir, 'events-2026-10.jsonl'), `${lines.join('\n')}\n`);
  return loadJourney(dir, null);
}
const rows = async (db: Awaited<ReturnType<typeof load>>, sql: string) => (await db.connection.runAndReadAll(sql)).getRowObjectsJS();

test('two visits load with every starter view answering', async () => {
  const db = await load(VISITS);
  try {
    assert.deepEqual([db.events, db.skipped, db.files], [22, 1, 1]);
    const visits = await rows(db, 'SELECT minutes, screens, answers, passed, last_screen FROM sessions ORDER BY started_at');
    assert.deepEqual(visits.map((v) => [v.minutes, Number(v.screens), Number(v.answers), Number(v.passed), v.last_screen]),
      [[7, 3, 1, 1, 'map'], [11, 2, 1, 0, 'ga4_run']]);
    assert.deepEqual((await rows(db, 'SELECT step, visits FROM funnel')).map((r) => [r.step, Number(r.visits)]),
      [['opened a screen', 2], ['started studying', 2], ['answered an exercise', 2], ['passed one', 1]]);
    assert.deepEqual((await rows(db, 'SELECT from_screen, to_screen, times FROM paths')).map((r) => [r.from_screen, r.to_screen, Number(r.times)]),
      [['lesson', 'map', 1], ['today', 'ga4_run', 1], ['today', 'lesson', 1]]);
    assert.deepEqual((await rows(db, 'SELECT last_screen, visits FROM exits')).map((r) => [r.last_screen, Number(r.visits)]), [['ga4_run', 1], ['map', 1]]);
    const lessonTime = (await rows(db, "SELECT total_minutes FROM screen_time WHERE screen = 'lesson'"))[0]!;
    assert.equal(lessonTime.total_minutes, 6);
    const items = await rows(db, "SELECT item_id, visits_opened, left_unanswered FROM items WHERE item_id LIKE 'SQL-A-01-%' ORDER BY item_id");
    assert.deepEqual(items.map((i) => [i.item_id, Number(i.visits_opened), Number(i.left_unanswered)]),
      [['SQL-A-01-W01', 1, 0], ['SQL-A-01-W02', 1, 1]], 'W01 was sent twice on one open: one visit');
    const runs = await rows(db, 'SELECT run_kind, score_pct, minutes FROM runs');
    assert.deepEqual(runs.map((r) => [r.run_kind, r.score_pct, r.minutes]), [['mini_drill', 55, 9]]);
    assert.deepEqual((await rows(db, 'SELECT hour, answers FROM time_of_day')).map((r) => [Number(r.hour), Number(r.answers)]), [[10, 1], [20, 1]]);
    assert.equal((await rows(db, 'SELECT count(*) AS n FROM mastery'))[0]!.n, 1n);
    assert.deepEqual((await rows(db, 'SELECT extra_key FROM events WHERE extra_key IS NOT NULL')).map((r) => r.extra_key), ['x']);
    for (const v of VIEWS) await db.connection.run(`SELECT * FROM ${v}`);
  } finally { db.close(); }
});

test('an empty journey folder loads, and every view answers with no rows', async () => {
  const db = await load([]);
  try {
    assert.equal(db.events, 0);
    for (const v of VIEWS) await db.connection.run(`SELECT * FROM ${v}`);
  } finally { db.close(); }
});
```

  If a count comes back as a JS number rather than a `bigint` in this node-api version, the `Number(...)` wrappers already cover it. For `mastery`, compare with `Number(...)` in the same way if needed.

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/tools/journey.test.ts`
Expected: FAIL, `Cannot find module '.../tools/journey.ts'`.

- [ ] **Step 3: Write `tools/journey-views.sql`**

```sql
-- tools/journey-views.sql: the starter views `npm run journey` creates over the study journey (D77). Each is plain DuckDB SQL over
-- one table, events: one row per event, ordered by ts and seq within a visit (session_id). Read them, copy them, change them: the
-- database is rebuilt from journey/*.jsonl on every run. Times show in Amsterdam time (SET TimeZone in tools/journey.ts).

-- One row per visit: when it started, how long it lasted, what happened, and the last screen shown.
CREATE OR REPLACE VIEW sessions AS
SELECT session_id,
       min(ts) AS started_at,
       round(epoch(max(ts) - min(ts)) / 60, 1) AS minutes,
       count(*) FILTER (WHERE event = 'screen_viewed') AS screens,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       count(*) FILTER (WHERE event = 'exercise_passed') AS passed,
       count(*) FILTER (WHERE event IN ('hint_opened', 'answer_shown')) AS help_used,
       arg_max(screen, seq) FILTER (WHERE event = 'screen_viewed') AS last_screen
FROM events
GROUP BY session_id
ORDER BY started_at;

-- The visit funnel: how many visits reached each step, and the share of the first step.
CREATE OR REPLACE VIEW funnel AS
WITH per_visit AS (
  SELECT session_id,
         bool_or(event = 'screen_viewed') AS opened,
         bool_or(event IN ('lesson_started', 'item_viewed', 'run_started', 'case_opened', 'lab_opened')) AS started,
         bool_or(event = 'exercise_submitted') AS answered,
         bool_or(event = 'exercise_passed') AS passed
  FROM events
  GROUP BY session_id
), steps AS (
  SELECT 1 AS step_no, 'opened a screen' AS step, count(*) FILTER (WHERE opened) AS visits FROM per_visit
  UNION ALL SELECT 2, 'started studying', count(*) FILTER (WHERE started) FROM per_visit
  UNION ALL SELECT 3, 'answered an exercise', count(*) FILTER (WHERE answered) FROM per_visit
  UNION ALL SELECT 4, 'passed one', count(*) FILTER (WHERE passed) FROM per_visit
)
SELECT step_no, step, visits,
       round(100.0 * visits / nullif(first_value(visits) OVER (ORDER BY step_no), 0), 1) AS pct_of_first
FROM steps
ORDER BY step_no;

-- Screen to screen: how often each move happened inside a visit.
CREATE OR REPLACE VIEW paths AS
SELECT from_screen, screen AS to_screen, count(*) AS times
FROM events
WHERE event = 'screen_viewed' AND from_screen IS NOT NULL
GROUP BY ALL
ORDER BY times DESC, from_screen, to_screen;

-- Where visits end: the last screen shown in each.
CREATE OR REPLACE VIEW exits AS
SELECT last_screen, count(*) AS visits
FROM (SELECT session_id, arg_max(screen, seq) AS last_screen FROM events WHERE event = 'screen_viewed' GROUP BY session_id)
GROUP BY ALL
ORDER BY visits DESC, last_screen;

-- Time on each screen: until the next screen in the visit, or the visit's last event for its last screen.
CREATE OR REPLACE VIEW screen_time AS
WITH views AS (
  SELECT session_id, screen, ts, lead(ts) OVER (PARTITION BY session_id ORDER BY seq) AS next_view
  FROM events
  WHERE event = 'screen_viewed'
), last_event AS (
  SELECT session_id, max(ts) AS last_ts FROM events GROUP BY session_id
)
SELECT screen,
       count(*) AS views,
       round(median(epoch(coalesce(next_view, last_ts) - ts))) AS median_seconds,
       round(sum(epoch(coalesce(next_view, last_ts) - ts)) / 60, 1) AS total_minutes
FROM views JOIN last_event USING (session_id)
GROUP BY screen
ORDER BY total_minutes DESC;

-- Each exercise: the visits it was opened in, then answers, passes, times left without an answer, help used and minutes spent on
-- answers. A screen may fetch an exercise twice as it opens, and a drill sends every question at its start, so the first count is
-- of visits, not fetches: a drill's questions count as opened in its visit, reached or not.
CREATE OR REPLACE VIEW items AS
SELECT item_id,
       any_value(topic) AS topic,
       count(DISTINCT session_id) FILTER (WHERE event = 'item_viewed') AS visits_opened,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       count(*) FILTER (WHERE event = 'exercise_passed') AS passes,
       count(*) FILTER (WHERE event = 'item_closed' AND reason = 'left' AND graded_attempts = 0) AS left_unanswered,
       count(*) FILTER (WHERE event = 'hint_opened') AS hints,
       count(*) FILTER (WHERE event = 'answer_shown') AS answers_shown,
       round(sum(time_spent_s) FILTER (WHERE event = 'exercise_submitted') / 60, 1) AS answer_minutes
FROM events
WHERE item_id IS NOT NULL
GROUP BY item_id
ORDER BY visits_opened DESC, item_id;

-- Help against results: the pass rate of graded answers by hints used and whether the answer was shown first.
CREATE OR REPLACE VIEW help_and_results AS
SELECT coalesce(CAST(hints_used AS INTEGER), 0) AS hints_used,
       coalesce(answer_shown, false) AS answer_shown,
       count(*) AS answers,
       round(100.0 * count(*) FILTER (WHERE outcome = 'passed') / count(*), 1) AS pass_pct
FROM events
WHERE event = 'exercise_submitted' AND outcome IN ('passed', 'failed')
GROUP BY ALL
ORDER BY ALL;

-- Calibration: the pass rate of graded answers by the confidence given before the result (1 to 4).
CREATE OR REPLACE VIEW confidence AS
SELECT CAST(confidence AS INTEGER) AS confidence,
       count(*) AS answers,
       round(100.0 * count(*) FILTER (WHERE outcome = 'passed') / count(*), 1) AS pass_pct
FROM events
WHERE event = 'exercise_submitted' AND outcome IN ('passed', 'failed')
GROUP BY ALL
ORDER BY confidence NULLS LAST;

-- The hour of day (Amsterdam time): answers given and their pass rate.
CREATE OR REPLACE VIEW time_of_day AS
SELECT hour(ts) AS hour,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       round(100.0 * count(*) FILTER (WHERE event = 'exercise_passed')
             / nullif(count(*) FILTER (WHERE event IN ('exercise_passed', 'exercise_failed')), 0), 1) AS pass_pct
FROM events
GROUP BY ALL
HAVING count(*) FILTER (WHERE event = 'exercise_submitted') > 0
ORDER BY hour;

-- Each day: visits, answers, passes and the minutes spent on answers.
CREATE OR REPLACE VIEW days AS
SELECT CAST(ts AS DATE) AS day,
       count(DISTINCT session_id) AS visits,
       count(*) FILTER (WHERE event = 'exercise_submitted') AS answers,
       count(*) FILTER (WHERE event = 'exercise_passed') AS passed,
       round(sum(time_spent_s) FILTER (WHERE event = 'exercise_submitted') / 60, 1) AS answer_minutes
FROM events
GROUP BY ALL
ORDER BY day;

-- Concept states as they changed: new, learning, practised, mastered, retained.
CREATE OR REPLACE VIEW mastery AS
SELECT ts, concept_id, topic, state_from, state_to
FROM events
WHERE event = 'concept_state_changed'
ORDER BY ts;

-- Timed runs (GA4 drills and mocks, SQL drills): one row per run, with its first finish (a results page reloaded finishes twice).
CREATE OR REPLACE VIEW runs AS
WITH started AS (
  SELECT block_id, section, run_kind, ts AS started_at FROM events WHERE event = 'run_started'
), finished AS (
  SELECT block_id, min(ts) AS finished_at, arg_min(score_pct, ts) AS score_pct, arg_min(run_passed, ts) AS run_passed
  FROM events WHERE event = 'run_finished' GROUP BY block_id
)
SELECT section, run_kind, started_at, finished_at,
       round(epoch(finished_at - started_at) / 60, 1) AS minutes,
       score_pct, run_passed, block_id
FROM started LEFT JOIN finished USING (block_id)
ORDER BY started_at;
```

- [ ] **Step 4: Write `tools/journey.ts`**

```ts
// tools/journey.ts: `npm run journey` (owner decision D77). Loads the study journey (journey/events-*.jsonl) into DuckDB with the
// starter views in tools/journey-views.sql, then prints each one. The files are the source: journey/journey.duckdb is rebuilt on
// every run, so explore it with any DuckDB 1.5 client and never edit it.
//   npm run journey                      every starter view, 10 rows each
//   npm run journey -- --sql "<query>"   one query of your own (it cannot read or write files)
//   npm run journey -- --csv             also writes each view to journey/out/<view>.csv
// AYDINLEARNS_JOURNEY_DIR picks another folder, as for the app. No DuckDB instance here reaches the network (R17).
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyDirFrom } from '../server/journey.ts';

type ColumnType = 'VARCHAR' | 'DOUBLE' | 'BOOLEAN' | 'INTEGER';
/** The journey's known columns. Each exists even before an event uses it, so every view runs on any file. */
export const COLUMNS: Record<string, ColumnType> = {
  v: 'INTEGER', ts: 'VARCHAR', session_id: 'VARCHAR', seq: 'INTEGER', event: 'VARCHAR', app_version: 'VARCHAR',
  reason: 'VARCHAR', previous_session_id: 'VARCHAR', duration_s: 'DOUBLE', event_count: 'DOUBLE',
  screen: 'VARCHAR', from_screen: 'VARCHAR', subject_id: 'VARCHAR',
  item_id: 'VARCHAR', concept_id: 'VARCHAR', topic: 'VARCHAR', case_theme: 'VARCHAR', difficulty: 'VARCHAR', phase: 'VARCHAR', funnel_step: 'VARCHAR',
  time_spent_s: 'DOUBLE', time_target_s: 'DOUBLE', try_number: 'DOUBLE', hints_used: 'DOUBLE', answer_shown: 'BOOLEAN',
  confidence: 'DOUBLE', mode: 'VARCHAR', outcome: 'VARCHAR',
  hint_level: 'DOUBLE', review: 'BOOLEAN', graded_attempts: 'DOUBLE', passed: 'BOOLEAN', first_attempt_pass: 'BOOLEAN',
  max_hint_level: 'DOUBLE', active_s: 'DOUBLE', rating: 'DOUBLE', kind: 'VARCHAR', active_minutes: 'DOUBLE',
  section: 'VARCHAR', run_kind: 'VARCHAR', block_id: 'VARCHAR', questions: 'DOUBLE', level: 'DOUBLE', screen_mode: 'BOOLEAN',
  score_pct: 'DOUBLE', run_passed: 'BOOLEAN', case_id: 'VARCHAR', data_source: 'VARCHAR', lab_id: 'VARCHAR', card_id: 'VARCHAR',
  state_from: 'VARCHAR', state_to: 'VARCHAR',
};
export const VIEWS = ['sessions', 'funnel', 'paths', 'exits', 'screen_time', 'items', 'help_and_results', 'confidence', 'time_of_day',
  'days', 'mastery', 'runs'] as const;
const SAFE_KEY = /^[a-z][a-z0-9_]{0,62}$/;
const FILE = /^events-\d{4}-\d{2}\.jsonl$/;
const VIEWS_SQL = fileURLToPath(new URL('./journey-views.sql', import.meta.url));

export interface Loaded { connection: DuckDBConnection; close: () => void; events: number; skipped: number; files: number }

/** Reads every journey file in `dir` into a new DuckDB database (in memory when `dbPath` is null), with the starter views. */
export async function loadJourney(dir: string, dbPath: string | null): Promise<Loaded> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => FILE.test(n)).sort();
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const n of names) {
    for (const line of (await readFile(join(dir, n), 'utf8')).split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as Record<string, unknown>;
        if (r && typeof r.event === 'string' && typeof r.ts === 'string' && typeof r.session_id === 'string') rows.push(r);
        else skipped++;
      } catch { skipped++; }
    }
  }
  const columns: Record<string, ColumnType> = { ...COLUMNS };
  for (const r of rows) for (const k of Object.keys(r)) if (!(k in columns) && SAFE_KEY.test(k)) columns[k] = 'VARCHAR';
  if (dbPath) for (const p of [dbPath, `${dbPath}.wal`]) await rm(p, { force: true });
  const instance = await DuckDBInstance.create(dbPath ?? ':memory:', { autoinstall_known_extensions: 'false', autoload_known_extensions: 'false' });
  const connection = await instance.connect();
  await connection.run("SET TimeZone = 'Europe/Amsterdam'");
  const cols = Object.entries(columns);
  await connection.run(`CREATE TABLE raw_events (${cols.map(([k, t]) => `"${k}" ${t}`).join(', ')})`);
  const appender = await connection.createAppender('raw_events');
  for (const r of rows) {
    for (const [k, t] of cols) {
      const x = r[k];
      if (x === undefined || x === null) appender.appendNull();
      else if (t === 'DOUBLE') { if (typeof x === 'number' && Number.isFinite(x)) appender.appendDouble(x); else appender.appendNull(); }
      else if (t === 'INTEGER') { if (Number.isInteger(x)) appender.appendInteger(x as number); else appender.appendNull(); }
      else if (t === 'BOOLEAN') { if (typeof x === 'boolean') appender.appendBoolean(x); else appender.appendNull(); }
      else appender.appendVarchar(typeof x === 'string' ? x : JSON.stringify(x));
    }
    appender.endRow();
  }
  appender.closeSync();
  await connection.run('CREATE TABLE events AS SELECT * REPLACE (CAST(ts AS TIMESTAMPTZ) AS ts) FROM raw_events ORDER BY ts, seq');
  await connection.run('DROP TABLE raw_events');
  await connection.run(await readFile(VIEWS_SQL, 'utf8'));
  return { connection, close: () => { connection.disconnectSync(); instance.closeSync(); }, events: rows.length, skipped, files: names.length };
}

const when = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' });
const cell = (x: unknown): string =>
  x === null || x === undefined ? '' : x instanceof Date ? when.format(x) : typeof x === 'object' ? JSON.stringify(x) : String(x);

/** A query's first rows as a plain text table. */
async function table(c: DuckDBConnection, sql: string, limit: number): Promise<string> {
  const reader = await c.runAndReadAll(sql);
  const head = reader.columnNames();
  const all = reader.getRowsJS();
  const body = all.slice(0, limit).map((r) => r.map(cell));
  const width = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((x, i) => x.padEnd(width[i]!)).join('  ');
  const more = all.length > limit ? `\n(${all.length - limit} more rows)` : '';
  return [line(head), line(width.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n') + (all.length ? more : '\n(no rows)');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const appDir = fileURLToPath(new URL('../', import.meta.url));
  const dir = journeyDirFrom(process.env, appDir) ?? join(appDir, 'journey');
  const sqlAt = args.indexOf('--sql');
  const own = sqlAt >= 0 ? args[sqlAt + 1] : undefined;
  if (sqlAt >= 0 && !own) { console.error('Put your query after --sql, in quotes.'); process.exitCode = 1; return; }
  await mkdir(dir, { recursive: true });
  const dbPath = join(dir, 'journey.duckdb');
  const db = await loadJourney(dir, dbPath);
  try {
    console.log(`Journey: ${db.events} events in ${db.files} file(s)${db.skipped ? `; ${db.skipped} unreadable line(s) skipped` : ''}. Database: ${dbPath}`);
    if (!db.events) { console.log('No events yet. Open the app and study: every screen, exercise and run adds to the journey.'); return; }
    if (args.includes('--csv')) {
      const out = join(dir, 'out');
      await mkdir(out, { recursive: true });
      for (const v of VIEWS) await db.connection.run(`COPY (SELECT * FROM ${v}) TO '${join(out, `${v}.csv`).replaceAll("'", "''")}' (HEADER, DELIMITER ',')`);
      console.log(`Wrote ${VIEWS.length} CSV files to ${out}`);
    }
    if (own) {
      // Aydin's own query, in this instance only: no file access and no setting changes from here on.
      await db.connection.run('SET enable_external_access = false');
      await db.connection.run('SET lock_configuration = true');
      console.log(await table(db.connection, own, 50));
      return;
    }
    for (const v of VIEWS) console.log(`\n== ${v}\n${await table(db.connection, `SELECT * FROM ${v}`, 10)}`);
  } finally { db.close(); }
}

if (import.meta.main) await main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
```

- [ ] **Step 5: Add the script.** In `package.json` `scripts`, after `"start"`, add:

```json
    "journey": "node --env-file-if-exists=.env tools/journey.ts",
```

- [ ] **Step 6: Run the tests, then the command on an empty folder**

Run: `node --test tests/tools/journey.test.ts`. Expected: PASS, 2 tests. If `DuckDBInstance.create` rejects the `':memory:'` path, use `undefined`, which the API takes for in memory.
Then run `AYDINLEARNS_JOURNEY_DIR=$(mktemp -d) npm run journey`. Expected: "Journey: 0 events in 0 file(s)..." and the "No events yet" line, exit 0.

- [ ] **Step 7: Commit**

Paths: `tools/journey.ts`, `tools/journey-views.sql`, `package.json`, `tests/tools/journey.test.ts`. Message: `aydinlearns: npm run journey, the journey in DuckDB with starter views (D77)`.

---

### Task 7: Configuration, the smoke test, docs and version 1.3.0

**Files:**
- Modify: `.gitignore`, `.env.example`
- Modify: `tests/e2e/smoke.ts`:
  - a module constant;
  - `startServer` env (line ~272);
  - a new row `J` before row `G` (line ~2691);
  - the version row that checks `1.2.0`.
- Modify: `package.json` and `package-lock.json` (version 1.3.0), `tests/server/version.test.ts`
- Modify: `README.md`, `CHANGELOG.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: release 1.3.0, ready for the PR.

- [ ] **Step 1: Ignore the journey and document its switches**
  - `.gitignore`, after the `logs/` block:

```gitignore
# The study journey (D77): local events, and the database `npm run journey` builds from them
journey/
```

  - `.env.example`, at the end:

```bash
# The study journey (D77) is kept on this computer, in journey/. AYDINLEARNS_JOURNEY=off stops it;
# AYDINLEARNS_JOURNEY_DIR keeps it in another folder.
AYDINLEARNS_JOURNEY=
AYDINLEARNS_JOURNEY_DIR=
```

- [ ] **Step 2: The smoke test writes its journey to a temporary folder and checks it**
  - In `tests/e2e/smoke.ts`, after the imports, add `const JOURNEY_DIR = join(tmpdir(), \`al-e2e-journey-${process.pid}\`);`.
  - In `startServer`, add `AYDINLEARNS_JOURNEY_DIR: JOURNEY_DIR` to the child's `env`.
  - Before `await row('G', ...)`, add:

```ts
  await row('J', 'the study journey recorded the test\'s visits in its own folder (D77)', async () => {
    const names = new Set<string>();
    for (const f of await readdir(JOURNEY_DIR).catch(() => [] as string[])) {
      for (const l of (await readFile(join(JOURNEY_DIR, f), 'utf8')).split('\n').filter(Boolean)) names.add((JSON.parse(l) as { event: string }).event);
    }
    const want = ['session_started', 'screen_viewed', 'item_viewed', 'exercise_submitted', 'hint_opened', 'run_started', 'run_finished'];
    const missing = want.filter((n) => !names.has(n));
    expect(missing.length === 0, `the journey has no ${missing.join(', ')}`);
    await rm(JOURNEY_DIR, { recursive: true, force: true });
    return `${names.size} kinds of event, including ${want.join(', ')}`;
  });
```

  - Change the version row's expected `1.2.0` to `1.3.0` (`grep -n "1\.2\.0" tests/e2e/smoke.ts`).
  - If the smoke's rows also open a case or a lab (`grep -n "api/cases/\|#/case/\|#/ga4/lab/" tests/e2e/smoke.ts`), add `case_opened` or `lab_opened` to `want`.

- [ ] **Step 3: Version 1.3.0.** Set `"version": "1.3.0"` in `package.json`, and in `package-lock.json`'s root entries, which are the two `"name": "aydinlearns"` blocks. Change the expected version in `tests/server/version.test.ts` to `1.3.0`.

- [ ] **Step 4: Docs (plain English, tables, no em dashes)**
  - `README.md`:
    - After "Study tracking with OpenTelemetry", add a section "Your study journey". It says:
      - what a visit is, and the events, as a table: the event, when it happens, and what it carries;
      - where they are kept (`journey/`, never committed), and how to turn it off (`AYDINLEARNS_JOURNEY=off`);
      - how to analyse it: `npm run journey`, `-- --sql "SELECT * FROM paths"`, `-- --csv`; the twelve starter views, one line each; and that the database opens in any DuckDB 1.5 client;
      - what is never kept: text, queries, answers, notes or paths.
    - In "Telemetry with OpenTelemetry (optional)", add to the "what is sent" list:
      - the journey events, as log records with `event.name` and `session.id`;
      - the counter `aydinlearns.journey.events` (labels `event`, `screen`, `topic`);
      - the histogram `aydinlearns.session.duration`.
  - `CHANGELOG.md`: a `## 1.3.0 (<release date>)` entry above 1.2.0: "The study journey (D77): every visit's screens, exercises, help, runs, cases, labs and concept states, kept locally and sent with telemetry when it is on; `npm run journey` loads it into DuckDB with twelve starter views."
  - `CLAUDE.md`:
    - in "Locked decisions", a row "Study journey (D77, 2026-10-13)":
      - `server/journey.ts`, `server/journey-tap.ts`, `POST /api/journey` (screens only, no study session) and `tools/journey.ts`;
      - the visit with a 30-minute idle end, apart from the study session;
      - `journey/` on by default and gitignored, `AYDINLEARNS_JOURNEY=off`;
      - IDs, counts, times and outcomes only;
      - `session.id` and item IDs never on a metric.
    - Change the version line to "Release 1.3 (<date>) added the study journey (D77). The app's version is in `package.json` (1.3.0)".

- [ ] **Step 5: Run every gate**

Run, in order:
1. `npm run typecheck` (expected: 0 errors).
2. `npm test` (expected: all pass; the count is the 1954 from before the branch plus the new tests).
3. `npm run check:imports` (expected: clean).
4. `AYDINLEARNS_PORT=5184 npm run test:e2e` (expected: 64 of 64 rows, row J included, 0 page errors).
5. A manual run on 5184 with a temporary `AYDINLEARNS_JOURNEY_DIR`: open Today, a lesson, one exercise with a hint, then a GA4 mini drill. Stop the app with Ctrl+C, then run `npm run journey` against that folder. Expected: two or more screens in `paths`, the exercise in `items`, the run in `runs`, and `session_ended` with reason `app_stop` in the file.

- [ ] **Step 6: Commit**

Paths:
- `.gitignore`, `.env.example`
- `tests/e2e/smoke.ts`
- `package.json`, `package-lock.json`, `tests/server/version.test.ts`
- `README.md`, `CHANGELOG.md`, `CLAUDE.md`

Message: `aydinlearns: release 1.3, the study journey (D77)`.

---

## After the plan (each step needs the owner's go when it comes)

| Step | What |
|---|---|
| PR | Push `feat/aydinlearns-journey`, open the PR, wait for Codex, verdict each comment (review-findings), fix, merge |
| Owner checkout | Fast-forward `C:\zehirlab` to the merge; restart the app, so the journey starts |
| Dash0 | Add a "Journey" section to the dashboard "aydinlearns: my study" (visits, average visit length, events by kind over time, screens shown, exercises left unanswered) with a PUT to `/api/dashboards/aydinlearns-study`. Check each query against live data first |
| Public release | `tools/export-public.sh`, a secret scan, push, tag `v1.3.0` with notes; a fresh install on 5194 |
| Record | The 1.3 release record goes into the sprint 6 branch, as before |

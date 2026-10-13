// server/journey.ts: the study journey (owner decision D77, 2026-10-13). Every event the app records about a visit goes through
// journey():
// - one line in the local journey file (journey/events-YYYY-MM.jsonl, which `npm run journey` loads into DuckDB);
// - when telemetry is on (D75), one OpenTelemetry log record named by event.name with session.id, and one count on
//   aydinlearns.journey.events;
// - session.id on the request's span.
// A visit (a journey session) starts at its first event and ends after 30 idle minutes or when the app stops. It is the journey's
// own: the app's study session (server/session.ts) is never touched here. Events carry IDs, counts, times and outcomes only, never
// an item's text, a query, an answer, a note or personal data. Nothing here may fail a request. Every error is caught, and a line
// that cannot be written is dropped with one console line per run; the next event tries the file again.
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { metrics, ROOT_CONTEXT, trace } from '@opentelemetry/api';
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
let warned = false;

type Env = Record<string, string | undefined>;
/** AYDINLEARNS_JOURNEY's words: off (and the usual negatives) stops the file; blank, on and the usual positives keep it. */
const OFF = new Set(['off', 'false', '0', 'no']);
const ON = new Set(['', 'on', 'true', '1', 'yes']);
const setting = (env: Env): string => env.AYDINLEARNS_JOURNEY?.trim().toLowerCase() ?? '';

/** The journey folder, whether the journey is on or off: AYDINLEARNS_JOURNEY_DIR, else <app>/journey. `npm run journey` reads it. */
export function journeyFolder(env: Env, appDir: string): string {
  return resolve(env.AYDINLEARNS_JOURNEY_DIR?.trim() || join(appDir, 'journey'));
}

/**
 * The folder the app writes its journey to, or null for none: when AYDINLEARNS_JOURNEY is off (or false, 0 or no), and when the
 * server runs on a temporary logs folder (AYDINLEARNS_LOGS_DIR, a test server) with no AYDINLEARNS_JOURNEY_DIR of its own, so a
 * test server's made-up visits never reach the real journey/.
 */
export function journeyDirFrom(env: Env, appDir: string): string | null {
  if (OFF.has(setting(env))) return null;
  if (env.AYDINLEARNS_LOGS_DIR && !env.AYDINLEARNS_JOURNEY_DIR?.trim()) return null;
  return journeyFolder(env, appDir);
}

/** A line for the console when AYDINLEARNS_JOURNEY holds a word that is neither on nor off, which leaves the journey on; else null. */
export function journeySettingNote(env: Env): string | null {
  const s = setting(env);
  if (ON.has(s) || OFF.has(s)) return null;
  return `AYDINLEARNS_JOURNEY is "${env.AYDINLEARNS_JOURNEY!.trim()}", which is neither on nor off, so the journey file stays on. Set it to off to stop it.`;
}

/** Starts the journey (main.ts; tests restart it). No visit is open until the first event. Before it, events go to telemetry only. */
export function startJourney(o: JourneyOptions): void {
  dir = o.dir;
  now = o.now ?? (() => new Date());
  idleMs = o.idleMs ?? IDLE_MS;
  visit = null;
  lastScreen = null;
  writes = Promise.resolve();
  warned = false;
}

/**
 * Ends the open visit and waits for the file writes. A concept-state look the log tap deferred before the stop runs first, so its
 * change joins the visit. The visit ends as idle when its last event was over 30 minutes ago (the learner walked away and the app
 * kept running), else as app_stop. After the stop nothing reaches the file, as before startJourney(): a late event goes to
 * telemetry only.
 */
export async function stopJourney(): Promise<void> {
  await new Promise<void>((done) => setImmediate(done));
  try {
    if (visit) close(visit, now().getTime() - visit.last > idleMs ? 'idle' : 'app_stop');
  } catch { /* the journey never stops the app */ }
  visit = null;
  dir = null;
  await writes;
}

/**
 * One event of the current visit. A new visit opens first when none is open or the last event was over 30 minutes ago. `at` is
 * when the app logged it (the log tap passes the record's own time), else now: what an idle end writes 30 minutes on carries the
 * last activity, so it joins that visit and does not stretch it. A time ahead of now, or none, is now; and an event never
 * precedes its visit's latest event, so ordered by time and then seq a visit reads in the order its events were sent (a state
 * change an answer causes comes after the answer's funnel steps, though the attempt's submitted_at is earlier).
 */
export function journey(event: JourneyEventName, attributes: JourneyAttributes = {}, at?: Date): void {
  try {
    const t = now();
    const when = at && at.getTime() <= t.getTime() ? at : t;
    const v = current(when);
    emit(v, event, attributes, new Date(Math.max(when.getTime(), v.last)), true);
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

/** The visit's end, stamped with its last activity. It is not the current request's, so it takes neither its span nor its trace. */
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
    attributes: { ...attrs, 'session.id': v.id, 'session.seq': v.seq }, ...(onSpan ? {} : { context: ROOT_CONTEXT }) });
  metrics.getMeter('aydinlearns').createCounter('aydinlearns.journey.events', { description: 'Study journey events', unit: '{event}' })
    .add(1, { event, ...pick(attrs, 'screen'), ...pick(attrs, 'topic') });
}

/**
 * Appends one line, in order. A line that cannot be written is dropped, and the first such line of a run prints one console line
 * (the code only, never a path). The next event tries again, so a file another program holds for a moment costs only the lines
 * written meanwhile, and a folder that stays unwritable costs one failed write per event.
 */
function append(folder: string, r: JourneyRecord): void {
  const file = join(folder, `events-${r.ts.slice(0, 7)}.jsonl`);
  const line = `${JSON.stringify(r)}\n`;
  writes = writes.then(async () => {
    await mkdir(folder, { recursive: true });
    await appendFile(file, line, 'utf8');
  }).catch((e: unknown) => {
    if (warned) return;
    warned = true;
    console.log(`aydinlearns: journey: an event could not be written to the journey folder (${(e as NodeJS.ErrnoException).code ?? 'error'}). Later events try again; telemetry, when on, still gets them.`);
  });
}

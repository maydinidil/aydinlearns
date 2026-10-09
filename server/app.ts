// server/app.ts: the local web app's routes (design §11, §13, §18). Every /api response is JSON.
// SQL key material leaves the server only in logged cases: `diff` after a submission, "show answer", and hint 3.
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { SCHEMA_VERSION, type BlockClose, type CloseReason, type Exposure, type ItemClose, type Phase, type Section } from '../core/envelope.ts';
import type { CardEvent, ExternalGa4Exam, ExternalPortfolioPiece, SettingChange } from '../core/events.ts';
import { amsterdamDate } from '../core/time.ts';
import type { RunnerClient, RunnerReq, RunnerResult } from './runner/client.ts';
import type { DisplayOk } from './runner/protocol.ts';
import { targetOf, type ContentStore } from './content.ts';
import type { AttemptLogger } from './log.ts';
import type { SessionTracker } from './session.ts';
import type { Check } from './selfcheck.ts';
import type { TableNote } from '../schemas/schema-notes.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import type { AydinAttempt } from '../schemas/log-ext.ts';
import { securityMiddleware } from './security.ts';
import { APP_VERSION } from './version.ts';
import { grade, revealReference, GRADER_VERSION } from './grader/grade.ts';
import { curriculumStates, pendingRetests } from './progress.ts';
import { backupLogs } from './backup.ts';
import type { ReplayResult } from '../core/replay.ts';
import type { LearnerState } from './state.ts';
import { Servings, type Serving } from './servings.ts';
import { mountToday } from './routes/today.ts';
import { mountDrill } from './routes/drill.ts';
import { mountChoice } from './routes/choice.ts';
import { pretestItemIds } from './session-composer.ts';
import { mountCp4 } from './routes/cp4.ts';
import { mountCases } from './routes/cases.ts';
import { mountSections } from './routes/sections.ts';
import { mountRun } from './routes/run.ts';
import { mountMistakes } from './routes/mistakes.ts';
import { mountPortfolio, uncProblem } from './routes/portfolio.ts';
import { mountProgress } from './routes/progress.ts';
import { mountLabs } from './routes/labs.ts';
import { mountExplore, EXPLORE_RUN_PATH } from './routes/explore.ts';
import { HELP_WAITS, NO_DRILLS, RUN_OVER, type DrillGate, type DrillRuns } from './drill.ts';

/**
 * The settings replayed from the events file (server/main.ts). `portfolio_folder` (D35, log version 4) is set by main.ts; it is
 * optional here so a test's settings may leave it out, which reads as not set. The settings route takes it (Task D4).
 */
export interface Settings { backup_folder: string | null; exam_date: string | null; goal_dates: Record<string, string>; portfolio_folder?: string | null }
export type BackupResult = Awaited<ReturnType<typeof backupLogs>>;
export interface AppDeps {
  port: number;
  devOrigin?: string;
  checks: Check[];
  runner: RunnerClient | null;
  content: ContentStore;
  logger: AttemptLogger;
  session: SessionTracker;
  /**
   * Run in order when a session ends (the tracker's onEnd), with the session's end time. Route modules may push
   * their own when they mount; the app pushes its own after them, so theirs run first. The app's closes the open
   * instances at that time, writes the missing block closes and the due leech resets, and backs up the log. They
   * run inside the tracker's queue, so none may call the tracker.
   */
  endHooks: ((at: Date) => Promise<void>)[];
  /**
   * Every item_instance_id the attempt files already name (loggedInstanceIds in main.ts). A restart
   * ends the session, so a request for one of them gets the same 409 as an instance closed in this run.
   */
  closedInstances: Iterable<string>;
  schemaNotes: TableNote[];
  manifest: { dataset_version: string; library_version: string };
  settings: Settings;
  /**
   * The table check the runner was started with (startRunner's useParseTree). With 'text', every
   * logged attempt carries CHK-TABLE-CHECK-TEXT, including outcomes that end at the learner's display,
   * where no gate reply reports it.
   */
  tableCheck: 'parse_tree' | 'text';
  distDir?: string;
  /** The learner state (server/state.ts): built from the logs at startup, then mirrored from every write (Task B7). */
  state: LearnerState;
  /** What the server served. main.ts leaves it out and the app makes one; a test passes its own to serve items. */
  servings?: Servings;
}

/**
 * What a route module gets (Tasks B13, B14, C1). Each module mounts its own paths. A module that must close its own
 * instances at a session end pushes onto `endHooks` when it mounts; its hook runs before the app's.
 * `writeClose` closes an instance that is open, or that the server served and nobody opened (a drill item never
 * reached, S2-42; an SQL or a choice item), rated like every other close (S2-15). It waits for an override being written,
 * as /api/item-close does. It writes every live run_end close; startup recovery writes the run_end closes of a run a crash
 * left open.
 * `openInstance` (Task C1) opens an instance of an item the app's own routes do not grade (a GA4 or Methodology item) in
 * the app's instance map, so a session end closes it, and its records name what a recovered close needs, like any other.
 */
export interface RouteDeps extends AppDeps {
  state: LearnerState;
  servings: Servings;
  writeClose: (id: string, reason: CloseReason, at?: Date) => Promise<void>;
  openInstance: (id: string, meta: InstanceMeta) => OpenInstance;
}
/**
 * The instance's item and target concept, its section, the phase it takes when the server did not serve it (a serving's
 * phase, block and repeat flag always win; without a serving in force, a phase only a serving gives is 'free', S2-98), and
 * when the item was first shown, which moves the start back, never forward.
 */
export interface InstanceMeta { item_id: string; target_concept_id: string; phase: Phase; section: Section; started_at?: string }
/** A route module's view of an instance it opened. The note steps are the ones the app's routes and recovery use. */
export interface OpenInstance {
  readonly phase: Phase;
  readonly block_id: string | null;
  readonly repeat_exposure: boolean;
  readonly started: number;          // ms
  readonly submitted: number;        // logged submissions
  readonly solutionViewed: boolean;
  /** Counts a logged submission. Called before the write's first await, it also claims the instance's next answer. */
  noteSubmission(graded: boolean, pass: boolean): void;
  noteSolution(): void;
}

/** One open item instance. The server tracks the help history so every record carries the truth, whatever the browser sends. */
interface Instance {
  itemId: string;
  conceptId: string;
  phase: Phase | null;              // the first phase a request names; null until one does
  blockId: string | null;           // from the serving (S2-32, S2-46); null for an instance the server did not serve
  repeatExposure: boolean;          // from the serving (design §12, the pool fallback)
  cardId: string | null;            // from the serving: the mistake card it reviews (D28), copied onto every attempt
  screenMode: boolean;              // from the serving (D41, S4B-22): graded in screen mode and logged as such; never from a browser
  started: number;                  // ms; moved back to the browser's started_at when a request brings an earlier one
  submitted: number;                // logged submissions, crashes included: submission_no is a raw counter
  graded: number;
  maxHint: 0 | 1 | 2 | 3;
  revealedBeforeAttempt: boolean;   // hint 3 or "show answer" before the first graded attempt
  solutionViewed: boolean;
  passed: boolean;
  firstAttemptPass: boolean;
  lastGraded: AydinAttempt | null;
}

const PHASES: Phase[] = ['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block', 'retest', 'review', 'mixed', 'drill', 'case', 'free', 'mock', 'opener_preview'];
const CLOSE_REASONS: CloseReason[] = ['pass', 'left', 'session_end', 'run_end'];
const EXPOSURE_KINDS: Exposure['kind'][] = ['reading', 'worked_example', 'lesson', 'micro_lesson', 'refresher'];
const SETTING_KEYS: SettingChange['key'][] = ['backup_folder', 'exam_date', 'goal_dates', 'portfolio_folder'];
const SLICE_FOR_LEVEL: Record<number, string> = { 1: '1a', 2: '1b', 3: '3', 4: '5', 5: '6', 6: '7', 7: 'after the first applications' };
const DISPLAY_CAP = 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOG_FAILED: Check = { name: 'log writable', ok: false, detail: 'A log write failed, so grading is paused. Check the disk and the logs folder, then restart the app.' };
const CLOSED = 'This exercise is closed. Leave it and open it again.';
/** Requests that only read: they never start a session (Task B13). */
const READS: ReadonlySet<string> = new Set(['GET', 'HEAD']);

type HiddenItemField = 'hints' | 'subgoals' | 'why_this_works' | 'starter_error_id' | 'faded_shape' | 'faded_suffix' | 'options';
/** S4-11: the item view says only whether the key holds an "other ways" entry (Task D1), never its text: that comes from /api/other-way. */
type ItemViewFields = Omit<SqlItem, HiddenItemField> & Partial<Pick<SqlItem, 'faded_shape' | 'faded_suffix'>> & { has_other_way: boolean };
/**
 * What /api/items sends (Task B13). Never the hints (hints 1 and 2 come from /api/hint, which logs them), the subgoal labels,
 * "why this works" (the grade shows it after a pass) or a fix item's starter_error_id (it names the mistake to look for). The
 * faded shape and suffix only for the stage that shows them (?stage=1 or 2), so a blank editor gives nothing away. Never an
 * SQL choice item's options (Task C4): their source order and misconception IDs tell the answer; /api/choice shuffles them.
 */
export function publicItem(item: SqlItem, stage: string | undefined, hasOtherWay = false): ItemViewFields {
  const { hints: _hints, subgoals: _subgoals, why_this_works: _why, starter_error_id: _error, options: _options, faded_shape, faded_suffix, ...rest } = item;
  const view = { ...rest, has_other_way: hasOtherWay };
  return stage === '1' || stage === '2' ? { ...view, faded_shape, faded_suffix: faded_suffix ?? null } : view;
}

type Body = Record<string, unknown>;
const refuse = (status: 400 | 404 | 409 | 503, message: string, code?: string): HTTPException =>
  Object.assign(new HTTPException(status, { message }), code === undefined ? {} : { code });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A YYYY-MM-DD that is a real calendar day: 2026-02-30 does not survive a trip through Date.UTC. */
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

async function readBody(c: Context): Promise<Body> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!isRecord(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b;
}
/** A non-empty string field, or a 400. */
function text(b: Body, field: string): string {
  const v = b[field];
  if (!isText(v)) throw refuse(400, `${field} is missing.`);
  return v;
}

/** Why a setting value is refused, or null when it is fine. */
function settingProblem(key: SettingChange['key'], value: unknown): string | null {
  if (key === 'backup_folder') return value === null || (typeof value === 'string' && isAbsolute(value)) ? null : 'Use a full folder path, such as D:\\Backups.';
  // S4B-19: validated like the backup folder. Whether it exists is checked when an export runs (routes/portfolio.ts).
  if (key === 'portfolio_folder') return uncProblem(value) ?? (value === null || (typeof value === 'string' && isAbsolute(value)) ? null : 'Use a full folder path, such as D:\\Portfolio.');
  if (key === 'exam_date') return value === null || isDate(value) ? null : 'Use a date like 2026-11-20.';
  return isRecord(value) && Object.values(value).every((v) => v === '' || isDate(v)) ? null : 'Goal dates must be dates like 2026-11-20.';
}

/** The external result's kind with its data in that kind's declared shape (a union on `kind` since log version 4), or null. */
function externalData(kind: unknown, d: unknown): Pick<ExternalGa4Exam, 'kind' | 'data'> | Pick<ExternalPortfolioPiece, 'kind' | 'data'> | null {
  if (!isRecord(d)) return null;
  if (kind === 'ga4_exam') return isDate(d.date) && typeof d.score === 'number' && Number.isFinite(d.score) && typeof d.passed === 'boolean' ? { kind, data: { date: d.date, score: d.score, passed: d.passed } } : null;
  if (kind === 'portfolio_piece') return isText(d.title) && isText(d.data_source) && typeof d.real_data === 'boolean' ? { kind, data: { title: d.title, data_source: d.data_source, real_data: d.real_data } } : null;
  return null;
}

/**
 * The runner, watched for one grading run: notes whether any reply reported the text table check,
 * which only runs under --no-parse-tree. Only gate replies carry tableCheck, and the grader asks for
 * one only after the learner's display has run, so this misses outcomes that end at the display.
 * AppDeps.tableCheck covers those; this is a cross-check on the declared mode.
 */
function watchTableCheck(runner: RunnerClient): { runner: RunnerClient; sawText: () => boolean } {
  let usedText = false;
  return {
    runner: {
      get restarts() { return runner.restarts; },
      close: () => runner.close(),
      request: async <T>(req: RunnerReq): Promise<RunnerResult<T>> => {
        const r = await runner.request<T>(req);
        if (r.ok && isRecord(r.data) && r.data.tableCheck === 'text') usedText = true;
        return r;
      },
    },
    sawText: () => usedText,
  };
}

const newInstance = (itemId: string, conceptId: string, started: number): Instance => ({ itemId, conceptId, phase: null, blockId: null, repeatExposure: false, cardId: null, screenMode: false, started,
  submitted: 0, graded: 0, maxHint: 0, revealedBeforeAttempt: false, solutionViewed: false, passed: false, firstAttemptPass: false, lastGraded: null });
const phaseOf = (p: unknown): Phase | null => (PHASES.includes(p as Phase) ? (p as Phase) : null);
/**
 * Phases only the server hands out, through a serving: review and case (/api/serve), mixed (/api/mixed/start), drill (the
 * drill start and a GA4 mini drill's) and mock (a GA4 half-mock's, Task B2). A browser naming one for an instance the server did not serve in this session (an old id after a session
 * end, or a typed request) gets 'free': graded, but never rated as a review, a drill or a block member, and never a
 * qualifying solve (Task B15 follow-up). free, the lesson phases and retest stay as the browser names them.
 */
const SERVED_ONLY: ReadonlySet<Phase> = new Set(['review', 'mixed', 'drill', 'case', 'mock']);
const browserPhase = (p: unknown): Phase | null => { const x = phaseOf(p); return x !== null && SERVED_ONLY.has(x) ? 'free' : x; };
/**
 * What a version 2 help record names (D4): the item, its target concept, and the instance's phase so far ('free' when no
 * request has named one yet). Startup recovery closes a help-only instance from these.
 */
const helpFields = (i: Instance): { item_id: string; target_concept_id: string; phase: Phase } =>
  ({ item_id: i.itemId, target_concept_id: i.conceptId, phase: i.phase ?? 'free' });
/** D33: a help record names the mistake card the instance reviews, so replay can rate it when there is no attempt. Absent otherwise. */
const cardField = (i: Instance | null): { card_id?: string } => (i?.cardId ? { card_id: i.cardId } : {});

// The steps of an instance's help and grading history. The routes and the startup recovery both go through them,
// so a close written after a restart says what the live close would have said.
function noteHint(i: Instance, level: 1 | 2 | 3): void {
  i.maxHint = Math.max(i.maxHint, level) as 0 | 1 | 2 | 3;
  if (level === 3 && i.graded === 0) i.revealedBeforeAttempt = true;
}
function noteSolution(i: Instance): void {
  i.solutionViewed = true;
  if (i.graded === 0) i.revealedBeforeAttempt = true;
}
/** A logged submission. A crash counts as submitted but not graded (design §18). */
function noteSubmission(i: Instance, graded: boolean, pass: boolean): void {
  i.submitted++;
  if (graded) i.graded++;
  if (pass && !i.passed) { i.passed = true; i.firstAttemptPass = i.graded === 1 && i.maxHint === 0 && !i.revealedBeforeAttempt; }
}
/** The instance's item_close, stamped `at`; its active time runs from the instance's start to `at`. */
function closeRecord(id: string, i: Instance, reason: CloseReason, at: Date): ItemClose {
  return { record: 'item_close', schema_version: SCHEMA_VERSION, ts: at.toISOString(), item_instance_id: id, item_id: i.itemId,
    target_concept_id: i.conceptId, phase: i.phase ?? 'free', block_id: i.blockId, reason,
    raw_outcome: { graded_attempts: i.graded, passed: i.passed, first_attempt_pass: i.firstAttemptPass, max_hint_level: i.maxHint,
      revealed_before_attempt: i.revealedBeforeAttempt, active_ms: Math.max(0, at.getTime() - i.started) },
    instance_rating: null, card_reviews: [] };
}

/** The fields of the attempt files that startup recovery reads. */
interface LoggedRecord {
  record?: string; item_instance_id?: string; item_id?: string; target_concept_id?: string; phase?: string; session_id?: string;
  started_at?: string; submitted_at?: string; ts?: string; outcome?: string; grading_source?: string; level?: unknown;
  block_id?: unknown; repeat_exposure?: unknown;
}
const isHelp = (r: LoggedRecord): boolean => r.record === 'hint_opened' || r.record === 'solution_opened';

/**
 * Startup recovery (design §13): the item_close a session end would have written for every instance that has no close.
 * - An instance with attempts takes its item, concept, phase, block and repeat flag from its first attempt. Its close is stamped with the end
 *   of the session its attempts belong to (`sessionEnds`, from SessionTracker.recover).
 * - A help-only instance (D4, S2-17) is seeded from its version 2 help records, which name the item, the concept and the
 *   phase. It takes the phase of its latest help record: the live instance's phase once a request named one. Help records
 *   name no session, so its close is stamped with the end of the session whose window (`events`' session starts) holds
 *   its last record, as the live session end would have closed it (S2-85); with its own last record when no window
 *   does. Version 1 help records name no item, so a help-only instance from before version 2 stays unrecoverable.
 * Each instance's attempts, hints and reveals are then replayed in log order through the same steps the routes use, and a
 * close never comes before the instance's own records.
 */
export function recoveredCloses(records: object[], sessionEnds: ReadonlyMap<string, string>, events: object[]): ItemClose[] {
  const recs = records as LoggedRecord[];
  const sessions = (events as { event?: unknown; phase?: unknown; session_id?: unknown; ts?: unknown }[])
    .filter((e) => e.event === 'session' && e.phase === 'start' && typeof e.session_id === 'string' && typeof e.ts === 'string')
    .map((e) => ({ start: e.ts as string, end: sessionEnds.get(e.session_id as string) ?? null }));
  const done = new Set(recs.filter((r) => r.record === 'item_close').map((r) => r.item_instance_id));
  const pending = new Map<string, { i: Instance; session: string; last: number; helpOnly: boolean }>();
  for (const r of recs) {
    const id = r.item_instance_id;
    const started = Date.parse(r.started_at ?? '');
    if (r.record !== 'attempt' || !id || done.has(id) || pending.has(id) || !r.item_id || !r.target_concept_id || Number.isNaN(started)) continue;
    const i = newInstance(r.item_id, r.target_concept_id, started);
    i.phase = phaseOf(r.phase);
    i.blockId = typeof r.block_id === 'string' ? r.block_id : null;          // a recovered close names the block its attempts named
    i.repeatExposure = r.repeat_exposure === true;
    pending.set(id, { i, session: '', last: i.started, helpOnly: false });
  }
  for (const r of recs) {
    const id = r.item_instance_id;
    const at = Date.parse(r.ts ?? '');
    if (!isHelp(r) || !id || done.has(id) || pending.has(id) || !r.item_id || !r.target_concept_id || Number.isNaN(at)) continue;
    pending.set(id, { i: newInstance(r.item_id, r.target_concept_id, at), session: '', last: at, helpOnly: true });
  }
  for (const r of recs) {
    const o = r.item_instance_id ? pending.get(r.item_instance_id) : undefined;
    if (!o) continue;
    const at = Date.parse(r.ts ?? r.submitted_at ?? '');
    if (at > o.last) o.last = at;
    if (o.helpOnly && isHelp(r)) o.i.phase = phaseOf(r.phase) ?? o.i.phase;
    if (r.record === 'hint_opened' && (r.level === 1 || r.level === 2 || r.level === 3)) noteHint(o.i, r.level);
    else if (r.record === 'solution_opened') noteSolution(o.i);
    else if (r.record === 'attempt') {
      const started = Date.parse(r.started_at ?? '');
      if (started < o.i.started) o.i.started = started;
      if (r.session_id) o.session = r.session_id;
      if (r.grading_source === 'override') o.i.passed = true;              // as /api/override: a pass, never a first-attempt one
      else noteSubmission(o.i, r.outcome !== 'crash', r.outcome === 'pass');
    }
  }
  return [...pending].map(([id, o]) => {
    const end = o.helpOnly ? sessionEndAt(sessions, o.last) ?? NaN : Date.parse(sessionEnds.get(o.session) ?? '');
    // A drill run left open ended with its session (S2-16), so its items close as the run's end closes them (S2-42); a half-mock's
    // too (S3-09).
    const reason: CloseReason = (o.i.phase === 'drill' || o.i.phase === 'mock') && o.i.blockId !== null ? 'run_end' : 'session_end';
    return closeRecord(id, o.i, reason, new Date(end >= o.last ? end : o.last));   // a close never comes before its own records
  });
}

/**
 * S2-85: the end of the session whose window holds `t`, the window SessionTracker.recover dates a recovered end from:
 * from the session's start up to the next session's start. Null when no window holds `t`, or that session has no end.
 */
function sessionEndAt(sessions: readonly { start: string; end: string | null }[], t: number): number | null {
  let holder: { start: number; end: string | null } | null = null;
  for (const s of sessions) {
    const start = Date.parse(s.start);
    if (start <= t && (holder === null || start >= holder.start)) holder = { start, end: s.end };
  }
  const end = Date.parse(holder?.end ?? '');
  return Number.isNaN(end) ? null : end;
}

/**
 * S2-16: the block_close of every block whose instances have closed and that has none yet. Each is stamped `at` (a
 * session end). At startup (`at` null) it is stamped with the end of the session whose window holds its last instance
 * close, as that session's end would have closed it (S2-85), or with that close when no window does. A block never
 * closes before its items.
 */
export function blockClosesDue(r: ReplayResult, at: Date | null): BlockClose[] {
  const out: BlockClose[] = [];
  for (const [block_id, b] of r.blocks) {
    if (b.closed_at !== null) continue;
    const closes = b.instance_ids.map((id) => Date.parse(r.instances.get(id)?.closed_at ?? '')).filter((t) => !Number.isNaN(t));
    if (!closes.length) continue;
    const last = Math.max(...closes);
    const ts = Math.max(last, (at ? at.getTime() : sessionEndAt(r.sessions, last)) ?? -Infinity);
    out.push({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: new Date(ts).toISOString(), block_id, card_reviews: [] });
  }
  return out;
}

/** S2-27 and S2-28: a leech card's reset, stamped when replay says it is due (design §13: rating 0, state New, due at its own time). */
export function resetEvent(p: ReplayResult['pendingResets'][number]): CardEvent {
  return { event: 'card_event', schema_version: SCHEMA_VERSION, ts: p.due_at_session_end, card_id: p.card_id, kind: 'reset', rating: 0, state: 'New', due: p.due_at_session_end };
}

export function createApp(d: AppDeps): Hono {
  const app = new Hono();
  const instances = new Map<string, Instance>();
  const closed = new Set<string>(d.closedInstances);      // item_close is written once per instance (design §13)
  const servings = d.servings ?? new Servings();
  // Instances whose override attempt is being written, each with a promise that settles (never rejects) once the
  // write has landed or the claim has been given back. A submission or a close on the instance waits for it (aydinlearns F4).
  const overriding = new Map<string, Promise<void>>();
  const degraded = d.checks.some((c) => !c.ok);
  const now = () => new Date().toISOString();
  let endBackup: BackupResult | null = null;
  /** The drill runner (Task B14): set when the drill routes mount below; the routes here ask it at request time. */
  let drills: DrillGate = NO_DRILLS;

  const itemOf = (b: Body): SqlItem => {
    const item = d.content.item(String(b.item_id));
    if (!item) throw refuse(404, 'Unknown item.');
    return item;
  };
  const keyOf = (item: SqlItem): SqlKey => {
    const key = d.content.key(item.id);
    if (!key) throw refuse(404, 'This item has no answer key.');
    return key;
  };
  const runnerOf = (): RunnerClient => {
    if (!d.runner) throw refuse(503, 'The SQL runner is not running. See the setup screen.');
    return d.runner;
  };
  /**
   * A serving's phase, block and repeat flag are the server's truth (S2-39, S2-46): a browser's phase never replaces them. So is its
   * mistake card (D28) and its screen mode (D41, S4B-22): only a serving names them.
   */
  const applyServing = (i: Instance, s: Serving): void => {
    i.phase = s.phase;
    i.blockId = s.block_id;
    i.repeatExposure = s.repeat_exposure;
    i.cardId = s.card_id ?? null;
    i.screenMode = s.screen_mode === true;
  };
  /**
   * The open instance with this id, opened on first use. Every request that opens one (submit, hint, show answer,
   * close) may name the phase, which the first naming request fixes, and `started_at`, the time the browser first
   * showed the item, which moves the start back but never forward. An instance the server served takes its phase,
   * block and repeat flag from the serving instead; any other instance never gets a phase only a serving gives (SERVED_ONLY).
   */
  const open = (id: string, item: SqlItem, b: Body): Instance => {
    if (closed.has(id)) throw refuse(409, CLOSED);
    const served = servings.get(id);
    let i = instances.get(id);
    if ((served && served.item_id !== item.id) || (i && i.itemId !== item.id)) throw refuse(400, 'This item instance belongs to another item.');
    if (!i) {
      i = newInstance(item.id, item.target_concept_id, Date.now());
      instances.set(id, i);
    }
    if (served) applyServing(i, served);
    else i.phase ??= browserPhase(b.phase);
    const browserStart = typeof b.started_at === 'string' ? Date.parse(b.started_at) : NaN;
    if (browserStart < i.started) i.started = browserStart;
    return i;
  };
  /**
   * `at` is the session end for a close the end writes, so the record carries that time, not the time of writing.
   * Every close is rated by a replay that includes it (S2-15), so the record says what any later replay says.
   */
  const writeClose = async (id: string, i: Instance, reason: CloseReason, at = new Date()): Promise<void> => {
    instances.delete(id);
    closed.add(id);
    if (i.blockId === null) servings.forget(id);             // a block's servings stay listed until the block closes
    const write = d.logger.itemClose(d.state.rateClose(closeRecord(id, i, reason, at), at));
    // Codex F21: a mistake card's review stays reserved until its close is in the log and the state, so it is not served twice.
    if (i.cardId !== null) servings.closingCard(i.cardId, write);
    await write;
    if (i.blockId !== null && i.phase === 'mixed') await endMixedBlockAfter(id, i.blockId, at);
  };
  // S2-16: a mixed block ends when its last item closes. Each member's close time once it is in the log, and the blocks already
  // ended, so a block ends once, after every close: the check runs after this close's write and is claimed before the next await.
  const blockCloseLogged = new Map<string, number>();
  const endedBlocks = new Set<string>();
  const endMixedBlockAfter = async (id: string, block: string, at: Date): Promise<void> => {
    blockCloseLogged.set(id, at.getTime());
    const members = servings.blockMembers(block);
    if (endedBlocks.has(block) || !members.every((m) => blockCloseLogged.has(m))) return;
    endedBlocks.add(block);
    const ts = new Date(Math.max(...members.map((m) => blockCloseLogged.get(m)!)));   // never before one of its items
    await d.logger.blockClose(d.state.rateBlockClose({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: ts.toISOString(), block_id: block, card_reviews: [] }, ts));
    for (const m of members) { servings.forget(m); blockCloseLogged.delete(m); }    // the block is over; its members are closed
  };
  const backup = (): Promise<BackupResult> => (d.settings.backup_folder
    ? backupLogs(d.logger.dir, d.settings.backup_folder)
    : Promise.resolve({ ok: false, error: 'No backup folder chosen yet.' }));
  /**
   * RouteDeps.writeClose: closes an open instance, or one the server served and nobody opened (no active time), of an SQL
   * or a choice item (its target from targetOf: a 10 GA4 concept's item closes on its 06 parent, S2-74).
   */
  const closeById = async (id: string, reason: CloseReason, at = new Date()): Promise<void> => {
    if (closed.has(id)) return;                                   // one close per instance (design §13)
    // As /api/item-close: wait for an override being written, so the close says what the log will hold (aydinlearns F4); a
    // close that waited alongside may have been written meanwhile.
    const pending = overriding.get(id);
    if (pending) {
      await pending;
      if (closed.has(id)) return;
    }
    let i = instances.get(id);
    if (!i) {
      const served = servings.get(id);
      const target = served ? targetOf(d.content, served.item_id) : undefined;
      if (!served || target === undefined) throw new Error(`There is no open or served item instance ${id}.`);
      i = newInstance(served.item_id, target, at.getTime());
      applyServing(i, served);
    }
    await writeClose(id, i, reason, at);
  };
  /** RouteDeps.openInstance, as `open` above for an item the app's own routes do not grade (Task C1). */
  const openInstance = (id: string, meta: InstanceMeta): OpenInstance => {
    if (closed.has(id)) throw refuse(409, CLOSED);
    const served = servings.get(id);
    let i = instances.get(id);
    if ((served && (served.item_id !== meta.item_id || served.section !== meta.section)) || (i && i.itemId !== meta.item_id)) {
      throw refuse(400, 'This item instance belongs to another item.');
    }
    if (!i) {
      i = newInstance(meta.item_id, meta.target_concept_id, Date.now());
      instances.set(id, i);
    }
    if (served) applyServing(i, served);
    else i.phase ??= browserPhase(meta.phase);                     // S2-98, as `open`: a served-only phase needs its serving
    const shownAt = Date.parse(meta.started_at ?? '');
    if (shownAt < i.started) i.started = shownAt;
    const inst = i;
    return {
      get phase() { return inst.phase ?? 'free'; },
      get block_id() { return inst.blockId; },
      get repeat_exposure() { return inst.repeatExposure; },
      get started() { return inst.started; },
      get submitted() { return inst.submitted; },
      get solutionViewed() { return inst.solutionViewed; },
      noteSubmission: (graded, pass) => noteSubmission(inst, graded, pass),
      noteSolution: () => noteSolution(inst),
    };
  };
  /** S2-16: every block left without a block_close is closed at the session end, with one review per card (S2-04). */
  const closeOpenBlocks = async (at: Date): Promise<void> => {
    for (const draft of blockClosesDue(d.state.current(), at)) {
      await d.logger.blockClose(d.state.rateBlockClose(draft, at));
      for (const id of servings.blockMembers(draft.block_id)) { closed.add(id); servings.forget(id); }   // the block is over
    }
  };
  /** S2-28: each leech card due a reset (its micro-lesson done, or its next session ended without it). */
  const writePendingResets = async (): Promise<void> => {
    for (const p of d.state.current().pendingResets) await d.logger.event(resetEvent(p));
  };
  /**
   * Design §5 and S2-44: in a timed drill, help waits for the end-of-run review. On an item of a run that is still on, a hint or
   * "show answer" is refused (409). On a closed item of a drill run that has ended, it is answered and logged, and the item stays
   * closed: what the help record names comes from the logged close, and replay ignores help after a close. Null for any other item.
   */
  const reviewHelp = async (id: string, item: SqlItem): Promise<{ item_id: string; target_concept_id: string; phase: Phase } | null> => {
    if (await drills.running(id)) throw refuse(409, HELP_WAITS);
    if (!closed.has(id)) return null;
    const done = d.state.current().instances.get(id);
    if (done?.phase !== 'drill' || done.block_id === null) return null;     // any other closed item: the usual 409 follows
    if (done.item_id !== item.id) throw refuse(400, 'This item instance belongs to another item.');
    return { item_id: done.item_id, target_concept_id: done.concept_id, phase: 'drill' };
  };

  // A refusal may carry a `code` a screen can match on, where the message text is only for the learner (Task B3 M1).
  app.onError((e, c) => {
    if (!(e instanceof HTTPException)) return c.json({ error: e.message }, 500);
    const code = (e as { code?: unknown }).code;
    return c.json({ error: e.message, ...(typeof code === 'string' ? { code } : {}) }, e.status);
  });
  app.use('*', securityMiddleware(d.port, d.devOrigin));

  app.get('/api/status', (c) => {
    // A failed log write after startup shows here too, so the setup screen can say why grading paused.
    const checks = d.logger.writable ? d.checks : [...d.checks.filter((x) => x.name !== 'log writable'), LOG_FAILED];
    const bad = checks.some((x) => !x.ok);
    return c.json({
      ok: !bad, degraded: bad, checks, settings: d.settings, version: APP_VERSION,
      versions: { dataset: d.manifest.dataset_version, duckdb: d.manifest.library_version, content: d.content.contentVersion, grader: GRADER_VERSION },
    });
  });
  // Requests past touch() that are still running. A session end waits for them (aydinlearns F1). A request
  // that arrives during the end waits in touch() and is not counted, so the wait cannot deadlock;
  // /api/session-end itself is never counted. Grading is bounded by the runner's kill, so the wait is too.
  const inFlight = new Set<Promise<void>>();
  d.session.setBeforeEnd(async () => { await Promise.allSettled([...inFlight]); });
  const tracked = async (work: Promise<void>): Promise<void> => {
    inFlight.add(work);
    try { await work; } finally { inFlight.delete(work); }
  };
  app.use('/api/*', async (c, next) => {
    if (degraded) return c.json({ error: 'The app is in setup mode. See the setup screen.', setup_required: true, checks: d.checks }, 503);
    if (!d.logger.writable) {
      // Design §18: grading stops until the log can be written again, so no attempt is lost silently.
      if (c.req.method !== 'GET') return c.json({ error: 'The log cannot be written, so grading is paused. See the setup screen.' }, 503);
    } else if (!READS.has(c.req.method) && c.req.path !== '/api/session-end' && c.req.path !== EXPLORE_RUN_PATH) {
      // Only a request that can change something starts a session (Task B13): opening Today or the map writes nothing.
      await d.session.touch();
      // S2-42: a drill run whose time is up ends before this request does anything (the check on every request; the run's
      // timer is the other half of the hard stop).
      return tracked(drills.sweep().then(() => next()));
    }
    await next();
  });

  app.get('/api/curriculum', (c) => {
    const states = curriculumStates(d.state.current(), d.content.curriculum.concepts.map((x) => x.id));
    const has = d.content.conceptsWithContent();
    return c.json({ levels: d.content.curriculum.levels, concepts: d.content.curriculum.concepts.map((x) => ({
      ...x, state: states[x.id], hasContent: has.has(x.id), comingInSlice: has.has(x.id) ? null : SLICE_FOR_LEVEL[x.level] ?? null })) });
  });
  app.get('/api/lessons/:id', (c) => {
    const l = d.content.lesson(c.req.param('id'));
    // S3-17: the pretest the lesson screen walks is the composer's: with a predict item, the first write item, then that item.
    return l ? c.json({ ...l, pretest_item_ids: pretestItemIds(d.content, l.concept_id) }) : c.json({ error: 'Unknown lesson.' }, 404);
  });
  app.get('/api/items/:id', (c) => {
    const item = d.content.item(c.req.param('id'));
    if (item) return c.json({ item: publicItem(item, c.req.query('stage'), d.content.key(item.id)?.other_way != null), schemaNotes: d.schemaNotes.filter((n) => n.schema === item.schema) });
    // A GA4 or Methodology question typed into the SQL item URL (a held-out one, S2-64): named, never served here (Task C8).
    return c.json({ error: d.content.choiceItem?.(c.req.param('id')) ? 'This question is not available for practice.' : 'Unknown item.' }, 404);
  });
  app.get('/api/retests', async (c) => {
    const lessons = [...d.content.conceptsWithContent()].map((id) => d.content.lesson(id)!);
    return c.json(pendingRetests(await d.logger.readAll('attempts'), lessons, new Date()));
  });
  app.get('/api/goals', (c) => c.json(d.content.goals));

  // Run is free: it is not logged and not graded.
  app.post('/api/run', async (c) => {
    const b = await readBody(c);
    const item = itemOf(b);
    if (typeof b.sql !== 'string') throw refuse(400, 'sql is missing.');
    const r = await runnerOf().request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql: b.sql, cap: DISPLAY_CAP, deadlineMs: item.rules.timeout_ms });
    return c.json(r.ok ? r.data : { error: r.error });
  });

  app.post('/api/submit', async (c) => {
    const b = await readBody(c);
    const item = itemOf(b);
    const key = keyOf(item);
    const runner = runnerOf();
    if (typeof b.sql !== 'string') throw refuse(400, 'sql is missing.');
    const sql = b.sql;
    const id = text(b, 'item_instance_id');
    // S2-42 and D9: a drill item takes answers until its run's stop; one sent in time holds the run's end until it is logged.
    const release = await drills.holdForSubmission(id);
    if (!release) throw refuse(409, RUN_OVER);
    let logged: Date | null = null;
    try {
      const i = open(id, item, b);
      i.phase ??= 'free';                                        // an attempt always has a phase: 'free' when no request ever named one
      const watched = watchTableCheck(runner);
      // D41: the stricter checks only for an instance served in screen mode; every other one grades as before.
      const r = await grade({ item, key, sql, screenMode: i.screenMode }, { runner: watched.runner, edge: d.content.edge(item.edge_schema) ?? null, feedback: d.content.feedback, schemaNotes: d.schemaNotes });
      // Design §18: a rejected statement is neither logged nor graded; a crash is logged and not graded; everything else is graded.
      if (r.outcome === 'rejected') return c.json({ ...r, attempt_id: null });
      // An override being written may still be given back: count this submission against what the log will hold.
      const pending = overriding.get(id);
      if (pending) await pending;
      noteSubmission(i, r.graded, r.outcome === 'pass');
      const checks = r.notes.filter((n) => n.startsWith('CHK-')).map((n) => n.split(':')[0]!);
      // The declared mode covers every outcome; a gate reply that reports 'text' is caught as well.
      if (d.tableCheck === 'text' || watched.sawText()) checks.push('CHK-TABLE-CHECK-TEXT');
      const at = new Date();
      const attempt: AydinAttempt = {
        record: 'attempt', schema_version: SCHEMA_VERSION, attempt_id: randomUUID(), app: 'aydinlearns', section: 'sql',
        session_id: d.session.currentId ?? '', item_instance_id: id, started_at: new Date(i.started).toISOString(),
        submitted_at: at.toISOString(), local_date: amsterdamDate(at), item_id: item.id, item_version: item.version, item_kind: item.kind,
        target_concept_id: item.target_concept_id, concept_ids: item.concept_ids, template_id: item.template_id, level: item.level,
        phase: i.phase, block_id: i.blockId, fading_stage: b.fading_stage === 1 || b.fading_stage === 2 || b.fading_stage === 3 ? b.fading_stage : null,
        repeat_exposure: i.repeatExposure, screen_mode: i.screenMode, submission_no: i.submitted, hint_level: i.maxHint, solution_viewed: i.solutionViewed,
        active_ms: Math.max(0, Number(b.active_ms) || 0), target_ms: item.time_target_ms, outcome: r.outcome, is_correct: r.outcome === 'pass',
        partial_score: r.outcome === 'pass' ? 100 : r.partial?.total ?? null, error_ids: r.diagnosis ? [r.diagnosis.errorId] : [],
        checks, grading_source: 'auto',
        confidence: b.confidence === 1 || b.confidence === 2 || b.confidence === 3 || b.confidence === 4 ? b.confidence : null,
        content_version: d.content.contentVersion, grader_version: GRADER_VERSION,
        world: 'pricing', difficulty: item.difficulty, sub_skill: item.sub_skill, dataset_version: d.manifest.dataset_version, duckdb_version: d.manifest.library_version,
        ...(i.cardId === null ? {} : { card_id: i.cardId }),        // D28: a mistake-card review; the override copies it with the rest
        payload: { kind: 'sql', submitted_query: sql,
          per_dataset: r.datasets.map((x) => ({ schema: x.schema, passed: x.passed, missing: x.missing, extra: x.extra, mismatched: x.mismatched, timed_out: x.timedOut })),
          matched_mutant_id: r.matchedMutantId, diff_summary: r.diff ? `${r.diff.missing.length} missing, ${r.diff.extra.length} extra` : null, portability_notes: r.portabilityNotes,
          ...(r.divisionCheck === undefined ? {} : { division_check: r.divisionCheck }) },   // Codex F24: a pass's re-run outcome, for JR-04 (log format 4)
      };
      await d.logger.attempt(attempt);
      logged = at;
      if (r.graded) i.lastGraded = attempt;
      return c.json({ ...r, attempt_id: attempt.attempt_id });
    } finally {
      release(logged);
    }
  });

  app.post('/api/hint', async (c) => {
    const b = await readBody(c);
    const item = itemOf(b);
    const key = keyOf(item);
    const level = b.level;
    if (level !== 1 && level !== 2 && level !== 3) throw refuse(400, 'A hint level is 1, 2 or 3.');
    const id = text(b, 'item_instance_id');
    const review = await reviewHelp(id, item);                // S2-44: refused in a drill run, open in its end-of-run review
    const i = review ? null : open(id, item, b);
    await d.logger.hintOpened({ record: 'hint_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id, level, ...(review ?? helpFields(i!)), ...cardField(i) });
    if (i) noteHint(i, level);
    return c.json({ text: level === 3 ? key.hint3_partial : item.hints[level - 1] });
  });
  app.post('/api/show-answer', async (c) => {
    const b = await readBody(c);
    const item = itemOf(b);
    const key = keyOf(item);
    const runner = runnerOf();
    const id = text(b, 'item_instance_id');
    const review = await reviewHelp(id, item);                // S2-44: refused in a drill run, open in its end-of-run review
    const i = review ? null : open(id, item, b);
    await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id, ...(review ?? helpFields(i!)), ...cardField(i) });
    if (i) noteSolution(i);
    return c.json(await revealReference(item, key, runner));
  });
  /**
   * S4-12 (Task D1), the fourth logged key case: one different correct query and its trade-off, only for an instance that has a passing
   * attempt and that no running timed run holds. A refusal logs nothing; each served response writes one other_way_opened (D29), which
   * replay reads and ignores. It never opens an instance: a request for one nobody submitted on is NOT_PASSED. A closed instance (the
   * learner pressed Next, a session ended, or a drill run is over and its review is open) is judged by the log's own replay.
   */
  app.post('/api/other-way', async (c) => {
    const b = await readBody(c);
    const item = itemOf(b);
    const key = keyOf(item);
    const id = text(b, 'item_instance_id');
    if (await drills.running(id)) throw refuse(409, HELP_WAITS, 'HELP_WAITS');
    let at: { item_id: string; target_concept_id: string; phase: Phase } | null = null;
    if (closed.has(id)) {
      const done = d.state.current().instances.get(id);
      if (done && done.item_id !== item.id) throw refuse(400, 'This item instance belongs to another item.');
      if (done?.countsAsPass) at = { item_id: done.item_id, target_concept_id: done.concept_id, phase: done.phase as Phase };
    } else {
      const i = instances.get(id);
      if (i && i.itemId !== item.id) throw refuse(400, 'This item instance belongs to another item.');
      if (i?.passed) at = helpFields(i);
    }
    if (!at) throw refuse(409, 'Other ways open after you pass this exercise.', 'NOT_PASSED');
    if (!key.other_way) throw refuse(404, 'This exercise has no other way to show.');
    await d.logger.otherWayOpened({ record: 'other_way_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id, ...at });
    return c.json({ sql: key.other_way.sql, tradeoff: key.other_way.tradeoff });
  });
  app.post('/api/override', async (c) => {
    const b = await readBody(c);
    const id = text(b, 'item_instance_id');
    // A session end (or a restart) closed it: the same 409 as every other request on a closed instance, so the
    // screen reopens the exercise. The disputed attempt can no longer be overridden.
    if (closed.has(id)) throw refuse(409, CLOSED);
    const i = instances.get(id);
    const last = i?.lastGraded;
    if (!i || !last || last.is_correct || overriding.has(id) || i.itemId !== b.item_id) throw refuse(400, 'There is no failed attempt to override.');
    // Only a result that ran and differed can be disputed (C-5): a time-out or an engine error has no result to compare.
    const notRun = 'so there is no result to compare. "I was right" is for a query that ran and gave a different result.';
    if (last.outcome === 'timeout') throw refuse(400, `This query timed out, ${notRun}`);
    if (last.outcome !== 'fail') throw refuse(400, `This query stopped with an error, ${notRun}`);
    const at = new Date();
    // Replay (slice 1b) rates an override as Hard; it counts toward Mastered only after an override_confirm (design §5).
    const override: AydinAttempt = { ...last, attempt_id: randomUUID(), session_id: d.session.currentId ?? last.session_id, submitted_at: at.toISOString(),
      local_date: amsterdamDate(at), outcome: 'pass', is_correct: true, partial_score: 100, error_ids: [], grading_source: 'override' };
    // Claimed before the first await, so a second request (a double-click) is refused above (aydinlearns F3), and
    // marked pending until the attempt is written (aydinlearns F4).
    const passedBefore = i.passed;
    i.lastGraded = override;
    i.passed = true;
    const written = (async () => {
      try {
        await d.logger.attempt(override);
      } catch (e) {
        // Nothing was logged, so nothing was overridden: give the claim back, so no later close (a session end, the
        // idle timer, shutdown) passes the item on an override the log does not hold (aydinlearns F4). passed returns
        // to what it was, not to false: an earlier pass on this instance still stands.
        i.lastGraded = last;
        i.passed = passedBefore;
        throw e;
      }
    })();
    // Set before any await, with the claim: a submission or a close that arrives now waits until the restore is done.
    overriding.set(id, written.catch(() => {}));
    try {
      await written;
    } finally {
      overriding.delete(id);
    }
    // The override is in the log now. If the report fails, the claim stays: replay reads the attempt, not the report.
    await d.logger.event({ event: 'content_report', schema_version: SCHEMA_VERSION, ts: at.toISOString(), item_id: i.itemId,
      text: `"I was right" on attempt ${last.attempt_id}; override attempt ${override.attempt_id}; disputed row: ${JSON.stringify(b.disputed_row ?? null)}` });
    return c.json({ ok: true });
  });
  app.post('/api/item-close', async (c) => {
    const b = await readBody(c);
    // The browser's reason must be a valid one, but the record says what the server saw: a pass, or the learner left.
    if (!CLOSE_REASONS.includes(b.reason as CloseReason)) throw refuse(400, 'Unknown close reason.');
    const id = text(b, 'item_instance_id');
    if (closed.has(id)) return c.json({ ok: true });        // already closed, for example at a session end or before a restart
    // A drill item stays open until its run ends (D9: answers are taken until the stop); the run's end closes it (S2-42). A
    // close that arrives while the run is ending waits for that end, which has closed the item by then.
    if (await drills.running(id) || closed.has(id)) return c.json({ ok: true });
    const i = open(id, itemOf(b), b);
    const pending = overriding.get(id);
    if (pending) {
      // Wait for the override being written, so the close says what the log will hold (aydinlearns F4); a close that
      // waited alongside may have been written meanwhile.
      await pending;
      if (closed.has(id)) return c.json({ ok: true });
    }
    await writeClose(id, i, i.passed ? 'pass' : 'left');
    return c.json({ ok: true });
  });
  app.post('/api/exposure', async (c) => {
    const b = await readBody(c);
    const kind = b.kind as Exposure['kind'];
    if (!EXPOSURE_KINDS.includes(kind)) throw refuse(400, 'Unknown exposure kind.');
    const concept_id = text(b, 'concept_id');
    await d.logger.exposure({ record: 'exposure', schema_version: SCHEMA_VERSION, ts: now(), concept_id, kind });
    // S2-28: the micro-lesson is done, so a leech's card is reset at once, stamped with this exposure.
    if (kind === 'micro_lesson') {
      const card_id = d.state.catalog().cardOf(concept_id);
      const due = d.state.current().pendingResets.find((p) => p.card_id === card_id);
      if (due) await d.logger.event(resetEvent(due));
    }
    return c.json({ ok: true });
  });
  app.post('/api/session-end', async (c) => {
    endBackup = null;
    await d.session.end('explicit');                         // runs the end hooks when a session was open
    return c.json({ ok: true, backup: endBackup ?? await backup() });
  });
  app.post('/api/settings', async (c) => {
    const b = await readBody(c);
    const key = b.key as SettingChange['key'];
    if (!SETTING_KEYS.includes(key)) throw refuse(400, 'Unknown setting.');
    const value = (key === 'backup_folder' || key === 'portfolio_folder') && b.value === '' ? null : b.value;
    const problem = settingProblem(key, value);
    if (problem) throw refuse(400, problem);
    await d.logger.event({ event: 'setting_change', schema_version: SCHEMA_VERSION, ts: now(), key, value });
    if (key === 'goal_dates') d.settings.goal_dates = value as Record<string, string>;
    else d.settings[key] = value as string | null;
    return c.json({ ok: true });
  });
  app.post('/api/outside-practice', async (c) => {
    const b = await readBody(c);
    const score = b.score === undefined || b.score === null || b.score === '' ? {} : { score: String(b.score) };
    await d.logger.event({ event: 'outside_practice', schema_version: SCHEMA_VERSION, ts: now(), source: text(b, 'source'), description: text(b, 'description'), ...score });
    return c.json({ ok: true });
  });
  app.post('/api/external-result', async (c) => {
    const b = await readBody(c);
    const result = externalData(b.kind, b.data);
    if (!result) throw refuse(400, 'Unknown kind, or its data is incomplete.');
    await d.logger.event({ event: 'external_result', schema_version: SCHEMA_VERSION, ts: now(), ...result });
    return c.json({ ok: true });
  });
  app.post('/api/report', async (c) => {
    const b = await readBody(c);
    await d.logger.event({ event: 'content_report', schema_version: SCHEMA_VERSION, ts: now(), item_id: text(b, 'item_id'), text: text(b, 'text') });
    return c.json({ ok: true });
  });
  // Route modules (Tasks B13, B14, C1) own their paths and mount before the 404 below. An end hook a module pushes runs
  // before the app's own, pushed next, so a module closes its own instances first (a drill's run_end, S2-42).
  const routeDeps: RouteDeps = { ...d, servings, writeClose: closeById, openInstance };
  // S4-15 (sprint 3 record D2 S3): Today never serves an item the timed run that is on holds. The run clock exists once the drill
  // routes mount, after Today's, so Today asks this at request time: the open servings of the run that is on (one at a time
  // across sections, S3-08; its items stay open until its end), each at the run's start.
  let timed: DrillRuns | null = null;
  const liveRunItems = (): { item_id: string; started_at: string }[] => {
    const run = timed?.current();
    return run ? run.servings.map((s) => ({ item_id: s.item_id, started_at: new Date(run.started_at).toISOString() })) : [];
  };
  const today = mountToday(app, routeDeps, liveRunItems);
  const runs = mountDrill(app, routeDeps);
  drills = runs;
  timed = runs;
  mountChoice(app, routeDeps, runs);                       // Task B2: the choice routes ask the run clock (S3-03, S3-12)
  mountRun(app, routeDeps, runs);                          // the GA4 runs share the SQL drills' clock (S3-08)
  mountCp4(app, routeDeps, mountCases(app, routeDeps));    // sprint 4b (Task D1): the case routes; the opener CP4 path aliases theirs
  mountSections(app, routeDeps);
  mountMistakes(app, routeDeps, today);                    // Task C2: serves through Today's serving (S4-08, S4-13, S4-15)
  mountPortfolio(app, routeDeps);                          // sprint 4b (Task D4): the portfolio export and its screen's data (S4B-16 to S4B-19)
  mountExplore(app, routeDeps);                            // sprint 4b (Task E2): the dataset explorer; its run logs nothing and starts no session (S4B-28)
  mountProgress(app, routeDeps);                           // sprint 4b (Task E1): GET /api/progress, read only (S4B-27)
  mountLabs(app, routeDeps);                               // sprint 5b (Task B2): the GA4 labs, graded and stated by server/labs.ts (D69)
  // Writes through the logger only: this runs inside the session tracker's queue.
  d.endHooks.push(async (at) => {
    for (const [id, i] of [...instances]) await writeClose(id, i, 'session_end', at);
    await closeOpenBlocks(at);
    await writePendingResets();
    endBackup = await backup();
  });
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

  if (d.distDir) {
    // serveStatic refuses '..', backslashes and any '%' in the path, so nothing outside the root is served.
    const root = resolve(d.distDir);
    app.get('*', serveStatic({ root }));
    app.get('*', serveStatic({ path: join(root, 'index.html') }));     // the single-page-app shell, also in setup mode
  }
  return app;
}

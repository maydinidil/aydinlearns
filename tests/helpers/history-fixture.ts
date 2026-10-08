// tests/helpers/history-fixture.ts: a past study history, written into a temporary logs folder, so that a server started on
// it has reviews due (Task B17). The browser smoke test seeds its slice 1b rows with it; it is never pointed at the real logs/.
//
// The records are the ones the 1b server writes (the current schema version), in time order, through AttemptLogger. Every close is
// rated by a replay that includes it (LearnerState.rateClose), as the server rates a live close, so the server's startup
// replays the folder with no warning (S2-15) and writes nothing. Every session has its end, so nothing is left to recover.
// Times are counted back from `now`, so the history is due whenever the test runs:
// - 21 days ago: SQL-BASICS-01, SQL-BASICS-02 and SQL-FILTER-02 are learned (reading, worked example, a passed lesson block,
//   free practice, the re-test). SQL-BASICS-01 is never reviewed again, so its card is due.
// - 4 days ago: SQL-BASICS-02 and SQL-FILTER-02 are reviewed, so their cards are not due.
// - 30 hours ago (an earlier Amsterdam date, within the last 7): SQL-NULL-01's lesson block fails and is left, with no
//   practice and no re-test, so the session end gives it an unrated fallback card (S2-12), due now, and its re-test is
//   ready. SQL-FILTER-01 and SQL-SORT-01 are learned in full.
// So every level 1 concept is started (the next new concept is SQL-AGG-01, the first of level 2), SQL-NULL-01 stays at
// Learning (so level 1's opener is not yet recommended for solving), and three concepts were first exposed in the last
// 7 days (the mixed block).
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { SCHEMA_VERSION, type ItemClose, type Phase } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import type { ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { LearnerState } from '../../server/state.ts';
import { instance, type Step } from './replay-fixture.ts';

export const HISTORY = {
  /** Learned 21 days ago and not reviewed since: due now. */
  overdue: 'SQL-BASICS-01',
  /** Learned 21 days ago, reviewed 4 days ago: not due. */
  reviewed: ['SQL-BASICS-02', 'SQL-FILTER-02'],
  /** Its lesson block failed 30 hours ago: an unrated fallback card, due now, and a re-test that is ready. */
  struggled: 'SQL-NULL-01',
  /** Learned in full 30 hours ago. */
  recent: ['SQL-FILTER-01', 'SQL-SORT-01'],
  /** The next new concept (S2-29): the lowest order concept with content that the history never started. */
  next: 'SQL-AGG-01',
} as const;

/** s2:L103: whether `dir` lies inside os.tmpdir(), comparing real paths (Windows case and 8.3 short names) where the folder exists. */
function insideTemp(dir: string): boolean {
  const real = (p: string): string => { try { return realpathSync.native(resolve(p)); } catch { return resolve(p); } };
  const rel = relative(real(tmpdir()), real(dir));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** What the seeded folder holds, for the test's own checks. */
export interface SeededHistory { dir: string; now: Date; sessions: number; attempts: number; events: number }

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * Writes the history into `dir` (a temporary folder) as of `now`. `content` is the content the server will load: the history
 * uses its lessons' item IDs, and its closes are rated against it.
 */
export async function seedHistory(dir: string, content: ContentStore, now = new Date()): Promise<SeededHistory> {
  if (!insideTemp(dir)) throw new Error('history fixture: the folder must be inside the temporary folder, never the real logs');
  const logger = new AttemptLogger(openJsonlLog(dir));
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const iso = (ms: number): string => new Date(ms).toISOString();
  const lessonOf = (concept: string) => {
    const l = content.lesson(concept);
    if (!l) throw new Error(`history fixture: the content has no lesson for ${concept}`);
    return l;
  };
  /** A concept's pool items of kind write, in pool order: the free practice and the reviews use them. */
  const writeItems = (concept: string): string[] => lessonOf(concept).pool_item_ids.filter((id) => content.item(id)?.kind === 'write');

  let sessions = 0;
  let instances = 0;
  let session = '';
  /** One item instance, written as the 1b server writes it: its attempts and help in order, then its close, rated (S2-15). */
  async function work(o: { item: string; concept: string; phase: Phase; start: number; steps: Step[]; closeAt: number; stage?: 1 | 2 | 3 | null }): Promise<number> {
    const id = `HIST-${String(++instances).padStart(3, '0')}`;
    const recs = instance({ id, item: o.item, concept: o.concept, phase: o.phase, kind: content.item(o.item)?.kind ?? 'write', session, version: 2,
      start: iso(o.start), steps: o.steps, close: { at: iso(o.closeAt) }, fadingStage: o.stage ?? null });
    for (const r of recs.slice(0, -1) as { record: string }[]) {
      if (r.record === 'attempt') await logger.attempt(r as unknown as AydinAttempt);
      else if (r.record === 'hint_opened') await logger.hintOpened(r as never);
      else await logger.solutionOpened(r as never);
    }
    await logger.itemClose(state.rateClose(recs.at(-1) as ItemClose, new Date(o.closeAt)));
    return o.closeAt;
  }
  const pass = (at: number, activeMs = 60_000): Step => ({ at: iso(at), submit: 'pass', activeMs });
  const fail = (at: number): Step => ({ at: iso(at), submit: 'fail' });
  async function inSession(start: number, body: (t: number) => Promise<number>): Promise<void> {
    session = `HIST-S${++sessions}`;
    await logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: iso(start), session_id: session, section: 'all', phase: 'start' });
    const end = (await body(start + MINUTE)) + MINUTE;
    await logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: iso(end), session_id: session, section: 'all', phase: 'end', reason: 'explicit',
      active_minutes: Math.round((end - start) / MINUTE) });
  }
  const exposure = (concept: string, at: number, kind: 'reading' | 'worked_example') =>
    logger.exposure({ record: 'exposure', schema_version: SCHEMA_VERSION, ts: iso(at), concept_id: concept, kind });

  /** A whole lesson, as Today's new concept: the reading, the worked example, the lesson block passed, free practice, the re-test. */
  async function learn(concept: string, t: number): Promise<number> {
    const l = lessonOf(concept);
    const first = t;
    await exposure(concept, t, 'reading');
    await exposure(concept, (t += 2 * MINUTE), 'worked_example');
    for (const [n, item] of l.lesson_item_ids.entries()) {
      t += 2 * MINUTE;
      t = await work({ item, concept, phase: 'lesson_block', start: t, steps: [pass(t + MINUTE)], closeAt: t + MINUTE + 10_000, stage: n < 3 ? ((n + 1) as 1 | 2 | 3) : 3 });
    }
    // Free practice from the map: its first graded attempt is at least 15 minutes after the first exposure, so it gives the
    // card its first rating (S2-03); the re-test opens 15 minutes and 3 item closes after the lesson block (S2-33).
    t = Math.max(t, first + 18 * MINUTE);
    for (const item of writeItems(concept).slice(0, 3)) {
      t += 2 * MINUTE;
      t = await work({ item, concept, phase: 'free', start: t, steps: [pass(t + MINUTE)], closeAt: t + MINUTE + 10_000 });
    }
    t = Math.max(t, first + 32 * MINUTE) + 2 * MINUTE;
    return work({ item: l.retest_item_id, concept, phase: 'retest', start: t, steps: [pass(t + MINUTE)], closeAt: t + MINUTE + 10_000 });
  }
  /** The lesson block tried twice and left on every item: lesson-phase failures rate nothing and pass nothing (LE-01). */
  async function struggle(concept: string, t: number): Promise<number> {
    const l = lessonOf(concept);
    await exposure(concept, t, 'reading');
    await exposure(concept, (t += 2 * MINUTE), 'worked_example');
    for (const item of l.lesson_item_ids) {
      t += 2 * MINUTE;
      t = await work({ item, concept, phase: 'lesson_block', start: t, steps: [fail(t + MINUTE), fail(t + 2 * MINUTE)], closeAt: t + 2 * MINUTE + 10_000, stage: 1 });
    }
    return t;
  }
  /** A scheduled review served by Today, passed (S2-31). */
  async function review(concept: string, item: string, t: number): Promise<number> {
    return work({ item, concept, phase: 'review', start: t, steps: [pass(t + MINUTE)], closeAt: t + MINUTE + 10_000 });
  }

  const at = now.getTime();
  await inSession(at - 21 * 24 * HOUR, async (t) => {
    t = await learn('SQL-BASICS-01', t);
    t = await learn('SQL-BASICS-02', t + 2 * MINUTE);
    return learn('SQL-FILTER-02', t + 2 * MINUTE);
  });
  await inSession(at - 4 * 24 * HOUR, async (t) => {
    t = await review('SQL-BASICS-02', writeItems('SQL-BASICS-02')[3]!, t);
    return review('SQL-FILTER-02', writeItems('SQL-FILTER-02')[3]!, t + 2 * MINUTE);
  });
  await inSession(at - 30 * HOUR, async (t) => {
    t = await struggle('SQL-NULL-01', t);
    t = await learn('SQL-FILTER-01', t + 2 * MINUTE);
    return learn('SQL-SORT-01', t + 2 * MINUTE);
  });

  const warnings = state.current().warnings;
  if (warnings.length) throw new Error(`history fixture: the seeded log does not replay cleanly: ${warnings.join(' | ')}`);
  return { dir, now, sessions, attempts: (await logger.readAll('attempts')).length, events: (await logger.readAll('events')).length };
}

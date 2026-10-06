// tests/helpers/replay-fixture.ts: log records in the shapes the slice 1a server writes (server/app.ts), for the replay
// tests (Task B6) and the server state tests (Task B7). raw_outcome is counted the slice 1a way on purpose (only hint 3
// counts as a reveal, every non-crash submission is graded), so a test fails if replay ever reads it.
import type { CardReview, CloseReason, Phase } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';
import { SQL_RATING_RULES } from '../../core/rating.ts';
import { replay, type ReplayCatalog, type ReplayOptions, type ReplayResult } from '../../core/replay.ts';
import { PRESETS } from '../../schemas/presets.ts';

export const A = 'SQL-BASICS-01';
export const B = 'SQL-BASICS-02';
export const C = 'SQL-FILTER-01';
export const GA4 = 'GA4-SETUP-01';
export const card = (concept: string): string => `CARD-${concept}`;
/** An item ID in the content's own pattern: item(A, 'E1-06') is EX-SQL-BASICS-01-E1-06. */
export const item = (concept: string, n: string): string => `EX-${concept}-${n}`;
export const plus = (ts: string, seconds: number): string => new Date(Date.parse(ts) + seconds * 1000).toISOString();

export interface Log { attempts: object[]; events: object[] }

/**
 * The catalog the replay tests use. It agrees with the server's (Task B7, buildCatalog) on every SQL concept and item
 * kind used here, so the golden log replays to the same cards through either. Opener items are EX-OPENER-*.
 */
export const testCatalog: ReplayCatalog = {
  sectionOf: (c) => (/^SQL-[A-Z]+-\d{2}$/.test(c) ? 'sql' : c.startsWith('GA4-') ? 'ga4' : c.startsWith('MET-') ? 'methodology' : null),
  cardOf: card,
  familyOf: (id, kind) => {
    if (id.startsWith('EX-OPENER-')) return 'checkpoint';
    if (kind === 'fix') return 'fix';
    if (kind === 'mcq' || kind === 'typed') return 'choice';
    if (kind === 'write' || (kind === '' && id.startsWith('EX-SQL-'))) return 'write';
    return kind === '' ? 'choice' : 'other_sql';
  },
  creditsOf: (id) => (id.startsWith('EX-OPENER-') ? [A, C] : null),
  conceptForError: (e) => ({ 'ERR-LOG-13': C, 'ERR-LOG-00': A } as Record<string, string>)[e] ?? null,   // as content/sql/error-concepts.json
  pretestCount: 2,
};

export const options = (over: Partial<ReplayOptions> = {}): ReplayOptions =>
  ({ presets: PRESETS, catalog: testCatalog, rules: SQL_RATING_RULES, now: new Date('2027-01-01T00:00:00Z'), lessonWindowMs: 15 * 60_000, ...over });
export const run = (log: Log, over: Partial<ReplayOptions> = {}): ReplayResult => replay(log.attempts, log.events, options(over));

export type Step =
  | { at: string; submit: 'pass' | 'fail' | 'timeout' | 'crash' | 'engine_error'; errors?: string[]; activeMs?: number; confidence?: 1 | 2 | 3 | 4 | null; id?: string }
  | { at: string; override: true; id?: string }
  | { at: string; hint: 1 | 2 | 3 }
  | { at: string; solution: true };
export interface InstanceSpec {
  id: string; item: string; concept?: string; phase?: Phase; block?: string | null; repeat?: boolean; kind?: string;
  section?: 'sql' | 'ga4' | 'methodology'; session?: string; start: string; steps: Step[];
  close?: { at: string; reason?: CloseReason } | null;     // left out: closed 30 s after the last step; null: never closed
  version?: 1 | 2; targetMs?: number | null; fadingStage?: 1 | 2 | 3 | null;
}

/** One item instance's records, in the order the slice 1a server writes them, with raw_outcome counted the 1a way. */
export function instance(s: InstanceSpec): object[] {
  const v = s.version ?? 1;
  const concept = s.concept ?? A;
  const phase = s.phase ?? 'free';
  const out: object[] = [];
  let submitted = 0, graded = 0, maxHint: 0 | 1 | 2 | 3 = 0, revealed = false, passed = false, firstPass = false, solution = false;
  let last: Record<string, unknown> | null = null;
  const helpFields = v >= 2 ? { item_id: s.item, target_concept_id: concept, phase } : {};
  for (const step of s.steps) {
    if ('hint' in step) {
      out.push({ record: 'hint_opened', schema_version: v, ts: step.at, item_instance_id: s.id, level: step.hint, ...helpFields });
      maxHint = Math.max(maxHint, step.hint) as 0 | 1 | 2 | 3;
      if (step.hint === 3 && graded === 0) revealed = true;                    // the 1a rule: only hint 3 is a reveal
    } else if ('solution' in step) {
      out.push({ record: 'solution_opened', schema_version: v, ts: step.at, item_instance_id: s.id, ...helpFields });
      solution = true;
      if (graded === 0) revealed = true;
    } else if ('override' in step) {
      if (!last) throw new Error(`${s.id}: an override needs an earlier attempt`);
      // As /api/override: a copy of the failed attempt, passed, with its own attempt_id.
      out.push({ ...last, attempt_id: step.id ?? `${s.id}-override`, submitted_at: step.at, local_date: amsterdamDate(new Date(step.at)),
        outcome: 'pass', is_correct: true, partial_score: 100, error_ids: [], grading_source: 'override' });
      passed = true;
    } else {
      submitted++;
      const crash = step.submit === 'crash';
      if (!crash) graded++;                                                    // the 1a rule: no 60-second syntax grace
      const pass = step.submit === 'pass';
      if (pass && !passed) { passed = true; firstPass = graded === 1 && maxHint === 0 && !revealed; }
      last = {
        record: 'attempt', schema_version: v, attempt_id: step.id ?? `${s.id}-${submitted}`, app: 'aydinlearns', section: s.section ?? 'sql',
        session_id: s.session ?? 'S-1', item_instance_id: s.id, started_at: s.start, submitted_at: step.at, local_date: amsterdamDate(new Date(step.at)),
        item_id: s.item, item_version: 1, item_kind: s.kind ?? 'write', target_concept_id: concept, concept_ids: [concept], template_id: null, level: 1,
        phase, block_id: s.block ?? null, fading_stage: s.fadingStage ?? null, repeat_exposure: s.repeat ?? false, screen_mode: false,
        submission_no: submitted, hint_level: maxHint, solution_viewed: solution, active_ms: step.activeMs ?? 60_000,
        target_ms: s.targetMs === undefined ? 120_000 : s.targetMs, outcome: step.submit, is_correct: pass, partial_score: pass ? 100 : 0,
        error_ids: step.errors ?? (pass || crash ? [] : ['ERR-LOG-00']), checks: crash ? ['CHK-RUNNER-CRASH'] : [], grading_source: 'auto',
        confidence: step.confidence ?? null, content_version: 'c1a', grader_version: '1a.2', world: 'pricing', difficulty: 'E1', sub_skill: null,
        dataset_version: 'd1', duckdb_version: 'v1.5.6',
        payload: { kind: 'sql', submitted_query: '(the learner text)', per_dataset: [], matched_mutant_id: null, diff_summary: null, portability_notes: [] },
      };
      out.push(last);
    }
  }
  if (s.close !== null) {
    const lastAt = s.steps.at(-1)?.at ?? s.start;
    const at = s.close?.at ?? plus(lastAt, 30);
    out.push({
      record: 'item_close', schema_version: v, ts: at, item_instance_id: s.id, item_id: s.item, target_concept_id: concept, phase, block_id: s.block ?? null,
      reason: s.close?.reason ?? (passed ? 'pass' : 'left'),
      raw_outcome: { graded_attempts: graded, passed, first_attempt_pass: firstPass, max_hint_level: maxHint, revealed_before_attempt: revealed,
        active_ms: Math.max(0, Date.parse(at) - Date.parse(s.start)) },
      instance_rating: null, card_reviews: [],
    });
  }
  return out;
}

export const exposure = (concept: string, ts: string, kind: 'reading' | 'worked_example' | 'lesson' | 'micro_lesson' | 'refresher' = 'reading') =>
  ({ record: 'exposure', schema_version: 1, ts, concept_id: concept, kind });
export const sessionStart = (session_id: string, ts: string) => ({ event: 'session', schema_version: 1, ts, session_id, section: 'all', phase: 'start' });
export const sessionEnd = (session_id: string, ts: string, reason: 'explicit' | 'idle' | 'recovered' = 'explicit') =>
  ({ event: 'session', schema_version: 1, ts, session_id, section: 'all', phase: 'end', reason, ...(reason === 'recovered' ? {} : { active_minutes: 0 }) });
export const blockClose = (block_id: string, ts: string) => ({ record: 'block_close', schema_version: 2, ts, block_id, card_reviews: [] });
export const override = (event: 'override_confirm' | 'override_revert', attempt_id: string, ts: string) => ({ event, schema_version: 2, ts, attempt_id });
export const cardReset = (card_id: string, ts: string) => ({ event: 'card_event', schema_version: 2, ts, card_id, kind: 'reset', rating: 0, state: 'New', due: ts });
export const configChange = (config_id: string, preset: object, effective_ts: string) =>
  ({ event: 'config_change', schema_version: 2, ts: effective_ts, config_id, preset, effective_ts });
export const examDate = (value: string | null, ts: string) => ({ event: 'setting_change', schema_version: 1, ts, key: 'exam_date', value });

/** A concept read at 08:00 on `day` and passed from the map at 08:30: its card's first rating, Good (S2-03). */
export function primed(concept: string, day: string): object[] {
  return [exposure(concept, `${day}T08:00:00Z`),
    ...instance({ id: `PRIME-${concept}`, item: item(concept, 'E1-90'), concept, start: `${day}T08:30:00Z`,
      steps: [{ at: `${day}T08:30:30Z`, submit: 'pass', activeMs: 100_000 }] })];
}

/**
 * The golden log: Aydin's slice 1a history in its real shapes. Session 1 (2026-10-05) has a failed pretest, the reading,
 * a lesson block logged as lesson_block with fading_stage, free practice with a 60-second syntax slip, an override,
 * a version 1 help-only instance, the re-test, and a crash whose session end and close the next start wrote (reason
 * recovered and session_end). Session 2 (2026-10-07) has a fast review, a "show answer" before any attempt, and a new
 * concept that was only read. `crashed` leaves out what the next start wrote (and session 2, which came after it).
 */
export function golden(o: { sessions?: 1 | 2; crashed?: boolean } = {}): Log {
  const sessions = o.crashed ? 1 : o.sessions ?? 2;
  const d1 = (hms: string) => `2026-10-05T${hms}Z`;
  const d3 = (hms: string) => `2026-10-07T${hms}Z`;
  const it = (n: string) => item(A, n);
  const f4 = instance({ id: 'I-F4', item: it('E2-03'), session: 'S1', start: d1('08:42:00'), steps: [{ at: d1('08:42:30'), submit: 'fail' }],
    close: { at: d1('08:42:30'), reason: 'session_end' } });
  const attempts: object[] = [
    ...instance({ id: 'I-P1', item: it('E1-01'), phase: 'pretest', session: 'S1', start: d1('08:01:00'),
      steps: [{ at: d1('08:02:00'), submit: 'fail' }, { at: d1('08:03:00'), submit: 'fail' }], close: { at: d1('08:03:30') } }),
    ...instance({ id: 'I-P2', item: it('E1-02'), phase: 'pretest', session: 'S1', start: d1('08:04:00'),
      steps: [{ at: d1('08:05:00'), submit: 'pass' }], close: { at: d1('08:05:30') } }),
    exposure(A, d1('08:10:00'), 'reading'),
    exposure(A, d1('08:12:00'), 'worked_example'),
    ...instance({ id: 'I-L1', item: it('E1-03'), phase: 'lesson_block', fadingStage: 1, session: 'S1', start: d1('08:14:00'),
      steps: [{ at: d1('08:15:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-L2', item: it('E1-04'), phase: 'lesson_block', fadingStage: 2, session: 'S1', start: d1('08:16:00'),
      steps: [{ at: d1('08:18:00'), submit: 'fail' }, { at: d1('08:19:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-L3', item: it('E2-01'), phase: 'lesson_block', fadingStage: 3, session: 'S1', start: d1('08:20:00'),
      steps: [{ at: d1('08:21:00'), hint: 2 }, { at: d1('08:23:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-L4', item: it('E2-02'), phase: 'lesson_block', fadingStage: 3, session: 'S1', start: d1('08:24:00'),
      steps: [{ at: d1('08:26:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-F1', item: it('E1-06'), session: 'S1', start: d1('08:28:00'),
      steps: [{ at: d1('08:29:00'), submit: 'fail', errors: ['ERR-SYN-01'] }, { at: d1('08:29:40'), submit: 'pass' }], close: { at: d1('08:30:00') } }),
    ...instance({ id: 'I-F2', item: it('E1-07'), session: 'S1', start: d1('08:31:00'),
      steps: [{ at: d1('08:32:00'), submit: 'fail' }, { at: d1('08:33:00'), override: true, id: 'OVR-1' }], close: { at: d1('08:33:30') } }),
    ...instance({ id: 'I-F3', item: it('E1-08'), session: 'S1', start: d1('08:35:00'),
      steps: [{ at: d1('08:35:30'), hint: 2 }], close: { at: d1('08:36:00'), reason: 'left' } }),
    ...instance({ id: 'I-R', item: it('E1-05'), phase: 'retest', session: 'S1', start: d1('08:40:00'),
      steps: [{ at: d1('08:41:00'), submit: 'pass', activeMs: 40_000 }], close: { at: d1('08:41:10') } }),
    f4[0]!,
    ...(o.crashed ? [] : [f4[1]!]),
  ];
  const events: object[] = [sessionStart('S1', d1('08:00:00')), ...(o.crashed ? [] : [sessionEnd('S1', d1('08:42:30'), 'recovered')])];
  if (sessions === 2) {
    attempts.push(
      ...instance({ id: 'I-V1', item: it('E2-04'), session: 'S2', start: d3('09:01:00'), steps: [{ at: d3('09:01:40'), submit: 'pass', activeMs: 40_000 }] }),
      ...instance({ id: 'I-V2', item: it('E2-05'), session: 'S2', start: d3('09:03:00'),
        steps: [{ at: d3('09:03:20'), solution: true }, { at: d3('09:05:00'), submit: 'pass' }] }),
      exposure(B, d3('09:06:00'), 'reading'),
    );
    events.push(sessionStart('S2', d3('09:00:00')), sessionEnd('S2', d3('09:10:00')));
  }
  return { attempts, events };
}

/**
 * Records that make `concept`'s card a leech (4 lapses, S2-27): Goods until the card is in Review, then an Again and a
 * Good in turn, each at the card's due time. It replays as it grows, so it follows whatever ts-fsrs does.
 */
export function growLeech(concept: string, items: string[], start: string, catalog: ReplayCatalog = testCatalog): Log {
  const log: Log = { attempts: [exposure(concept, start)], events: [] };
  let t = Date.parse(start) + 20 * 60_000;
  for (let n = 0; n < 60; n++) {
    const c = replay(log.attempts, log.events, options({ catalog })).cards.get(catalog.cardOf(concept));
    if (c && c.snapshot.lapses >= 4) return log;
    if (c) t = Math.max(t, Date.parse(c.snapshot.due));
    const fail = c?.snapshot.state === 2;                                // an Again on a Review card is a lapse
    const at = (ms: number) => new Date(ms).toISOString();
    log.attempts.push(...instance({ id: `LEECH-${n}`, item: items[n % items.length]!, concept, phase: 'review', start: at(t),
      steps: [{ at: at(t + 60_000), submit: fail ? 'fail' : 'pass', activeMs: 90_000 }], close: { at: at(t + 90_000) } }));
    t += 2 * 3_600_000;
  }
  throw new Error(`${concept} never reached 4 lapses`);
}

/** A replay result with every Map turned into its entries, so deepEqual also checks the order. */
export const snapshot = (r: ReplayResult) => ({ ...r, cards: [...r.cards], instances: [...r.instances], concepts: [...r.concepts], blocks: [...r.blocks] });

/** Every card review of one card in a result, at item closes and block closes, in time order. */
export function reviewsOf(r: ReplayResult, card_id: string): { at: string; rating: number; config: string }[] {
  const all: { at: string; rating: number; config: string }[] = [];
  const add = (at: string | null, reviews: CardReview[]) => {
    for (const c of reviews) if (c.card_id === card_id && at) all.push({ at, rating: c.rating, config: c.scheduler_config_id });
  };
  for (const i of r.instances.values()) add(i.closed_at, i.card_reviews);
  for (const b of r.blocks.values()) add(b.closed_at, b.card_reviews);
  return all.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
}

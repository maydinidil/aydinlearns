// server/routes/choice.ts: multiple-choice and typed items for GA4 and Methodology (design §5, §8, §9, §13; D14, D15, D16;
// E-110, E-120; S2-60 to S2-64, S2-74), and SQL choice items (Task C4; S3-13 to S3-17), graded by the same grader and logged
// with section sql and their own kind. The key (the correct option or value, and the explanation) leaves the server only
// after an answer or a "show answer", both logged. A held-out item gets a 404 from every route here and is never logged.
//
// GET /api/choice/:id?section=ga4|methodology[&instance=<id>]: the question, its options shuffled with crypto randomness,
//   and the order they were shown in. No instance is opened and nothing is logged until an answer or a "show answer".
//   Task C4 (S3-13, S3-14): section=sql serves an SQL choice item the same way, with its shown query, option tables and schema;
//   [&phase=pretest|free] names the phase of an instance no serving gave one (S3-17: the lesson's predict pretest item).
// POST /api/choice/answer: one answer per instance (S2-61), graded on the server, logged with the order shown, then the
//   instance closes (pass or left) and the key and explanation come back.
// POST /api/choice/show-answer: a version 2 solution_opened, then the key and explanation; the instance stays open.
//
// Task B2, a timed GA4 run's items (S3-01 to S3-04, S3-12; Review Focus 2 and 4):
// - A held-out item is served, and answered, only through its own half-mock instance while that run is on. Anything else about it,
//   its run's review included, gets the 404 every held-out item gets; show-answer always does.
// - An answer to a run's item is logged and leaves the instance open (the run's end closes it): no correctness, key or explanation
//   comes back. Exam mode (a half-mock) takes one answer per item and logs confidence null; practice mode (a mini drill) logs each
//   change as a new attempt. Once the run is over, an answer is a 409 (S2-42).
// - Show-answer inside a run waits (409, S3-03). After a mini drill ends, it opens on the run's closed items, logged (S2-44).
import { randomInt, randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SCHEMA_VERSION, type Phase, type Section } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';
import { choiceTarget, sqlChoiceShape, type ChoiceItem, type ChoiceKey, type ChoiceSection, type ChoiceShape, type OptionTable, type TypedSpec } from '../../schemas/choice.ts';
import { isSqlChoiceKind, type SqlChoiceKind, type SqlItem, type UniqueCheck } from '../../schemas/item.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import type { ContentStore } from '../content.ts';
import type { OpenInstance, RouteDeps } from '../app.ts';
import { CHOICE_GRADER_VERSION, gradeChoice, gradeTyped, parseTyped, TYPED_REFUSALS, type ChoiceGrade } from '../choice/grade.ts';
import { HELP_WAITS, NO_DRILLS, type DrillGate } from '../drill.ts';
import { CHOICE_RUN_OVER, CODE_ONE_ANSWER, CODE_RUN_OVER, isChoicePlan, ONE_ANSWER } from '../run.ts';

/**
 * The question as the browser sees it: never its options in source order, its key, or its misconceptions. `exam_relevance`
 * (GA4; null for Methodology) and `verified` let the screen badge a 2026 feature and an unverified question (Task C5).
 */
export interface ChoiceItemView {
  id: string; version: number; section: ChoiceSection; kind: 'mcq' | 'typed'; stem: string; concept_id: string;
  topic_id: string | null; level: number | null; typed: TypedSpec | null;
  exam_relevance: 'core' | 'new_2026' | 'reference_360' | null; verified: boolean;
}
export interface ChoiceServedView {
  item: ChoiceItemView; options: { oid: string; text: string }[]; shown_order: string[]; item_instance_id: string; phase: Phase;
}
/**
 * Task C4 (S3-14): an SQL choice item as the browser sees it. `kind` is how it is answered (a typed count for predict_rows, one
 * option for every other kind), as for GA4 and Methodology; `sql_kind` says what it shows. `stem` is the item's prompt.
 */
export interface SqlChoiceItemView {
  id: string; version: number; section: 'sql'; kind: 'mcq' | 'typed'; sql_kind: SqlChoiceKind; stem: string; concept_id: string;
  topic_id: null; level: number | null; typed: TypedSpec | null; exam_relevance: null; verified: boolean;
  schema: string; shown_sql: string | null; unique_check: UniqueCheck | null;
}
/** An SQL choice showing: a predict_result option carries its result table. */
export interface SqlChoiceServedView {
  item: SqlChoiceItemView; options: { oid: string; text: string; table?: OptionTable }[]; shown_order: string[]; item_instance_id: string; phase: Phase;
}
export interface ChoiceAnswerView { correct: boolean; correct_oid?: string; value?: number; explanation: string; error_ids: string[]; attempt_id: string }
/** Task B2 (S3-03): an answer to a timed run's item. Help waits for the end-of-run review: no correctness, key or explanation. */
export interface ChoiceSavedView { saved: true; attempt_id: string }
export interface ChoiceRevealView { correct_oid?: string; value?: number; explanation: string }

/** Fisher-Yates. `random(n)` is a whole number from 0 to n - 1; by default node:crypto's. The input is left alone. */
export function shuffle<T>(xs: readonly T[], random: (n: number) => number = (n) => randomInt(n)): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function publicItem(item: ChoiceItem): ChoiceItemView {
  return { id: item.id, version: item.version, section: item.section, kind: item.kind, stem: item.stem, concept_id: item.concept_id,
    topic_id: item.section === 'ga4' ? item.topic_id : null, level: item.level, typed: item.typed,
    exam_relevance: item.section === 'ga4' ? item.exam_relevance : null, verified: item.verified };
}

export function publicSqlChoiceItem(item: SqlItem): SqlChoiceItemView {
  const shape = sqlChoiceShape(item);
  return { id: item.id, version: item.version, section: 'sql', kind: shape.kind, sql_kind: item.kind as SqlChoiceKind, stem: item.prompt,
    concept_id: item.target_concept_id, topic_id: null, level: item.level, typed: shape.typed, exam_relevance: null, verified: item.verified,
    schema: item.schema, shown_sql: item.shown_sql ?? null, unique_check: item.unique_check ?? null };
}

/** Task C4: an SQL choice item the choice routes may serve: an active item of a choice kind (S3-13), as for a GA4 item. */
export function servableSqlChoiceItem(content: ContentStore, id: string): SqlItem | undefined {
  const item = content.item(id);
  return item && isSqlChoiceKind(item.kind) && item.status === 'active' ? item : undefined;
}

/**
 * One question these routes serve, whatever its section: how it is graded (its ChoiceShape), its key, and what its records
 * name. A GA4 or Methodology item names its card's concept (E-110) and nothing of SQL's; an SQL choice item (S3-14) names its
 * own target, concepts, template, difficulty, sub-skill and time target, as an SQL item's attempt does.
 */
interface Question {
  section: Section; item_kind: string; shape: ChoiceShape; key: ChoiceKey; target_concept_id: string; concept_ids: string[];
  level: number | null; template_id: string | null; difficulty: AydinAttempt['difficulty']; sub_skill: string | null; target_ms: number | null;
  world: AydinAttempt['world'];
}

/**
 * S2-64: an item a practice route may serve, or undefined when it is unknown, held out, or not active (an item C3's solver loop
 * left as needs_fix, or a retired one, is never served, even by its ID; Task C5). Today's draw uses it too.
 */
export function servableChoiceItem(content: ContentStore, id: string): ChoiceItem | undefined {
  const item = content.choiceItem?.(id);
  return item && item.status === 'active' && !content.heldOut?.(id) ? item : undefined;
}

/**
 * S3-12: an active GA4 or Methodology item, held out or not. Only a half-mock's own instance, while its run is on, reaches a held-out
 * item through it; every other request goes through servableChoiceItem.
 */
function activeChoiceItem(content: ContentStore, id: string): ChoiceItem | undefined {
  const item = content.choiceItem?.(id);
  return item && item.status === 'active' ? item : undefined;
}

/**
 * What a GET sent for one instance, kept until the answer closes it, so the order logged is the order shown. `phase` is the
 * phase the GET told the browser (its serving's, or free); openInstance honours a served-only phase only while the serving
 * stands (S2-98), so an answer sent after a session end forgot the serving is free.
 */
interface Shown { item_id: string; order: string[]; at: number; phase: Phase }
const SHOWN_LIMIT = 1000;           // instances shown and never answered are dropped oldest first
const UNKNOWN = 'Unknown question.';
const NOT_OPEN = 'This question is closed or was not opened here. Open it again.';
const OTHER_ITEM = 'This item instance belongs to another item.';

const refuse = (status: 400 | 404 | 409, message: string, code?: string): HTTPException => Object.assign(new HTTPException(status, { message }), code === undefined ? {} : { code });
type Body = Record<string, unknown>;
async function readBody(c: Context): Promise<Body> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Body;
}
function text(b: Body, field: string): string {
  const v = b[field];
  if (typeof v !== 'string' || v.trim() === '') throw refuse(400, `${field} is missing.`);
  return v;
}
const reveal = (q: Question): ChoiceRevealView =>
  (q.shape.kind === 'mcq' ? { correct_oid: q.key.correct_oid, explanation: q.key.explanation } : { value: q.key.value, explanation: q.key.explanation });
/** S3-17: the phases a browser may name for an SQL choice instance no serving gave one. Every other phase comes from a serving. */
const SQL_BROWSER_PHASES: readonly Phase[] = ['pretest', 'free'];

export function mountChoice(app: Hono, d: RouteDeps, runs: DrillGate = NO_DRILLS): void {
  const shown = new Map<string, Shown>();
  const remember = (id: string, s: Shown): void => {
    shown.set(id, s);
    if (shown.size > SHOWN_LIMIT) shown.delete(shown.keys().next().value!);
  };
  /**
   * The question with this ID in this section (any section when none is named), or undefined: unknown, held out, not active, or
   * of another section. A GA4 or Methodology item comes first; an SQL choice item's ID never takes that form (EX-SQL-*).
   * `inHalfMock` (S3-12): the request names this held-out item's own half-mock instance, and that run is on.
   */
  const question = (id: string, section?: Section, inHalfMock = false): Question | undefined | 'no key' => {
    const choice = section === undefined || section === 'ga4' || section === 'methodology'
      ? (inHalfMock ? activeChoiceItem(d.content, id) : servableChoiceItem(d.content, id)) : undefined;
    if (choice && (section === undefined || choice.section === section)) {
      const key = d.content.choiceKey?.(choice.id);
      if (!key) return 'no key';
      const { target_concept_id, concept_ids } = choiceTarget(choice);
      return { section: choice.section, item_kind: choice.kind, shape: choice, key, target_concept_id, concept_ids, level: choice.level, template_id: null,
        difficulty: null, sub_skill: null, target_ms: null, world: null };
    }
    const sql = section === undefined || section === 'sql' ? servableSqlChoiceItem(d.content, id) : undefined;
    if (!sql) return undefined;
    const key = d.content.sqlChoiceKey?.(sql.id);
    if (!key) return 'no key';
    return { section: 'sql', item_kind: sql.kind, shape: sqlChoiceShape(sql), key, target_concept_id: sql.target_concept_id, concept_ids: sql.concept_ids,
      level: sql.level, template_id: sql.template_id, difficulty: sql.difficulty, sub_skill: sql.sub_skill, target_ms: sql.time_target_ms, world: 'pricing' };
  };
  /** The question and its key; a 404 for an unknown or held-out ID, before anything else happens (S2-64, S3-12). */
  const servable = (id: unknown, inHalfMock = false): Question => {
    const q = typeof id === 'string' ? question(id, undefined, inHalfMock) : undefined;
    if (q === undefined) throw refuse(404, UNKNOWN);
    if (q === 'no key') throw refuse(404, 'This question has no answer key.');
    return q;
  };
  /**
   * S3-12: the instance is this held-out item's own serving in a half-mock, and `on` says that run is on. A serving is forgotten
   * when its run ends and at a restart, so after the run every request for the item is the usual 404.
   */
  const servedInHalfMock = (itemId: unknown, instanceId: unknown, on: boolean): boolean => {
    if (!on || typeof itemId !== 'string' || typeof instanceId !== 'string' || !d.content.heldOut?.(itemId)) return false;
    const s = d.servings.get(instanceId);
    return s?.phase === 'mock' && s.section === 'ga4' && s.item_id === itemId;
  };
  /** The instance a GET showed this item in. An instance never shown here (or forgotten by a restart) is a 409: the screen opens the question again. */
  const shownFor = (id: string, q: Question): Shown => {
    const s = shown.get(id);
    if (!s) throw refuse(409, NOT_OPEN);
    if (s.item_id !== q.shape.id) throw refuse(400, OTHER_ITEM);
    return s;
  };
  const open = (id: string, q: Question, s: Shown) => d.openInstance(id, { item_id: q.shape.id, target_concept_id: q.target_concept_id,
    phase: s.phase, section: q.section, started_at: new Date(s.at).toISOString() });
  /** The logged answer: graded on the server, with the order shown (S2-60) and the instance's phase, block and repeat flag. */
  const attemptOf = (a: { id: string; q: Question; s: Shown; i: OpenInstance; b: Body; at: Date; grade: ChoiceGrade; chosen: string | null;
    typed: string | undefined; confidence: AydinAttempt['confidence'] }): AydinAttempt => {
    const { id, q, s, i, b, at, grade } = a;
    const activeMs = typeof b.active_ms === 'number' && Number.isFinite(b.active_ms) && b.active_ms >= 0 ? b.active_ms : Math.max(0, at.getTime() - i.started);
    return {
      record: 'attempt', schema_version: SCHEMA_VERSION, attempt_id: randomUUID(), app: 'aydinlearns', section: q.section,
      session_id: d.session.currentId ?? '', item_instance_id: id, started_at: new Date(i.started).toISOString(),
      submitted_at: at.toISOString(), local_date: amsterdamDate(at), item_id: q.shape.id, item_version: q.shape.version, item_kind: q.item_kind,
      target_concept_id: q.target_concept_id, concept_ids: q.concept_ids, template_id: q.template_id, level: q.level, phase: i.phase, block_id: i.block_id,
      fading_stage: null, repeat_exposure: i.repeat_exposure, screen_mode: false, submission_no: i.submitted, hint_level: 0, solution_viewed: i.solutionViewed,
      active_ms: activeMs, target_ms: q.target_ms, outcome: grade.correct ? 'pass' : 'fail', is_correct: grade.correct, partial_score: null,
      error_ids: grade.error_ids, checks: [], grading_source: 'auto', confidence: a.confidence, content_version: d.content.contentVersion,
      grader_version: CHOICE_GRADER_VERSION, world: q.world, difficulty: q.difficulty, sub_skill: q.sub_skill,
      dataset_version: d.manifest.dataset_version, duckdb_version: d.manifest.library_version,
      payload: { kind: 'mcq', shown_order: s.order, chosen: a.chosen, ...(a.typed === undefined ? {} : { typed: a.typed }) },
    };
  };

  app.get('/api/choice/:id', async (c) => {
    const section = c.req.query('section');
    if (section !== 'ga4' && section !== 'methodology' && section !== 'sql') throw refuse(400, 'section must be ga4, methodology or sql.');
    const asked = c.req.query('instance');
    // S3-12: a held-out item only through its own half-mock instance while the run is on (running() ends a run past its limit first).
    const inHalfMock = section === 'ga4' && d.content.heldOut?.(c.req.param('id')) === true && asked !== undefined
      && servedInHalfMock(c.req.param('id'), asked, await runs.running(asked));
    const q = question(c.req.param('id'), section, inHalfMock);
    if (q === undefined || q === 'no key') throw refuse(404, UNKNOWN);
    // S3-17: an SQL choice instance no serving gave a phase may be named a pretest one; GA4 and Methodology take none from the browser.
    const named = section === 'sql' ? c.req.query('phase') : undefined;
    if (named !== undefined && !SQL_BROWSER_PHASES.includes(named as Phase)) throw refuse(400, 'phase may be pretest or free.');
    const item = q.shape;
    if (asked !== undefined && asked.trim() === '') throw refuse(400, 'instance is empty.');
    const id = asked ?? randomUUID();
    const served = d.servings.get(id);
    let s = shown.get(id);
    if ((served && (served.item_id !== item.id || served.section !== section)) || (s && s.item_id !== item.id)) throw refuse(400, OTHER_ITEM);
    if (!s) {
      s = { item_id: item.id, order: shuffle(item.options.map((o) => o.oid)), at: Date.now(), phase: served?.phase ?? (named as Phase | undefined) ?? 'free' };
      remember(id, s);
    }
    // As openInstance: a served-only phase holds only while its serving stands (S2-98); a pretest the browser named (S3-17) stays.
    const phase: Phase = served?.phase ?? (section === 'sql' && s.phase === 'pretest' ? 'pretest' : 'free');
    if (section === 'sql') {
      const sql = d.content.item(item.id)!;
      const byOid = new Map(item.options.map((o) => [o.oid, o]));
      const body: SqlChoiceServedView = { item: publicSqlChoiceItem(sql), shown_order: s.order, item_instance_id: id, phase,
        options: s.order.map((oid) => { const o = byOid.get(oid)!; return o.table ? { oid, text: o.text, table: o.table } : { oid, text: o.text }; }) };
      return c.json(body);
    }
    const choice = (inHalfMock ? activeChoiceItem(d.content, item.id) : servableChoiceItem(d.content, item.id))!;
    const textOf = new Map(item.options.map((o) => [o.oid, o.text]));
    const body: ChoiceServedView = { item: publicItem(choice), options: s.order.map((oid) => ({ oid, text: textOf.get(oid)! })),
      shown_order: s.order, item_instance_id: id, phase };
    return c.json(body);
  });

  app.post('/api/choice/answer', async (c) => {
    const b = await readBody(c);
    // S2-42 and D9 for a timed run's item: answers are taken until the stop, and one sent in time holds the run's end until it is
    // logged; after the stop the release is null. Any other instance gets a release that does nothing.
    const asked = typeof b.item_instance_id === 'string' && b.item_instance_id.trim() !== '' ? b.item_instance_id : null;
    const release = asked === null ? () => {} : await runs.holdForSubmission(asked);
    let logged: Date | null = null;
    try {
      const run = release && asked !== null ? runs.runOf(asked) : undefined;      // its run is on: holdForSubmission waited for an ending one
      const q = servable(b.item_id, servedInHalfMock(b.item_id, asked, run !== undefined));
      const { shape: item, key } = q;
      const id = text(b, 'item_instance_id');
      if (!release) throw refuse(409, CHOICE_RUN_OVER, CODE_RUN_OVER);
      const s = shownFor(id, q);
      if (b.shown_order !== undefined && JSON.stringify(b.shown_order) !== JSON.stringify(s.order)) {
        throw refuse(400, 'The options were shown in another order. Open the question again.');
      }
      // D16: asked before every result, with a one-click skip (null).
      const confidence = b.confidence === 1 || b.confidence === 2 || b.confidence === 3 || b.confidence === 4 ? b.confidence : null;
      if (confidence === null && b.confidence !== undefined && b.confidence !== null) throw refuse(400, 'confidence is 1, 2, 3 or 4, or left out.');
      // Graded before the instance opens: an answer that cannot be read is refused, never logged (Review Focus 5).
      let grade: ChoiceGrade;
      let chosen: string | null = null;
      let typed: string | undefined;
      if (item.kind === 'mcq') {
        if (typeof b.chosen !== 'string' || !s.order.includes(b.chosen)) throw refuse(400, 'Choose one of the options.');
        chosen = b.chosen;
        grade = gradeChoice(item, key, chosen);
      } else {
        if (typeof b.typed !== 'string') throw refuse(400, TYPED_REFUSALS.empty);
        if (item.typed === null || key.value === undefined) throw new Error(`${item.id} has no typed spec or no value in its key.`);
        const parsed = parseTyped(b.typed, item.typed);
        if (!parsed.ok) throw refuse(400, parsed.message);
        typed = b.typed;
        grade = gradeTyped(parsed.value, key.value, item.typed);
      }
      const i = open(id, q, s);
      if (run && isChoicePlan(run.plan)) {
        // S3-01 to S3-04: a timed GA4 run's item stays open until the run's end. Exam mode takes one answer and asks no
        // confidence (null); practice mode logs each change as a new attempt, and the last one before the end is scored.
        const exam = run.plan.mode === 'exam';
        if (exam && i.submitted > 0) throw refuse(409, ONE_ANSWER, CODE_ONE_ANSWER);
        i.noteSubmission(true, grade.correct);           // claimed before the first await: a second exam answer gets the 409 above
        const at = new Date();
        const attempt = attemptOf({ id, q, s, i, b, at, grade, chosen, typed, confidence: exam ? null : confidence });
        await d.logger.attempt(attempt);
        logged = at;
        const body: ChoiceSavedView = { saved: true, attempt_id: attempt.attempt_id };   // help waits: no correctness, key or explanation
        return c.json(body);
      }
      if (i.submitted > 0) throw refuse(409, 'This question already has an answer. Open it again to answer once more.');
      i.noteSubmission(true, grade.correct);             // claimed before the first await: a second answer gets the 409 above
      const at = new Date();
      const attempt = attemptOf({ id, q, s, i, b, at, grade, chosen, typed, confidence });
      await d.logger.attempt(attempt);
      logged = at;
      await d.writeClose(id, grade.correct ? 'pass' : 'left');     // S2-61: one answer, then the instance closes
      shown.delete(id);
      const body: ChoiceAnswerView = { correct: grade.correct, ...reveal(q), error_ids: grade.error_ids, attempt_id: attempt.attempt_id };
      return c.json(body);
    } finally {
      release?.(logged);
    }
  });

  app.post('/api/choice/show-answer', async (c) => {
    const b = await readBody(c);
    const q = servable(b.item_id);                       // a held-out item: 404, in its run, after it, always (S3-12)
    const id = text(b, 'item_instance_id');
    if (await runs.running(id)) throw refuse(409, HELP_WAITS);     // S3-03: help waits for the end-of-run review
    // S3-03 and S2-44: after a mini drill ends, its closed items open their answers in the review. The record names what the
    // logged close names, and the item stays closed; replay ignores help after a close.
    const done = d.state.current().instances.get(id);
    if (done && done.phase === 'drill' && done.block_id !== null && done.section !== 'sql') {
      if (done.item_id !== q.shape.id) throw refuse(400, OTHER_ITEM);
      await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: new Date().toISOString(), item_instance_id: id,
        item_id: done.item_id, target_concept_id: done.concept_id, phase: 'drill' });
      return c.json(reveal(q));
    }
    const i = open(id, q, shownFor(id, q));
    await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: new Date().toISOString(), item_instance_id: id,
      item_id: q.shape.id, target_concept_id: q.target_concept_id, phase: i.phase });
    i.noteSolution();
    return c.json(reveal(q));
  });
}

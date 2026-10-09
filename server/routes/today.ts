// server/routes/today.ts: Today's routes (design §4 "A study day"; rulings S2-29 to S2-40, S2-51; Task B13).
// GET /api/today and GET /api/goals/progress only read. POST /api/serve and POST /api/mixed/start mint servings
// (server/servings.ts), so every record of an item they serve carries the server's phase, block and repeat flag. Nothing
// here writes to the log: an item is logged only once the learner opens it.
// Sprint 4a (Task C2): the SQL review step holds the due mistake cards after the concept reviews, and /api/serve review serves a
// mistake card's trap item with its card_id (S4-07, S4-08); the wheel-spinning step and purpose (S4-10); the wrap-up's corrected
// query (S4-13); and Today never serves an item a live timed run holds (S4-15). mountToday hands its serving to the mistakes routes.
// Sprint 4b (Task D3): the SQL plan's daily case (S4B-15) and the opener's sketch and mid-level question (S4B-13, S4B-14); the next
// goal and GET /api/goals/progress read the one goal view (server/goal-view.ts), on the Amsterdam date of the request.
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import type { Phase, Section } from '../../core/envelope.ts';
import { effectiveDate, evaluateGoal, goalOpenInSection, nextGoal } from '../../core/goal-eval.ts';
import { parseMistakeCardId } from '../../core/replay.ts';
import { mixedConcepts, planToday, type ComposerInput } from '../../core/session.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { CaseRecord } from '../../schemas/case.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import { goalProgress, goalSummary, readGoalView } from '../goal-view.ts';
import { pendingRetests } from '../progress.ts';
import {
  choicePool, composerInput, dailyCase, isChoiceSection, lessonWindowEnds, lessonWindowOpen, loadPairs, mistakeReviewQueue, mixedBlock, nextPracticeConcept, openerInputs, openerItem,
  openerLevel, pickChoiceItem, pickItem, pickRetest, pickTrapItem, poolOf, pretestItemIds, seenIn, wheelSpinningItem, wheelSpinningSteps, withSqlSteps, type PairEntry,
  type TodayPlanView, type WheelSpinningStep,
} from '../session-composer.ts';
import type { ChoiceSection } from '../../schemas/choice.ts';
import { hidesLabels } from '../servings.ts';
import { LESSON_WINDOW_MS, trapItems } from '../state.ts';
import { correctedQuery, errorNameSource } from './mistakes.ts';

const SECTIONS: readonly Section[] = ['sql', 'ga4', 'methodology'];
/**
 * `practice` (Task C5) serves GA4 and Methodology practice: the map's Practice on a concept, and Today's practice step.
 * `wheel_spinning` (Task C2, S4-10) serves an SQL concept's easier E1 item in phase free: Today's wheel-spinning step's, or the named concept's.
 * `case` (sprint 4b, Task D1, S4B-07) serves the CP3 item of the case named by `case_id`, an opener included, in phase case: the case
 * screen's query step. Phase case hides the labels until submission (S2-39).
 */
const PURPOSES = ['review', 'new_concept', 'retest', 'relearning', 'opener', 'practice', 'wheel_spinning', 'case'] as const;
type Purpose = (typeof PURPOSES)[number];

/** The goal shapes live with the goal view (server/goal-view.ts), which Progress (Task E1) reads too. */
export type { GoalProgress, GoalSummary } from '../goal-view.ts';
/**
 * A level opener as the map and Today's preview read it (Task B15 follow-up, S2-51): its level, its title and the CP3 item a
 * learner works on. Never the model plan, the model answer, the brief or a checkpoint's prompt.
 */
export interface OpenerView { case_id: string; level: number; title: string; cp3_item_id: string }
/** What POST /api/serve answers (web/src/api.ts Served). A mistake card's review names no card here: its labels stay hidden (S2-39). */
export interface ServedView { item_id: string; item_instance_id: string; phase: Phase; block_id: string | null; repeat_exposure: boolean; hide_labels: boolean }
/** An item instance at its start: what "seen in the last 30 days" reads (S2-35). */
export interface SeenItem { item_id: string; started_at: string }
/**
 * Today's serving, which the mistakes routes (routes/mistakes.ts) serve through, so that what they serve is "seen" by Today's
 * picks, is forgotten at the session end like Today's own servings, and never is an item a live timed run holds (S4-15).
 */
export interface TodayServing {
  /** Closed instances from the replay, what Today and the mistakes routes served and nobody closed yet, and the live run's items. */
  seen(): SeenItem[];
  /** S4-15: the items the live timed run holds. */
  held(): ReadonlySet<string>;
  /** Mints a serving outside any block. `card_id` only for a mistake card's review (S4-08, D28). */
  serve(item: { id: string }, phase: Phase, block_id: string | null, repeat_exposure: boolean, at: Date, section?: Section, card_id?: string): string;
}
/** The wrap-up's corrected query (S4-13), or null; GET /api/today sends it for the SQL section only. */
export type { CorrectedQueryView } from './mistakes.ts';
/** GET /api/today's plan for SQL carries the wheel-spinning step (Task C2). */
export type { TodayPlanView, WheelSpinningStep };

const refuse = (status: 400 | 404, message: string): HTTPException => new HTTPException(status, { message });
/** S4-15: every item Today could serve here is in the timed run that is on. */
const HELD_BY_RUN = 'These exercises are in the timed run that is on. They come back here when it ends.';
async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Record<string, unknown>;
}
function sectionOf(v: unknown): Section {
  if (!SECTIONS.includes(v as Section)) throw refuse(400, 'Unknown section. Use sql, ga4 or methodology.');
  return v as Section;
}
const optionalText = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Task B12 adds the openers to the content store (S2-49); until then there are none. */
const openersOf = (content: ContentStore): CaseRecord[] => (content as ContentStore & { openers?: () => CaseRecord[] }).openers?.() ?? [];

/**
 * Mounts Today's routes and returns its serving (TodayServing). `liveRuns` (S4-15, sprint 3 record D2 S3): the open servings of the
 * timed run that is on (an SQL drill, a GA4 mini drill or a half-mock; server/app.ts asks the run clock), each at the run's start.
 * Today counts them as seen and never serves one of their items, so a run's item is never open outside its run, where help waits.
 */
export function mountToday(app: Hono, d: RouteDeps, liveRuns: () => readonly SeenItem[] = () => []): TodayServing {
  /**
   * What this module served in the open session: its item and time, for "seen in the last 30 days" until the replay holds
   * the instance's close (S2-35), and its block, for the session end.
   */
  const served = new Map<string, { item_id: string; at: string; block_id: string | null }>();
  /** The item kinds of the open session's review servings, oldest first (S2-35: at most 1 fix item in 3). */
  let reviewKinds: { session: string | null; kinds: string[] } = { session: null, kinds: [] };
  let pairs: Promise<PairEntry[]> | null = null;
  const registry = (): Promise<PairEntry[]> => (pairs ??= loadPairs().catch((e: unknown) => { pairs = null; throw e; }));
  const names = errorNameSource(d.content);

  /** S4-15: the items the live timed run holds. */
  const held = (): ReadonlySet<string> => new Set(liveRuns().map((s) => s.item_id));
  /** The items of `items` no live timed run holds (S4-15). */
  const free = <T extends { id: string }>(items: readonly T[], h: ReadonlySet<string> = held()): T[] => items.filter((i) => !h.has(i.id));

  /**
   * The composer's input for the section now. The attempt file is read once: the lesson windows (GA4, Methodology), the re-test
   * (server/progress.ts, only for Today's own plan) and the day's daily case (S4B-15, SQL) need it.
   */
  async function compose(section: Section, now: Date, withRetest: boolean): Promise<{ input: ComposerInput; plan: TodayPlanView; waiting: number }> {
    const r = d.state.current();
    const records = await d.logger.readAll('attempts');
    const sql = section === 'sql';
    // Fix round 1, I-1: a GA4 or Methodology card still inside its lesson window (S2-62, S2-02) waits out of Today's reviews.
    const windows = isChoiceSection(section)
      ? lessonWindowEnds(section, { replay: r, records, cardOf: (c) => d.state.catalog().cardOf(c), now, windowMs: LESSON_WINDOW_MS })
      : undefined;
    const base = composerInput({ content: d.content, replay: r, section, now, examDate: d.settings.exam_date, sessionId: d.session.currentId,
      pairs: await registry(), retest: null, openers: sql ? openerInputs(openersOf(d.content), d.content.curriculum, r) : [], lessonWindows: windows,
      dailyCase: sql ? dailyCase({ cases: d.content.cases?.() ?? [], replay: r, records, now }) : null });
    const waiting = windows ? [...r.cards.values()].filter((c) => windows.has(c.card_id) && Date.parse(c.snapshot.due) <= now.getTime()).length : 0;
    let retest: ComposerInput['retest'] = null;
    if (withRetest && sql) {
      const lessons = [...d.content.conceptsWithContent()].map((id) => d.content.lesson(id)).filter((l) => l !== undefined);
      retest = pickRetest(pendingRetests(records, lessons, now), base.concepts);
    }
    const input = { ...base, retest };
    const plan = planToday(input);
    if (section !== 'sql') return { input, plan, waiting };
    // S4-07, S4-08: the due mistake cards join the review step after the concept reviews; S4-10: the wheel-spinning steps.
    const extras = { mistakeReviews: mistakeReviewQueue(r, now, d.settings.exam_date),
      wheelSpinning: wheelSpinningSteps({ content: d.content, replay: r, now, seen: seen(), held: held() }) };
    return { input, plan: withSqlSteps(plan, extras), waiting };
  }
  /** Codex F21: the closes still being written of the cards in a plan's review step, or undefined when there are none. */
  const closingIn = (plan: TodayPlanView): Promise<unknown> | undefined => {
    const step = plan.steps.find((s) => s.kind === 'reviews') as { card_ids: string[] } | undefined;
    const writes = (step?.card_ids ?? []).flatMap((id) => d.servings.closeOf(id) ?? []);
    return writes.length ? Promise.all(writes) : undefined;
  };
  /** Closed instances from the replay, what this module served and nobody has closed yet, and the live timed run's items (S4-15). */
  const seen = (): SeenItem[] => [...seenIn(d.state.current()), ...[...served.values()].map((s) => ({ item_id: s.item_id, started_at: s.at })), ...liveRuns()];
  const serve = (item: { id: string }, phase: Phase, block_id: string | null, repeat_exposure: boolean, at: Date, section: Section = 'sql', card_id?: string): string => {
    const id = d.servings.serve({ phase, block_id, repeat_exposure, section, item_id: item.id, ...(card_id === undefined ? {} : { card_id }) });
    served.set(id, { item_id: item.id, at: at.toISOString(), block_id });
    return id;
  };

  /**
   * POST /api/serve for GA4 and Methodology (Task C5; design §4, §8; S2-35, S2-64). One item of a card's pool, drawn by
   * pickChoiceItem: never held out or inactive. `review` and `relearning` serve the step's first card as a review (labels
   * hidden, S2-39); `new_concept` and `practice` serve the named concept, or Today's, in phase free. A 10 concept practises on its
   * 06 parent's card (E-110). The answer, the "show answer" and the close go through the choice routes.
   */
  async function serveChoice(section: ChoiceSection, purpose: Purpose, b: Record<string, unknown>): Promise<ServedView> {
    if (purpose === 'retest' || purpose === 'opener' || purpose === 'case') throw refuse(404, 'GA4 and Methodology have no re-tests, level openers or cases.');
    if (purpose === 'wheel_spinning') throw refuse(404, 'The easier exercise is for SQL concepts.');
    const now = new Date();
    const h = held();
    /** S4-15: a card's pool without the items the live timed run holds. */
    const poolFor = (c: string) => free(choicePool(d.content, section, c), h);
    const { input, plan, waiting } = await compose(section, now, false);
    let concept = optionalText(b.concept_id);
    if (concept !== null) {
      const known = d.content.choiceConcept?.(concept);
      if (!known || known.section !== section) throw refuse(404, 'Unknown concept for this section.');
      concept = known.card_concept_id;
    }
    let phase: Phase = 'free';
    if (purpose === 'review' || purpose === 'relearning') {
      if (concept === null) {
        const step = plan.steps.find((s) => s.kind === (purpose === 'review' ? 'reviews' : 'relearning')) as { card_ids: string[] } | undefined;
        concept = input.cards.find((x) => x.card_id === step?.card_ids[0])?.concept_id ?? null;
      }
      if (concept === null && waiting > 0) throw refuse(404, 'No review is due now. A concept read in the last 15 minutes comes back for review after that.');
      if (concept === null) throw refuse(404, purpose === 'review' ? 'No review is due.' : 'No card fell due again in this session.');
      phase = 'review';
    } else if (purpose === 'new_concept') {
      if (concept === null) {
        const step = plan.steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null } | undefined;
        concept = step?.concept_id ?? (plan.anotherNewConcept.offered ? plan.anotherNewConcept.concept_id : null);
      }
      if (concept === null) throw refuse(404, 'No new concept is offered now. You can start one from the map.');
    } else if (concept === null) {
      // Today's practice step: the concepts started in the last 7 days, in turn.
      const step = plan.steps.find((s) => s.kind === 'mixed') as { concept_ids: string[] } | undefined;
      // S4-15: a concept whose questions are all in the live timed run waits its turn.
      const ids = step?.concept_ids ?? [];
      const open = ids.filter((c) => poolFor(c).length > 0);
      // D59: a concept still inside its lesson window goes after every other candidate.
      const inWindow = lessonWindowOpen(section, { replay: d.state.current(), records: await d.logger.readAll('attempts'), cardOf: (c) => d.state.catalog().cardOf(c), now, windowMs: LESSON_WINDOW_MS });
      concept = nextPracticeConcept(open.length ? open : ids, poolFor, seen(), now, inWindow);
      if (concept === null) throw refuse(404, 'Practice starts once you have begun a concept. Pick one on the map.');
    }
    const pick = pickChoiceItem({ now, pool: poolFor(concept), seen: seen() });
    if (!pick && choicePool(d.content, section, concept).length) throw refuse(404, HELD_BY_RUN);
    if (!pick) throw refuse(404, 'This concept has no practice questions yet.');
    const item_instance_id = serve(pick.item, phase, null, pick.repeat_exposure, now, section);
    return { item_id: pick.item.id, item_instance_id, phase, block_id: null, repeat_exposure: pick.repeat_exposure, hide_labels: hidesLabels(phase) };
  }

  app.get('/api/today', async (c) => {
    const section = sectionOf(c.req.query('section') ?? 'sql');
    const now = new Date();
    const today = amsterdamDate(now);
    const { plan } = await compose(section, now, true);
    // The next goal (S2-38) on the one goal view (server/goal-view.ts), evaluated on today's Amsterdam date, as Progress evaluates it.
    const view = await readGoalView(d);
    const evaluated = new Map(d.content.goals.map((g) => [g.id, evaluateGoal(g, view, today)]));
    const met = (id: string): boolean => evaluated.get(id)?.met ?? false;
    // S5A-18: GA4 and Methodology show the next goal with an unmet criterion in their section (H-R6: a met one does not count); with
    // none left, the next goal overall, marked `all_sections` so the line says so. SQL keeps S2-38's rule unchanged.
    const own = section === 'sql' ? null
      : nextGoal(d.content.goals, d.settings.goal_dates, today, met, (g) => goalOpenInSection(g, evaluated.get(g.id)!.criteria, section));
    const next = own ?? nextGoal(d.content.goals, d.settings.goal_dates, today, met);
    const all_sections = section !== 'sql' && own === null;
    // S4-13 (design §4 wrap-up): one corrected query from the mistake log, SQL only. The learner's own text, never a key's.
    const corrected_query = section === 'sql' ? correctedQuery(await d.logger.readAll('attempts'), await names(), held()) : null;
    return c.json({ plan, goal: next ? { goal: goalSummary(next), effective_date: effectiveDate(next, d.settings.goal_dates), criteria: evaluated.get(next.id)!.criteria,
      all_sections } : null, corrected_query });
  });

  /** S2-51: every level opener, in the store's case order, so the map can open each one at any time. A case with no level or no CP3 item is left out. */
  app.get('/api/openers', (c) => {
    const out: OpenerView[] = [];
    for (const o of openersOf(d.content)) {
      const level = openerLevel(o, d.content.curriculum);
      const cp3 = openerItem(o);
      if (level !== null && cp3 !== null) out.push({ case_id: o.case_id, level, title: o.title, cp3_item_id: cp3 });
    }
    return c.json(out);
  });

  app.get('/api/goals/progress', async (c) => {
    const goals = goalProgress(d.content.goals, await readGoalView(d), d.settings.goal_dates, amsterdamDate(new Date()));
    return c.json({ goals });
  });

  app.post('/api/serve', async (c) => {
    const b = await readBody(c);
    const section = sectionOf(b.section);
    if (!PURPOSES.includes(b.purpose as Purpose)) throw refuse(400, 'Unknown purpose.');
    const purpose = b.purpose as Purpose;
    if (isChoiceSection(section)) return c.json(await serveChoice(section, purpose, b));
    if (purpose === 'practice') throw refuse(404, 'SQL practice is in each concept\'s lesson, on the map.');
    const now = new Date();
    let { input, plan } = await compose(section, now, purpose === 'retest');
    // Codex F21: a card in the review step whose close is still being written waits for that close, and the plan is composed again
    // from the state it leaves, where the card is no longer due. Nothing below awaits before the serve, so the check holds.
    for (let w = purpose === 'review' ? closingIn(plan) : undefined; w !== undefined; w = closingIn(plan)) {
      await w;
      ({ input, plan } = await compose(section, now, false));
    }
    const r = d.state.current();
    let concept = optionalText(b.concept_id);
    let item: SqlItem | undefined;
    let phase: Phase;
    let repeat = false;
    let card_id: string | undefined;
    const h = held();
    if (purpose === 'review' || purpose === 'relearning') {
      if (reviewKinds.session !== d.session.currentId) reviewKinds = { session: d.session.currentId, kinds: [] };
      // The step's first card: lowest retrievability for reviews, the earliest due for relearning (S2-34).
      const step = plan.steps.find((s) => s.kind === (purpose === 'review' ? 'reviews' : 'relearning')) as { card_ids: string[] } | undefined;
      const mistakes = concept === null && purpose === 'review' && parseMistakeCardId(step?.card_ids[0] ?? '') !== null ? step!.card_ids : [];
      if (mistakes.length) {
        // S4-07, S4-08: the concept reviews are done and a mistake card comes first (they follow the concept cards in the step). Its
        // review is a trap item of its pair, served outside any block with its card_id; a card none of whose trap items is free
        // now (S4-15) gives way to the next one.
        for (const id of mistakes) {
          // Codex F20: a card that already has an open instance answers it (its own phase), so the card is not reviewed twice at once.
          const open = d.servings.openForCard(id);
          if (open) {
            const s = open.serving;
            return c.json<ServedView>({ item_id: s.item_id, item_instance_id: open.id, phase: s.phase, block_id: s.block_id, repeat_exposure: s.repeat_exposure, hide_labels: hidesLabels(s.phase) });
          }
          const pair = parseMistakeCardId(id)!;
          const p = pickTrapItem({ now, traps: free(trapItems(d.content, pair.concept_id, pair.error_id), h), errorId: pair.error_id, seen: seen() });
          if (!p) continue;
          ({ item } = p);
          repeat = p.repeat_exposure;
          card_id = id;
          break;
        }
        if (!item) {
          // Sprint 4c A5: a card whose concept has no trap item at all is skipped, and the card stays due. When that is every card, there
          // is nothing to review. When items exist but the live run holds them (S4-15), say so as before.
          const anyTrap = mistakes.some((id) => { const q = parseMistakeCardId(id)!; return trapItems(d.content, q.concept_id, q.error_id).length > 0; });
          throw refuse(404, anyTrap ? 'No exercise is free now for the mistake cards due.' : 'No review is due.');
        }
      } else {
        if (concept === null) concept = input.cards.find((x) => x.card_id === step?.card_ids[0])?.concept_id ?? null;
        if (concept === null) throw refuse(404, purpose === 'review' ? 'No review is due.' : 'No card fell due again in this session.');
        const pool = poolOf(d.content, concept);
        const args = { now, seen: seen(), firstExposureAt: r.concepts.get(concept)?.firstExposureAt ?? null, recentReviewKinds: reviewKinds.kinds, purpose: 'review' as const };
        const p = pickItem({ ...args, pool: free(pool, h) });
        if (!p && pickItem({ ...args, pool })) throw refuse(404, HELD_BY_RUN);      // S4-15: every review item is in the live run
        if (!p) throw refuse(404, 'This concept has no review items yet.');
        ({ item } = p);
        repeat = p.repeat_exposure;
      }
      phase = 'review';
      reviewKinds.kinds.push(item.kind);
    } else if (purpose === 'wheel_spinning') {
      // S4-10: the easier E1 item of Today's wheel-spinning concept, or of the concept the learner names (nothing is locked).
      if (concept === null) concept = (plan.steps.find((s) => s.kind === 'wheel_spinning') as WheelSpinningStep | undefined)?.concept_id ?? null;
      if (concept === null) throw refuse(404, 'No concept needs an easier exercise now.');
      const p = wheelSpinningItem({ now, pool: free(poolOf(d.content, concept), h), seen: seen() });
      if (!p) throw refuse(404, 'This concept has no easier exercise free now.');
      ({ item } = p);
      repeat = p.repeat_exposure;
      phase = 'free';
    } else if (purpose === 'new_concept') {
      // The concept Today offers (S2-29), or the one the learner names: nothing is locked, so a held one can still start.
      if (concept === null) {
        const step = plan.steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null } | undefined;
        concept = step?.concept_id ?? (plan.anotherNewConcept.offered ? plan.anotherNewConcept.concept_id : null);
      }
      // S3-17: the pretest's first item, a write item when the concept has a predict pretest item.
      const first = concept === null ? undefined : pretestItemIds(d.content, concept)[0];
      item = first === undefined ? undefined : d.content.item(first);
      if (!item) throw refuse(404, 'No new concept is offered now. You can start one from the map.');
      phase = 'pretest';
    } else if (purpose === 'retest') {
      const id = concept === null ? input.retest?.item_id : d.content.lesson(concept)?.retest_item_id;
      item = id === undefined ? undefined : d.content.item(id);
      if (!item) throw refuse(404, 'No re-test is waiting.');
      phase = 'retest';
    } else if (purpose === 'case') {
      // S4B-07: the named case's CP3 item, whatever its kind; the case screen always names its case.
      const caseId = optionalText(b.case_id);
      if (caseId === null) throw refuse(400, 'case_id is missing.');
      const record = d.content.case?.(caseId) ?? openersOf(d.content).find((x) => x.case_id === caseId);
      const id = record ? openerItem(record) : null;
      item = id === null ? undefined : d.content.item(id);
      if (!item) throw refuse(404, 'Unknown case, or it has no query to write.');
      phase = 'case';
    } else {
      // S2-51: the opener Today recommends for solving, or the one the learner names (always openable from the map): its CP3 item. Since
      // sprint 4b (Task D3) Today's opener steps open the case screen instead, at the first checkpoint with no pass; this purpose stays.
      const step = plan.steps.find((s) => s.kind === 'opener' && s.mode === 'solve') as { case_id: string } | undefined;
      const caseId = optionalText(b.case_id) ?? step?.case_id ?? null;
      const record = openersOf(d.content).find((x) => x.case_id === caseId);
      const id = record ? openerItem(record) : null;
      item = id === null ? undefined : d.content.item(id);
      if (!item) throw refuse(404, 'No opener to solve now.');
      phase = 'case';
    }
    const item_instance_id = serve(item, phase, null, repeat, now, 'sql', card_id);
    const body: ServedView = { item_id: item.id, item_instance_id, phase, block_id: null, repeat_exposure: repeat, hide_labels: hidesLabels(phase) };
    return c.json(body);
  });

  app.post('/api/mixed/start', async (c) => {
    const section = sectionOf((await readBody(c)).section);
    if (section !== 'sql') throw refuse(404, 'Mixed practice for this section comes with its content.');
    const now = new Date();
    const { input } = await compose(section, now, false);
    const r = d.state.current();
    const catalog = d.state.catalog();
    const h = held();
    // S4-15: never an item the live timed run holds. S4-08: a block's items never carry a card_id, so it holds no mistake-card review.
    const picks = mixedBlock({ concepts: mixedConcepts(input.concepts, input.pairs, now), poolOf: (x) => free(poolOf(d.content, x), h), cardOf: (x) => catalog.cardOf(x),
      seen: seen(), firstExposureOf: (x) => r.concepts.get(x)?.firstExposureAt ?? null, now, pairs: input.pairs });
    if (!picks.length) throw refuse(404, 'Mixed practice starts once you have begun a concept.');
    const block_id = randomUUID();
    const servings = picks.map((p) => ({ item_id: p.item.id, item_instance_id: serve(p.item, 'mixed', block_id, p.repeat_exposure, now) }));
    return c.json({ block_id, servings });
  });

  /**
   * At a session end (B7 carry-in): a serving nobody opened is forgotten, since nothing was logged for it. One outside a
   * block is forgotten whether or not it was opened: an opened instance keeps its serving's phase, block and repeat flag
   * itself, and the app's own hook, which runs after this one, closes it. A block is forgotten only when none of its
   * items was opened (no record names one); the app's hook closes a started block and marks the rest of it closed.
   */
  d.endHooks.push(async () => {
    const blocks = new Map<string, string[]>();
    for (const [id, s] of served) {
      if (s.block_id === null) d.servings.forget(id);
      else blocks.set(s.block_id, [...(blocks.get(s.block_id) ?? []), id]);
    }
    if (blocks.size) {
      const named = new Set(((await d.logger.readAll('attempts')) as { item_instance_id?: unknown }[]).map((x) => x.item_instance_id));
      for (const ids of blocks.values()) if (!ids.some((id) => named.has(id))) for (const id of ids) d.servings.forget(id);
    }
    served.clear();
    reviewKinds = { session: null, kinds: [] };
  });
  return { seen, held, serve };
}

// server/routes/today.ts: Today's routes (design §4 "A study day"; rulings S2-29 to S2-40, S2-51; Task B13).
// GET /api/today and GET /api/goals/progress only read. POST /api/serve and POST /api/mixed/start mint servings
// (server/servings.ts), so every record of an item they serve carries the server's phase, block and repeat flag. Nothing
// here writes to the log: an item is logged only once the learner opens it.
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { randomUUID } from 'node:crypto';
import type { Phase, Section } from '../../core/envelope.ts';
import { effectiveDate, evaluateGoal, nextGoal, type CriterionResult, type GoalView } from '../../core/goal-eval.ts';
import type { Goal } from '../../core/goals.ts';
import { mixedConcepts, planToday, type ComposerInput, type TodayPlan } from '../../core/session.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { CaseRecord } from '../../schemas/case.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import { pendingRetests } from '../progress.ts';
import {
  choicePool, composerInput, isChoiceSection, lessonWindowEnds, loadPairs, mixedBlock, nextPracticeConcept, openerInputs, openerItem, openerLevel, pickChoiceItem, pickItem,
  pickRetest, poolOf, pretestItemIds, seenIn, type PairEntry,
} from '../session-composer.ts';
import type { ChoiceSection } from '../../schemas/choice.ts';
import { LESSON_WINDOW_MS } from '../state.ts';

const SECTIONS: readonly Section[] = ['sql', 'ga4', 'methodology'];
/** `practice` (Task C5) serves GA4 and Methodology practice: the map's Practice on a concept, and Today's practice step. */
const PURPOSES = ['review', 'new_concept', 'retest', 'relearning', 'opener', 'practice'] as const;
type Purpose = (typeof PURPOSES)[number];
/** S2-39: these phases hide the concept name, lesson title, level badge and item ID until after submission. */
const HIDDEN_LABELS: ReadonlySet<Phase> = new Set(['review', 'mixed', 'drill', 'case']);

/** A goal without its criteria's definitions, which the evaluated criteria replace (a live-practice window is not study time). */
export interface GoalSummary { id: string; title: string; target_date: string; stage: number | null }
export interface GoalProgress { goal: GoalSummary; effective_date: string; met: boolean; criteria: CriterionResult[] }
const summary = (g: Goal): GoalSummary => ({ id: g.id, title: g.title, target_date: g.target_date, stage: g.stage });
/**
 * A level opener as the map and Today's preview read it (Task B15 follow-up, S2-51): its level, its title and the CP3 item a
 * learner works on. Never the model plan, the model answer, the brief or a checkpoint's prompt.
 */
export interface OpenerView { case_id: string; level: number; title: string; cp3_item_id: string }
/** What POST /api/serve answers (web/src/api.ts Served). */
export interface ServedView { item_id: string; item_instance_id: string; phase: Phase; block_id: string | null; repeat_exposure: boolean; hide_labels: boolean }

const refuse = (status: 400 | 404, message: string): HTTPException => new HTTPException(status, { message });
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

export function mountToday(app: Hono, d: RouteDeps): void {
  /**
   * What this module served in the open session: its item and time, for "seen in the last 30 days" until the replay holds
   * the instance's close (S2-35), and its block, for the session end.
   */
  const served = new Map<string, { item_id: string; at: string; block_id: string | null }>();
  /** The item kinds of the open session's review servings, oldest first (S2-35: at most 1 fix item in 3). */
  let reviewKinds: { session: string | null; kinds: string[] } = { session: null, kinds: [] };
  let pairs: Promise<PairEntry[]> | null = null;
  const registry = (): Promise<PairEntry[]> => (pairs ??= loadPairs().catch((e: unknown) => { pairs = null; throw e; }));

  /** The composer's input for the section now. The re-test needs the attempt file (server/progress.ts), so only Today reads it. */
  async function compose(section: Section, now: Date, withRetest: boolean): Promise<{ input: ComposerInput; plan: TodayPlan; waiting: number }> {
    const r = d.state.current();
    // Fix round 1, I-1: a GA4 or Methodology card still inside its lesson window (S2-62, S2-02) waits out of Today's reviews.
    const windows = isChoiceSection(section)
      ? lessonWindowEnds(section, { replay: r, records: await d.logger.readAll('attempts'), cardOf: (c) => d.state.catalog().cardOf(c), now, windowMs: LESSON_WINDOW_MS })
      : undefined;
    const base = composerInput({ content: d.content, replay: r, section, now, examDate: d.settings.exam_date, sessionId: d.session.currentId,
      pairs: await registry(), retest: null, openers: section === 'sql' ? openerInputs(openersOf(d.content), d.content.curriculum, r) : [], lessonWindows: windows });
    const waiting = windows ? [...r.cards.values()].filter((c) => windows.has(c.card_id) && Date.parse(c.snapshot.due) <= now.getTime()).length : 0;
    let retest: ComposerInput['retest'] = null;
    if (withRetest && section === 'sql') {
      const lessons = [...d.content.conceptsWithContent()].map((id) => d.content.lesson(id)).filter((l) => l !== undefined);
      retest = pickRetest(pendingRetests(await d.logger.readAll('attempts'), lessons, now), base.concepts);
    }
    const input = { ...base, retest };
    return { input, plan: planToday(input), waiting };
  }
  /** Closed instances from the replay, plus what this module served and nobody has closed yet. */
  const seen = (): { item_id: string; started_at: string }[] => [...seenIn(d.state.current()), ...[...served.values()].map((s) => ({ item_id: s.item_id, started_at: s.at }))];
  const serve = (item: { id: string }, phase: Phase, block_id: string | null, repeat_exposure: boolean, at: Date, section: Section = 'sql'): string => {
    const id = d.servings.serve({ phase, block_id, repeat_exposure, section, item_id: item.id });
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
    if (purpose === 'retest' || purpose === 'opener') throw refuse(404, 'GA4 and Methodology have no re-tests or level openers.');
    const now = new Date();
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
      concept = nextPracticeConcept(step?.concept_ids ?? [], (c) => choicePool(d.content, section, c), seen(), now);
      if (concept === null) throw refuse(404, 'Practice starts once you have begun a concept. Pick one on the map.');
    }
    const pick = pickChoiceItem({ now, pool: choicePool(d.content, section, concept), seen: seen() });
    if (!pick) throw refuse(404, 'This concept has no practice questions yet.');
    const item_instance_id = serve(pick.item, phase, null, pick.repeat_exposure, now, section);
    return { item_id: pick.item.id, item_instance_id, phase, block_id: null, repeat_exposure: pick.repeat_exposure, hide_labels: HIDDEN_LABELS.has(phase) };
  }

  async function goalView(): Promise<GoalView> {
    const r = d.state.current();
    const externals = ((await d.logger.readAll('events')) as { event?: unknown; kind?: unknown; data?: unknown }[])
      .filter((e) => e.event === 'external_result' && (e.kind === 'ga4_exam' || e.kind === 'portfolio_piece'))
      .map((e) => ({ kind: e.kind as 'ga4_exam' | 'portfolio_piece', data: e.data }));
    return {
      // D12 and D13: GA4 and Methodology have level 1 only; a section with no concepts file is "not yet available" (Task C8).
      conceptsOf: (section, maxLevel) => (section === 'sql'
        ? d.content.curriculum.concepts.filter((c) => c.level <= maxLevel).map((c) => c.id)
        : (d.content.choiceConcepts?.(section) ?? []).filter((c) => c.level !== null && c.level <= maxLevel).map((c) => c.id)),
      stateOf: (id) => r.concepts.get(id)?.state ?? 'new',
      externals,
      mocksPassed: new Set(),                                   // no mock is built yet
    };
  }

  app.get('/api/today', async (c) => {
    const section = sectionOf(c.req.query('section') ?? 'sql');
    const now = new Date();
    const { plan } = await compose(section, now, true);
    const view = await goalView();
    const evaluated = new Map(d.content.goals.map((g) => [g.id, evaluateGoal(g, view)]));
    const next = nextGoal(d.content.goals, d.settings.goal_dates, amsterdamDate(now), (id) => evaluated.get(id)?.met ?? false);
    return c.json({ plan, goal: next ? { goal: summary(next), effective_date: effectiveDate(next, d.settings.goal_dates), criteria: evaluated.get(next.id)!.criteria } : null });
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
    const view = await goalView();
    const goals: GoalProgress[] = d.content.goals.map((g) => {
      const e = evaluateGoal(g, view);
      return { goal: summary(g), effective_date: effectiveDate(g, d.settings.goal_dates), met: e.met, criteria: e.criteria };
    });
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
    const { input, plan } = await compose(section, now, purpose === 'retest');
    const r = d.state.current();
    let concept = optionalText(b.concept_id);
    let item: SqlItem | undefined;
    let phase: Phase;
    let repeat = false;
    if (purpose === 'review' || purpose === 'relearning') {
      // The step's first card: lowest retrievability for reviews, the earliest due for relearning (S2-34).
      if (concept === null) {
        const step = plan.steps.find((s) => s.kind === (purpose === 'review' ? 'reviews' : 'relearning')) as { card_ids: string[] } | undefined;
        concept = input.cards.find((x) => x.card_id === step?.card_ids[0])?.concept_id ?? null;
      }
      if (concept === null) throw refuse(404, purpose === 'review' ? 'No review is due.' : 'No card fell due again in this session.');
      if (reviewKinds.session !== d.session.currentId) reviewKinds = { session: d.session.currentId, kinds: [] };
      const p = pickItem({ now, pool: poolOf(d.content, concept), seen: seen(), firstExposureAt: r.concepts.get(concept)?.firstExposureAt ?? null,
        recentReviewKinds: reviewKinds.kinds, purpose: 'review' });
      if (!p) throw refuse(404, 'This concept has no review items yet.');
      ({ item } = p);
      repeat = p.repeat_exposure;
      phase = 'review';
      reviewKinds.kinds.push(p.item.kind);
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
    } else {
      // S2-51: the opener Today recommends for solving, or the one the learner names (always openable from the map).
      const step = plan.steps.find((s) => s.kind === 'opener' && s.mode === 'solve') as { case_id: string } | undefined;
      const caseId = optionalText(b.case_id) ?? step?.case_id ?? null;
      const record = openersOf(d.content).find((x) => x.case_id === caseId);
      const id = record ? openerItem(record) : null;
      item = id === null ? undefined : d.content.item(id);
      if (!item) throw refuse(404, 'No opener to solve now.');
      phase = 'case';
    }
    const item_instance_id = serve(item, phase, null, repeat, now);
    return c.json({ item_id: item.id, item_instance_id, phase, block_id: null, repeat_exposure: repeat, hide_labels: HIDDEN_LABELS.has(phase) });
  });

  app.post('/api/mixed/start', async (c) => {
    const section = sectionOf((await readBody(c)).section);
    if (section !== 'sql') throw refuse(404, 'Mixed practice for this section comes with its content.');
    const now = new Date();
    const { input } = await compose(section, now, false);
    const r = d.state.current();
    const catalog = d.state.catalog();
    const picks = mixedBlock({ concepts: mixedConcepts(input.concepts, input.pairs, now), poolOf: (x) => poolOf(d.content, x), cardOf: (x) => catalog.cardOf(x),
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
}

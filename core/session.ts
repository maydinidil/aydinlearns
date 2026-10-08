// core/session.ts: Today's recommended session (design §4 "A study day"; rulings S2-29 to S2-40, S2-51; sprint 4b S4B-13 to S4B-15).
// A pure function of what the caller passes in: the cards, the concepts, the review history's counts, the openers and the day's
// daily case. Domain-free (design §15):
// no SQL, no files, no app code. Sessions are defined by content, never by time: no step carries a duration (design §4).
import type { Section } from './envelope.ts';
import { amsterdamMidnightAfter } from './replay.ts';
import type { ConceptStateName } from './states.ts';
import { amsterdamDate } from './time.ts';

export interface ComposerCard { card_id: string; concept_id: string; due: string; retrievability: number; rated: boolean }
export interface ComposerConcept {
  id: string; order: number; level: number | null; state: ConceptStateName; hasContent: boolean;
  firstExposureAt: string | null; leech: boolean; refresherDue: boolean;
}
/**
 * S2-31. `completedPerStudyDay`: the completed scheduled reviews on each of the last 7 study days before today.
 * `scheduledLast7`: the completed scheduled reviews of the last 7 Amsterdam dates, and how many were rated Hard, Good or Easy.
 */
export interface ReviewStats { completedPerStudyDay: number[]; scheduledLast7: { passed: number; total: number } }
/**
 * A level's opener (S2-49, S2-51). `solved` (S4B-08): every auto-graded checkpoint it lists has a pass. Sprint 4b (Task D3) adds what
 * Today's opener steps say, each optional, absent meaning no or none: `sketch`, the preview offers the sketch (S4B-13: no passing CP3
 * and no sketch logged); `cp1Unanswered`, it lists a CP1, the mid-level question, with no answer yet (S4B-14); `nextCheckpoint`, its
 * first auto-graded checkpoint with no pass, in its own order, where the solve step opens the case screen (B2 review).
 */
export interface ComposerOpener {
  case_id: string; level: number; solved: boolean;
  sketch?: boolean; cp1Unanswered?: boolean; nextCheckpoint?: string | null;
}
/** S4B-15: the day's daily case (server/session-composer.ts dailyCase), and whether it is solved. */
export interface ComposerDailyCase { case_id: string; done: boolean }
export interface ComposerInput {
  section: Section; now: Date; cards: ComposerCard[]; concepts: ComposerConcept[]; stats: ReviewStats;
  newConceptsToday: number; dailyNewCap: number; pairs: [string, string][]; useIntakeGuard: boolean;
  retest: { concept_id: string; item_id: string; ready: boolean; ready_at: string } | null;
  sessionNewConceptDone: boolean;
  /** Added in Task B13 (S2-34): when the open session started. A card that fell due after it is relearning. Absent: no session. */
  sessionStart?: string | null;
  /** Added in Task B13 (S2-51): the section's level openers. Absent: none. */
  openers?: ComposerOpener[];
  /** Added in Task B13's fix round: the open session has done a mixed block, so the plan leaves it out. Starting another stays open. */
  sessionMixedDone?: boolean;
  /** Sprint 4b (S4B-15): the day's daily case, SQL only. Absent or null: none. */
  dailyCase?: ComposerDailyCase | null;
}
export type TodayStep =
  | { kind: 'micro_lesson'; concept_id: string }
  | { kind: 'refresher'; concept_id: string }
  | { kind: 'reviews'; card_ids: string[] }
  /** `reason` (added in Task B13) says why a concept is held back: the intake guard or the daily cap. */
  | { kind: 'new_concept'; concept_id: string | null; held_back: string | null; reason: string | null }
  | { kind: 'mixed'; concept_ids: string[] }
  | { kind: 'retest'; concept_id: string; item_id: string; ready: boolean; ready_at: string }
  | { kind: 'relearning'; card_ids: string[] }
  /** S2-51, S4B-13: read before the level's first concept; `sketch`, it offers the optional sketch. */
  | { kind: 'opener'; case_id: string; mode: 'preview'; sketch: boolean }
  /** S4B-14: the mid-level question, the opener's CP1. */
  | { kind: 'opener'; case_id: string; mode: 'check' }
  /** S2-51: recommended once the level is at Practised; `checkpoint` is where the case screen opens (null: the screen picks). */
  | { kind: 'opener'; case_id: string; mode: 'solve'; checkpoint: string | null }
  /** S4B-15: the day's daily case; `done` once it is solved, so solving it never brings a second one that day. */
  | { kind: 'daily_case'; case_id: string; done: boolean };
export interface TodayPlan {
  section: Section; steps: TodayStep[]; minimumDay: TodayStep[];
  anotherNewConcept: { offered: boolean; concept_id: string | null; reason: string | null }; dueTomorrow: number;
}

/** RULE-10: at most 3 new concepts a day are offered (S2-30). */
export const DAILY_NEW_CAP = 3;
/** S2-32: one mixed block of 6, one item per card. */
export const MIXED_BLOCK_SIZE = 6;
/** S2-31 (LE-06). */
const INTAKE_FLOOR = 8;
const SUCCESS_MIN_REVIEWS = 15;
/** S2-32: "first exposed in the last 7 days", as Amsterdam dates, today included. */
const RECENT_DATES = 7;
/** Practised or better: the states S2-51's solve step, S4B-14's mid-level question and S4B-15's daily case count. */
export const AT_LEAST_PRACTISED: ReadonlySet<ConceptStateName> = new Set(['practised', 'mastered', 'retained']);
const DAY_MS = 86_400_000;

const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const byOrder = (a: ComposerConcept, b: ComposerConcept): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * S2-31 (design §4, LE-06). Holds the new concept when the due reviews outnumber the learner's usual day, the median
 * completed reviews per study day with a floor of 8, or when at least 15 scheduled reviews in the last 7 days passed less
 * than 80% of the time. The due count is whole, so "more than a median of 12.5" is "more than 12", and 12 is the day shown.
 */
export function intakeGuard(dueCount: number, stats: ReviewStats): { hold: boolean; reason: string | null } {
  const usual = Math.max(INTAKE_FLOOR, Math.floor(median(stats.completedPerStudyDay) ?? 0));
  if (dueCount > usual) {
    return { hold: true, reason: `No new concept today: ${dueCount} reviews are due, more than your usual day (${usual}). Clear some reviews first, or start one from the map.` };
  }
  const { passed, total } = stats.scheduledLast7;
  if (total >= SUCCESS_MIN_REVIEWS && passed * 5 < total * 4) {          // passed / total < 80%, in whole numbers
    return { hold: true, reason: `Recent reviews passed less than 80% of the time (${passed} of ${total}). A new concept can wait; you can still start one from the map.` };
  }
  return { hold: false, reason: null };
}

/** S2-29: the lowest `order` concept whose state is New and whose content has shipped. */
export function nextNewConcept(concepts: readonly ComposerConcept[]): ComposerConcept | null {
  return [...concepts].filter((c) => c.state === 'new' && c.hasContent).sort(byOrder)[0] ?? null;
}

/** The registry partners of each concept (design §5). */
function partnerMap(pairs: readonly [string, string][]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (a: string, b: string): void => { const l = out.get(a) ?? []; if (!l.includes(b)) l.push(b); out.set(a, l); };
  for (const [a, b] of pairs) if (a !== b) { add(a, b); add(b, a); }
  return out;
}

/**
 * S2-32: the mixed block's concepts. Concepts first exposed in the last 7 Amsterdam dates, newest first, each followed by its
 * registry partners at Practised or better, at most `size` of them: the block draws one item per card (design §5, "a card
 * already rated in the current block is not served again in that block"). Only concepts whose content has shipped.
 */
export function mixedConcepts(concepts: readonly ComposerConcept[], pairs: readonly [string, string][], now: Date, size = MIXED_BLOCK_SIZE): string[] {
  const from = addDays(amsterdamDate(now), 1 - RECENT_DATES);
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const recent = concepts
    .filter((c) => c.hasContent && c.firstExposureAt !== null && Date.parse(c.firstExposureAt) <= now.getTime()
      && amsterdamDate(new Date(c.firstExposureAt)) >= from)
    .sort((a, b) => Date.parse(b.firstExposureAt!) - Date.parse(a.firstExposureAt!) || byOrder(a, b));
  const partners = partnerMap(pairs);
  const out: string[] = [];
  const add = (id: string): void => { if (out.length < size && !out.includes(id)) out.push(id); };
  for (const c of recent) {
    add(c.id);
    for (const p of partners.get(c.id) ?? []) {
      const pc = byId.get(p);
      if (pc && pc.hasContent && AT_LEAST_PRACTISED.has(pc.state)) add(p);
    }
  }
  return out;
}

/** Why Today offers no new concept now, or null when it may offer one: the daily cap (S2-30), then the intake guard (S2-31). */
function newConceptHold(input: ComposerInput, dueCount: number): string | null {
  if (input.newConceptsToday >= input.dailyNewCap) {
    return `No new concept now: ${input.newConceptsToday} new concepts were started today, the most Today suggests. You can still start one from the map.`;
  }
  return input.useIntakeGuard ? intakeGuard(dueCount, input.stats).reason : null;
}

/** S2-37: cards due after `now` and on or before the end of tomorrow's Amsterdam date. */
function dueTomorrow(cards: readonly ComposerCard[], now: Date): number {
  const end = amsterdamMidnightAfter(amsterdamMidnightAfter(now)).getTime();   // 00:00 Amsterdam on the date after tomorrow
  return cards.filter((c) => { const t = Date.parse(c.due); return t > now.getTime() && t < end; }).length;
}

/** S2-51: each level's first concept (lowest order). */
function firstOfLevel(concepts: readonly ComposerConcept[], level: number): ComposerConcept | null {
  return [...concepts].filter((c) => c.level === level).sort(byOrder)[0] ?? null;
}

/**
 * Today's plan (design §4; S2-40): micro-lessons, refreshers, reviews, the new concept, the mixed block, the daily case (S4B-15,
 * design §4 block 4), the re-test, relearning; the wrap-up and "another new concept" follow the steps. An opener (S2-51) is read-only
 * just before the new concept that opens its level, with the sketch when it offers one (S4B-13); after the daily case it is
 * recommended for solving once its level is at Practised, or, before that, its CP1 is asked once half the level is (S4B-14).
 * A step with nothing in it is left out. Every step recommends; none waits for another (nothing is locked).
 */
export function planToday(input: ComposerInput): TodayPlan {
  const { now, concepts } = input;
  const t = now.getTime();
  const ordered = [...concepts].sort(byOrder);
  const steps: TodayStep[] = [];

  // Design §5 "Leech" and "Demotion": the micro-lesson at the top; it holds the worked examples, so a leech needs no refresher too.
  for (const c of ordered) if (c.leech) steps.push({ kind: 'micro_lesson', concept_id: c.id });
  for (const c of ordered) if (c.refresherDue && !c.leech) steps.push({ kind: 'refresher', concept_id: c.id });

  // S2-31: due means due now, unrated fallback cards included. S2-34: a card that fell due during the open session comes back
  // as relearning, after the mixed block and the re-test.
  const due = input.cards.filter((c) => Date.parse(c.due) <= t);
  const sessionStart = input.sessionStart ? Date.parse(input.sessionStart) : NaN;
  const fellDueInSession = (c: ComposerCard): boolean => !Number.isNaN(sessionStart) && Date.parse(c.due) > sessionStart;
  const reviews = due.filter((c) => !fellDueInSession(c))
    .sort((a, b) => a.retrievability - b.retrievability || Date.parse(a.due) - Date.parse(b.due) || (a.card_id < b.card_id ? -1 : 1));
  const relearning = due.filter(fellDueInSession).sort((a, b) => Date.parse(a.due) - Date.parse(b.due) || (a.card_id < b.card_id ? -1 : 1));
  if (reviews.length) steps.push({ kind: 'reviews', card_ids: reviews.map((c) => c.card_id) });

  const next = nextNewConcept(concepts);
  const openers = input.openers ?? [];
  if (next && next.level !== null && firstOfLevel(concepts, next.level)?.id === next.id) {
    const o = openers.find((x) => x.level === next.level);
    if (o) steps.push({ kind: 'opener', case_id: o.case_id, mode: 'preview', sketch: o.sketch === true });
  }
  const hold = next ? newConceptHold(input, due.length) : null;
  if (next && !input.sessionNewConceptDone) {
    steps.push({ kind: 'new_concept', concept_id: hold ? null : next.id, held_back: hold ? next.id : null, reason: hold });
  }

  const mixed = input.sessionMixedDone ? [] : mixedConcepts(concepts, input.pairs, now);
  if (mixed.length) steps.push({ kind: 'mixed', concept_ids: mixed });
  if (input.dailyCase) steps.push({ kind: 'daily_case', case_id: input.dailyCase.case_id, done: input.dailyCase.done });
  for (const o of [...openers].sort((a, b) => a.level - b.level)) {
    const level = concepts.filter((c) => c.level === o.level);
    if (!level.length) continue;
    const practised = level.filter((c) => AT_LEAST_PRACTISED.has(c.state)).length;
    if (!o.solved && practised === level.length) steps.push({ kind: 'opener', case_id: o.case_id, mode: 'solve', checkpoint: o.nextCheckpoint ?? null });
    else if (o.cp1Unanswered === true && practised * 2 >= level.length) steps.push({ kind: 'opener', case_id: o.case_id, mode: 'check' });
  }
  if (input.retest) steps.push({ kind: 'retest', ...input.retest });
  if (relearning.length) steps.push({ kind: 'relearning', card_ids: relearning.map((c) => c.card_id) });

  // "Another new concept" comes after the wrap-up, once the session's own new concept is done.
  const anotherNewConcept: TodayPlan['anotherNewConcept'] = !input.sessionNewConceptDone ? { offered: false, concept_id: null, reason: null }
    : !next ? { offered: false, concept_id: null, reason: 'Every concept with content has been started.' }
    : hold ? { offered: false, concept_id: null, reason: hold }
    : { offered: true, concept_id: next.id, reason: null };

  return {
    section: input.section, steps,
    minimumDay: steps.filter((s) => s.kind === 'reviews' || s.kind === 'relearning'),
    anotherNewConcept, dueTomorrow: dueTomorrow(input.cards, now),
  };
}

/**
 * RULE-11 and S2-32: the items reordered so that no two consecutive items share a concept whenever some order allows it,
 * and, where that costs nothing, an item is followed by one of a registry partner, so look-alikes sit side by side. Items of
 * one concept keep their order. Deterministic: ties go to the concepts' order along the registry chains, in input order.
 */
export function interleave<T extends { concept_id: string }>(items: T[], pairs: [string, string][]): T[] {
  const queues = new Map<string, T[]>();
  for (const x of items) queues.set(x.concept_id, [...(queues.get(x.concept_id) ?? []), x]);
  const partners = partnerMap(pairs.filter(([a, b]) => queues.has(a) && queues.has(b)));
  // Each registry chain, walked from an end, so partners follow one another; unpaired concepts stand alone.
  const rank = new Map<string, number>();
  for (const start of queues.keys()) {
    if (rank.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    while (stack.length) {
      const c = stack.pop()!;
      if (component.includes(c)) continue;
      component.push(c);
      for (const p of partners.get(c) ?? []) stack.push(p);
    }
    const inOrder = [...queues.keys()].filter((c) => component.includes(c));
    let at: string | undefined = inOrder.find((c) => (partners.get(c)?.length ?? 0) <= 1) ?? inOrder[0];
    while (at !== undefined) {
      rank.set(at, rank.size);
      at = (partners.get(at) ?? []).find((p) => !rank.has(p));
      if (at === undefined) at = inOrder.find((c) => !rank.has(c));
    }
  }

  const left = new Map([...queues].map(([c, q]) => [c, q.length]));
  let remaining = items.length;
  /** Whether the rest can still be ordered without a repeat after `pick` (no concept may need more gaps than remain). */
  const feasibleAfter = (pick: string): boolean => {
    for (const [c, n] of left) {
      const k = c === pick ? n - 1 : n;
      if (k > (remaining - 1 - k) + (c === pick ? 0 : 1)) return false;
    }
    return true;
  };
  const out: T[] = [];
  let last: string | null = null;
  while (remaining > 0) {
    const open = [...left].filter(([, n]) => n > 0).map(([c]) => c);
    const others = open.filter((c) => c !== last);
    const safe = others.filter(feasibleAfter);
    const pool = safe.length ? safe : others.length ? others : open;
    const isPartner = (c: string): number => (last !== null && (partners.get(last) ?? []).includes(c) ? 0 : 1);
    const pick = [...pool].sort((a, b) => isPartner(a) - isPartner(b) || left.get(b)! - left.get(a)! || rank.get(a)! - rank.get(b)!)[0]!;
    out.push(queues.get(pick)!.shift()!);
    left.set(pick, left.get(pick)! - 1);
    remaining--;
    last = pick;
  }
  return out;
}

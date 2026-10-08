// server/session-composer.ts: what the server feeds Today's composer (core/session.ts), and how it picks the items it serves
// (design §4 "A study day", §5 "Days and look-alikes", §12 difficulty and sub-skills; rulings S2-29 to S2-37, S2-51).
// Sprint 4a (Task C2): mistake cards in the SQL review step (S4-07, S4-08) and the wheel-spinning step (S4-10).
// Everything here reads the replay (server/state.ts) and the content; nothing writes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Section } from '../core/envelope.ts';
import { parseMistakeCardId, type InstanceResult, type ReplayResult } from '../core/replay.ts';
import { configFor, retrievability, type CardSnapshot } from '../core/scheduler.ts';
import {
  AT_LEAST_PRACTISED, DAILY_NEW_CAP, interleave, type ComposerCard, type ComposerConcept, type ComposerDailyCase, type ComposerInput, type ComposerOpener,
  type ReviewStats, type TodayPlan, type TodayStep,
} from '../core/session.ts';
import { amsterdamDate } from '../core/time.ts';
import type { CaseRecord } from '../schemas/case.ts';
import { choiceTarget, type ChoiceConcept, type ChoiceItem, type ChoiceSection } from '../schemas/choice.ts';
import type { Curriculum } from '../schemas/concepts.ts';
import { isSqlChoiceKind, PREDICT_KINDS, type SqlItem } from '../schemas/item.ts';
import { PRESETS } from '../schemas/presets.ts';
import type { ContentStore } from './content.ts';
import type { PendingRetest } from './progress.ts';
import { servableChoiceItem } from './routes/choice.ts';

const DAY_MS = 86_400_000;
const SEEN_WINDOW_MS = 30 * DAY_MS;          // S2-35
const FIRST_WEEK_MS = 7 * DAY_MS;            // S2-36
const STATS_DATES = 7;                       // S2-31
const NO_STATS: ReviewStats = { completedPerStudyDay: [], scheduledLast7: { passed: 0, total: 0 } };
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// ---- the confusable-pairs registry (design §5) -----------------------------------------------------

/** One registry entry: two look-alike concepts and the level from which the pair applies. */
export interface PairEntry { concepts: [string, string]; from_level: number; note: string }
export const PAIRS_PATH = fileURLToPath(new URL('../content/sql/confusable-pairs.json', import.meta.url));
const PAIRS_FILE = 'content/sql/confusable-pairs.json';

/** The registry's entries, or an error that names the file and the fault. */
export function parsePairs(x: unknown): PairEntry[] {
  const list = (x as { pairs?: unknown } | null)?.pairs;
  if (!Array.isArray(list)) throw new Error(`${PAIRS_FILE}: "pairs" must be a list.`);
  return list.map((p: unknown, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const c = o.concepts;
    if (!Array.isArray(c) || c.length !== 2 || !c.every((id) => typeof id === 'string' && id !== '') || c[0] === c[1]) {
      throw new Error(`${PAIRS_FILE}: pair ${i + 1} must name two different concepts.`);
    }
    if (!Number.isInteger(o.from_level) || (o.from_level as number) < 1) throw new Error(`${PAIRS_FILE}: pair ${i + 1} needs a from_level of 1 or more.`);
    return { concepts: [c[0], c[1]] as [string, string], from_level: o.from_level as number, note: typeof o.note === 'string' ? o.note : '' };
  });
}

/** The registry, read once per call. A missing file means no pairs; a malformed one is a fault. */
export async function loadPairs(path = PAIRS_PATH): Promise<PairEntry[]> {
  let text: string;
  try { text = await readFile(path, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return parsePairs(JSON.parse(text));
}

/** The pairs that apply: a pair applies once the learner has started a concept of its level or a later one. */
export function activePairs(entries: readonly PairEntry[], r: ReplayResult, section: Section, curriculum: Curriculum): [string, string][] {
  if (section !== 'sql') return [];
  let reached = 0;
  for (const c of curriculum.concepts) if ((r.concepts.get(c.id)?.state ?? 'new') !== 'new') reached = Math.max(reached, c.level);
  return entries.filter((e) => e.from_level <= reached).map((e) => [...e.concepts] as [string, string]);
}

// ---- the composer's input -----------------------------------------------------------------------

/**
 * The section's concepts with their states. GA4 and Methodology (Task C5): the parent concepts, each card's own, in D12's order
 * then the file's (choiceParents); a section with no content yet has none.
 */
export function sectionConcepts(content: ContentStore, r: ReplayResult, section: Section): ComposerConcept[] {
  if (isChoiceSection(section)) return choiceComposerConcepts(content, r, section);
  const has = content.conceptsWithContent();
  return content.curriculum.concepts.map((c) => {
    const v = r.concepts.get(c.id);
    return { id: c.id, order: c.order, level: c.level, state: v?.state ?? 'new', hasContent: has.has(c.id), firstExposureAt: v?.firstExposureAt ?? null,
      leech: v?.flags.leech ?? false, refresherDue: v?.flags.refresherDue ?? false };
  });
}

/** The deck's cards, each with its retrievability now under the preset in force (the exam boost uses the exam date set now). */
export function composerCards(r: ReplayResult, section: Section, now: Date, examDate: string | null): ComposerCard[] {
  const cfg = configFor(PRESETS[section], now, examDate);
  return [...r.cards.values()].filter((c) => c.deck === section)
    .map((c) => ({ card_id: c.card_id, concept_id: c.concept_id, due: c.snapshot.due, retrievability: retrievability(c.snapshot, now, cfg), rated: c.rated }));
}

/**
 * S2-30: concepts of the section whose first exposure falls on today's Amsterdam date. A leech reset moves the first exposure
 * to its micro-lesson (S2-27), but a relearned concept is not a new one, so a card the reset created does not count.
 */
export function newConceptsToday(r: ReplayResult, section: Section, now: Date): number {
  const today = amsterdamDate(now);
  return [...r.concepts.values()].filter((v) => v.section === section && v.firstExposureDate === today && r.cards.get(v.card_id)?.origin !== 'reset').length;
}

/**
 * S2-31: an instance served as a review for a card that was due when it was served, closed with a rating. A mistake card's review
 * (S4-08) is left out: the intake guard's due count is the concept cards' (core/session.ts), so its history is too.
 */
function isScheduledReview(i: InstanceResult): boolean {
  if (i.phase !== 'review' || i.rating === null) return false;
  const review = i.card_reviews[0];
  if (review && parseMistakeCardId(review.card_id) !== null) return false;
  const before = review?.state_before as CardSnapshot | undefined;
  return !!before && typeof before.due === 'string' && Date.parse(before.due) <= Date.parse(i.started_at);
}

/**
 * S2-31: the completed scheduled reviews on each of the last 7 study days before today (a study day: an Amsterdam date with at
 * least 1 closed instance of the section), and over the last 7 Amsterdam dates, today included, how many were rated Hard,
 * Good or Easy.
 */
export function reviewStats(r: ReplayResult, now: Date, section: Section = 'sql'): ReviewStats {
  const today = amsterdamDate(now);
  const studyDays = new Set<string>();
  const perDate = new Map<string, { passed: number; total: number }>();
  for (const i of r.instances.values()) {
    if (i.section !== section || i.closed_at === null || i.unreached) continue;   // S2-97, S2-109: an unreached close is no study day
    const date = amsterdamDate(new Date(i.closed_at));
    studyDays.add(date);
    if (!isScheduledReview(i)) continue;
    const e = perDate.get(date) ?? { passed: 0, total: 0 };
    e.total++;
    if (i.rating! >= 2) e.passed++;
    perDate.set(date, e);
  }
  const completedPerStudyDay = [...studyDays].filter((d) => d < today).sort().slice(-STATS_DATES).map((d) => perDate.get(d)?.total ?? 0);
  const from = addDays(today, 1 - STATS_DATES);
  const scheduledLast7 = { passed: 0, total: 0 };
  for (const [d, e] of perDate) if (d >= from && d <= today) { scheduledLast7.passed += e.passed; scheduledLast7.total += e.total; }
  return { completedPerStudyDay, scheduledLast7 };
}

/** The re-test Today shows: the section's ready one first, else the one that opens soonest (RULE-08, S2-33). */
export function pickRetest(retests: readonly PendingRetest[], concepts: readonly ComposerConcept[]): ComposerInput['retest'] {
  const ids = new Set(concepts.map((c) => c.id));
  const r = retests.filter((x) => ids.has(x.conceptId)).sort((a, b) => Number(b.ready) - Number(a.ready) || Date.parse(a.readyAt) - Date.parse(b.readyAt))[0];
  return r ? { concept_id: r.conceptId, item_id: r.itemId, ready: r.ready, ready_at: r.readyAt } : null;
}

/** The level a case opens: the highest curriculum level among its concepts. Null when none is a curriculum concept. */
export function openerLevel(c: CaseRecord, curriculum: Curriculum): number | null {
  const levels = curriculum.concepts.filter((x) => c.concept_ids.includes(x.id) || c.checkpoints.some((p) => p.credits_concepts.includes(x.id))).map((x) => x.level);
  return levels.length ? Math.max(...levels) : null;
}
/** The CP3 checkpoint's item, which /api/serve hands out for an opener (S2-49). */
export const openerItem = (c: CaseRecord): string | null => c.checkpoints.find((p) => p.kind === 'CP3' && p.item_id)?.item_id ?? null;

/** The auto-graded checkpoints a case lists (CP1 to CP5), as replay tracks them (core/replay.ts, server/state.ts). */
const AUTO_GRADED: ReadonlySet<string> = new Set(['CP1', 'CP2', 'CP3', 'CP4', 'CP5']);

/**
 * S2-51: each opener with its level. S4B-08: solved as replay derives it (core/replay.ts, `cases`): every auto-graded checkpoint the
 * opener lists has a pass, at any time, a pass after a reveal included. So an opener solved with CP3 only now shows its CP4 to finish.
 * Sprint 4b (Task D3), from the same case status: the preview offers the sketch while the opener has no passing CP3 and no sketch
 * (S4B-13); its CP1 waits for an answer (S4B-14); and the first checkpoint with no pass, where the solve step opens the case screen
 * (B2 review: CP4 after a CP3 pass, never the CP3 item again). A case the replay does not track counts as nothing answered or passed.
 */
export function openerInputs(cases: readonly CaseRecord[], curriculum: Curriculum, r: ReplayResult): ComposerOpener[] {
  const out: ComposerOpener[] = [];
  for (const c of cases) {
    const level = openerLevel(c, curriculum);
    const item = openerItem(c);
    if (level === null || item === null) continue;
    const status = r.cases.get(c.case_id);
    const checkpoints: readonly { kind: string; passed: boolean; latest: unknown }[] = status?.checkpoints
      ?? c.checkpoints.filter((p) => AUTO_GRADED.has(p.kind) && typeof p.item_id === 'string').map((p) => ({ kind: p.kind, passed: false, latest: null }));
    const cp1 = checkpoints.find((p) => p.kind === 'CP1');
    out.push({
      case_id: c.case_id, level, solved: status?.solved ?? false,
      sketch: !checkpoints.some((p) => p.kind === 'CP3' && p.passed) && (status?.sketch ?? null) === null,
      cp1Unanswered: cp1 !== undefined && cp1.latest === null,
      nextCheckpoint: checkpoints.find((p) => !p.passed)?.kind ?? null,
    });
  }
  return out;
}

// ---- the daily case (sprint 4b, Task D3: S4B-15, design §4 block 4) ------------------------------------------------------

export interface DailyCaseArgs {
  /** Every case; only the daily ones (`kind: 'daily'`) are read. */
  cases: readonly CaseRecord[];
  /** The replay: each case's status (S4B-08's solved) and each concept's state. */
  replay: ReplayResult;
  /** The attempt file's records: only `attempt` records naming a daily case's checkpoint item are read. */
  records: readonly object[];
  now: Date;
}
/** The concepts a case's checkpoints credit (S4B-03). */
const creditedConcepts = (c: CaseRecord): string[] => [...new Set(c.checkpoints.flatMap((p) => p.credits_concepts))];

/**
 * S4B-15: the day's daily case. The daily case first answered on today's Amsterdam date, if any: it stays the day's case, shown as
 * done once solved (S4B-08), so solving it never brings a second one that day. Otherwise the first unsolved daily case whose credited
 * concepts are all practised or better, lowest level first, then case ID; null when none qualifies. An answer is counted as replay
 * counts one (core/replay.ts): never the copy an "I was right" override logs, a crash or a refused statement. Derived from the log
 * alone, so a restart gives the same case, and nothing is logged.
 */
export function dailyCase(a: DailyCaseArgs): ComposerDailyCase | null {
  const order = (x: CaseRecord, y: CaseRecord): number => x.level - y.level || (x.case_id < y.case_id ? -1 : x.case_id > y.case_id ? 1 : 0);
  const daily = a.cases.filter((c) => c.kind === 'daily').sort(order);
  if (!daily.length) return null;
  const owner = new Map<string, CaseRecord>();
  for (const c of daily) for (const p of c.checkpoints) if (typeof p.item_id === 'string' && !owner.has(p.item_id)) owner.set(p.item_id, c);
  const today = amsterdamDate(a.now);
  const t = a.now.getTime();
  let first: { at: number; c: CaseRecord } | null = null;
  for (const r of a.records as { record?: unknown; item_id?: unknown; submitted_at?: unknown; grading_source?: unknown; outcome?: unknown }[]) {
    if (r.record !== 'attempt' || typeof r.item_id !== 'string' || typeof r.submitted_at !== 'string') continue;
    const c = owner.get(r.item_id);
    if (!c || r.grading_source === 'override' || r.outcome === 'crash' || r.outcome === 'rejected') continue;
    const at = Date.parse(r.submitted_at);
    if (Number.isNaN(at) || at > t || amsterdamDate(new Date(at)) !== today) continue;
    if (first === null || at < first.at || (at === first.at && order(c, first.c) < 0)) first = { at, c };
  }
  const solved = (id: string): boolean => a.replay.cases.get(id)?.solved ?? false;
  if (first) return { case_id: first.c.case_id, done: solved(first.c.case_id) };
  const practised = (id: string): boolean => AT_LEAST_PRACTISED.has(a.replay.concepts.get(id)?.state ?? 'new');
  const pick = daily.find((c) => !solved(c.case_id) && creditedConcepts(c).every(practised));
  return pick ? { case_id: pick.case_id, done: false } : null;
}

export interface ComposeArgs {
  content: ContentStore; replay: ReplayResult; section: Section; now: Date; examDate: string | null;
  /** The open session (SessionTracker.currentId), or null. */
  sessionId: string | null;
  pairs: readonly PairEntry[]; retest: ComposerInput['retest']; openers: ComposerOpener[];
  /** Fix round 1, I-1: a choice section's cards still inside their lesson window (lessonWindowEnds). Their due reviews wait. */
  lessonWindows?: ReadonlyMap<string, number>;
  /** Sprint 4b (S4B-15): the day's daily case (dailyCase), SQL only. Absent: none. */
  dailyCase?: ComposerDailyCase | null;
}

/**
 * Fix round 1, I-1: a choice section's due card inside its lesson window is left out until the window closes, so Today's reviews
 * (and relearning) go on to the next due card or the next step, and the serve that feeds them never draws that card. A card not
 * yet due stays, so "due tomorrow" is unchanged.
 */
function reviewableCards(cards: ComposerCard[], a: ComposeArgs): ComposerCard[] {
  const windows = a.lessonWindows;
  if (!windows?.size || !isChoiceSection(a.section)) return cards;
  return cards.filter((c) => !(Date.parse(c.due) <= a.now.getTime() && windows.has(c.card_id)));
}

/** Everything planToday needs, from the replay and the content. GA4 and Methodology run with no intake guard (owner default). */
export function composerInput(a: ComposeArgs): ComposerInput {
  const r = a.replay;
  const concepts = sectionConcepts(a.content, r, a.section);
  const session = a.sessionId === null ? undefined : r.sessions.findLast((s) => s.session_id === a.sessionId && s.end === null);
  const sessionStart = session?.start ?? null;
  const since = sessionStart === null ? NaN : Date.parse(sessionStart);
  // A leech's reset moves its first exposure to the micro-lesson (S2-27), which Today runs in the session; a relearned
  // concept is not the session's new concept (as newConceptsToday).
  const reset = (id: string): boolean => { const v = r.concepts.get(id); return v !== undefined && r.cards.get(v.card_id)?.origin === 'reset'; };
  // firstExposureAt may be an instance's browser-reported started_at (S2-01), earlier than the request that opened the session.
  // So when the first exposure came from an instance, the server's own stamps decide (close ts, first graded attempt).
  const startedInSession = (c: ComposerConcept): boolean => {
    if (c.firstExposureAt === null || reset(c.id)) return false;
    const first = Date.parse(c.firstExposureAt);
    if (first >= since) return true;
    const own = [...r.instances.values()].filter((i) => i.concept_id === c.id && !i.unreached);
    if (!own.length || Math.min(...own.map((i) => Date.parse(i.started_at))) > first) return false;   // the exposure was a record
    const stamps = own.flatMap((i) => [i.closed_at, i.firstGradedAt]).filter((x): x is string => x !== null).map((x) => Date.parse(x));
    return stamps.length > 0 && Math.min(...stamps) >= since;
  };
  // The session's mixed block: an instance served in phase mixed that started in the session (the replay holds closed ones).
  const sessionMixedDone = [...r.instances.values()].some((i) => i.section === a.section && i.phase === 'mixed' && Date.parse(i.started_at) >= since);
  return {
    section: a.section, now: a.now, cards: reviewableCards(composerCards(r, a.section, a.now, a.examDate), a), concepts,
    stats: a.section === 'sql' ? reviewStats(r, a.now) : NO_STATS,
    newConceptsToday: newConceptsToday(r, a.section, a.now), dailyNewCap: DAILY_NEW_CAP,
    pairs: activePairs(a.pairs, r, a.section, a.content.curriculum), useIntakeGuard: a.section === 'sql', retest: a.retest,
    sessionNewConceptDone: concepts.some(startedInSession), sessionMixedDone, sessionStart, openers: a.openers, dailyCase: a.dailyCase ?? null,
  };
}

// ---- GA4 and Methodology (Task C5) ----------------------------------------------------------------

export const isChoiceSection = (s: Section): s is ChoiceSection => s === 'ga4' || s === 'methodology';

/**
 * A choice section's parent concepts (the ones with a card, E-110) in Today's and the map's order: level 1 first, in the
 * file's order (for GA4 that is D12's order: SETUP-01, EVENTS-01, EVENTS-02, METRICS-01), then the rest in the file's order
 * (06's index).
 */
export function choiceParents(content: ContentStore, section: ChoiceSection): ChoiceConcept[] {
  const parents = (content.choiceConcepts?.(section) ?? []).filter((c) => c.parent_id === null);
  return [...parents.filter((c) => c.level === 1), ...parents.filter((c) => c.level !== 1)];
}

/**
 * A card's practice pool: the section's items whose records target the concept (a 10 concept's items target its 06 parent,
 * E-110), in file order, each one a practice route may serve: active and never held out (S2-64). reference_360 and new_2026
 * items are ordinary practice items.
 */
export function choicePool(content: ContentStore, section: ChoiceSection, conceptId: string): ChoiceItem[] {
  return (content.choiceItems?.(section) ?? []).filter((i) => choiceTarget(i).target_concept_id === conceptId && servableChoiceItem(content, i.id) !== undefined);
}

/** A choice section's parents for the composer (S2-29): content has shipped when the concept has a reading or something to practise. */
function choiceComposerConcepts(content: ContentStore, r: ReplayResult, section: ChoiceSection): ComposerConcept[] {
  return choiceParents(content, section).map((c, i) => {
    const v = r.concepts.get(c.id);
    const reading = content.reading?.(section, c.id) !== undefined;
    return { id: c.id, order: i + 1, level: c.level, state: v?.state ?? 'new', hasContent: reading || choicePool(content, section, c.id).length > 0,
      firstExposureAt: v?.firstExposureAt ?? null,
      // A GA4 or Methodology micro-lesson or refresher is the concept's reading, so Today offers one only where a reading exists.
      // Without one, a leech's card is still reset at the session end (S2-28) and the concept stays in the schedule.
      leech: (v?.flags.leech ?? false) && reading, refresherDue: (v?.flags.refresherDue ?? false) && reading };
  });
}

export interface LessonWindowArgs {
  replay: ReplayResult;
  /** The attempt file's records; only `exposure` records are read. */
  records: readonly object[];
  /** The card a concept is rated on (a 10 GA4 concept's is its 06 parent's, E-110). */
  cardOf(conceptId: string): string;
  now: Date;
  windowMs: number;
}
/**
 * Fix round 1, I-1 (S2-62, S2-02): each card of a choice section that an answer now would not rate, with the time (ms) its
 * window closes. A card is inside its window until 15 minutes after its latest `reading` or `lesson` exposure (S2-62, any of
 * the concepts it is rated for), and an unrated card also until 15 minutes after its concept's first exposure (S2-02: a leech's
 * reset card after its micro-lesson). Today leaves such a card out of its reviews until then, so a review never loops on a card
 * it cannot rate, spending the pool's cold first answers.
 */
export function lessonWindowEnds(section: ChoiceSection, a: LessonWindowArgs): Map<string, number> {
  const t = a.now.getTime();
  const ends = new Map<string, number>();
  const extend = (card: string, end: number): void => { if (end > t && end > (ends.get(card) ?? -Infinity)) ends.set(card, end); };
  for (const x of a.records as { record?: unknown; kind?: unknown; concept_id?: unknown; ts?: unknown }[]) {
    if (x.record !== 'exposure' || (x.kind !== 'reading' && x.kind !== 'lesson') || typeof x.concept_id !== 'string' || typeof x.ts !== 'string') continue;
    const at = Date.parse(x.ts);
    if (!Number.isNaN(at) && at <= t) extend(a.cardOf(x.concept_id), at + a.windowMs);
  }
  for (const c of a.replay.cards.values()) {
    const first = c.rated ? null : a.replay.concepts.get(c.concept_id)?.firstExposureAt ?? null;
    if (first !== null) extend(c.card_id, Date.parse(first) + a.windowMs);
  }
  for (const card of [...ends.keys()]) if (a.replay.cards.get(card)?.deck !== section) ends.delete(card);
  return ends;
}

/** When an item was last seen, as [time, place in the seen list], so two servings in the same millisecond still have an order. */
type Seen = readonly [number, number];
const NEVER: Seen = [-Infinity, -1];
const earlier = (a: Seen, b: Seen): number => a[0] - b[0] || a[1] - b[1];
function lastSeenOf(seen: readonly { item_id: string; started_at: string }[], now: Date): Map<string, Seen> {
  const out = new Map<string, Seen>();
  seen.forEach((s, n) => {
    const at = Date.parse(s.started_at);
    if (!Number.isNaN(at) && at <= now.getTime() && earlier([at, n], out.get(s.item_id) ?? NEVER) > 0) out.set(s.item_id, [at, n]);
  });
  return out;
}

export interface ChoicePickInput {
  now: Date;
  /** The card's pool in file order (choicePool). */
  pool: readonly ChoiceItem[];
  /** Instances of any item, at their start, in the order they happened: closed ones from the replay, then this session's servings. */
  seen: readonly { item_id: string; started_at: string }[];
}
/**
 * S2-35 and S2-36 for a GA4 or Methodology card. Items not seen in the last 30 days first; among them, the least recently served
 * concept first (a 06 parent and its 10 concepts take turns, as bundled SQL concepts rotate their sub-skill), then file order.
 * Choice items carry no difficulty band. When nothing unseen is left: the least recently seen item, with repeat_exposure.
 */
export function pickChoiceItem(p: ChoicePickInput): { item: ChoiceItem; repeat_exposure: boolean } | null {
  if (!p.pool.length) return null;
  const last = lastSeenOf(p.seen, p.now);
  const seenAt = (i: ChoiceItem): Seen => last.get(i.id) ?? NEVER;
  const order = new Map(p.pool.map((i, n) => [i.id, n]));
  const unseen = p.pool.filter((i) => seenAt(i)[0] < p.now.getTime() - SEEN_WINDOW_MS);
  if (!unseen.length) {
    const item = [...p.pool].sort((a, b) => earlier(seenAt(a), seenAt(b)) || order.get(a.id)! - order.get(b.id)!)[0]!;
    return { item, repeat_exposure: true };
  }
  const conceptSeen = new Map<string, Seen>();
  for (const i of p.pool) if (earlier(seenAt(i), conceptSeen.get(i.concept_id) ?? NEVER) > 0) conceptSeen.set(i.concept_id, seenAt(i));
  const conceptAge = (i: ChoiceItem): Seen => conceptSeen.get(i.concept_id) ?? NEVER;
  const item = [...unseen].sort((a, b) => earlier(conceptAge(a), conceptAge(b)) || order.get(a.id)! - order.get(b.id)!)[0]!;
  return { item, repeat_exposure: false };
}

/**
 * Today's practice step for a choice section has no concept named: the step's concepts in turn, the least recently served card
 * first, ties in the step's order (newest first). Null when the step names none.
 */
export function nextPracticeConcept(conceptIds: readonly string[], poolOf: (conceptId: string) => readonly ChoiceItem[],
  seen: readonly { item_id: string; started_at: string }[], now: Date): string | null {
  const last = lastSeenOf(seen, now);
  const age = (c: string): Seen => poolOf(c).reduce<Seen>((m, i) => { const s = last.get(i.id) ?? NEVER; return earlier(s, m) > 0 ? s : m; }, NEVER);
  return [...conceptIds].map((c, n) => ({ c, n, age: age(c) })).sort((a, b) => earlier(a.age, b.age) || a.n - b.n)[0]?.c ?? null;
}

// ---- picking items (S2-35, S2-36) ---------------------------------------------------------------

/** A concept's review pool, in content order: its lesson's pool items that exist (design §12). */
export function poolOf(content: ContentStore, conceptId: string): SqlItem[] {
  return (content.lesson(conceptId)?.pool_item_ids ?? []).map((id) => content.item(id)).filter((i): i is SqlItem => i !== undefined);
}

/**
 * S3-17 (design §4): the concept's pretest. When the concept has an active `use: 'pretest'` item of a predict kind (one its lesson
 * lists first, else the first in content order), the pretest is the lesson's first write pretest item, then that predict item.
 * Otherwise it is the lesson's own two. Empty for a concept with no lesson. Today serves the first; the lesson screen walks both.
 */
export function pretestItemIds(content: ContentStore, conceptId: string): string[] {
  const lesson = content.lesson(conceptId);
  if (!lesson) return [];
  const listed = Array.isArray(lesson.pretest_item_ids) ? lesson.pretest_item_ids : [];
  const isPredict = (i: SqlItem | undefined): i is SqlItem => !!i && i.use === 'pretest' && i.status === 'active'
    && (PREDICT_KINDS as readonly string[]).includes(i.kind) && i.target_concept_id === conceptId;
  const predict = listed.map((id) => content.item(id)).find(isPredict) ?? (content.sqlItems?.() ?? []).find(isPredict);
  if (!predict) return [...listed];
  const write = listed.find((id) => content.item(id)?.kind === 'write');
  return write === undefined ? [predict.id] : [write, predict.id];
}

/** The item and start of every instance except an unreached drill item: the list the history reads for "seen in the last 30 days". */
export function seenIn(r: ReplayResult): { item_id: string; started_at: string }[] {
  // S2-97: an unreached drill item was never seen, so it never makes a later serving a repeat exposure.
  return [...r.instances.values()].filter((i) => !i.unreached).map((i) => ({ item_id: i.item_id, started_at: i.started_at }));
}

export interface PickInput {
  now: Date;
  /** The concept's items in content order; only `use: 'pool'` items of kind write or fix (S2-35), or an active SQL choice kind (S3-16), are served. */
  pool: readonly SqlItem[];
  /** Instances of any item, at their start: closed ones from the replay, plus what was served and is still open. */
  seen: readonly { item_id: string; started_at: string }[];
  firstExposureAt: string | null;
  /** The item kinds of this session's earlier review servings, oldest first. */
  recentReviewKinds: readonly string[];
  /** 'review' outside a block; 'mixed' for the mixed block, which adds its one fix item itself (S2-32). */
  purpose: 'review' | 'mixed';
}
export interface Pick { item: SqlItem; repeat_exposure: boolean }

/**
 * S2-35 and S2-36. Items not seen in the last 30 days first. Among them, the least recently served sub-skill first (bundled
 * concepts rotate it), then the preferred difficulty: E1 in the 7 days from first exposure, E2 afterwards. A review serves E3
 * only when no unseen E1 or E2 is left; mixed practice allows it freely. A fix or SQL choice item only when neither of the
 * session's 2 previous review servings was one (S3-16: at most 1 in 3 together); an SQL choice item only when it is active, as the
 * choice route serves no other. When nothing unseen is left: the least recently seen item, with repeat_exposure.
 */
export function pickItem(p: PickInput): Pick | null {
  let pool = p.pool.filter((i) => i.use === 'pool' && (i.kind === 'write' || i.kind === 'fix' || (isSqlChoiceKind(i.kind) && i.status === 'active')));
  const blocked = p.purpose === 'mixed' || p.recentReviewKinds.slice(-2).some((k) => k !== 'write');
  if (blocked && pool.some((i) => i.kind === 'write')) pool = pool.filter((i) => i.kind === 'write');
  if (!pool.length) return null;
  const t = p.now.getTime();
  const lastSeen = new Map<string, number>();
  for (const s of p.seen) {
    const at = Date.parse(s.started_at);
    if (!Number.isNaN(at) && at <= t && at > (lastSeen.get(s.item_id) ?? -Infinity)) lastSeen.set(s.item_id, at);
  }
  const order = new Map(p.pool.map((i, n) => [i.id, n]));
  const unseen = pool.filter((i) => (lastSeen.get(i.id) ?? -Infinity) < t - SEEN_WINDOW_MS);
  if (!unseen.length) {
    const item = [...pool].sort((a, b) => lastSeen.get(a.id)! - lastSeen.get(b.id)! || order.get(a.id)! - order.get(b.id)!)[0]!;
    return { item, repeat_exposure: true };
  }
  const easier = unseen.filter((i) => i.difficulty !== 'E3');
  const candidates = p.purpose === 'review' && easier.length ? easier : unseen;
  // A concept never exposed is treated as just started: it gets the easy items.
  const firstWeek = p.firstExposureAt === null || t < Date.parse(p.firstExposureAt) + FIRST_WEEK_MS;
  const preferred = firstWeek ? 'E1' : 'E2';
  const rank = (i: SqlItem): number => (i.difficulty === preferred ? 0 : i.difficulty === 'E3' && p.purpose === 'review' ? 2 : 1);
  const subSkillSeen = new Map<string | null, number>();
  for (const i of p.pool) {
    const at = lastSeen.get(i.id);
    if (at !== undefined && at > (subSkillSeen.get(i.sub_skill) ?? -Infinity)) subSkillSeen.set(i.sub_skill, at);
  }
  const subSkillAge = (i: SqlItem): number => subSkillSeen.get(i.sub_skill) ?? -Infinity;
  const item = [...candidates].sort((a, b) => subSkillAge(a) - subSkillAge(b) || rank(a) - rank(b) || order.get(a.id)! - order.get(b.id)!)[0]!;
  return { item, repeat_exposure: false };
}

export interface BlockPick { concept_id: string; item: SqlItem; repeat_exposure: boolean }
export interface BlockArgs {
  /** The block's concepts in priority order (core/session.ts mixedConcepts). */
  concepts: readonly string[];
  poolOf(conceptId: string): readonly SqlItem[];
  cardOf(conceptId: string): string;
  seen: readonly { item_id: string; started_at: string }[];
  firstExposureOf(conceptId: string): string | null;
  now: Date;
  pairs: [string, string][];
}

/**
 * S2-32: the mixed block's items. One item per card (design §5: a card already rated in the block is not served again in
 * it), E1 to E3 allowed, exactly 1 fix item when one of the block's concepts has one, then interleaved: no two consecutive
 * items of one concept, registry partners side by side. S3-16: at most 2 of the block are fix or choice items together, so
 * besides the fix item it holds 1 SQL choice item when another of its concepts has one.
 */
export function mixedBlock(a: BlockArgs): BlockPick[] {
  const picks: BlockPick[] = [];
  const cards = new Set<string>();
  for (const c of a.concepts) {
    const card = a.cardOf(c);
    if (cards.has(card)) continue;
    const p = pickItem({ now: a.now, pool: a.poolOf(c), seen: a.seen, firstExposureAt: a.firstExposureOf(c), recentReviewKinds: [], purpose: 'mixed' });
    if (!p) continue;
    cards.add(card);
    picks.push({ concept_id: c, ...p });
  }
  if (!picks.some((p) => p.item.kind === 'fix')) {
    // The first concept, in priority order, with a fix item; an unseen one before one seen in the last 30 days.
    const fixes = picks.map((p, i) => ({ i, fix: pickItem({ now: a.now, pool: a.poolOf(p.concept_id).filter((x) => x.kind === 'fix'), seen: a.seen,
      firstExposureAt: a.firstExposureOf(p.concept_id), recentReviewKinds: [], purpose: 'review' }) }))
      .filter((x): x is { i: number; fix: Pick } => x.fix !== null);
    const chosen = fixes.find((x) => !x.fix.repeat_exposure) ?? fixes[0];
    if (chosen) picks[chosen.i] = { concept_id: picks[chosen.i]!.concept_id, ...chosen.fix };
  }
  // S3-16: one SQL choice item, in place of a write item: the first concept in priority order with one, an unseen one first.
  if (!picks.some((p) => isSqlChoiceKind(p.item.kind))) {
    const choices = picks.map((p, i) => ({ i, pick: p.item.kind !== 'write' ? null : pickItem({ now: a.now, pool: a.poolOf(p.concept_id).filter((x) => isSqlChoiceKind(x.kind)),
      seen: a.seen, firstExposureAt: a.firstExposureOf(p.concept_id), recentReviewKinds: [], purpose: 'review' }) }))
      .filter((x): x is { i: number; pick: Pick } => x.pick !== null);
    const choice = choices.find((x) => !x.pick.repeat_exposure) ?? choices[0];
    if (choice) picks[choice.i] = { concept_id: picks[choice.i]!.concept_id, ...choice.pick };
  }
  return interleave(picks, a.pairs);
}

// ---- mistake cards and wheel-spinning (sprint 4a Task C2; S4-07, S4-08, S4-10) ----------------------------------------------------

/** S4-07: Today introduces at most this many New mistake cards per Amsterdam date. */
export const MISTAKE_NEW_PER_DAY = 3;

/**
 * S4-07 and S4-08: the mistake cards Today's review step holds now, in order. The due active cards, lowest retrievability first
 * (on the SQL preset; a New card has none), then the earliest due, then the card ID. A New card (never reviewed) joins only while
 * fewer than 3 cards were introduced on today's Amsterdam date, a card being introduced on the date of its first review (C1). A
 * card already reviewed always joins when due. The review step puts these after the concept reviews (withSqlSteps).
 */
export function mistakeReviewQueue(r: ReplayResult, now: Date, examDate: string | null): string[] {
  const cfg = configFor(PRESETS.sql, now, examDate);
  const today = amsterdamDate(now);
  const cards = [...r.mistakeCards.values()];
  let room = Math.max(0, MISTAKE_NEW_PER_DAY - cards.filter((c) => c.first_review !== null && amsterdamDate(new Date(c.first_review)) === today).length);
  const due = cards.filter((c) => !c.retired && Date.parse(c.due) <= now.getTime())
    .map((c) => ({ c, r: retrievability(c.snapshot, now, cfg) }))
    .sort((a, b) => a.r - b.r || Date.parse(a.c.due) - Date.parse(b.c.due) || (a.c.card_id < b.c.card_id ? -1 : a.c.card_id > b.c.card_id ? 1 : 0));
  const out: string[] = [];
  for (const { c } of due) {
    if (c.first_review === null) {
      if (room === 0) continue;
      room--;
    }
    out.push(c.card_id);
  }
  return out;
}

/**
 * S4-10 (T-17): Today's recommendation for a wheel-spinning concept: its worked example (the lesson's stage 0 example, as a
 * refresher shows it) and an easier E1 item (`item_id`, null when the concept has none). POST /api/serve with purpose
 * `wheel_spinning` serves that item in phase free. It recommends; nothing waits for it.
 */
export interface WheelSpinningStep { kind: 'wheel_spinning'; concept_id: string; item_id: string | null }
/** Today's SQL steps: the composer's (core/session.ts), plus the wheel-spinning step the server adds (Task C2). */
export type TodayStepView = TodayStep | WheelSpinningStep;
export interface TodayPlanView extends Omit<TodayPlan, 'steps' | 'minimumDay'> { steps: TodayStepView[]; minimumDay: TodayStepView[] }

/**
 * Today's SQL plan with the sprint 4a additions. The due mistake cards (mistakeReviewQueue) join the review step after the
 * concept reviews (S4-07); when no concept review is due, the step comes where planToday puts reviews, after the micro-lessons
 * and refreshers. The wheel-spinning steps come there too, before the reviews. The minimum day (reviews only) counts the mistake
 * cards. Mistake cards never join the relearning step: S4-08 serves them in the review step only.
 */
export function withSqlSteps(plan: TodayPlan, x: { mistakeReviews: readonly string[]; wheelSpinning: readonly WheelSpinningStep[] }): TodayPlanView {
  if (!x.mistakeReviews.length && !x.wheelSpinning.length) return plan;
  const steps: TodayStepView[] = [...plan.steps];
  const top = steps.findIndex((s) => s.kind !== 'micro_lesson' && s.kind !== 'refresher');
  const at = top === -1 ? steps.length : top;
  if (x.mistakeReviews.length) {
    const i = steps.findIndex((s) => s.kind === 'reviews');
    const reviews = i >= 0 ? (steps[i] as Extract<TodayStep, { kind: 'reviews' }>).card_ids : [];
    const step: TodayStep = { kind: 'reviews', card_ids: [...reviews, ...x.mistakeReviews] };
    if (i >= 0) steps[i] = step;
    else steps.splice(at, 0, step);
  }
  steps.splice(at, 0, ...x.wheelSpinning);
  return { ...plan, steps, minimumDay: steps.filter((s) => s.kind === 'reviews' || s.kind === 'relearning') };
}

/** Each item's latest start at or before `t`, in ms. */
function lastSeenMs(seen: readonly { item_id: string; started_at: string }[], t: number): Map<string, number> {
  const last = new Map<string, number>();
  for (const s of seen) {
    const at = Date.parse(s.started_at);
    if (!Number.isNaN(at) && at <= t && at > (last.get(s.item_id) ?? -Infinity)) last.set(s.item_id, at);
  }
  return last;
}

/**
 * Items not seen in the 30 days before `now` first, best `rank` first, then content order; when every item was seen, the least
 * recently seen (or, with `rankFirst`, the best rank first and then the least recently seen), flagged repeat_exposure.
 */
function pickRanked(items: readonly SqlItem[], now: Date, seen: readonly { item_id: string; started_at: string }[], rank: (i: SqlItem) => number, rankFirst: boolean): Pick | null {
  if (!items.length) return null;
  const t = now.getTime();
  const last = lastSeenMs(seen, t);
  const order = new Map(items.map((i, n) => [i.id, n]));
  const byRank = (a: SqlItem, b: SqlItem): number => rank(a) - rank(b) || order.get(a.id)! - order.get(b.id)!;
  const unseen = items.filter((i) => (last.get(i.id) ?? -Infinity) < t - SEEN_WINDOW_MS);
  if (unseen.length) return { item: [...unseen].sort(byRank)[0]!, repeat_exposure: false };
  const age = (a: SqlItem, b: SqlItem): number => last.get(a.id)! - last.get(b.id)!;
  return { item: [...items].sort((a, b) => (rankFirst ? byRank(a, b) || age(a, b) : age(a, b) || byRank(a, b)))[0]!, repeat_exposure: true };
}

export interface TrapPickInput {
  now: Date;
  /** The pair's trap items in content order (server/state.ts trapItems), less any item a live timed run holds (S4-15). */
  traps: readonly SqlItem[];
  /** The card's error: a fix item whose starter makes it comes first. */
  errorId: string;
  /** Instances of any item, at their start: closed ones from the replay, plus what was served and is still open. */
  seen: readonly { item_id: string; started_at: string }[];
}
/**
 * S4-08: the item a mistake-card review serves. A trap item not seen in 30 days: a fix item whose starter makes the card's error
 * first (C1's fix round), then a write item, then any other fix item (P-21: a write item plants the card's own error); within each, a pool item before a drill item (so the level
 * drill pools stay unseen where they can), then content order. When every trap item was seen in 30 days, the least recently seen,
 * flagged repeat_exposure, as pickItem does. Null when the pair has no trap item.
 */
export function pickTrapItem(p: TrapPickInput): Pick | null {
  const kindRank = (i: SqlItem): number => (i.kind === 'fix' ? (i.starter_error_id === p.errorId ? 0 : 2) : 1);
  return pickRanked(p.traps.filter((i) => i.kind === 'fix' || i.kind === 'write'), p.now, p.seen, (i) => kindRank(i) * 2 + (i.use === 'drill' ? 1 : 0), false);
}

/**
 * S4-10: the easier item a wheel-spinning concept is offered: an E1 pool item of the concept (write or fix), one not seen in 30
 * days first, a write item before a fix item, then content order. When every E1 item was seen: a write item before a fix item,
 * the least recently seen first, flagged repeat_exposure. Null when the pool has no E1 item.
 */
export function wheelSpinningItem(p: { now: Date; pool: readonly SqlItem[]; seen: readonly { item_id: string; started_at: string }[] }): Pick | null {
  const easy = p.pool.filter((i) => i.use === 'pool' && i.difficulty === 'E1' && (i.kind === 'write' || i.kind === 'fix'));
  return pickRanked(easy, p.now, p.seen, (i) => (i.kind === 'write' ? 0 : 1), true);
}

/**
 * S4-10: one wheel-spinning step per SQL concept whose flag is set (core/states.ts, T-17) and that has a lesson (its worked
 * example), in curriculum order, each with its easier item (wheelSpinningItem). `held`: the items a live timed run holds (S4-15).
 */
export function wheelSpinningSteps(a: { content: ContentStore; replay: ReplayResult; now: Date; seen: readonly { item_id: string; started_at: string }[];
  held?: ReadonlySet<string> }): WheelSpinningStep[] {
  return [...a.content.curriculum.concepts].sort((x, y) => x.order - y.order)
    .filter((c) => a.replay.concepts.get(c.id)?.flags.wheelSpinning === true && a.content.lesson(c.id) !== undefined)
    .map((c) => {
      const pool = poolOf(a.content, c.id).filter((i) => !a.held?.has(i.id));
      return { kind: 'wheel_spinning' as const, concept_id: c.id, item_id: wheelSpinningItem({ now: a.now, pool, seen: a.seen })?.item.id ?? null };
    });
}

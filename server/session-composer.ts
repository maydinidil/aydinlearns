// server/session-composer.ts: what the server feeds Today's composer (core/session.ts), and how it picks the items it serves
// (design §4 "A study day", §5 "Days and look-alikes", §12 difficulty and sub-skills; rulings S2-29 to S2-37, S2-51).
// Everything here reads the replay (server/state.ts) and the content; nothing writes.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Section } from '../core/envelope.ts';
import type { InstanceResult, ReplayResult } from '../core/replay.ts';
import { configFor, retrievability, type CardSnapshot } from '../core/scheduler.ts';
import { DAILY_NEW_CAP, interleave, type ComposerCard, type ComposerConcept, type ComposerInput, type ComposerOpener, type ReviewStats } from '../core/session.ts';
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

/** S2-31: an instance served as a review for a card that was due when it was served, closed with a rating. */
function isScheduledReview(i: InstanceResult): boolean {
  if (i.phase !== 'review' || i.rating === null) return false;
  const before = i.card_reviews[0]?.state_before as CardSnapshot | undefined;
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

/** S2-51: each opener with its level, solved once its CP3 item has a counted pass. */
export function openerInputs(cases: readonly CaseRecord[], curriculum: Curriculum, r: ReplayResult): ComposerOpener[] {
  const out: ComposerOpener[] = [];
  for (const c of cases) {
    const level = openerLevel(c, curriculum);
    const item = openerItem(c);
    if (level === null || item === null) continue;
    out.push({ case_id: c.case_id, level, solved: [...r.instances.values()].some((i) => i.item_id === item && i.countsAsPass) });
  }
  return out;
}

export interface ComposeArgs {
  content: ContentStore; replay: ReplayResult; section: Section; now: Date; examDate: string | null;
  /** The open session (SessionTracker.currentId), or null. */
  sessionId: string | null;
  pairs: readonly PairEntry[]; retest: ComposerInput['retest']; openers: ComposerOpener[];
  /** Fix round 1, I-1: a choice section's cards still inside their lesson window (lessonWindowEnds). Their due reviews wait. */
  lessonWindows?: ReadonlyMap<string, number>;
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
    sessionNewConceptDone: concepts.some(startedInSession), sessionMixedDone, sessionStart, openers: a.openers,
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

/** Every closed instance's item and start, the history "seen in the last 30 days" reads. */
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

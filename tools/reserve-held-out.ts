// tools/reserve-held-out.ts: reserves a choice section's held-out mock pool (design §8, §9; Task C4). The items stay in their
// folder with held_out: true, and content/<section>/held-out.json lists them (S2-64); no practice route serves them.
//
// The rules are C25's (tools/check-choice.ts), so the pool always passes check:content:
// - never an item on D23's list, an unverified item, concept or card (E-118, E-124), an item that is not active (needs_fix or
//   retired), a 2026 feature, or an item under S2-95's practice-only concepts;
// - at most 1 item per enemy group (E-112);
// - every card keeps its practice floor: 3 active items per GA4 parent, 4 per Methodology metric. A GA4 card is the 06 parent,
//   and its 10 children's items count on it (E-110);
// - each GA4 level 1 parent (D12) also keeps 5 practice items of its own topic that are core, verified and not on D23's list,
//   or all it has when it has fewer (S2-103).
//
// How the pool is drawn. One item at a time, the topic whose turn it is by its weight takes an item (the Sainte-Lague
// order: the highest weight / (2 x held + 1)). A topic with nothing left that may be held out drops out, so a short topic
// is filled until every card it can draw from is at a floor or has nothing else that may be held out, and what it cannot
// take is shared by weight among the others (D23, E-111, S2-103). The total stays (E-109).
// GA4 topics weigh 25/25/25/10/15 (design §8). Methodology has no topic weights: every metric weighs the same, so a topic
// weighs its number of metrics. Inside a topic, the item comes from the card with the most practice items of that topic left
// (ties: fewer held, then the card ID). From that card, an item that blocks no other item that may be held out comes first
// (it has no enemy group, or the only one in its group that may be held out), so no near-duplicate of a held item stays in
// practice when it can be avoided; then the order is a hash of the item ID.
// No text is read and nothing is random: the same bank gives the same pool in any file order.
//
// Key safety (non-negotiable 2): it prints counts per topic and per card only, never which items are held out, and never
// item text. Usage: node tools/reserve-held-out.ts <ga4|methodology> [content-root] [--replace]
// A different pool that already exists is never replaced without --replace: once items are served, moving a practised item
// into the pool would make it a seen mock question.
//
// Incremental mode (sprint 3, S3-21, S3-22): new items join the pool, and a few held items leave it, without ever moving an
// item the learner has practised. Usage:
//   node tools/reserve-held-out.ts <ga4|methodology> --extend --candidates <file>
//     (--per-card <k> | --topic <T> --count <n> [--release-from <T1,T2,...>]) [--logs <dir>] [content-root]
// - <file> lists, one item ID per line, the only items that may be ADDED (the new, unpublished ones). A candidate that is not in
//   the bank or is already held refuses the run. One that may not be held out (C25's eligibility: practice-only, unverified, D23's
//   list, inactive, a 2026 feature) is skipped, and the output says how many were skipped (a count only). Too few eligible
//   candidates for the count refuses too.
// - --per-card k adds k candidates for every card that has candidates (Methodology: 1 per new metric). --topic T --count n adds
//   n candidates of topic T. --release-from T1,T2 releases the same number of held items, from T1 first, then T2, so the total
//   is unchanged. Without it nothing is released.
// - The choice follows the draw's order: the card with the most practice items of the topic left (ties: fewer held, then the
//   card ID), an item that blocks no other candidate first, then the hash of the item ID. A release takes the card with the
//   most held items first, then the hash. Nothing is random.
// - Every rule above must hold for the resulting pool (eligibility, 1 per enemy group, the card floors, S2-103), or the command
//   refuses with a count and writes nothing.
// - --logs <dir>: no item added or released may be named by any record in that folder's attempts-*.jsonl files (an attempt, a
//   serving or instance record, solution_opened, item_close); a candidate named there is refused, a held item named there is
//   not released. Without --logs this is safe this sprint because no route has ever served a held-out item (S2-64) and the
//   candidates are new, unpublished items, so no record can name them.
// The output is counts only, as above.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateChoiceConcept, type ChoiceConcept, type ChoiceItem, type ChoiceSection } from '../schemas/choice.ts';
import { validateGa4Item } from '../schemas/ga4.ts';
import { validateMethodologyItem } from '../schemas/methodology.ts';
import {
  HELD_OUT_EXCLUDED_ITEMS, LEVEL1_OWN_TOPIC_CORE_FLOOR, levelOneCoreItem, loadChoiceBank, NEVER_HELD_OUT_CONCEPTS, PRACTICE_FLOOR, SECTIONS,
  type ChoiceBank,
} from './check-choice.ts';

/** Design §8: the GA4 exam's topic weights, in percent. */
export const GA4_TOPIC_WEIGHTS: Readonly<Record<string, number>> = { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 };
/** How many items to hold out, the topic weights (null: every card weighs the same), and the practice floor per card. */
export interface HeldOutRules { total: number; weights: Readonly<Record<string, number>> | null; floor: number }
/** Design §8 (50 GA4 items, E-109) and §9 (about 25 metric items). */
export const HELD_OUT_RULES: Readonly<Record<ChoiceSection, HeldOutRules>> = {
  ga4: { total: 50, weights: GA4_TOPIC_WEIGHTS, floor: PRACTICE_FLOOR.ga4 },
  methodology: { total: 25, weights: null, floor: PRACTICE_FLOOR.methodology },
};

/** One topic: its weight, its share of the total by weight, how many of its items may be held out, and how many are. */
export interface TopicCount { topic: string; weight: number; share: number; eligible: number; held: number; full: boolean }
/** One card (a GA4 parent or a Methodology metric): its active items, how many are held out, and how many stay in practice. */
export interface CardCount { card: string; active: number; held: number; practice: number }
/** S2-103, one GA4 level 1 parent: its own topic, the practice items that count, how many stay, and how many must. */
export interface LevelOneCount { card: string; topic: string; counted: number; left: number; need: number }
export interface Reservation { section: ChoiceSection; target: number; ids: string[]; topics: TopicCount[]; cards: CardCount[]; levelOne: LevelOneCount[] }

/** The card an item rates: a GA4 item's 06 parent (E-110), otherwise its own concept. As C25 counts it. */
const cardOf = (i: ChoiceItem): string => (i.section === 'ga4' ? i.parent_id ?? i.concept_id : i.concept_id);
/** The order inside a card: a hash of the item ID, so neither the file order nor the text plays a part. */
export const heldOutRank = (id: string): string => createHash('sha256').update(`held-out:${id}`).digest('hex');
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Whether C25 allows the item in the pool at all (D23, E-118, E-124, S2-95, design §8). */
export function mayBeHeldOut(item: ChoiceItem, concepts: ReadonlyMap<string, ChoiceConcept>): boolean {
  const card = cardOf(item);
  if (item.status !== 'active') return false;
  if (!item.verified || concepts.get(item.concept_id)?.verified === false || concepts.get(card)?.verified === false) return false;
  if (item.section === 'ga4') {
    if (HELD_OUT_EXCLUDED_ITEMS.includes(item.id)) return false;
    if (NEVER_HELD_OUT_CONCEPTS.includes(card) || NEVER_HELD_OUT_CONCEPTS.includes(item.concept_id)) return false;
    if (item.exam_relevance === 'new_2026') return false;
  }
  return true;
}

/** Draws the pool. Pure: it reads only IDs, topics, cards, groups and flags, and returns the pool in ID order. */
export function reserveHeldOut(section: ChoiceSection, items: readonly ChoiceItem[], concepts: readonly ChoiceConcept[],
  rules: HeldOutRules = HELD_OUT_RULES[section]): Reservation {
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const topicOf = (i: ChoiceItem): string | null => (i.section === 'ga4' ? i.topic_id : conceptById.get(i.concept_id)?.topic_id ?? null);
  const active = items.filter((i) => i.status === 'active');

  const weights = new Map<string, number>();
  if (rules.weights) for (const [t, w] of Object.entries(rules.weights)) weights.set(t, w);
  else {
    for (const card of new Set(active.map(cardOf))) {
      const t = conceptById.get(card)?.topic_id;
      if (t) weights.set(t, (weights.get(t) ?? 0) + 1);
    }
  }
  const weightOf = (t: string | null): number => (t === null ? 0 : weights.get(t) ?? 0);
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0);

  const cards = new Map<string, { active: number; held: number }>();
  const left = new Map<string, number>();                    // practice items of one topic on one card
  const leftKey = (topic: string | null, card: string): string => `${topic}\u0000${card}`;
  for (const i of active) {
    const c = cards.get(cardOf(i)) ?? { active: 0, held: 0 };
    c.active++;
    cards.set(cardOf(i), c);
    left.set(leftKey(topicOf(i), cardOf(i)), (left.get(leftKey(topicOf(i), cardOf(i))) ?? 0) + 1);
  }

  const eligible = active.filter((i) => mayBeHeldOut(i, conceptById) && weightOf(topicOf(i)) > 0)
    .map((i) => ({ i, rank: heldOutRank(i.id) }))
    .sort((a, b) => byText(a.rank, b.rank) || byText(a.i.id, b.i.id))
    .map((x) => x.i);
  const groupSize = new Map<string, number>();
  for (const i of eligible) if (i.enemy_group !== null) groupSize.set(i.enemy_group, (groupSize.get(i.enemy_group) ?? 0) + 1);
  const blocks = (i: ChoiceItem): number => (i.enemy_group === null ? 0 : groupSize.get(i.enemy_group)! - 1);
  // S2-103: a GA4 level 1 parent keeps LEVEL1_OWN_TOPIC_CORE_FLOOR of the practice items that count, or all it has.
  const counts = new Set(active.filter((i) => levelOneCoreItem(i, conceptById)).map((i) => i.id));
  const levelOne = new Map<string, { counted: number; held: number }>();
  for (const i of active) {
    if (!counts.has(i.id)) continue;
    const c = levelOne.get(cardOf(i)) ?? { counted: 0, held: 0 };
    c.counted++;
    levelOne.set(cardOf(i), c);
  }
  const need = (c: { counted: number }): number => Math.min(LEVEL1_OWN_TOPIC_CORE_FLOOR, c.counted);
  const keepsLevelOneFloor = (i: ChoiceItem): boolean => {
    const c = levelOne.get(cardOf(i));
    return !counts.has(i.id) || c!.counted - c!.held - 1 >= need(c!);
  };

  const held = new Set<string>();
  const usedGroups = new Set<string>();
  const heldIn = new Map<string, number>();
  const open = (i: ChoiceItem): boolean => {
    const c = cards.get(cardOf(i))!;
    return !held.has(i.id) && !(i.enemy_group !== null && usedGroups.has(i.enemy_group)) && c.held < c.active - rules.floor && keepsLevelOneFloor(i);
  };

  while (held.size < rules.total) {
    const candidates = eligible.filter(open);
    if (!candidates.length) break;
    // The topic whose turn it is: Sainte-Lague, ties to the heavier topic, then the topic ID.
    const priority = (t: string): number => weightOf(t) / (2 * (heldIn.get(t) ?? 0) + 1);
    const topic = [...new Set(candidates.map((i) => topicOf(i)!))]
      .sort((a, b) => priority(b) - priority(a) || weightOf(b) - weightOf(a) || byText(a, b))[0]!;
    const inTopic = candidates.filter((i) => topicOf(i) === topic);
    // The card with the most practice items of this topic left; ties to the card with fewer held, then the card ID.
    const card = [...new Set(inTopic.map(cardOf))]
      .sort((a, b) => left.get(leftKey(topic, b))! - left.get(leftKey(topic, a))! || cards.get(a)!.held - cards.get(b)!.held || byText(a, b))[0]!;
    // Candidates are already in hash order; an item that blocks no other item that may be held out comes first.
    const item = inTopic.filter((i) => cardOf(i) === card).sort((a, b) => blocks(a) - blocks(b))[0]!;
    held.add(item.id);
    if (item.enemy_group !== null) usedGroups.add(item.enemy_group);
    cards.get(card)!.held++;
    if (counts.has(item.id)) levelOne.get(card)!.held++;
    left.set(leftKey(topic, card), left.get(leftKey(topic, card))! - 1);
    heldIn.set(topic, (heldIn.get(topic) ?? 0) + 1);
  }

  const topicIds = [...new Set([...weights.keys(), ...active.map(topicOf).filter((t): t is string => t !== null)])].sort(byText);
  return {
    section,
    target: rules.total,
    ids: [...held].sort(byText),
    topics: topicIds.map((t) => ({
      topic: t,
      weight: weightOf(t),
      share: totalWeight ? (rules.total * weightOf(t)) / totalWeight : 0,
      eligible: eligible.filter((i) => topicOf(i) === t).length,
      held: heldIn.get(t) ?? 0,
      full: !eligible.some((i) => topicOf(i) === t && open(i)),
    })),
    cards: [...cards].sort(([a], [b]) => byText(a, b)).map(([card, c]) => ({ card, active: c.active, held: c.held, practice: c.active - c.held })),
    levelOne: [...levelOne].sort(([a], [b]) => byText(a, b))
      .map(([card, c]) => ({ card, topic: conceptById.get(card)!.topic_id, counted: c.counted, left: c.counted - c.held, need: need(c) })),
  };
}

/** The report the command prints: counts per topic and per card (and per level 1 parent, S2-103), nothing else. */
export function summaryLines(r: Reservation): string[] {
  const held = r.ids.length;
  const eligible = r.topics.reduce((n, t) => n + t.eligible, 0);
  const pad = (s: string | number, n: number): string => String(s).padStart(n);
  const lines = [
    `${r.section}: ${held} held out (target ${r.target}); ${eligible} active items may be held out`,
    `  topic           weight  by weight  may be held out  held`,
    ...r.topics.map((t) => `  ${t.topic.padEnd(14)}  ${pad(t.weight, 6)}  ${pad(t.share.toFixed(1), 9)}  ${pad(t.eligible, 15)}  ${pad(t.held, 4)}${t.full ? '  (full)' : ''}`),
    `  card            active  held  practice left`,
    ...r.cards.map((c) => `  ${c.card.padEnd(14)}  ${pad(c.active, 6)}  ${pad(c.held, 4)}  ${pad(c.practice, 13)}`),
  ];
  if (r.levelOne.length) {
    lines.push(`  level 1 parent  own topic  counted  left  must stay (S2-103: core, verified, not on D23's list)`);
    lines.push(...r.levelOne.map((c) => `  ${c.card.padEnd(14)}  ${c.topic.padEnd(9)}  ${pad(c.counted, 7)}  ${pad(c.left, 4)}  ${pad(c.need, 9)}`));
  }
  for (const t of r.topics.filter((x) => x.held + 0.5 < x.share)) {
    lines.push(`${t.topic} holds ${t.held}, ${(t.share - t.held).toFixed(1)} below its share by weight: every card it can draw from is at a floor (the practice floor, or S2-103's for a level 1 parent) or has nothing else that may be held out. The others share the rest by weight.`);
  }
  if (held < r.target) lines.push(`Only ${held} of ${r.target} could be held out: every card is at a floor or has nothing else that may be held out.`);
  return lines;
}

/** Why the bank cannot be reserved from, or null. Counts only: check:content names the files. */
function bankProblem(bank: ChoiceBank): string | null {
  const list = bank.concepts?.readable && bank.concepts.data && typeof bank.concepts.data === 'object'
    ? (bank.concepts.data as { concepts?: unknown }).concepts : undefined;
  if (!Array.isArray(list)) return `${bank.section}/concepts.json is missing or unreadable`;
  const badConcepts = list.filter((c) => validateChoiceConcept(c, bank.section).length).length;
  const validate = bank.section === 'ga4' ? validateGa4Item : validateMethodologyItem;
  const badItems = bank.items.filter((f) => !f.readable || validate(f.data).length).length;
  if (badConcepts) return `${badConcepts} concept${badConcepts === 1 ? ' does' : 's do'} not validate`;
  if (badItems) return `${badItems} item file${badItems === 1 ? ' is' : 's are'} not valid JSON or do${badItems === 1 ? 'es' : ''} not validate`;
  if (!bank.items.length) return 'the section has no items';
  return null;
}

/** The pool as it stands: the held-out file's list and every flagged item. */
function currentPool(bank: ChoiceBank): Set<string> {
  const pool = new Set<string>();
  const listed = bank.heldOut?.readable && bank.heldOut.data && typeof bank.heldOut.data === 'object'
    ? (bank.heldOut.data as { item_ids?: unknown }).item_ids : undefined;
  if (Array.isArray(listed)) for (const id of listed) if (typeof id === 'string') pool.add(id);
  for (const f of bank.items) if ((f.data as ChoiceItem).held_out) pool.add((f.data as ChoiceItem).id);
  return pool;
}

/** What an incremental run asks for. */
export interface ExtendOptions {
  candidates: ReadonlySet<string>;
  perCard?: number;
  topic?: string;
  count?: number;
  releaseFrom?: readonly string[];
  /** Item IDs named by a log record: they may neither be added nor released. */
  logged?: ReadonlySet<string>;
}
export interface Extension { pool: string[]; added: number; released: number; skipped: number; topics: { topic: string; before: number; after: number }[]; cards: CardCount[] }
export class ExtendRefusal extends Error {}

/**
 * Adds candidates to a pool and releases held items, without touching any other item. Pure; throws ExtendRefusal (counts only in
 * the message) when a request cannot be met or the result would break a rule.
 */
export function extendHeldOut(section: ChoiceSection, items: readonly ChoiceItem[], concepts: readonly ChoiceConcept[], pool: ReadonlySet<string>,
  opts: ExtendOptions, rules: HeldOutRules = HELD_OUT_RULES[section]): Extension {
  const refuse = (m: string): never => { throw new ExtendRefusal(m); };
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const topicOf = (i: ChoiceItem): string | null => (i.section === 'ga4' ? i.topic_id : conceptById.get(i.concept_id)?.topic_id ?? null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const logged = opts.logged ?? new Set<string>();
  const byHash = (a: ChoiceItem, b: ChoiceItem): number => byText(heldOutRank(a.id), heldOutRank(b.id)) || byText(a.id, b.id);

  const found = [...opts.candidates].map((id) => byId.get(id));
  if (found.some((c) => !c)) refuse(`${plural(found.filter((c) => !c).length, 'candidate is', 'candidates are')} not in the ${section} bank`);
  const listed = found as ChoiceItem[];
  const alreadyHeld = listed.filter((c) => pool.has(c.id)).length;
  if (alreadyHeld) refuse(`${plural(alreadyHeld, 'candidate is', 'candidates are')} already held out`);
  const weighted = (c: ChoiceItem): boolean => rules.weights === null || (rules.weights[topicOf(c) ?? ''] ?? 0) > 0;
  // An ineligible candidate (D23's list, unverified, not active, a 2026 feature, a practice-only concept, or no topic weight) is skipped and counted.
  const cands = listed.filter((c) => mayBeHeldOut(c, conceptById) && weighted(c));
  const skipped = listed.length - cands.length;
  const loggedCands = cands.filter((c) => logged.has(c.id)).length;
  if (loggedCands) refuse(`${plural(loggedCands, 'candidate is', 'candidates are')} named by a log record`);
  const heldItems = [...pool].map((id) => byId.get(id)).filter((i): i is ChoiceItem => !!i);
  if (heldItems.length < pool.size) refuse(`${plural(pool.size - heldItems.length, 'held-out ID is', 'held-out IDs are')} not in the ${section} bank`);

  const active = items.filter((i) => i.status === 'active');
  const next = new Set(pool);
  const heldIn = (card: string): number => active.filter((i) => next.has(i.id) && cardOf(i) === card).length;
  const usedGroups = (): Set<string> => new Set(active.filter((i) => next.has(i.id) && i.enemy_group !== null).map((i) => i.enemy_group!));
  const counts = new Set(active.filter((i) => levelOneCoreItem(i, conceptById)).map((i) => i.id));
  const levelOneCounts = (card: string): { counted: number; left: number; need: number } => {
    const counted = active.filter((i) => counts.has(i.id) && cardOf(i) === card);
    return { counted: counted.length, left: counted.filter((i) => !next.has(i.id)).length, need: Math.min(LEVEL1_OWN_TOPIC_CORE_FLOOR, counted.length) };
  };

  // Release first: it frees enemy groups the candidates may need. T1 first, then T2; the card with most held items first, then the hash.
  const released: string[] = [];
  const release = (n: number): void => {
    for (const t of opts.releaseFrom ?? []) {
      const pickable = heldItems.filter((i) => next.has(i.id) && topicOf(i) === t && !logged.has(i.id));
      while (released.length < n && pickable.length) {
        pickable.sort((a, b) => heldIn(cardOf(b)) - heldIn(cardOf(a)) || byText(cardOf(a), cardOf(b)) || byHash(a, b));
        const i = pickable.shift()!;
        next.delete(i.id);
        released.push(i.id);
      }
    }
    if (released.length < n) refuse(`only ${released.length} of ${n} held items can be released (the others are in other topics or named by a log record)`);
  };
  /** Adds one item from `from`: the card with the most practice items of the topic left, an item that blocks no other, then the hash. */
  const addOne = (from: ChoiceItem[], topic: string | null): boolean => {
    const open = from.filter((i) => {
      const card = cardOf(i);
      if (next.has(i.id) || (i.enemy_group !== null && usedGroups().has(i.enemy_group))) return false;
      if (heldIn(card) >= active.filter((x) => cardOf(x) === card).length - rules.floor) return false;
      next.add(i.id);
      const l = levelOneCounts(card);
      next.delete(i.id);
      return !counts.has(i.id) || l.left >= l.need;
    });
    if (!open.length) return false;
    const left = (card: string): number => active.filter((i) => cardOf(i) === card && !next.has(i.id) && (topic === null || topicOf(i) === topic)).length;
    const card = [...new Set(open.map(cardOf))].sort((a, b) => left(b) - left(a) || heldIn(a) - heldIn(b) || byText(a, b))[0]!;
    const groupSize = new Map<string, number>();
    for (const i of open) if (i.enemy_group !== null) groupSize.set(i.enemy_group, (groupSize.get(i.enemy_group) ?? 0) + 1);
    const blocks = (i: ChoiceItem): number => (i.enemy_group === null ? 0 : groupSize.get(i.enemy_group)! - 1);
    next.add(open.filter((i) => cardOf(i) === card).sort((a, b) => blocks(a) - blocks(b) || byHash(a, b))[0]!.id);
    return true;
  };

  if (opts.perCard !== undefined) {
    if (opts.topic !== undefined || opts.count !== undefined) refuse('--per-card cannot be combined with --topic or --count');
    const perCard = new Map<string, ChoiceItem[]>();
    for (const c of cands) perCard.set(cardOf(c), [...(perCard.get(cardOf(c)) ?? []), c]);
    if (opts.releaseFrom) release(perCard.size * opts.perCard);
    for (const card of [...perCard.keys()].sort(byText)) {
      for (let k = 0; k < opts.perCard; k++) {
        if (!addOne(perCard.get(card)!, null)) refuse(`a card with candidates can take only ${k} of ${opts.perCard} (enemy groups or its practice floor)`);
      }
    }
  } else {
    if (opts.topic === undefined || opts.count === undefined) refuse('give --per-card, or --topic and --count');
    const n = opts.count!;
    const inTopic = cands.filter((c) => topicOf(c) === opts.topic);
    if (inTopic.length < n) refuse(`only ${inTopic.length} candidates are of topic ${opts.topic}, ${n} wanted`);
    if (opts.releaseFrom) release(n);
    for (let k = 0; k < n; k++) {
      if (!addOne(inTopic, opts.topic!)) refuse(`only ${k} of ${n} candidates of topic ${opts.topic} can be added (enemy groups or practice floors)`);
    }
  }

  // The result must pass C25's rules.
  const finalItems = [...next].map((id) => byId.get(id)!);
  const wasHeld = new Set(heldItems.map((i) => i.id));
  const groups = finalItems.filter((i) => i.enemy_group !== null).map((i) => i.enemy_group);
  if (new Set(groups).size !== groups.length) refuse('the new pool would hold two items of one enemy group');
  const cardIds = [...new Set(active.map(cardOf))].sort(byText);
  const cards = cardIds.map((card) => {
    const a = active.filter((i) => cardOf(i) === card).length;
    return { card, active: a, held: heldIn(card), practice: a - heldIn(card) };
  });
  const low = cards.filter((c) => c.practice < rules.floor && c.held > 0).length;
  if (low) refuse(`${plural(low, 'card', 'cards')} would fall below the practice floor of ${rules.floor}`);
  const lowLevelOne = cardIds.map(levelOneCounts).filter((c) => c.left < c.need).length;
  if (lowLevelOne) refuse(`${plural(lowLevelOne, 'level 1 parent', 'level 1 parents')} would fall below S2-103's own-topic floor`);
  const topicIds = [...new Set(active.map(topicOf).filter((t): t is string => t !== null))].sort(byText);
  return {
    pool: [...next].sort(byText), added: finalItems.filter((i) => !wasHeld.has(i.id)).length, released: released.length, skipped,
    topics: topicIds.map((t) => ({ topic: t, before: heldItems.filter((i) => topicOf(i) === t).length, after: finalItems.filter((i) => topicOf(i) === t).length })),
    cards,
  };
}

class NoAttemptsFiles extends Error {}

/** The item IDs among `ids` that any attempts-*.jsonl file in `dir` names. Throws when the folder cannot be read or holds no attempts file. */
async function loggedIds(dir: string, ids: readonly string[]): Promise<Set<string>> {
  const named = new Set<string>();
  const files = (await readdir(dir)).filter((n) => /^attempts-.*\.jsonl$/.test(n));
  // s3:L76: a wrong folder has no attempts files and would pass as a clean one, so none is a refusal.
  if (!files.length) throw new NoAttemptsFiles();
  for (const f of files) {
    const text = await readFile(join(dir, f), 'utf8');
    for (const id of ids) if (text.includes(`"${id}"`)) named.add(id);
  }
  return named;
}

const EXTEND_USAGE = 'Usage: node tools/reserve-held-out.ts <ga4|methodology> --extend --candidates <file> (--per-card <k> | --topic <T> --count <n> [--release-from <T1,T2,...>]) [--logs <dir>] [content-root]';

async function extendMain(argv: string[]): Promise<number> {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k]!;
    if (a === '--extend') continue;
    if (['--candidates', '--per-card', '--topic', '--count', '--release-from', '--logs'].includes(a)) {
      const v = argv[++k];
      if (v === undefined || v.startsWith('--')) { console.error(`${a} needs a value. ${EXTEND_USAGE}`); return 1; }
      flags.set(a, v);
    } else if (a.startsWith('--')) { console.error(`Unknown option ${a}. ${EXTEND_USAGE}`); return 1; }
    else positional.push(a);
  }
  const [section, rootArg] = positional;
  const num = (name: string): number | undefined => (flags.has(name) ? Number(flags.get(name)) : undefined);
  const perCard = num('--per-card');
  const count = num('--count');
  const topicMode = flags.has('--topic') && count !== undefined;
  if (!SECTIONS.includes(section as ChoiceSection) || positional.length > 2 || !flags.has('--candidates')
    || [perCard, count].some((n) => n !== undefined && (!Number.isInteger(n) || n < 1)) || (perCard !== undefined) === topicMode) {
    console.error(EXTEND_USAGE);
    return 1;
  }
  const s = section as ChoiceSection;
  const root = rootArg ? resolve(rootArg) : fileURLToPath(new URL('../content', import.meta.url));
  const fail = (m: string): number => { console.error(`${s}: ${m}. Nothing was written.`); return 1; };
  const candidateText = await readFile(resolve(flags.get('--candidates')!), 'utf8').catch(() => null);
  if (candidateText === null) return fail('the candidates file cannot be read');
  const candidates = new Set(candidateText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  if (!candidates.size) return fail('the candidates file lists no item');
  const bank = await loadChoiceBank(root, s);
  const problem = bankProblem(bank);
  if (problem) return fail(`${problem}. Run npm run check:content and fix the bank first`);
  const items = bank.items.map((f) => f.data as ChoiceItem);
  const concepts = (bank.concepts!.data as { concepts: ChoiceConcept[] }).concepts;
  const before = currentPool(bank);
  let logged: Set<string> | undefined;
  if (flags.has('--logs')) {
    try { logged = await loggedIds(resolve(flags.get('--logs')!), [...candidates, ...before]); }
    catch (e) { return fail(e instanceof NoAttemptsFiles ? 'the logs folder has no attempts files, so it may be the wrong folder' : 'the logs folder cannot be read'); }
  }
  let ext: Extension;
  try {
    ext = extendHeldOut(s, items, concepts, before, {
      candidates, perCard, topic: flags.get('--topic'), count, logged,
      releaseFrom: flags.has('--release-from') ? flags.get('--release-from')!.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
  } catch (e) {
    if (e instanceof ExtendRefusal) return fail(e.message);
    throw e;
  }
  const pool = new Set(ext.pool);
  const pad = (x: string | number, n: number): string => String(x).padStart(n);
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  console.log(`${s}: ${ext.added} added, ${ext.released} released; ${ext.pool.length} held out (was ${before.size})`);
  if (ext.skipped) console.log(`${plural(ext.skipped, 'candidate', 'candidates')} skipped as ineligible`);
  console.log('  topic           held before  held after');
  for (const t of ext.topics) console.log(`  ${t.topic.padEnd(14)}  ${pad(t.before, 11)}  ${pad(t.after, 10)}`);
  console.log('  card            active  held  practice left');
  for (const c of ext.cards) console.log(`  ${c.card.padEnd(14)}  ${pad(c.active, 6)}  ${pad(c.held, 4)}  ${pad(c.practice, 13)}`);
  let written = 0;
  for (const f of bank.items) {
    const item = f.data as ChoiceItem;
    if (item.held_out === pool.has(item.id)) continue;
    await writeFile(join(root, f.file), JSON.stringify({ ...item, held_out: pool.has(item.id) }, null, 2) + '\n');
    written++;
  }
  await writeFile(join(root, `${s}/held-out.json`), JSON.stringify({ item_ids: ext.pool }, null, 2) + '\n');
  console.log(`wrote ${s}/held-out.json and ${written} item file${written === 1 ? '' : 's'}`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--extend')) return extendMain(argv);
  const replace = argv.includes('--replace');
  const [section, rootArg] = argv.filter((a) => a !== '--replace');
  if (!SECTIONS.includes(section as ChoiceSection)) {
    console.error('Usage: node tools/reserve-held-out.ts <ga4|methodology> [content-root] [--replace]. The section must be ga4 or methodology.');
    return 1;
  }
  const s = section as ChoiceSection;
  const root = rootArg ? resolve(rootArg) : fileURLToPath(new URL('../content', import.meta.url));
  const bank = await loadChoiceBank(root, s);
  const problem = bankProblem(bank);
  if (problem) {
    console.error(`${s}: ${problem}. Run npm run check:content and fix the bank first. Nothing was written.`);
    return 1;
  }
  const items = bank.items.map((f) => f.data as ChoiceItem);
  const concepts = (bank.concepts!.data as { concepts: ChoiceConcept[] }).concepts;
  const r = reserveHeldOut(s, items, concepts);
  const pool = new Set(r.ids);
  const before = currentPool(bank);
  const same = before.size === pool.size && [...before].every((id) => pool.has(id));
  if (before.size && !same && !replace) {
    console.error(`${s}: a different held-out pool of ${before.size} items already exists. Replacing it could move practised items into the mock pool.`
      + ' Run again with --replace only if no item of this section has been served yet. Nothing was written.');
    return 1;
  }
  for (const line of summaryLines(r)) console.log(line);
  let written = 0;
  for (const f of bank.items) {
    const item = f.data as ChoiceItem;
    if (item.held_out === pool.has(item.id)) continue;
    await writeFile(join(root, f.file), JSON.stringify({ ...item, held_out: pool.has(item.id) }, null, 2) + '\n');
    written++;
  }
  const poolFile = `${s}/held-out.json`;
  const text = JSON.stringify({ item_ids: r.ids }, null, 2) + '\n';
  const old = await readFile(join(root, poolFile), 'utf8').catch(() => null);
  if (old !== text) await writeFile(join(root, poolFile), text);
  console.log(written || old !== text ? `wrote ${poolFile} and ${written} item file${written === 1 ? '' : 's'}` : 'unchanged: the pool and the flags already match');
  return 0;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));

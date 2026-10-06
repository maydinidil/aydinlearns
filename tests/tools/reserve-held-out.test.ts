// Task C4: the held-out reservation (design §8, §9; D23, E-109, E-111, E-112, E-118, E-124, S2-64, S2-95). Every bank here is
// invented (tests/helpers/choice-fixture.ts builds the items): no real question appears in a test. Item numbers start at 300 so
// that none collides with D23's list by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ChoiceConcept, ChoiceItem, ChoiceSection } from '../../schemas/choice.ts';
import type { Ga4Item } from '../../schemas/ga4.ts';
import type { MethodologyItem } from '../../schemas/methodology.ts';
import { checkChoiceBank, HELD_OUT_EXCLUDED_ITEMS, LEVEL1_PARENTS, NEVER_HELD_OUT_CONCEPTS, PRACTICE_FLOOR } from '../../tools/check-choice.ts';
import { GA4_TOPIC_WEIGHTS, HELD_OUT_RULES, heldOutRank, reserveHeldOut, type HeldOutRules, type Reservation } from '../../tools/reserve-held-out.ts';
import { bankOf, ga4Item, metMcq, writeSection } from '../helpers/choice-fixture.ts';

const run = promisify(execFile);
const TOOL = 'tools/reserve-held-out.ts';

// ---- An invented bank -------------------------------------------------------------------------------------------------------

const concept = (id: string, topic: string, parent: string | null = null, over: Partial<ChoiceConcept> = {}): ChoiceConcept =>
  ({ id, parent_id: parent, topic_id: topic, title: 'An invented concept', level: null, verified: true, ...over });
const ids = (from: number, n: number): string[] => Array.from({ length: n }, (_, k) => `Q-GA4-${from + k}`);
/** GA4 items of one concept, with the concept's parent and topic (E-110). */
const ga4Of = (c: ChoiceConcept, itemIds: string[], over: (id: string, k: number) => Partial<Ga4Item> = () => ({})): Ga4Item[] =>
  itemIds.map((id, k) => ga4Item(id, c.id, { concept_id: c.id, parent_id: c.parent_id, topic_id: c.topic_id, level: null, ...over(id, k) }));

const P1 = concept('GA4-TONE-01', 'T-GA4-01');
const P2 = concept('GA4-TTWO-01', 'T-GA4-02');
const P3 = concept('GA4-TTHREE-01', 'T-GA4-03');
const P4 = concept('GA4-TFOUR-01', 'T-GA4-04');
const P5 = concept('GA4-TFIVE-01', 'T-GA4-05');
/** One parent per topic, each with plenty of items. */
function roomyGa4(n = 12): { concepts: ChoiceConcept[]; items: Ga4Item[] } {
  const parents = [P1, P2, P3, P4, P5];
  return { concepts: parents, items: parents.flatMap((p, k) => ga4Of(p, ids(300 + 100 * k, n))) };
}
const SMALL: HeldOutRules = { total: 20, weights: GA4_TOPIC_WEIGHTS, floor: PRACTICE_FLOOR.ga4 };

const heldIn = (r: Reservation, topic: string): number => r.topics.find((t) => t.topic === topic)?.held ?? 0;
const byTopic = (r: Reservation): Record<string, number> => Object.fromEntries(r.topics.map((t) => [t.topic, t.held]));
const cardOf = (r: Reservation, card: string) => r.cards.find((c) => c.card === card)!;
/** C25 on the bank with the reservation applied: the check:content gate the tool must always pass. */
function c25Failures(section: ChoiceSection, concepts: readonly ChoiceConcept[], items: readonly ChoiceItem[], held: readonly string[]): string[] {
  const set = new Set(held);
  const applied = items.map((i) => ({ ...i, held_out: set.has(i.id) }));
  return checkChoiceBank(bankOf(section, { concepts, items: applied, keys: [], heldOut: held }))
    .filter((r) => r.check === 'C25' && !r.ok).map((r) => `${r.id}: ${r.detail}`);
}

// ---- The rules ----------------------------------------------------------------------------------------------------------------

test('the rules are design §8 and §9: GA4 holds 50 by topic weight 25/25/25/10/15, Methodology about 25; floors 3 and 4', () => {
  assert.deepEqual(GA4_TOPIC_WEIGHTS, { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 });
  assert.deepEqual(HELD_OUT_RULES.ga4, { total: 50, weights: GA4_TOPIC_WEIGHTS, floor: 3 });
  assert.deepEqual(HELD_OUT_RULES.methodology, { total: 25, weights: null, floor: 4 });
});

test('weights: with room everywhere, each topic gets its share of the total', () => {
  const { concepts, items } = roomyGa4();
  const r = reserveHeldOut('ga4', items, concepts, SMALL);
  assert.equal(r.ids.length, 20);
  assert.deepEqual(byTopic(r), { 'T-GA4-01': 5, 'T-GA4-02': 5, 'T-GA4-03': 5, 'T-GA4-04': 2, 'T-GA4-05': 3 });
  assert.deepEqual(r.topics.map((t) => t.share), [5, 5, 5, 2, 3]);
  assert.ok(r.topics.every((t) => !t.full), 'no topic ran out');
  assert.deepEqual(c25Failures('ga4', concepts, items, r.ids), []);
  // The real total: 50 by 25/25/25/10/15 on a bank with room for it.
  const big = roomyGa4(20);
  const full = reserveHeldOut('ga4', big.items, big.concepts);
  assert.equal(full.ids.length, 50);
  for (const t of full.topics) assert.ok(Math.abs(t.held - t.share) <= 0.5, `${t.topic} held ${t.held}, share ${t.share}`);
  assert.deepEqual(c25Failures('ga4', big.concepts, big.items, full.ids), []);
});

test('the floor: a short topic is filled until its parents keep exactly the practice floor, and the shortfall is shared by weight (D23)', () => {
  // T-GA4-03 has two parents of 4 items: each can give 1 and keep 3, so the topic holds 2 where its weight asks for 5.
  const roomy = roomyGa4();
  const p3b = concept('GA4-TTHREE-02', 'T-GA4-03');
  const concepts = [...roomy.concepts, p3b];
  const items = [...roomy.items.filter((i) => i.topic_id !== 'T-GA4-03'), ...ga4Of(P3, ids(500, 4)), ...ga4Of(p3b, ids(550, 4))];
  const r = reserveHeldOut('ga4', items, concepts, SMALL);
  assert.equal(r.ids.length, 20);
  assert.equal(heldIn(r, 'T-GA4-03'), 2);
  assert.equal(r.topics.find((t) => t.topic === 'T-GA4-03')!.full, true);
  for (const p of [P3.id, p3b.id]) assert.deepEqual([cardOf(r, p).held, cardOf(r, p).practice], [1, 3], p);
  // The 18 left are shared by weight among the other four topics: 25/25/10/15 of 18 is 6, 6, 2.4 and 3.6.
  assert.deepEqual(byTopic(r), { 'T-GA4-01': 6, 'T-GA4-02': 6, 'T-GA4-03': 2, 'T-GA4-04': 2, 'T-GA4-05': 4 });
  assert.deepEqual(c25Failures('ga4', concepts, items, r.ids), []);
});

test('the floor counts every item a parent card rates, its 10 children in other topics included (E-110)', () => {
  // The parent has 3 items of its own topic and a child in T-GA4-04 with 3 more: 6 on one card, so at most 3 are held.
  const child = concept('GA4-TFOUR-20', 'T-GA4-04', P1.id);
  const concepts = [P1, child, P2, P3, P5];
  const items = [...ga4Of(P1, ids(300, 3)), ...ga4Of(child, ids(350, 3)), ...ga4Of(P2, ids(400, 12)), ...ga4Of(P3, ids(500, 12)), ...ga4Of(P5, ids(700, 12))];
  const r = reserveHeldOut('ga4', items, concepts, SMALL);
  assert.ok(cardOf(r, P1.id).held <= 3);
  assert.equal(cardOf(r, P1.id).practice, 6 - cardOf(r, P1.id).held);
  assert.ok(cardOf(r, P1.id).practice >= 3);
  assert.equal(r.cards.find((c) => c.card === child.id), undefined, 'a child is counted on its parent card');
  assert.deepEqual(c25Failures('ga4', concepts, items, r.ids), []);
  // A card with only the floor gives nothing.
  const tight = reserveHeldOut('ga4', [...ga4Of(P1, ids(300, 3)), ...ga4Of(P2, ids(400, 12))], [P1, P2], SMALL);
  assert.equal(cardOf(tight, P1.id).held, 0);
});

test('S2-103: a level 1 parent keeps 5 practice items of its own topic that are core, where the bank has that many; the rest is shared by weight', () => {
  // GA4-SETUP-01: 12 core items of its own topic, and 4 reference_360 children in T-GA4-04. GA4-EVENTS-01: only 4 core items,
  // and 3 reference_360 items of its own topic. T-GA4-01's share of 48 is 12.
  const build = (setupId: string, eventsId: string) => {
    const setup = concept(setupId, 'T-GA4-01', null, { level: 1 });
    const events = concept(eventsId, 'T-GA4-01', null, { level: 1 });
    const child = concept('GA4-TFOUR-21', 'T-GA4-04', setup.id);
    return {
      concepts: [setup, events, child, P2, P3, P4, P5],
      items: [
        ...ga4Of(setup, ids(300, 12)), ...ga4Of(child, ids(330, 4), () => ({ exam_relevance: 'reference_360' as const })),
        ...ga4Of(events, ids(340, 4)), ...ga4Of(events, ids(345, 3), () => ({ exam_relevance: 'reference_360' as const })),
        ...ga4Of(P2, ids(400, 20)), ...ga4Of(P3, ids(500, 20)), ...ga4Of(P4, ids(600, 20)), ...ga4Of(P5, ids(700, 20)),
      ],
    };
  };
  const rules: HeldOutRules = { total: 48, weights: GA4_TOPIC_WEIGHTS, floor: 3 };
  const coreLeft = (r: Reservation, items: Ga4Item[], card: string) =>
    items.filter((i) => i.concept_id === card && i.exam_relevance === 'core' && !r.ids.includes(i.id)).length;
  // Under any other parent IDs only the card floor applies, and the draw leaves fewer than 5 (the draw before S2-103).
  const plain = build('GA4-TONE-01', 'GA4-TONE-02');
  const before = reserveHeldOut('ga4', plain.items, plain.concepts, rules);
  assert.ok(coreLeft(before, plain.items, 'GA4-TONE-01') < 5);
  assert.ok(coreLeft(before, plain.items, 'GA4-TONE-02') < 4);
  // As level 1 parents: 5 stay on GA4-SETUP-01, all 4 on GA4-EVENTS-01, whose reference_360 items may still go.
  const [setupId, eventsId] = LEVEL1_PARENTS as [string, string];
  const level1 = build(setupId, eventsId);
  const r = reserveHeldOut('ga4', level1.items, level1.concepts, rules);
  assert.equal(coreLeft(r, level1.items, setupId), 5);
  assert.equal(coreLeft(r, level1.items, eventsId), 4);
  assert.equal(cardOf(r, eventsId).held, 3);
  assert.deepEqual(r.levelOne, [
    { card: setupId, topic: 'T-GA4-01', counted: 12, left: 5, need: 5 },
    { card: eventsId, topic: 'T-GA4-01', counted: 4, left: 4, need: 4 },
  ].sort((a, b) => (a.card < b.card ? -1 : 1)));
  // T-GA4-01 holds what is left to hold, 7 + 3, and the total stays: the shortfall goes to the other topics by weight.
  assert.equal(heldIn(r, 'T-GA4-01'), 10);
  assert.equal(r.topics.find((t) => t.topic === 'T-GA4-01')!.full, true);
  assert.equal(r.ids.length, 48);
  assert.deepEqual(c25Failures('ga4', level1.concepts, level1.items, r.ids), []);
});

test('enemy groups: at most 1 held-out item per group', () => {
  // Every item is in a pair, so at most half of each topic can be held.
  const { concepts, items } = roomyGa4();
  const paired = items.map((i, k) => ({ ...i, enemy_group: `EG-GA4-${80 + Math.floor(k / 2)}` }));
  const r = reserveHeldOut('ga4', paired, concepts, SMALL);
  assert.equal(r.ids.length, 20);
  const groups = paired.filter((i) => r.ids.includes(i.id)).map((i) => i.enemy_group);
  assert.equal(new Set(groups).size, groups.length, 'no group is held twice');
  assert.deepEqual(c25Failures('ga4', concepts, paired, r.ids), []);
});

test('enemy groups: a topic with spare items leaves a shared group\'s item to the topic that needs it', () => {
  // T-GA4-03 can hold 2 and has exactly 2 items it may hold; one shares a group with a T-GA4-02 item. T-GA4-02 has plenty of
  // free items, so it must not take the group and leave T-GA4-03 one short. The case is built against the hash order: the
  // shared T-GA4-02 item is the first T-GA4-02 would draw (its turn comes before T-GA4-03's), and T-GA4-03's shared item is
  // the later of its two, so only the rule "an item that blocks no other comes first" gets it right.
  const roomy = roomyGa4();
  const byRank = (xs: Ga4Item[]) => [...xs].sort((a, b) => (heldOutRank(a.id) < heldOutRank(b.id) ? -1 : 1));
  const t3 = ga4Of(P3, ids(500, 5), (_, k) => (k < 3 ? { verified: false } : {}));
  const t3Shared = byRank(t3.slice(3))[1]!.id;
  const t2 = roomy.items.filter((i) => i.topic_id === 'T-GA4-02');
  const t2Shared = byRank(t2)[0]!.id;
  const share = (i: Ga4Item): Ga4Item => (i.id === t3Shared || i.id === t2Shared ? { ...i, enemy_group: 'EG-GA4-90' } : i);
  const items = [...roomy.items.filter((i) => i.topic_id !== 'T-GA4-02' && i.topic_id !== 'T-GA4-03'), ...t2.map(share), ...t3.map(share)];
  const r = reserveHeldOut('ga4', items, roomy.concepts, SMALL);
  assert.equal(heldIn(r, 'T-GA4-03'), 2);
  assert.ok(r.ids.includes(t3Shared) && !r.ids.includes(t2Shared));
  assert.deepEqual(c25Failures('ga4', roomy.concepts, items, r.ids), []);
});

test('exclusions: never D23\'s list, an unverified item or concept, needs_fix or retired, a 2026 feature, or S2-95\'s concepts', () => {
  const audience = concept(NEVER_HELD_OUT_CONCEPTS[0]!, 'T-GA4-03');       // verified true here: S2-95 alone keeps it out
  const unverified = concept('GA4-TTHREE-02', 'T-GA4-03', null, { verified: false });
  const childOfUnverified = concept('GA4-TTHREE-20', 'T-GA4-03', unverified.id);
  const concepts = [P1, P2, P3, P4, P5, audience, unverified, childOfUnverified];
  const excluded: Ga4Item[] = [
    ...HELD_OUT_EXCLUDED_ITEMS.map((id) => ga4Item(id, P3.id, { concept_id: P3.id, parent_id: null, topic_id: P3.topic_id, level: null })),
    ...ga4Of(P3, ids(500, 3), (_, k) => [{ verified: false }, { status: 'needs_fix' as const }, { exam_relevance: 'new_2026' as const }][k]!),
    ...ga4Of(audience, ids(520, 8)),
    ...ga4Of(unverified, ids(530, 8)),
    ...ga4Of(childOfUnverified, ids(540, 8)),
  ];
  const retired = ga4Of(P3, ids(560, 1), () => ({ status: 'retired' as const }));
  const fine = ga4Of(P3, ids(570, 4));
  const roomy = roomyGa4();
  const items = [...roomy.items.filter((i) => i.topic_id !== 'T-GA4-03'), ...excluded, ...retired, ...fine];
  const r = reserveHeldOut('ga4', items, concepts, SMALL);
  for (const i of [...excluded, ...retired]) assert.ok(!r.ids.includes(i.id), `${i.id} is never held out`);
  // P3's card has 16 active items (10 on D23's list, the unverified one, the 2026 one and 4 more). Only those 4 may be held
  // out, so T-GA4-03 holds 4 where its weight asks for 5.
  assert.equal(heldIn(r, 'T-GA4-03'), 4);
  assert.equal(r.ids.length, 20);
  assert.deepEqual(c25Failures('ga4', concepts, items, r.ids), []);
});

test('determinism: the same bank in any file order gives the same pool, and the pool comes from the item IDs alone', () => {
  const { concepts, items } = roomyGa4();
  const a = reserveHeldOut('ga4', items, concepts, SMALL);
  const b = reserveHeldOut('ga4', [...items].reverse(), [...concepts].reverse(), SMALL);
  const c = reserveHeldOut('ga4', items.map((i) => ({ ...i, stem: `${i.stem} Reworded.` })), concepts, SMALL);
  assert.deepEqual(a.ids, b.ids);
  assert.deepEqual(a.ids, c.ids, 'item text plays no part');
  assert.deepEqual(a.ids, [...a.ids].sort(), 'listed in ID order');
  // Not just the first items of each topic: the order is a hash of the IDs.
  assert.notDeepEqual(a.ids.filter((id) => id.startsWith('Q-GA4-3')), ids(300, 5));
});

test('Methodology: about 25, at most 1 per enemy group, at least 4 practice items per metric, every metric weighing the same', () => {
  // 10 metrics of 7 items in 4 topics (4, 2, 2, 2 metrics), like the 2a bank. Each metric can give 3 and keep 4.
  const topics = ['MET-T-PRICE', 'MET-T-PRICE', 'MET-T-PRICE', 'MET-T-PRICE', 'MET-T-MKT', 'MET-T-MKT', 'MET-T-RETAIL', 'MET-T-RETAIL', 'MET-T-SAAS', 'MET-T-SAAS'];
  const concepts = topics.map((t, k) => ({ ...concept(`MET-FAKE-${String(k + 1).padStart(2, '0')}`, t), level: 1 as const }));
  const items: MethodologyItem[] = concepts.flatMap((c, k) => Array.from({ length: 7 }, (_, n) =>
    metMcq(`Q-MET-${300 + 10 * k + n}`, { concept_id: c.id, enemy_group: n < 2 ? `EG-MET-FAKE-${k + 1}` : null })));
  const r = reserveHeldOut('methodology', items, concepts);
  assert.equal(r.ids.length, 25);
  assert.deepEqual(byTopic(r), { 'MET-T-MKT': 5, 'MET-T-PRICE': 10, 'MET-T-RETAIL': 5, 'MET-T-SAAS': 5 });
  for (const c of r.cards) assert.ok(c.practice >= 4 && c.held >= 2 && c.held <= 3, `${c.card}: ${c.held} held, ${c.practice} left`);
  const groups = items.filter((i) => r.ids.includes(i.id) && i.enemy_group).map((i) => i.enemy_group);
  assert.equal(new Set(groups).size, groups.length);
  assert.deepEqual(c25Failures('methodology', concepts, items, r.ids), []);
  // A small bank holds what its floors allow, and says so.
  const small = reserveHeldOut('methodology', items.filter((i) => i.concept_id === 'MET-FAKE-01' && !i.enemy_group).concat(items.filter((i) => i.concept_id === 'MET-FAKE-02')), concepts);
  assert.equal(small.ids.length, 1 + 3);
  assert.equal(cardOf(small, 'MET-FAKE-01').practice, 4);
});

// ---- The command ------------------------------------------------------------------------------------------------------------

async function ga4Root(): Promise<{ root: string; items: Ga4Item[] }> {
  const { concepts, items } = roomyGa4(20);
  const root = await mkdtemp(join(tmpdir(), 'al-reserve-'));
  await writeSection(root, 'ga4', { concepts, items, keys: [] });
  return { root, items };
}
const readItem = async (root: string, id: string) => JSON.parse(await readFile(join(root, 'ga4/items', `${id}.json`), 'utf8')) as Ga4Item;
const readPool = async (root: string) => (JSON.parse(await readFile(join(root, 'ga4/held-out.json'), 'utf8')) as { item_ids: string[] }).item_ids;
const texts = async (root: string) => Object.fromEntries(await Promise.all((await readdir(join(root, 'ga4/items'))).map(async (n) => [n, await readFile(join(root, 'ga4/items', n), 'utf8')])));

test('the command writes held-out.json and the flags, changes nothing else, and prints counts only', async () => {
  const { root, items } = await ga4Root();
  const before = await texts(root);
  const { stdout } = await run(process.execPath, [TOOL, 'ga4', root]);
  const pool = await readPool(root);
  assert.equal(pool.length, 50);
  assert.deepEqual(pool, [...pool].sort());
  for (const i of items) {
    const after = await readItem(root, i.id);
    assert.equal(after.held_out, pool.includes(i.id), i.id);
    const name = `${i.id}.json`;
    if (pool.includes(i.id)) assert.equal(before[name]!.replace('"held_out": false', '"held_out": true'), (await texts(root))[name], 'only the flag changes');
    else assert.equal((await texts(root))[name], before[name], 'an item that stays in practice is not rewritten');
  }
  assert.doesNotMatch(stdout, /Q-GA4-\d/, 'no item ID is printed');
  assert.doesNotMatch(stdout, /widget/i, 'no item text is printed');
  assert.match(stdout, /T-GA4-03/);
  assert.match(stdout, /GA4-TONE-01/);
  assert.match(stdout, /50 held out/);
  // Run again: the same pool, nothing to write.
  const again = await run(process.execPath, [TOOL, 'ga4', root]);
  assert.match(again.stdout, /unchanged/);
  assert.deepEqual(await readPool(root), pool);
});

test('the command refuses to replace a different pool unless told to, so practised items never move into it silently', async () => {
  const { root, items } = await ga4Root();
  await run(process.execPath, [TOOL, 'ga4', root]);
  const pool = await readPool(root);
  const other = items.map((i) => i.id).filter((id) => !pool.includes(id)).slice(0, 3);
  await writeFile(join(root, 'ga4/held-out.json'), JSON.stringify({ item_ids: other }, null, 2) + '\n');
  const before = await texts(root);
  await assert.rejects(run(process.execPath, [TOOL, 'ga4', root]), (e: { code: number; stdout: string; stderr: string }) => {
    assert.equal(e.code, 1);
    assert.match(e.stderr, /--replace/);
    assert.doesNotMatch(e.stdout + e.stderr, /Q-GA4-\d/);
    return true;
  });
  assert.deepEqual(await texts(root), before, 'nothing written');
  assert.deepEqual(await readPool(root), other);
  await run(process.execPath, [TOOL, 'ga4', root, '--replace']);
  assert.deepEqual(await readPool(root), pool);
});

test('the command refuses a bank that does not validate, and an unknown section', async () => {
  const { root } = await ga4Root();
  await writeFile(join(root, 'ga4/items/Q-GA4-300.json'), '{"id": "Q-GA4-300"');
  await assert.rejects(run(process.execPath, [TOOL, 'ga4', root]), (e: { code: number; stderr: string }) => e.code === 1 && /check:content/.test(e.stderr));
  await assert.rejects(readFile(join(root, 'ga4/held-out.json'), 'utf8'), 'nothing written');
  await assert.rejects(run(process.execPath, [TOOL, 'sql', root]), (e: { code: number; stderr: string }) => e.code === 1 && /ga4 or methodology/.test(e.stderr));
});

// ---- Incremental mode (sprint 3, S3-21, S3-22) -------------------------------------------------------------------------------

type Failure = { code: number; stdout: string; stderr: string };
const cmd = (args: string[]) => run(process.execPath, [TOOL, ...args]);
const allFiles = async (root: string, section: string) => ({ ...(await readdir(join(root, section, 'items')).then((ns) => Promise.all(ns.map(async (n) => [n, await readFile(join(root, section, 'items', n), 'utf8')] as const))).then(Object.fromEntries)), pool: await readFile(join(root, `${section}/held-out.json`), 'utf8') });
const idList = (xs: readonly { id: string }[]) => xs.map((x) => x.id).join('\n') + '\n';

/** A GA4 bank whose pool is drawn, then 10 new T-GA4-03 items (candidates, not held) that were added afterwards. */
async function extendGa4Root(): Promise<{ root: string; all: Ga4Item[]; fresh: Ga4Item[]; candidates: string; concepts: ChoiceConcept[] }> {
  const { concepts, items } = roomyGa4(20);
  const pool = new Set(reserveHeldOut('ga4', items, concepts).ids);
  const fresh = ga4Of(P3, ids(900, 10));
  const root = await mkdtemp(join(tmpdir(), 'al-extend-'));
  await writeSection(root, 'ga4', { concepts, items: [...items.map((i) => ({ ...i, held_out: pool.has(i.id) })), ...fresh], keys: [], heldOut: [...pool].sort() });
  const candidates = join(root, 'candidates.txt');
  await writeFile(candidates, idList(fresh));
  return { root, all: [...items, ...fresh], fresh, candidates, concepts };
}
const EXT = ['ga4', '--extend', '--topic', 'T-GA4-03', '--count', '6', '--release-from', 'T-GA4-04,T-GA4-02'];
const refusal = async (args: string[], pattern: RegExp, root: string, section = 'ga4') => {
  const before = await allFiles(root, section);
  await assert.rejects(cmd(args), (e: Failure) => {
    assert.equal(e.code, 1);
    assert.match(e.stderr, pattern);
    assert.match(e.stderr, /Nothing was written/);
    assert.doesNotMatch(e.stdout + e.stderr, /Q-(GA4|MET)-\d/, 'no item ID is printed');
    return true;
  });
  assert.deepEqual(await allFiles(root, section), before, 'nothing written');
};

test('extend GA4: 6 candidates of T-GA4-03 join, the same number leave T-GA4-04 first then T-GA4-02, the total stays 50', async () => {
  const { root, all, fresh, candidates, concepts } = await extendGa4Root();
  const poolBefore = await readPool(root);
  const byId = new Map(all.map((i) => [i.id, i]));
  const countIn = (pool: string[], t: string) => pool.filter((id) => byId.get(id)!.topic_id === t).length;
  const t4Before = countIn(poolBefore, 'T-GA4-04');
  assert.ok(t4Before >= 1 && t4Before < 6, 'the fixture needs the release to spill from T-GA4-04 into T-GA4-02');
  const { stdout } = await cmd([...EXT, '--candidates', candidates, root]);
  const pool = await readPool(root);
  assert.equal(pool.length, 50);
  assert.deepEqual(pool, [...pool].sort());
  const added = pool.filter((id) => !poolBefore.includes(id));
  const released = poolBefore.filter((id) => !pool.includes(id));
  assert.equal(added.length, 6);
  assert.equal(released.length, 6);
  assert.ok(added.every((id) => fresh.some((f) => f.id === id)), 'only candidates are added');
  assert.equal(countIn(pool, 'T-GA4-04'), 0, 'T-GA4-04 is released first, entirely');
  assert.equal(countIn(pool, 'T-GA4-02'), countIn(poolBefore, 'T-GA4-02') - (6 - t4Before));
  assert.equal(countIn(pool, 'T-GA4-03'), countIn(poolBefore, 'T-GA4-03') + 6);
  for (const t of ['T-GA4-01', 'T-GA4-05']) assert.equal(countIn(pool, t), countIn(poolBefore, t), t);
  for (const id of added) assert.equal((await readItem(root, id)).held_out, true);
  for (const id of released) assert.equal((await readItem(root, id)).held_out, false);
  assert.deepEqual(c25Failures('ga4', concepts, await Promise.all(all.map((i) => readItem(root, i.id))), pool), []);
  assert.doesNotMatch(stdout, /Q-GA4-\d/, 'no item ID is printed');
  assert.match(stdout, /6 added, 6 released; 50 held out \(was 50\)/);
  assert.match(stdout, /T-GA4-03/);
  // Run again: the added items are held now, so it refuses, and nothing changes.
  await refusal([...EXT, '--candidates', candidates, root], /already held out/, root);
});

test('extend GA4: the same bank gives the same result in any candidates order', async () => {
  const a = await extendGa4Root();
  const b = await extendGa4Root();
  await writeFile(b.candidates, idList([...b.fresh].reverse()));
  await cmd([...EXT, '--candidates', a.candidates, a.root]);
  await cmd([...EXT, '--candidates', b.candidates, b.root]);
  assert.deepEqual(await readPool(a.root), await readPool(b.root));
});

test('extend Methodology: --per-card 1 adds exactly one per new metric and releases nothing', async () => {
  const topics = ['MET-T-PRICE', 'MET-T-PRICE', 'MET-T-PRICE', 'MET-T-PRICE', 'MET-T-MKT', 'MET-T-MKT', 'MET-T-RETAIL', 'MET-T-RETAIL', 'MET-T-SAAS', 'MET-T-SAAS', 'MET-T-MKT', 'MET-T-SAAS', 'MET-T-PRICE'];
  const concepts = topics.map((t, k) => ({ ...concept(`MET-FAKE-${String(k + 1).padStart(2, '0')}`, t), level: 1 as const }));
  const itemsOf = (cs: ChoiceConcept[], from: number) => cs.flatMap((c, k) => Array.from({ length: 7 }, (_, n) => metMcq(`Q-MET-${from + 10 * k + n}`, { concept_id: c.id })));
  const old = itemsOf(concepts.slice(0, 10), 300);
  const fresh = itemsOf(concepts.slice(10), 800);
  const pool = reserveHeldOut('methodology', old, concepts.slice(0, 10)).ids;
  assert.equal(pool.length, 25);
  const root = await mkdtemp(join(tmpdir(), 'al-extend-'));
  await writeSection(root, 'methodology', { concepts, items: [...old.map((i) => ({ ...i, held_out: pool.includes(i.id) })), ...fresh], keys: [], heldOut: pool });
  const candidates = join(root, 'candidates.txt');
  await writeFile(candidates, idList(fresh));
  const { stdout } = await cmd(['methodology', '--extend', '--per-card', '1', '--candidates', candidates, root]);
  const after = (JSON.parse(await readFile(join(root, 'methodology/held-out.json'), 'utf8')) as { item_ids: string[] }).item_ids;
  assert.equal(after.length, 28);
  assert.ok(pool.every((id) => after.includes(id)), 'nothing is released');
  const added = after.filter((id) => !pool.includes(id));
  for (const c of concepts.slice(10)) assert.equal(added.filter((id) => fresh.some((f) => f.id === id && f.concept_id === c.id)).length, 1, c.id);
  assert.equal(added.length, 3);
  assert.match(stdout, /3 added, 0 released; 28 held out \(was 25\)/);
  assert.doesNotMatch(stdout, /Q-MET-\d/);
  const written = await Promise.all([...old, ...fresh].map(async (i) => JSON.parse(await readFile(join(root, 'methodology/items', `${i.id}.json`), 'utf8')) as MethodologyItem));
  assert.deepEqual(c25Failures('methodology', concepts, written, after), []);
  // Two per card cannot be met by one candidate each.
  const one = join(root, 'one.txt');
  await writeFile(one, idList([fresh[0]!]));
  await refusal(['methodology', '--extend', '--per-card', '2', '--candidates', one, root], /can take only 1 of 2/, root, 'methodology');
});

test('extend refusals: a candidate not in the bank, held or short in number, or too few to release; nothing is written', async () => {
  const { root, all, fresh, candidates } = await extendGa4Root();
  const pool = await readPool(root);
  const heldItem = all.find((i) => pool.includes(i.id))!;
  const write = async (name: string, lines: string[]) => { const f = join(root, name); await writeFile(f, lines.join('\n') + '\n'); return f; };
  // Not in the bank.
  await refusal([...EXT, '--candidates', await write('a.txt', [...fresh.map((f) => f.id), 'Q-GA4-99999']), root], /1 candidate is not in the ga4 bank/, root);
  // Already held.
  await refusal([...EXT, '--candidates', await write('b.txt', [...fresh.map((f) => f.id), heldItem.id]), root], /1 candidate is already held out/, root);
  // Too few candidates of the topic: 10 candidates, 11 wanted; and none of topic T-GA4-05.
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-03', '--count', '11', '--candidates', candidates, root], /only 10 candidates are of topic T-GA4-03, 11 wanted/, root);
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-05', '--count', '1', '--candidates', candidates, root], /only 0 candidates are of topic T-GA4-05/, root);
  // Not enough releasable items: a topic with none held.
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-03', '--count', '6', '--release-from', 'T-GA4-99', '--candidates', candidates, root], /only 0 of 6 held items can be released/, root);
});

test('extend: bad arguments print the usage and exit 1', async () => {
  const { root, candidates } = await extendGa4Root();
  for (const args of [['ga4', '--extend', root], ['ga4', '--extend', '--candidates', candidates, root], ['ga4', '--extend', '--per-card', '1', '--count', '2', '--candidates', candidates, root],
    ['sql', '--extend', '--per-card', '1', '--candidates', candidates, root], ['ga4', '--extend', '--per-card', '0', '--candidates', candidates, root]]) {
    await assert.rejects(cmd(args), (e: Failure) => e.code === 1 && /Usage|cannot be combined/.test(e.stderr), args.join(' '));
  }
});

test('extend --logs: a candidate named by any record in the logs folder is refused; so is an unreadable folder', async () => {
  const { root, fresh, candidates } = await extendGa4Root();
  const logs = await mkdtemp(join(tmpdir(), 'al-logs-'));
  // The records only need to name the item; the tool does not read their other fields.
  await writeFile(join(logs, 'attempts-2026-10-05.jsonl'), `{"type":"attempt","item_id":"${fresh[3]!.id}"}\n{"type":"item_close","item_id":"Q-GA4-1"}\n`);
  await refusal([...EXT, '--logs', logs, '--candidates', candidates, root], /1 candidate is named by a log record/, root);
  await refusal([...EXT, '--logs', join(logs, 'missing'), '--candidates', candidates, root], /logs folder cannot be read/, root);
  // A folder with no record naming a candidate lets the run through.
  const clean = await mkdtemp(join(tmpdir(), 'al-logs-'));
  await writeFile(join(clean, 'attempts-2026-10-05.jsonl'), '{"type":"attempt","item_id":"Q-GA4-1"}\n');
  await cmd([...EXT, '--logs', clean, '--candidates', candidates, root]);
  assert.equal((await readPool(root)).length, 50);
});

test('extend --logs: a held item named by a record is not released, and none left to release is refused', async () => {
  const { root, all, candidates } = await extendGa4Root();
  const pool = await readPool(root);
  const byId = new Map(all.map((i) => [i.id, i]));
  const t4 = pool.filter((id) => byId.get(id)!.topic_id === 'T-GA4-04');
  const logs = await mkdtemp(join(tmpdir(), 'al-logs-'));
  await writeFile(join(logs, 'attempts-2026-10-05.jsonl'), t4.map((id) => `{"type":"solution_opened","item_id":"${id}"}`).join('\n') + '\n');
  // T-GA4-04's held items are all named: the 6 come from T-GA4-02 alone.
  await cmd([...EXT, '--logs', logs, '--candidates', candidates, root]);
  const after = await readPool(root);
  assert.ok(t4.every((id) => after.includes(id)), 'a logged item stays held');
  assert.equal(after.filter((id) => byId.get(id)!.topic_id === 'T-GA4-02').length, pool.filter((id) => byId.get(id)!.topic_id === 'T-GA4-02').length - 6);
  // With every held item of both release topics named, none can be released.
  const fresh = await extendGa4Root();
  const named = (await readPool(fresh.root)).filter((id) => ['T-GA4-04', 'T-GA4-02'].includes(fresh.all.find((i) => i.id === id)!.topic_id));
  await writeFile(join(logs, 'attempts-2026-10-06.jsonl'), named.map((id) => `{"type":"attempt","item_id":"${id}"}`).join('\n') + '\n');
  await refusal([...EXT, '--logs', logs, '--candidates', fresh.candidates, fresh.root], /only 0 of 6 held items can be released/, fresh.root);
});

test('extend: a candidate whose card is at its practice floor, or whose enemy group is held, is not added', async () => {
  const { concepts, items } = roomyGa4(20);
  const p6 = concept('GA4-TTHREE-06', 'T-GA4-03');
  const tight = ga4Of(p6, ids(950, 3));                         // 3 items on a card with floor 3: none may be held
  const group = ga4Of(P3, ids(960, 1), () => ({ enemy_group: 'EG-GA4-95' }));
  const pool = reserveHeldOut('ga4', items, concepts).ids;
  const heldOne = items.find((i) => pool.includes(i.id))!;
  const root = await mkdtemp(join(tmpdir(), 'al-extend-'));
  await writeSection(root, 'ga4', { concepts: [...concepts, p6], items: [...items.map((i) => ({ ...i, held_out: pool.includes(i.id), enemy_group: i.id === heldOne.id ? 'EG-GA4-95' : i.enemy_group })), ...tight, ...group], keys: [], heldOut: pool });
  const file = join(root, 'c.txt');
  await writeFile(file, idList(tight));
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-03', '--count', '1', '--candidates', file, root], /only 0 of 1 candidates of topic T-GA4-03 can be added/, root);
  await writeFile(file, idList(group));
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-03', '--count', '1', '--candidates', file, root], /only 0 of 1 candidates of topic T-GA4-03 can be added/, root);
});

test('extend: ineligible candidates are skipped and counted, never added; an unknown ID still refuses and writes nothing (I1)', async () => {
  const { root, fresh } = await extendGa4Root();
  // 3 ineligible candidates: one on D23's list, two unverified. Only their IDs go in the file; they are never printed back.
  const d23 = ga4Item(HELD_OUT_EXCLUDED_ITEMS[0]!, P3.id, { concept_id: P3.id, parent_id: null, topic_id: P3.topic_id, level: null });
  const bad = [d23, ...ga4Of(P3, ids(970, 2), () => ({ verified: false }))];
  const withBad = async (r: string) => { for (const b of bad) await writeFile(join(r, 'ga4/items', `${b.id}.json`), JSON.stringify(b, null, 2) + '\n'); };
  await withBad(root);
  const mixed = join(root, 'mixed.txt');
  await writeFile(mixed, idList([...fresh, ...bad]));
  const poolBefore = await readPool(root);
  const { stdout } = await cmd([...EXT, '--candidates', mixed, root]);
  const pool = await readPool(root);
  const added = pool.filter((id) => !poolBefore.includes(id));
  assert.equal(added.length, 6);
  assert.ok(added.every((id) => fresh.some((f) => f.id === id)), 'only eligible candidates are added');
  assert.ok(bad.every((b) => !pool.includes(b.id)), 'an ineligible candidate is never added');
  assert.match(stdout, /3 candidates skipped as ineligible/);
  assert.match(stdout, /6 added, 6 released; 50 held out \(was 50\)/);
  assert.doesNotMatch(stdout, /Q-GA4-\d/, 'no item ID is printed');
  // Too few eligible ones for the count still refuses: 10 eligible, 3 skipped, 11 wanted.
  const second = await extendGa4Root();
  await withBad(second.root);
  const mixed2 = join(second.root, 'mixed.txt');
  await writeFile(mixed2, idList([...second.fresh, ...bad]));
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-03', '--count', '11', '--candidates', mixed2, second.root], /only 10 candidates are of topic T-GA4-03, 11 wanted/, second.root);
  // An unknown ID refuses the whole run.
  const third = await extendGa4Root();
  const unknown = join(third.root, 'unknown.txt');
  await writeFile(unknown, [...third.fresh.map((f) => f.id), 'Q-GA4-99999'].join('\n') + '\n');
  await refusal([...EXT, '--candidates', unknown, third.root], /1 candidate is not in the ga4 bank/, third.root);
});

test('extend S2-103: a level 1 parent keeps its 5 own-topic core items; an add that leaves exactly 5 succeeds, one more is refused (I2, I3)', async () => {
  const [setupId] = LEVEL1_PARENTS as [string, string];
  const setup = concept(setupId, 'T-GA4-01', null, { level: 1 });
  const items = ga4Of(setup, ids(300, 7));              // 7 core, verified items of its own topic: 2 may go, the floor of 5 stays
  const root = await mkdtemp(join(tmpdir(), 'al-extend-'));
  await writeSection(root, 'ga4', { concepts: [setup], items: items.map((i) => ({ ...i, held_out: false })), keys: [], heldOut: [] });
  const file = join(root, 'c.txt');
  await writeFile(file, idList(items.slice(0, 3)));
  // 3 candidates, 3 wanted: the third would leave 4 on the parent. The add itself refuses, not only the final check.
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-01', '--count', '3', '--candidates', file, root], /only 2 of 3 candidates of topic T-GA4-01 can be added/, root);
  // 2 wanted: a legal add that leaves exactly 5 succeeds.
  const { stdout } = await cmd(['ga4', '--extend', '--topic', 'T-GA4-01', '--count', '2', '--candidates', file, root]);
  assert.match(stdout, /2 added, 0 released; 2 held out \(was 0\)/);
  const pool = await readPool(root);
  assert.equal(pool.length, 2);
  assert.equal(items.filter((i) => !pool.includes(i.id)).length, 5);
  assert.doesNotMatch(stdout, /Q-GA4-\d/);
  // The parent is now at its floor: one more candidate is refused.
  const more = join(root, 'more.txt');
  await writeFile(more, idList(items.slice(3, 4)));
  await refusal(['ga4', '--extend', '--topic', 'T-GA4-01', '--count', '1', '--candidates', more, root], /only 0 of 1 candidates of topic T-GA4-01 can be added/, root);
});

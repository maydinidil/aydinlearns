// Task C2: tools/extract-ga4.ts on the synthetic fixture only (tests/fixtures/ga4/, invented questions in 06 and 10's shapes).
// The real knowledge files are never read here; the controller runs the tool on them in a background agent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildBank, extractGa4, newItemId, stripMarkers, APPENDIX_B, ENEMY_GROUPS, type Ga4Bank } from '../../tools/extract-ga4.ts';
import { choiceTarget, optionId, validateChoiceConcept, validateChoiceKey, type ChoiceConcept, type ChoiceKey } from '../../schemas/choice.ts';
import { validateGa4Item, type Ga4Item } from '../../schemas/ga4.ts';
import { loadContent, targetOf } from '../../server/content.ts';

const FIX = fileURLToPath(new URL('../fixtures/ga4/', import.meta.url));
const TOOL = fileURLToPath(new URL('../../tools/extract-ga4.ts', import.meta.url));
const F06 = join(FIX, '06_ga4_exam.md');
const F10 = join(FIX, '10_ga4_exam_supplement.md');
const run = promisify(execFile);

const tmp = () => mkdtemp(join(tmpdir(), 'al-ga4-'));
const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
/** The fixture's own JSON block, read independently of the tool (for expected answers). */
const fixtureJson = async (path: string): Promise<any> => JSON.parse((await readFile(path, 'utf8')).match(/```json\n([\s\S]*?)\n```/)![1]!);
const withJson = (md: string, edit: (j: any) => void): string => md.replace(/```json\n([\s\S]*?)\n```/, (_m, body: string) => {
  const j = JSON.parse(body);
  edit(j);
  return '```json\n' + JSON.stringify(j, null, 2) + '\n```';
});

interface Out { root: string; bank: Ga4Bank; concepts: ChoiceConcept[]; items: Map<string, Ga4Item>; keys: Map<string, ChoiceKey>; itemText: Map<string, string> }
async function extractTo(root: string): Promise<Out> {
  const bank = await extractGa4(FIX, root, { force: false, log: () => {} });
  const items = new Map<string, Ga4Item>();
  const itemText = new Map<string, string>();
  const keys = new Map<string, ChoiceKey>();
  for (const n of await readdir(join(root, 'content/ga4/items'))) {
    const text = await readFile(join(root, 'content/ga4/items', n), 'utf8');
    const item = JSON.parse(text) as Ga4Item;
    assert.equal(n, `${item.id}.json`);
    items.set(item.id, item);
    itemText.set(item.id, text);
  }
  for (const n of await readdir(join(root, 'content/keys/ga4'))) {
    const key = await readJson<ChoiceKey>(join(root, 'content/keys/ga4', n));
    assert.equal(n, `${key.item_id}.json`);
    keys.set(key.item_id, key);
  }
  const { concepts } = await readJson<{ concepts: ChoiceConcept[] }>(join(root, 'content/ga4/concepts.json'));
  return { root, bank, concepts, items, keys, itemText };
}
const out = await extractTo(await tmp());
const item = (id: string): Ga4Item => out.items.get(id) ?? assert.fail(`no ${id}`);
const concept = (id: string): ChoiceConcept => out.concepts.find((c) => c.id === id) ?? assert.fail(`no ${id}`);
const card = (i: Ga4Item): string => i.parent_id ?? i.concept_id;

test('E-121: 113 items with 3-digit Q-GA4-NNN IDs; 06 keeps its old ID as legacy_id, 10 keeps its own ID', () => {
  assert.equal(out.items.size, 113);
  assert.equal(out.keys.size, 113);
  for (const id of out.items.keys()) assert.match(id, /^Q-GA4-\d{3}$/);
  const from06 = [...out.items.values()].filter((i) => i.source_ids[0]!.startsWith('06:'));
  const from10 = [...out.items.values()].filter((i) => i.source_ids[0]!.startsWith('10:'));
  assert.equal(from06.length, 68);
  assert.equal(from10.length, 45);
  assert.deepEqual(from06.map((i) => i.id).sort(), Array.from({ length: 68 }, (_, k) => `Q-GA4-${String(k + 1).padStart(3, '0')}`));
  assert.deepEqual(from10.map((i) => i.id).sort(), Array.from({ length: 45 }, (_, k) => `Q-GA4-${201 + k}`));
  assert.equal(item('Q-GA4-001').legacy_id, 'Q-GA4-01');
  assert.deepEqual(item('Q-GA4-001').source_ids, ['06:Q-GA4-01']);
  assert.equal(item('Q-GA4-068').legacy_id, 'Q-GA4-68');
  assert.equal(item('Q-GA4-201').legacy_id, null);
  assert.deepEqual(item('Q-GA4-201').source_ids, ['10:Q-GA4-201']);
  assert.equal(newItemId('Q-GA4-07'), 'Q-GA4-007');
  assert.equal(newItemId('Q-GA4-245'), 'Q-GA4-245');
  assert.throws(() => newItemId('Q-GA4-7'), /Q-GA4-7/);
});

test('S2-60: oids are optionId(id, source index), the key holds the source answer\'s oid, and two runs write identical files', async () => {
  const j06 = await fixtureJson(F06);
  const j10 = await fixtureJson(F10);
  const answers = new Map<string, number>([
    ...j06.practice_questions.map((q: any) => [newItemId(q.id), 'ABCD'.indexOf(q.answer)] as const),
    ...j10.practice_questions.map((q: any) => [newItemId(q.id), 'ABCD'.indexOf(q.answer)] as const),
  ]);
  for (const i of out.items.values()) {
    assert.equal(i.options.length, 4, i.id);
    i.options.forEach((o, k) => {
      assert.equal(o.oid, optionId(i.id, k), `${i.id} option ${k}`);
      assert.match(o.oid, /^o[0-9a-f]{7}$/);
      assert.equal(o.misconception_id, null);
    });
    assert.equal(out.keys.get(i.id)!.correct_oid, i.options[answers.get(i.id)!]!.oid, i.id);
  }
  const again = await extractTo(await tmp());
  for (const sub of ['content/ga4/concepts.json', ...[...out.items.keys()].map((id) => `content/ga4/items/${id}.json`), ...[...out.keys.keys()].map((id) => `content/keys/ga4/${id}.json`)]) {
    assert.equal(await readFile(join(again.root, sub), 'utf8'), await readFile(join(out.root, sub), 'utf8'), sub);
  }
});

test('S2-60: oid order does not give away source order, so the first-option answer cue cannot be read from the IDs', () => {
  let sortedIsSource = 0;
  const keyRanks = new Set<number>();
  for (const i of out.items.values()) {
    const oids = i.options.map((o) => o.oid);
    const sorted = [...oids].sort();
    if (sorted.every((o, k) => o === oids[k])) sortedIsSource++;
    if (out.keys.get(i.id)!.correct_oid === oids[0]) keyRanks.add(sorted.indexOf(oids[0]!));
  }
  assert.ok(sortedIsSource < 113 / 4, `${sortedIsSource} items have oids sorted in source order`);
  assert.deepEqual([...keyRanks].sort(), [0, 1, 2, 3], 'a first-option key lands at every oid rank');
});

test('D20 and E-110: 10\'s concepts are children of 06 parents with Appendix B topics; their items carry the parent and the child\'s topic', async () => {
  const j06 = await fixtureJson(F06);
  assert.equal(out.concepts.length, 31);
  for (const c of j06.concepts) {
    assert.deepEqual({ parent: concept(c.id).parent_id, topic: concept(c.id).topic_id }, { parent: null, topic: c.topic_id }, c.id);
  }
  assert.equal(Object.keys(APPENDIX_B).length, 15);
  for (const [id, b] of Object.entries(APPENDIX_B)) assert.deepEqual({ parent: concept(id).parent_id, topic: concept(id).topic_id }, b, id);
  // A few rows of ERRATA Appendix B, spelled out.
  assert.deepEqual(APPENDIX_B['GA4-ADMIN-21'], { parent: 'GA4-SETUP-01', topic: 'T-GA4-04' });
  assert.deepEqual(APPENDIX_B['GA4-ATTRIB-20'], { parent: 'GA4-REPORTS-01', topic: 'T-GA4-02' });
  assert.deepEqual(APPENDIX_B['GA4-INTEG-21'], { parent: 'GA4-INTEG-01', topic: 'T-GA4-03' });
  assert.deepEqual(APPENDIX_B['GA4-ADMIN-20'], { parent: 'GA4-METRICS-01', topic: 'T-GA4-02' });
  for (const i of out.items.values()) {
    const c = concept(i.concept_id);
    assert.equal(i.parent_id, c.parent_id, i.id);
    assert.equal(i.topic_id, c.topic_id, i.id);
  }
  assert.deepEqual({ concept: item('Q-GA4-240').concept_id, parent: item('Q-GA4-240').parent_id, topic: item('Q-GA4-240').topic_id },
    { concept: 'GA4-ADMIN-21', parent: 'GA4-SETUP-01', topic: 'T-GA4-04' });
  assert.deepEqual(choiceTarget(item('Q-GA4-240')), { target_concept_id: 'GA4-SETUP-01', concept_ids: ['GA4-SETUP-01', 'GA4-ADMIN-21'] });
  assert.deepEqual(choiceTarget(item('Q-GA4-001')), { target_concept_id: 'GA4-SETUP-01', concept_ids: ['GA4-SETUP-01'] });
});

test('the real run\'s counts on a fixture of the same shape: per topic and per parent card (Appendix B: SETUP-01 21, REPORTS-01 15, PRIVACY-02 12 active)', () => {
  const count = (key: (i: Ga4Item) => string) => {
    const m: Record<string, [number, number]> = {};
    for (const i of out.items.values()) {
      const k = key(i);
      m[k] ??= [0, 0];
      m[k][0]++;
      if (i.status === 'active') m[k][1]++;
    }
    return m;
  };
  assert.deepEqual(count((i) => i.topic_id), {
    'T-GA4-01': [22, 22], 'T-GA4-02': [28, 28], 'T-GA4-03': [19, 19], 'T-GA4-04': [16, 16], 'T-GA4-05': [28, 27],
  });
  const cards = count(card);
  assert.deepEqual(cards['GA4-SETUP-01'], [21, 21]);
  assert.deepEqual(cards['GA4-REPORTS-01'], [15, 15]);
  assert.deepEqual(cards['GA4-PRIVACY-02'], [13, 12]);
  assert.deepEqual(cards['GA4-METRICS-01'], [7, 7]);
  assert.deepEqual(cards['GA4-INTEG-02'], [10, 10]);
  assert.deepEqual(cards['GA4-INTEG-01'], [6, 6]);
  assert.equal(Object.keys(cards).length, 16, 'every card is a 06 concept');
});

test('D12: level 1 only for the four foundations concepts; an item carries the level of the card it is rated on', () => {
  assert.deepEqual(out.concepts.filter((c) => c.level === 1).map((c) => c.id).sort(), ['GA4-EVENTS-01', 'GA4-EVENTS-02', 'GA4-METRICS-01', 'GA4-SETUP-01']);
  for (const c of out.concepts) if (c.level !== 1) assert.equal(c.level, null, c.id);
  for (const i of out.items.values()) {
    assert.equal(i.level, ['GA4-SETUP-01', 'GA4-EVENTS-01', 'GA4-EVENTS-02', 'GA4-METRICS-01'].includes(card(i)) ? 1 : null, i.id);
  }
  assert.equal(item('Q-GA4-240').level, 1, 'a SETUP-01 child item is practised on the level 1 card');
});

test('E-112, E-022 and E-031: 9 enemy groups of exactly the two listed items each', () => {
  const groups = new Map<string, string[]>();
  for (const i of out.items.values()) if (i.enemy_group !== null) groups.set(i.enemy_group, [...(groups.get(i.enemy_group) ?? []), i.id].sort());
  assert.deepEqual([...groups.values()].sort((a, b) => a[0]!.localeCompare(b[0]!)), [
    ['Q-GA4-012', 'Q-GA4-225'], ['Q-GA4-022', 'Q-GA4-227'], ['Q-GA4-030', 'Q-GA4-226'], ['Q-GA4-031', 'Q-GA4-228'], ['Q-GA4-038', 'Q-GA4-211'],
    ['Q-GA4-039', 'Q-GA4-208'], ['Q-GA4-053', 'Q-GA4-237'], ['Q-GA4-056', 'Q-GA4-215'], ['Q-GA4-059', 'Q-GA4-230'],
  ]);
  assert.equal(ENEMY_GROUPS.length, 9);
  assert.equal(new Set(ENEMY_GROUPS.map((g) => g.id)).size, 9);
});

test('E-118 and E-124: verified false on Q-GA4-015, -026, -066, on GA4-AUDIENCE-01 and GA4-DEBUG-01, and on those concepts\' items', () => {
  const unverifiedItems = [...out.items.values()].filter((i) => !i.verified).map((i) => i.id).sort();
  assert.deepEqual(unverifiedItems, [
    'Q-GA4-015', 'Q-GA4-022', 'Q-GA4-023', 'Q-GA4-024', 'Q-GA4-026', 'Q-GA4-046', 'Q-GA4-047', 'Q-GA4-048', 'Q-GA4-063', 'Q-GA4-066', 'Q-GA4-067',
  ]);
  assert.deepEqual(out.concepts.filter((c) => !c.verified).map((c) => c.id).sort(), ['GA4-AUDIENCE-01', 'GA4-DEBUG-01']);
});

test('D18: Q-GA4-037 is retired and kept in the bank; 112 items are active', () => {
  assert.equal(item('Q-GA4-037').status, 'retired');
  assert.equal([...out.items.values()].filter((i) => i.status === 'active').length, 112);
  assert.deepEqual([...out.items.values()].filter((i) => i.status !== 'active').map((i) => i.id), ['Q-GA4-037']);
});

test('E-122: as_of is the source file\'s researched_on date', () => {
  for (const i of out.items.values()) assert.equal(i.as_of, i.source_ids[0]!.startsWith('06:') ? '2026-09-28' : '2026-10-01', i.id);
});

test('E-122: where both files hold an item ID, 10\'s record wins', async () => {
  const md10 = withJson(await readFile(F10, 'utf8'), (j) => {
    j.practice_questions.push({ id: 'Q-GA4-005', concept_id: 'GA4-SETUP-20', question: 'Fixture override stem?',
      options: { A: 'Override one', B: 'Override two', C: 'Override three', D: 'Override four' }, answer: 'C', explanation: 'Fixture override explanation.' });
  });
  const bank = buildBank(await readFile(F06, 'utf8'), md10);
  const replaced = bank.items.find((i) => i.id === 'Q-GA4-005')!;
  assert.equal(bank.items.length, 113);
  assert.deepEqual({ src: replaced.source_ids, as_of: replaced.as_of, stem: replaced.stem, parent: replaced.parent_id },
    { src: ['10:Q-GA4-005'], as_of: '2026-10-01', stem: 'Fixture override stem?', parent: 'GA4-SETUP-01' });
  assert.equal(bank.keys.find((k) => k.item_id === 'Q-GA4-005')!.correct_oid, optionId('Q-GA4-005', 2));
  assert.deepEqual(bank.report.replacedBy10, ['Q-GA4-005']);
  assert.deepEqual(out.bank.report.replacedBy10, [], 'the fixture, like the real files, shares no item ID');
});

test('E-119, E-029 and E-121: source markers and letter prefixes are stripped, old IDs in text are renamed', () => {
  const marker = /\\?\[\d+(?:\s*[,-]\s*\d+)*\\?\]/;
  for (const i of out.items.values()) {
    for (const t of [i.stem, ...i.options.map((o) => o.text), out.keys.get(i.id)!.explanation]) {
      assert.doesNotMatch(t, marker, i.id);
      assert.doesNotMatch(t, /\[UNVERIFIED\]/i, i.id);
      assert.equal(t, t.trim(), i.id);
      assert.doesNotMatch(t, / {2}| [.,;:]/, i.id);
    }
  }
  for (const c of out.concepts) assert.doesNotMatch(c.title, marker, c.id);
  assert.match(item('Q-GA4-002').stem, /kit, which/);
  assert.match(item('Q-GA4-210').stem, /add-on, which/);
  assert.match(out.keys.get('Q-GA4-228')!.explanation, /toy lever\.$/);
  assert.match(out.keys.get('Q-GA4-009')!.explanation, /pretend dial\.$/);
  assert.match(out.keys.get('Q-GA4-044')!.explanation, /Made-up note\.$/);
  assert.match(item('Q-GA4-005').options[1]!.text, /^Pretend dial 5 birch$/);
  assert.deepEqual(item('Q-GA4-240').options.map((o) => o.text), ['Toy lever 240 amber', 'Toy lever 240 birch', 'Toy lever 240 cobalt', 'Toy lever 240 dune']);
  assert.match(out.keys.get('Q-GA4-012')!.explanation, /entry GA4-CH-04 covers/);
  assert.match(out.keys.get('Q-GA4-013')!.explanation, /Unlike Q-GA4-012,/);
  assert.equal(stripMarkers('Made up [3]. Also \\[12\\], [4][5] and [6, 7] end'), 'Made up. Also, and end');
  assert.equal(stripMarkers('Keeps [x], [UNVERIFIED] and (3) as they are'), 'Keeps [x], [UNVERIFIED] and (3) as they are');
});

test('no key field in any item file; each key holds only the key fields', () => {
  for (const [id, text] of out.itemText) {
    const raw = JSON.parse(text) as Record<string, unknown>;
    for (const f of ['answer', 'correct', 'correct_oid', 'explanation', 'key', 'value', 'solver']) assert.ok(!(f in raw), `${id} has ${f}`);
    assert.ok(!text.includes(out.keys.get(id)!.explanation), `${id} holds its explanation`);
    assert.deepEqual(Object.keys(out.keys.get(id)!).sort(), ['correct_oid', 'explanation', 'item_id', 'item_version', 'solver']);
    assert.equal(out.keys.get(id)!.solver, null);
  }
});

test('every output validates with the C1 schemas and loads through server/content.ts', async () => {
  for (const i of out.items.values()) {
    assert.deepEqual(validateGa4Item(i), [], i.id);
    assert.deepEqual(validateChoiceKey(out.keys.get(i.id), i), [], i.id);
    assert.equal(i.held_out, false);
    assert.equal(i.exam_relevance, ['GA4-ADMIN-21', 'GA4-ADMIN-22'].includes(i.concept_id) ? 'reference_360' : 'core', i.id);
  }
  for (const c of out.concepts) assert.deepEqual(validateChoiceConcept(c, 'ga4'), [], c.id);
  const content = join(out.root, 'content');
  await mkdir(join(content, 'sql'), { recursive: true });
  await writeFile(join(content, 'sql/curriculum.json'), JSON.stringify({ version: 1, source: '01', errata_applied: [], levels: [], concepts: [] }));
  await writeFile(join(content, 'sql/error-feedback.json'), '{}');
  const store = await loadContent(content);
  assert.equal(store.choiceItem!('Q-GA4-001')?.id, 'Q-GA4-001');
  assert.equal(store.choiceKey!('Q-GA4-001')?.item_id, 'Q-GA4-001');
  assert.deepEqual(store.choiceConcept!('GA4-ADMIN-21'), { section: 'ga4', card_concept_id: 'GA4-SETUP-01' });
  assert.deepEqual(store.choiceConcept!('GA4-SETUP-01'), { section: 'ga4', card_concept_id: 'GA4-SETUP-01' });
  assert.equal(targetOf(store, 'Q-GA4-240'), 'GA4-SETUP-01');
  assert.equal(store.heldOut!('Q-GA4-001'), false);
});

test('E-118: the 06 markdown cross-check finds every question block, the flags, and the stems that differ from the JSON', () => {
  const { markdown } = out.bank.report;
  assert.equal(markdown.questionBlocks, 68);
  assert.deepEqual(markdown.missingBlocks, []);
  assert.deepEqual(markdown.flaggedItems, ['Q-GA4-015', 'Q-GA4-026']);
  assert.deepEqual(markdown.flaggedConcepts, ['GA4-AUDIENCE-01', 'GA4-DEBUG-01']);
  assert.equal(markdown.conceptSections, 16);
  assert.deepEqual(markdown.stemsDiffer, ['Q-GA4-008', 'Q-GA4-010', 'Q-GA4-021', 'Q-GA4-036', 'Q-GA4-062']);
  assert.deepEqual(markdown.answersDiffer, []);
  assert.deepEqual(markdown.optionsDiffer, []);
});

test('the command prints counts and IDs only, never a stem, option or explanation, and refuses to overwrite without --force', async () => {
  const root = await tmp();
  const first = await run(process.execPath, [TOOL, '--kb', FIX, '--out', root]);
  const text = first.stdout + first.stderr;
  for (const leak of ['Fixture question', 'Pretend dial', 'Toy lever', 'Fixture explanation', 'Brightloom', 'Fixture concept', 'Fixture child', 'Invented', 'example.invalid']) {
    assert.ok(!text.includes(leak), `the output shows "${leak}"`);
  }
  assert.match(text, /items: 113 \(112 active, 1 retired: Q-GA4-037\)/);
  assert.match(text, /T-GA4-05\s+28 \/ 27/);
  assert.match(text, /GA4-SETUP-01\s+21 \/ 21/);
  assert.match(text, /enemy groups: 9 \(18 items\)/);
  assert.match(text, /verified false: 11 items/);
  await assert.rejects(run(process.execPath, [TOOL, '--kb', FIX, '--out', root]), (e: { code?: number; stderr?: string; stdout?: string }) => {
    assert.equal(e.code, 1);
    assert.match(e.stderr ?? '', /--force/);
    return true;
  });
  const forced = await run(process.execPath, [TOOL, '--kb', FIX, '--out', root, '--force']);
  assert.match(forced.stdout, /items: 113/);
});

test('structural faults stop the run and name IDs only', async () => {
  const md06 = await readFile(F06, 'utf8');
  const md10 = await readFile(F10, 'utf8');
  const fails = (a: string, b: string, re: RegExp) => assert.throws(() => buildBank(a, b), (e: Error) => {
    assert.match(e.message, re);
    for (const leak of ['Fixture question', 'Pretend dial', 'Toy lever', 'Fixture explanation']) assert.ok(!e.message.includes(leak), e.message);
    return true;
  });
  fails(md06, withJson(md10, (j) => { j.practice_questions = j.practice_questions.filter((q: any) => q.id !== 'Q-GA4-228'); }), /Q-GA4-228/);
  fails(md06, withJson(md10, (j) => { j.concepts.push({ id: 'GA4-FAKE-29', topic: 'FAKE', title: 'x' }); }), /GA4-FAKE-29.*Appendix B/);
  fails(withJson(md06, (j) => { j.practice_questions[3].answer = 'E'; }), md10, /Q-GA4-004/);
  fails(withJson(md06, (j) => { j.practice_questions[4].options[2] = j.practice_questions[4].options[1]; }), md10, /Q-GA4-005.*different/);
  fails(md06.replace(/"question": "Fixture question 07/, '"question" "Fixture question 07'), md10, /06.*JSON block/);
  fails(md06.replace(/researched_on: 2026-09-28\n/, ''), md10, /06.*researched_on/);
});

test('an [UNVERIFIED] flag inside an item\'s own text marks it verified false and is taken out of the text', async () => {
  const md10 = withJson(await readFile(F10, 'utf8'), (j) => {
    const q = j.practice_questions.find((x: any) => x.id === 'Q-GA4-233');
    q.explanation += ' [UNVERIFIED]';
  });
  const bank = buildBank(await readFile(F06, 'utf8'), md10);
  assert.equal(bank.items.find((i) => i.id === 'Q-GA4-233')!.verified, false);
  assert.doesNotMatch(bank.keys.find((k) => k.item_id === 'Q-GA4-233')!.explanation, /UNVERIFIED/);
  assert.deepEqual(bank.report.flaggedInText, ['Q-GA4-233']);
  assert.ok(bank.report.verifiedFalseItems.includes('Q-GA4-233'));
});

test('a 10 question without a concept reference takes its concept from its ID range (3 per concept, Appendix B order)', async () => {
  const md10 = withJson(await readFile(F10, 'utf8'), (j) => { for (const q of j.practice_questions) delete q.concept_id; });
  const bank = buildBank(await readFile(F06, 'utf8'), md10);
  for (const i of bank.items) assert.equal(i.concept_id, item(i.id).concept_id, i.id);
});

test('E-118: the markdown cross-check reads other plausible layouts of the same questions', async () => {
  const md06 = (await readFile(F06, 'utf8'))
    .replace(/^\*\*(Q-GA4-(?:0\d|1\d))\.\*\* (.*)\n(A\) .*)$/gm, '1. **$1:** $2 $3')        // numbered, options on the stem line
    .replace(/^\*\*(Q-GA4-(?:2\d|3\d|4\d))\.\*\* /gm, '**$1**\n')                          // the stem on its own line
    .replace(/^\*\*Answer: ([A-D])\.\*\*/gm, 'Correct answer: **$1**.')
    .replace(/^\*\*Answer:\*\* ([A-D])/gm, '- Answer: ($1)');
  assert.notEqual(md06, await readFile(F06, 'utf8'));
  const { markdown } = buildBank(md06, await readFile(F10, 'utf8')).report;
  assert.equal(markdown.questionBlocks, 68);
  assert.deepEqual(markdown.flaggedItems, ['Q-GA4-015', 'Q-GA4-026']);
  assert.deepEqual(markdown.flaggedConcepts, ['GA4-AUDIENCE-01', 'GA4-DEBUG-01']);
  assert.deepEqual(markdown.stemsDiffer, ['Q-GA4-008', 'Q-GA4-010', 'Q-GA4-021', 'Q-GA4-036', 'Q-GA4-062']);
  assert.deepEqual([markdown.answersDiffer, markdown.answersMissing, markdown.optionsDiffer], [[], [], []]);
});

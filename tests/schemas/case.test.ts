// tests/schemas/case.test.ts: the case record (design §7). Sprint 4b (Task B1) extends it for every case kind: S4B-01's new
// fields, S4B-02's checkpoint shapes, S4B-03's credits and S4B-04's daily cases. Every case here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCaseKey, validateCaseRecord, type CaseKey, type CaseRecord, type Checkpoint, type DataSource } from '../../schemas/case.ts';
import { optionId } from '../../schemas/choice.ts';

const VOLTMARKT: DataSource = { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null };
const options = (itemId: string, texts: string[]) => texts.map((text, i) => ({ oid: optionId(itemId, i), text }));
const money = { precision: 'money' as const, scale: 'eur' as const, decimals: 2, unit_label: 'euros' };
const count = { precision: 'count' as const, scale: 'plain' as const, decimals: 0, unit_label: 'products' };

/** A level opener: CP3 and a typed CP4, as the level 1 and 2 openers have. */
export const goodCase: CaseRecord = {
  case_id: 'CASE-VOLT-L1', kind: 'opener', level: 1, world: 'PRICE', company_id: 'voltmarkt', title: 'An invented opener',
  persona: { name: 'Joost', role: 'Pricing lead' }, brief: { decision: 'Which deals to plan again', deadline: 'Friday' },
  data_needed: ['promotions'],
  expected_output: { columns: ['promo_code', 'sale_price_eur'], grain: 'one row per promotion', sort: [{ column: 'sale_price_eur', desc: false }, { column: 'promo_code', desc: false }] },
  checkpoints: [
    { id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: ['SQL-BASICS-01', 'SQL-FILTER-01'], item_id: 'EX-OPENER-L1-01' },
    { id: 'CP4', kind: 'CP4', prompt: 'Type the average, rounded to 2 decimals.', credits_concepts: [], item_id: 'CASE-VOLT-L1:CP4', typed: money, truth_key: 'CASE-VOLT-L1:CP4' },
  ],
  model_plan: 'Plan text.', model_answer_template: 'Answer text with {CP4}.', follow_up_question: 'Did the deepest deals also sell the most?',
  data_source: VOLTMARKT, difficulty: 1, concept_ids: ['SQL-BASICS-01', 'SQL-FILTER-01'], metric_ids: [], find_ids: [], uses_raw: false,
};

/** An inbox case with all six checkpoints (S4B-05's shape). */
const inboxCase: CaseRecord = {
  case_id: 'CASE-PRICE-01', kind: 'inbox', level: 3, world: 'PRICE', company_id: 'voltmarkt', title: 'An invented pricing question',
  persona: { name: 'Joost', role: 'Pricing lead' }, brief: { decision: 'Which prices to change', deadline: 'Next week' },
  data_needed: ['products', 'order_lines'],
  expected_output: { columns: ['product_id', 'avg_price_eur'], grain: 'one row per product', sort: [{ column: 'avg_price_eur', desc: true }, { column: 'product_id', desc: false }] },
  checkpoints: [
    { id: 'CP1', kind: 'CP1', prompt: 'What is one row of the answer?', credits_concepts: [], item_id: 'CASE-PRICE-01:CP1',
      options: options('CASE-PRICE-01:CP1', ['One product', 'One order line', 'One week']) },
    { id: 'CP2', kind: 'CP2', prompt: 'How many products are in scope?', credits_concepts: ['SQL-AGG-01'], item_id: 'CASE-PRICE-01:CP2', typed: count, truth_key: 'CASE-PRICE-01:CP2' },
    { id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: ['SQL-JOIN-01', 'SQL-AGG-01'], item_id: 'EX-CASE-PRICE-01' },
    { id: 'CP4', kind: 'CP4', prompt: 'Type the average price, rounded to 2 decimals.', credits_concepts: ['SQL-AGG-01'], item_id: 'CASE-PRICE-01:CP4', typed: money, truth_key: 'CASE-PRICE-01:CP4' },
    { id: 'CP5', kind: 'CP5', prompt: 'Can Joost conclude the cut worked?', credits_concepts: [], item_id: 'CASE-PRICE-01:CP5',
      options: options('CASE-PRICE-01:CP5', ['Yes', 'No, the season changed too', 'Only for televisions', 'Not without a control group']) },
    { id: 'CP6', kind: 'CP6', prompt: 'Write the insight in 2 to 4 sentences.', credits_concepts: [] },
  ],
  model_plan: 'Plan text.', model_answer_template: 'Answer text.', follow_up_question: 'What would matching the cheapest competitor cost us?',
  data_source: VOLTMARKT, difficulty: 3, concept_ids: ['SQL-JOIN-01', 'SQL-AGG-01'], metric_ids: [], find_ids: [], uses_raw: false,
};

/** A daily case (S4B-04): CP3 and CP4 only, difficulty 1, asked by one of the five managers. */
const dailyCase: CaseRecord = {
  case_id: 'CASE-DAILY-L2-01', kind: 'daily', level: 2, world: 'RETAIL', company_id: 'voltmarkt', title: 'An invented daily question',
  persona: { name: 'Fleur', role: 'Trade marketing' }, brief: { decision: 'Which category to feature', deadline: 'Tomorrow' },
  data_needed: ['sales'],
  expected_output: { columns: ['category', 'revenue_eur'], grain: 'one row per category', sort: [{ column: 'category', desc: false }] },
  checkpoints: [
    { id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: ['SQL-AGG-01'], item_id: 'EX-CASE-DAILY-L2-01' },
    { id: 'CP4', kind: 'CP4', prompt: 'Type the total, rounded to 2 decimals.', credits_concepts: [], item_id: 'CASE-DAILY-L2-01:CP4', typed: money, truth_key: 'CASE-DAILY-L2-01:CP4' },
  ],
  model_plan: 'Plan text.', model_answer_template: 'Answer text.', follow_up_question: 'Was it the same last year?',
  data_source: VOLTMARKT, difficulty: 1, concept_ids: ['SQL-AGG-01'], metric_ids: [], find_ids: [], uses_raw: false,
};

const kinds: [string, CaseRecord][] = [['an opener', goodCase], ['an inbox case', inboxCase], ['a daily case', dailyCase]];
for (const [name, rec] of kinds) test(`${name} validates`, () => assert.deepEqual(validateCaseRecord(rec), []));

test('malformed input gives messages and never throws', () => {
  for (const bad of [null, undefined, 7, 'x', [], {}]) assert.ok(validateCaseRecord(bad).length > 0);
  const garbled = { ...inboxCase, expected_output: 5, data_source: [], checkpoints: [null, 3, { kind: 'CP1', options: [null, 'x'] }] };
  assert.doesNotThrow(() => validateCaseRecord(garbled));
});

// The fields before sprint 4b keep their messages.
test('each broken field from before sprint 4b is named', () => {
  const msgs = (patch: object) => validateCaseRecord({ ...goodCase, ...patch });
  assert.ok(msgs({ case_id: 'volt' }).some((m) => m.includes('case_id')));
  assert.ok(msgs({ persona: { name: 'x' } }).some((m) => m.includes('persona')));
  assert.ok(msgs({ checkpoints: [] }).some((m) => m.includes('checkpoints')));
  assert.ok(msgs({ difficulty: 9 }).some((m) => m.includes('difficulty')));
  assert.ok(msgs({ uses_raw: 'no' }).some((m) => m.includes('uses_raw')));
  assert.ok(msgs({ concept_ids: [3] }).some((m) => m.includes('concept_ids')));
  assert.ok(msgs({ checkpoints: [{ ...goodCase.checkpoints[0], kind: 'CP9' }] }).some((m) => m.includes('kind')));
  assert.ok(msgs({ checkpoints: [{ ...goodCase.checkpoints[0], credits_concepts: [] }] }).some((m) => m.includes('credits_concepts')));
});
test('checkpoint ids are unique', () => {
  const cp = goodCase.checkpoints[0]!;
  assert.ok(validateCaseRecord({ ...goodCase, checkpoints: [cp, { ...cp, kind: 'CP4' }] }).some((m) => m.includes('id must be unique')));
});
test('a CP4 may credit nothing (S2-106); a CP3 still needs at least one', () => {
  assert.deepEqual(validateCaseRecord(goodCase), [], 'the fixture\'s CP4 credits nothing');
});

// ---- one message per wrong field ------------------------------------------------------------------------------------------
type Rec = Record<string, any>;
const patched = (base: CaseRecord, patch: (r: Rec) => void): Rec => { const r = structuredClone(base) as Rec; patch(r); return r; };
const cp = (r: Rec, kind: string): Rec => r.checkpoints.find((c: Checkpoint) => c.kind === kind);
const at = (base: CaseRecord, kind: string): string => `checkpoints[${base.checkpoints.findIndex((c) => c.kind === kind)}]`;

const cases: [string, CaseRecord, (r: Rec) => void, string][] = [
  // S4B-01: the new record fields
  ['kind is one of the three', inboxCase, (r) => { r.kind = 'mock'; }, 'kind must be opener, inbox or daily'],
  ['level is a curriculum level', inboxCase, (r) => { r.level = 0; }, 'level must be a whole number from 1 to 7'],
  ['level is a whole number', inboxCase, (r) => { r.level = 2.5; }, 'level must be a whole number from 1 to 7'],
  ['data_needed names at least one table', inboxCase, (r) => { r.data_needed = []; }, 'data_needed must list the tables the case reads, each a plain name such as promotions, once'],
  ['data_needed names tables, not SQL', inboxCase, (r) => { r.data_needed = ['products; DROP']; }, 'data_needed must list the tables the case reads, each a plain name such as promotions, once'],
  ['expected_output is an object', inboxCase, (r) => { r.expected_output = 'rows'; }, 'expected_output needs columns, a grain and a sort'],
  ['expected_output names its columns once each', inboxCase, (r) => { r.expected_output.columns = ['product_id', 'product_id', 'avg_price_eur']; },
    'expected_output.columns must list the output columns in order, each named once'],
  ['expected_output has a grain', inboxCase, (r) => { r.expected_output.grain = ' '; }, 'expected_output.grain is missing'],
  ['expected_output has a sort', inboxCase, (r) => { r.expected_output.sort = []; }, 'expected_output.sort must list at least one { column, desc }'],
  ['each sort key is a column and a direction', inboxCase, (r) => { r.expected_output.sort[0].desc = 'yes'; }, 'expected_output.sort must list at least one { column, desc }'],
  ['the sort uses output columns', inboxCase, (r) => { r.expected_output.sort[0].column = 'price'; }, 'expected_output.sort[0].column must be one of expected_output.columns'],
  ['the sort ends in an ID ascending', inboxCase, (r) => { r.expected_output.sort.at(-1).desc = true; }, 'expected_output.sort must end in an ID ascending, so ties have one order'],
  ['follow_up_question is there', inboxCase, (r) => { delete r.follow_up_question; }, 'follow_up_question is missing'],
  ['data_source has a label and says whether the data is real', inboxCase, (r) => { r.data_source = { label: '', real: false, licence: null }; },
    'data_source needs a label and real set to true or false'],
  ['fictional data has no licence', inboxCase, (r) => { r.data_source.licence = 'CC BY 4.0'; }, 'data_source.licence must be null for fictional data'],
  ['real data names its licence', inboxCase, (r) => { r.data_source = { label: 'Online Retail II', real: true, licence: null }; },
    'data_source.licence must name the licence of real data'],
  // S4B-02: the checkpoint shapes
  ['a case has a CP3', inboxCase, (r) => { r.checkpoints = r.checkpoints.filter((c: Rec) => c.kind !== 'CP3'); }, 'a case needs a CP3 checkpoint: its SQL item holds the answer key'],
  ['each checkpoint kind appears once', inboxCase, (r) => { r.checkpoints.push({ ...cp(r, 'CP6'), id: 'CP6-again' }); }, 'checkpoints[6].kind CP6 is listed twice'],
  ['a CP1 has its own item ID', inboxCase, (r) => { cp(r, 'CP1').item_id = 'CASE-PRICE-01:CP5'; }, `${at(inboxCase, 'CP1')}.item_id must be CASE-PRICE-01:CP1`],
  ['a CP2 has its own item ID', inboxCase, (r) => { delete cp(r, 'CP2').item_id; }, `${at(inboxCase, 'CP2')}.item_id must be CASE-PRICE-01:CP2`],
  ['a CP4 has its own item ID', inboxCase, (r) => { cp(r, 'CP4').item_id = 'CASE-OTHER:CP4'; }, `${at(inboxCase, 'CP4')}.item_id must be CASE-PRICE-01:CP4`],
  ['a CP5 has its own item ID', inboxCase, (r) => { cp(r, 'CP5').item_id = 7; }, `${at(inboxCase, 'CP5')}.item_id must be CASE-PRICE-01:CP5`],
  ['a CP1 has 3 or 4 options', inboxCase, (r) => { cp(r, 'CP1').options.splice(1, 1); }, `${at(inboxCase, 'CP1')}.options must hold 3 or 4 options`],
  ['a CP5 has options', inboxCase, (r) => { delete cp(r, 'CP5').options; }, `${at(inboxCase, 'CP5')}.options must hold 3 or 4 options`],
  ['an option has an oid and a text', inboxCase, (r) => { cp(r, 'CP1').options[2].text = ''; }, `${at(inboxCase, 'CP1')}.options[2] needs an oid and a text`],
  ['an option holds nothing that tells the answer', inboxCase, (r) => { cp(r, 'CP1').options[0].correct = true; },
    `${at(inboxCase, 'CP1')}.options[0] must hold only an oid and a text: the correct one lives in the key`],
  ['an option\'s oid is opaque (S2-60)', inboxCase, (r) => { cp(r, 'CP5').options[1].oid = 'b'; }, `${at(inboxCase, 'CP5')}.options[1].oid must be optionId(CASE-PRICE-01:CP5, 1)`],
  ['option texts differ', inboxCase, (r) => { cp(r, 'CP1').options[1].text = 'one product'; }, `${at(inboxCase, 'CP1')}.options must have different texts`],
  ['only CP1 and CP5 carry options', inboxCase, (r) => { cp(r, 'CP3').options = cp(r, 'CP1').options; }, `${at(inboxCase, 'CP3')}.options belong only to a CP1 or CP5 checkpoint`],
  ['a CP2 has a typed spec', inboxCase, (r) => { delete cp(r, 'CP2').typed; }, `${at(inboxCase, 'CP2')}.typed is missing`],
  ['a CP2 typed spec is checked', inboxCase, (r) => { cp(r, 'CP2').typed.decimals = 1; }, `${at(inboxCase, 'CP2')}.a count is a whole number: decimals 0 and scale plain`],
  ['a CP2 names its truth key', inboxCase, (r) => { cp(r, 'CP2').truth_key = 'CASE-PRICE-01:CP4'; }, `${at(inboxCase, 'CP2')}.truth_key must be CASE-PRICE-01:CP2`],
  ['a CP4 names its truth key', inboxCase, (r) => { delete cp(r, 'CP4').truth_key; }, `${at(inboxCase, 'CP4')}.truth_key must be CASE-PRICE-01:CP4`],
  ['only CP2 and CP4 carry a typed spec', inboxCase, (r) => { cp(r, 'CP1').typed = money; }, `${at(inboxCase, 'CP1')}.typed belongs only to a CP2 or CP4 checkpoint`],
  ['only CP2 and CP4 carry a truth key', inboxCase, (r) => { cp(r, 'CP5').truth_key = 'CASE-PRICE-01:CP5'; }, `${at(inboxCase, 'CP5')}.truth_key belongs only to a CP2 or CP4 checkpoint`],
  ['a case CP3 names its EX-CASE- item', inboxCase, (r) => { cp(r, 'CP3').item_id = 'EX-CASE-PRICE-02'; }, `${at(inboxCase, 'CP3')}.item_id must be EX-CASE-PRICE-01`],
  ['a CP3 has an item', inboxCase, (r) => { delete cp(r, 'CP3').item_id; }, `${at(inboxCase, 'CP3')}.item_id is missing`],
  ['an opener CP3 names an opener item', goodCase, (r) => { cp(r, 'CP3').item_id = 'EX-CASE-VOLT-L1'; }, `${at(goodCase, 'CP3')}.item_id must be an opener item ID such as EX-OPENER-L1-01`],
  ['an opener CP3 item is of the opener\'s level', goodCase, (r) => { cp(r, 'CP3').item_id = 'EX-OPENER-L2-01'; },
    `${at(goodCase, 'CP3')}.item_id EX-OPENER-L2-01 names level 2 but the opener is level 1`],
  ['a CP6 carries a prompt only', inboxCase, (r) => { cp(r, 'CP6').item_id = 'CASE-PRICE-01:CP6'; }, `${at(inboxCase, 'CP6')}.item_id belongs on CP1 to CP5 only`],
  // S4B-03: credits
  ['a CP2 credits a concept', inboxCase, (r) => { cp(r, 'CP2').credits_concepts = []; }, `${at(inboxCase, 'CP2')}.credits_concepts must name at least one concept`],
  ['a CP6 credits nothing', inboxCase, (r) => { cp(r, 'CP6').credits_concepts = ['SQL-AGG-01']; }, `${at(inboxCase, 'CP6')}.credits_concepts must be empty: CP6 credits nothing`],
  ['credits are a list of concept IDs', inboxCase, (r) => { delete cp(r, 'CP1').credits_concepts; }, `${at(inboxCase, 'CP1')}.credits_concepts must be a list of concept IDs`],
  // S4B-04: daily cases
  ['a daily case has CP3 and CP4 only', dailyCase, (r) => { r.checkpoints.push({ id: 'CP6', kind: 'CP6', prompt: 'Write it.', credits_concepts: [] }); },
    'a daily case has exactly two checkpoints, CP3 and CP4'],
  ['a daily case has difficulty 1', dailyCase, (r) => { r.difficulty = 2; }, 'a daily case has difficulty 1'],
  ['a daily case ID names its level', dailyCase, (r) => { r.level = 3; }, 'a daily case ID looks like CASE-DAILY-L3-01'],
  ['a daily case is asked by the cast', dailyCase, (r) => { r.persona = { name: 'Fleur', role: 'CFO' }; },
    'a daily case is asked by one of the five managers in their own role: Sanne, Joost, Fleur, Marieke or Yara'],
  ['only a daily case has a daily ID', goodCase,
    (r) => { r.case_id = 'CASE-DAILY-L1-01'; Object.assign(cp(r, 'CP4'), { item_id: 'CASE-DAILY-L1-01:CP4', truth_key: 'CASE-DAILY-L1-01:CP4' }); },
    'only a daily case may use a CASE-DAILY- ID'],
];
for (const [name, base, patch, message] of cases) {
  test(`validateCaseRecord: ${name}`, () => assert.deepEqual(validateCaseRecord(patched(base, patch)), [message]));
}

test('an opener\'s sort may end as its CP3 item\'s prompt sorts (the level 1 and 2 openers keep their items, S4B-06)', () => {
  assert.deepEqual(validateCaseRecord(patched(goodCase, (r) => { r.expected_output.sort = [{ column: 'sale_price_eur', desc: true }]; })), []);
  const level2 = patched(goodCase, (r) => {
    Object.assign(r, { case_id: 'CASE-VOLT-L2', level: 2 });
    r.expected_output.sort = [{ column: 'sale_price_eur', desc: true }];
    cp(r, 'CP3').item_id = 'EX-OPENER-L2-01';
    Object.assign(cp(r, 'CP4'), { item_id: 'CASE-VOLT-L2:CP4', truth_key: 'CASE-VOLT-L2:CP4' });
  });
  assert.deepEqual(validateCaseRecord(level2), [], 'the level 2 opener keeps its item\'s sort too');
});
// Task B2 (the controller's ruling on B1's review, Q1): only the two existing openers need the exemption; a new opener's sort ends
// in an ID ascending like every other case.
test('a level 3 opener\'s sort must end in an ID ascending, like an inbox or daily case', () => {
  const level3 = (desc: boolean): Rec => patched(goodCase, (r) => {
    Object.assign(r, { case_id: 'CASE-VOLT-L3', level: 3 });
    r.expected_output.sort = [{ column: 'sale_price_eur', desc: false }, { column: 'promo_code', desc }];
    cp(r, 'CP3').item_id = 'EX-OPENER-L3-01';
    Object.assign(cp(r, 'CP4'), { item_id: 'CASE-VOLT-L3:CP4', truth_key: 'CASE-VOLT-L3:CP4' });
  });
  assert.deepEqual(validateCaseRecord(level3(false)), []);
  assert.deepEqual(validateCaseRecord(level3(true)), ['expected_output.sort must end in an ID ascending, so ties have one order']);
});

// ---- Task B2: the case key (S4B-02) -----------------------------------------------------------------------------------------
// Every key here is invented. A message never quotes a truth query, an oid or an explanation: keys never print.
const QUERY = 'SELECT invented_marker_query FROM nowhere';
const fullKey: CaseKey = {
  case_id: 'CASE-PRICE-01', truths: { CP2: QUERY, CP4: `WITH t AS (${QUERY}) SELECT * FROM t` },
  choices: { CP1: { correct_oid: optionId('CASE-PRICE-01:CP1', 0), explanation: 'One row per product.' },
    CP5: { correct_oid: optionId('CASE-PRICE-01:CP5', 3), explanation: 'The season changed too.' } },
};
const openerKey: CaseKey = { case_id: 'CASE-VOLT-L1', truths: { CP4: QUERY }, choices: {} };
test('a case key with both truths and both choices validates, and so does an opener key with one CP4 truth and no choices', () => {
  assert.deepEqual(validateCaseKey(fullKey), []);
  assert.deepEqual(validateCaseKey(openerKey), []);
});
test('validateCaseKey: malformed input gives messages and never throws', () => {
  for (const bad of [null, undefined, 7, 'x', [], {}, { case_id: 'CASE-X', truths: [], choices: null }]) {
    assert.doesNotThrow(() => validateCaseKey(bad));
    assert.ok(validateCaseKey(bad).length > 0);
  }
});
const keyCases: [string, CaseKey, (k: Rec) => void, string][] = [
  ['case_id looks like a case ID', fullKey, (k) => { k.case_id = 'price'; }, 'case_id must look like CASE-VOLT-L1'],
  ['the old shape is refused', openerKey, (k) => { k.checkpoint_id = 'CP4'; k.truth_query = QUERY; }, 'a case key holds only case_id, truths and choices'],
  ['truths is an object', fullKey, (k) => { k.truths = [QUERY]; }, 'truths must be an object of CP2 and CP4 truth queries'],
  ['truths holds only CP2 and CP4', fullKey, (k) => { k.truths.CP3 = QUERY; }, 'truths may hold only CP2 and CP4'],
  ['a truth is one SELECT query', fullKey, (k) => { k.truths.CP2 = 'DELETE FROM promotions'; }, 'truths.CP2 must be one SELECT query (it may start with WITH)'],
  ['a truth is text', fullKey, (k) => { k.truths.CP4 = 12; }, 'truths.CP4 must be one SELECT query (it may start with WITH)'],
  ['choices is an object', openerKey, (k) => { delete k.choices; }, 'choices must be an object of the CP1 and CP5 correct options'],
  ['choices holds only CP1 and CP5', fullKey, (k) => { k.choices.CP2 = k.choices.CP1; }, 'choices may hold only CP1 and CP5'],
  ['a choice names its correct oid', fullKey, (k) => { delete k.choices.CP1.correct_oid; }, 'choices.CP1 needs a correct_oid and a one-line explanation'],
  ['a choice explains itself', fullKey, (k) => { k.choices.CP5.explanation = ' '; }, 'choices.CP5 needs a correct_oid and a one-line explanation'],
  ['a choice holds nothing else', fullKey, (k) => { k.choices.CP5.value = 3; }, 'choices.CP5 holds only correct_oid and explanation'],
];
for (const [name, base, patch, message] of keyCases) {
  test(`validateCaseKey: ${name}`, () => {
    const k = structuredClone(base) as Rec;
    patch(k);
    const got = validateCaseKey(k);
    assert.deepEqual(got, [message]);
    assert.ok(!got.join(' ').includes('invented_marker_query') && !got.join(' ').includes('season'), 'no key text in a message');
  });
}

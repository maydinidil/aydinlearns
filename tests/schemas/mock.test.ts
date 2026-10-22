// tests/schemas/mock.test.ts: the recruiter mocks' content shapes (sprint 7, Task M1; S7-08, S7-09, S7-10, S7-14, S7-15). The shipped
// content/mocks.json and validateMocksFile; the `mock` use of an SQL item and its ID rule; the case kinds case_round and take_home and
// their ID shapes. Every item and case here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCaseRecord, type CaseRecord } from '../../schemas/case.ts';
import { DEFAULT_RULES, validateSqlItem, type SqlItem } from '../../schemas/item.ts';
import { validateMocksFile } from '../../schemas/mock.ts';
import { mockCaseRecord } from '../helpers/mock-fixture.ts';

const shipped = JSON.parse(await readFile('content/mocks.json', 'utf8')) as Record<string, any>;

const screenForm = (letter: string) => ({ id: `SCREEN-${letter}`, item_ids: [1, 2, 3, 4, 5, 6].map((n) => `EX-MOCK-SCREEN-${letter}-0${n}`) });

/** A mock's rules: its section of the file without its forms, which the content tasks fill (C3b M1). */
const rulesOf = (kind: string): Record<string, unknown> => { const { forms: _forms, ...rules } = shipped[kind] as Record<string, unknown>; return rules; };

test('content/mocks.json holds S7-09, S7-10, S7-14 and S7-15 rules and the screen forms Task C3 shipped, and validates', () => {
  assert.deepEqual(Object.keys(shipped), ['screen', 'knowledge', 'case_round', 'take_home']);
  assert.deepEqual(rulesOf('screen'), { questions: 6, minutes: 45, pass_correct: 5, mode: 'screen' });
  assert.deepEqual(rulesOf('knowledge'), { questions: 30, minutes: 40, pass_pct: 80, per_section: { methodology: 20, ga4: 10 } });
  assert.deepEqual(rulesOf('case_round'), { minutes: 45, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step'] });
  assert.deepEqual(rulesOf('take_home'), { minutes: 120, close_after_hours: 24, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step', 'reconciliation'] });
  assert.deepEqual(shipped.screen.forms.slice(0, 3).map((f: { id: string }) => f.id), ['SCREEN-A', 'SCREEN-B', 'SCREEN-C'], 'the screen forms C3 shipped');
  assert.deepEqual(validateMocksFile(shipped), []);
});

/** The shipped rules with forms as Tasks C3 and P2 fill them. */
const filled = (): Record<string, any> => {
  const m = structuredClone(shipped);
  m.screen.forms = ['A', 'B', 'C'].map(screenForm);
  m.case_round.forms = [{ id: 'CASE-ROUND-A', case_id: 'CASE-MOCK-A' }, { id: 'CASE-ROUND-B', case_id: 'CASE-MOCK-B' }];
  m.take_home.forms = [{ id: 'TAKE-HOME-A', case_id: 'CASE-TAKE-A' }, { id: 'TAKE-HOME-B', case_id: 'CASE-TAKE-B' }];
  return m;
};

test('forms as the content tasks fill them validate', () => assert.deepEqual(validateMocksFile(filled()), []));

test('validateMocksFile tolerates anything and never throws', () => {
  for (const x of [null, undefined, 3, 'mocks', [], {}]) assert.ok(validateMocksFile(x).length > 0, JSON.stringify(x));
  assert.deepEqual(validateMocksFile([]), ['mocks.json must be an object with screen, knowledge, case_round and take_home']);
});

const broken: [string, (m: Record<string, any>) => void, string][] = [
  ['a section is missing', (m) => { delete m.knowledge; }, 'knowledge must be an object'],
  ['a section is not an object', (m) => { m.take_home = [1]; }, 'take_home must be an object'],
  ['nothing else at the top', (m) => { m.live = {}; }, 'mocks.json holds only screen, knowledge, case_round and take_home'],
  ['questions is a whole number', (m) => { m.screen.questions = 5.5; }, 'screen.questions must be a whole number of 1 or more'],
  ['minutes is above 0', (m) => { m.case_round.minutes = 0; }, 'case_round.minutes must be a number above 0'],
  ['the pass mark is a whole number', (m) => { m.screen.pass_correct = 'five'; }, 'screen.pass_correct must be a whole number of 1 or more'],
  ['the pass mark is at most the questions', (m) => { m.screen.pass_correct = 7; }, 'screen.pass_correct must be at most screen.questions'],
  ['the screen mock is in screen mode', (m) => { m.screen.mode = 'normal'; }, 'screen.mode must be screen'],
  ['the knowledge pass mark is a percentage', (m) => { m.knowledge.pass_pct = 120; }, 'knowledge.pass_pct must be between 0 and 100'],
  ['the sections add up to the questions', (m) => { m.knowledge.per_section.ga4 = 11; },
    'knowledge.per_section must give methodology and ga4 as whole numbers that add up to knowledge.questions'],
  ['auto_min counts CP1 to CP5', (m) => { m.take_home.auto_min = 6; }, 'take_home.auto_min must be a whole number from 0 to 5'],
  ['the core rubric names rubric points, each once', (m) => { m.case_round.core_rubric = ['number', 'number']; },
    'case_round.core_rubric must list rubric point IDs such as next_step, each once'],
  ['the core rubric is not empty', (m) => { m.take_home.core_rubric = []; }, 'take_home.core_rubric must list rubric point IDs such as next_step, each once'],
  ['the take-home closes after some hours', (m) => { m.take_home.close_after_hours = -1; }, 'take_home.close_after_hours must be a number above 0'],
  ['forms is a list', (m) => { m.case_round.forms = {}; }, 'case_round.forms must be a list'],
  ['a screen form ID looks like SCREEN-A', (m) => { m.screen.forms[1].id = 'SCREEN-2'; }, 'screen.forms[1].id must look like SCREEN-A'],
  ['a screen form ID is used once', (m) => { m.screen.forms[2].id = 'SCREEN-A'; m.screen.forms[2].item_ids = screenForm('A').item_ids; },
    'screen.forms[2].id repeats SCREEN-A'],
  ['a screen form lists its questions', (m) => { m.screen.forms[0].item_ids.pop(); }, 'screen.forms[0].item_ids must list 6 item IDs (screen.questions), each once'],
  ['a screen form lists each item once', (m) => { m.screen.forms[0].item_ids[5] = 'EX-MOCK-SCREEN-A-01'; },
    'screen.forms[0].item_ids must list 6 item IDs (screen.questions), each once'],
  ['a screen form lists its own items', (m) => { m.screen.forms[1].item_ids[0] = 'EX-MOCK-SCREEN-A-01'; },
    'screen.forms[1].item_ids must name the form\'s own items, such as EX-MOCK-SCREEN-B-01'],
  ['a case-round form ID looks like CASE-ROUND-A', (m) => { m.case_round.forms[0].id = 'CASE-A'; }, 'case_round.forms[0].id must look like CASE-ROUND-A'],
  ['a case-round form runs a CASE-MOCK- case', (m) => { m.case_round.forms[1].case_id = 'CASE-TAKE-B'; }, 'case_round.forms[1].case_id must look like CASE-MOCK-A'],
  ['a take-home form ID looks like TAKE-HOME-A', (m) => { m.take_home.forms[0].id = 'TAKEHOME-A'; }, 'take_home.forms[0].id must look like TAKE-HOME-A'],
  ['a take-home form runs a CASE-TAKE- case', (m) => { m.take_home.forms[0].case_id = 'CASE-MOCK-A'; }, 'take_home.forms[0].case_id must look like CASE-TAKE-A'],
  ['a form ID is used once', (m) => { m.take_home.forms[1].id = 'TAKE-HOME-A'; }, 'take_home.forms[1].id repeats TAKE-HOME-A'],
  ['a case is run by one form', (m) => { m.case_round.forms[1].case_id = 'CASE-MOCK-A'; }, 'case_round.forms[1].case_id repeats CASE-MOCK-A'],
];
for (const [label, patch, message] of broken) {
  test(`validateMocksFile: ${label}`, () => {
    const m = filled();
    patch(m);
    const problems = validateMocksFile(m);
    assert.ok(problems.includes(message), `${message}\n  got: ${problems.join(' | ')}`);
  });
}

// ---- the mock item (S7-08) ------------------------------------------------------------------------------------------------------

const item = {
  id: 'EX-MOCK-SCREEN-A-01', version: 1, kind: 'write', tags: [], level: 1, source_ids: ['01:SQL-FILTER-01'], verified: false, as_of: '2026-10-20',
  review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use: 'mock', target_concept_id: 'SQL-FILTER-01',
  concept_ids: ['SQL-FILTER-01'], template_id: 'T-MOCK-a', template_params: {}, sub_skill: null, difficulty: 'E2', company: 'voltmarkt', schema: 'voltmarkt',
  edge_schema: 'voltmarkt_edge_filter', prompt: 'An invented screen question about stores.', output_contract: null,
  rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] }, hints: ['An invented hint.', 'Another invented hint.'],
  subgoals: [], fading: null, faded_shape: null, starter_sql: null, time_target_ms: 300_000, why_this_works: 'An invented reason.',
} satisfies SqlItem;

test('S7-08: a mock item has use mock and an EX-MOCK- ID: a screen form\'s EX-MOCK-<FORM>-NN, or a case mock\'s CP3', () => {
  for (const id of ['EX-MOCK-SCREEN-A-01', 'EX-MOCK-SCREEN-C-06', 'EX-MOCK-CASE-A', 'EX-MOCK-TAKE-B']) assert.deepEqual(validateSqlItem({ ...item, id }), [], id);
  const shape = 'a mock item ID must look like EX-MOCK-SCREEN-A-01, EX-MOCK-CASE-A or EX-MOCK-TAKE-A';
  for (const id of ['EX-SQL-FILTER-01-E2-01', 'EX-MOCK-SCREEN-A-1', 'EX-MOCK-SCREEN-AB-01', 'EX-MOCK-CASE-01', 'EX-MOCK-KNOWLEDGE-01']) {
    assert.deepEqual(validateSqlItem({ ...item, id }), [shape], id);
  }
  assert.deepEqual(validateSqlItem({ ...item, use: 'pool' }), ['only a mock item may use an EX-MOCK- ID']);
  assert.deepEqual(validateSqlItem({ ...item, id: 'EX-SQL-FILTER-01-E2-01', use: 'pool' }), [], 'a practice item is unchanged');
});

// ---- the mock cases (S7-08, S7-13 to S7-15) -------------------------------------------------------------------------------------

type Rec = Record<string, any>;
const caseRound = (): Rec => mockCaseRecord() as unknown as Rec;
const takeHome = (): Rec => ({ ...(mockCaseRecord('CASE-TAKE-B', 'take_home') as unknown as Rec), schema: 'voltmarkt_raw', uses_raw: true });

test('S7-08: a case-round mock is CASE-MOCK-<letter> with CP3 EX-MOCK-CASE-<letter>; a take-home is CASE-TAKE-<letter> with EX-MOCK-TAKE-<letter>', () => {
  assert.deepEqual(validateCaseRecord(caseRound()), []);
  assert.deepEqual(validateCaseRecord(takeHome()), []);
  assert.equal(caseRound().checkpoints.find((c: Rec) => c.kind === 'CP3').item_id, 'EX-MOCK-CASE-A');
  assert.equal(takeHome().checkpoints.find((c: Rec) => c.kind === 'CP3').item_id, 'EX-MOCK-TAKE-B');
});

const caseBroken: [string, () => Rec, (r: Rec) => void, string][] = [
  ['a case-round mock\'s ID', caseRound, (r) => { r.case_id = 'CASE-TAKE-A'; }, 'a case-round mock\'s ID looks like CASE-MOCK-A'],
  ['a take-home mock\'s ID', takeHome, (r) => { r.case_id = 'CASE-MOCK-B'; }, 'a take-home mock\'s ID looks like CASE-TAKE-A'],
  ['only a case-round mock is CASE-MOCK-', caseRound, (r) => { r.kind = 'inbox'; }, 'only a case-round mock may use a CASE-MOCK- ID'],
  ['only a take-home mock is CASE-TAKE-', takeHome, (r) => { r.kind = 'inbox'; }, 'only a take-home mock may use a CASE-TAKE- ID'],
  ['a case-round mock\'s CP3', caseRound, (r) => { r.checkpoints.find((c: Rec) => c.kind === 'CP3').item_id = 'EX-CASE-MOCK-A'; },
    'checkpoints[2].item_id must be EX-MOCK-CASE-A'],
  ['a take-home mock\'s CP3', takeHome, (r) => { r.checkpoints.find((c: Rec) => c.kind === 'CP3').item_id = 'EX-MOCK-CASE-B'; },
    'checkpoints[2].item_id must be EX-MOCK-TAKE-B'],
  ['kind is one of the five', caseRound, (r) => { r.kind = 'mock'; }, 'kind must be opener, inbox, daily, case_round or take_home'],
];
for (const [label, base, patch, message] of caseBroken) {
  test(`validateCaseRecord: ${label}`, () => {
    const r = base();
    patch(r);
    const problems = validateCaseRecord(r as CaseRecord);
    assert.ok(problems.includes(message), `${message}\n  got: ${problems.join(' | ')}`);
  });
}

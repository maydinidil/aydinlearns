// tests/helpers/case-fixture.ts: a content root with one case of each kind (Task B2 of sprint 4b), built on the SQL content
// fixture. A level 1 opener in sql/openers/, and an inbox case (CP1 to CP6) and a daily case (CP3 and CP4) in sql/cases/, each
// with its CP3 item and SQL key, its case key in keys/cases/, and a truth file holding every CP2 and CP4 value. It passes C41.
// Every case, key and value here is invented.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaseKey, CaseRecord } from '../../schemas/case.ts';
import { optionId } from '../../schemas/choice.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from './content-fixture.ts';

export const OPENER_ID = 'CASE-VOLT-L1';
export const INBOX_ID = 'CASE-PRICE-01';
export const DAILY_ID = 'CASE-DAILY-L1-01';
/** A second level 1 concept, credited beside the fixture's own. */
export const OTHER_CONCEPT = 'SQL-BASICS-01';
export const TRUTH_QUERY = 'SELECT invented_case_truth_marker FROM nowhere';
export const EXPLANATION = 'An invented explanation marker.';
/** The invented values the truth file holds. */
export const TRUTHS: Record<string, number> = { [`${OPENER_ID}:CP4`]: 340, [`${INBOX_ID}:CP2`]: 12, [`${INBOX_ID}:CP4`]: 38.4, [`${DAILY_ID}:CP4`]: 7 };

const VOLTMARKT = { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null };
const MONEY = { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' } as const;
const COUNT = { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'stores' } as const;
const EXPECTED = { columns: ['city'], grain: 'one row per store', sort: [{ column: 'city', desc: false }] };
const options = (itemId: string, texts: string[]) => texts.map((text, i) => ({ oid: optionId(itemId, i), text }));
const common = {
  world: 'PRICE', company_id: 'voltmarkt', brief: { decision: 'Which stores to visit', deadline: 'Friday' }, data_needed: ['stores'],
  expected_output: EXPECTED, model_plan: 'An invented model plan marker.', model_answer_template: 'An invented model answer with {CP4}.',
  follow_up_question: 'Which store comes next?', data_source: VOLTMARKT, metric_ids: [], find_ids: [], uses_raw: false,
};

export function openerRecord(): CaseRecord {
  return { ...structuredClone(common), case_id: OPENER_ID, kind: 'opener', level: 1, title: 'An invented opener', persona: { name: 'Joost', role: 'Pricing lead' },
    difficulty: 1, concept_ids: [FIXTURE_CONCEPT],
    checkpoints: [
      { id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: [FIXTURE_CONCEPT], item_id: 'EX-OPENER-L1-01' },
      { id: 'CP4', kind: 'CP4', prompt: 'Type the total, rounded to 2 decimals.', credits_concepts: [], item_id: `${OPENER_ID}:CP4`, typed: { ...MONEY }, truth_key: `${OPENER_ID}:CP4` },
    ] };
}
export function inboxRecord(): CaseRecord {
  return { ...structuredClone(common), case_id: INBOX_ID, kind: 'inbox', level: 1, title: 'An invented inbox case', persona: { name: 'Joost', role: 'Pricing lead' },
    difficulty: 2, concept_ids: [FIXTURE_CONCEPT, OTHER_CONCEPT],
    checkpoints: [
      { id: 'CP1', kind: 'CP1', prompt: 'What is one row of the answer?', credits_concepts: [], item_id: `${INBOX_ID}:CP1`,
        options: options(`${INBOX_ID}:CP1`, ['One store', 'One city', 'One order']) },
      { id: 'CP2', kind: 'CP2', prompt: 'How many stores are in scope?', credits_concepts: [OTHER_CONCEPT], item_id: `${INBOX_ID}:CP2`, typed: { ...COUNT }, truth_key: `${INBOX_ID}:CP2` },
      { id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: [FIXTURE_CONCEPT, OTHER_CONCEPT], item_id: 'EX-CASE-PRICE-01' },
      { id: 'CP4', kind: 'CP4', prompt: 'Type the average, rounded to 2 decimals.', credits_concepts: [FIXTURE_CONCEPT], item_id: `${INBOX_ID}:CP4`, typed: { ...MONEY }, truth_key: `${INBOX_ID}:CP4` },
      { id: 'CP5', kind: 'CP5', prompt: 'Can Joost conclude the visit worked?', credits_concepts: [], item_id: `${INBOX_ID}:CP5`,
        options: options(`${INBOX_ID}:CP5`, ['Yes', 'No, the season changed too', 'Only in Gent', 'Not without a control group']) },
      { id: 'CP6', kind: 'CP6', prompt: 'Write the insight in 2 to 4 sentences.', credits_concepts: [] },
    ] };
}
export function dailyRecord(): CaseRecord {
  return { ...structuredClone(common), case_id: DAILY_ID, kind: 'daily', level: 1, title: 'An invented daily case', persona: { name: 'Fleur', role: 'Trade marketing' },
    difficulty: 1, concept_ids: [FIXTURE_CONCEPT, OTHER_CONCEPT],
    checkpoints: [
      { id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: [FIXTURE_CONCEPT, OTHER_CONCEPT], item_id: 'EX-CASE-DAILY-L1-01' },
      { id: 'CP4', kind: 'CP4', prompt: 'Type the count.', credits_concepts: [], item_id: `${DAILY_ID}:CP4`, typed: { ...COUNT }, truth_key: `${DAILY_ID}:CP4` },
    ] };
}
export function caseKeys(): CaseKey[] {
  return [
    { case_id: OPENER_ID, truths: { CP4: TRUTH_QUERY }, choices: {} },
    { case_id: INBOX_ID, truths: { CP2: TRUTH_QUERY, CP4: TRUTH_QUERY },
      choices: { CP1: { correct_oid: optionId(`${INBOX_ID}:CP1`, 0), explanation: EXPLANATION }, CP5: { correct_oid: optionId(`${INBOX_ID}:CP5`, 3), explanation: EXPLANATION } } },
    { case_id: DAILY_ID, truths: { CP4: TRUTH_QUERY }, choices: {} },
  ];
}

export interface CaseFixture { root: string; truthFile: string }
export interface CasePatch {
  records?: (r: { opener: Record<string, any>; inbox: Record<string, any>; daily: Record<string, any> }) => void;
  keys?: (k: Record<string, any>[]) => void;
  items?: (i: Record<string, Record<string, any>>) => void;
  truths?: (t: Record<string, number>) => void;
}

/** Writes the three cases into a copy of the SQL content fixture; each patch edits its part first. */
export async function makeCaseFixture(patch: CasePatch = {}): Promise<CaseFixture> {
  const root = await makeContentFixture();
  for (const d of ['sql/openers', 'sql/cases', 'keys/cases']) await mkdir(join(root, d), { recursive: true });
  const base = JSON.parse(await readFile(join(root, 'sql/items', `EX-${FIXTURE_CONCEPT}-E1-08.json`), 'utf8'));
  const keyBase = JSON.parse(await readFile(join(root, 'keys/sql', `EX-${FIXTURE_CONCEPT}-E1-08.json`), 'utf8'));
  const item = (id: string, use: string) => ({ ...base, id, use, output_contract: { ...base.output_contract, grain: null },
    rules: { ...base.rules, order_matters: true, sort_keys: [{ column: 'city', desc: false }] } });
  const items: Record<string, Record<string, any>> = {
    'EX-OPENER-L1-01': item('EX-OPENER-L1-01', 'opener'), 'EX-CASE-PRICE-01': item('EX-CASE-PRICE-01', 'case'), 'EX-CASE-DAILY-L1-01': item('EX-CASE-DAILY-L1-01', 'case'),
  };
  const records = { opener: openerRecord() as Record<string, any>, inbox: inboxRecord() as Record<string, any>, daily: dailyRecord() as Record<string, any> };
  const keys = caseKeys() as Record<string, any>[];
  const truths = { ...TRUTHS };
  patch.items?.(items);
  patch.records?.(records);
  patch.keys?.(keys);
  patch.truths?.(truths);
  for (const [id, it] of Object.entries(items)) {
    await writeFile(join(root, 'sql/items', `${id}.json`), JSON.stringify(it));
    await writeFile(join(root, 'keys/sql', `${id}.json`), JSON.stringify({ ...keyBase, item_id: id }));
  }
  await writeFile(join(root, 'sql/openers', `${OPENER_ID}.json`), JSON.stringify(records.opener));
  await writeFile(join(root, 'sql/cases', `${INBOX_ID}.json`), JSON.stringify(records.inbox));
  await writeFile(join(root, 'sql/cases', `${DAILY_ID}.json`), JSON.stringify(records.daily));
  for (const k of keys) await writeFile(join(root, 'keys/cases', `${String(k.case_id)}.json`), JSON.stringify(k));
  const truthFile = join(root, 'truth.json');
  await writeFile(truthFile, JSON.stringify({ company: 'voltmarkt', checkpoints: truths }));
  return { root, truthFile };
}

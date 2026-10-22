// tests/helpers/mock-fixture.ts: a content root holding held-out mock content (sprint 7, Task M1; S7-08, D114), built on the case
// fixture (tests/helpers/case-fixture.ts). Beside its three cases: a screen-mock item, EX-MOCK-SCREEN-A-01, in sql/items/ with
// `use: 'mock'` and its SQL key; a case-round mock case, CASE-MOCK-A, in sql/mocks/ (CP1 to CP6, the inbox case's shape), with its CP3
// item EX-MOCK-CASE-A (`use: 'mock'`) and its case key in keys/cases/; and content/mocks.json, the shipped rules with the screen forms
// as shipped and the case forms empty, unless a patch fills them. The truth file holds CASE-MOCK-A's CP2 and CP4 values. Every item,
// case, key and value is invented.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CaseKey, MockCaseRecord } from '../../schemas/case.ts';
import { optionId } from '../../schemas/choice.ts';
import { EXPLANATION, TRUTH_QUERY, inboxRecord, makeCaseFixture, type CaseFixture, type CasePatch } from './case-fixture.ts';

export const SCREEN_ITEM = 'EX-MOCK-SCREEN-A-01';
export const MOCK_CASE = 'CASE-MOCK-A';
export const MOCK_CP3 = 'EX-MOCK-CASE-A';
/** The invented CP2 and CP4 values of CASE-MOCK-A. */
export const MOCK_TRUTHS: Record<string, number> = { [`${MOCK_CASE}:CP2`]: 14, [`${MOCK_CASE}:CP4`]: 41.5 };

/**
 * A mock case: the inbox case's checkpoints under the mock case's own IDs, difficulty 3 (S7-14). CASE-MOCK-A, a case-round, unless
 * named; its CP3 item is EX-MOCK-CASE-<letter> for a case-round and EX-MOCK-TAKE-<letter> for a take-home (S7-08).
 */
export function mockCaseRecord(caseId = MOCK_CASE, kind: MockCaseRecord['kind'] = 'case_round'): MockCaseRecord {
  const r = inboxRecord();
  const own = (cp: string) => `${caseId}:${cp}`;
  const cp3 = caseId.replace(/^CASE-MOCK-/, 'EX-MOCK-CASE-').replace(/^CASE-TAKE-/, 'EX-MOCK-TAKE-');
  return {
    ...r, case_id: caseId, kind, title: `An invented ${kind === 'case_round' ? 'case-round' : 'take-home'} mock`, difficulty: 3,
    checkpoints: r.checkpoints.map((c) => {
      if (c.kind === 'CP3') return { ...c, item_id: cp3 };
      if (c.kind === 'CP6') return { ...c };
      return { ...c, item_id: own(c.kind), ...(c.truth_key ? { truth_key: own(c.kind) } : {}),
        ...(c.options ? { options: c.options.map((o, i) => ({ oid: optionId(own(c.kind), i), text: o.text })) } : {}) };
    }),
  };
}
/** A mock case's key: CP1's first option and CP5's fourth are right (as mockCaseRecord's options), for CASE-MOCK-A unless named. */
export function mockCaseKey(caseId = MOCK_CASE): CaseKey {
  return { case_id: caseId, truths: { CP2: TRUTH_QUERY, CP4: TRUTH_QUERY },
    choices: { CP1: { correct_oid: optionId(`${caseId}:CP1`, 0), explanation: EXPLANATION }, CP5: { correct_oid: optionId(`${caseId}:CP5`, 3), explanation: EXPLANATION } } };
}

export interface MockPatch extends CasePatch {
  /** The mock items written to sql/items/ with their keys (SCREEN_ITEM and MOCK_CP3 to start with), by ID, edited before they are written. */
  mockItems?: (i: Record<string, Record<string, any>>) => void;
  /** The case records written to content/sql/mocks/ (CASE-MOCK-A to start with), by case ID. */
  mockCases?: (c: Record<string, Record<string, any>>) => void;
  /** content/mocks.json as written: the shipped file with its case forms empty, unless edited here. */
  mocks?: (m: Record<string, any>) => void;
}

/** The case fixture plus the mock content above; each patch edits its part first. */
export async function makeMockFixture(patch: MockPatch = {}): Promise<CaseFixture> {
  const f = await makeCaseFixture({
    ...patch,
    keys: (ks) => { ks.push(mockCaseKey() as unknown as Record<string, any>); patch.keys?.(ks); },
    truths: (t) => { Object.assign(t, MOCK_TRUTHS); patch.truths?.(t); },
  });
  // The inbox case's CP3 item (a write item on the fixture's stores, sorted by city, no grain line) in a mock item's ID and use.
  const cp3 = inboxRecord().checkpoints.find((c) => c.kind === 'CP3')!.item_id!;
  const base = JSON.parse(await readFile(join(f.root, 'sql/items', `${cp3}.json`), 'utf8'));
  const keyBase = JSON.parse(await readFile(join(f.root, 'keys/sql', `${cp3}.json`), 'utf8'));
  const items: Record<string, Record<string, any>> = {
    [SCREEN_ITEM]: { ...base, id: SCREEN_ITEM, use: 'mock' },
    [MOCK_CP3]: { ...base, id: MOCK_CP3, use: 'mock' },
  };
  patch.mockItems?.(items);
  for (const [id, it] of Object.entries(items)) {
    await writeFile(join(f.root, 'sql/items', `${id}.json`), JSON.stringify(it));
    await writeFile(join(f.root, 'keys/sql', `${id}.json`), JSON.stringify({ ...keyBase, item_id: id }));
  }
  const cases: Record<string, Record<string, any>> = { [MOCK_CASE]: mockCaseRecord() as unknown as Record<string, any> };
  patch.mockCases?.(cases);
  await mkdir(join(f.root, 'sql/mocks'), { recursive: true });
  for (const [id, r] of Object.entries(cases)) await writeFile(join(f.root, 'sql/mocks', `${id}.json`), JSON.stringify(r));
  const mocks = JSON.parse(await readFile(join('content', 'mocks.json'), 'utf8')) as Record<string, any>;
  // The shipped case forms name the real mock cases (Task P2), which this root does not hold: they start empty here, as the screen
  // forms' real items are emptied by the tests that need it.
  mocks.case_round.forms = [];
  mocks.take_home.forms = [];
  patch.mocks?.(mocks);
  await writeFile(join(f.root, 'mocks.json'), JSON.stringify(mocks));
  return f;
}

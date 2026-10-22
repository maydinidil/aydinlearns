// schemas/mock.ts: content/mocks.json, the rules and forms of the four recruiter mocks (sprint 7, Task M1; design §2.1; S7-04, S7-09,
// S7-10, S7-14 to S7-16). The content store validates it when it loads (server/content.ts): a malformed file stops the load, naming the
// file. Content check C54 checks the forms against the mock items and mock cases they name (tools/check-content.ts).
import type { MockOpen } from '../core/envelope.ts';

/** The four recruiter mocks (design §2.1, stages 2 to 5), as a mock_open names them (D112). */
export type MockKind = MockOpen['mock'];
export const MOCK_KINDS: readonly MockKind[] = ['screen', 'knowledge', 'case_round', 'take_home'];
/** S7-04: the mocks that run fixed forms. The knowledge mock draws its questions at its start instead. */
export type FormMockKind = Exclude<MockKind, 'knowledge'>;
/** S7-01: the knowledge mock's form_id: its questions are drawn at the start, so it has no forms. */
export const KNOWLEDGE_FORM = 'KNOWLEDGE';

/** S7-09: a screen form: its six held-out items, in the order the run serves them (levels 1 to 4, then two of level 5). */
export interface ScreenForm { id: string; item_ids: string[] }
/** S7-14, S7-15: a case-round or take-home form: the held-out mock case it runs (content/sql/mocks/<case_id>.json). */
export interface CaseForm { id: string; case_id: string }
/** S7-09: 6 questions in 45 minutes, in screen mode; passed with 5 exactly right. */
export interface ScreenMock { questions: number; minutes: number; pass_correct: number; mode: 'screen'; forms: ScreenForm[] }
/** S7-10: 30 questions in 40 minutes, 20 Methodology and 10 GA4; passed at 80%. */
export interface KnowledgeMock { questions: number; minutes: number; pass_pct: number; per_section: { methodology: number; ga4: number } }
/** S7-14, S7-16: 45 minutes; passed with CP6's core rubric lines ticked and at least `auto_min` of CP1 to CP5 right. */
export interface CaseRoundMock { minutes: number; auto_min: number; core_rubric: string[]; forms: CaseForm[] }
/** S7-15, S7-16: as a case-round, in 120 minutes of wall time, closed `close_after_hours` after it opened; a late answer fails it. */
export interface TakeHomeMock { minutes: number; close_after_hours: number; auto_min: number; core_rubric: string[]; forms: CaseForm[] }
export interface MocksFile { screen: ScreenMock; knowledge: KnowledgeMock; case_round: CaseRoundMock; take_home: TakeHomeMock }

// ---- a mock's rules as its card gives them (GET /api/mocks): one declaration, which the server and the screens import (L105) ------------

/** S7-09: the screen mock's rules. */
export type ScreenRules = Omit<ScreenMock, 'forms'>;
/** S7-10: the knowledge mock's rules. */
export type KnowledgeRules = KnowledgeMock;
/** S7-14, S7-15: a case-round's or take-home's rules (`close_after_hours`: the take-home's only). */
export type CaseMockRules = Omit<CaseRoundMock, 'forms'> | Omit<TakeHomeMock, 'forms'>;
/** A mock's rules, as content/mocks.json gives them, without its forms. */
export type MockRules = ScreenRules | KnowledgeRules | CaseMockRules;

const rec = (r: unknown): Obj | null => (isObj(r) ? r : null);
export const isScreenRules = (r: unknown): r is ScreenRules =>
  typeof rec(r)?.questions === 'number' && typeof rec(r)?.minutes === 'number' && typeof rec(r)?.pass_correct === 'number';
export const isKnowledgeRules = (r: unknown): r is KnowledgeRules => typeof rec(r)?.pass_pct === 'number' && isObj(rec(r)?.per_section);
export const isCaseMockRules = (r: unknown): r is CaseMockRules =>
  typeof rec(r)?.minutes === 'number' && typeof rec(r)?.auto_min === 'number' && Array.isArray(rec(r)?.core_rubric);

/**
 * Codex F35, ruling S7-C34: the count of correct answers a run of `mock` needs under `rules`, which its mock_open records as `pass_correct`:
 * the screen mock's pass_correct; the knowledge mock's pass_pct of its questions, rounded up (24 of 30); a case mock's auto_min of CP1 to CP5.
 */
export function passCorrect(mock: MockKind, rules: MockRules): number {
  if (mock === 'screen') return (rules as ScreenRules).pass_correct;
  if (mock === 'knowledge') { const k = rules as KnowledgeRules; return Math.ceil((k.pass_pct * k.questions) / 100); }
  return (rules as CaseMockRules).auto_min;
}

/** The file's place under the content root. */
export const MOCKS_FILE = 'mocks.json';
/** S7-04: each fixed-form mock's form IDs. */
const FORM_ID: Readonly<Record<FormMockKind, { re: RegExp; example: string }>> = {
  screen: { re: /^SCREEN-[A-Z]$/, example: 'SCREEN-A' },
  case_round: { re: /^CASE-ROUND-[A-Z]$/, example: 'CASE-ROUND-A' },
  take_home: { re: /^TAKE-HOME-[A-Z]$/, example: 'TAKE-HOME-A' },
};
/** S7-08: the mock cases each case mock runs. */
const CASE_ID: Readonly<Record<'case_round' | 'take_home', { re: RegExp; example: string }>> = {
  case_round: { re: /^CASE-MOCK-[A-Z]$/, example: 'CASE-MOCK-A' },
  take_home: { re: /^CASE-TAKE-[A-Z]$/, example: 'CASE-TAKE-A' },
};
/** A rubric point's ID, as server/routes/cases.ts RUBRIC and CRAFT_RUBRIC name them. */
const POINT = /^[a-z][a-z_]*$/;
/** CP1 to CP5: the most a case's auto-graded checkpoints can give. */
const AUTO_CHECKPOINTS = 5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isWhole = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A screen form: its ID, and `questions` distinct items of its own (EX-MOCK-<form>-NN, S7-08). */
function checkScreenForm(f: unknown, at: string, questions: number | null, e: string[]): string | null {
  if (!isObj(f)) { e.push(`${at} must be an object with an id and item_ids`); return null; }
  const id = typeof f.id === 'string' && FORM_ID.screen.re.test(f.id) ? f.id : null;
  if (id === null) e.push(`${at}.id must look like ${FORM_ID.screen.example}`);
  const ids = f.item_ids;
  const listed = Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? ids as string[] : null;
  if (listed === null || (questions !== null && listed.length !== questions) || new Set(listed).size !== listed.length) {
    e.push(questions === null ? `${at}.item_ids must list item IDs, each once` : `${at}.item_ids must list ${questions} item IDs (screen.questions), each once`);
  }
  if (id !== null && listed !== null && !listed.every((x) => new RegExp(`^EX-MOCK-${id}-\\d{2}$`).test(x))) {
    e.push(`${at}.item_ids must name the form's own items, such as EX-MOCK-${id}-01`);
  }
  return id;
}

/** A case-round or take-home form: its ID, and the mock case it runs (S7-08). */
function checkCaseForm(f: unknown, at: string, kind: 'case_round' | 'take_home', e: string[]): { id: string | null; case_id: string | null } {
  if (!isObj(f)) { e.push(`${at} must be an object with an id and a case_id`); return { id: null, case_id: null }; }
  const id = typeof f.id === 'string' && FORM_ID[kind].re.test(f.id) ? f.id : null;
  if (id === null) e.push(`${at}.id must look like ${FORM_ID[kind].example}`);
  const caseId = typeof f.case_id === 'string' && CASE_ID[kind].re.test(f.case_id) ? f.case_id : null;
  if (caseId === null) e.push(`${at}.case_id must look like ${CASE_ID[kind].example}`);
  return { id, case_id: caseId };
}

/** The section's forms: each well formed, each form ID once, and (for the case mocks) each case run by one form. */
function forms(section: Obj, kind: FormMockKind, questions: number | null, e: string[]): void {
  if (!Array.isArray(section.forms)) { e.push(`${kind}.forms must be a list`); return; }
  const ids = new Set<string>();
  const cases = new Set<string>();
  section.forms.forEach((f: unknown, n) => {
    const at = `${kind}.forms[${n}]`;
    const got = kind === 'screen' ? { id: checkScreenForm(f, at, questions, e), case_id: null } : checkCaseForm(f, at, kind, e);
    if (got.id !== null) { if (ids.has(got.id)) e.push(`${at}.id repeats ${got.id}`); ids.add(got.id); }
    if (got.case_id !== null) { if (cases.has(got.case_id)) e.push(`${at}.case_id repeats ${got.case_id}`); cases.add(got.case_id); }
  });
}

function minutes(section: Obj, kind: string, e: string[]): void {
  if (!isPositive(section.minutes)) e.push(`${kind}.minutes must be a number above 0`);
}
function caseRules(section: Obj, kind: 'case_round' | 'take_home', e: string[]): void {
  minutes(section, kind, e);
  if (!(isWhole(section.auto_min, 0) && section.auto_min <= AUTO_CHECKPOINTS)) e.push(`${kind}.auto_min must be a whole number from 0 to ${AUTO_CHECKPOINTS}`);
  const lines = section.core_rubric;
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every((l) => typeof l === 'string' && POINT.test(l)) || new Set(lines).size !== lines.length) {
    e.push(`${kind}.core_rubric must list rubric point IDs such as next_step, each once`);
  }
}

/**
 * content/mocks.json (S7-09, S7-10, S7-14, S7-15). Runs on hand-written JSON: tolerates anything and returns messages, never throws. A
 * message names fields and IDs only. Whether a form's items and cases exist, and their levels, is content check C54's job.
 */
export function validateMocksFile(x: unknown): string[] {
  if (!isObj(x)) return ['mocks.json must be an object with screen, knowledge, case_round and take_home'];
  const e: string[] = [];
  if (Object.keys(x).some((k) => !(MOCK_KINDS as readonly string[]).includes(k))) e.push('mocks.json holds only screen, knowledge, case_round and take_home');
  for (const kind of MOCK_KINDS) if (!isObj(x[kind])) e.push(`${kind} must be an object`);
  const { screen, knowledge, case_round, take_home } = x;
  if (isObj(screen)) {
    const questions = isWhole(screen.questions, 1) ? screen.questions : null;
    if (questions === null) e.push('screen.questions must be a whole number of 1 or more');
    minutes(screen, 'screen', e);
    if (!isWhole(screen.pass_correct, 1)) e.push('screen.pass_correct must be a whole number of 1 or more');
    else if (questions !== null && screen.pass_correct > questions) e.push('screen.pass_correct must be at most screen.questions');
    if (screen.mode !== 'screen') e.push('screen.mode must be screen');
    forms(screen, 'screen', questions, e);
  }
  if (isObj(knowledge)) {
    if (!isWhole(knowledge.questions, 1)) e.push('knowledge.questions must be a whole number of 1 or more');
    minutes(knowledge, 'knowledge', e);
    if (!(typeof knowledge.pass_pct === 'number' && knowledge.pass_pct >= 0 && knowledge.pass_pct <= 100)) e.push('knowledge.pass_pct must be between 0 and 100');
    const p = knowledge.per_section;
    if (!(isObj(p) && isWhole(p.methodology, 0) && isWhole(p.ga4, 0) && p.methodology + p.ga4 === knowledge.questions)) {
      e.push('knowledge.per_section must give methodology and ga4 as whole numbers that add up to knowledge.questions');
    }
  }
  if (isObj(case_round)) {
    caseRules(case_round, 'case_round', e);
    forms(case_round, 'case_round', null, e);
  }
  if (isObj(take_home)) {
    caseRules(take_home, 'take_home', e);
    if (!isPositive(take_home.close_after_hours)) e.push('take_home.close_after_hours must be a number above 0');
    forms(take_home, 'take_home', null, e);
  }
  return e;
}

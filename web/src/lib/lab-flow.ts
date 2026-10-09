// web/src/lib/lab-flow.ts: the GA4 lab screens' pure helpers and text (sprint 5b, Task B3; design §8; D68, D69). View models only:
// the server grades and decides each lab's state.
import type { Lab, LabPart } from '../../../schemas/lab.ts';
import { ApiError } from '../api.ts';
import { fixedMonth, RANGE_PART, type LabState, type LabStatus, type PartOutcome } from '../../../server/labs.ts';

export const LABS_HREF = '#/ga4/labs';
export const labHref = (id: string): string => `#/ga4/lab/${encodeURIComponent(id)}`;
export const ANALYTICS_URL = 'https://analytics.google.com/';
export const LABS_TITLE = 'GA4 labs';
export const LABS_INTRO = 'Each lab is done in Google\'s GA4 demo account in another tab. Answers are checked by how they fit together and by a re-check a week later, not against stored numbers. The demo account guide is below the list.';
export const PATH_UNCONFIRMED = 'This menu path is not confirmed yet. If your menu differs, use the search bar at the top of GA4.';
export const LAST_28_FIRST = 'Choose Last 28 days, then type the dates GA4 shows into From and To';
export const NOTE_LABEL = 'Anything different from these steps? (optional)';
export const NOTE_MAX = 500;
export const CHECK_LABEL = 'Check my answers';
export const SELF_MATCH = 'My screen matches';
export const SELF_NO_MATCH = 'It does not';
export { RANGE_PART };
export const START_OVER = 'Answer it from the start instead';
export const START_OVER_NOTE = 'A new first answer replaces your last one. The re-check moves to a week after it.';
export const STATUS_LABEL = 'Lab status:';
export const ALL_LABS = 'All labs';
export const RECHECK_HINT = 'Re-check: read the same screen again.';
export const recheckHint = (from: string | null): string => (from ? `Re-check: read the same screen again from ${dayMonth(from)}. An earlier re-check does not count.` : RECHECK_HINT);
/** H-D3: a due re-check is a step in Today's GA4 plan (lib/today-flow.ts), naming the first due lab and how many more are due. */
export const recheckStepLabel = (title: string, more: number): string => `Re-check a lab: ${title}${more > 0 ? `, and ${more} more` : ''}`;
export const RECHECK_STEP_DETAIL = 'Read the same screen again, a week after your first answer.';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 2026-10-15 as "15 October". */
export const dayMonth = (date: string): string => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
/** 2026-09-15 as "15 September 2026". */
const dayMonthYear = (date: string): string => `${dayMonth(date)} ${date.slice(0, 4)}`;
/** 2026-09 as "September 2026". */
export const monthText = (month: string): string => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export type Tone = 'pass' | 'fail' | 'wait' | 'self';

/** The state chip: its words, and the style it takes. */
export function stateChip(s: Pick<LabStatus, 'state' | 'recheck_from'>): { text: string; className: string } {
  switch (s.state) {
    case 'new': return { text: 'New', className: '' };
    case 'recheck_waiting': return { text: s.recheck_from ? `Re-check from ${dayMonth(s.recheck_from)}` : 'Re-check waiting', className: 'learning' };
    case 'recheck_due': return { text: 'Re-check due', className: 'practising' };
    case 'done': return { text: 'Done', className: 'mastered' };
    case 'look_again': return { text: 'Look again', className: 'look-again' };
  }
}

/** The date to use in GA4, or null when the lab names none (or the server sent none). */
export function dateLine(lab: Pick<Lab, 'date'>, mode: 'first' | 'recheck', month: string | null, range: { from: string; to: string } | null): string | null {
  if (lab.date === 'fixed_month') return month ? monthText(month) : null;
  if (lab.date === 'last_28_days') return mode === 'recheck' && range ? `${dayMonthYear(range.from)} to ${dayMonthYear(range.to)}` : LAST_28_FIRST;
  return null;
}

/** A re-check shows only the re-check parts. */
export function shownParts(lab: Pick<Lab, 'parts'>, mode: 'first' | 'recheck'): LabPart[] {
  return mode === 'recheck' ? lab.parts.filter((p) => p.check === 'recheck_fixed' || p.check === 'recheck_range') : lab.parts;
}

/** A field's label is its question, whether or not the part has a short label (the label is for grading messages, not the field). */
export const partLabel = (p: Pick<LabPart, 'question'>): string => p.question;

/** The part a refusal names (a part ID, or the dates), when it names one. */
export function refusedPart(e: unknown): string | null {
  const id = e instanceof ApiError ? (e.body as { part_id?: unknown } | undefined)?.part_id : undefined;
  return typeof id === 'string' ? id : null;
}

/** The month a first answer reads today: the lab's fixed month, or null for a lab with no fixed month. */
export const firstMonth = (lab: Pick<Lab, 'date'>, today: string): string | null => (lab.date === 'fixed_month' ? fixedMonth(today) : null);

/** One part's result as the answer panel shows it. */
export function outcomeLine(o: PartOutcome, recheckFrom: string | null): { mark: string; text: string; tone: Tone } {
  switch (o.result) {
    case 'pass': return { mark: '✓', text: 'Right', tone: 'pass' };
    case 'fail': {
      const right = o.expected === undefined ? '' : ` Right answer: ${Array.isArray(o.expected) ? o.expected.join(', ') : o.expected}`;
      return { mark: '✗', text: `${o.message ?? 'Not right.'}${right}`, tone: 'fail' };
    }
    case 'pending': return { mark: '', text: recheckFrom ? `Re-check from ${dayMonth(recheckFrom)}` : 'Saved. The re-check waits for a first answer with every part right.', tone: 'wait' };
    case 'self_yes':
    case 'self_no': return { mark: '', text: 'Self-checked', tone: 'self' };
    case 'not_checked': return { mark: '', text: o.message ?? 'Not checked', tone: 'wait' };
  }
}

/** The guide opens while no lab has an answer yet. */
export const guideOpen = (labs: readonly { state: LabState }[]): boolean => labs.every((l) => l.state === 'new');

/** The labs whose re-check is due, in the server's order. */
export const dueRechecks = <T extends { state: LabState }>(labs: readonly T[]): T[] => labs.filter((l) => l.state === 'recheck_due');

export interface LabForm { values: Record<string, string | string[]>; self: Record<string, boolean>; from: string; to: string; note: string }
export interface LabAnswerBody {
  kind: 'first' | 'recheck';
  values: Record<string, string | string[]>;
  self?: Record<string, boolean>;
  range?: { from: string; to: string };
  /** The fixed month the screen showed, on a first answer to a fixed_month lab. */
  month?: string;
  note: string;
}

/** The start-over note shows on a first answer to a lab that already has a baseline. */
export const showStartOverNote = (loaded: Pick<LabStatus, 'baseline_date'>, mode: 'first' | 'recheck'): boolean => mode === 'first' && loaded.baseline_date !== null;

/** The POST body: a value for each shown part except a self-check part (which sends only its yes or no), and the dates on a first answer. */
export function answerBody(lab: Lab, mode: 'first' | 'recheck', f: LabForm, month: string | null = null): LabAnswerBody {
  const values: Record<string, string | string[]> = {};
  const self: Record<string, boolean> = {};
  for (const p of shownParts(lab, mode)) {
    if (p.check === 'self_rubric') {
      const said = f.self[p.id];
      if (said !== undefined) self[p.id] = said;
      continue;
    }
    const v = f.values[p.id];
    values[p.id] = p.answer === 'multi' ? (Array.isArray(v) ? v : []) : Array.isArray(v) ? v : (v ?? '').trim();
  }
  const body: LabAnswerBody = { kind: mode, values, note: f.note.trim() };
  if (mode === 'first') {
    body.self = self;
    if (lab.date === 'fixed_month' && month) body.month = month;
    if (lab.date === 'last_28_days') body.range = { from: f.from, to: f.to };
  }
  return body;
}

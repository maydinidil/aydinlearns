// server/labs.ts: GA4 lab grading and lab state (sprint 5b, Task B2; design §8; D68, D69, Ruling 1). Pure: no I/O, no clock.
// routes/labs.ts reads the log, asks the clock for today's Amsterdam date and calls these.
//
// A lab's demo data changes every day, so no read value is stored (E-023). A first answer is graded part by part:
// - structural: against the lab's key, as sameStructuralAnswer compares (the blind solver and the app agree);
// - consistency: by every rule that names the part, between values read off one screen (at_most, rate, member);
// - recheck_fixed and recheck_range: pending, until a re-check a week later reads them again;
// - self_rubric: the learner's own yes or no against the rubric.
// A re-check grades only the re-check parts, each against the baseline's value: numbers by the part's tolerance; choices and
// texts after trimming and ignoring case; multi as sets (Ruling 1). The baseline is the latest first answer to the lab's
// current version. A re-check counts from 7 Amsterdam days after the baseline; one sent earlier is logged and does not count.
// A part's expected answer comes from the key, for a structural part only, and only in the reply to an answer.
import { amsterdamDate } from '../core/time.ts';
import { isRecheck, sameStructuralAnswer, sameText, type Lab, type LabKey, type LabPart, type LabRule, type LabTolerance, type LabUnit } from '../schemas/lab.ts';
import type { LabAnswer, LabPartAnswer, LabPartResult } from '../schemas/log-ext.ts';

export const NUMBER_HELP = 'Type a number, for example 12,345 or 61.2';
/** A failed re-check part. It never shows the baseline's value. */
export const RECHECK_DIFFERS = 'This does not match your first answer. Check the dates and the steps, then read it again.';
/** A re-check counts from this many Amsterdam days after its baseline (D69). */
export const RECHECK_AFTER_DAYS = 7;

/** Floating point slack for a comparison at a tolerance's edge (1.3 - 1.0 is 0.30000000000000004), relative to the values. */
const EPS = 1e-9;
const slack = (...xs: number[]): number => EPS * Math.max(1, ...xs.map(Math.abs));

/**
 * A number as a learner types it off a GA4 screen. Outer spaces are trimmed; a leading € is dropped for a eur part and a trailing
 * % for a percent part. A comma between digit groups of three is a thousands separator (12,345). When both . and , appear, the
 * last one is the decimal mark and the other separates groups of three (1.234,5 and 1,234.5). One . followed by exactly three
 * digits after a 1 to 3 digit whole part (1.234) could be either, so it is refused. A leading - is read as a minus sign.
 */
export function parseLabNumber(s: string, unit: LabUnit): { ok: true; value: number } | { ok: false; message: string } {
  const refuse = { ok: false as const, message: NUMBER_HELP };
  if (typeof s !== 'string') return refuse;
  let t = s.trim();
  if (unit === 'eur' && t.startsWith('€')) t = t.slice(1).trim();
  if (unit === 'percent' && t.endsWith('%')) t = t.slice(0, -1).trim();
  const negative = t.startsWith('-');
  const body = negative ? t.slice(1) : t;
  let plain: string | null = null;
  if (/^\d+(\.\d+)?$/.test(body)) {
    if (/^[1-9]\d{0,2}\.\d{3}$/.test(body)) return { ok: false, message: `Is that ${body.replace('.', '')} or ${body}? Type it without a separator.` };
    plain = body;
  } else if (/^\d{1,3}(,\d{3})+$/.test(body)) {
    plain = body.replaceAll(',', '');
  } else if (body.includes('.') && body.includes(',')) {
    const decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    if (new RegExp(`^\\d{1,3}(\\${group}\\d{3})+\\${decimal}\\d+$`).test(body)) plain = body.replaceAll(group, '').replace(decimal, '.');
  }
  if (plain === null) return refuse;
  const value = Number(plain);
  return Number.isFinite(value) ? { ok: true, value: negative ? -value : value } : refuse;
}

/** The fixed month a fixed_month lab reads (YYYY-MM): last month from the 5th of this month on, the month before until then. */
export function fixedMonth(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) - (d >= 5 ? 1 : 2);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Whether a re-check's number is close enough to the first answer's (07 §1.5). */
export function withinTolerance(first: number, again: number, t: LabTolerance): boolean {
  const diff = Math.abs(again - first);
  if ('relative_pct' in t) return diff <= Math.abs(first) * t.relative_pct / 100 + slack(first, again);
  if ('points' in t) return diff <= t.points + slack(first, again, t.points);
  return again === first;
}

export interface PartOutcome { part_id: string; result: LabPartResult; expected?: string | string[]; message: string | null }

type Values = Record<string, unknown>;
/** A number part's value: a number, or text parseLabNumber reads. Null when there is none. */
function numberOf(lab: Lab, id: string, values: Values): number | null {
  const v = values[id];
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const parsed = parseLabNumber(v, lab.parts.find((p) => p.id === id)?.unit ?? 'count');
  return parsed.ok ? parsed.value : null;
}
const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const listOf = (v: unknown): string[] | null => (Array.isArray(v) && v.every((s) => typeof s === 'string') ? v.map((s) => s.trim()) : null);

/** A number as a message shows it: grouped in threes, as GA4 shows it in English. */
const shown = (n: number): string => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 }).format(n);
const decimalsOf = (n: number): number => (String(n).split('.')[1] ?? '').length;

/** The parts a rule compares. A member rule's `value` is one of its set's options, not a part. */
export function ruleParts(r: LabRule): string[] {
  if (r.kind === 'at_most') return [r.part, r.of];
  if (r.kind === 'rate') return [r.num, r.den, r.pct];
  return [r.set, r.flag];
}

/** A part as a message names it: its label when it has one, else its ID. */
const nameOf = (lab: Lab, id: string): string => lab.parts.find((p) => p.id === id)?.label ?? id;

/** M-C1-1: what an at_most failure asks the learner to check, by the lab's date: the row, and the month or the dates it reads. */
const SAME_READ: Readonly<Record<Lab['date'], string>> = {
  fixed_month: 'the same row and the same month.', last_28_days: 'the same row and the same dates.', none: 'the same row.',
};

interface RuleOutcome { result: 'pass' | 'fail' | 'not_checked'; message: string | null }
/** One rule over the values read. A value the rule needs and does not have leaves it not checked. */
function checkRule(lab: Lab, r: LabRule, values: Values): RuleOutcome {
  if (r.kind === 'at_most') {
    const [a, b] = [numberOf(lab, r.part, values), numberOf(lab, r.of, values)];
    if (a === null || b === null) return { result: 'not_checked', message: null };
    return a <= b + slack(a, b)
      ? { result: 'pass', message: null }
      : { result: 'fail', message: `${nameOf(lab, r.part)} cannot be more than ${nameOf(lab, r.of)}: check you read ${SAME_READ[lab.date]}` };
  }
  if (r.kind === 'rate') {
    const [num, den, pct] = [numberOf(lab, r.num, values), numberOf(lab, r.den, values), numberOf(lab, r.pct, values)];
    if (num === null || den === null || pct === null) return { result: 'not_checked', message: null };
    if (den === 0) return { result: 'not_checked', message: `${nameOf(lab, r.den)} is 0, so ${nameOf(lab, r.pct)} cannot be checked.` };
    const computed = (100 * num) / den;
    if (Math.abs(computed - pct) <= r.points + slack(computed, pct, r.points)) return { result: 'pass', message: null };
    const places = Math.min(3, Math.max(1, decimalsOf(r.points)));
    return { result: 'fail', message: `${nameOf(lab, r.pct)} should be about ${computed.toFixed(places)}% from your two numbers (${shown(num)} / ${shown(den)}).` };
  }
  const set = listOf(values[r.set]);
  const flag = textOf(values[r.flag]);
  if (set === null || flag === null) return { result: 'not_checked', message: null };
  const inSet = set.some((s) => sameText(s, r.value));
  return inSet === sameText(flag, 'Yes') ? { result: 'pass', message: null } : { result: 'fail', message: `Your two answers disagree about ${r.value}.` };
}

/** The value of a part as an answer: a number, a trimmed text, or a list of trimmed texts. */
function answerOf(lab: Lab, p: LabPart, values: Values): string | number | string[] | null {
  if (p.answer === 'number') return numberOf(lab, p.id, values);
  if (p.answer === 'multi') return listOf(values[p.id]);
  return textOf(values[p.id]);
}

/**
 * A first answer, part by part, in the lab's order. `values` maps part IDs to the learner's values (a number part's as a number
 * or as text parseLabNumber reads; a multi part's as a list); `self` maps each self_rubric part to the learner's yes or no.
 * A consistency part takes the result of every rule that names it: it passes when all pass and fails with each failing rule's
 * message. `expected`, the key's answer, is set on a structural part only.
 */
export function gradeFirst(lab: Lab, key: LabKey, values: Record<string, unknown>, self: Record<string, boolean>): PartOutcome[] {
  const rules = lab.rules.map((r) => ({ names: ruleParts(r), outcome: checkRule(lab, r, values) }));
  return lab.parts.map((p): PartOutcome => {
    if (p.check === 'structural') {
      const want = key.structural[p.id];
      if (want === undefined) return { part_id: p.id, result: 'not_checked', message: null };
      const got = p.answer === 'multi' ? listOf(values[p.id]) : textOf(values[p.id]);
      const result = got !== null && sameStructuralAnswer(p, got, want) ? 'pass' : 'fail';
      return { part_id: p.id, result, expected: Array.isArray(want) ? [...want] : want, message: null };
    }
    if (p.check === 'consistency') {
      const mine = rules.filter((r) => r.names.includes(p.id)).map((r) => r.outcome);
      const failed = mine.filter((o) => o.result === 'fail');
      if (failed.length) return { part_id: p.id, result: 'fail', message: failed.map((o) => o.message).join(' ') };
      const unchecked = mine.filter((o) => o.result === 'not_checked');
      if (unchecked.length || mine.length === 0) {
        const said = unchecked.map((o) => o.message).filter((m) => m !== null);
        return { part_id: p.id, result: 'not_checked', message: said.length ? said.join(' ') : null };
      }
      return { part_id: p.id, result: 'pass', message: null };
    }
    if (p.check === 'self_rubric') {
      const said = self[p.id];
      return { part_id: p.id, result: said === true ? 'self_yes' : said === false ? 'self_no' : 'not_checked', message: null };
    }
    return { part_id: p.id, result: 'pending', message: null };
  });
}

/** Text compared at a re-check: runs of spaces collapsed, spaces around "/" removed, trimmed, case ignored. */
export const sameRecheckText = (a: string, b: string): boolean => {
  const norm = (t: string): string => t.replace(/ +/g, ' ').replace(/ ?\/ ?/g, '/').trim().toLowerCase();
  return norm(a) === norm(b);
};

/**
 * A re-check: only the re-check parts, in the lab's order, each compared with the baseline's value. A number by the part's
 * tolerance (exact when it has none); a choice or a text after trimming and ignoring case; a multi as a set. A part either side
 * has no value for is not checked.
 */
export function gradeRecheck(lab: Lab, baseline: LabAnswer, values: Record<string, unknown>): PartOutcome[] {
  const before = new Map<string, LabPartAnswer['value']>(baseline.parts.map((p) => [p.part_id, p.value]));
  return lab.parts.filter((p) => isRecheck(p.check)).map((p): PartOutcome => {
    const first = before.get(p.id) ?? null;
    const again = answerOf(lab, p, values);
    if (first === null || again === null) return { part_id: p.id, result: 'not_checked', message: null };
    let same: boolean;
    if (p.answer === 'number') same = typeof first === 'number' && typeof again === 'number' && withinTolerance(first, again, p.tolerance ?? { exact: true });
    else if (p.answer === 'multi') same = Array.isArray(first) && Array.isArray(again) && sameStructuralAnswer(p, first, again);
    else same = typeof first === 'string' && typeof again === 'string' && sameRecheckText(first, again);
    return same ? { part_id: p.id, result: 'pass', message: null } : { part_id: p.id, result: 'fail', message: RECHECK_DIFFERS };
  });
}

/** GET /api/labs (the views are the routes' reply shapes, here so the web project can import them without the server). */
export interface LabsView {
  guide: { title: string; body_md: string } | null;
  labs: ({ id: string; title: string; topic_id: string; concept_id: string; interview_relevant: boolean } & LabStatus)[];
}
/** GET /api/labs/:id. */
export interface LabView {
  lab: Lab; status: LabStatus; mode: 'first' | 'recheck';
  /** The fixed month this mode reads (YYYY-MM), or null. */
  month: string | null;
  /** The baseline's date range on a re-check of a last_28_days lab, else null: a first answer types the dates GA4 shows. */
  range: { from: string; to: string } | null;
}
/** POST /api/labs/:id/answer. `notice` is set on a re-check sent before it counts. */
export interface LabAnswerReply { outcomes: PartOutcome[]; status: LabStatus; notice: string | null }

/** The part_id a date refusal carries, so the screen shows it beside the From and To inputs. */
export const RANGE_PART = 'range';
export type LabState = 'new' | 'recheck_waiting' | 'recheck_due' | 'done' | 'look_again';
/**
 * A lab's state on `today`. `baseline_date` is the baseline's Amsterdam date; `recheck_from`, for a lab with a re-check part, the
 * date a re-check counts from (the baseline's date + 7); `month` and `range` are what the baseline read. All null when new.
 */
export interface LabStatus { lab_id: string; state: LabState; baseline_date: string | null; recheck_from: string | null; month: string | null; range: { from: string; to: string } | null }

/** A YYYY-MM-DD date `n` calendar days later. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const dateOf = (a: LabAnswer): string => amsterdamDate(new Date(a.ts));
/** The latest of these answers by time; of two at the same time, the one logged later. */
function latest(xs: readonly LabAnswer[]): LabAnswer | null {
  let best: LabAnswer | null = null;
  for (const a of xs) if (best === null || a.ts >= best.ts) best = a;
  return best;
}
/** This lab's answers to its current version. An answer to an older version is ignored. */
const answersTo = (lab: Lab, answers: readonly LabAnswer[]): LabAnswer[] => answers.filter((a) => a.lab_id === lab.id && a.lab_version === lab.version);

/** The baseline: the latest first answer to the lab's current version, or null. */
export function labBaseline(lab: Lab, answers: readonly LabAnswer[]): LabAnswer | null {
  return latest(answersTo(lab, answers).filter((a) => a.kind === 'first'));
}

interface Evaluated { status: LabStatus; byRecheck: boolean }
function evaluate(lab: Lab, answers: readonly LabAnswer[], today: string): Evaluated {
  const mine = answersTo(lab, answers);
  const baseline = latest(mine.filter((a) => a.kind === 'first'));
  if (!baseline) return { status: { lab_id: lab.id, state: 'new', baseline_date: null, recheck_from: null, month: null, range: null }, byRecheck: false };
  const baseline_date = dateOf(baseline);
  const hasRecheck = lab.parts.some((p) => isRecheck(p.check));
  const from = addDays(baseline_date, RECHECK_AFTER_DAYS);
  const at = (state: LabState, byRecheck = false): Evaluated => ({ byRecheck, status: {
    lab_id: lab.id, state, baseline_date, recheck_from: hasRecheck ? from : null, month: baseline.month ?? null,
    range: baseline.range ? { from: baseline.range.from, to: baseline.range.to } : null,
  } });
  if (baseline.parts.some((p) => p.result === 'fail' || p.result === 'self_no')) return at('look_again');
  if (!hasRecheck) return at('done');
  const counted = latest(mine.filter((a) => a.kind === 'recheck' && dateOf(a) >= from));
  if (counted) return at(counted.parts.length > 0 && counted.parts.every((p) => p.result === 'pass') ? 'done' : 'look_again', true);
  return at(today >= from ? 'recheck_due' : 'recheck_waiting', true);
}

/**
 * A lab's state on `today` (an Amsterdam date) from every lab answer logged. No first answer: new. A fail or a self_no in the
 * baseline: look_again. No re-check part: done. Then the latest re-check dated 7 or more Amsterdam days after the baseline
 * decides: all pass is done, else look_again. Without one, the re-check is due from the baseline's date + 7, and waits until then.
 */
export function labStatus(lab: Lab, answers: readonly LabAnswer[], today: string): LabStatus {
  return evaluate(lab, answers, today).status;
}

/** What the lab screen offers first: a re-check while one waits, is due, or failed; a first answer otherwise. */
export function suggestedMode(lab: Lab, answers: readonly LabAnswer[], today: string): 'first' | 'recheck' {
  const { status, byRecheck } = evaluate(lab, answers, today);
  return byRecheck && status.state !== 'done' ? 'recheck' : 'first';
}

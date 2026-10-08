// server/choice/grade.ts: grading a multiple-choice answer or a typed number on the server (design §5 "Typed answers";
// D15; E-143). Pure: the routes look up the item and its key, and log what this returns.
import type { ChoiceItem, ChoiceKey, TypedSpec } from '../../schemas/choice.ts';

/** Logged on every choice attempt. Bump it whenever pass or fail or the diagnosis changes (Global Constraints). */
export const CHOICE_GRADER_VERSION = 'choice.2';
/** E-143: a share typed where a percentage was asked, or the reverse. */
export const PERCENT_SCALE_ERROR = 'ERR-LOG-21';

export interface ChoiceGrade { correct: boolean; error_ids: string[] }
export type ParsedTyped = { ok: true; value: number } | { ok: false; message: string };

/** Plain refusals (Review Focus 5). None names the expected answer, and a refused answer is not an attempt. */
export const TYPED_REFUSALS = {
  empty: 'Type a number first.',
  oneMark: 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.',
  eNotation: 'Write the number out in full, for example 1000 instead of 1e3.',
  spaces: 'Leave out the spaces inside the number.',
  unit: 'Type only the number, without the unit.',
  notPercent: 'This answer is not a percentage. Type the number without %.',
  whole: 'This answer is a whole number. Type it without decimals.',
  notNumber: 'That is not a number. Type digits with a decimal point or comma, for example 12.5.',
} as const;
const MAX_LENGTH = 40;

/**
 * The chosen option against the key. A wrong option names the misconception it stands for, when it has one. `item` is a GA4 or
 * Methodology item, or an SQL choice item's sqlChoiceShape (S3-14): only its ID and options are read.
 */
export function gradeChoice(item: Pick<ChoiceItem, 'id' | 'options'>, key: ChoiceKey, chosen: string): ChoiceGrade {
  if (key.correct_oid === undefined) throw new Error(`The key of ${item.id} has no correct option.`);
  const option = item.options.find((o) => o.oid === chosen);
  if (!option) throw new Error(`${chosen} is not one of the options of ${item.id}.`);
  if (chosen === key.correct_oid) return { correct: true, error_ids: [] };
  return { correct: false, error_ids: option.misconception_id ? [option.misconception_id] : [] };
}

/**
 * D15: a number as a person types it. Accepted: spaces around it, a decimal point or a decimal comma, a space between
 * groups of three digits (1 234,5), a leading + or minus sign, and a trailing % (with or without a space) when the
 * answer is a percentage. A count (S4-14) also takes one thousands separator, comma or point, per group of three digits
 * (1,000 or 12.345.678). Refused with a plain message: an empty answer, two decimal marks or a thousands separator
 * on any other kind (1.234,5 is ambiguous), e notation, other spaces, a currency sign, a % on an answer that is not a percentage, decimals on
 * a count, and anything else that is not a number.
 */
export function parseTyped(text: string, spec: TypedSpec): ParsedTyped {
  const refuse = (message: string): ParsedTyped => ({ ok: false, message });
  let s = text.replace(/[    ]/g, ' ').trim();     // no-break and thin spaces, as Dutch formatting uses
  if (s === '') return refuse(TYPED_REFUSALS.empty);
  if (s.length > MAX_LENGTH) return refuse(TYPED_REFUSALS.notNumber);
  let percent = false;
  if (s.endsWith('%')) { percent = true; s = s.slice(0, -1).trimEnd(); }
  s = s.replace(/^−/, '-');                                          // a typographic minus sign
  if (/[€$£]/.test(s)) return refuse(TYPED_REFUSALS.unit);
  if (/\d[eE][+-]?\d/.test(s)) return refuse(TYPED_REFUSALS.eNotation);
  const sign = s.startsWith('-') || s.startsWith('+') ? s[0] : '';
  let body = s.slice(sign.length);
  const whole = spec.precision === 'count';
  // S4-14: a whole-number answer may use one thousands separator, a comma or a point, before every group of three digits.
  if (whole && /^[1-9]\d{0,2}(,\d{3})+$|^[1-9]\d{0,2}(\.\d{3})+$/.test(body)) body = body.replace(/[.,]/g, '');
  else if (whole && /^\d+,\d{2,}$/.test(body)) return refuse(TYPED_REFUSALS.whole);   // P-7a: 1,00 or 1,0000, a comma that is not a thousands group, is refused; a dot there stays a decimal point (12.00 is 12)
  if (/[.,].*[.,]/.test(body)) return refuse(TYPED_REFUSALS.oneMark);
  if (/\s/.test(body)) {
    if (!/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(body)) return refuse(TYPED_REFUSALS.spaces);
    body = body.replaceAll(' ', '');
  }
  if (!/^(\d+([.,]\d+)?|[.,]\d+)$/.test(body)) return refuse(TYPED_REFUSALS.notNumber);
  const value = Number(sign + body.replace(',', '.'));
  if (!Number.isFinite(value)) return refuse(TYPED_REFUSALS.notNumber);
  if (percent && spec.scale !== 'percent') return refuse(TYPED_REFUSALS.notPercent);
  if (spec.precision === 'count' && !Number.isInteger(value)) return refuse(TYPED_REFUSALS.whole);
  return { ok: true, value };
}

/**
 * D15: right within half a unit of the last decimal asked, plus 1e-9. A wrong ratio that is off by exactly a factor of 100,
 * judged the same way at the larger of the two scales (the answer times 100 against the key, or the answer against the
 * key times 100), is the percent-scale mistake, ERR-LOG-21 (design §5, E-143). Money and counts are never diagnosed with
 * it: euros 100 times off are cents, not a percentage.
 */
export function gradeTyped(value: number, expected: number, spec: TypedSpec): ChoiceGrade {
  const tolerance = 0.5 * 10 ** -spec.decimals + 1e-9;
  if (Math.abs(value - expected) <= tolerance) return { correct: true, error_ids: [] };
  const scaleSlip = spec.precision === 'ratio'
    && (Math.abs(value * 100 - expected) <= tolerance || Math.abs(value - expected * 100) <= tolerance);
  return { correct: false, error_ids: scaleSlip ? [PERCENT_SCALE_ERROR] : [] };
}

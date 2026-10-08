// web/src/lib/cp4-flow.ts: the words around an opener's typed CP4 (Task C7). Pure, so tests/web/cp4-flow.test.ts can check them.
import type { Cp4Result, TypedView } from '../api.ts';

const decimalsText = (n: number): string => (n === 0 ? 'a whole number' : n === 1 ? '1 decimal' : `${n} decimals`);

/** What a typed answer looks like: its scale, its unit and the decimals the prompt asks for (D15). */
export function cp4Hint(t: TypedView): string {
  if (t.precision === 'count') return `Type a whole number${t.unit_label ? ` (${t.unit_label})` : ''}.`;
  const scale = t.scale === 'percent' ? 'a percentage' : t.scale === 'eur' ? 'an amount in euros' : 'a number';
  return `Type ${scale} with ${decimalsText(t.decimals)}. A decimal point or a decimal comma both work.`;
}

/**
 * The hint under a case checkpoint's prompt, without any sentence the prompt already says ("Type a whole number." twice, finding 26).
 * Null when nothing is left to say.
 */
export function cp4HintFor(prompt: string, t: TypedView): string | null {
  const said = prompt.toLowerCase();
  const core = (sentence: string): string => sentence.replace(/\s*\(.*$/, '').replace(/\.$/, '').toLowerCase();
  const left = cp4Hint(t).split(/(?<=\.) /).filter((sentence) => !said.includes(core(sentence)));
  return left.length ? left.join(' ') : null;
}

/** A typed value as the item asks for it: its decimals, and the unit after it (no space before %). Display only (finding 36). */
export function typedValueText(value: number | undefined, t: TypedView | null): string {
  if (value === undefined) return '';
  const shown = t ? value.toFixed(t.decimals) : String(value);
  const unit = t?.unit_label === '%' ? '%' : t?.unit_label ? ` ${t.unit_label}` : '';
  return `${shown}${unit}`;
}
/** What to do first, shown where the confidence row will appear (finding 35). */
export const ANSWER_FIRST = { typed: 'Type your answer, then pick how sure you are.', mcq: 'Pick an answer, then say how sure you are.' } as const;

/** The lines shown after an answer. The true value appears only when the answer was wrong; the server sends it after logging. */
export function cp4Feedback(r: Cp4Result, t: TypedView): string[] {
  if (r.correct) return ['Right.'];
  const shown = r.value.toFixed(t.decimals);          // the decimals the question asked for, so 340 reads 340.00
  const unit = t.unit_label === '%' ? '%' : t.unit_label ? ` ${t.unit_label}` : '';
  const lines = ['Not quite.', `The answer is ${shown}${unit}.`];
  if (r.error_ids.includes('ERR-LOG-21')) lines.push('Your answer is 100 times off. Check whether the question asks for a percentage or a share.');
  return lines;
}

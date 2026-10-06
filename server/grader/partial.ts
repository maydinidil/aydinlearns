// server/grader/partial.ts
import type { PartialScore } from './types.ts';

/** Design §5 partial credit: shown and logged, never used for scheduling or mastery. */
/** A wrong row order (ERR-LOG-18) costs 20 points, so a failed attempt never shows 100 (owner, 2026-10-03). */
export const ORDER_PENALTY = 20;

export function partialScore(x: { shapeOk: boolean; rowsEqual: boolean; keysUnique: boolean; matched: number; learnerRows: number; keyRows: number; edgePassed: boolean; orderWrong?: boolean }): PartialScore {
  const shape = x.shapeOk ? 20 : 0;
  // After a shape failure the caller works rowsEqual and keysUnique out on the columns that map (sprint 2), so
  // Grain no longer needs Shape; a shape failure with nothing mapped passes false for both.
  const grain = x.rowsEqual && x.keysUnique ? 20 : 0;
  const of = Math.max(x.learnerRows, x.keyRows);
  // Review Focus 4: an empty expected result gives 40 only when the learner's is empty too.
  const values = of === 0 ? 40 : Math.round((40 * x.matched) / of);
  const edge = x.edgePassed ? 20 : 0;
  const sum = shape + grain + values + edge;
  if (x.orderWrong) return { shape, grain, values, edge, total: Math.max(0, sum - ORDER_PENALTY), valuesDetail: { matched: x.matched, of }, orderWrong: true };
  return { shape, grain, values, edge, total: sum, valuesDetail: { matched: x.matched, of } };
}

// web/src/lib/tutor-budget.ts: the tutor's daily budget field in Settings (D98, T-06; review T8, I3). Save sends only a value the learner
// meant: an empty field is "nothing set" (the $1 default); input the browser cannot read, and values outside the range, are refused here
// with the server's own line, before anything is sent.

/** T-06: the range Settings takes. The web cannot import server/tutor/spend.ts, so these copy it (a test pins them to it). */
export const MIN_CAP_USD = 0.05;
export const MAX_CAP_USD = 20;
/** The server's own line for a refused budget (settingProblem in server/app.ts). */
export const BUDGET_PROBLEM = 'Use a daily budget from 0.05 to 20 US dollars.';
export type BudgetCheck = { ok: true; value: number | null } | { ok: false; problem: string };

/**
 * The field's text and whether it holds input the browser cannot read (`validity.badInput`). A number input reports such input ("0,5" in
 * an English browser, or "1e") as an empty value, so an empty value is "nothing set" only when badInput is false.
 */
export function budgetToSave(text: string, badInput: boolean): BudgetCheck {
  if (badInput) return { ok: false, problem: BUDGET_PROBLEM };
  if (text.trim() === '') return { ok: true, value: null };
  const value = Number(text);
  return Number.isFinite(value) && value >= MIN_CAP_USD && value <= MAX_CAP_USD ? { ok: true, value } : { ok: false, problem: BUDGET_PROBLEM };
}

/** T-22 (block P): the value `tutor_daily_cap_usd` takes for "No daily limit". */
export const NO_LIMIT = 'none';
export type LimitCheck = { ok: true; value: number | null | typeof NO_LIMIT } | { ok: false; problem: string };
/** The daily limit's Save: "No daily limit" ticked sends "none" and the field is not read; otherwise the budget checks above. */
export const limitToSave = (text: string, badInput: boolean, noLimit: boolean): LimitCheck =>
  (noLimit ? { ok: true, value: NO_LIMIT } : budgetToSave(text, badInput));
/** The field's text for the saved limit: empty when there is none (null in the status). */
export const capText = (cap: number | null): string => (cap === null ? '' : String(cap));
/**
 * Review P M3: whether a status read again resets the budget field and its "No daily limit" tick: on the first status (`before`
 * undefined) and when the cap changed. Saving the switch, a model, an effort or a key reads the status again but leaves an unsaved
 * budget edit as typed.
 */
export const resetsBudget = (before: number | null | undefined, cap: number | null): boolean => before === undefined || before !== cap;

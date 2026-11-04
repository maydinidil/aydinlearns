// schemas/choice-types.ts: the choice types that schemas/item.ts needs too (S3-13). They live here, with no runtime code but one
// constant list (S9-06's CODE_LANGS), because schemas/choice.ts imports node:crypto and the browser's build checks schemas/item.ts.
// schemas/choice.ts re-exports them, so every other file keeps importing them from there.

/** A small result table, as an SQL predict_result option shows it (S3-13): the cells as the result table shows them. */
export interface OptionTable { columns: string[]; rows: (string | number | null)[][] }
/** S9-06: the dialects a fixed_choice option's code is written in. */
export type CodeLang = 'bigquery' | 'duckdb';
export const CODE_LANGS: readonly CodeLang[] = ['bigquery', 'duckdb'];
/**
 * S9-06: a fixed_choice option's code block, shown under its text as an SQL code block captioned by its dialect. The app never runs it;
 * content check C57 prepares a duckdb one on the item's schema.
 */
export interface OptionCode { lang: CodeLang; sql: string }
/**
 * An option in source order. `misconception_id` names the mistake a distractor stands for; null for the right one. `table`:
 * an SQL predict_result option's result table (S3-13), never on any other option. `code`: a fixed_choice option's code block (S9-06),
 * never on any other option.
 */
export interface ChoiceOption { oid: string; text: string; misconception_id: string | null; table?: OptionTable; code?: OptionCode }
/**
 * How a typed number is asked for (design §5 "Typed answers", D15). `scale` is the scale the key's value and the learner's
 * answer are both in: 12.5 for 12.5%. `decimals` is the last decimal the prompt asks for.
 */
export interface TypedSpec { precision: 'money' | 'ratio' | 'count'; scale: 'percent' | 'plain' | 'eur'; decimals: number; unit_label: string }

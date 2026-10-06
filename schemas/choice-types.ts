// schemas/choice-types.ts: the choice types that schemas/item.ts needs too (S3-13). They live here, with no runtime code,
// because schemas/choice.ts imports node:crypto and the browser's build checks schemas/item.ts. schemas/choice.ts re-exports
// them, so every other file keeps importing them from there.

/** A small result table, as an SQL predict_result option shows it (S3-13): the cells as the result table shows them. */
export interface OptionTable { columns: string[]; rows: (string | number | null)[][] }
/**
 * An option in source order. `misconception_id` names the mistake a distractor stands for; null for the right one. `table`:
 * an SQL predict_result option's result table (S3-13), never on any other option.
 */
export interface ChoiceOption { oid: string; text: string; misconception_id: string | null; table?: OptionTable }
/**
 * How a typed number is asked for (design §5 "Typed answers", D15). `scale` is the scale the key's value and the learner's
 * answer are both in: 12.5 for 12.5%. `decimals` is the last decimal the prompt asks for.
 */
export interface TypedSpec { precision: 'money' | 'ratio' | 'count'; scale: 'percent' | 'plain' | 'eur'; decimals: number; unit_label: string }

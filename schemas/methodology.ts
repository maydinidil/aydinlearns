// schemas/methodology.ts (design §9). The correct option or value and the explanation live in content/keys/methodology/<id>.json.
import { checkChoiceItem, type ChoiceConcept, type ChoiceItemBase, type ChoiceKey } from './choice.ts';

export type MethodologyConcept = ChoiceConcept;
/** Multiple choice ("which metric answers this question?") or a typed number (compute the lift, the margin from a markup). */
export interface MethodologyItem extends ChoiceItemBase { section: 'methodology' }
export type MethodologyKey = ChoiceKey;

export function validateMethodologyItem(x: unknown): string[] {
  return checkChoiceItem(x, 'methodology', ['mcq', 'typed']);
}

// schemas/ga4.ts (design §8; E-110, E-120). The correct option and the explanation live in content/keys/ga4/<id>.json.
import { checkChoiceItem, GA4_CONCEPT, GA4_TOPIC, type ChoiceConcept, type ChoiceItemBase, type ChoiceKey } from './choice.ts';

/** A 06 concept (parent_id null) or a 10 concept, a child of a 06 concept whose card it is rated on (E-110). */
export type Ga4Concept = ChoiceConcept;
export interface Ga4Item extends ChoiceItemBase {
  section: 'ga4';
  kind: 'mcq';
  typed: null;
  legacy_id: string | null;
  /** The 06 parent of `concept_id` when that is a 10 concept, else null. The item's records target it (S2-74). */
  parent_id: string | null;
  topic_id: string;
  exam_relevance: 'core' | 'new_2026' | 'reference_360';
}
export type Ga4Key = ChoiceKey;

const RELEVANCE = ['core', 'new_2026', 'reference_360'];

export function validateGa4Item(x: unknown): string[] {
  const e = checkChoiceItem(x, 'ga4', ['mcq']);
  const o = (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  if (!(o.parent_id === null || (typeof o.parent_id === 'string' && GA4_CONCEPT.test(o.parent_id)))) e.push('parent_id must be a GA4 concept ID or null');
  else if (o.parent_id !== null && o.parent_id === o.concept_id) e.push('parent_id must differ from concept_id');
  if (typeof o.topic_id !== 'string' || !GA4_TOPIC.test(o.topic_id)) e.push('topic_id must be a GA4 topic such as T-GA4-01');
  if (!(o.legacy_id === null || typeof o.legacy_id === 'string')) e.push('legacy_id must be a string or null');
  if (!RELEVANCE.includes(o.exam_relevance as string)) e.push('exam_relevance must be core, new_2026 or reference_360');
  return e;
}

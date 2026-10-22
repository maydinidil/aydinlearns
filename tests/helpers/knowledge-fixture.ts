// tests/helpers/knowledge-fixture.ts: a content root for the knowledge mock (sprint 7 Part 2, Task N1; S7-10, S7-11), on the SQL content
// fixture (tests/helpers/content-fixture.ts). Every concept, question, option and explanation here is invented.
// - GA4: two parents on topics T-GA4-01 and T-GA4-02. The GA4 exam pool (ga4/held-out.json): 8 held-out items, Q-GA4-H01 to -H08, 4 per
//   topic. The knowledge pool (ga4/knowledge-pool.json): 12 held-out items, Q-GA4-K01 to -K12, 8 on T-GA4-01 and 4 on T-GA4-02, where K11
//   and K12 share an enemy group. 4 practice items. ga4/exam.json: small blueprints (a half-mock of 4, a full mock of 8, 21-day retakes).
// - Methodology: two metrics on topics T-MET-RETAIL and T-MET-STAT. Held out (methodology/held-out.json): 18 on T-MET-RETAIL (Q-MET-HA01 to
//   -HA18, where HA01 and HA02 share an enemy group) and 6 on T-MET-STAT (Q-MET-HB01 to -HB06). 4 practice items.
// - content/mocks.json as shipped (S7-10's knowledge rules: 20 Methodology and 10 GA4 questions in 40 minutes, passed at 80%).
// Every key's correct option is the first one (optionId(id, 0)).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { optionId, type ChoiceConcept } from '../../schemas/choice.ts';
import { makeContentFixture } from './content-fixture.ts';

export const GA4_PARENTS = ['GA4-KN-01', 'GA4-KN-02'] as const;
export const MET_METRICS = ['MET-KN-01', 'MET-KN-02'] as const;
const pad = (n: number): string => String(n).padStart(2, '0');
export const EXAM_POOL = Array.from({ length: 8 }, (_, i) => `Q-GA4-H${pad(i + 1)}`);
export const KNOWLEDGE_POOL = Array.from({ length: 12 }, (_, i) => `Q-GA4-K${pad(i + 1)}`);
export const GA4_PRACTICE = Array.from({ length: 4 }, (_, i) => `Q-GA4-P${pad(i + 1)}`);
export const MET_HELD = [...Array.from({ length: 18 }, (_, i) => `Q-MET-HA${pad(i + 1)}`), ...Array.from({ length: 6 }, (_, i) => `Q-MET-HB${pad(i + 1)}`)];
export const MET_PRACTICE = Array.from({ length: 4 }, (_, i) => `Q-MET-P${pad(i + 1)}`);

/** Each item's topic and enemy group, by ID. */
export function topicOf(id: string): string {
  if (/^Q-GA4-H0[1-4]$|^Q-GA4-K(0[1-8])$|^Q-GA4-P0[12]$/.test(id)) return 'T-GA4-01';
  if (id.startsWith('Q-GA4-')) return 'T-GA4-02';
  return /^Q-MET-HB|^Q-MET-P0[34]$/.test(id) ? 'T-MET-STAT' : 'T-MET-RETAIL';
}
export const groupOf = (id: string): string | null => ({ 'Q-GA4-K11': 'EG-KN-1', 'Q-GA4-K12': 'EG-KN-1', 'Q-MET-HA01': 'EG-KN-2', 'Q-MET-HA02': 'EG-KN-2' } as Record<string, string>)[id] ?? null;
export const sectionOf = (id: string): 'ga4' | 'methodology' => (id.startsWith('Q-GA4-') ? 'ga4' : 'methodology');
/** The invented right option of every fixture question. */
export const RIGHT = (id: string): string => optionId(id, 0);
/** A stem marker no reply outside the question itself may carry. */
export const STEM = 'An invented knowledge question about the made-up widget';

export const GA4_TOPIC_NAMES = { 'T-GA4-01': 'Invented topic one', 'T-GA4-02': 'Invented topic two' };
export const EXAM = {
  topic_weights: { 'T-GA4-01': 50, 'T-GA4-02': 50 }, topic_names: GA4_TOPIC_NAMES,
  blueprints: [{ from: '2026-10-06',
    mini_drill: { questions: 2, minutes: 10, pass_pct: 80, mode: 'practice' },
    half_mock: { questions: 4, minutes: 10, pass_pct: 80, mode: 'exam', retake_days: 21 },
    full_mock: { questions: 8, minutes: 20, pass_pct: 80, mode: 'exam', retake_days: 21 } }],
};

const ENVELOPE = { version: 1, tags: [], source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null, status: 'active', supersedes: [] };
const OPTIONS = ['Teal widget', 'Gold widget', 'Ruby widget', 'Jade widget'];

export interface KnowledgePatch {
  /** The knowledge pool's item IDs as written (all 12 to start with); [] writes an empty pool, null no file. */
  pool?: string[] | null;
  /** Pool items written with `held_out: false` (held out only by the pool's listing). */
  unflagged?: string[];
}

/** The content root: the SQL fixture, the GA4 and Methodology banks above, the knowledge pool, the exam file and the shipped mocks.json. */
export async function makeKnowledgeFixture(patch: KnowledgePatch = {}): Promise<string> {
  const root = await makeContentFixture();
  for (const dir of ['ga4/items', 'keys/ga4', 'methodology/items', 'keys/methodology']) await mkdir(join(root, dir), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  const ga4Concepts: ChoiceConcept[] = GA4_PARENTS.map((id, k) => ({ id, parent_id: null, topic_id: `T-GA4-0${k + 1}`, title: `Invented GA4 parent ${k + 1}`, level: 1, verified: true }));
  const metConcepts: ChoiceConcept[] = MET_METRICS.map((id, k) => ({ id, parent_id: null, topic_id: k === 0 ? 'T-MET-RETAIL' : 'T-MET-STAT', title: `Invented metric ${k + 1}`, level: 1, verified: true }));
  await put('ga4/concepts.json', { concepts: ga4Concepts });
  await put('methodology/concepts.json', { concepts: metConcepts });
  await put('ga4/held-out.json', { item_ids: EXAM_POOL });
  if (patch.pool !== null) await put('ga4/knowledge-pool.json', { item_ids: patch.pool ?? KNOWLEDGE_POOL });
  await put('methodology/held-out.json', { item_ids: MET_HELD });
  await put('ga4/exam.json', EXAM);
  const held = new Set([...EXAM_POOL, ...KNOWLEDGE_POOL, ...MET_HELD].filter((id) => !patch.unflagged?.includes(id)));
  const item = (id: string) => {
    const section = sectionOf(id);
    const topic = topicOf(id);
    const concept = section === 'ga4' ? GA4_PARENTS[topic === 'T-GA4-01' ? 0 : 1] : MET_METRICS[topic === 'T-MET-RETAIL' ? 0 : 1];
    const common = { ...ENVELOPE, level: 1, enemy_group: groupOf(id), id, kind: 'mcq', section, concept_id: concept, stem: `${STEM} ${id}?`, typed: null,
      held_out: held.has(id), options: OPTIONS.map((text, i) => ({ oid: optionId(id, i), text, misconception_id: null })) };
    return section === 'ga4' ? { ...common, legacy_id: null, parent_id: null, topic_id: topic, exam_relevance: 'core' } : common;
  };
  for (const id of [...EXAM_POOL, ...KNOWLEDGE_POOL, ...GA4_PRACTICE, ...MET_HELD, ...MET_PRACTICE]) {
    const section = sectionOf(id);
    await put(`${section}/items/${id}.json`, item(id));
    await put(`keys/${section}/${id}.json`, { item_id: id, item_version: 1, correct_oid: RIGHT(id), explanation: `In this made-up catalogue the widget numbered ${id} is teal.`, solver: null });
  }
  await writeFile(join(root, 'mocks.json'), await readFile(join('content', 'mocks.json'), 'utf8'));
  return root;
}

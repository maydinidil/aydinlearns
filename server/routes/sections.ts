// server/routes/sections.ts: the GA4 and Methodology concept maps and their readings (design §8, §9, §14; D12, E-110, E-117,
// E-122; Task C5, shared with Task C6). Both routes only read: they log nothing and start no session. Viewing a reading is
// logged by the screen through POST /api/exposure (kind `reading`), once the text is on the screen.
//
// GET /api/ga4/concepts, GET /api/methodology/concepts: the section's parents in Today's order (D12's level 1 first, then the
//   file's order), each with its state, whether it has a reading and practice, and its 10 concepts nested (E-117). Never an
//   item, a key or a held-out ID: the map is open for everything, and held-out items are not browsable (design §4).
// GET /api/readings/:section/:id: one concept's reading, when it has one that passed the validator.
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ConceptStateName } from '../../core/states.ts';
import type { ChoiceSection } from '../../schemas/choice.ts';
import type { RouteDeps } from '../app.ts';
import { choiceParents, choicePool } from '../session-composer.ts';

/** A 10 concept on the map, under its 06 parent: taught in the parent's reading and practised on its card (E-110, E-117). */
export interface ChoiceChildView { id: string; title: string; topic_id: string; verified: boolean }
/** A parent concept on the map. `hasPractice` is false only when every item of its card is held out or not active. */
export interface ChoiceConceptView {
  id: string; title: string; topic_id: string; level: 1 | null; verified: boolean; state: ConceptStateName;
  hasReading: boolean; hasPractice: boolean; children: ChoiceChildView[];
}
/** A reading as the screen shows it. Its source IDs stay on the server. */
export interface ReadingView { concept_id: string; section: ChoiceSection; version: number; title: string; reading_md: string; verified: boolean; as_of: string }

const SECTIONS: readonly ChoiceSection[] = ['ga4', 'methodology'];
const refuse = (status: 400 | 404, message: string): HTTPException => new HTTPException(status, { message });

export function mountSections(app: Hono, d: RouteDeps): void {
  for (const section of SECTIONS) {
    app.get(`/api/${section}/concepts`, (c) => {
      const r = d.state.current();
      const all = d.content.choiceConcepts?.(section) ?? [];
      const concepts: ChoiceConceptView[] = choiceParents(d.content, section).map((p) => ({
        id: p.id, title: p.title, topic_id: p.topic_id, level: p.level, verified: p.verified, state: r.concepts.get(p.id)?.state ?? 'new',
        hasReading: d.content.reading?.(section, p.id) !== undefined, hasPractice: choicePool(d.content, section, p.id).length > 0,
        children: all.filter((x) => x.parent_id === p.id).map((x) => ({ id: x.id, title: x.title, topic_id: x.topic_id, verified: x.verified })),
      }));
      return c.json({ section, concepts });
    });
  }

  app.get('/api/readings/:section/:id', (c) => {
    const section = c.req.param('section');
    if (!SECTIONS.includes(section as ChoiceSection)) throw refuse(400, 'Readings are for ga4 or methodology.');
    const x = d.content.reading?.(section as ChoiceSection, c.req.param('id'));
    if (!x) throw refuse(404, 'This concept has no reading yet. Its practice is open on the map.');
    const body: ReadingView = { concept_id: x.concept_id, section: x.section, version: x.version, title: x.title, reading_md: x.reading_md, verified: x.verified, as_of: x.as_of };
    return c.json(body);
  });
}

// server/tutor-source.ts: the tutor's view of the content store (AI tutor design §5, §9). Each method returns an allow-list of fields the
// browser already gets; no key accessor is reachable through it, and held-out questions are left out (S2-64). The one place the tutor's
// course content is read from the store (server/tutor/ may not import it: tools/import-check.ts).
import type { ContentStore } from './content.ts';
import type { TableNote } from '../schemas/schema-notes.ts';
import type { CourseSource } from './tutor/course.ts';

/**
 * The first paragraph of a lesson's reading, at most 600 characters. Heading lines are skipped: every lesson's reading opens with one,
 * and a title alone is no summary.
 */
export const summaryOf = (md: string): string => {
  const text = md.split('\n').filter((line) => !/^\s*#{1,6}\s/.test(line)).join('\n');
  const p = text.trim().split(/\n\s*\n/)[0] ?? '';
  return p.length > 600 ? `${p.slice(0, 597)}...` : p;
};

const plain = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** T-16: a name that is one of these texts, holds one or sits inside one, ignoring letter case and runs of spaces. */
const sharesText = (name: string, texts: readonly string[]): boolean => {
  const n = plain(name);
  return n !== '' && texts.some((t) => { const x = plain(t); return x !== '' && (x.includes(n) || n.includes(x)); });
};

export function tutorSource(content: ContentStore, notes: readonly TableNote[]): CourseSource {
  const choiceTitle = (id: string): string | undefined => {
    for (const section of ['ga4', 'methodology'] as const) {
      const c = content.choiceConcepts?.(section).find((x) => x.id === id);
      if (c) return c.title;
    }
    return undefined;
  };
  return {
    item: (id) => {
      const i = content.item(id);
      return i && { id: i.id, kind: i.kind, level: i.level, difficulty: i.difficulty, target_concept_id: i.target_concept_id, prompt: i.prompt, schema: i.schema, shown_sql: i.shown_sql ?? null };
    },
    question: (id) => {
      if (content.heldOut?.(id)) return undefined;
      const q = content.choiceItem?.(id);
      if (!q) return undefined;
      // Ruling T-16 (review T6, I1: 41 real questions had a concept title that was, or held, the right option). The course text names no
      // concept whose title or ID is, holds or sits inside any of the question's options; any option, so nothing tells which is
      // right. Only the options' text is read here, and none of it is passed on.
      const texts = q.options.map((o) => o.text);
      const names = [choiceTitle(q.concept_id) ?? '', q.concept_id];
      return { id: q.id, section: q.section, concept_id: q.concept_id, stem: q.stem, concept_in_options: names.some((n) => sharesText(n, texts)) };
    },
    sqlConcept: (id) => {
      const c = content.curriculum.concepts.find((x) => x.id === id);
      if (!c) return undefined;
      const reading = content.lesson(id)?.reading_md;
      return { title: c.title, level: c.level, summary: reading ? summaryOf(reading) : null };
    },
    choiceConcept: (id) => {
      const title = choiceTitle(id);
      return title === undefined ? undefined : { title };
    },
    caseRecord: (id) => {
      const r = content.case?.(id);
      return r && { case_id: r.case_id, title: r.title, world: r.world, level: r.level, kind: r.kind, persona: r.persona, brief: r.brief,
        data_needed: r.data_needed, checkpoints: r.checkpoints.map((c) => ({ kind: c.kind, prompt: c.prompt })) };
    },
    tables: (schema) => notes.filter((n) => n.schema === schema),
    // An own entry only: the error IDs come from the screen, and "constructor" must not find Object's.
    errorFeedback: (id) => (Object.hasOwn(content.feedback, id) ? content.feedback[id] : undefined),
  };
}

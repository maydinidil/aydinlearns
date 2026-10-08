// web/src/editor/completion-schema.ts: the tables and columns autocomplete offers (S4-04, ruling P-9). Every table and
// column of the notes an item at its level shows (schemas/schema-notes.ts notesForLevel), the same tables the schema panel
// lists: a level 1 or 2 item keeps today's tables, and from level 3 the order and price tables join them.
import { notesForLevel, type TableNote } from '../../../schemas/schema-notes.ts';

/** `{ table: columns }` for @codemirror/lang-sql's `schema` option, unqualified (design §11, T-13). */
export function completionSchema(notes: readonly TableNote[], level: number | null | undefined): Record<string, string[]> {
  return Object.fromEntries(notesForLevel(notes, level).map((n) => [n.table, [...n.sample.columns]]));
}

// web/src/editor/use-sql-editor.ts: the SQL editor's wiring, one copy for every panel that runs an item (sprint 7 Part 2, Task N3, L105): the
// exercise panel (drills, lessons, practice, a case's CP3) and the mock question (the screen mock's questions, a case mock's CP3). Once the item
// has loaded it opens the editor on its starting text (a faded item's locked prefix and suffix, a fix item's query), with autocomplete from
// the schema notes unless in screen mode (S4B-22), and Ctrl+Enter and Ctrl+Shift+Enter calling the latest handlers. The editor goes with its host.
import { useEffect, useRef, type RefObject } from 'react';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import { editorStart, type Stage } from '../lib/lesson-flow.ts';
import { completionSchema } from './completion-schema.ts';
import { createSqlEditor, type SqlEditor } from './sql-editor.ts';

/** An item as the editor opens it (an exercise's, or a mock question's, whose faded shape may be absent). */
export interface EditorSource {
  item: Omit<Parameters<typeof editorStart>[0], 'faded_shape'> & { faded_shape?: string | null; level: number | null };
  schemaNotes: readonly TableNote[];
}

/**
 * The editor in `host` for `source` (null until the item has loaded): made again when the source, the stage or the mode changes, and destroyed
 * with the panel. `keys.run` and `keys.submit` are read when a key is pressed, so they always see the panel's latest state.
 */
export function useSqlEditor(host: RefObject<HTMLDivElement | null>, source: EditorSource | null,
  o: { stage: Stage; screenMode: boolean; run: () => void; submit: () => void }): RefObject<SqlEditor | null> {
  const editor = useRef<SqlEditor | null>(null);
  const keys = useRef({ run: o.run, submit: o.submit });
  keys.current = { run: o.run, submit: o.submit };
  useEffect(() => {
    if (!source || !host.current) return;
    const start = editorStart({ ...source.item, faded_shape: source.item.faded_shape ?? null }, o.stage);
    editor.current = createSqlEditor({ parent: host.current, text: start.text, locked: start.locked, schema: completionSchema(source.schemaNotes, source.item.level),
      screenMode: o.screenMode, onRun: () => keys.current.run(), onSubmit: () => keys.current.submit() });
    return () => editor.current?.destroy();
  }, [source, o.stage, o.screenMode]);
  return editor;
}

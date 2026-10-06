// CodeMirror 6 editor: Ctrl+Enter runs, Ctrl+Shift+Enter submits, at the highest precedence (design §11 UI).
// A faded item's visible prefix, and its suffix when it has one, are read-only, enforced with changeFilter.
import { EditorState, Prec, type ChangeSpec, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { sql } from '@codemirror/lang-sql';
import { DuckDBDialect } from './duckdb-dialect.ts';

export interface SqlEditor { getText(): string; setText(text: string): void; destroy(): void }
/** The read-only lengths: the first `prefix` and the last `suffix` characters of the document. */
export interface Locked { prefix: number; suffix: number }

const lockedMark = Decoration.mark({ class: 'cm-locked' });

/**
 * Makes the first `prefix` and the last `suffix` characters read-only and greys them out, so the
 * learner writes only in the blank between them. Nothing inside the suffix can change, so it is
 * always the document's last `suffix` characters. Exported for the tests.
 */
export function readOnlyEnds({ prefix, suffix }: Locked): Extension[] {
  return [
    EditorState.changeFilter.of((tr) => {
      if (!tr.docChanged) return true;
      const end = tr.startState.doc.length;
      // A locked range does not stop an insertion at its outer edge: one at 0 would push the
      // prefix out from under its range, and one at the very end would land after the suffix.
      let outside = false;
      tr.changes.iterChanges((fromA, _toA, fromB, toB) => {
        if (toB > fromB && ((prefix > 0 && fromA === 0) || (suffix > 0 && fromA === end))) outside = true;
      });
      if (outside) return false;
      const ranges = [...(prefix > 0 ? [0, prefix] : []), ...(suffix > 0 ? [end - suffix, end] : [])];
      return ranges.length ? ranges : true;
    }),
    EditorView.decorations.compute(['doc'], (state) => {
      const end = state.doc.length;
      return Decoration.set([
        ...(prefix > 0 ? [lockedMark.range(0, prefix)] : []),
        ...(suffix > 0 ? [lockedMark.range(end - suffix, end)] : []),
      ]);
    }),
  ];
}

/** The editor's opening state: the locks, and the cursor at the blank, right after the prefix. Exported for the tests. */
export function openingState(text: string, locked: Locked, extensions: Extension[] = []): EditorState {
  const all = locked.prefix > 0 || locked.suffix > 0 ? [...extensions, readOnlyEnds(locked)] : extensions;
  return EditorState.create({ doc: text, extensions: all, selection: { anchor: text.length - locked.suffix } });
}

/** The change that puts the middle of `text`, a whole query, into the blank, leaving both locked parts alone. Exported for the tests. */
export function middleChange(state: EditorState, text: string, locked: Locked): ChangeSpec {
  return { from: locked.prefix, to: state.doc.length - locked.suffix, insert: text.slice(locked.prefix, Math.max(locked.prefix, text.length - locked.suffix)) };
}

/** The editor's accessible name. A faded item's name says which grey parts are fixed, as the note above it does. Exported for the tests. */
export function editorLabel({ prefix, suffix }: Locked): string {
  if (prefix > 0 && suffix > 0) return 'SQL editor. The grey start and end are fixed and cannot be changed: write the missing part between them.';
  if (prefix > 0) return 'SQL editor. The grey start is fixed and cannot be changed: write the rest of the query after it.';
  if (suffix > 0) return 'SQL editor. The grey end is fixed and cannot be changed: write the query before it.';
  return 'SQL editor';
}

export function createSqlEditor(o: { parent: HTMLElement; text: string; locked: Locked; schema: Record<string, string[]>; onRun: () => void; onSubmit: () => void }): SqlEditor {
  const extensions: Extension[] = [
    Prec.highest(keymap.of([
      { key: 'Mod-Shift-Enter', run: () => { o.onSubmit(); return true; } },
      { key: 'Mod-Enter', run: () => { o.onRun(); return true; } },
    ])),
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    sql({ dialect: DuckDBDialect, schema: o.schema, upperCaseKeywords: true }),
    autocompletion(),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { backgroundColor: 'var(--surface)', border: '1px solid var(--control)', borderRadius: 'var(--r1)', fontSize: 'var(--t2)' },
      '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
      '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--ink)' },
      '.cm-gutters': { backgroundColor: 'var(--canvas)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
    }),
    EditorView.contentAttributes.of({ 'aria-label': editorLabel(o.locked) }),
  ];
  const view = new EditorView({ parent: o.parent, state: openingState(o.text, o.locked, extensions) });
  view.focus();
  return {
    getText: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: middleChange(view.state, text, o.locked) }),
    destroy: () => view.destroy(),
  };
}

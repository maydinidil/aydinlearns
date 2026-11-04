// CodeMirror 6 editor: Ctrl+Enter runs, Ctrl+Shift+Enter submits, at the highest precedence (design §11 UI). Screen mode has no autocomplete (S4B-22).
// A faded item's visible prefix, and its suffix when it has one, are read-only, enforced with changeFilter.
// Its look comes from the tokens in both themes, with CodeMirror's own dark or light defaults under it, switched with the theme (S9-18).
import { Compartment, EditorState, Prec, type ChangeSpec, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { sql } from '@codemirror/lang-sql';
import { DuckDBDialect } from './duckdb-dialect.ts';
import { appliedTheme, watchAppliedTheme } from '../lib/theme.ts';

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

/**
 * The SQL language and its autocomplete. Screen mode (design §6, S4B-22) turns autocomplete off, as an online test's editor
 * has none: no completion list, and no table or column names. The language stays for highlighting. Exported for the tests.
 */
export function completionExtensions(o: { screenMode: boolean; schema: Record<string, string[]> }): Extension[] {
  if (o.screenMode) return [sql({ dialect: DuckDBDialect, upperCaseKeywords: true })];
  return [sql({ dialect: DuckDBDialect, schema: o.schema, upperCaseKeywords: true }), autocompletion()];
}

/**
 * The editor's look, all from the tokens, so it follows the theme in force. The completion list (S9-18) takes the popup tokens: a row in
 * --ink on --popup-bg with its detail word in --ink-2, the selected row in --popup-selected-text on --popup-selected-bg, and the selected
 * row while new results wait in --ink on --popup-line. The list's own selectors match CodeMirror's base theme, so these win over it.
 * Exported for the tests.
 */
export const EDITOR_LOOK = {
  '&': { backgroundColor: 'var(--surface)', border: '1px solid var(--control)', borderRadius: 'var(--r1)', fontSize: 'var(--t2)' },
  '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
  '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--canvas)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-tooltip': { backgroundColor: 'var(--popup-bg)', color: 'var(--ink)', border: '1px solid var(--popup-line)', borderRadius: '6px', boxShadow: 'var(--shadow)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', padding: '2px 0' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--popup-selected-bg)', color: 'var(--popup-selected-text)' },
  '.cm-tooltip-autocomplete-disabled ul li[aria-selected]': { background: 'var(--popup-line)', color: 'var(--ink)' },
  '.cm-completionDetail': { color: 'var(--ink-2)' },
  'li[aria-selected] .cm-completionDetail': { color: 'inherit' },
};

const looks = new Map<boolean, Extension>();
/** The look with CodeMirror's dark defaults (`{ dark: true }`) or its light ones. Exported for the tests. */
export function editorTheme(dark: boolean): Extension {
  let look = looks.get(dark);
  if (!look) { look = EditorView.theme(EDITOR_LOOK, { dark }); looks.set(dark, look); }
  return look;
}

export function createSqlEditor(o: { parent: HTMLElement; text: string; locked: Locked; schema: Record<string, string[]>; onRun: () => void; onSubmit: () => void; screenMode?: boolean }): SqlEditor {
  const root = document.documentElement;
  const look = new Compartment();
  let dark = appliedTheme(root) === 'dark';
  const extensions: Extension[] = [
    Prec.highest(keymap.of([
      { key: 'Mod-Shift-Enter', run: () => { o.onSubmit(); return true; } },
      { key: 'Mod-Enter', run: () => { o.onRun(); return true; } },
    ])),
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    ...completionExtensions({ screenMode: o.screenMode === true, schema: o.schema }),
    EditorView.lineWrapping,
    look.of(editorTheme(dark)),
    EditorView.contentAttributes.of({ 'aria-label': editorLabel(o.locked) }),
  ];
  const view = new EditorView({ parent: o.parent, state: openingState(o.text, o.locked, extensions) });
  const stopFollowing = watchAppliedTheme(root, (theme) => {
    if ((theme === 'dark') === dark) return;
    dark = theme === 'dark';
    view.dispatch({ effects: look.reconfigure(editorTheme(dark)) });
  });
  view.focus();
  return {
    getText: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: middleChange(view.state, text, o.locked) }),
    destroy: () => { stopFollowing(); view.destroy(); },
  };
}

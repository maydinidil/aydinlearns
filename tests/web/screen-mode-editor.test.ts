// tests/web/screen-mode-editor.test.ts: screen mode's editor preset (design §6 "Screen mode", D41, S4B-22, Task E3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, StateField, type Extension } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import { completionExtensions } from '../../web/src/editor/sql-editor.ts';

const flat = (x: unknown): unknown[] => (Array.isArray(x) ? x.flatMap(flat) : [x]);
/** autocompletion()'s own state field: one object for the whole module, so a state has it only when autocomplete is on. */
const completionField = flat(autocompletion()).find((e): e is StateField<unknown> => e instanceof StateField)!;
const schema = { stores: ['store_id', 'city'] };
const stateOf = (extensions: Extension[]) => EditorState.create({ doc: 'SELECT ', extensions });

test('S4B-22: outside screen mode the editor completes keywords, tables and columns', () => {
  assert.ok(completionField, 'autocompletion() carries a state field');
  const on = stateOf(completionExtensions({ screenMode: false, schema }));
  assert.notEqual(on.field(completionField, false), undefined, 'the completion list is on');
});

test('S4B-22: in screen mode autocomplete is off, and no table or column names are offered', () => {
  const on = stateOf(completionExtensions({ screenMode: false, schema }));
  const off = stateOf(completionExtensions({ screenMode: true, schema }));
  assert.equal(off.field(completionField, false), undefined, 'no completion list');
  assert.ok(off.languageDataAt('autocomplete', 7).length < on.languageDataAt('autocomplete', 7).length, 'the schema source is left out');
});

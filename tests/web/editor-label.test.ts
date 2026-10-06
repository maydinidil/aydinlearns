import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorLabel } from '../../web/src/editor/sql-editor.ts';

test('the editor\'s accessible name says which grey parts are fixed', () => {
  assert.equal(editorLabel({ prefix: 0, suffix: 0 }), 'SQL editor');
  assert.equal(editorLabel({ prefix: 12, suffix: 0 }), 'SQL editor. The grey start is fixed and cannot be changed: write the rest of the query after it.');
  assert.equal(editorLabel({ prefix: 12, suffix: 8 }), 'SQL editor. The grey start and end are fixed and cannot be changed: write the missing part between them.');
  assert.equal(editorLabel({ prefix: 0, suffix: 8 }), 'SQL editor. The grey end is fixed and cannot be changed: write the query before it.');
});

// tests/server/servings.test.ts: what the server served (Task B7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Servings } from '../../server/servings.ts';

test('serve mints an instance id and remembers the serving; blockMembers lists a block in serving order; forget drops one', () => {
  const s = new Servings();
  const a = s.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: 'EX-1' });
  const b = s.serve({ phase: 'review', block_id: null, repeat_exposure: true, section: 'sql', item_id: 'EX-2' });
  const c = s.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: 'EX-3' });
  assert.equal(new Set([a, b, c]).size, 3);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(s.get(b), { phase: 'review', block_id: null, repeat_exposure: true, section: 'sql', item_id: 'EX-2' });
  assert.deepEqual(s.blockMembers('B-1'), [a, c]);
  s.forget(a);
  assert.equal(s.get(a), undefined);
  assert.deepEqual(s.blockMembers('B-1'), [c]);
  assert.equal(s.get('not-served'), undefined);
});
test('a serving cannot be changed through what get returns', () => {
  const s = new Servings();
  const id = s.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: 'EX-1' });
  const got = s.get(id)!;
  got.phase = 'free';
  assert.equal(s.get(id)!.phase, 'mixed');
});

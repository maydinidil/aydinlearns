// Sprint 5b Task C2: Q-GA4-076 wording fix. Failure messages name IDs only (non-negotiable 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (p: string): Promise<any> => JSON.parse(await readFile(p, 'utf8'));

test('Q-GA4-076: no giveaway word, no unsourced 360 clause, versions match', async () => {
  const item = await read('content/ga4/items/Q-GA4-076.json');
  const key = await read('content/keys/ga4/Q-GA4-076.json');
  assert.doesNotMatch(item.stem, /\byet\b/i, item.id);
  assert.doesNotMatch(key.explanation, /360/, item.id);
  assert.ok(item.version >= 2, item.id);
  assert.equal(key.item_version, item.version, item.id);
  assert.deepEqual(
    item.options.map((o: { oid: string }) => o.oid),
    ['o6a335a2', 'of00bfe4', 'o6731ed7', 'o1b55ebd'],
    item.id,
  );
});

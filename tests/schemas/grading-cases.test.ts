import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const dir = 'schemas/grading-cases';
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

test('there are 16 grading cases covering G1-G13 and the bag, NULL, NaN and empty cases', () => assert.equal(files.length, 16));
for (const f of files) {
  test(`case ${f} is well formed`, async () => {
    const c = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'));
    assert.equal(c.id, f.replace('.json', ''));
    assert.equal(c.setup_sql[0], 'CREATE SCHEMA g');
    assert.equal(typeof c.key_sql, 'string');
    assert.equal(typeof c.learner_sql, 'string');
    assert.equal(typeof c.expect.pass, 'boolean');
    assert.ok(Array.isArray(c.rules.columns) && c.rules.columns.length > 0);
  });
}

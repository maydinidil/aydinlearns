import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const dir = 'schemas/grading-cases';
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

test('there are 20 grading cases: 16 covering G1, G2, G3, G4, G6, G12 and G13 and the bag, NULL, NaN and empty cases, and the two screen-mode pairs of Task E3', () => {
  assert.equal(files.length, 20);
  assert.deepEqual(files.filter((f) => f.startsWith('g4-screen-')).sort(),
    ['g4-screen-date-normal.json', 'g4-screen-date-screen.json', 'g4-screen-integer-normal.json', 'g4-screen-integer-screen.json']);
});
for (const f of files) {
  test(`case ${f} is well formed`, async () => {
    const c = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'));
    assert.equal(c.id, f.replace('.json', ''));
    assert.equal(c.setup_sql[0], 'CREATE SCHEMA g');
    assert.equal(typeof c.key_sql, 'string');
    assert.equal(typeof c.learner_sql, 'string');
    assert.equal(typeof c.expect.pass, 'boolean');
    assert.ok(Array.isArray(c.rules.columns) && c.rules.columns.length > 0);
    // D41 (Task E3): a case names screen mode only to grade in it; every other case grades in normal mode.
    assert.ok(c.screen_mode === undefined || typeof c.screen_mode === 'boolean');
  });
}

// tests/web/tutor-budget.test.ts: the tutor's daily budget field in Settings (review T8 I3, T-06): Save sends only a value the learner
// meant. An empty field is "nothing set" ($1); input the browser cannot read and values outside 0.05 to 20 are refused with the server's line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_CAP_USD as SERVER_MAX, MIN_CAP_USD as SERVER_MIN } from '../../server/tutor/spend.ts';
import { BUDGET_PROBLEM, budgetToSave, MAX_CAP_USD, MIN_CAP_USD } from '../../web/src/lib/tutor-budget.ts';

const refused = { ok: false, problem: BUDGET_PROBLEM };

test('an empty field saves nothing set, which is the $1 default', () => {
  assert.deepEqual(budgetToSave('', false), { ok: true, value: null });
  assert.deepEqual(budgetToSave('   ', false), { ok: true, value: null });
});

test('a value from 0.05 to 20 is saved as that number', () => {
  assert.deepEqual(['0.05', '2.5', '20', '1e1', ' 3 '].map((t) => budgetToSave(t, false)),
    [0.05, 2.5, 20, 10, 3].map((value) => ({ ok: true, value })));
});

test('input the browser cannot read is refused, never saved as nothing set ("0,5" in an English browser reads as empty)', () => {
  assert.deepEqual(budgetToSave('', true), refused);
});

test('a value outside 0.05 to 20 is refused in the browser, with the server\'s own line', () => {
  for (const t of ['0.01', '0', '-1', '20.01', '25', 'Infinity']) assert.deepEqual(budgetToSave(t, false), refused, t);
});

test('the browser\'s range and line are the server\'s (T-06; the web cannot import server/)', async () => {
  assert.deepEqual([MIN_CAP_USD, MAX_CAP_USD], [SERVER_MIN, SERVER_MAX]);
  assert.equal(BUDGET_PROBLEM, 'Use a daily budget from 0.05 to 20 US dollars.');
  assert.ok((await readFile(new URL('../../server/app.ts', import.meta.url), 'utf8')).includes(`'${BUDGET_PROBLEM}'`), 'server/app.ts refuses with the same line');
});

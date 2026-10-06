// tests/web/lesson-position.test.ts: the lesson remembers its place per concept in localStorage (owner decision D7, Task B15).
// Every read and write is wrapped, so the lesson works with storage that throws, is empty or holds something else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionKey, readPosition, writePosition, type LessonPosition, type PositionStore } from '../../web/src/lib/labels.ts';

function memory(): PositionStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const at = (s: PositionStore) => () => s;
const place: LessonPosition = {
  step: 'block',
  block: { index: 2, stage: 1, showWorkedAgain: true },
  pretest: [{ passed: true, helped: false }, { passed: false, helped: true }],
};

test('a position round-trips, per concept', () => {
  const s = memory();
  assert.equal(writePosition('SQL-AGG-02', place, at(s)), true);
  assert.deepEqual(readPosition('SQL-AGG-02', at(s)), place);
  assert.equal(readPosition('SQL-AGG-03', at(s)), null, 'another concept has its own place');
  writePosition('SQL-AGG-03', { ...place, step: 'reading' }, at(s));
  assert.equal(readPosition('SQL-AGG-02', at(s))?.step, 'block', 'writing one concept leaves the other alone');
  assert.notEqual(positionKey('SQL-AGG-02'), positionKey('SQL-AGG-03'));
  assert.ok(s.data.has(positionKey('SQL-AGG-02')));
});

test('every step is kept', () => {
  const s = memory();
  for (const step of ['pretest', 'reading', 'worked', 'block', 'practice'] as const) {
    writePosition('SQL-X-01', { ...place, step }, at(s));
    assert.equal(readPosition('SQL-X-01', at(s))?.step, step);
  }
});

test('nothing stored yet: no position, so the lesson starts at its beginning', () => {
  assert.equal(readPosition('SQL-AGG-02', at(memory())), null);
});

test('storage that throws on read or write: no position, no error', () => {
  const throwing: PositionStore = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(readPosition('SQL-AGG-02', at(throwing)), null);
  assert.equal(writePosition('SQL-AGG-02', place, at(throwing)), false);
});

test('storage that cannot even be reached (the accessor throws, or there is none): no position, no error', () => {
  const denied = (): PositionStore => { throw new Error('access denied'); };
  assert.equal(readPosition('SQL-AGG-02', denied), null);
  assert.equal(writePosition('SQL-AGG-02', place, denied), false);
  assert.equal(readPosition('SQL-AGG-02', () => null), null);
  assert.equal(writePosition('SQL-AGG-02', place, () => null), false);
});

test('the default storage works without a browser: no position, no error', () => {
  assert.doesNotThrow(() => readPosition('SQL-AGG-02'));
  assert.doesNotThrow(() => writePosition('SQL-AGG-02', place));
});

test('anything stored that is not a position is ignored', () => {
  const s = memory();
  const key = positionKey('SQL-AGG-02');
  const bad: unknown[] = [
    'not json {',
    'null',
    '42',
    JSON.stringify({ ...place, step: 'somewhere' }),
    JSON.stringify({ ...place, block: { index: -1, stage: 1, showWorkedAgain: false } }),
    JSON.stringify({ ...place, block: { index: 1.5, stage: 1, showWorkedAgain: false } }),
    JSON.stringify({ ...place, block: { index: 1, stage: 4, showWorkedAgain: false } }),
    JSON.stringify({ ...place, block: { index: 1, stage: 2, showWorkedAgain: 'yes' } }),
    JSON.stringify({ ...place, block: null }),
    JSON.stringify({ ...place, pretest: [{ passed: true, helped: false }, { passed: true, helped: false }, { passed: true, helped: false }] }),
    JSON.stringify({ ...place, pretest: [{ passed: 'yes', helped: false }] }),
    JSON.stringify({ ...place, pretest: 'none' }),
  ];
  for (const v of bad) {
    s.data.set(key, v as string);
    assert.equal(readPosition('SQL-AGG-02', at(s)), null, String(v));
  }
});

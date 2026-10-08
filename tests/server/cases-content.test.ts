// tests/server/cases-content.test.ts: Task B2 of sprint 4b. The content store reads content/sql/cases/ beside the openers
// (cases(), case(id)) and the case keys (caseKey(id), server-only); its credits and truths cover every case's CP1 to CP5; the
// replay catalog classes every case checkpoint item as a checkpoint and lists each case's auto-graded checkpoints; Today's opener
// "solved" is replay's (S4B-08); a daily case's checkpoints rate only the concepts they credit. Every case here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { replay } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { openerInputs } from '../../server/session-composer.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { DAILY_ID, INBOX_ID, OPENER_ID, OTHER_CONCEPT, TRUTHS, caseKeys, makeCaseFixture } from '../helpers/case-fixture.ts';
import { exposure, instance, type InstanceSpec } from '../helpers/replay-fixture.ts';

const fixture = await makeCaseFixture();
const store = await loadContent(fixture.root, { truthFile: fixture.truthFile });

test('cases() lists every case, the openers and content/sql/cases/, in case ID order; case(id) finds any; openers() keeps the openers', () => {
  assert.deepEqual(store.cases!().map((c) => c.case_id), [DAILY_ID, INBOX_ID, OPENER_ID]);
  for (const id of [OPENER_ID, INBOX_ID, DAILY_ID]) assert.equal(store.case!(id)?.case_id, id);
  assert.equal(store.case!('CASE-NOPE'), undefined);
  assert.deepEqual(store.openers!().map((c) => c.case_id), [OPENER_ID]);
  assert.equal(store.opener!(INBOX_ID), undefined, 'an inbox case is not an opener');
});
test('caseKey(id) gives a case\'s key, server-side only; a case without a key file has none', () => {
  for (const k of caseKeys()) assert.deepEqual(store.caseKey!(k.case_id), k);
  assert.equal(store.caseKey!('CASE-NOPE'), undefined);
});
test('checkpointCredits covers every case\'s CP1 to CP5; CP6 has no item; checkpointTruth reads every CP2 and CP4 value', () => {
  const credits = (id: string) => store.checkpointCredits!(id);
  assert.deepEqual([credits(`${INBOX_ID}:CP1`), credits(`${INBOX_ID}:CP2`), credits('EX-CASE-PRICE-01'), credits(`${INBOX_ID}:CP4`), credits(`${INBOX_ID}:CP5`)],
    [[], [OTHER_CONCEPT], [FIXTURE_CONCEPT, OTHER_CONCEPT], [FIXTURE_CONCEPT], []]);
  assert.deepEqual([credits('EX-CASE-DAILY-L1-01'), credits(`${DAILY_ID}:CP4`)], [[FIXTURE_CONCEPT, OTHER_CONCEPT], []]);
  assert.deepEqual([credits('EX-OPENER-L1-01'), credits(`${OPENER_ID}:CP4`)], [[FIXTURE_CONCEPT], []]);
  assert.equal(credits(`${INBOX_ID}:CP6`), undefined);
  for (const [key, value] of Object.entries(TRUTHS)) assert.equal(store.checkpointTruth!(key), value, key);
});
test('a case file and a case key file each change the content version', async () => {
  const { root } = await makeCaseFixture();
  const before = (await loadContent(root)).contentVersion;
  const casePath = join(root, 'sql/cases', `${DAILY_ID}.json`);
  await writeFile(casePath, (await readFile(casePath, 'utf8')).replace('An invented daily case', 'Another daily case'));
  const afterCase = (await loadContent(root)).contentVersion;
  assert.notEqual(afterCase, before);
  const keyPath = join(root, 'keys/cases', `${DAILY_ID}.json`);
  await writeFile(keyPath, (await readFile(keyPath, 'utf8')).replace('nowhere', 'elsewhere'));
  assert.notEqual((await loadContent(root)).contentVersion, afterCase);
});

test('the catalog classes every case checkpoint item as a checkpoint, and lists each case\'s auto-graded checkpoints in order', () => {
  const catalog = buildCatalog(store);
  const items: [string, string][] = [[`${INBOX_ID}:CP1`, 'mcq'], [`${INBOX_ID}:CP2`, 'typed'], ['EX-CASE-PRICE-01', 'write'], [`${INBOX_ID}:CP4`, 'typed'],
    [`${INBOX_ID}:CP5`, 'mcq'], ['EX-CASE-DAILY-L1-01', 'write'], [`${DAILY_ID}:CP4`, 'typed'], ['EX-OPENER-L1-01', 'write'], [`${OPENER_ID}:CP4`, 'typed']];
  for (const [id, kind] of items) assert.equal(catalog.familyOf(id, kind), 'checkpoint', id);
  assert.equal(catalog.familyOf(`EX-${FIXTURE_CONCEPT}-E1-08`, 'write'), 'write', 'any other item keeps its family');
  assert.deepEqual(catalog.cases!().map((c) => [c.case_id, c.checkpoints.map((p) => `${p.kind} ${p.item_id}`)]), [
    [DAILY_ID, ['CP3 EX-CASE-DAILY-L1-01', `CP4 ${DAILY_ID}:CP4`]],
    [INBOX_ID, [`CP1 ${INBOX_ID}:CP1`, `CP2 ${INBOX_ID}:CP2`, 'CP3 EX-CASE-PRICE-01', `CP4 ${INBOX_ID}:CP4`, `CP5 ${INBOX_ID}:CP5`]],
    [OPENER_ID, ['CP3 EX-OPENER-L1-01', `CP4 ${OPENER_ID}:CP4`]],
  ]);
});

// ---- replay through the server's catalog ------------------------------------------------------------------------------------
const day1 = (hms: string) => `2026-11-02T${hms}.000Z`;
const day2 = (hms: string) => `2026-11-03T${hms}.000Z`;
const run = (attempts: object[]) => replay(attempts, [], replayOptions(buildCatalog(store), new Date('2026-12-01T00:00:00Z')));
const at = (spec: Omit<InstanceSpec, 'phase'>) => instance({ ...spec, phase: 'case' });

test('S4B-08: Today\'s opener "solved" is replay\'s: an opener with a CP3 pass only is not solved; any CP4 pass then solves it', () => {
  const cp3 = at({ id: 'I-3', item: 'EX-OPENER-L1-01', concept: FIXTURE_CONCEPT, start: day1('09:00:00'), steps: [{ at: day1('09:01:00'), submit: 'pass' }] });
  const solved = (attempts: object[]) => openerInputs(store.openers!(), store.curriculum, run(attempts)).map((o) => [o.case_id, o.level, o.solved]);
  assert.deepEqual(solved(cp3), [[OPENER_ID, 1, false]], 'CP3 alone no longer solves an opener');
  // The CP4 passes after "answer shown" (S2-105): not a counted pass, but a pass, so the opener is solved.
  const cp4 = at({ id: 'I-4', item: `${OPENER_ID}:CP4`, concept: FIXTURE_CONCEPT, kind: 'typed', start: day1('09:10:00'),
    steps: [{ at: day1('09:10:05'), solution: true }, { at: day1('09:11:00'), submit: 'pass' }] });
  assert.deepEqual(solved([...cp3, ...cp4]), [[OPENER_ID, 1, true]]);
  assert.equal(run([...cp3, ...cp4]).cases.get(OPENER_ID)!.solved, true);
});
test('a daily case\'s checkpoints rate only the concepts they credit: its CP3 both credited cards, its CP4 none', () => {
  // Both concepts were first met a day before, so their first rating may come from the case (S2-02).
  const attempts = [
    exposure(FIXTURE_CONCEPT, day1('08:00:00')), exposure(OTHER_CONCEPT, day1('08:00:00')),
    ...at({ id: 'I-D3', item: 'EX-CASE-DAILY-L1-01', concept: FIXTURE_CONCEPT, start: day2('09:00:00'), steps: [{ at: day2('09:01:00'), submit: 'pass', activeMs: 30_000 }] }),
    ...at({ id: 'I-D4', item: `${DAILY_ID}:CP4`, concept: FIXTURE_CONCEPT, kind: 'typed', start: day2('09:10:00'), steps: [{ at: day2('09:11:00'), submit: 'pass' }] }),
  ];
  const r = run(attempts);
  assert.deepEqual(r.instances.get('I-D3')!.card_reviews.map((c) => [c.card_id, c.rating]), [[`CARD-${FIXTURE_CONCEPT}`, 3], [`CARD-${OTHER_CONCEPT}`, 3]],
    'Good for each concept the CP3 credits (design §5)');
  assert.deepEqual([r.instances.get('I-D4')!.rating, r.instances.get('I-D4')!.card_reviews], [null, []], 'the CP4 credits nothing, so it rates nothing');
  assert.deepEqual([...r.cards.keys()].sort(), [`CARD-${FIXTURE_CONCEPT}`, `CARD-${OTHER_CONCEPT}`].sort());
  assert.deepEqual([r.cases.get(DAILY_ID)!.solved, r.cases.get(DAILY_ID)!.solved_at], [true, day2('09:11:00')]);
  // A wrong CP4 credits nothing either: no Again on any card.
  const wrong = run([...attempts.slice(0, -2), ...at({ id: 'I-D4-W', item: `${DAILY_ID}:CP4`, concept: FIXTURE_CONCEPT, kind: 'typed', start: day2('09:20:00'),
    steps: [{ at: day2('09:21:00'), submit: 'fail' }] })]);
  assert.deepEqual(wrong.instances.get('I-D4-W')!.card_reviews, []);
});

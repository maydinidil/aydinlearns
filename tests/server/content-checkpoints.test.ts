// tests/server/content-checkpoints.test.ts: the checkpoint truths and the case keys in the content store, sprint 6 (Task B3, S6-13).
// The build writes data/truth/checkpoints.json: each CP2 and CP4 value, the hash of its source (the case's schema and its truth query)
// and the schemas the database held. The server reads it, and falls back to data/truth/voltmarkt.json's `checkpoints` for an older
// build. A case key is the file named after its case. Every case and value here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { caseUnavailable, loadContent, truthSourceHash, unavailableLine } from '../../server/content.ts';
import { DAILY_ID, INBOX_ID, OPENER_ID, makeCaseFixture } from '../helpers/case-fixture.ts';

test('truthSourceHash: the first 16 hex of sha256 over the schema, a line break and the query, as the build computes it', () => {
  const want = createHash('sha256').update('voltmarkt\nSELECT 1', 'utf8').digest('hex').slice(0, 16);
  assert.equal(truthSourceHash('voltmarkt', 'SELECT 1'), want);
  assert.equal(truthSourceHash('voltmarkt', 'SELECT 1'), '091a04a12e9ae508', 'pinned: pipeline/tests/test_build.py pins the same value');
  assert.notEqual(truthSourceHash('mailvora', 'SELECT 1'), want, 'another schema is another source');
});

test('S6-13: checkpoints.json gives the values, their source hashes and the schemas built; voltmarkt.json is then not read for values', async () => {
  const f = await makeCaseFixture();
  const checkpointsFile = join(f.root, 'checkpoints.json');
  await writeFile(checkpointsFile, JSON.stringify({ schemas: ['voltmarkt', 'voltmarkt_edge_basics'], checkpoints: { [`${OPENER_ID}:CP4`]: 41.5 },
    sources: { [`${OPENER_ID}:CP4`]: 'abcdef0123456789' } }));
  const store = await loadContent(f.root, { checkpointsFile, truthFile: f.truthFile });
  assert.equal(store.checkpointTruth!(`${OPENER_ID}:CP4`), 41.5);
  assert.equal(store.checkpointTruth!(`${INBOX_ID}:CP2`), undefined, 'the older file is not read when checkpoints.json is there');
  assert.equal(store.checkpointTruthHash!(`${OPENER_ID}:CP4`), 'abcdef0123456789');
  assert.deepEqual([...store.builtSchemas!()!].sort(), ['voltmarkt', 'voltmarkt_edge_basics']);
});

test('S6-13: an older build (no checkpoints.json) falls back to voltmarkt.json\'s checkpoints, and which schemas exist is not known', async () => {
  const f = await makeCaseFixture();
  const older = join(f.root, 'voltmarkt.json');
  await writeFile(older, JSON.stringify({ seed: 1, checkpoints: { [`${OPENER_ID}:CP4`]: 340 } }));
  const store = await loadContent(f.root, { checkpointsFile: join(f.root, 'no-such-checkpoints.json'), truthFile: older });
  assert.equal(store.checkpointTruth!(`${OPENER_ID}:CP4`), 340);
  assert.equal(store.checkpointTruthHash!(`${OPENER_ID}:CP4`), undefined);
  assert.equal(store.builtSchemas!(), null, 'unknown: every case is available');
  const none = await loadContent(f.root, {});
  assert.deepEqual([none.checkpointTruth!(`${OPENER_ID}:CP4`), none.builtSchemas!()], [undefined, null]);
});

test('a checkpoints file that is not JSON stops the load, naming the file and never quoting it', async () => {
  const f = await makeCaseFixture();
  const bad = join(f.root, 'checkpoints.json');
  await writeFile(bad, '{"checkpoints": {"X:CP4": 98765.4321');
  await assert.rejects(loadContent(f.root, { checkpointsFile: bad }), (e: Error) => /data\/truth\/checkpoints\.json is not valid JSON/.test(e.message) && !e.message.includes('98765'));
});

test('a case key is the file named after its case: a key file holding another case ID is still that case\'s key (C41 then fails it)', async () => {
  const f = await makeCaseFixture({ keys: (ks) => { ks.find((k) => k.case_id === DAILY_ID)!.case_id = 'CASE-DAILY-L1-09'; } });
  // makeCaseFixture names each key file after the case_id it holds: put the edited key back under the daily case's name.
  const { rename } = await import('node:fs/promises');
  await rename(join(f.root, 'keys/cases', 'CASE-DAILY-L1-09.json'), join(f.root, 'keys/cases', `${DAILY_ID}.json`));
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  assert.equal(store.caseKey!(DAILY_ID)?.case_id, 'CASE-DAILY-L1-09');
  assert.equal(store.caseKey!('CASE-DAILY-L1-09'), undefined);
  assert.deepEqual(store.caseKeyIds!(), [DAILY_ID, INBOX_ID, OPENER_ID], 'every key file by name, in name order');
});

test('S6-13: a registry dataset\'s case names the dataset by its registry name, never its whole data label', () => {
  const rec = { case_id: 'CASE-REAL-09', schema: 'online_retail_ii',
    data_source: { label: 'Real data: Online Retail II, two years of invoice lines. Source: UCI. Licence: CC BY 4.0.', real: true, licence: 'CC BY 4.0' } } as never;
  const store = { builtSchemas: () => new Set(['voltmarkt']), datasetOfSchema: (s: string) => (s === 'online_retail_ii' ? { name: 'Online Retail II' } : undefined) } as never;
  assert.equal(caseUnavailable(store, rec), unavailableLine('Online Retail II'));
  assert.doesNotMatch(caseUnavailable(store, rec)!, /\.\./, 'no double full stop');
});

test('S6-13: a case is unavailable only when the build named its schemas and its own is not among them; the line names the dataset', async () => {
  const f = await makeCaseFixture({ records: (r) => { r.inbox.schema = 'mailvora'; r.inbox.data_source = { label: 'Fictional, generated data: Mailvora', real: false, licence: null };
    r.daily.schema = 'online_retail_ii'; r.daily.data_source = { label: 'Online Retail II', real: true, licence: 'CC BY 4.0' }; },
  file: (x) => { x.schemas = ['voltmarkt', 'voltmarkt_edge_basics']; } });
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  assert.equal(caseUnavailable(store, store.case!(OPENER_ID)!), null, 'voltmarkt is built');
  assert.equal(caseUnavailable(store, store.case!(INBOX_ID)!), 'This case needs Mailvora. Run `npm run prep:datasets -- --from <your downloads folder>`, then start the app again.');
  assert.equal(caseUnavailable(store, store.case!(DAILY_ID)!), unavailableLine('Online Retail II'));
  assert.equal(unavailableLine('Online Retail II'), 'This case needs Online Retail II. Run `npm run prep:datasets -- --from <your downloads folder>`, then start the app again.');
  const unknown = await loadContent((await makeCaseFixture({ records: (r) => { r.inbox.schema = 'mailvora'; } })).root, {});
  assert.equal(caseUnavailable(unknown, unknown.case!(INBOX_ID)!), null, 'an older build names no schemas: nothing is unavailable');
});

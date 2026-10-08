// tests/server/readings.test.ts: GA4 and Methodology readings and concept maps (design §8, §9, §14; D12, E-117, E-122; Task C5).
// The reading validator, the loader, GET /api/readings/:section/:id and GET /api/<section>/concepts. Every concept, item and
// reading here is invented, except the last test, which validates the committed readings without printing them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { READING_MAX_WORDS, linksIn, readingWords, validateReading, type Reading } from '../../schemas/reading.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import type { ChoiceConceptView, ReadingView } from '../../server/routes/sections.ts';
import { api, type ChoiceConceptView as WebConceptView, type ReadingView as WebReadingView } from '../../web/src/api.ts';
import { CHILD, OTHER, PARENT, METRIC, ga4Files, ga4Item, makeChoiceRoot, mcqKey, methodologyFiles } from '../helpers/choice-fixture.ts';

const reading = (concept_id: string, over: Record<string, unknown> = {}): Reading & Record<string, unknown> => ({
  concept_id, section: 'ga4', version: 1, title: `An invented reading for ${concept_id}`,
  reading_md: '**What it is.** An invented widget panel groups made-up widgets.\n\n- One panel holds many widgets. (Unverified)\n- A glow mode arrived this year. (New in 2026)',
  source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', ...over,
});
const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

// ---- the validator ----------------------------------------------------------------------------------------------------------

test('validateReading accepts the committed shape and names every fault', () => {
  assert.deepEqual(validateReading(reading(PARENT)), []);
  assert.deepEqual(validateReading(reading(PARENT), { section: 'ga4', concept_id: PARENT }), []);
  assert.deepEqual(validateReading({ ...reading(METRIC), section: 'methodology' }, { section: 'methodology' }), []);
  const faults: [Record<string, unknown>, RegExp][] = [
    [{ section: 'sql' }, /section must be ga4 or methodology/],
    [{ concept_id: 'SQL-BASICS-01' }, /concept_id must be a GA4 concept ID/],
    [{ version: 0 }, /version must be a positive integer/],
    [{ title: ' ' }, /title is missing/],
    [{ reading_md: '' }, /reading_md is missing/],
    [{ reading_md: words(READING_MAX_WORDS + 1) }, new RegExp(`reading_md has ${READING_MAX_WORDS + 1} words; at most ${READING_MAX_WORDS}`)],
    [{ source_ids: [] }, /source_ids must name at least one source/],
    [{ source_ids: ['06:x', ''] }, /source_ids must name at least one source/],
    [{ verified: 'yes' }, /verified must be a boolean/],
    [{ as_of: '4 October' }, /as_of must be YYYY-MM-DD/],
  ];
  for (const [over, message] of faults) assert.match(validateReading(reading(PARENT, over)).join('; '), message, JSON.stringify(over));
  assert.deepEqual(validateReading(null), ['a reading must be an object']);
  assert.match(validateReading(reading(PARENT), { section: 'methodology' }).join('; '), /section must be methodology/);
  assert.match(validateReading(reading(PARENT), { concept_id: OTHER }).join('; '), new RegExp(`concept_id must be ${OTHER}, the file's name`));
  assert.deepEqual(validateReading(reading(PARENT, { reading_md: words(READING_MAX_WORDS) })), [], 'the cap itself is allowed');
});

test('E-122: a reading links nowhere real; made-up sites use the example domains', () => {
  for (const link of ['https://wallet.invented-credentials.net/u/42', 'http://support.google.com/analytics', 'www.invented.org/x', 'see invented-wallet.com/me']) {
    assert.match(validateReading(reading(PARENT, { reading_md: `Read this: ${link} now.` })).join('; '), /link/, link);
    assert.equal(validateReading(reading(PARENT, { title: `Panel ${link}` })).some((m) => /link/.test(m)), true, `${link} in the title`);
  }
  for (const fine of ['shop.example.com and pay.example.com', 'https://www.example.org/basket', 'gtag.js and analytics.js', 'e.g. a widget', 'a 2.5% rate']) {
    assert.deepEqual(validateReading(reading(PARENT, { reading_md: `Cross-domain: ${fine}.` })), [], fine);
  }
  assert.deepEqual(linksIn('One https://a.invented.net/x, then www.b.invented.org and c.invented.io/p.'), ['https://a.invented.net/x', 'www.b.invented.org', 'c.invented.io/p']);
});

test('readingWords counts words, not markdown marks or table pipes', () => {
  assert.equal(readingWords('**What it is.** One two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- three'), 10);
  assert.equal(readingWords(''), 0);
});

// ---- the loader ---------------------------------------------------------------------------------------------------------------

async function rootWithReadings(files: Record<string, unknown>, section: 'ga4' | 'methodology' = 'ga4'): Promise<string> {
  const root = await makeChoiceRoot();
  await mkdir(join(root, section, 'readings'), { recursive: true });
  for (const [name, x] of Object.entries(files)) await writeFile(join(root, section, 'readings', name), typeof x === 'string' ? x : JSON.stringify(x, null, 2));
  return root;
}

test('the loader reads each section\'s readings in concept order; a faulty reading is left out and named with why', async () => {
  const root = await rootWithReadings({
    [`${OTHER}.json`]: reading(OTHER),
    [`${PARENT}.json`]: reading(PARENT),
    [`${CHILD}.json`]: reading(CHILD),                                              // E-117: a 10 concept is taught inside its parent
    'GA4-NONE-01.json': reading('GA4-NONE-01'),                                      // not a concept of the section
    'GA4-MISNAMED-01.json': reading(OTHER, { title: 'Filed under another name' }),
    'GA4-LONG-01.json': reading('GA4-LONG-01', { reading_md: words(READING_MAX_WORDS + 5) }),
  });
  const store = await loadContent(root);
  assert.deepEqual(store.readings?.('ga4').map((r) => r.concept_id), [PARENT, OTHER], 'the concepts file\'s order');
  assert.equal(store.reading?.('ga4', PARENT)?.title, `An invented reading for ${PARENT}`);
  assert.equal(store.reading?.('ga4', CHILD), undefined);
  assert.equal(store.reading?.('methodology', PARENT), undefined, 'a GA4 reading is not in Methodology');
  assert.deepEqual(store.readings?.('methodology'), []);
  const faults = new Map(store.readingFaults?.().map((f) => [f.file, f.problems.join('; ')]));
  assert.deepEqual([...faults.keys()].sort(), [`ga4/readings/${CHILD}.json`, 'ga4/readings/GA4-LONG-01.json', 'ga4/readings/GA4-MISNAMED-01.json', 'ga4/readings/GA4-NONE-01.json']);
  assert.match(faults.get(`ga4/readings/${CHILD}.json`)!, /a 10 concept is taught inside its parent's reading \(E-117\)/);
  assert.match(faults.get('ga4/readings/GA4-NONE-01.json')!, /not a concept of ga4/);
  assert.match(faults.get('ga4/readings/GA4-MISNAMED-01.json')!, /the file's name/);
  assert.match(faults.get('ga4/readings/GA4-LONG-01.json')!, /words; at most/);
});

test('readings are part of the content version; a broken reading file is named; no folder means no readings', async () => {
  const bare = await makeChoiceRoot();
  const before = await loadContent(bare);
  assert.deepEqual([before.readings?.('ga4'), before.readingFaults?.()], [[], []]);
  await mkdir(join(bare, 'ga4', 'readings'), { recursive: true });
  await writeFile(join(bare, 'ga4', 'readings', `${PARENT}.json`), JSON.stringify(reading(PARENT)));
  assert.notEqual((await loadContent(bare)).contentVersion, before.contentVersion);
  await writeFile(join(bare, 'ga4', 'readings', `${PARENT}.json`), '{ not json');
  await assert.rejects(loadContent(bare), new RegExp(`^Error: ga4/readings/${PARENT}\\.json: `));
});

test('the loader lists each section\'s concepts and items in file order, held-out items included', async () => {
  const store = await loadContent(await makeChoiceRoot());
  assert.deepEqual(store.choiceConcepts?.('ga4').map((c) => c.id), [PARENT, OTHER, CHILD]);
  assert.deepEqual(store.choiceConcepts?.('methodology').map((c) => c.id), [METRIC]);
  assert.deepEqual(store.choiceItems?.('ga4').map((i) => i.id), ['Q-GA4-901', 'Q-GA4-902', 'Q-GA4-903', 'Q-GA4-904']);
  assert.deepEqual(store.choiceItems?.('methodology').map((i) => i.id), ['Q-MET-901', 'Q-MET-902']);
});

// ---- the routes ---------------------------------------------------------------------------------------------------------------

const H = { host: '127.0.0.1:5174' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

/** `exposures` are in the attempt log (where exposures are written) before the app starts. */
async function deps(content: ContentStore, seed: { exposures?: object[] } = {}): Promise<AppDeps> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-readings-'))));
  for (const r of seed.exposures ?? []) await logger.exposure(r as never);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state };
}

test('GET /api/readings/:section/:id: the reading to show, nothing logged; 404 for none or a faulty one, 400 for another section', async () => {
  const content = await loadContent(await rootWithReadings({ [`${PARENT}.json`]: reading(PARENT), [`${CHILD}.json`]: reading(CHILD) }));
  const d = await deps(content);
  const app = createApp(d);
  const r = await get(app, `/api/readings/ga4/${PARENT}`);
  assert.equal(r.status, 200);
  const body = await r.json() as ReadingView;
  assert.deepEqual(Object.keys(body).sort(), ['as_of', 'concept_id', 'reading_md', 'section', 'title', 'verified', 'version']);
  assert.deepEqual([body.concept_id, body.section, body.title, body.verified, body.as_of], [PARENT, 'ga4', `An invented reading for ${PARENT}`, true, '2026-10-04']);
  assert.equal(body.reading_md, reading(PARENT).reading_md);
  assert.equal((await get(app, `/api/readings/ga4/${OTHER}`)).status, 404, 'no reading yet (sprint 3)');
  assert.equal((await get(app, `/api/readings/ga4/${CHILD}`)).status, 404, 'a faulty reading is never served');
  assert.equal((await get(app, `/api/readings/methodology/${PARENT}`)).status, 404);
  assert.equal((await get(app, `/api/readings/sql/${PARENT}`)).status, 400);
  assert.deepEqual([await d.logger.readAll('attempts'), await d.logger.readAll('events')], [[], []], 'a GET starts no session and logs no exposure');
});

test('GET /api/ga4/concepts: the parents in Today\'s order with their children nested, states, a reading where one exists, practice on every parent', async () => {
  const files = ga4Files();
  // OTHER's items are all held out or retired: the map still offers Practice (nothing is locked), and says there is none yet.
  files.items = [...files.items.map((i) => ((i as { id: string }).id === 'Q-GA4-904' ? { ...(i as object), held_out: true } : i)),
    ga4Item('Q-GA4-905', OTHER, { status: 'retired' })];
  files.keys = [...files.keys, mcqKey('Q-GA4-905')];
  const root = await makeChoiceRoot(files, methodologyFiles());
  await mkdir(join(root, 'ga4', 'readings'), { recursive: true });
  await writeFile(join(root, 'ga4', 'readings', `${PARENT}.json`), JSON.stringify(reading(PARENT)));
  const content = await loadContent(root);
  const exposed = { record: 'exposure', schema_version: SCHEMA_VERSION, ts: new Date(Date.now() - 60_000).toISOString(), concept_id: PARENT, kind: 'reading' };
  const d = await deps(content, { exposures: [exposed] });
  const app = createApp(d);
  const r = await get(app, '/api/ga4/concepts');
  assert.equal(r.status, 200);
  const text = await r.text();
  const body = JSON.parse(text) as { section: string; concepts: ChoiceConceptView[] };
  assert.equal(body.section, 'ga4');
  assert.deepEqual(body.concepts, [
    { id: PARENT, title: 'An invented parent', topic_id: 'T-GA4-01', level: 1, verified: true, state: 'learning', hasReading: true, hasPractice: true,
      children: [{ id: CHILD, title: 'An invented child', topic_id: 'T-GA4-02', verified: true }] },
    { id: OTHER, title: 'Another invented parent', topic_id: 'T-GA4-02', level: null, verified: true, state: 'new', hasReading: false, hasPractice: false, children: [] },
  ]);
  for (const secret of ['Q-GA4-9', 'correct_oid', 'explanation', 'stem']) assert.ok(!text.includes(secret), `no ${secret}`);
  const met = await json(get(app, '/api/methodology/concepts'));
  assert.deepEqual(met.concepts.map((c: ChoiceConceptView) => [c.id, c.state, c.hasReading, c.hasPractice]), [[METRIC, 'new', false, true]]);
  assert.equal((await get(app, '/api/sql/concepts')).status, 404);
  assert.deepEqual([(await d.logger.readAll('attempts')).length, await d.logger.readAll('events')], [1, []], 'a GET logs nothing and starts no session');
});

test('the server\'s reading and concept views fit the browser\'s types, and the browser calls the routes', async (t) => {
  // Compile-time: npm run typecheck fails here when the server's views and web/src/api.ts drift apart.
  const fitsReading = (v: ReadingView): WebReadingView => v;
  const fitsConcept = (v: ChoiceConceptView): WebConceptView => v;
  assert.deepEqual([fitsReading, fitsConcept].map((f) => typeof f), ['function', 'function']);
  const sent: string[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    sent.push(path);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await api.reading('ga4', 'GA4-SETUP-01');
  await api.choiceConcepts('ga4');
  assert.deepEqual(sent, ['/api/readings/ga4/GA4-SETUP-01', '/api/ga4/concepts']);
});

// ---- the committed readings (validated, never printed) ------------------------------------------------------------------------

test('every committed GA4 and Methodology reading passes the validator, and each D12 GA4 concept has one', async () => {
  const store = await loadContent('content');
  assert.deepEqual(store.readingFaults?.().map((f) => f.file), [], 'faulty readings (file names only)');
  for (const id of ['GA4-SETUP-01', 'GA4-EVENTS-01', 'GA4-EVENTS-02', 'GA4-METRICS-01']) assert.ok(store.reading?.('ga4', id), `${id} has a reading (D12)`);
  assert.equal(store.readings?.('ga4').length, 16, 'a lesson for each of the 16 GA4 parents (S3-20)');
  const conceptIds = (JSON.parse(await readFile('content/methodology/concepts.json', 'utf8')) as { concepts: { id: string }[] }).concepts.map((c) => c.id);
  const readingIds = (store.readings?.('methodology') ?? []).map((r) => r.concept_id);
  assert.deepEqual([...readingIds].sort(), [...conceptIds].sort(), 'each Methodology concept has exactly one reading, and no reading is without a concept');
});

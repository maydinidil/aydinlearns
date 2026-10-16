// tests/server/practice-order-d59.test.ts: D59 through POST /api/serve (sprint 5a B1 M3; backlog "Test gaps from sprint 5a", K7a). Today's
// practice step for GA4 and Methodology serves the concepts started in the last 7 days in turn; a concept whose lesson window is open
// (a reading under 15 minutes old) goes after every other candidate. The pure parts are tested in methodology-78.test.ts; this drives the
// route, so a change to how the route builds the window or hands it to the picker is seen. Every ID, stem and option is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { ChoiceConcept } from '../../schemas/choice.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { ga4Files, makeChoiceRoot, mcqKey, metMcq, OTHER, PARENT, type SectionFiles } from '../helpers/choice-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const reading = (concept_id: string, ts: string) => ({ record: 'exposure', schema_version: SCHEMA_VERSION, ts, concept_id, kind: 'reading' });

async function appOn(store: ContentStore, seed: object[]): Promise<Hono> {
  const logsDir = await mkdtemp(join(tmpdir(), 'al-d59-'));
  made.push(logsDir);
  const logger = new AttemptLogger(openJsonlLog(logsDir));
  for (const r of seed) await logger.attempt(r as never);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return createApp({ port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state });
}

/** Two Methodology concepts with one multiple-choice question each, the same shape as the GA4 bank's two concepts. */
const MET_A = 'MET-FAKE-01';
const MET_B = 'MET-FAKE-02';
function methodologyTwo(): SectionFiles {
  const concepts: ChoiceConcept[] = [
    { id: MET_A, parent_id: null, topic_id: 'MET-FAKE', title: 'An invented metric', level: 1, verified: true },
    { id: MET_B, parent_id: null, topic_id: 'MET-FAKE', title: 'Another invented metric', level: 1, verified: true },
  ];
  const items = [metMcq('Q-MET-911', { concept_id: MET_A, target_concept_id: MET_A } as never), metMcq('Q-MET-912', { concept_id: MET_B, target_concept_id: MET_B } as never)];
  return { concepts, items, keys: items.map((i) => mcqKey(i.id, 1, { explanation: 'The invented ratio named second in the made-up glossary answers it.' })) };
}

interface Section { section: 'ga4' | 'methodology'; a: string; b: string; itemOf: Record<string, string[]>; files: () => SectionFiles }
const SECTIONS: Section[] = [
  { section: 'ga4', a: PARENT, b: OTHER, itemOf: { [PARENT]: ['Q-GA4-901', 'Q-GA4-902'], [OTHER]: ['Q-GA4-904'] }, files: ga4Files },
  { section: 'methodology', a: MET_A, b: MET_B, itemOf: { [MET_A]: ['Q-MET-911'], [MET_B]: ['Q-MET-912'] }, files: methodologyTwo },
];

for (const s of SECTIONS) {
  const store = async (): Promise<ContentStore> => {
    const root = s.section === 'ga4' ? await makeChoiceRoot(s.files()) : await makeChoiceRoot(ga4Files(), s.files());
    made.push(root);
    await mkdir(join(root, `${s.section}/readings`), { recursive: true });
    return loadContent(root);
  };
  const served = async (seed: object[]): Promise<string> => {
    const r = await post(await appOn(await store(), seed), '/api/serve', { section: s.section, purpose: 'practice' });
    assert.equal(r.status, 200);
    return (await r.json()).item_id as string;
  };
  const conceptOf = (itemId: string): string => Object.entries(s.itemOf).find(([, ids]) => ids.includes(itemId))![0];

  test(`D59 through /api/serve (${s.section}): with no window open, practice starts with the concept read most recently`, async () => {
    // Both read long ago, so neither is in its window; the step lists the newest reading first and, with nothing served, that one is picked.
    const first = await served([reading(s.a, ago(5 * 3_600_000)), reading(s.b, ago(3 * 3_600_000))]);
    assert.equal(conceptOf(first), s.b, 'the newer reading first');
    const reversed = await served([reading(s.a, ago(3 * 3_600_000)), reading(s.b, ago(5 * 3_600_000))]);
    assert.equal(conceptOf(reversed), s.a);
  });

  test(`D59 through /api/serve (${s.section}): the concept read a minute ago, whose window is open, is served after the other one`, async () => {
    // The window-open concept is also the newest reading, the one the order alone would serve first.
    const first = await served([reading(s.a, ago(3 * 3_600_000)), reading(s.b, ago(MIN))]);
    assert.equal(conceptOf(first), s.a, 'b is in its window, so a goes first');
    const other = await served([reading(s.b, ago(3 * 3_600_000)), reading(s.a, ago(MIN))]);
    assert.equal(conceptOf(other), s.b, 'the same with the roles swapped');
  });

  test(`D59 through /api/serve (${s.section}): a window of 16 minutes is shut, and when both windows are open the usual order holds`, async () => {
    const shut = await served([reading(s.a, ago(3 * 3_600_000)), reading(s.b, ago(16 * MIN))]);
    assert.equal(conceptOf(shut), s.b, 'a 16-minute-old reading is outside the 15-minute window: the newest reading first, as with no window');
    const both = await served([reading(s.a, ago(2 * MIN)), reading(s.b, ago(MIN))]);
    assert.equal(conceptOf(both), s.b, 'both windows open: the existing order, newest reading first');
  });
}

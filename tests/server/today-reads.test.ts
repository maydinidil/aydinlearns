// tests/server/today-reads.test.ts: how often Today reads the attempt file (sprint 6 Task B3; sprint 4b D3-m1, sprint 5a B1 M2). The
// file grows with every answer, so Today reads it only where a step needs it: for SQL, the daily case (and the re-test), and once in
// the GA4 and Methodology practice step, where D59's lesson window used to read it a second time. Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { DAILY_ID, makeCaseFixture } from '../helpers/case-fixture.ts';
import { ga4Files, makeChoiceRoot, PARENT, OTHER } from '../helpers/choice-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });

/** The app on `store`, and a count of the attempt file's reads made through the logger after it started. */
async function counted(store: ContentStore, seed: object[] = []): Promise<{ app: Hono; reads: () => number }> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-reads-'))));
  for (const r of seed) await logger.attempt(r as never);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  let n = 0;
  const readAll = logger.readAll.bind(logger);
  logger.readAll = (async (file: 'attempts' | 'events') => { if (file === 'attempts') n++; return readAll(file); }) as typeof logger.readAll;
  const d: AppDeps = { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state };
  return { app: createApp(d), reads: () => n };
}

test('GA4 practice: Today\'s practice step reads the attempt file once (D59 reuses the read of the plan)', async () => {
  const root = await makeChoiceRoot(ga4Files());
  await mkdir(join(root, 'ga4/readings'), { recursive: true });
  const store = await loadContent(root);
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const reading = (concept_id: string, ts: string) => ({ record: 'exposure', schema_version: SCHEMA_VERSION, ts, concept_id, kind: 'reading' });
  const { app, reads } = await counted(store, [reading(PARENT, ago(2 * 3_600_000)), reading(OTHER, ago(3_600_000))]);
  const r = await post(app, '/api/serve', { section: 'ga4', purpose: 'practice' });
  assert.equal(r.status, 200);
  assert.equal(reads(), 1, 'one read for the plan and the lesson window together');
});

test('SQL: a serve reads the attempt file only for the daily case, and once', async () => {
  const f = await makeCaseFixture();
  const withDaily = await counted(await loadContent(f.root, { truthFile: f.truthFile }));
  await post(withDaily.app, '/api/serve', { section: 'sql', purpose: 'review' });
  assert.equal(withDaily.reads(), 1, 'the daily case reads it, once');
  await rm(join(f.root, 'sql/cases', `${DAILY_ID}.json`));
  const none = await counted(await loadContent(f.root, { truthFile: f.truthFile }));
  await post(none.app, '/api/serve', { section: 'sql', purpose: 'review' });
  await post(none.app, '/api/mixed/start', { section: 'sql' });
  assert.equal(none.reads(), 0, 'no daily case: no read');
});

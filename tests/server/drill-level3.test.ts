// tests/server/drill-level3.test.ts: the level 3 drill entry (sprint 4a Task B2, controller ruling P-3). content/sql/drills.json
// gains level 3 (10 questions, 20 minutes, 90% to pass, normal mode, the 8 level 3 concepts) with an empty pool until Task B3
// writes it. Today's server code, unchanged, must list it as not available and start no run from it.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { loadDrills } from '../../server/drill.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds } from '../../server/main.ts';
import { startRunner } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };

// The real content, so the drill reads the shipped drills.json and the real items exactly as the app does.
const content = await loadContent('content');
const LEVEL3 = content.curriculum.concepts.filter((c) => c.level === 3).map((c) => c.id);

test('drills.json: the level 3 entry is 10 questions in 20 minutes at 90%, normal mode, the 8 level 3 concepts in order, and its pool is the 5 drill items of each (Task B3)', async () => {
  const shipped = await loadDrills();
  assert.deepEqual(shipped.map((s) => s.level), [1, 2, 3]);
  const { pool_item_ids: pool, ...spec } = shipped.find((s) => s.level === 3)!;
  assert.deepEqual(spec, { level: 3, questions: 10, minutes: 20, pass_pct: 90, concepts: LEVEL3, unseen_min_pct: 70, mode: 'normal' });
  assert.deepEqual([...pool].sort(), LEVEL3.flatMap((c) => ['E1-21', 'E1-22', 'E2-21', 'E2-22', 'E3-21'].map((s) => `EX-${c}-${s}`)).sort());
  assert.deepEqual(LEVEL3, ['SQL-DATE-01', 'SQL-JOIN-01', 'SQL-JOIN-02', 'SQL-CTE-01', 'SQL-JOIN-03', 'SQL-JOIN-04', 'SQL-JOIN-05', 'SQL-SET-01']);
});

test('with its pool written (Task B3) the drill list shows level 3 as available, and a level 3 run starts with 10 servings', async () => {
  const runner = await startRunner(await makeFixtureDb(['CREATE SCHEMA voltmarkt']));
  after(() => runner.close());
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-drill3-'))));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const app = createApp({ port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds([]), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() });

  const listed = await (await app.request('http://127.0.0.1:5174/api/drill/history?level=3', { headers: H })).json() as { drill: Record<string, unknown> | null; runs: unknown[] };
  assert.deepEqual(listed.drill, { level: 3, questions: 10, minutes: 20, pass_pct: 90, unseen_min_pct: 70, available: true });
  assert.deepEqual(listed.runs, []);
  // Levels 1 and 2 keep their written pools, so they stay available.
  for (const level of [1, 2]) {
    const h = await (await app.request(`http://127.0.0.1:5174/api/drill/history?level=${level}`, { headers: H })).json() as { drill: { available: boolean } };
    assert.equal(h.drill.available, true, `level ${level}`);
  }
  const start = await app.request('http://127.0.0.1:5174/api/drill/start', { method: 'POST', headers: P, body: JSON.stringify({ level: 3 }) });
  assert.equal(start.status, 200);
  const run = (await start.json()) as { level: number; servings: { item_id: string }[] };
  assert.equal(run.level, 3);
  assert.equal(run.servings.length, 10);
  assert.ok(run.servings.every((sv) => LEVEL3.some((c) => sv.item_id.startsWith(`EX-${c}-`))), 'every serving is a level 3 drill item');
});

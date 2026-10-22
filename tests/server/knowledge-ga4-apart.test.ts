// tests/server/knowledge-ga4-apart.test.ts: the knowledge mock kept apart from the GA4 runs (sprint 7 Part 2, Task N1; S7-11; Review Focus
// 5). Every GA4 run path (examHistory and the retake rule, GET /api/run/history, the preview's retake dates, the readiness check) ignores a
// block whose answers carry run_kind knowledge_mock or whose block has a knowledge mock_open; and the GA4 half and full mock pool never
// holds a knowledge-pool item. The history fixture: a GA4 half-mock 3 days ago on 4 exam-pool questions, then a knowledge mock a day ago
// whose logged answers are GA4 only (as after a crash) and re-show one of those questions and answer a knowledge-pool question. Every
// question is invented (tests/helpers/knowledge-fixture.ts).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { optionId } from '../../schemas/choice.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds } from '../../server/main.ts';
import { choiceRuns, examHistory, ga4ExamPool } from '../../server/run.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { checkFullMockPool } from '../../tools/check-content.ts';
import { EXAM, EXAM_POOL, GA4_PARENTS, KNOWLEDGE_POOL, RIGHT, makeKnowledgeFixture, topicOf } from '../helpers/knowledge-fixture.ts';
import { blockClose, instance } from '../helpers/replay-fixture.ts';

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const root = await makeKnowledgeFixture();
made.push(root);
const content = await loadContent(root);

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** One GA4 question answered in a run's block, closed by the run's end, as the choice routes and the run clock write it. */
function answered(o: { id: string; item: string; block: string; at: number; right: boolean; runKind?: string }): object[] {
  const concept = GA4_PARENTS[topicOf(o.item) === 'T-GA4-01' ? 0 : 1]!;
  const recs = instance({ id: o.id, item: o.item, concept, kind: 'mcq', section: 'ga4', phase: 'mock', block: o.block, version: 2, targetMs: null, start: iso(o.at),
    steps: [{ at: iso(o.at + 500), submit: o.right ? 'pass' : 'fail', confidence: null, errors: [] }], close: { at: iso(o.at + 60_000), reason: 'run_end' } });
  return recs.map((r) => ((r as { record: string }).record === 'attempt'
    ? { ...r, payload: { kind: 'mcq', shown_order: [0, 1, 2, 3].map((i) => optionId(o.item, i)), chosen: o.right ? RIGHT(o.item) : optionId(o.item, 1), ...(o.runKind ? { run_kind: o.runKind } : {}) } }
    : r));
}
const now = Date.now();
const HALF = 'HALF-1';
const half: object[] = [...EXAM_POOL.slice(0, 4).flatMap((item, n) => answered({ id: `H-${n}`, item, block: HALF, at: now - 3 * DAY + n * 1000, right: n < 3, runKind: 'half_mock' })),
  blockClose(HALF, iso(now - 3 * DAY + 60_000))];
const KNOW = 'mock-knowledge-00000000-0000-4000-8000-000000000001';
const opened = (block: string) => ({ record: 'mock_open', schema_version: 7, ts: iso(now - DAY - 1000), session_id: 'S-1', block_id: block, mock: 'knowledge', form_id: 'KNOWLEDGE', minutes: 40, on_unseen: true });
/** The knowledge block: one exam-pool question shown again (its retake date would move), one knowledge-pool question answered (a cold answer). */
const knowledgeBlock = (block: string, o: { open: boolean; runKind: boolean }): object[] => [
  ...(o.open ? [opened(block)] : []),
  ...answered({ id: `${block}-a`, item: EXAM_POOL[0]!, block, at: now - DAY, right: true, ...(o.runKind ? { runKind: 'knowledge_mock' } : {}) }),
  ...answered({ id: `${block}-b`, item: KNOWLEDGE_POOL[0]!, block, at: now - DAY + 1000, right: true, ...(o.runKind ? { runKind: 'knowledge_mock' } : {}) }),
  blockClose(block, iso(now - DAY + 120_000)),
];

async function appOn(log: object[], store: ContentStore = content): Promise<Hono> {
  const dir = await mkdtemp(join(tmpdir(), 'al-knowledge-apart-'));
  made.push(dir);
  const jsonl = openJsonlLog(dir);
  for (const r of log) await jsonl.append('attempts', r as { ts?: string });
  const logger = new AttemptLogger(jsonl);
  const attempts = await logger.readAll('attempts');
  const state = new LearnerState({ content: store, attempts, events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const endHooks: AppDeps['endHooks'] = [];
  return createApp({ port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds(attempts), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state });
}
/** Everything the GA4 run paths answer: the history's runs, the preview's retake dates and the readiness check. */
async function ga4Paths(app: Hono) {
  return { history: (await json(get(app, '/api/run/history?section=ga4'))).runs, preview: await json(get(app, '/api/run/preview')), readiness: await json(get(app, '/api/ga4/readiness')) };
}

test('S7-11: a knowledge mock block leaves the GA4 history, the retake dates and the readiness check as they are without it, by either sign', async () => {
  const without = await ga4Paths(await appOn(half));
  assert.equal(without.history.length, 1, 'the half-mock');
  assert.notEqual(without.preview.next_unseen_date.full_mock, null, 'a full mock now holds seen questions, so the preview has a date');
  const signs = [['mock_open and run_kind', { open: true, runKind: true }], ['run_kind only', { open: false, runKind: true }], ['mock_open only', { open: true, runKind: false }]] as const;
  for (const [k, [name, o]] of signs.entries()) {
    assert.deepEqual(await ga4Paths(await appOn([...half, ...knowledgeBlock(`${KNOW}-${k}`, o)])), without, name);
  }
});

test('S7-11: the test bites: the same answers in a GA4 block of their own change the history, the retake dates and the readiness check', async () => {
  const without = await ga4Paths(await appOn(half));
  const other = await ga4Paths(await appOn([...half, ...knowledgeBlock('HALF-2', { open: false, runKind: false })]));
  assert.notDeepEqual(other.history, without.history);
  assert.notDeepEqual(other.preview, without.preview);
  assert.notDeepEqual(other.readiness, without.readiness);
});

test('S7-11: examHistory and choiceRuns read no knowledge block', () => {
  const log = [...half, ...knowledgeBlock(KNOW, { open: true, runKind: true })];
  assert.deepEqual(examHistory(log), examHistory(half));
  const cfg = content.ga4Exam!()!;
  const runs = choiceRuns(log, { cfg, itemOf: (id) => content.choiceItem?.(id) });
  assert.deepEqual(runs.map((r) => r.block_id), [HALF]);
});

test('S7-11: the GA4 half and full mock pool is the exam pool only: never a knowledge-pool question; the full mock draws from it, and C46 counts it', async () => {
  assert.deepEqual(ga4ExamPool(content).map((i) => i.id).sort(), [...EXAM_POOL].sort());
  const app = await appOn([]);
  const full = await json(post(app, '/api/run/start', { section: 'ga4', kind: 'full_mock' }));
  assert.deepEqual((full.servings as { item_id: string }[]).map((s) => s.item_id).sort(), [...EXAM_POOL].sort(), 'its 8 questions, all from the exam pool');
  await post(app, '/api/run/end', { block_id: full.block_id });
  assert.deepEqual(checkFullMockPool(content).map((r) => [r.check, r.ok]), [['C46', true]]);
  const longer = await makeKnowledgeFixture();
  made.push(longer);
  await writeFile(join(longer, 'ga4/exam.json'), JSON.stringify({ ...EXAM, blueprints: [{ ...EXAM.blueprints[0]!, full_mock: { ...EXAM.blueprints[0]!.full_mock, questions: 9 } }] }));
  const store = await loadContent(longer);
  assert.match(checkFullMockPool(store)[0]!.detail, /asks 9 questions, more than the 8 of the held-out pool/, 'the 12 knowledge-pool questions do not count');
  const r = await post(await appOn([], store), '/api/run/start', { section: 'ga4', kind: 'full_mock' });
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'The full mock needs 9 questions, and 8 can be drawn now.');
});

test('S7-11: on the shipped content the GA4 full mock\'s pool is still the 50 (counts only)', async () => {
  assert.equal(ga4ExamPool(await loadContent('content')).length, 50);
});

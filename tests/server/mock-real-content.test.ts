// tests/server/mock-real-content.test.ts: sprint 7 Part 2's real-content sweep, kept as a test (sprint 7c, Task X3; F4-5-3; S7-08, S7-11,
// D114). Over the committed content (loadContent('content')), an empty temporary logs folder and a stub runner that must never be asked to
// run anything: the practice, run, submit, hint, show-answer, "other ways", choice, serve, case and opener routes and the tutor's source
// answer 404 (or leave them out) for every mock ID (the mock items, the mock cases, their checkpoints), every knowledge-pool GA4 item and
// every held-out Methodology item. C54 to C56 pin the references; this pins the routes. It prints IDs and counts only, never a prompt.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import type { RunnerClient } from '../../server/runner/client.ts';
import { choicePool } from '../../server/session-composer.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { tutorSource } from '../../server/tutor-source.ts';

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });

const content = await loadContent('content');
/** Every mock item (the screen mock's questions and each mock case's CP3), every mock case, and each of their checkpoint IDs. */
const mockItems = (content.mockItems?.() ?? []).map((i) => i.id);
const mockCases = (content.mockCases?.() ?? []).map((c) => c.case_id);
const checkpoints = (content.mockCases?.() ?? []).flatMap((c) => c.checkpoints.map((cp) => cp.item_id).filter((id): id is string => typeof id === 'string'));
const sqlIds = [...new Set([...mockItems, ...checkpoints])];
/** The knowledge mock's GA4 pool and the held-out Methodology items. */
const pool = content.knowledgePool?.() ?? [];
const heldMethodology = (content.choiceItems?.('methodology') ?? []).filter((i) => content.heldOut?.(i.id) === true).map((i) => i.id);
const choiceIds: [section: 'ga4' | 'methodology', id: string][] = [...pool.map((id) => ['ga4', id] as ['ga4', string]), ...heldMethodology.map((id) => ['methodology', id] as ['methodology', string])];
const held = new Set([...sqlIds, ...mockCases, ...pool, ...heldMethodology]);

/** A runner that must never be reached: every route refuses before it would run SQL. */
const asked: string[] = [];
const stubRunner: RunnerClient = { request: async (req) => { asked.push(JSON.stringify(Object.keys(req))); return { ok: false, error: { kind: 'crash', message: 'The stub runner runs nothing.' } }; },
  close: async () => {}, restarts: 0 };

const dir = await mkdtemp(join(tmpdir(), 'al-mock-real-'));
made.push(dir);
const logger = new AttemptLogger(openJsonlLog(dir));
const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
logger.onWrite((file, r) => state.record(file, r));
const endHooks: AppDeps['endHooks'] = [];
const app = createApp({ port: 5174, checks: [], runner: stubRunner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
  endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
  settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state });

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (a: Hono, path: string) => a.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (a: Hono, path: string, body: unknown = {}) => a.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
/** The requests in `sent` whose status is not `want`, as "<what> <status>": IDs and statuses only. */
async function notStatus(want: number, sent: [what: string, r: Response | Promise<Response>][]): Promise<string[]> {
  const out: string[] = [];
  for (const [what, r] of sent) { const res = await r; await res.body?.cancel(); if (res.status !== want) out.push(`${what} ${res.status}`); }
  return out;
}

test('F4-5-3: the committed content holds the mock content, the knowledge pool and the held-out Methodology items this sweep covers', (t) => {
  t.diagnostic(`${mockItems.length} mock items, ${mockCases.length} mock cases, ${checkpoints.length} mock checkpoints, ${pool.length} pool items, ${heldMethodology.length} held-out Methodology items`);
  assert.equal(mockItems.length > 0 && mockCases.length > 0 && pool.length > 0 && heldMethodology.length > 0, true);
  assert.deepEqual(mockCases.filter((id) => !/^CASE-(MOCK|TAKE)-[A-Z]$/.test(id)), [], 'every mock case has its mock ID');
});

test('F4-5-3: the sweep is not vacuous: a practice SQL item, an open Methodology question and an inbox case answer 200 on the same app', async () => {
  const sqlItem = (content.sqlItems?.() ?? []).find((i) => i.use === 'pool')!.id;
  const question = (content.choiceItems?.('methodology') ?? []).find((i) => content.heldOut?.(i.id) !== true)!.id;
  const inbox = (content.cases?.() ?? []).find((c) => c.kind === 'inbox')!.case_id;
  assert.deepEqual(await notStatus(200, [[`GET items ${sqlItem}`, get(app, `/api/items/${sqlItem}`)],
    [`choice ${question}`, get(app, `/api/choice/${question}?section=methodology`)], [`GET cases ${inbox}`, get(app, `/api/cases/${inbox}`)]]), []);
});

test('F4-5-3: the SQL practice routes answer 404 for every mock item and mock checkpoint, and the runner is never asked', async () => {
  const sent: [string, Response | Promise<Response>][] = [];
  for (const [n, id] of sqlIds.entries()) {
    const at = { item_id: id, item_instance_id: `I-sweep-${n}` };
    sent.push([`GET items ${id}`, get(app, `/api/items/${encodeURIComponent(id)}`)]);
    sent.push([`run ${id}`, post(app, '/api/run', { ...at, sql: 'SELECT 1' })]);
    sent.push([`submit ${id}`, post(app, '/api/submit', { ...at, sql: 'SELECT 1' })]);
    for (const level of [1, 2, 3]) sent.push([`hint ${level} ${id}`, post(app, '/api/hint', { ...at, level })]);
    sent.push([`show-answer ${id}`, post(app, '/api/show-answer', at)]);
    sent.push([`other-way ${id}`, post(app, '/api/other-way', at)]);
    sent.push([`item-close ${id}`, post(app, '/api/item-close', { ...at, reason: 'left' })]);
    sent.push([`choice sql ${id}`, get(app, `/api/choice/${encodeURIComponent(id)}?section=sql`)]);
  }
  assert.deepEqual(await notStatus(404, sent), [], `${sqlIds.length} IDs, ${sent.length} requests`);
  assert.deepEqual(asked, [], 'the runner was never asked to run a mock item');
});

test('F4-5-3: the choice routes answer 404 for every knowledge-pool GA4 item and every held-out Methodology item, with or without an instance', async () => {
  const sent: [string, Response | Promise<Response>][] = [];
  for (const [n, [section, id]] of choiceIds.entries()) {
    sent.push([`choice ${id}`, get(app, `/api/choice/${id}?section=${section}`)]);
    sent.push([`choice ${id} instance`, get(app, `/api/choice/${id}?section=${section}&instance=I-sweep-choice-${n}`)]);
    sent.push([`answer ${id}`, post(app, '/api/choice/answer', { item_id: id, item_instance_id: `I-sweep-answer-${n}`, chosen: 'x', active_ms: 1000 })]);
    sent.push([`show-answer ${id}`, post(app, '/api/choice/show-answer', { item_id: id, item_instance_id: `I-sweep-show-${n}` })]);
  }
  assert.deepEqual(await notStatus(404, sent), [], `${choiceIds.length} IDs, ${sent.length} requests`);
});

test('F4-5-3: no GA4 or Methodology practice pool holds a held-out item, and serving practice on every concept never serves one', async () => {
  const leaked: string[] = [];
  const served: string[] = [];
  for (const section of ['ga4', 'methodology'] as const) {
    for (const c of content.choiceConcepts?.(section) ?? []) {
      for (const i of choicePool(content, section, c.parent_id ?? c.id)) if (held.has(i.id)) leaked.push(`${section} ${c.id} ${i.id}`);
      const r = await post(app, '/api/serve', { section, purpose: 'practice', concept_id: c.id });
      const body = await r.json() as { item_id?: string };
      if (r.status === 200 && typeof body.item_id === 'string' && held.has(body.item_id)) served.push(`${section} ${c.id} ${body.item_id}`);
    }
  }
  assert.deepEqual(leaked, [], 'the pools');
  assert.deepEqual(served, [], 'the practice serves');
});

test('F4-5-3: the case and opener routes answer 404 for every mock case, and the inbox, the openers and the case serve leave them out', async () => {
  const sent: [string, Response | Promise<Response>][] = [];
  for (const id of mockCases) {
    sent.push([`GET cases ${id}`, get(app, `/api/cases/${id}`)]);
    for (const path of ['checkpoints/CP1/serve', 'checkpoints/CP2/answer', 'plan', 'plan-check', 'sketch', 'insight', 'rubric', 'export']) {
      sent.push([`cases ${id} ${path}`, post(app, `/api/cases/${id}/${path}`, { item_instance_id: 'I-sweep-case', typed: '1', fields: {}, text: 'x', ticked: [] })]);
    }
    sent.push([`openers ${id} cp4 serve`, post(app, `/api/openers/${id}/cp4/serve`)]);
    sent.push([`openers ${id} cp4 answer`, post(app, `/api/openers/${id}/cp4/answer`, { item_instance_id: 'I-sweep-opener', typed: '1' })]);
    sent.push([`serve case ${id}`, post(app, '/api/serve', { section: 'sql', purpose: 'case', case_id: id })]);
    sent.push([`serve opener ${id}`, post(app, '/api/serve', { section: 'sql', purpose: 'opener', case_id: id })]);
  }
  assert.deepEqual(await notStatus(404, sent), [], `${mockCases.length} cases, ${sent.length} requests`);
  const listed = JSON.stringify([await (await get(app, '/api/cases')).json(), await (await get(app, '/api/openers')).json(), await (await get(app, '/api/portfolio')).json()]);
  assert.deepEqual([...held].filter((id) => listed.includes(`"${id}"`)), [], 'the inbox, the openers and the portfolio');
});

test('F4-5-3: the tutor\'s source holds no mock item, mock case, mock checkpoint, pool item or held-out Methodology item', () => {
  const source = tutorSource(content, []);
  assert.deepEqual(sqlIds.filter((id) => source.item(id) !== undefined), [], 'items');
  assert.deepEqual([...sqlIds, ...pool, ...heldMethodology].filter((id) => source.question(id) !== undefined), [], 'questions');
  assert.deepEqual(mockCases.filter((id) => source.caseRecord(id) !== undefined), [], 'cases');
});

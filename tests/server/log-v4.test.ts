// tests/server/log-v4.test.ts: log version 4 in the server (Task B1, D35, D38). The selfCheck writer and the case_export event
// land in the right files and reach the state mirror; the smoke test's seeded history, stamped as version 3, replays to exactly
// the result it gave before, with or without version 4 records beside it (Review Focus 1 of sprint 4b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, type SelfCheck } from '../../core/envelope.ts';
import type { CaseExport } from '../../core/events.ts';
import { openJsonlLog, type LogFile } from '../../core/jsonl.ts';
import { replay, type ReplayResult } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { snapshot } from '../helpers/replay-fixture.ts';

const selfCheck = (ts: string, over: Partial<SelfCheck> = {}): SelfCheck => ({
  record: 'self_check', schema_version: SCHEMA_VERSION, ts, session_id: 'S-V4', kind: 'insight', phase: 'case', case_id: 'CASE-PRICE-01',
  item_instance_id: 'I-CP6', block_id: null, text: 'Prices fell. Volume rose.', fields: null, ticked: [], ...over,
});
const caseExport = (ts: string): CaseExport => ({ event: 'case_export', schema_version: SCHEMA_VERSION, ts, case_id: 'CASE-PRICE-01',
  files: ['CASE-PRICE-01-2026-11-04.md', 'CASE-PRICE-01-2026-11-04.csv'], data_source: 'Fictional, generated data: Voltmarkt' });

test('selfCheck writes to the monthly attempts file and case_export to events.jsonl; both reach the onWrite listeners', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-v4-'));
  const logger = new AttemptLogger(openJsonlLog(dir));
  const seen: [LogFile, string][] = [];
  logger.onWrite((file, r) => seen.push([file, String((r as { record?: string; event?: string }).record ?? (r as { event?: string }).event)]));
  const sc = selfCheck('2026-11-04T09:30:00.000Z');
  const ex = caseExport('2026-11-04T09:31:00.000Z');
  await logger.selfCheck(sc);
  await logger.event(ex);
  assert.deepEqual((await readdir(dir)).sort(), ['attempts-2026-11.jsonl', 'events.jsonl']);
  assert.deepEqual(await logger.readAll('attempts'), [sc]);
  assert.deepEqual(await logger.readAll('events'), [ex]);
  assert.deepEqual(seen, [['attempts', 'self_check'], ['events', 'case_export']]);
  assert.match(await readFile(join(dir, 'attempts-2026-11.jsonl'), 'utf8'), /"schema_version":5/);
});

// tests/fixtures/replay/smoke-history-v2.json holds the smoke test's seeded history and the replay result the code before log
// version 3 gave it (see tests/server/history-v2.test.ts).
const fixture = JSON.parse(await readFile('tests/fixtures/replay/smoke-history-v2.json', 'utf8')) as {
  now: string; attempts: Record<string, unknown>[]; events: Record<string, unknown>[]; result: Record<string, unknown>;
};
const catalog = buildCatalog(await loadContent('content'));
const replayed = (attempts: object[], events: object[]): ReplayResult => replay(attempts, events, replayOptions(catalog, new Date(fixture.now)));
/** The result in the fixture's JSON shape, without what sprint 4a added and sprint 4b's case statuses (as tests/server/history-v2.test.ts compares it). */
function asBefore(r: ReplayResult): unknown {
  const { mistakeCards: _cards, mistakeCandidatesWithoutTraps: _candidates, cases: _cases, ...rest } = JSON.parse(JSON.stringify(snapshot(r))) as Record<string, unknown>;
  rest.concepts = (rest.concepts as [string, { flags: Record<string, unknown> }][]).map(([id, v]) => {
    const { wheelSpinning: _w, ...flags } = v.flags;
    return [id, { ...v, flags }];
  });
  return rest;
}
const v3 = (records: Record<string, unknown>[]): Record<string, unknown>[] => records.map((r) => ({ ...r, schema_version: 3 }));

test('Review Focus 1: the seeded history as version 3 replays to exactly the result it gave before, under version 4 code', () => {
  const r = replayed(v3(fixture.attempts), v3(fixture.events));
  assert.deepEqual(asBefore(r), fixture.result);
  assert.deepEqual(r.warnings, []);
});

test('Review Focus 1: version 4 self_check, case_export and portfolio_folder records beside that history change nothing', () => {
  const attempts = v3(fixture.attempts);
  const events = v3(fixture.events);
  const plain = replayed(attempts, events);
  // Between the history's records: one of each self_check kind, and every new event.
  const times = attempts.map((r) => String(r.submitted_at ?? r.ts)).sort();
  const mid = times[Math.floor(times.length / 2)]!;
  const kinds: SelfCheck['kind'][] = ['plan', 'plan_check', 'sketch', 'insight', 'rubric', 'explained_aloud'];
  const extra = kinds.map((kind) => selfCheck(mid, { kind, phase: kind === 'sketch' ? 'opener_preview' : kind === 'explained_aloud' ? 'drill' : 'case' }));
  const newEvents = [caseExport(mid), { event: 'setting_change', schema_version: SCHEMA_VERSION, ts: mid, key: 'portfolio_folder', value: 'D:\\Portfolio' }];
  const withV4 = replayed([...attempts, ...extra], [...events, ...newEvents]);
  // Task B2: they feed the case status of the case they name (tests/server/cases-replay.test.ts), and nothing else.
  const { cases: _withCases, ...withRest } = snapshot(withV4);
  const { cases: _plainCases, ...plainRest } = snapshot(plain);
  assert.deepEqual(withRest, plainRest);
  assert.deepEqual(asBefore(withV4), fixture.result);
});

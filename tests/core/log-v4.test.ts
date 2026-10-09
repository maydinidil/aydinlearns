// tests/core/log-v4.test.ts: log version 4 (owner decisions D35 and D38, Task B1). The self_check record (S4B-09), the
// case_export event, the portfolio_folder setting and the external result typed as a union on `kind`. Version 3 records still
// parse and replay to the same result, and the version 4 additions rate nothing. Every record here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, type AttemptFileRecord, type SelfCheck } from '../../core/envelope.ts';
import type { AppEvent, CaseExport, ExternalResult, SettingChange } from '../../core/events.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { instance, item, run, sessionEnd, sessionStart, snapshot, A, C, type Log } from '../helpers/replay-fixture.ts';

const TS = '2026-11-04T09:30:00.000Z';
const freshDir = () => mkdtemp(join(tmpdir(), 'al-log-v4-'));

/** One self_check of each kind (S4B-09): the fields a kind does not use are null, and `ticked` is [] when nothing is ticked. */
const selfChecks = (ts: string): SelfCheck[] => {
  const base = { record: 'self_check' as const, schema_version: SCHEMA_VERSION, ts, session_id: 'S-V4', case_id: 'CASE-PRICE-01',
    item_instance_id: null, block_id: null, text: null, fields: null, ticked: [] };
  return [
    { ...base, kind: 'plan', phase: 'case', fields: { metric: 'average price', grain: 'one row per product', tables: 'products, order_lines',
      filters: '2025 only', edge_cases: 'missing prices', row_count: '40' } },
    { ...base, kind: 'plan_check', phase: 'case', ticked: ['grain', 'filters'] },
    { ...base, kind: 'sketch', phase: 'opener_preview', case_id: 'CASE-VOLT-L3', fields: { row: 'one row per month', tables: 'orders', metric: 'revenue' } },
    { ...base, kind: 'insight', phase: 'case', item_instance_id: 'I-CP6', text: 'Prices fell 4 percent. Volume rose. The season may explain part of it.' },
    { ...base, kind: 'rubric', phase: 'case', item_instance_id: 'I-CP6', ticked: ['number', 'direction', 'caveat'] },
    { ...base, kind: 'explained_aloud', phase: 'drill', case_id: null, block_id: 'live-2026-11-04-1', ticked: ['explained_aloud'] },
  ];
};
const caseExport = (ts: string): CaseExport => ({ event: 'case_export', schema_version: SCHEMA_VERSION, ts, case_id: 'CASE-PRICE-01',
  files: ['CASE-PRICE-01-2026-11-04.md', 'CASE-PRICE-01-2026-11-04.csv'], data_source: 'Fictional, generated data: Voltmarkt' });
const portfolioFolder = (ts: string): SettingChange => ({ event: 'setting_change', schema_version: SCHEMA_VERSION, ts, key: 'portfolio_folder', value: 'D:\\Portfolio' });
const externals = (ts: string): ExternalResult[] => [
  { event: 'external_result', schema_version: SCHEMA_VERSION, ts, kind: 'ga4_exam', data: { date: '2026-11-12', score: 82, passed: true } },
  { event: 'external_result', schema_version: SCHEMA_VERSION, ts, kind: 'portfolio_piece', data: { title: 'Tablet prices', data_source: 'Voltmarkt', real_data: false } },
];


test('each self_check kind round-trips through the JSONL writer into the monthly attempts file', async () => {
  const dir = await freshDir();
  const log = openJsonlLog(dir);
  const records: AttemptFileRecord[] = selfChecks(TS);
  for (const r of records) await log.append('attempts', r);
  assert.deepEqual(await readdir(dir), ['attempts-2026-11.jsonl']);
  assert.deepEqual(await log.readAll('attempts'), records);
  assert.deepEqual(records.map((r) => (r as SelfCheck).kind), ['plan', 'plan_check', 'sketch', 'insight', 'rubric', 'explained_aloud']);
});

test('the case_export event, the portfolio_folder setting and both external results round-trip through the JSONL writer', async () => {
  const dir = await freshDir();
  const log = openJsonlLog(dir);
  const events: AppEvent[] = [caseExport(TS), portfolioFolder(TS), ...externals(TS)];
  for (const e of events) await log.append('events', e);
  assert.deepEqual(await readdir(dir), ['events.jsonl']);
  assert.deepEqual(await log.readAll('events'), events);
});

// ---- version 3 records under version 4 code -------------------------------------------------------------------------------
const at = (hms: string): string => `2026-11-03T${hms}Z`;
/** Records as the sprint 4a server writes them (version 3): a review that passes, a failed then passed instance, help and a close. */
function versionThree(): Log {
  const stamp = (records: object[]) => records.map((r) => ({ ...r, schema_version: 3 }));
  const attempts = stamp([
    ...instance({ id: 'V3-1', item: item(A, 'E1-01'), concept: A, start: at('09:01:00'), steps: [{ at: at('09:02:00'), submit: 'fail', errors: ['ERR-LOG-00'] },
      { at: at('09:03:00'), submit: 'pass' }], version: 2 }),
    ...instance({ id: 'V3-2', item: item(C, 'E1-02'), concept: C, start: at('09:05:00'), steps: [{ at: at('09:05:30'), hint: 2 }, { at: at('09:06:30'), submit: 'pass' }], version: 2 }),
    ...instance({ id: 'V3-3', item: item(A, 'E2-01'), concept: A, phase: 'review', start: at('09:10:00'), steps: [{ at: at('09:11:00'), submit: 'pass', activeMs: 50_000 }], version: 2 }),
    { record: 'other_way_opened', ts: at('09:11:30'), item_instance_id: 'V3-3', item_id: item(A, 'E2-01'), target_concept_id: A, phase: 'review' },
  ]);
  const events = stamp([sessionStart('S-V3', at('09:00:00')), sessionEnd('S-V3', at('09:20:00'))]);
  return { attempts, events };
}
/** The same log with every version 4 addition between its records. */
function withVersionFour(log: Log): Log {
  return {
    attempts: [...log.attempts, ...selfChecks(at('09:04:00')), ...selfChecks(at('09:12:00'))],
    events: [...log.events, caseExport(at('09:07:00')), portfolioFolder(at('09:08:00')), ...externals(at('09:09:00'))],
  };
}

test('a version 3 attempt, event and close still parse and replay; the version 4 records change nothing in the result', () => {
  const v3 = versionThree();
  assert.ok(v3.attempts.some((r) => (r as { record: string }).record === 'attempt') && v3.attempts.some((r) => (r as { record: string }).record === 'item_close'));
  const before = run(v3);
  assert.deepEqual(before.warnings, []);
  assert.deepEqual([...before.instances.keys()].sort(), ['V3-1', 'V3-2', 'V3-3'], 'every version 3 instance is read');
  const after = run(withVersionFour(v3));
  assert.deepEqual(snapshot(after), snapshot(before), 'cards, instances, states, sessions, mistake cards and warnings are the same');
});

test('version 3 and version 4 records written through the JSONL writer read back and replay to the same result as in memory', async () => {
  const dir = await freshDir();
  const log = openJsonlLog(dir);
  const mixed = withVersionFour(versionThree());
  for (const r of mixed.attempts) await log.append('attempts', r);
  for (const e of mixed.events) await log.append('events', e);
  const read: Log = { attempts: await log.readAll('attempts'), events: await log.readAll('events') };
  assert.deepEqual(read, mixed);
  assert.deepEqual(snapshot(run(read)), snapshot(run(versionThree())));
});

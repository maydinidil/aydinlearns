// tests/schemas/case-s6.test.ts: the case record and key in sprint 6 (Task B3). S6-13: a case may name the schema its checkpoints
// read (absent means voltmarkt); S6-14: the data quality world `DQ`; the key's `solver` field holds the blind-solve records of CP1,
// CP2, CP4 and CP5. Every case here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_WORLDS, caseSchema, DEFAULT_CASE_SCHEMA, validateCaseKey, validateCaseRecord, type CaseKey } from '../../schemas/case.ts';
import { openerRecord } from '../helpers/case-fixture.ts';

const goodCase = openerRecord();

const withField = (patch: Record<string, unknown>) => ({ ...structuredClone(goodCase), ...patch });

test('S6-13: a case may name its schema; absent means voltmarkt, and a named one is a plain schema name', () => {
  assert.equal(DEFAULT_CASE_SCHEMA, 'voltmarkt');
  assert.equal(caseSchema(goodCase), 'voltmarkt', 'no schema field: voltmarkt');
  assert.equal(caseSchema({ schema: 'mailvora' }), 'mailvora');
  assert.equal(caseSchema({ schema: '' }), 'voltmarkt');
  assert.deepEqual(validateCaseRecord(withField({ schema: 'voltmarkt_raw' })), []);
  assert.deepEqual(validateCaseRecord(withField({ schema: 'mailvora' })), []);
  for (const bad of ['Voltmarkt', 'voltmarkt.orders', 'a b', '', 3, null]) {
    assert.ok(validateCaseRecord(withField({ schema: bad })).some((m) => /schema must be a plain schema name/.test(m)), JSON.stringify(bad));
  }
});

test('S6-14: the worlds are PRICE, RETAIL, MKT and DQ; any other world is refused', () => {
  assert.deepEqual([...CASE_WORLDS], ['PRICE', 'RETAIL', 'MKT', 'DQ']);
  for (const w of CASE_WORLDS) assert.deepEqual(validateCaseRecord(withField({ world: w })), [], w);
  assert.ok(validateCaseRecord(withField({ world: 'SAAS' })).some((m) => /world must be one of PRICE, RETAIL, MKT, DQ/.test(m)));
});

const key: CaseKey = { case_id: 'CASE-VOLT-L1', truths: { CP4: 'SELECT 1' }, choices: {} };

test('a case key may hold solver records for CP1, CP2, CP4 and CP5: pass, prompt hash and time', () => {
  assert.deepEqual(validateCaseKey({ ...key, solver: {} }), [], 'an empty solver field');
  assert.deepEqual(validateCaseKey({ ...key, solver: { CP4: { pass: true, prompt_hash: '0123456789abcdef', at: '2026-10-14T10:00:00.000Z' } } }), []);
  assert.deepEqual(validateCaseKey({ ...key, solver: { CP1: { pass: false, prompt_hash: '0123456789abcdef', at: '2026-10-14T10:00:00.000Z' } } }), [], 'a failed record is kept too');
  const refused = (solver: unknown) => validateCaseKey({ ...key, solver });
  assert.ok(refused([]).some((m) => /solver must be an object of CP1, CP2, CP4 and CP5 records/.test(m)));
  assert.ok(refused({ CP3: { pass: true, prompt_hash: '0123456789abcdef', at: '2026-10-14T10:00:00.000Z' } }).some((m) => /solver may hold only CP1, CP2, CP4 and CP5/.test(m)));
  assert.ok(refused({ CP4: { pass: 'yes', prompt_hash: '0123456789abcdef', at: '2026-10-14T10:00:00.000Z' } }).some((m) => /solver\.CP4 needs pass, prompt_hash and at/.test(m)));
  assert.ok(refused({ CP4: { pass: true, prompt_hash: '0123456789abcdef', at: '2026-10-14T10:00:00.000Z', answer: 'x' } }).some((m) => /solver\.CP4 holds only pass, prompt_hash, key_hash and at/.test(m)),
    'never the answer itself');
  assert.ok(validateCaseKey({ ...key, notes: 'x' }).some((m) => /a case key holds only case_id, truths, choices and solver/.test(m)));
});

test('K1: a solver record may carry key_hash; a non-string one and any other field are refused', () => {
  const rec = { pass: true, prompt_hash: '0123456789abcdef', at: '2026-10-14T10:00:00.000Z' };
  assert.deepEqual(validateCaseKey({ ...key, solver: { CP4: { ...rec, key_hash: 'fedcba9876543210' } } }), []);
  assert.deepEqual(validateCaseKey({ ...key, solver: { CP4: rec } }), [], 'a record without it still validates');
  assert.ok(validateCaseKey({ ...key, solver: { CP4: { ...rec, key_hash: 5 } } }).some((m) => /solver\.CP4 key_hash must be text/.test(m)));
  assert.ok(validateCaseKey({ ...key, solver: { CP4: { ...rec, key_hash: 'a', extra: 1 } } }).some((m) => /solver\.CP4 holds only pass, prompt_hash, key_hash and at/.test(m)));
});

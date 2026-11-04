// S9-14 (S8-B2): the world of an item's data, from its schema name and the dataset registry. Nothing here reads a database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { worldOfSchema, worldOfCompany } from '../../server/world.ts';
import { registryRecords, type DatasetRecord } from '../../schemas/dataset.ts';
import { replay } from '../../core/replay.ts';
import { instance, options } from '../helpers/replay-fixture.ts';

const registry = (registryRecords(JSON.parse(await readFile(new URL("../../content/datasets/registry.json", import.meta.url), "utf8"))) ?? []) as DatasetRecord[];

test('worldOfSchema: a company schema takes its company\'s world, a registry schema its record\'s', () => {
  const cases: [string, string | null][] = [
    ['voltmarkt', 'pricing'], ['voltmarkt_raw', 'pricing'], ['voltmarkt_edge_pat', 'pricing'],
    ['mailvora_ga4', 'marketing'], ['mailvora_edge_ga4', 'marketing'], ['ledgerloop', 'saas'], ['ledgerloop_edge_saas', 'saas'],
    ['olist', 'retail'], ['online_retail_ii', 'retail'], ['breakfast_at_the_frat', 'pricing'], ['maven_toy_store', 'marketing'],
    ['dannys_diner', null], ['fresh_segments', null], ['nobody', null], ['constructor', null], ['', null],
  ];
  for (const [schema, world] of cases) assert.equal(worldOfSchema(schema, registry), world, schema);
});
test('worldOfSchema: an edge schema of a registry dataset takes its dataset\'s world, and an empty registry knows only the companies', () => {
  assert.equal(worldOfSchema('olist_edge', registry), 'retail');
  assert.equal(worldOfSchema('maven_toy_store_edge', registry), 'marketing');
  assert.equal(worldOfSchema('dannys_diner_edge', registry), null);
  assert.equal(worldOfSchema('olist', []), null);
  assert.equal(worldOfSchema('mailvora', []), 'marketing');
});
test('worldOfCompany: the three companies, and no inherited name', () => {
  assert.deepEqual(['voltmarkt', 'mailvora', 'ledgerloop', 'noordkant', 'constructor', 'toString', undefined].map((c) => worldOfCompany(c)),
    ['pricing', 'marketing', 'saas', null, null, null, null]);
});
test('replay reads no world: a log mixing old pricing lines and new lines gives the same states as an all-pricing log', () => {
  const mk = (world: (n: number) => string) => {
    const attempts = [...instance({ id: 'I-1', item: 'EX-A-E1-01', start: '2026-11-01T10:00:00Z', steps: [{ at: '2026-11-01T10:01:00Z', submit: 'fail' }, { at: '2026-11-01T10:02:00Z', submit: 'pass' }] }),
      ...instance({ id: 'I-2', item: 'EX-A-E1-02', start: '2026-11-02T10:00:00Z', steps: [{ at: '2026-11-02T10:01:00Z', submit: 'pass' }] })] as any[];
    let n = 0;
    return attempts.map((r) => (r.record === 'attempt' ? { ...r, world: world(n++) } : r));
  };
  const old = replay(mk(() => 'pricing'), [], options());
  const mixed = replay(mk((n) => (n === 0 ? 'pricing' : n === 1 ? 'marketing' : 'saas')), [], options());
  assert.deepEqual(mixed.warnings, old.warnings);
  assert.deepEqual([...mixed.instances.entries()], [...old.instances.entries()]);
  assert.deepEqual([...mixed.cards.entries()], [...old.cards.entries()]);
});

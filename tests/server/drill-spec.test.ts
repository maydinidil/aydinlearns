// tests/server/drill-spec.test.ts: the drill spec parser and the cumulative entry (sprint 6 Task B2, ruling S6-19; controller ruling
// P6). content/sql/drills.json gains a cumulative entry keyed by `id`, which draws `per_level` items from each of its `levels`'
// drill pools. The parser accepts it beside the level entries, which keep their shape; parseDrills still returns the level entries
// only, so every caller that reads a level spec is unchanged until Task B4 builds the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadDrills, parseDrillFile, parseDrills, sampleDrill, type Seen } from '../../server/drill.ts';
import type { SqlItem } from '../../schemas/item.ts';

/** S6-19's entry, exactly as the ruling writes it. */
const CUMULATIVE = { id: 'cumulative-1-4', levels: [1, 2, 3, 4], per_level: 3, minutes: 30, pass_pct: 80, unseen_min_pct: 70, mode: 'screen' };
const LEVEL1 = { level: 1, questions: 10, minutes: 20, pass_pct: 90, concepts: ['SQL-BASICS-01'], unseen_min_pct: 70, mode: 'normal', pool_item_ids: [] };
const file = (...drills: unknown[]) => ({ drills });
const without = (k: string) => Object.fromEntries(Object.entries(CUMULATIVE).filter(([key]) => key !== k));

test('S6-19: the parser accepts the cumulative entry beside the level entries, and parseDrills still returns the level entries only', () => {
  const parsed = parseDrillFile(file(LEVEL1, CUMULATIVE));
  assert.deepEqual(parsed.cumulative, [CUMULATIVE]);
  assert.deepEqual(parsed.levels.map((s) => s.level), [1]);
  assert.deepEqual(parseDrills(file(LEVEL1, CUMULATIVE)), parsed.levels);
  assert.deepEqual(parseDrillFile(file(CUMULATIVE)), { levels: [], cumulative: [CUMULATIVE] }, 'a cumulative entry needs no level entry beside it');
  assert.deepEqual(parseDrillFile(file(LEVEL1)).cumulative, [], 'a file with no cumulative entry has none');
  // The mode defaults as a level entry's does.
  assert.equal(parseDrillFile(file(without('mode'))).cumulative[0]!.mode, 'normal');
});

test('S6-19: levels must be a list of whole numbers from 1 to 7, each once', () => {
  for (const levels of [[0, 1], [1, 8], [1.5], ['1', '2'], [1, null], [], [2, 2], '1-4', 4, null]) {
    assert.throws(() => parseDrillFile(file(LEVEL1, { ...CUMULATIVE, levels })), /content\/sql\/drills\.json: drill 2 needs levels as a list of different whole numbers from 1 to 7/, JSON.stringify(levels));
  }
  assert.throws(() => parseDrillFile(file(without('levels'))), /drill 1 needs levels/);
  assert.deepEqual(parseDrillFile(file({ ...CUMULATIVE, levels: [7, 1] })).cumulative[0]!.levels, [7, 1], 'any whole numbers 1 to 7, in the file\'s order');
});

test('S6-19: per_level is required, as a whole number of 1 or more', () => {
  assert.throws(() => parseDrillFile(file(without('per_level'))), /content\/sql\/drills\.json: drill 1 needs per_level as a whole number of 1 or more/);
  for (const per_level of [0, -1, 2.5, '3', null]) {
    assert.throws(() => parseDrillFile(file({ ...CUMULATIVE, per_level })), /drill 1 needs per_level/, JSON.stringify(per_level));
  }
});

test('S6-19: a second cumulative entry with the same id is refused; another id is fine', () => {
  assert.throws(() => parseDrillFile(file(CUMULATIVE, LEVEL1, CUMULATIVE)), /content\/sql\/drills\.json: drill 3 repeats the cumulative drill cumulative-1-4/);
  const two = parseDrillFile(file(CUMULATIVE, { ...CUMULATIVE, id: 'cumulative-1-2', levels: [1, 2] }));
  assert.deepEqual(two.cumulative.map((c) => c.id), ['cumulative-1-4', 'cumulative-1-2']);
});

test('S6-19: the id, the time limit and the pass marks are checked as a level entry\'s are', () => {
  for (const id of [undefined, '', 12]) {
    const entry = id === undefined ? without('id') : { ...CUMULATIVE, id };
    assert.throws(() => parseDrillFile(file(entry)), /drill 1 needs id as a name/, JSON.stringify(id));
  }
  assert.throws(() => parseDrillFile(file({ ...CUMULATIVE, minutes: 0 })), /drill 1 needs minutes above 0/);
  assert.throws(() => parseDrillFile(file(without('minutes'))), /drill 1 needs minutes above 0/);
  assert.throws(() => parseDrillFile(file({ ...CUMULATIVE, pass_pct: 120 })), /drill 1 needs pass_pct between 0 and 100/);
  assert.throws(() => parseDrillFile(file(without('unseen_min_pct'))), /drill 1 needs unseen_min_pct between 0 and 100/);
});

test('an entry is a level drill or a cumulative drill, never both', () => {
  assert.throws(() => parseDrillFile(file({ ...LEVEL1, levels: [1, 2], per_level: 3 })), /drill 1 is either a level drill \(level\) or a cumulative drill \(id, levels, per_level\), not both/);
  assert.throws(() => parseDrillFile(file({ ...CUMULATIVE, level: 4 })), /not both/);
});

test('the level entries keep their rules: a missing level, a repeated level and a malformed file still fail as before', () => {
  assert.throws(() => parseDrillFile({}), /content\/sql\/drills\.json: "drills" must be a list/);
  assert.throws(() => parseDrillFile(file(LEVEL1, CUMULATIVE, LEVEL1)), /drill 3 repeats level 1/);
  assert.throws(() => parseDrillFile(file({ ...LEVEL1, level: undefined })), /drill 1 needs level as a whole number of 1 or more/);
});

test('the shipped drills.json: levels 1 to 3 as before, level 4 as Task C1 wrote it with its pool, and S6-19\'s cumulative entry exactly', async () => {
  const raw = JSON.parse(await readFile('content/sql/drills.json', 'utf8')) as { drills: Record<string, unknown>[] };
  const parsed = parseDrillFile(raw);
  assert.deepEqual(parsed.levels.map((s) => s.level), [1, 2, 3, 4, 5, 6]);
  const LEVEL4 = ['SQL-SUBQ-01', 'SQL-SUBQ-02', 'SQL-STR-01', 'SQL-DATE-02', 'SQL-CLEAN-01'];
  const { pool_item_ids: pool4, ...spec4 } = raw.drills.find((d) => d.level === 4) as { pool_item_ids: string[] };
  assert.deepEqual(spec4, { level: 4, questions: 10, minutes: 25, pass_pct: 90, concepts: LEVEL4, unseen_min_pct: 70, mode: 'normal' });
  assert.deepEqual([...pool4].sort(), LEVEL4.flatMap((c) => ['E1-21', 'E1-22', 'E2-21', 'E2-22', 'E3-21', 'E3-22'].map((s) => `EX-${c}-${s}`)).sort());
  assert.deepEqual(parsed.cumulative, [CUMULATIVE]);
  assert.deepEqual(raw.drills.find((d) => d.id === 'cumulative-1-4'), CUMULATIVE, 'the file holds the entry with no other field');
  assert.deepEqual((await loadDrills()).map((s) => s.level), [1, 2, 3, 4, 5, 6], 'the app\'s loader reads the shipped file and lists the level drills only');
});

test('S7-19: the shipped drills.json holds the level 5 entry exactly, with the 7 level 5 concepts in order and the 35 drill items Task C1 wrote (5 per concept, S7-19)', async () => {
  const raw = JSON.parse(await readFile('content/sql/drills.json', 'utf8')) as { drills: Record<string, unknown>[] };
  const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as { concepts: { id: string; level: number }[] };
  const LEVEL5 = curriculum.concepts.filter((c) => c.level === 5).map((c) => c.id);
  assert.deepEqual(LEVEL5, ['SQL-WIN-01', 'SQL-WIN-02', 'SQL-WIN-03', 'SQL-WIN-04', 'SQL-WIN-05', 'SQL-WIN-06', 'SQL-WIN-07']);
  const POOL = LEVEL5.flatMap((c) => ['E1-21', 'E1-22', 'E2-21', 'E2-22', 'E3-21'].map((n) => `EX-${c}-${n}`));
  const entry = { level: 5, questions: 10, minutes: 25, pass_pct: 90, concepts: LEVEL5, unseen_min_pct: 70, mode: 'normal', pool_item_ids: POOL };
  assert.deepEqual(raw.drills.find((d) => d.level === 5), entry, 'S7-19\'s entry, with no other field');
  assert.deepEqual(raw.drills.findIndex((d) => d.level === 5), raw.drills.findIndex((d) => d.level === 4) + 1, 'after level 4, before the cumulative entry');
  const spec = (await loadDrills()).find((s) => s.level === 5);
  assert.deepEqual(spec, entry, 'the app\'s loader reads it as written');
  assert.deepEqual(parseDrillFile(raw).cumulative, [CUMULATIVE], 'the cumulative drill still spans levels 1 to 4');
});

/**
 * F2 seam 3 (M1): a run takes each concept's first unseen item in pool order, so the level 6 pool lists the 50 items in five rows of
 * one item per concept, each concept's five rotated one place from the concept before, as levels 1 and 2 do: every run mixes E1, E2 and E3.
 */
const ROTATION = ['E1-21', 'E2-21', 'E3-21', 'E1-22', 'E2-22'];
const LEVEL6_POOL = (concepts: readonly string[]): string[] =>
  Array.from({ length: ROTATION.length }, (_, row) => concepts.map((c, n) => `EX-${c}-${ROTATION[(row + n) % ROTATION.length]}`)).flat();

test('S8-11: the shipped drills.json holds the level 6 entry exactly: 10 questions in 40 minutes at 90%, normal mode, 70% unseen, the 10 level 6 concepts in order and the 50 drill items Task C1 wrote (5 per concept)', async () => {
  const raw = JSON.parse(await readFile('content/sql/drills.json', 'utf8')) as { drills: Record<string, unknown>[] };
  const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as { concepts: { id: string; level: number }[] };
  const LEVEL6 = curriculum.concepts.filter((c) => c.level === 6).map((c) => c.id);
  assert.deepEqual(LEVEL6, ['SQL-PAT-01', 'SQL-PAT-02', 'SQL-PAT-03', 'SQL-PAT-04', 'SQL-PAT-05', 'SQL-PAT-06', 'SQL-PAT-07', 'SQL-PAT-08', 'SQL-PAT-09', 'SQL-PAT-10']);
  const POOL = LEVEL6_POOL(LEVEL6);
  assert.deepEqual([...POOL].sort(), LEVEL6.flatMap((c) => ['E1-21', 'E1-22', 'E2-21', 'E2-22', 'E3-21'].map((n) => `EX-${c}-${n}`)).sort(), 'the same 50 items');
  const entry = { level: 6, questions: 10, minutes: 40, pass_pct: 90, concepts: LEVEL6, unseen_min_pct: 70, mode: 'normal', pool_item_ids: POOL };
  assert.deepEqual(raw.drills.find((d) => d.level === 6), entry, 'S8-11\'s entry, with no other field');
  assert.deepEqual(raw.drills.findIndex((d) => d.level === 6), raw.drills.findIndex((d) => d.level === 5) + 1, 'after level 5, before the cumulative entry');
  const spec = (await loadDrills()).find((s) => s.level === 6);
  assert.deepEqual(spec, entry, 'the app\'s loader reads it as written');
  assert.deepEqual(parseDrillFile(raw).cumulative, [CUMULATIVE], 'the cumulative drill still spans levels 1 to 4');
});

test('F2 seam 3 (M1): five level 6 runs a day apart each mix E1, E2 and E3 (4, 4 and 2), one item per concept, and serve all 50 items once', async () => {
  const raw = JSON.parse(await readFile('content/sql/drills.json', 'utf8')) as { drills: { level?: number; concepts: string[]; pool_item_ids: string[] }[] };
  const entry = raw.drills.find((d) => d.level === 6)!;
  const pool = await Promise.all(entry.pool_item_ids.map(async (id) => JSON.parse(await readFile(`content/sql/items/${id}.json`, 'utf8')) as SqlItem));
  const seen: Seen[] = [];
  const start = Date.parse('2026-11-02T09:00:00Z');
  for (let run = 1; run <= 5; run++) {
    const now = new Date(start + (run - 1) * 24 * 60 * 60 * 1000);
    const picks = sampleDrill({ pool, concepts: entry.concepts, questions: 10, seen, now });
    const bands: Record<string, number> = {};
    for (const p of picks) bands[p.item.difficulty] = (bands[p.item.difficulty] ?? 0) + 1;
    assert.deepEqual(bands, { E1: 4, E2: 4, E3: 2 }, `run ${run} mixes the difficulties`);
    assert.deepEqual(new Set(picks.map((p) => p.concept_id)), new Set(entry.concepts), `run ${run}: one item per concept`);
    assert.ok(picks.every((p) => !p.repeat_exposure), `run ${run}: every item unseen`);
    seen.push(...picks.map((p) => ({ item_id: p.item.id, started_at: now.toISOString() })));
  }
  assert.equal(new Set(seen.map((s) => s.item_id)).size, 50, 'five runs serve each of the 50 items once');
});

test('K2 (S6-35): a level or cumulative entry whose mode is not normal or screen stops the file loading, naming the entry; normal and screen load', () => {
  for (const mode of ['fast', '', 'Screen', 7]) {
    assert.throws(() => parseDrillFile(file({ ...LEVEL1, mode })), /content\/sql\/drills\.json: drill 1 \(level 1\) has mode .*, and the mode must be normal or screen/, `level ${JSON.stringify(mode)}`);
    assert.throws(() => parseDrillFile(file(LEVEL1, { ...CUMULATIVE, mode })), /content\/sql\/drills\.json: drill 2 \(cumulative-1-4\) has mode .*, and the mode must be normal or screen/, `cumulative ${JSON.stringify(mode)}`);
  }
  for (const mode of ['normal', 'screen']) {
    assert.equal(parseDrillFile(file({ ...LEVEL1, mode })).levels[0]!.mode, mode);
    assert.equal(parseDrillFile(file({ ...CUMULATIVE, mode })).cumulative[0]!.mode, mode);
  }
  assert.equal(parseDrillFile(file({ ...LEVEL1, mode: undefined })).levels[0]!.mode, 'normal', 'no mode reads as normal, as before');
});

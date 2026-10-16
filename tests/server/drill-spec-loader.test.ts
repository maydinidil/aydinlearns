// tests/server/drill-spec-loader.test.ts: the one drill-spec loader that routes/drill.ts and routes/progress.ts share (Task K4, S6-38).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drillSpecLoader, type DrillSpec } from '../../server/drill.ts';

const LEVEL1 = { level: 1, questions: 10, minutes: 20, pass_pct: 90, concepts: ['SQL-BASICS-01'], unseen_min_pct: 70, mode: 'normal', pool_item_ids: [] };
const CUMULATIVE = { id: 'cumulative-1-4', levels: [1, 2, 3, 4], per_level: 3, minutes: 30, pass_pct: 80, unseen_min_pct: 70, mode: 'screen' };
const store = (extra: object = {}) => extra as never;

async function inTemp<T>(body: string | null, run: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'k4-drills-'));
  try {
    const path = join(dir, 'drills.json');
    if (body !== null) await writeFile(path, body);
    return await run(path);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('K4: a good file gives the level and cumulative specs', async () => {
  await inTemp(JSON.stringify({ drills: [LEVEL1, CUMULATIVE] }), async (path) => {
    const l = drillSpecLoader(store(), path);
    assert.deepEqual((await l.specs()).map((s) => s.level), [1]);
    assert.deepEqual((await l.cumulative()).map((s) => s.id), ['cumulative-1-4']);
  });
});

test('K4: a missing file means no drills; a bad file is a fault that names the file, and is read again next time', async () => {
  await inTemp(null, async (path) => {
    const l = drillSpecLoader(store(), path);
    assert.deepEqual(await l.specs(), []);
    assert.deepEqual(await l.cumulative(), []);
  });
  await inTemp('{ not json', async (path) => {
    const l = drillSpecLoader(store(), path);
    await assert.rejects(l.specs(), /drills\.json/);
    await writeFile(path, JSON.stringify({ drills: [LEVEL1] }));
    assert.equal((await l.specs()).length, 1, 'a failed read is not cached');
  });
});

test('K4: a store that carries specs wins over the file; with level specs and no cumulative ones there are none', async () => {
  const own = [{ ...LEVEL1, level: 2 }] as DrillSpec[];
  await inTemp(JSON.stringify({ drills: [LEVEL1, CUMULATIVE] }), async (path) => {
    const l = drillSpecLoader(store({ drills: () => own }), path);
    assert.deepEqual(await l.specs(), own);
    assert.deepEqual(await l.cumulative(), []);
    const c = drillSpecLoader(store({ drills: () => own, cumulativeDrills: () => [CUMULATIVE] }), path);
    assert.deepEqual((await c.cumulative()).map((s) => s.id), ['cumulative-1-4']);
  });
});

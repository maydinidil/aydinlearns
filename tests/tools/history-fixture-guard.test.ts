// tests/tools/history-fixture-guard.test.ts: seedHistory writes records, so it refuses any folder outside the temp folder, the real logs/
// included (s2:L103). The refused folders here are throwaway names beside the real ones, never logs/ itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadContent } from '../../server/content.ts';
import { seedHistory } from '../helpers/history-fixture.ts';

const content = await loadContent(resolve('content'));

test('seedHistory throws for a folder outside the temp folder, before it writes anything', async () => {
  const outside = [resolve(`al-guard-${process.pid}`), join(tmpdir(), '..', `al-guard-${process.pid}`)];
  try {
    for (const dir of outside) await assert.rejects(seedHistory(dir, content), /temporary folder/, dir);
  } finally { for (const dir of outside) await rm(dir, { recursive: true, force: true }); }
});

test('seedHistory still seeds a folder inside the temp folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-guard-'));
  try { assert.ok((await seedHistory(dir, content)).attempts > 0); } finally { await rm(dir, { recursive: true, force: true }); }
});

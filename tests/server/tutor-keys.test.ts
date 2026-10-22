// tests/server/tutor-keys.test.ts: the tutor's key store (T-20, block P): tutor-keys.json over the keys the app started with, a saved key
// winning, the key check, removal, atomic writes, two saves at once, a broken file, and no key in any error, printout or problem line.
// Every file here is in a temporary folder; every key is an invented string. Nothing touches the app folder's tutor-keys.json.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { inspect } from 'node:util';
import { KEY_PROVIDERS, keyProblem, keysFileFrom, TutorKeys } from '../../server/tutor/keys.ts';

const CLAUDE = 'sk-ant-test-0000000000000000000000';
const CLAUDE_2 = 'sk-ant-test-1111111111111111111111';
const CLAUDE_ENV = 'sk-ant-test-env-00000000000000000';
const OPENAI = 'sk-test-00000000000000000000';
const OPENAI_ENV = 'sk-test-env-0000000000000000000';
const ALL = [CLAUDE, CLAUDE_2, CLAUDE_ENV, OPENAI, OPENAI_ENV];

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const tmp = async (): Promise<string> => { const d = await mkdtemp(join(tmpdir(), 'al-tutor-keys-')); made.push(d); return d; };
const fileIn = async (): Promise<string> => join(await tmp(), 'tutor-keys.json');
const onDisk = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'));
/** Everything an error carries that could reach a log, a span or the browser. */
const told = (e: unknown): string => {
  const x = e as { message?: unknown; stack?: unknown; cause?: unknown };
  return [String(x.message), String(x.stack), inspect(x.cause, { depth: 5 }), inspect(e, { depth: 5, showHidden: true })].join('\n');
};

test('the key check (T-20): sk-ant- for Claude and sk- for OpenAI, 20 to 400 letters, digits, _ and -; its line never repeats the value', () => {
  assert.equal(keyProblem('claude', CLAUDE), null);
  assert.equal(keyProblem('openai', OPENAI), null);
  assert.equal(keyProblem('claude', `sk-ant-${'a'.repeat(13)}`), null, '20 characters');
  assert.equal(keyProblem('claude', `sk-ant-${'a'.repeat(393)}`), null, '400 characters');
  assert.equal(keyProblem('openai', `sk-${'a'.repeat(17)}`), null, '20 characters');
  assert.equal(keyProblem('openai', `sk-${'_-'.repeat(198)}a`), null, '400 characters');
  const refused: [ 'claude' | 'openai', string][] = [
    ['claude', OPENAI], ['claude', `sk-ant-${'a'.repeat(12)}`], ['claude', `sk-ant-${'a'.repeat(394)}`], ['claude', 'sk-ant-test has-a-space-000000'],
    ['claude', `${CLAUDE}!`], ['claude', `${CLAUDE}\n`], ['claude', ''], ['openai', `sk-${'a'.repeat(16)}`], ['openai', `sk-${'a'.repeat(398)}`],
    ['openai', 'pk-test-00000000000000000000'], ['openai', 'sk-test-0000000000\t0000000000'], ['openai', 'SK-TEST-00000000000000000000'],
  ];
  for (const [p, v] of refused) {
    const line = keyProblem(p, v);
    assert.ok(line, `${p} refuses ${JSON.stringify(v.slice(0, 30))}`);
    assert.ok(v === '' || !line.includes(v.trim()), 'the line does not repeat the value');
    assert.match(line, p === 'claude' ? /^A Claude key starts with sk-ant-/ : /^An OpenAI key starts with sk-/);
  }
});

test('review P I1: a Claude key in the OpenAI field is refused with its own line, so it is never sent to OpenAI', () => {
  const line = keyProblem('openai', CLAUDE);
  assert.equal(line, 'That looks like a Claude key (it starts with sk-ant-): paste it in the Claude API key field.');
  assert.ok(!line.includes(CLAUDE.slice(7)), 'the line does not repeat the key');
  assert.equal(keyProblem('openai', `sk-ant-api03-${'a'.repeat(40)}`), line, 'any sk-ant- key');
  assert.equal(keyProblem('claude', CLAUDE), null, 'it is still a Claude key');
});

test('the file: AYDINLEARNS_KEYS_FILE, else tutor-keys.json in the app folder; a test server on a temporary logs folder gets none', () => {
  const app = join(tmpdir(), 'al-app');
  assert.equal(keysFileFrom({}, app), resolve(app, 'tutor-keys.json'));
  assert.equal(keysFileFrom({ AYDINLEARNS_KEYS_FILE: ' ', AYDINLEARNS_LOGS_DIR: '' }, app), resolve(app, 'tutor-keys.json'), 'blank is not set');
  assert.equal(keysFileFrom({ AYDINLEARNS_KEYS_FILE: ` ${join(tmpdir(), 'k.json')} ` }, app), resolve(tmpdir(), 'k.json'));
  assert.equal(keysFileFrom({ AYDINLEARNS_LOGS_DIR: join(tmpdir(), 'logs') }, app), null, 'like the journey (release 0.5.3, B4): never the real file');
  assert.equal(keysFileFrom({ AYDINLEARNS_LOGS_DIR: join(tmpdir(), 'logs'), AYDINLEARNS_KEYS_FILE: join(tmpdir(), 'k.json') }, app), resolve(tmpdir(), 'k.json'));
});

test('the start keys are the fallback; a saved key wins; removing it falls back again; a restart reads what was saved', async () => {
  const file = await fileIn();
  const k = await TutorKeys.open(file, { claude: ` ${CLAUDE_ENV} `, openai: '   ' });
  assert.equal(k.problem, null, 'no file yet is no problem');
  assert.deepEqual(KEY_PROVIDERS.map((p) => [p, k.sourceOf(p), k.secretFor(p)]), [['claude', 'env', CLAUDE_ENV], ['openai', null, null]]);
  await k.save('claude', CLAUDE);
  assert.deepEqual([k.sourceOf('claude'), k.secretFor('claude')], ['settings', CLAUDE]);
  assert.deepEqual(await onDisk(file), { claude: CLAUDE });
  await k.save('openai', `  ${OPENAI}\n`);
  assert.deepEqual([k.sourceOf('openai'), k.secretFor('openai')], ['settings', OPENAI], 'a pasted key is trimmed');
  await k.remove('claude');
  assert.deepEqual([k.sourceOf('claude'), k.secretFor('claude')], ['env', CLAUDE_ENV]);
  assert.deepEqual(await onDisk(file), { openai: OPENAI });
  await k.remove('claude');                                                   // nothing saved: nothing changes
  const again = await TutorKeys.open(file, {});
  assert.deepEqual(KEY_PROVIDERS.map((p) => again.sourceOf(p)), [null, 'settings']);
  assert.equal(again.secretFor('openai'), OPENAI);
});

test('two saves at once both land, whole; of two saves of one provider the later wins; no temporary file is left', async () => {
  const file = await fileIn();
  const k = await TutorKeys.open(file, {});
  await Promise.all([k.save('claude', CLAUDE), k.save('openai', OPENAI)]);
  assert.deepEqual(await onDisk(file), { claude: CLAUDE, openai: OPENAI });
  await Promise.all([k.save('claude', CLAUDE_2), k.save('claude', CLAUDE), k.remove('openai'), k.save('claude', CLAUDE_2)]);
  assert.deepEqual(await onDisk(file), { claude: CLAUDE_2 });
  assert.equal(k.secretFor('claude'), CLAUDE_2);
  assert.deepEqual(await readdir(dirname(file)), ['tutor-keys.json']);
});

test('a reader never sees a half-written file: every read during many saves is whole JSON with whole keys, and the file matches the store', async () => {
  const file = await fileIn();
  const k = await TutorKeys.open(file, {});
  await k.save('claude', CLAUDE);
  const long = (n: number): string => `sk-ant-${String(n).padStart(393, 'x')}`;     // 400 characters, so a cut write would show
  let writing = true;
  let reads = 0;
  // A reader that reads again and again. Windows refuses a rename over a file that is open, and opening a file just replaced can make the
  // virus scanner hold it for a second or more, so a save here may fail (it then says so and changes nothing); a read never sees half a file.
  const reader = (async () => {
    while (writing) {
      await new Promise((done) => setTimeout(done, 5));
      let text: string;
      try { text = await readFile(file, 'utf8'); } catch { continue; }
      const got = JSON.parse(text) as { claude?: string; openai?: string };
      assert.equal(keyProblem('claude', got.claude!), null);
      if (got.openai !== undefined) assert.equal(keyProblem('openai', got.openai), null);
      reads++;
    }
  })();
  let results: PromiseSettledResult<void>[];
  try {
    const saves: Promise<void>[] = [];
    for (let n = 0; n < 40; n++) saves.push(n % 2 ? k.save('claude', long(n)) : k.save('openai', `sk-${String(n).padStart(397, 'y')}`));
    results = await Promise.allSettled(saves);
  } finally {
    writing = false;
    await reader;
  }
  assert.ok(reads > 0, 'the reader read the file');
  assert.ok(results.some((r) => r.status === 'fulfilled'), 'saves went through');
  for (const r of results) if (r.status === 'rejected') assert.match((r.reason as Error).message, /could not be saved/);
  const settled = { claude: k.secretFor('claude'), ...(k.secretFor('openai') ? { openai: k.secretFor('openai') } : {}) };
  assert.deepEqual(await onDisk(file), settled, 'the file holds exactly what the store says it saved');
  assert.deepEqual(await readdir(dirname(file)), ['tutor-keys.json']);
});

test('a key that does not look like one is refused, changes nothing, and its error holds no key', async () => {
  const file = await fileIn();
  const k = await TutorKeys.open(file, { claude: CLAUDE_ENV });
  for (const bad of ['sk-ant-test has-a-space-000000', OPENAI, `${CLAUDE}!`]) {
    await assert.rejects(k.save('claude', bad), (e: unknown) => {
      assert.ok(!told(e).includes(bad) && !told(e).includes(CLAUDE_ENV), 'no key in the error');
      return true;
    });
  }
  assert.equal(k.sourceOf('claude'), 'env');
  await assert.rejects(readFile(file, 'utf8'), 'nothing was written');
});

test('a write that fails throws a line with no key, keeps the store as it was and leaves no temporary file', async () => {
  const dir = await tmp();
  const file = join(dir, 'tutor-keys.json');
  await mkdir(file);                                                          // the file's place is a folder, so the rename fails
  const k = await TutorKeys.open(file, { openai: OPENAI_ENV });
  assert.ok(k.problem && !ALL.some((x) => k.problem!.includes(x)), 'a file that cannot be read is a problem line, with no key');
  await assert.rejects(k.save('openai', OPENAI), (e: unknown) => {
    assert.ok(!ALL.some((x) => told(e).includes(x)), 'no key in the error, its stack or its cause');
    assert.match((e as Error).message, /could not be saved/);
    return true;
  });
  assert.deepEqual([k.sourceOf('openai'), k.secretFor('openai')], ['env', OPENAI_ENV], 'the failed save changed nothing');
  assert.deepEqual(await readdir(dir), ['tutor-keys.json']);
  await k.save('openai', OPENAI).catch(() => {});                             // the queue keeps working after a failure
  await rm(file, { recursive: true });
  await k.save('claude', CLAUDE);
  assert.deepEqual(await onDisk(file), { claude: CLAUDE });
});

test('a broken or odd file reads as no saved key, with a problem line that names no key; the next save writes it whole', async () => {
  const file = await fileIn();
  await writeFile(file, `{"claude": "${CLAUDE}", "openai": "${OPENAI}", oops`);     // broken JSON: its parse error would quote it
  const k = await TutorKeys.open(file, {});
  assert.deepEqual(KEY_PROVIDERS.map((p) => k.sourceOf(p)), [null, null]);
  assert.ok(k.problem && !ALL.some((x) => k.problem!.includes(x)), 'the problem line holds no key');
  await k.save('openai', OPENAI_ENV);
  assert.deepEqual(await onDisk(file), { openai: OPENAI_ENV });
  for (const odd of [{ claude: 'not a key at all', openai: OPENAI, other: CLAUDE }, { claude: 42, openai: OPENAI }, ['claude', CLAUDE], 'just text']) {
    await writeFile(file, JSON.stringify(odd));
    const o = await TutorKeys.open(file, {});
    assert.equal(o.sourceOf('claude'), null, JSON.stringify(odd));
    assert.ok(o.problem && !o.problem.includes('not a key') && !ALL.some((x) => o.problem!.includes(x)), JSON.stringify(odd));
  }
  await writeFile(file, JSON.stringify({ openai: OPENAI }));
  assert.equal((await TutorKeys.open(file, {})).problem, null, 'a good file is no problem');
});

test('no printout of the store holds a key', async () => {
  const k = await TutorKeys.open(await fileIn(), { claude: CLAUDE_ENV, openai: OPENAI_ENV });
  await k.save('claude', CLAUDE);
  for (const shown of [JSON.stringify(k), String(k), inspect(k, { depth: 5, showHidden: true }), JSON.stringify(Object.entries(k))]) {
    assert.ok(!ALL.some((x) => shown.includes(x)), shown);
  }
});

test('with no file (a test server on a temporary logs folder), saves last for the run and nothing is written', async () => {
  const k = await TutorKeys.open(null, { openai: OPENAI_ENV });
  assert.equal(k.problem, null);
  await k.save('claude', CLAUDE);
  assert.deepEqual(KEY_PROVIDERS.map((p) => k.sourceOf(p)), ['settings', 'env']);
  await k.remove('claude');
  assert.equal(k.sourceOf('claude'), null);
  await assert.rejects(k.save('claude', 'not a key'));
});

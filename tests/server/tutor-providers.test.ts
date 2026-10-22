// tests/server/tutor-providers.test.ts: the two providers through their SDKs' injectable fetch, with recorded stream shapes (spec §12):
// no test reaches the network. Each checks the request it sent, the text it streamed, how it ended and the failure lines of spec §10.
// The effort chosen in Settings reaches each request (T-21). The startup tests check that startup removes both keys from process.env
// (spec §9) and keeps them for the key store (T-20), the fake test hook (T-23), and that a gateway's base URL or extra headers in the
// environment never redirect or extend a call. Every child that imports startup.ts sets both keys, the hook and AYDINLEARNS_KEYS_FILE.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { anthropicModel } from '../../server/tutor/providers/anthropic.ts';
import { openaiModel } from '../../server/tutor/providers/openai.ts';
import { TUTOR_LINES } from '../../server/tutor/providers/errors.ts';
import { costOf, PRICES } from '../../server/tutor/prices.ts';
import { TutorFailure, type Effort, type TutorDone, type TutorModel, type TutorModelInput } from '../../server/tutor/types.ts';

const KEY = 'sk-test-not-a-real-key';
const INPUT: TutorModelInput = { system: 'SYSTEM RULES', turns: [{ role: 'user', text: 'Earlier question' }, { role: 'assistant', text: 'Earlier reply' }],
  question: 'Screen: item\n<question>\nWhy is it wrong?\n</question>', maxTokens: 4096 };
const sse = (events: [string, object][]): string => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
const streamed = (body: string): Response => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
// retry-after-ms is 1, not 0: @anthropic-ai/sdk 0.131.0 reads 0 as "no hint" and waits its default backoff (about half a second).
const failed = (status: number, body: object): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } });
/** A stream that sends `first`, then breaks, as a dropped connection would. */
const broken = (first: string): Response => {
  let sent = false;
  return new Response(new ReadableStream<Uint8Array>({ pull(c) { if (sent) c.error(new Error('socket hang up')); else { sent = true; c.enqueue(new TextEncoder().encode(first)); } } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
function fakeFetch(answer: () => Response | Promise<Response>) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input instanceof Request ? input.url : input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : {} });
    return answer();
  }) as typeof fetch;
  return { f, sent };
}
async function drain(m: TutorModel, input = INPUT): Promise<{ text: string; done: TutorDone }> {
  const gen = m.ask(input);
  let text = '';
  let n = await gen.next();
  while (!n.done) { text += n.value; n = await gen.next(); }
  return { text, done: n.value };
}
async function failure(m: TutorModel): Promise<TutorFailure> {
  try { await drain(m); } catch (e) { assert.ok(e instanceof TutorFailure, `a TutorFailure, not ${String(e)}`); return e; }
  throw new Error('the call did not fail');
}

// ---- Claude -----------------------------------------------------------------------------------------------------------------
const claudeStart: [string, object] = ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
  content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, cache_creation_input_tokens: 800, cache_read_input_tokens: 0, output_tokens: 1 } } }];
const claudeBlock: [string, object] = ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }];
const claudeDelta = (text: string): [string, object] => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }];
const claudeEnd = (stop: string, out: number): [string, object][] => [
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: out } }],
  ['message_stop', { type: 'message_stop' }],
];
const claudeReply = (stop = 'end_turn'): string => sse([claudeStart, claudeBlock, claudeDelta('Look at '), claudeDelta('the WHERE clause.'), ...claudeEnd(stop, 42)]);
const claude = (f: typeof fetch, maxRetries?: number, effort: Effort = 'low') =>
  anthropicModel({ apiKey: KEY, model: 'claude-haiku-5-5', effort, fetch: f, ...(maxRetries === undefined ? {} : { maxRetries }) });

test('Claude: one streamed call with the cached system prompt, low effort, 4096 tokens, the thread and the question', async () => {
  const { f, sent } = fakeFetch(() => streamed(claudeReply()));
  const { text, done } = await drain(claude(f));
  assert.equal(text, 'Look at the WHERE clause.');
  assert.deepEqual(done, { end: 'done', usage: { input_tokens: 120, cache_write_tokens: 800, cached_input_tokens: 0, output_tokens: 42 } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, 'https://api.anthropic.com/v1/messages');
  const b = sent[0]!.body;
  assert.equal(b.model, 'claude-haiku-5-5');
  assert.equal(b.max_tokens, 4096);
  assert.equal(b.stream, true);
  assert.deepEqual(b.system, [{ type: 'text', text: 'SYSTEM RULES', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(b.output_config, { effort: 'low' });
  assert.deepEqual(b.messages, [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier reply' }, { role: 'user', content: INPUT.question }]);
  assert.ok(!JSON.stringify(b).includes(KEY), 'the key goes in a header, never the body');
});

test('Claude: a refusal ends as refused; max_tokens as max_tokens', async () => {
  assert.equal((await drain(claude(fakeFetch(() => streamed(claudeReply('refusal'))).f))).done.end, 'refused');
  assert.equal((await drain(claude(fakeFetch(() => streamed(claudeReply('max_tokens'))).f))).done.end, 'max_tokens');
});

test('Claude: a refused key, a busy provider (retried once), no network, and a stream cut halfway each give their line', async () => {
  const auth = await failure(claude(fakeFetch(() => failed(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })).f));
  assert.deepEqual([auth.kind, auth.message], ['key_refused', TUTOR_LINES.key_refused]);
  const busy = fakeFetch(() => failed(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }));
  const b = await failure(claude(busy.f));
  assert.deepEqual([b.kind, b.message, busy.sent.length], ['busy', TUTOR_LINES.busy, 2]);
  const offline = await failure(claude((async () => { throw new TypeError('fetch failed'); }) as typeof fetch, 0));
  assert.deepEqual([offline.kind, offline.message], ['offline', "The tutor can't reach Claude right now. Everything else works."]);
  const cut = await failure(claude(fakeFetch(() => broken(sse([claudeStart, claudeBlock, claudeDelta('Look at ')]))).f));
  assert.deepEqual([cut.kind, cut.message], ['cut_off', TUTOR_LINES.cut_off]);
  // A stream that closes cleanly before message_stop: the SDK has no final message, so this is cut off too.
  const closed = await failure(claude(fakeFetch(() => streamed(sse([claudeStart, claudeBlock, claudeDelta('Look at ')]))).f));
  assert.deepEqual([closed.kind, closed.message], ['cut_off', TUTOR_LINES.cut_off]);
});

test('Claude: an error the provider reports inside the stream gives the line for its type, or cut off once text has arrived', async () => {
  // The provider answered 200, then sent `event: error`: the SDK throws it with no HTTP status, so its type decides, not "can't reach".
  const inBand = (type: string): [string, object] => ['error', { type: 'error', error: { type, message: 'x' } }];
  const busy = await failure(claude(fakeFetch(() => streamed(sse([claudeStart, inBand('overloaded_error')]))).f));
  assert.deepEqual([busy.kind, busy.message], ['busy', TUTOR_LINES.busy]);
  const auth = await failure(claude(fakeFetch(() => streamed(sse([claudeStart, inBand('authentication_error')]))).f));
  assert.deepEqual([auth.kind, auth.message], ['key_refused', TUTOR_LINES.key_refused]);
  const other = await failure(claude(fakeFetch(() => streamed(sse([claudeStart, inBand('invalid_request_error')]))).f));
  assert.deepEqual([other.kind, other.message], ['refused_request', TUTOR_LINES.refused_request]);
  const late = await failure(claude(fakeFetch(() => streamed(sse([claudeStart, claudeBlock, claudeDelta('Look at '), inBand('overloaded_error')]))).f));
  assert.deepEqual([late.kind, late.message], ['cut_off', TUTOR_LINES.cut_off]);
});

// ---- OpenAI -----------------------------------------------------------------------------------------------------------------
const oaDelta = (n: number, delta: string): [string, object] => ['response.output_text.delta', { type: 'response.output_text.delta', sequence_number: n, item_id: 'msg_1', output_index: 0, content_index: 0, delta }];
const oaDone = (n: number, status = 'completed', extra: object = {}): [string, object] => [`response.${status}`, { type: `response.${status}`, sequence_number: n,
  response: { id: 'resp_1', object: 'response', status, output: [], usage: { input_tokens: 900, input_tokens_details: { cached_tokens: 800 }, output_tokens: 40, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 940 }, ...extra } }];
const oaCreated: [string, object] = ['response.created', { type: 'response.created', sequence_number: 0, response: { id: 'resp_1', object: 'response', status: 'in_progress', output: [] } }];
const oaFailed = (n: number, code: string): [string, object] => ['response.failed', { type: 'response.failed', sequence_number: n,
  response: { id: 'resp_1', object: 'response', status: 'failed', output: [], error: { code, message: 'x' } } }];
const gpt = (f: typeof fetch, maxRetries?: number, effort: Effort = 'low') =>
  openaiModel({ apiKey: KEY, model: 'gpt-test', effort, fetch: f, ...(maxRetries === undefined ? {} : { maxRetries }) });

test('OpenAI: the Responses API, streamed, not stored, with the system prompt as instructions', async () => {
  const { f, sent } = fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Look at '), oaDelta(2, 'the WHERE clause.'), oaDone(3)])));
  const { text, done } = await drain(gpt(f));
  assert.equal(text, 'Look at the WHERE clause.');
  assert.deepEqual(done, { end: 'done', usage: { input_tokens: 100, cache_write_tokens: 0, cached_input_tokens: 800, output_tokens: 40 } });
  assert.equal(sent[0]!.url, 'https://api.openai.com/v1/responses');
  const b = sent[0]!.body;
  assert.equal(b.model, 'gpt-test');
  assert.equal(b.instructions, 'SYSTEM RULES');
  assert.equal(b.max_output_tokens, 4096);
  assert.equal(b.stream, true);
  assert.equal(b.store, false);
  assert.deepEqual(b.reasoning, { effort: 'low' });
  assert.deepEqual(b.input, [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier reply' }, { role: 'user', content: INPUT.question }]);
});

test('OpenAI: a refusal, an incomplete reply, a refused key, a failed response and no network', async () => {
  const refusal: [string, object] = ['response.refusal.delta', { type: 'response.refusal.delta', sequence_number: 1, item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'I can not help with that.' }];
  assert.equal((await drain(gpt(fakeFetch(() => streamed(sse([oaCreated, refusal, oaDone(2)]))).f))).done.end, 'refused');
  const cut = oaDone(2, 'incomplete', { incomplete_details: { reason: 'max_output_tokens' } });
  assert.equal((await drain(gpt(fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Part'), cut]))).f))).done.end, 'max_tokens');
  const auth = await failure(gpt(fakeFetch(() => failed(401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } })).f));
  assert.equal(auth.kind, 'key_refused');
  const failedLate = await failure(gpt(fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Part'), oaFailed(2, 'server_error')]))).f));
  assert.deepEqual([failedLate.kind, failedLate.message], ['cut_off', TUTOR_LINES.cut_off]);
  // openai 7.27.0 throws an `error` event as an APIError with no HTTP status, so the loop never sees it: before any text its code
  // decides, and a server error is the provider being busy, not "can't reach OpenAI".
  const errorEvent: [string, object] = ['error', { type: 'error', sequence_number: 1, code: 'server_error', message: 'x', param: null }];
  const failedEarly = await failure(gpt(fakeFetch(() => streamed(sse([oaCreated, errorEvent]))).f));
  assert.deepEqual([failedEarly.kind, failedEarly.message], ['busy', TUTOR_LINES.busy]);
  // The SDK ends the loop quietly when the stream closes without a final event; that reply was cut off, as Claude's is.
  const closed = await failure(gpt(fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Part')]))).f));
  assert.deepEqual([closed.kind, closed.message], ['cut_off', TUTOR_LINES.cut_off]);
  const offline = await failure(gpt((async () => { throw new TypeError('fetch failed'); }) as typeof fetch, 0));
  assert.equal(offline.message, "The tutor can't reach OpenAI right now. Everything else works.");
});

test('OpenAI: a failed response before any text gives the line for its code', async () => {
  const before = async (code: string) => { const e = await failure(gpt(fakeFetch(() => streamed(sse([oaCreated, oaFailed(1, code)]))).f)); return [e.kind, e.message]; };
  assert.deepEqual(await before('server_error'), ['busy', TUTOR_LINES.busy]);
  assert.deepEqual(await before('rate_limit_exceeded'), ['busy', TUTOR_LINES.busy]);
  assert.deepEqual(await before('invalid_prompt'), ['refused_request', TUTOR_LINES.refused_request]);
});

// ---- S7-31: the OpenAI path ---------------------------------------------------------------------------------------------------
test('S7-31: OpenAI usage with cache writes: the written tokens come out of input_tokens and are priced at the cache-write rate', async () => {
  const usage = { input_tokens: 900, input_tokens_details: { cached_tokens: 300, cache_write_tokens: 500 }, output_tokens: 40, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 940 };
  const { done } = await drain(gpt(fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Hi'), oaDone(2, 'completed', { usage })]))).f));
  assert.deepEqual(done.usage, { input_tokens: 100, cache_write_tokens: 500, cached_input_tokens: 300, output_tokens: 40 });
  // GPT-6.1 Sol: 100 x $2 + 500 x $2.5 + 300 x $0.10 + 40 x $10 per million tokens, so the written tokens are not priced as plain input.
  assert.equal(costOf(PRICES['gpt-6.1-sol']!, done.usage), 0.00188);
});

test('S7-31: OpenAI insufficient_quota (no credit left) gives the refused line, not "busy"; a policy code gives "could not answer this one"', async () => {
  const quota = await failure(gpt(fakeFetch(() => failed(429, { error: { message: 'You exceeded your current quota.', type: 'insufficient_quota', code: 'insufficient_quota', param: null } })).f, 0));
  assert.deepEqual([quota.kind, quota.message], ['refused_request', TUTOR_LINES.refused_request]);
  for (const code of ['bio_policy', 'misalignment_policy_violation']) {
    const e = await failure(gpt(fakeFetch(() => streamed(sse([oaCreated, oaFailed(1, code)]))).f));
    assert.deepEqual([e.kind, e.message], ['declined', 'The tutor could not answer this one.'], code);
  }
  // The same code thrown as an `error` event (an APIError with no status) reads the same.
  const event: [string, object] = ['error', { type: 'error', sequence_number: 1, code: 'bio_policy', message: 'x', param: null }];
  const thrown = await failure(gpt(fakeFetch(() => streamed(sse([oaCreated, event]))).f));
  assert.deepEqual([thrown.kind, thrown.message], ['declined', TUTOR_LINES.declined]);
});

// ---- S7-32: the route and provider details ----------------------------------------------------------------------------------
test('S7-32: a stream that breaks after the provider\'s first event, before any text, reads "stopped mid-reply", never "can\'t reach"', async () => {
  const claudeCut = await failure(claude(fakeFetch(() => broken(sse([claudeStart]))).f));
  assert.deepEqual([claudeCut.kind, claudeCut.message], ['cut_off', 'The tutor stopped mid-reply.']);
  const gptCut = await failure(gpt(fakeFetch(() => broken(sse([oaCreated]))).f));
  assert.deepEqual([gptCut.kind, gptCut.message], ['cut_off', 'The tutor stopped mid-reply.']);
  // Before any event, a connection that never answered is still "can't reach".
  const never = await failure(claude((async () => { throw new TypeError('fetch failed'); }) as typeof fetch, 0));
  assert.equal(never.kind, 'offline');
});

test("S7-32: a Claude call cut after message_start carries the input the provider reported; one cut before it carries none", async () => {
  const after = await failure(claude(fakeFetch(() => broken(sse([claudeStart, claudeBlock, claudeDelta('Look at ')]))).f));
  assert.deepEqual([after.kind, after.usage], ['cut_off', { input_tokens: 120, cache_write_tokens: 800, cached_input_tokens: 0, output_tokens: 0 }]);
  const before = await failure(claude((async () => { throw new TypeError('fetch failed'); }) as typeof fetch, 0));
  assert.equal(before.usage, null);
  // OpenAI reports no usage before its final event, so its cut carries none.
  const gptCut = await failure(gpt(fakeFetch(() => broken(sse([oaCreated, oaDelta(1, 'Part')]))).f));
  assert.equal(gptCut.usage, null);
});

test("S7-32: both SDKs log at 'warn' whatever ANTHROPIC_LOG and OPENAI_LOG say, so a request's body (the question, the snapshot) is never printed", async () => {
  const keep = { a: process.env.ANTHROPIC_LOG, o: process.env.OPENAI_LOG };
  const out: unknown[] = [];
  const shown = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error };
  process.env.ANTHROPIC_LOG = 'debug';
  process.env.OPENAI_LOG = 'debug';
  for (const k of ['log', 'info', 'debug'] as const) console[k] = (...a: unknown[]) => { out.push(a); };
  try {
    await drain(claude(fakeFetch(() => streamed(claudeReply())).f));
    await drain(gpt(fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Hi'), oaDone(2)]))).f));
  } finally {
    Object.assign(console, shown);
    for (const [k, v] of [['ANTHROPIC_LOG', keep.a], ['OPENAI_LOG', keep.o]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  assert.deepEqual(out, [], 'nothing was printed below warn');
});

// ---- the effort (T-21) ------------------------------------------------------------------------------------------------------
test("the effort chosen in Settings reaches each provider's request: Claude's output_config.effort, OpenAI's reasoning.effort", async () => {
  for (const effort of ['low', 'medium', 'high'] as const) {
    const input = { ...INPUT, maxTokens: { low: 4_096, medium: 8_192, high: 16_384 }[effort] };
    const c = fakeFetch(() => streamed(claudeReply()));
    await drain(claude(c.f, undefined, effort), input);
    assert.deepEqual([c.sent[0]!.body.output_config, c.sent[0]!.body.max_tokens], [{ effort }, input.maxTokens], `Claude at ${effort}`);
    assert.equal(c.sent[0]!.body.reasoning, undefined, 'Claude gets no OpenAI field');
    const o = fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Hi'), oaDone(2)])));
    await drain(gpt(o.f, undefined, effort), input);
    assert.deepEqual([o.sent[0]!.body.reasoning, o.sent[0]!.body.max_output_tokens], [{ effort }, input.maxTokens], `OpenAI at ${effort}`);
    assert.equal(o.sent[0]!.body.output_config, undefined, 'OpenAI gets no Claude field');
  }
});

test('the refused-key line points to Settings, where the keys are kept now (T-20)', () => {
  assert.equal(TUTOR_LINES.key_refused, "The tutor's key was refused. Check it in Settings.");
});

// ---- startup ----------------------------------------------------------------------------------------------------------------
const startupUrl = JSON.stringify(pathToFileURL(resolve('server/tutor/startup.ts')).href);
/** A child process that imports startup.ts with `env` over the test's own, then runs `code`; every key here is invented. */
async function inChild(env: Record<string, string>, code: string): Promise<unknown> {
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `const m = await import(${startupUrl});\n${code}`],
    { env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', AYDINLEARNS_TUTOR_PROVIDER: '', ...env } });
  return JSON.parse(stdout);
}
const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const keysFile = async (): Promise<string> => { const d = await mkdtemp(join(tmpdir(), 'al-tutor-startup-')); made.push(d); return join(d, 'tutor-keys.json'); };
const CLAUDE_KEY = 'sk-ant-test-startup-0000000000000';

test('startup reads the keys once and removes both from process.env; the key store keeps them as the start keys; no model at start', async () => {
  const file = await keysFile();
  const got = await inChild({ ANTHROPIC_API_KEY: CLAUDE_KEY, OPENAI_API_KEY: KEY, AYDINLEARNS_KEYS_FILE: file }, `
    const keys = await m.openTutorKeys();
    const made = [];
    for (const c of [{ provider: 'claude', model: 'claude-opus-5-5', effort: 'high' }, { provider: 'openai', model: 'gpt-6-luna', effort: 'low' }]) {
      const model = await m.makeTutorModel(c, keys);
      made.push([model.provider, model.model]);
    }
    console.log(JSON.stringify({ a: process.env.ANTHROPIC_API_KEY ?? null, o: process.env.OPENAI_API_KEY ?? null, fake: m.TUTOR_FAKE,
      sources: [keys.sourceOf('claude'), keys.sourceOf('openai')], made, exported: Object.keys(m).sort() }));`);
  assert.deepEqual(got, { a: null, o: null, fake: false, sources: ['env', 'env'], made: [['claude', 'claude-opus-5-5'], ['openai', 'gpt-6-luna']],
    exported: ['TUTOR_FAKE', 'makeTutorModel', 'openTutorKeys'] });
  await assert.rejects(readFile(file, 'utf8'), 'opening the store writes no file');
});

test('startup: a key saved in tutor-keys.json (AYDINLEARNS_KEYS_FILE) wins; with no key for a provider, no model is built and the error holds no key', async () => {
  const file = await keysFile();
  await writeFile(file, JSON.stringify({ claude: CLAUDE_KEY }));
  const got = await inChild({ OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant-test-env-000000000000000', AYDINLEARNS_KEYS_FILE: file }, `
    const keys = await m.openTutorKeys();
    const failed = await m.makeTutorModel({ provider: 'openai', model: 'gpt-6-luna', effort: 'medium' }, keys).then(() => 'built', (e) => e.message);
    console.log(JSON.stringify({ sources: [keys.sourceOf('claude'), keys.sourceOf('openai')], failed }));`) as { sources: unknown; failed: string };
  assert.deepEqual(got.sources, ['settings', null]);
  assert.notEqual(got.failed, 'built');
  assert.ok(!got.failed.includes('sk-'), got.failed);
});

test('T-23: AYDINLEARNS_TUTOR_PROVIDER=fake is the test hook: the fake answers for every model, with no key; any other value is ignored', async () => {
  const code = `
    const keys = await m.openTutorKeys();
    const model = await m.makeTutorModel({ provider: 'claude', model: 'claude-sonnet-5-5', effort: 'high' }, keys).then((x) => [x.provider, x.model], () => null);
    console.log(JSON.stringify({ fake: m.TUTOR_FAKE, model }));`;
  assert.deepEqual(await inChild({ AYDINLEARNS_TUTOR_PROVIDER: ' Fake ', AYDINLEARNS_KEYS_FILE: await keysFile() }, code), { fake: true, model: ['fake', 'fake'] });
  for (const other of ['openai', 'claude', 'gemini']) {
    assert.deepEqual(await inChild({ AYDINLEARNS_TUTOR_PROVIDER: other, AYDINLEARNS_KEYS_FILE: await keysFile() }, code), { fake: false, model: null }, other);
  }
});

test('with a gateway set in the environment, startup and both providers still call the real hosts with only their own headers', async () => {
  // A child with the variables a gateway setup exports (test values only), calling each provider through a fake fetch: no network.
  const at = (p: string): string => JSON.stringify(pathToFileURL(resolve(p)).href);
  const bodies = { claude: claudeReply(), openai: sse([oaCreated, oaDelta(1, 'Hi'), oaDone(2)]) };
  const code = `
    await import(${at('server/tutor/startup.ts')});
    const { anthropicModel } = await import(${at('server/tutor/providers/anthropic.ts')});
    const { openaiModel } = await import(${at('server/tutor/providers/openai.ts')});
    const KEY = ${JSON.stringify(KEY)}, INPUT = ${JSON.stringify(INPUT)}, bodies = ${JSON.stringify(bodies)};
    const seen = [];
    const fake = (body, keyHeader, keyValue, unwanted) => async (input, init) => {
      const h = new Headers(input instanceof Request ? input.headers : init?.headers);
      seen.push({ url: String(input instanceof Request ? input.url : input), key: h.get(keyHeader) === keyValue, extra: [...h.keys()].filter((n) => unwanted.includes(n)) });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const gateway = ['x-gateway-token', 'openai-organization', 'openai-project'];
    const models = [
      anthropicModel({ apiKey: KEY, model: 'claude-haiku-5-5', effort: 'medium', fetch: fake(bodies.claude, 'x-api-key', KEY, [...gateway, 'authorization']) }),
      openaiModel({ apiKey: KEY, model: 'gpt-test', effort: 'medium', fetch: fake(bodies.openai, 'authorization', 'Bearer ' + KEY, gateway) }),
    ];
    for (const m of models) { const g = m.ask(INPUT); let n = await g.next(); while (!n.done) n = await g.next(); }
    console.log(JSON.stringify({ left: ['ANTHROPIC_CUSTOM_HEADERS', 'OPENAI_CUSTOM_HEADERS'].filter((k) => k in process.env), seen }));`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env,
    ANTHROPIC_API_KEY: KEY, OPENAI_API_KEY: KEY, AYDINLEARNS_TUTOR_PROVIDER: '', AYDINLEARNS_KEYS_FILE: await keysFile(),
    ANTHROPIC_BASE_URL: 'http://gateway.example.invalid', OPENAI_BASE_URL: 'http://gateway.example.invalid/v1',
    ANTHROPIC_CUSTOM_HEADERS: 'x-gateway-token: gw-test', OPENAI_CUSTOM_HEADERS: 'x-gateway-token: gw-test',
    ANTHROPIC_AUTH_TOKEN: 'gw-test', OPENAI_ORG_ID: 'org-test', OPENAI_PROJECT_ID: 'proj-test', OPENAI_ADMIN_KEY: 'admin-test' } });
  assert.deepEqual(JSON.parse(stdout), { left: [], seen: [
    { url: 'https://api.anthropic.com/v1/messages', key: true, extra: [] },
    { url: 'https://api.openai.com/v1/responses', key: true, extra: [] },
  ] });
});

// ---- Sprint 7 K1: sprint T's test gaps for the providers (T7 M8, M9) ---------------------------------------------------------------
test('K1: Claude: a stream that opens with a thinking block yields only the text, and the text block after it', async () => {
  const thinkingBlock: [string, object] = ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }];
  const thought: [string, object] = ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'PRIVATE THOUGHT' } }];
  const signed: [string, object] = ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }];
  const stopThinking: [string, object] = ['content_block_stop', { type: 'content_block_stop', index: 0 }];
  const textBlock: [string, object] = ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }];
  const textDelta = (text: string): [string, object] => ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } }];
  const stopText: [string, object][] = [['content_block_stop', { type: 'content_block_stop', index: 1 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 60 } }], ['message_stop', { type: 'message_stop' }]];
  const { text, done } = await drain(claude(fakeFetch(() => streamed(sse([claudeStart, thinkingBlock, thought, signed, stopThinking, textBlock, textDelta('Look at '),
    textDelta('the WHERE clause.'), ...stopText]))).f));
  assert.equal(text, 'Look at the WHERE clause.', 'the thinking is never shown');
  assert.ok(!text.includes('PRIVATE THOUGHT'));
  assert.equal(done.end, 'done');
  assert.equal(done.usage.output_tokens, 60);
});

test('K1: OpenAI: a busy provider is tried once more, then reads busy; a busy answer followed by a good one succeeds', async () => {
  const busy = fakeFetch(() => failed(503, { error: { message: 'The server is overloaded', type: 'server_error', code: null, param: null } }));
  const e = await failure(gpt(busy.f));
  assert.deepEqual([e.kind, e.message, busy.sent.length], ['busy', TUTOR_LINES.busy, 2], 'one retry, then the busy line');
  let calls = 0;
  const again = fakeFetch(() => (++calls === 1
    ? failed(503, { error: { message: 'The server is overloaded', type: 'server_error', code: null, param: null } })
    : streamed(sse([oaCreated, oaDelta(1, 'Look at '), oaDelta(2, 'the WHERE clause.'), oaDone(3)]))));
  const { text, done } = await drain(gpt(again.f));
  assert.equal(text, 'Look at the WHERE clause.');
  assert.equal(done.end, 'done');
  assert.equal(again.sent.length, 2);
});

test('K1: OpenAI: the key is never in a request body, whatever the question holds', async () => {
  const { f, sent } = fakeFetch(() => streamed(sse([oaCreated, oaDelta(1, 'Hi'), oaDone(2)])));
  await drain(gpt(f));
  assert.equal(sent.length, 1);
  assert.ok(!JSON.stringify(sent[0]!.body).includes(KEY), 'the key goes in a header, never the body');
  assert.ok(!sent[0]!.url.includes(KEY), 'and never in the address');
});

test('K1: OpenAI: a socket that breaks after some text is cut off with the line for it; one that breaks before any event cannot be reached', async () => {
  const cut = await failure(gpt(fakeFetch(() => broken(sse([oaCreated, oaDelta(1, 'Look at ')]))).f));
  assert.deepEqual([cut.kind, cut.message], ['cut_off', TUTOR_LINES.cut_off]);
  const never = await failure(gpt(fakeFetch(() => broken('')).f));
  assert.equal(never.kind, 'offline');
  assert.equal(never.message, "The tutor can't reach OpenAI right now. Everything else works.");
});

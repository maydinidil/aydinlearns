// tests/server/tutor-config.test.ts: whether the tutor is on, and with what (block P, T-20 to T-23): the state from the Settings values, where
// each key came from and the fake test hook; the reasons, in plain words that point to Settings; the model catalog, the effort and its
// token limit (T-21); the prices (D98, T-09, T-21) and the fake model (T-11). Every input here is an object the test builds: no test reads
// the real process.env or a key file for the tutor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tutorState, type TutorState } from '../../server/tutor/config.ts';
import type { KeySource } from '../../server/tutor/keys.ts';
import { DEFAULT_EFFORT, DEFAULT_MODEL, EFFORTS, MODELS, modelInfo, tokenLimit } from '../../server/tutor/models.ts';
import { costOf, priceOf, worstCost } from '../../server/tutor/prices.ts';
import { fakeModel, FAKE_MARK } from '../../server/tutor/providers/fake.ts';
import type { KeyProvider } from '../../server/tutor/types.ts';
import { DEFAULT_TUTOR_EFFORT, TUTOR_EFFORTS } from '../../schemas/tutor.ts';

const none = (): KeySource => null;
const claudeOnly = (p: KeyProvider): KeySource => (p === 'claude' ? 'settings' : null);
const openaiOnly = (p: KeyProvider): KeySource => (p === 'openai' ? 'env' : null);
const both = (): KeySource => 'env';
const CLAUDE_LINE = (label: string): string => `${label} needs a Claude key. Add one in Settings to turn the tutor on.`;
const OPENAI_LINE = (label: string): string => `${label} needs an OpenAI key. Add one in Settings to turn the tutor on.`;
const OFF_LINE = 'The tutor is switched off in Settings.';

test('on by default: Claude Haiku 5.5 at medium effort, once a Claude key is there', () => {
  assert.deepEqual(tutorState({}, claudeOnly, false),
    { enabled: true, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: null });
  assert.deepEqual(tutorState({ tutor_enabled: null, tutor_model: null, tutor_effort: null }, claudeOnly, false), tutorState({}, claudeOnly, false), 'null is the default');
});

test("off without the chosen model's key: the reason names the model and its provider, and points to Settings", () => {
  assert.deepEqual(tutorState({}, none, false),
    { enabled: false, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: CLAUDE_LINE('Claude Haiku 5.5') });
  assert.deepEqual(tutorState({}, openaiOnly, false).reason, CLAUDE_LINE('Claude Haiku 5.5'), 'the OpenAI key does not turn a Claude model on');
  assert.deepEqual(tutorState({ tutor_model: 'gpt-6.1-sol', tutor_effort: 'high' }, claudeOnly, false),
    { enabled: false, switched_on: true, provider: 'openai', model: 'gpt-6.1-sol', effort: 'high', reason: OPENAI_LINE('GPT-6.1 Sol') });
  for (const m of MODELS) {
    const on = tutorState({ tutor_model: m.id }, m.provider === 'claude' ? claudeOnly : openaiOnly, false);
    assert.deepEqual([on.enabled, on.provider, on.model, on.reason], [true, m.provider, m.id, null], m.id);
    const off = tutorState({ tutor_model: m.id }, m.provider === 'claude' ? openaiOnly : claudeOnly, false);
    assert.deepEqual([off.enabled, off.reason], [false, (m.provider === 'claude' ? CLAUDE_LINE : OPENAI_LINE)(m.label)], m.id);
  }
});

test('switched off in Settings: off whatever the keys or the test hook, with its own line', () => {
  for (const [keys, fake] of [[both, false], [none, true], [none, false]] as const) {
    assert.deepEqual(tutorState({ tutor_enabled: false, tutor_model: 'claude-sonnet-5-5', tutor_effort: 'low' }, keys, fake),
      { enabled: false, switched_on: false, provider: fake ? 'fake' : 'claude', model: 'claude-sonnet-5-5', effort: 'low', reason: OFF_LINE });
  }
  assert.equal(tutorState({ tutor_enabled: true }, both, false).enabled, true);
});

test('T-23: the fake hook answers for every model, with no key; the status names the chosen model and effort', () => {
  for (const m of MODELS) {
    assert.deepEqual(tutorState({ tutor_model: m.id, tutor_effort: 'high' }, none, true),
      { enabled: true, switched_on: true, provider: 'fake', model: m.id, effort: 'high', reason: null }, m.id);
  }
});

test('a Settings value the app does not know (a hand-edited log, a key pasted by hand) reads as its default; no field repeats it', () => {
  const odd: unknown[] = ['sk-ant-api03-not-a-real-key-0000', 'sk-proj-not-a-real-key', 'claude-made-up-9', 'toString', '__proto__', 'constructor',
    'Medium', 'max', 'false', 0, 42, {}, [], 'x'.repeat(100), 'model\nsecond line'];
  for (const v of odd) {
    const s = tutorState({ tutor_enabled: v, tutor_model: v, tutor_effort: v }, claudeOnly, false);
    assert.deepEqual(s, { enabled: true, switched_on: true, provider: 'claude', model: DEFAULT_MODEL, effort: DEFAULT_EFFORT, reason: null }, JSON.stringify(v));
    const off = tutorState({ tutor_model: v }, none, false);
    if (typeof v === 'string' && v.length > 3) assert.ok(!Object.values(off).some((x) => typeof x === 'string' && x.includes(v)), `${JSON.stringify(v)} is in no field`);
  }
});

test('no reason names .env, a variable or a key', () => {
  const states: TutorState[] = [];
  for (const m of MODELS) for (const keys of [none, claudeOnly, openaiOnly]) for (const enabled of [true, false]) for (const fake of [true, false]) {
    states.push(tutorState({ tutor_enabled: enabled, tutor_model: m.id }, keys, fake));
  }
  for (const s of states) if (s.reason !== null) assert.doesNotMatch(s.reason, /\.env|_API_KEY|AYDINLEARNS_|sk-/, s.reason);
});

test('the catalog (T-21): five models, Haiku 5.5 the default, each with its provider and a price row', () => {
  assert.deepEqual(MODELS.map((m) => [m.id, m.label, m.provider]), [
    ['claude-haiku-5-5', 'Claude Haiku 5.5', 'claude'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 'claude'], ['claude-opus-5-5', 'Claude Opus 5.5', 'claude'],
    ['gpt-6-luna', 'GPT-6 Luna', 'openai'], ['gpt-6.1-sol', 'GPT-6.1 Sol', 'openai'],
  ]);
  assert.equal(DEFAULT_MODEL, 'claude-haiku-5-5');
  for (const m of MODELS) assert.ok(priceOf(m.id), `${m.id} has a price row`);
  assert.equal(modelInfo('gpt-6-luna')?.label, 'GPT-6 Luna');
  for (const odd of ['toString', '__proto__', 'fake', '', null, 3]) assert.equal(modelInfo(odd), null, String(odd));
});

test('effort (T-21): low, medium (the default) or high, as the wire shapes say; the token limit grows with it', () => {
  assert.deepEqual(EFFORTS, TUTOR_EFFORTS);
  assert.equal(DEFAULT_EFFORT, DEFAULT_TUTOR_EFFORT);
  assert.deepEqual(EFFORTS.map(tokenLimit), [4_096, 8_192, 16_384]);
});

test('prices (T-21): every row per million tokens, Sonnet 5.5 cache read corrected to $0.10; cost rounds to a millionth of a dollar', () => {
  assert.deepEqual(priceOf('claude-haiku-5-5'), { input: 0.10, cache_write: 0.125, cached_input: 0.01, output: 0.50 });
  assert.deepEqual(priceOf('claude-sonnet-5-5'), { input: 2, cache_write: 2.5, cached_input: 0.10, output: 10 });
  assert.deepEqual(priceOf('claude-opus-5-5'), { input: 4, cache_write: 5, cached_input: 0.20, output: 20 });
  assert.deepEqual(priceOf('gpt-6-luna'), { input: 0.10, cache_write: 0.125, cached_input: 0.01, output: 0.50 });
  assert.deepEqual(priceOf('gpt-6.1-sol'), { input: 2, cache_write: 2.5, cached_input: 0.10, output: 10 });
  const p = priceOf('claude-haiku-5-5')!;
  assert.equal(costOf(p, { input_tokens: 2500, cache_write_tokens: 0, cached_input_tokens: 0, output_tokens: 600 }), 0.00055);
  assert.equal(costOf(p, { input_tokens: 100, cache_write_tokens: 900, cached_input_tokens: 0, output_tokens: 0 }), 0.000123);
  assert.equal(priceOf('gpt-made-up'), null);
  for (const model of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) assert.equal(priceOf(model), null, model);
  assert.equal(worstCost(p, 30_000, 4096), (10_000 * 0.125 + 4096 * 0.50) / 1_000_000);
});

test('the fake model streams a reply that names the screen and costs nothing', async () => {
  const m = fakeModel();
  const gen = m.ask({ system: 'S', turns: [], question: 'Screen: item\n<question>\nWhy is it wrong?\n</question>', maxTokens: 4096 });
  let text = '';
  let n = await gen.next();
  while (!n.done) { text += n.value; n = await gen.next(); }
  assert.ok(text.startsWith(FAKE_MARK));
  assert.match(text, /item screen/);
  assert.match(text, /Why is it wrong\?/);
  assert.equal(n.value.end, 'done');
  assert.equal(costOf(priceOf('fake')!, n.value.usage), 0);
});

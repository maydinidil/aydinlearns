// tests/web/tutor-settings.test.ts: the AI tutor's card in Settings and the panel's lines (block P, T-20 to T-22): the switch, the model
// list with its prices and why a model cannot be picked, the effort, the daily limit with "No daily limit", the two key rows (a key is
// sent once, to /api/tutor/keys, and never kept, shown or put in a URL), the spend line with no limit, and the panel's model line.
// Pure helpers, plus source checks where the screens hold the markup (there is no component test layer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_TUTOR_EFFORT, TUTOR_KEY_PATH, type TutorModelView, type TutorStatusView } from '../../schemas/tutor.ts';
import { api, ApiError } from '../../web/src/api.ts';
import { BUDGET_PROBLEM, capText, limitToSave, NO_LIMIT, resetsBudget } from '../../web/src/lib/tutor-budget.ts';
import {
  canRemoveKey, EFFORT_NOTE, EFFORT_OPTIONS, keepChoice, keyName, keyNotice, keySourceLine, keyToSave, keyView, KEYS_NOTE, modelLine, modelOptions,
  modelToSave, removeKeyBody, statusLine, SWITCH_LABEL, switchNotice, usd,
} from '../../web/src/lib/tutor-settings.ts';
import { spendLine } from '../../web/src/tutor/thread.ts';
import { saveTutorKey } from '../../web/src/tutor/tutor-api.ts';

// Invented models and prices: these tests are about the wording, never the real price rows (server/tutor/prices.ts).
const models: TutorModelView[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'claude', input_usd: 1, output_usd: 5, available: true },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'claude', input_usd: 15, output_usd: 75, available: true },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'openai', input_usd: 1.25, output_usd: 10, available: false },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', provider: 'openai', input_usd: 0.075, output_usd: 0.3, available: false },
];
const on: TutorStatusView = {
  enabled: true, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: null, models,
  keys: [{ provider: 'claude', source: 'settings' }, { provider: 'openai', source: null }], spent_today_usd: 0.0123, cap_usd: 1, run_on: false,
};
const web = (p: string) => readFile(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
/** The source without its comments, so a check reads only code. */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('the switch: its label, and the line after it is saved', () => {
  assert.equal(SWITCH_LABEL, 'Use the AI tutor');
  assert.equal(switchNotice(true), 'Tutor switched on.');
  assert.equal(switchNotice(false), 'Tutor switched off.');
});

test('a price in US dollars: two decimals at least, more only when the price has them', () => {
  assert.deepEqual([1, 0.1, 1.25, 15, 0.075, 0.3].map(usd), ['$1.00', '$0.10', '$1.25', '$15.00', '$0.075', '$0.30']);
});

test('the model list: each label with its price per million tokens in and out; a model without its key says which key to add below', () => {
  assert.deepEqual(modelOptions(on), [
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', price: '$1.00 in and $5.00 out per million tokens', available: true, note: null },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', price: '$15.00 in and $75.00 out per million tokens', available: true, note: null },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', price: '$1.25 in and $10.00 out per million tokens', available: false, note: 'Add an OpenAI API key below to use this model.' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', price: '$0.075 in and $0.30 out per million tokens', available: false, note: 'Add an OpenAI API key below to use this model.' },
  ]);
  const noClaude = modelOptions({ ...on, models: [{ ...models[0]!, available: false }] });
  assert.equal(noClaude[0]!.note, 'Add a Claude API key below to use this model.');
});

test('the model Save sends only a model that can be picked', () => {
  assert.equal(modelToSave('claude-opus-5-5', on), 'claude-opus-5-5');
  assert.equal(modelToSave('gpt-6.1-sol', on), null, 'its provider has no key');
  assert.equal(modelToSave('no-such-model', on), null);
});

test('the effort: Low, Medium (the default), High, with one line on what it changes', () => {
  assert.deepEqual(EFFORT_OPTIONS.map((o) => [o.value, o.label]), [['low', 'Low'], ['medium', 'Medium (the default)'], ['high', 'High']]);
  assert.equal(EFFORT_OPTIONS.find((o) => o.label.includes('(the default)'))!.value, DEFAULT_TUTOR_EFFORT);
  assert.equal(EFFORT_NOTE, 'Higher effort thinks longer: slower replies that cost more.');
});

test('a choice not yet saved is kept while the saved value stays; a new saved value, or a choice that can no longer be picked, replaces it', () => {
  assert.equal(keepChoice(null, null, 'medium'), 'medium', 'the first read');
  assert.equal(keepChoice('high', 'medium', 'medium'), 'high', 'another setting was saved');
  assert.equal(keepChoice('high', 'medium', 'low'), 'low', 'the saved value changed');
  assert.equal(keepChoice('gpt-6.1-sol', 'claude-haiku-5-5', 'claude-haiku-5-5', (id) => modelToSave(id, on) !== null), 'claude-haiku-5-5', 'its key was removed');
});

test('the daily limit: "No daily limit" saves "none"; otherwise the budget checks as before; the field shows the saved limit', () => {
  assert.equal(NO_LIMIT, 'none');
  assert.deepEqual(limitToSave('', false, true), { ok: true, value: 'none' });
  assert.deepEqual(limitToSave('25', true, true), { ok: true, value: 'none' }, 'the field is not read while "No daily limit" is ticked');
  assert.deepEqual(limitToSave('', false, false), { ok: true, value: null }, 'empty: the $1 default');
  assert.deepEqual(limitToSave('0.5', false, false), { ok: true, value: 0.5 });
  assert.deepEqual(limitToSave('25', false, false), { ok: false, problem: BUDGET_PROBLEM });
  assert.deepEqual(limitToSave('', true, false), { ok: false, problem: BUDGET_PROBLEM });
  assert.deepEqual([capText(1), capText(0.5), capText(null)], ['1', '0.5', '']);
});

test('the spend line, with a limit and with none', () => {
  assert.equal(spendLine({ spent_today_usd: 0.0123, cap_usd: 1 }), "Today's tutor spend: $0.0123 of $1.00");
  assert.equal(spendLine({ spent_today_usd: 0.0123, cap_usd: null }), "Today's tutor spend: $0.0123, no daily limit");
});

test('the card\'s first line: on names the model, the effort and the spend; off gives the server\'s reason', () => {
  assert.equal(statusLine(on), "On: Claude Haiku 5.5, medium effort. Today's tutor spend: $0.0123 of $1.00.");
  assert.equal(statusLine({ ...on, effort: 'high', cap_usd: null }), "On: Claude Haiku 5.5, high effort. Today's tutor spend: $0.0123, no daily limit.");
  assert.equal(statusLine({ ...on, enabled: false, switched_on: false, reason: 'The tutor is switched off.' }), 'Off. The tutor is switched off.');
  assert.equal(statusLine({ ...on, enabled: false, reason: null }), 'Off.');
});

test('the panel\'s quiet line names the model and the effort in use', () => {
  assert.equal(modelLine(on), 'Claude Haiku 5.5, medium effort');
  assert.equal(modelLine({ ...on, model: 'gpt-6.1-sol', provider: 'openai', effort: 'low' }), 'GPT-6.1 Sol, low effort');
  assert.equal(modelLine({ ...on, model: 'claude-next' }), 'claude-next, medium effort', 'a model the list does not hold: its ID');
  // The fake test hook (T-23) answers for every model: the line says so.
  assert.equal(modelLine({ ...on, provider: 'fake' }), 'Claude Haiku 5.5 (fake), medium effort');
  assert.equal(modelLine({ ...on, provider: 'fake', model: 'fake' }), 'fake, medium effort');
});

test('the key rows: the name, where the key comes from, and Remove only for a key saved in the app', () => {
  assert.deepEqual([keyName('claude'), keyName('openai')], ['Claude API key', 'OpenAI API key']);
  assert.deepEqual([keySourceLine('settings'), keySourceLine('env'), keySourceLine(null)], ['Saved in the app.', 'Read from .env or the environment.', 'Not set.']);
  assert.deepEqual(keyView(on, 'claude'), { provider: 'claude', source: 'settings' });
  assert.deepEqual(keyView({ ...on, keys: [] }, 'openai'), { provider: 'openai', source: null }, 'a provider the status leaves out: not set');
  assert.deepEqual([canRemoveKey({ provider: 'claude', source: 'settings' }), canRemoveKey({ provider: 'claude', source: 'env' }), canRemoveKey({ provider: 'claude', source: null })],
    [true, false, false]);
  assert.deepEqual([keyNotice('claude', true), keyNotice('openai', false)], ['Claude API key saved.', 'OpenAI API key removed.']);
  assert.match(KEYS_NOTE, /never shown again/);
});

test('what Save and Remove send: the key without the white space around it, nothing for an empty field, null to remove', () => {
  assert.deepEqual(keyToSave('claude', '  sk-ant-test-0123456789abcdef \n'), { provider: 'claude', key: 'sk-ant-test-0123456789abcdef' });
  assert.equal(keyToSave('openai', ''), null);
  assert.equal(keyToSave('openai', '   '), null);
  assert.deepEqual(removeKeyBody('openai'), { provider: 'openai', key: null });
});

type Mock = { mock: { method: (o: object, name: string, impl: unknown) => unknown } };
/** Replaces fetch for one test; records each call's method, path and body. */
function stubFetch(t: Mock, status = 200, reply: unknown = { ok: true }) {
  const sent: { path: string; method: string | undefined; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    sent.push({ path, method: init.method, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  });
  return sent;
}

test('a key is posted once, in the body, to /api/tutor/keys; never in the URL', async (t: Mock) => {
  const sent = stubFetch(t);
  await saveTutorKey({ provider: 'openai', key: 'sk-test-0123456789abcdefghij' });
  await saveTutorKey({ provider: 'claude', key: null });
  assert.equal(TUTOR_KEY_PATH, '/api/tutor/keys');
  assert.deepEqual(sent, [
    { path: '/api/tutor/keys', method: 'POST', body: { provider: 'openai', key: 'sk-test-0123456789abcdefghij' } },
    { path: '/api/tutor/keys', method: 'POST', body: { provider: 'claude', key: null } },
  ]);
});

test('a refused key gives the server\'s line as it comes', async (t: Mock) => {
  stubFetch(t, 400, { error: 'That does not look like a Claude key.' });
  await assert.rejects(saveTutorKey({ provider: 'claude', key: 'sk-ant-test-short' }),
    (e: unknown) => e instanceof ApiError && e.status === 400 && e.message === 'That does not look like a Claude key.');
});

test('the three new settings and "none" go through the settings call', async (t: Mock) => {
  const sent = stubFetch(t);
  await api.settings('tutor_enabled', false);
  await api.settings('tutor_model', 'gpt-6.1-sol');
  await api.settings('tutor_effort', 'high');
  await api.settings('tutor_daily_cap_usd', 'none');
  assert.deepEqual(sent.map((s) => s.body), [
    { key: 'tutor_enabled', value: false }, { key: 'tutor_model', value: 'gpt-6.1-sol' }, { key: 'tutor_effort', value: 'high' }, { key: 'tutor_daily_cap_usd', value: 'none' },
  ]);
});

test('Settings: the switch, the model and effort choices, "No daily limit" and the key fields are on the card', async () => {
  const s = code(await web('screens/SetupScreen.tsx'));
  assert.match(s, /role="switch"/, 'the on or off switch');
  assert.ok(s.includes('modelOptions(') && s.includes('EFFORT_OPTIONS') && s.includes('EFFORT_NOTE'), 'the model list and the effort');
  assert.ok(s.includes('limitToSave(') && s.includes('No daily limit'), 'the daily limit');
  assert.ok(s.includes("'tutor_enabled'") && s.includes("'tutor_model'") && s.includes("'tutor_effort'"), 'the three new settings are saved');
  // A key field is a masked text field (S7-34: never a password field a browser offers to save), never filled from the server: its value
  // is the row's own draft. tests/web/render/tutor-key-fields.test.ts renders it.
  assert.match(s, /<input type="text" style=\{KEY_FIELD_STYLE\} autoComplete="off" spellCheck=\{false\}/);
  assert.match(s, /style=\{KEY_FIELD_STYLE\}[^>]*value=\{draft\}/);
  assert.doesNotMatch(s, /type="password"/);
  assert.ok(s.includes('saveTutorKey(') && s.includes('keyToSave(') && s.includes('removeKeyBody('));
});

test('a key is never kept: no browser storage and no logging in the files that handle it; the field is emptied when Save is pressed', async () => {
  for (const f of ['screens/SetupScreen.tsx', 'lib/tutor-settings.ts', 'tutor/tutor-api.ts']) {
    const s = code(await web(f));
    assert.doesNotMatch(s, /localStorage|sessionStorage|indexedDB|console\.|document\.cookie/, f);
  }
  const s = code(await web('screens/SetupScreen.tsx'));
  const save = s.slice(s.indexOf('function TutorKeyRow'));
  assert.ok(save.indexOf("setDraft('')") !== -1 && save.indexOf("setDraft('')") < save.indexOf('saveTutorKey('), 'the field is cleared before the key is sent');
});

test('the top bar follows each status Settings reads, and the panel names the model and effort in use', async () => {
  const app = code(await web('App.tsx'));
  assert.match(app, /<SetupScreen onTutorStatus=\{\(s\) => setTutorOn\(s\.enabled\)\} \/>/);
  const shell = code(await web('components/AppShell.tsx'));
  assert.match(shell, /tutor\?\.enabled &&/, 'the button shows only when the status says enabled');
  const panel = code(await web('tutor/TutorPanel.tsx'));
  assert.ok(panel.includes('modelLine(status)') && panel.includes('spendLine(status)'));
});

test('review P M3: a status read again after another control is saved keeps an unsaved budget edit; a new cap resets the field', () => {
  assert.equal(resetsBudget(undefined, 1), true, 'the first status fills the field');
  assert.equal(resetsBudget(1, 1), false, 'the switch, a model, an effort or a key was saved: the budget field is left as typed');
  assert.equal(resetsBudget(null, null), false, 'no daily limit before and after');
  assert.equal(resetsBudget(1, 2), true, 'a saved budget');
  assert.equal(resetsBudget(1, null), true, 'no daily limit saved');
  assert.equal(resetsBudget(null, 0.5), true, 'a limit saved again');
});

// tests/web/render/tutor-key-fields.test.ts: S7-34 (block P review M4). The two tutor key fields are text inputs masked with
// -webkit-text-security, with autocomplete off and no spell check, so Chrome and Edge do not offer to save a key as a password.
// happy-dom drops -webkit-text-security from an element's style, so the mask is read from the server markup of the same row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, settle, stubFetch } from '../../helpers/render.ts';
import { SetupScreen, TutorKeyRow } from '../../../web/src/screens/SetupScreen.tsx';
import type { StatusView } from '../../../web/src/api.ts';
import type { TutorStatusView } from '../../../schemas/tutor.ts';

const status: StatusView = { ok: true, degraded: false, version: '0.7.0', settings: { backup_folder: null, exam_date: null, goal_dates: {} }, checks: [] };
const tutor: TutorStatusView = {
  enabled: false, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: 'Claude Haiku 5.5 needs a Claude key. Add one in Settings to turn the tutor on.',
  models: [{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'claude', input_usd: 0.1, output_usd: 0.5, available: false }],
  keys: [{ provider: 'claude', source: null }, { provider: 'openai', source: null }], spent_today_usd: 0, cap_usd: 1, run_on: false,
};

test('S7-34: both key fields render as text inputs with autocomplete off and no spell check; Settings has no password field', async () => {
  stubFetch((method, path) => {
    if (method !== 'GET') return undefined;
    if (path === '/api/status') return status;
    if (path === '/api/goals') return [];
    if (path === '/api/portfolio') return { folder: null };
    if (path === '/api/tutor/status') return tutor;
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(SetupScreen, {})));
  await settle();
  const fields = [...container.querySelectorAll('.tutor-key input')];
  assert.equal(fields.length, 2, 'one field per provider');
  for (const f of fields) {
    assert.deepEqual([f.getAttribute('type'), f.getAttribute('autocomplete'), f.getAttribute('spellcheck')], ['text', 'off', 'false']);
  }
  assert.equal(container.querySelectorAll('input[type="password"]').length, 0, 'no password field for a browser to offer to save');
  unmount();
});

test('S7-34: each key field is masked with -webkit-text-security: disc', () => {
  for (const provider of ['claude', 'openai'] as const) {
    const html = renderToStaticMarkup(createElement(TutorKeyRow, { view: { provider, source: null }, busy: false, onSend: () => {} }));
    const input = /<input[^>]*>/.exec(html)?.[0] ?? '';
    assert.match(input, /type="text"/, provider);
    assert.match(input, /style="[^"]*-webkit-text-security:disc/, provider);
    assert.match(input, /autoComplete="off"|autocomplete="off"/, provider);
  }
});

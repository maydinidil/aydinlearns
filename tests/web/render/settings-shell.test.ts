// tests/web/render/settings-shell.test.ts: Settings and the top bar rendered (sprint 5a P2a findings 44 and 46, and P4's version line). These
// replace the source greps that sat in tests/web/polish-p2a.test.ts and tests/web/version.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render, settle, stubFetch } from '../../helpers/render.ts';
import { SetupScreen } from '../../../web/src/screens/SetupScreen.tsx';
import { AppShell } from '../../../web/src/components/AppShell.tsx';
import type { StatusView } from '../../../web/src/api.ts';

const status = (over: Partial<StatusView> = {}): StatusView => ({
  ok: true, degraded: true, version: '0.5.0', settings: { backup_folder: null, exam_date: null, goal_dates: {} },
  checks: [{ name: 'DuckDB version', ok: true, detail: '1.5.6' }, { name: 'Course database', ok: true, detail: 'found' }], ...over,
});
async function settings(s: StatusView) {
  stubFetch((_m, path) => (path === '/api/status' ? s : undefined));   // degraded: Settings asks for nothing else
  const r = render(createElement('main', null, createElement(SetupScreen, {})));
  await settle();
  return r;
}

test('Settings shows the version line directly under its heading (P4)', async () => {
  const { container, unmount } = await settings(status());
  const h1 = container.querySelector('h1')!;
  assert.equal(h1.textContent, 'Settings and setup');
  assert.equal(h1.nextElementSibling?.textContent, 'Version 0.5.0');
  unmount();
});

test('Settings has no version line when the server sends none', async () => {
  const { container, unmount } = await settings(status({ version: undefined }));
  assert.ok(!container.textContent!.includes('Version '));
  unmount();
});

test('finding 44: the checks sit behind a one-line summary, closed while all pass', async () => {
  const { container, unmount } = await settings(status());
  const details = container.querySelector('details')!;
  assert.equal(details.querySelector('summary')?.textContent, 'All 2 checks pass');
  assert.equal(details.hasAttribute('open'), false);
  assert.equal(details.querySelectorAll('li').length, 2);
  unmount();
});

test('finding 44: the checks list opens by itself when one fails', async () => {
  const { container, unmount } = await settings(status({ checks: [{ name: 'DuckDB version', ok: true, detail: '1.5.6' }, { name: 'Course database', ok: false, detail: 'missing' }] }));
  const details = container.querySelector('details')!;
  assert.equal(details.querySelector('summary')?.textContent, '1 of 2 checks fails');
  assert.equal(details.hasAttribute('open'), true);
  assert.match(details.querySelector('li.bad')!.textContent!, /Course database fails: missing/);
  unmount();
});

function shell(hash: string, degraded = false) {
  location.hash = hash;
  return render(createElement(AppShell, { tab: 'sql', degraded, ending: false, onEndSession: () => {}, children: createElement('main', null) }));
}

test('finding 46: the Settings link is the current page on #/setup, and not elsewhere', () => {
  const on = shell('#/setup');
  assert.equal(on.container.querySelector('a[href="#/setup"]')?.getAttribute('aria-current'), 'page');
  on.unmount();
  const off = shell('#/map');
  assert.equal(off.container.querySelector('a[href="#/setup"]')?.getAttribute('aria-current'), null);
  assert.equal(off.container.querySelectorAll('nav.tabs [aria-current="page"]').length, 1, 'one tab is current');
  off.unmount();
});

test('setup mode: the Settings link is current whatever the address says, and the tabs and End session are gone', () => {
  const r = shell('#/', true);
  assert.equal(r.container.querySelector('a[href="#/setup"]')?.getAttribute('aria-current'), 'page');
  assert.equal(r.container.querySelector('nav.tabs'), null);
  assert.ok(![...r.container.querySelectorAll('button')].some((b) => b.textContent === 'End session'));
  r.unmount();
});

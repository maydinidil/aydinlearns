// tests/server/settings-from-events.test.ts: Settings.portfolio_folder is a required setting, null until an event sets it (Task K4, S6-38).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsFromEvents } from '../../server/app.ts';

test('K4: settings built from events with no portfolio event have portfolio_folder null', () => {
  assert.deepEqual(settingsFromEvents([]), { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null });
  const s = settingsFromEvents([{ event: 'setting_change', key: 'exam_date', value: '2026-12-01' }]);
  assert.equal(s.portfolio_folder, null);
  assert.equal(s.exam_date, '2026-12-01');
});

test('K4: the latest portfolio event wins, and a null value clears it', () => {
  const ev = (value: unknown) => ({ event: 'setting_change' as const, key: 'portfolio_folder' as const, value });
  assert.equal(settingsFromEvents([ev('D:\One'), ev('D:\Two')]).portfolio_folder, 'D:\Two');
  assert.equal(settingsFromEvents([ev('D:\One'), ev(null)]).portfolio_folder, null);
});

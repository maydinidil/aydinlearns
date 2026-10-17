// tests/server/settings-from-events.test.ts: Settings.portfolio_folder is a required setting, null until an event sets it (Task K4, S6-38).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsFromEvents } from '../../server/app.ts';

test('K4: settings built from events with no portfolio event have portfolio_folder null', () => {
  assert.deepEqual(settingsFromEvents([]), { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null, tutor_daily_cap_usd: null,
    tutor_enabled: null, tutor_model: null, tutor_effort: null });
  const s = settingsFromEvents([{ event: 'setting_change', key: 'exam_date', value: '2026-12-01' }]);
  assert.equal(s.portfolio_folder, null);
  assert.equal(s.exam_date, '2026-12-01');
});

test('K4: the latest portfolio event wins, and a null value clears it', () => {
  const ev = (value: unknown) => ({ event: 'setting_change' as const, key: 'portfolio_folder' as const, value });
  assert.equal(settingsFromEvents([ev('D:\One'), ev('D:\Two')]).portfolio_folder, 'D:\Two');
  assert.equal(settingsFromEvents([ev('D:\One'), ev(null)]).portfolio_folder, null);
});

test('sprint T: the tutor cap is read from the events file; never set, it is null', () => {
  assert.equal(settingsFromEvents([]).tutor_daily_cap_usd, null);
  assert.equal(settingsFromEvents([{ event: 'setting_change', key: 'tutor_daily_cap_usd', value: 2.5 }]).tutor_daily_cap_usd, 2.5);
});

test('block P (T-22): the tutor switch, model and effort, and a daily limit of none, are read from the events file; the latest wins', () => {
  const ev = (key: 'tutor_enabled' | 'tutor_model' | 'tutor_effort' | 'tutor_daily_cap_usd', value: unknown) => ({ event: 'setting_change' as const, key, value });
  const s = settingsFromEvents([ev('tutor_enabled', true), ev('tutor_model', 'gpt-6-luna'), ev('tutor_effort', 'high'), ev('tutor_daily_cap_usd', 2),
    ev('tutor_enabled', false), ev('tutor_model', 'claude-opus-5-5'), ev('tutor_daily_cap_usd', 'none')]);
  assert.deepEqual([s.tutor_enabled, s.tutor_model, s.tutor_effort, s.tutor_daily_cap_usd], [false, 'claude-opus-5-5', 'high', 'none']);
});

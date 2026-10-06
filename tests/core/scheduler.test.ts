// tests/core/scheduler.test.ts: the ts-fsrs wrapper (Task B3; design §5 "Scheduling" and "Day boundaries"; S2-13, S2-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { default_w, generatorParameters } from 'ts-fsrs';
import { CONFIG_IDS, configFor, emptyCard, fsrsParameters, isDue, retrievability, reviewCard, type CardSnapshot } from '../../core/scheduler.ts';
import type { DeckPreset } from '../../core/presets.ts';
import { amsterdamDate } from '../../core/time.ts';
import { CONFIG_IDS as PRESET_CONFIG_IDS, PRESETS } from '../../schemas/presets.ts';
import { fixedSequence } from '../helpers/fsrs-sequence.ts';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date('2026-10-12T08:00:00.000Z');
const SQL = configFor(PRESETS.sql, T0, null);
/** py-fsrs 6.3.2's FSRS-6 defaults (knowledge/02 §4), which design §20 says ts-fsrs 5.4.2 ships. */
const FSRS6_DEFAULTS = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
/** A card reviewed Easy at `first` (straight to review), then Good at `second`. */
const twice = (first: string, second: string): CardSnapshot =>
  reviewCard(reviewCard(emptyCard(new Date(first)), 4, new Date(first), SQL), 3, new Date(second), SQL);

test('CONFIG_IDS name each deck configuration, and schemas/presets.ts re-exports them (S2-13)', () => {
  assert.deepEqual(CONFIG_IDS, { sql: 'sql-v1', ga4: 'ga4-v1', ga4Boost: 'ga4-v1-boost', methodology: 'methodology-v1' });
  assert.equal(PRESET_CONFIG_IDS, CONFIG_IDS);
  assert.deepEqual([SQL.config_id, SQL.deck, SQL.retention, SQL.preset], ['sql-v1', 'sql', 0.9, PRESETS.sql]);
});
test('every preset value reaches ts-fsrs, and none of ts-fsrs\'s own defaults is used (design §5)', () => {
  for (const deck of ['sql', 'ga4', 'methodology'] as const) {
    const p = fsrsParameters(configFor(PRESETS[deck], T0, null));
    assert.deepEqual([p.request_retention, p.maximum_interval, p.enable_fuzz, p.enable_short_term, [...p.learning_steps], [...p.relearning_steps]],
      [0.9, 180, true, true, ['15m'], ['15m']], deck);
    assert.deepEqual([...p.w], [...default_w], deck);
  }
  const defaults = generatorParameters();
  assert.notDeepEqual([defaults.maximum_interval, defaults.enable_fuzz, [...defaults.learning_steps]], [180, true, ['15m']],
    'the ts-fsrs defaults differ from the preset, so a value that failed to reach ts-fsrs would show');
});
test('the FSRS-6 default weights are in use: a first Good sets difficulty near 2.1, a first Again near 6.4 (design §20)', () => {
  assert.deepEqual([...default_w], FSRS6_DEFAULTS);
  assert.ok(Math.abs(reviewCard(emptyCard(T0), 3, T0, SQL).difficulty - 2.118) < 0.01);
  assert.ok(Math.abs(reviewCard(emptyCard(T0), 1, T0, SQL).difficulty - 6.4133) < 0.01);
});
test('learning and relearning steps are 15 minutes', () => {
  const learning = reviewCard(emptyCard(T0), 1, T0, SQL);
  assert.deepEqual([learning.state, Date.parse(learning.due) - T0.getTime()], [1, 15 * MIN]);
  const graduated = reviewCard(emptyCard(T0), 4, T0, SQL);                // Easy takes a new card straight to review
  assert.equal(graduated.state, 2);
  const at = new Date(graduated.due);
  const lapse = reviewCard(graduated, 1, at, SQL);
  assert.deepEqual([lapse.state, Date.parse(lapse.due) - at.getTime(), lapse.lapses], [3, 15 * MIN, 1]);
});
test('the maximum interval is 180 days for Hard; at the cap ts-fsrs gives Good 181 and Easy 182, fuzz on or off (S2-79)', () => {
  // Ruling S2-79, from spike 1b (docs/planning/2026-10-03-spike-1b.md, P4 and X1): ts-fsrs 5.4.2 caps each rating's
  // interval at maximum_interval, then makes Good at least a day longer than Hard and Easy at least a day longer than
  // Good. So when the 180-day cap binds, Hard gets 180 days, Good 181 and Easy 182, with fuzz on or off. Accepted: the
  // wrapper does not clamp, and its snapshot stays exactly the ts-fsrs card.
  const BOUND = { 2: 180, 3: 181, 4: 182 } as const;
  const graduated = reviewCard(emptyCard(T0), 4, T0, SQL);
  for (const rating of [2, 3, 4] as const) {
    let card = graduated;
    const seen: number[] = [];
    for (let n = 0; n < 40; n++) { card = reviewCard(card, rating, new Date(card.due), SQL); seen.push(card.scheduled_days); }
    assert.ok(seen.every((d) => d <= BOUND[rating]), `rating ${rating}: ${seen.join(',')}`);
  }
  // A high-stability card: Easy at every due date for 25 reviews reaches the cap.
  let capped = graduated;
  const easy: number[] = [];
  for (let n = 0; n < 25; n++) { capped = reviewCard(capped, 4, new Date(capped.due), SQL); easy.push(capped.scheduled_days); }
  assert.equal(Math.max(...easy), BOUND[4], easy.join(','));
  const fuzzOff = configFor(PRESETS.sql, T0, null, { config_id: 'sql-fuzz-off', preset: { ...PRESETS.sql, enable_fuzz: false } });
  for (const cfg of [SQL, fuzzOff]) {
    const at = new Date(capped.due);
    const next = ([2, 3, 4] as const).map((rating) => reviewCard(capped, rating, at, cfg));
    assert.deepEqual(next.map((c) => c.scheduled_days), [BOUND[2], BOUND[3], BOUND[4]], `fuzz ${cfg.preset.enable_fuzz}`);
    for (const c of next) assert.equal(Date.parse(c.due) - at.getTime(), c.scheduled_days * DAY, 'due is the ts-fsrs due, not clamped');
  }
});
test('the GA4 boost runs from 14 days before the exam to the day before it, by Amsterdam date (S2-14)', () => {
  const exam = '2026-11-13';
  const cases: [string, number, string][] = [
    ['2026-10-29T11:00:00Z', 0.9, 'ga4-v1'],          // exam minus 15 days
    ['2026-10-30T11:00:00Z', 0.93, 'ga4-v1-boost'],   // exam minus 14 days
    ['2026-11-12T11:00:00Z', 0.93, 'ga4-v1-boost'],   // exam minus 1 day
    ['2026-11-13T11:00:00Z', 0.9, 'ga4-v1'],          // the exam day
    ['2026-11-20T11:00:00Z', 0.9, 'ga4-v1'],          // after the exam
    ['2026-10-29T23:30:00Z', 0.93, 'ga4-v1-boost'],   // 00:30 on 2026-10-30 in Amsterdam: the Amsterdam date counts
    ['2026-11-12T23:30:00Z', 0.9, 'ga4-v1'],          // 00:30 on the exam day in Amsterdam
  ];
  for (const [at, retention, id] of cases) {
    const c = configFor(PRESETS.ga4, new Date(at), exam);
    assert.deepEqual([c.retention, c.config_id, c.deck], [retention, id, 'ga4'], at);
    assert.equal(fsrsParameters(c).request_retention, retention, at);
  }
});
test('SQL and Methodology never boost, and the GA4 boost needs a valid exam date', () => {
  const at = new Date('2026-11-05T11:00:00Z');
  for (const [deck, id] of [['sql', 'sql-v1'], ['methodology', 'methodology-v1']] as const) {
    const c = configFor(PRESETS[deck], at, '2026-11-13');
    assert.deepEqual([c.config_id, c.deck, c.retention], [id, deck, 0.9]);
  }
  assert.deepEqual([configFor(PRESETS.ga4, at, null).config_id, configFor(PRESETS.ga4, at, 'soon').config_id], ['ga4-v1', 'ga4-v1']);
  assert.equal(configFor(PRESETS.ga4, at, '2026-11-13').config_id, 'ga4-v1-boost');
  // Shaped like a date but not a real one: missing, so no boost. Never an error (a logged setting_change must not stop
  // replay) and never rolled over (2026-02-30 is not 2026-03-02). Each review time is inside the window a rolled-over date would give.
  const notDates: [string, string][] = [['2026-13-01', '2026-12-25T11:00:00Z'], ['2026-00-10', '2025-12-05T11:00:00Z'], ['2026-02-30', '2026-02-20T11:00:00Z']];
  const idOrError = ([exam, when]: [string, string]): string => {
    try { return configFor(PRESETS.ga4, new Date(when), exam).config_id; } catch (e) { return (e as Error).name; }
  };
  assert.deepEqual(notDates.map(idOrError), ['ga4-v1', 'ga4-v1', 'ga4-v1'], notDates.map(([exam]) => exam).join(', '));
});
test('a config_change override replaces the preset and its ID from then on (S2-13)', () => {
  const at = new Date('2026-11-05T11:00:00Z');
  const sqlV2: DeckPreset = { ...PRESETS.sql, desired_retention: 0.85, maximum_interval: 365 };
  const c = configFor(PRESETS.sql, at, null, { config_id: 'sql-v2', preset: sqlV2 });
  assert.deepEqual([c.config_id, c.deck, c.retention, c.preset], ['sql-v2', 'sql', 0.85, sqlV2]);
  assert.deepEqual([fsrsParameters(c).request_retention, fsrsParameters(c).maximum_interval], [0.85, 365]);
  const ga4V2: DeckPreset = { ...PRESETS.ga4, desired_retention: 0.88 };
  const boosted = configFor(PRESETS.ga4, at, '2026-11-13', { config_id: 'ga4-v2', preset: ga4V2 });
  assert.deepEqual([boosted.config_id, boosted.retention], ['ga4-v2-boost', 0.93], 'the override keeps its own exam boost');
  const plain: DeckPreset = { deck: 'ga4', desired_retention: 0.88, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true };
  const unboosted = configFor(PRESETS.ga4, at, '2026-11-13', { config_id: 'ga4-v3', preset: plain });
  assert.deepEqual([unboosted.config_id, unboosted.retention], ['ga4-v3', 0.88], 'an override with no exam boost has none');
});
test('determinism with fuzz on: the same reviews give byte-equal cards twice, and in a fresh process in another time zone', () => {
  const a = fixedSequence();
  assert.equal(fixedSequence(), a);
  const env = { ...process.env, TZ: 'Pacific/Auckland' };
  const zone = execFileSync(process.execPath, ['-e', 'console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)'], { encoding: 'utf8', env }).trim();
  assert.equal(zone, 'Pacific/Auckland', 'the child process really runs in another time zone');
  const child = execFileSync(process.execPath, [fileURLToPath(new URL('../helpers/fsrs-sequence.ts', import.meta.url))], { encoding: 'utf8', env }).trim();
  assert.equal(child, a);
  assert.equal((JSON.parse(a) as unknown[]).length, 10);
});
test('reviewCard leaves its input unchanged and returns JSON-safe snapshots with exactly the CardSnapshot fields', () => {
  const card = reviewCard(emptyCard(T0), 4, T0, SQL);
  const before = JSON.stringify(card);
  const at = new Date(card.due);
  const next = reviewCard(card, 3, at, SQL);
  assert.equal(JSON.stringify(card), before);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  assert.deepEqual(Object.keys(next).sort(), ['difficulty', 'due', 'elapsed_days', 'lapses', 'last_review', 'learning_steps', 'reps', 'scheduled_days', 'stability', 'state']);
  assert.deepEqual([next.last_review, next.reps], [at.toISOString(), 2]);
});
test('elapsed days count UTC calendar dates: 23:59 then 00:01 is one day, two minutes on one date is none (design §5)', () => {
  const across = twice('2026-10-10T23:59:00Z', '2026-10-11T00:01:00Z');
  const sameDate = twice('2026-10-10T23:57:00Z', '2026-10-10T23:59:00Z');
  assert.deepEqual([across.elapsed_days, sameDate.elapsed_days], [1, 0]);
  assert.notEqual(across.stability, sameDate.stability, 'ts-fsrs counts the UTC day too: two minutes across midnight is a one-day review');
});
test('on 2026-10-25 (summer time ends) reviews count by UTC date, not by Amsterdam date', () => {
  // One Amsterdam date (00:30 CEST and 23:30 CET on 2026-10-25) over two UTC dates: one elapsed day.
  assert.deepEqual([amsterdamDate(new Date('2026-10-24T22:30:00Z')), amsterdamDate(new Date('2026-10-25T22:30:00Z'))], ['2026-10-25', '2026-10-25']);
  assert.equal(twice('2026-10-24T22:30:00Z', '2026-10-25T22:30:00Z').elapsed_days, 1);
  // Two Amsterdam dates (02:30 CEST on the 25th, 00:30 CET on the 26th) on one UTC date: no elapsed day.
  assert.deepEqual([amsterdamDate(new Date('2026-10-25T00:30:00Z')), amsterdamDate(new Date('2026-10-25T23:30:00Z'))], ['2026-10-25', '2026-10-26']);
  assert.equal(twice('2026-10-25T00:30:00Z', '2026-10-25T23:30:00Z').elapsed_days, 0);
});
test('emptyCard(due) is a new card with no review, due at that time; isDue compares with the time given', () => {
  const due = new Date('2026-10-11T22:00:00.000Z');          // 00:00 on 2026-10-12 in Amsterdam: the session-end fallback (S2-12)
  assert.deepEqual(emptyCard(due), { due: due.toISOString(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
    learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null });
  assert.equal(isDue(emptyCard(due), new Date(due.getTime() - 1)), false);
  assert.equal(isDue(emptyCard(due), due), true);
});
test('retrievability is 0 for a card never reviewed and falls with time after a review', () => {
  assert.equal(retrievability(emptyCard(T0), new Date(T0.getTime() + 5 * DAY), SQL), 0);
  const card = reviewCard(emptyCard(T0), 4, T0, SQL);
  const r = [1, 3, 10, 40].map((d) => retrievability(card, new Date(T0.getTime() + d * DAY), SQL));
  assert.ok(r.every((x) => x > 0 && x <= 1), r.join(','));
  assert.ok(r[0]! > r[1]! && r[1]! > r[2]! && r[2]! > r[3]!, r.join(','));
});
test('a review before the card\'s last review is refused', () => {
  const card = reviewCard(emptyCard(T0), 4, T0, SQL);
  assert.throws(() => reviewCard(card, 3, new Date(T0.getTime() - 1), SQL), RangeError);
});

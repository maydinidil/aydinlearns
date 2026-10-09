// tests/server/ga4-blueprint.test.ts: the dated GA4 run blueprints in content/ga4/exam.json (aydinlearns F14, owner decision D72;
// sprint 5b Task B4). Each entry has a `from` date and the three blueprints; a run is scored with the entry in force on the date it
// started, so a later entry never rescores an earlier run. The runs below are invented records: every ID here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { blueprintOn, parseGa4Exam, type Ga4ExamConfig } from '../../schemas/ga4-exam.ts';
import { choiceRuns } from '../../server/run.ts';
import type { ChoiceItem } from '../../schemas/choice.ts';

const raw = JSON.parse(await readFile(fileURLToPath(new URL('../../content/ga4/exam.json', import.meta.url)), 'utf8')) as Record<string, unknown> & {
  blueprints: { from: string }[];
};

const FIRST = {
  from: '2026-10-06',
  mini_drill: { questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' },
  half_mock: { questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam', retake_days: 21 },
  full_mock: { questions: 50, minutes: 75, pass_pct: 80, mode: 'exam', retake_days: 21 },
};
const WEIGHTS = { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 };
/** A later entry: the half-mock's pass mark and question count change on 2026-11-01. */
const LATER = { ...FIRST, from: '2026-11-01', half_mock: { ...FIRST.half_mock, questions: 30, pass_pct: 90 }, full_mock: { ...FIRST.full_mock, pass_pct: 85 } };
const twoEntries = (): Ga4ExamConfig => parseGa4Exam({ topic_weights: WEIGHTS, blueprints: [FIRST, LATER] });

const KEEP = 'content/ga4/exam.json changed the entry the logged runs were scored under. Past entries never change: add a new entry with '
  + 'the date it starts instead, or past runs are rescored (docs/reviews/codex-findings.md, F14).';

test('the shipped file: one entry from 2026-10-06 with the three blueprints, and it never changes once runs are scored under it (F14)', () => {
  assert.equal('mini_drill' in raw || 'half_mock' in raw || 'full_mock' in raw, false, 'the blueprints live in the dated entries only');
  assert.deepEqual(raw.blueprints[0], FIRST, KEEP);
  const cfg = parseGa4Exam(raw);
  assert.deepEqual(cfg.dated, [FIRST]);
  assert.deepEqual([cfg.mini_drill, cfg.half_mock, cfg.full_mock], [FIRST.mini_drill, FIRST.half_mock, FIRST.full_mock], 'the latest entry, for new runs');
});

test('the parser refuses entries out of date order, a repeated date, a bad date, a missing kind, and no entries at all', () => {
  const bad = (blueprints: unknown, why: RegExp): void => {
    assert.throws(() => parseGa4Exam({ topic_weights: WEIGHTS, blueprints }), (e: Error) => e.message.startsWith('ga4/exam.json: ') && why.test(e.message),
      String(JSON.stringify(blueprints)).slice(0, 120));
  };
  bad([LATER, FIRST], /blueprints\[1\]\.from.*after/);
  bad([FIRST, { ...LATER, from: FIRST.from }], /blueprints\[1\]\.from.*after/);
  bad([{ ...FIRST, from: '2026-13-01' }], /blueprints\[0\]\.from/);
  bad([{ ...FIRST, from: '6 October 2026' }], /blueprints\[0\]\.from/);
  for (const kind of ['mini_drill', 'half_mock', 'full_mock'] as const) {
    const { [kind]: _gone, ...rest } = FIRST;
    bad([rest], new RegExp(`blueprints\\[0\\]\\.${kind} is missing`));
    bad([FIRST, (() => { const { [kind]: _x, ...r } = LATER; return r; })()], new RegExp(`blueprints\\[1\\]\\.${kind} is missing`));
  }
  bad([{ ...FIRST, full_mock: { ...FIRST.full_mock, retake_days: -1 } }], /blueprints\[0\]\.full_mock\.retake_days/);
  bad([{ ...FIRST, full_mock: { ...FIRST.full_mock, minutes: 0 } }], /blueprints\[0\]\.full_mock\.minutes/);
  bad([], /blueprints/);
  bad(undefined, /blueprints/);
  bad({ 0: FIRST }, /blueprints/);
  bad([FIRST, 'x'], /blueprints\[1\] must be an object/);
  // The old layout, with the blueprints at the top level and no dates, is refused: it cannot say which runs it scored.
  assert.throws(() => parseGa4Exam({ topic_weights: WEIGHTS, mini_drill: FIRST.mini_drill, half_mock: FIRST.half_mock }), /blueprints/);
});

test('the parser refuses an entry whose full mock asks no more questions than its half-mock, in any entry', () => {
  const entry = (half: number, full: number) => ({ ...FIRST, half_mock: { ...FIRST.half_mock, questions: half }, full_mock: { ...FIRST.full_mock, questions: full } });
  const parse = (...e: object[]) => () => parseGa4Exam({ topic_weights: WEIGHTS, blueprints: e });
  assert.throws(parse(entry(25, 25)), /blueprints\[0\]\.full_mock\.questions/);
  assert.throws(parse(entry(25, 20)), /blueprints\[0\]\.full_mock\.questions/);
  assert.throws(parse(FIRST, { ...entry(30, 30), from: '2026-11-01' }), /blueprints\[1\]\.full_mock\.questions/);
  assert.equal(parse(entry(25, 26))().full_mock.questions, 26);
});

test('blueprintOn picks the latest entry from on or before the date, and the first entry for an earlier date', () => {
  const cfg = twoEntries();
  assert.deepEqual(cfg.dated.map((d) => d.from), ['2026-10-06', '2026-11-01']);
  assert.equal(cfg.half_mock.pass_pct, 90, 'the top-level blueprints are the latest entry\'s');
  const pass = (kind: 'mini_drill' | 'half_mock' | 'full_mock', date: string) => blueprintOn(cfg, kind, date).pass_pct;
  assert.deepEqual(['2026-10-01', '2026-10-06', '2026-10-31', '2026-11-01', '2027-03-01'].map((d) => pass('half_mock', d)), [80, 80, 80, 90, 90]);
  assert.deepEqual(['2026-10-31', '2026-11-01'].map((d) => pass('full_mock', d)), [80, 85]);
  assert.deepEqual(['2026-10-31', '2026-11-01'].map((d) => blueprintOn(cfg, 'half_mock', d).questions), [25, 30]);
  assert.equal(blueprintOn(cfg, 'full_mock', '2026-10-31').retake_days, 21);
  assert.deepEqual(blueprintOn(cfg, 'mini_drill', '2026-11-02'), FIRST.mini_drill);
});

// ---- F14: a run keeps the blueprint of the date it started ----------------------------------------------------------------------

const TOPIC = 'T-GA4-01';
const itemOf = (id: string): ChoiceItem | undefined => (id.startsWith('Q-INV-') ? ({ id, section: 'ga4', topic_id: TOPIC } as unknown as ChoiceItem) : undefined);
/** An ended half-mock on `day`: 25 questions, `right` of them answered right, the rest wrong; every item closed run_end. */
function halfMock(block: string, day: string, right: number): object[] {
  const at = (s: number) => new Date(Date.parse(`${day}T10:00:00Z`) + s * 1000).toISOString();
  const out: object[] = [];
  for (let n = 0; n < 25; n++) {
    const id = `${block}-I${n}`, item = `Q-INV-${block}-${n}`;
    out.push({ record: 'attempt', attempt_id: `${id}-a`, item_instance_id: id, item_id: item, section: 'ga4', phase: 'mock', block_id: block,
      started_at: at(n * 10), submitted_at: at(n * 10 + 5), outcome: n < right ? 'pass' : 'fail', is_correct: n < right, grading_source: 'auto',
      payload: { kind: 'mcq', shown_order: ['a', 'b'], chosen: 'a', run_kind: 'half_mock' } });
  }
  for (let n = 0; n < 25; n++) {
    out.push({ record: 'item_close', ts: at(600), item_instance_id: `${block}-I${n}`, item_id: `Q-INV-${block}-${n}`, phase: 'mock', block_id: block,
      reason: 'run_end', raw_outcome: { active_ms: 1000 } });
  }
  out.push({ record: 'block_close', ts: at(600), block_id: block, card_reviews: [] });
  return out;
}

test('F14: a past half-mock is scored with its own date\'s entry after a later entry changes the pass mark and the question count', () => {
  const records = [...halfMock('OCT', '2026-10-20', 20), ...halfMock('NOV', '2026-11-05', 20)];
  const before = choiceRuns(records.slice(0, 51), { cfg: parseGa4Exam({ topic_weights: WEIGHTS, blueprints: [FIRST] }), itemOf });
  const score = (r: { kind: string; date: string; pass_pct: number; score: { correct: number; of: number; pct: number; pass: boolean } }) =>
    [r.kind, r.date, r.score.correct, r.score.of, r.score.pct, r.pass_pct, r.score.pass];
  assert.deepEqual(before.map(score), [['half_mock', '2026-10-20', 20, 25, 80, 80, true]], 'under the only entry: 20 of 25 passes at 80%');
  const after = choiceRuns(records, { cfg: twoEntries(), itemOf });
  assert.deepEqual(after.map(score), [
    ['half_mock', '2026-11-05', 20, 30, 67, 90, false],
    ['half_mock', '2026-10-20', 20, 25, 80, 80, true],
  ], 'the October run keeps 25 questions and 80%; only a run from 1 November on is scored with the new entry');
});

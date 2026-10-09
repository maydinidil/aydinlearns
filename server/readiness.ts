// server/readiness.ts: the GA4 readiness check (sprint 5b Task B5; owner decision D70; Ruling 7). Advice only: it never locks a run,
// a lab or the exam (design §4). Pure: no I/O, no clock, and no import, so the browser build takes its types as they are
// (web/src/lib/readiness-api.ts). routes/run.ts answers it as GET /api/ga4/readiness from the ended GA4 runs (server/run.ts choiceRuns)
// and each item's cold answer (server/progress.ts coldAnswers).
// - The mock part. Only ended runs with at least one answer count. Take the ended full mocks and half-mocks on unseen questions (Ruling
//   7: every item the run logged was unseen at its start), newest first. Two candidates (Codex F27): the newest full mock, judged on its
//   own score, an unlogged question counting as wrong, so a crashed full mock with 30 logged answers is judged out of 50; and the newest
//   two half-mocks, whatever lies between them, summed, needing 85% of their questions together. The candidate whose newest run started
//   later decides. With only one candidate it decides; a lone half-mock and no full mock has no basis, and needs one more.
// - The topic part. Per GA4 topic, the share of cold answers that are right: at least one, and 75% or more.
// - Ready: both parts.
// countsForReadiness is the one test of whether a run counts: the mock part reads it, and so do the history row and the review
// (server/run.ts historyRow, counts_for_readiness), so no screen can say a run the check counts does not count (F2 I1, ruling 24).

/** The mock part's pass mark and a topic's, in percent (D70). */
export const READINESS_MOCK_PCT = 85;
export const READINESS_TOPIC_PCT = 75;

export interface ReadinessMock {
  pass: boolean;
  /** What decided it: the newest full mock, or the two newest half-mocks; null when there is no basis yet. */
  basis: 'full_mock' | 'two_half_mocks' | null;
  /**
   * The basis's right answers and questions, summed over two half-mocks. With no basis: the lone unseen half-mock's own score while it
   * waits for another, or 0 of 0.
   */
  correct: number; of: number;
  /** Rounded; null with nothing to count. */
  pct: number | null;
  /** The Amsterdam dates of the runs counted, newest first. */
  dates: string[];
}
export interface ReadinessTopic { topic_id: string; title: string; right: number; all: number; pct: number | null; pass: boolean }
export interface Ga4Readiness { pass: boolean; mock: ReadinessMock; topics: ReadinessTopic[]; threshold_mock: 85; threshold_topic: 75 }

/** An item's cold answer (server/progress.ts coldAnswers): its GA4 topic, and whether the answer was right. */
export interface ColdAnswer { topic: string; right: boolean }

/**
 * What the check reads of a GA4 run: server/run.ts's ChoiceRun has every field (tests/server/readiness.test.ts checks it at type
 * level). Declared here, not imported, so this module stays free of server/run.ts and its node imports.
 */
export interface ReadinessRun {
  kind: 'mini_drill' | 'half_mock' | 'full_mock';
  /** The Amsterdam date the run started. */
  date: string;
  started_at: string;
  /** Null while the run is on. */
  ended_at: string | null;
  /** Unlogged questions count as wrong: `of` is the blueprint's question count. */
  score: { correct: number; of: number };
  /** Ruling 7: a mock whose every logged item was unseen at its start; null for a mini drill. */
  logged_unseen: boolean | null;
  items: readonly { answered: boolean }[];
}

const pctOf = (right: number, all: number): number | null => (all > 0 ? Math.round((100 * right) / all) : null);
const reaches = (right: number, all: number, pct: number): boolean => all > 0 && 100 * right >= pct * all;

/** Ruling 7: a run the check counts is a half-mock or a full mock, ended, with at least one answer, every logged item unseen at its start. */
export const countsForReadiness = (r: ReadinessRun): boolean =>
  r.kind !== 'mini_drill' && r.ended_at !== null && r.items.some((i) => i.answered) && r.logged_unseen === true;

/** D70's mock part over the GA4 runs, in any order. */
function mockPart(runs: readonly ReadinessRun[]): ReadinessMock {
  const counted = runs
    .filter(countsForReadiness)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  if (counted.length === 0) return { pass: false, basis: null, correct: 0, of: 0, pct: null, dates: [] };
  const judged = (basis: ReadinessMock['basis'], list: readonly ReadinessRun[]): ReadinessMock => {
    const correct = list.reduce((n, r) => n + r.score.correct, 0);
    const of = list.reduce((n, r) => n + r.score.of, 0);
    return { pass: basis !== null && reaches(correct, of, READINESS_MOCK_PCT), basis, correct, of, pct: pctOf(correct, of), dates: list.map((r) => r.date) };
  };
  // Two candidates (Codex F27): the newest counted full mock, and the newest two counted half-mocks whatever lies between them.
  const fullMock = counted.find((r) => r.kind === 'full_mock');
  const halves = counted.filter((r) => r.kind === 'half_mock');
  const pair = halves.length >= 2 ? [halves[0]!, halves[1]!] : null;
  // The candidate whose newest run started later decides; a tie (>=) goes to the full mock.
  if (fullMock && (!pair || Date.parse(fullMock.started_at) >= Date.parse(pair[0].started_at))) return judged('full_mock', [fullMock]);
  if (pair) return judged('two_half_mocks', pair);
  // A lone half-mock and no full mock: no basis yet, its own score shown.
  return judged(null, [halves[0]!]);
}

/** D70: the readiness check. `topics`: the GA4 topics in the exam file's order, each with its name. */
export function ga4Readiness(runs: readonly ReadinessRun[], cold: ReadonlyMap<string, ColdAnswer>,
  topics: readonly { topic_id: string; title: string }[]): Ga4Readiness {
  const mock = mockPart(runs);
  const answers = [...cold.values()];
  const list = topics.map((t): ReadinessTopic => {
    const mine = answers.filter((a) => a.topic === t.topic_id);
    const right = mine.filter((a) => a.right).length;
    return { topic_id: t.topic_id, title: t.title, right, all: mine.length, pct: pctOf(right, mine.length), pass: reaches(right, mine.length, READINESS_TOPIC_PCT) };
  });
  return { pass: mock.pass && list.length > 0 && list.every((t) => t.pass), mock, topics: list, threshold_mock: READINESS_MOCK_PCT, threshold_topic: READINESS_TOPIC_PCT };
}

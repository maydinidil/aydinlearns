// web/src/lib/readiness-flow.ts: the GA4 readiness check's words (sprint 5b Task B5; D70), kept pure so they are testable. The runs
// card (components/Ga4Runs.tsx) and Progress's GA4 readiness part show the same lines. Advice only: nothing here locks anything.
// D70: every count is shown (F2 I2, ruling 25). Under the topics summary line each topic has its own short row with its count and
// mark, a passing topic too, so a topic resting on one or two answers shows it, and a topic with no first answer is named.
import type { Ga4Readiness, ReadinessMock, ReadinessTopic } from './readiness-api.ts';

export const READINESS_HEADING = 'Readiness check (advice only)';
/** Progress's version of the heading: its section covers Methodology too. */
export const PROGRESS_READINESS_HEADING = 'GA4 readiness check (advice only)';
/** F2 M4: Progress's muted line under the check, since the topic table below it counts first answers another way. */
export const PROGRESS_READINESS_NOTE = 'The check counts each question\'s first answer ever, with no help before it. The table below covers the last 30 days.';
/** Shown when both parts pass. */
export const READY_SENTENCE = 'You look ready to sit the exam. It is free, needs 80%, and can be retaken after 24 hours.';

const mark = (pass: boolean): string => (pass ? '✓' : '✗');

/** "Mock: 43 of 50 (86%) on two half-mocks on unseen questions ✓", or what is still needed. */
export function mockLine(m: ReadinessMock): string {
  if (m.basis !== null) {
    const on = m.basis === 'full_mock' ? 'a full mock' : 'two half-mocks';
    return `Mock: ${m.correct} of ${m.of} (${m.pct ?? 0}%) on ${on} on unseen questions ${mark(m.pass)}`;
  }
  if (m.of > 0) return `Mock: one more half-mock, or a full mock, on unseen questions needed (${m.correct} of ${m.of} right so far) ${mark(false)}`;
  return `Mock: a full mock, or two half-mocks, on unseen questions needed ${mark(false)}`;
}

/** The summary, "Topics: 4 of 5 at 75% or more on first answers ✗": each topic's count is on its own row under it (topicCountRow). */
export function topicsLine(r: Pick<Ga4Readiness, 'topics'>): string {
  const met = r.topics.filter((t) => t.pass).length;
  return `Topics: ${met} of ${r.topics.length} at 75% or more on first answers ${mark(met === r.topics.length && r.topics.length > 0)}`;
}

/** One topic's row: "Reports and analysis: 3 of 4 (75%) ✓", or "Tools and data sources: no first answers yet ✗". */
export function topicCountRow(t: ReadinessTopic): string {
  if (t.all === 0) return `${t.title}: no first answers yet ${mark(false)}`;
  return `${t.title}: ${t.right} of ${t.all} (${t.pct ?? 0}%) ${mark(t.pass)}`;
}

/** The check as shown: the mock line, the topics summary line with one row per topic under it, and the ready sentence when both parts pass. */
export interface ReadinessView { mock: string; topics: string; topicRows: string[]; ready: string | null }
export function readinessView(r: Ga4Readiness): ReadinessView {
  return { mock: mockLine(r.mock), topics: topicsLine(r), topicRows: r.topics.map(topicCountRow), ready: r.pass ? READY_SENTENCE : null };
}

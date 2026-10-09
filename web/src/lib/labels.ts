// web/src/lib/labels.ts: what the learner reads in place of IDs (owner decision D7), the re-test wording, the hidden labels
// of the mixed phases (S2-39), the fix-item, micro-lesson and wrap-up texts, and the lesson's remembered place (Task B15).
// Pure, apart from the storage it is handed and one cached curriculum fetch. No text here holds a study duration (design §4):
// the only clock time is when a re-test opens.
import type { Phase } from '../../../core/envelope.ts';
import type { CriterionResult } from '../../../core/goal-eval.ts';
import { amsterdamDate } from '../../../core/time.ts';
import type { BlockState } from './lesson-flow.ts';

// ---- concept titles -----------------------------------------------------------------------------------------------

export interface ConceptLabel { title: string; level: number | null }
export type Titles = ReadonlyMap<string, ConceptLabel>;
interface CurriculumLike { concepts: readonly { id: string; title?: unknown; level?: unknown }[] }

/** Each concept's title and level, from the curriculum. A missing or blank title is left out, so the ID shows instead. */
export function titlesFrom(curriculum: CurriculumLike): Titles {
  const out = new Map<string, ConceptLabel>();
  for (const c of curriculum.concepts) {
    out.set(c.id, { title: typeof c.title === 'string' ? c.title.trim() : '', level: typeof c.level === 'number' ? c.level : null });
  }
  return out;
}

/** A concept's title, or its ID when it has none, is unknown, or the curriculum has not loaded. */
export function conceptTitle(titles: Titles | null, id: string): string {
  return titles?.get(id)?.title || id;
}

let cached: Promise<Titles> | null = null;
/** The titles, fetched once per page. A failed fetch is not kept, so the next call tries again. */
export function loadTitles(fetchCurriculum: () => Promise<CurriculumLike>): Promise<Titles> {
  cached ??= fetchCurriculum().then(titlesFrom, (e: unknown) => { cached = null; throw e; });
  return cached;
}

/** "Exercise 1", "Exercise 2" and so on: a pool item's label in its lesson, in pool order. */
export const exerciseLabel = (index: number): string => `Exercise ${index + 1}`;
export const poolLabels = (ids: readonly string[]): { id: string; label: string }[] => ids.map((id, i) => ({ id, label: exerciseLabel(i) }));

export const levelBadge = (level: number | null): string | null => (level === null ? null : `Level ${level}`);

/** S2-51: a level's openers on the map, each always openable at its own screen. None until the openers' content ships. */
export function openersOfLevel(openers: readonly { case_id: string; level: number; title: string }[], level: number): { case_id: string; label: string; href: string }[] {
  return openers.filter((o) => o.level === level).map((o) => ({ case_id: o.case_id, label: `Level opener: ${o.title}`, href: `#/opener/${o.case_id}` }));
}

// ---- hidden labels (S2-39) ----------------------------------------------------------------------------------------

/** These phases hide the concept name, lesson title, level badge and item ID until after a submission. */
const HIDDEN_LABEL_PHASES: ReadonlySet<Phase> = new Set(['review', 'mixed', 'drill', 'case']);
export const hidesLabels = (phase: Phase): boolean => HIDDEN_LABEL_PHASES.has(phase);
export const labelsVisible = (hideLabels: boolean, submitted: boolean): boolean => !hideLabels || submitted;

/** What an exercise says about itself once its labels may show: its concept (the lesson's title), the level badge and its ID. */
export function itemLabels(item: { id: string; target_concept_id: string; level?: number | null }, titles: Titles | null):
  { conceptId: string; concept: string; level: string | null; itemId: string } {
  const level = titles?.get(item.target_concept_id)?.level ?? item.level ?? null;
  return { conceptId: item.target_concept_id, concept: conceptTitle(titles, item.target_concept_id), level: levelBadge(level), itemId: item.id };
}

export const REVIEW_HEADING = 'Review exercise';
export const OPENER_HEADING = 'Level opener';
export const mixedHeading = (k: number, n: number): string => `Mixed practice, exercise ${k} of ${n}`;
export const retestHeading = (title: string): string => `Re-test: ${title}`;

// ---- clock times and dates (Europe/Amsterdam, the app's day) ------------------------------------------------------

const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long' });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "14:05", in Amsterdam time. */
export const clockTime = (at: Date): string => CLOCK.format(at);
/** "at 14:05" on today's Amsterdam date, "on 6 October at 09:30" on another. */
export function opensWhen(at: Date, now: Date): string {
  return amsterdamDate(at) === amsterdamDate(now) ? `at ${clockTime(at)}` : `on ${DAY_MONTH.format(at)} at ${clockTime(at)}`;
}
/** A calendar date (YYYY-MM-DD) as "16 October", with the year when it is not the year of `today`. */
export function formatDate(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const text = `${d} ${MONTHS[(m ?? 1) - 1]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${y}`;
}

// ---- the re-test (RULE-08, S2-33) ---------------------------------------------------------------------------------

const more = (n: number): string => `after ${n} more exercise${n === 1 ? '' : 's'}`;
/**
 * "Ready now", or when the re-test opens: its clock time while that is ahead, with how many more exercises it needs when
 * that is known, and only the exercises once the time has passed.
 */
export function retestStatus(r: { ready: boolean; readyAt: string; remaining?: number | null }, now: Date): string {
  if (r.ready) return 'Ready now';
  const at = new Date(r.readyAt);
  const count = typeof r.remaining === 'number' && r.remaining > 0 ? r.remaining : null;
  if (at.getTime() > now.getTime()) return `Opens ${opensWhen(at, now)}${count === null ? '' : `, ${more(count)}`}`;
  return count === null ? 'Opens after a few more exercises' : `Opens ${more(count)}`;
}
/** The callout on the map and in the lesson: "Re-test for <title>: ready now", or "...: opens at 14:05, after 2 more exercises". */
export function retestCallout(title: string, r: { ready: boolean; readyAt: string; remaining?: number | null }, now: Date): string {
  const s = retestStatus(r, now);
  return `Re-test for ${title}: ${s[0]!.toLowerCase()}${s.slice(1)}`;
}

// ---- fix items (S2-48), micro-lessons and refreshers (design §5) -------------------------------------------------

export const FIX_INTRO = 'This query runs but gives the wrong result. Fix it.';
/** The query a fix item opens with, which the screen runs when the item opens; null for every other item. */
export function fixStarter(item: { kind: string; starter_sql: string | null }): string | null {
  return item.kind === 'fix' && typeof item.starter_sql === 'string' && item.starter_sql.trim() !== '' ? item.starter_sql : null;
}

export const MICRO_LESSON_INTRO = 'This concept keeps slipping. Start with a short refresher: the reading and two worked examples.';
export const refresherIntro = (title: string): string => `A quick refresher on ${title}: one worked example.`;

// ---- the wrap-up (design §4, S2-37, S2-38) ------------------------------------------------------------------------

export const NEXT_GOAL = 'Next goal';
/** S5A-18: a GA4 or Methodology tab with no goal with an unmet criterion in its section left shows the next goal overall, under this label. */
export const NEXT_GOAL_ALL = 'Next goal (all sections)';
export const nextGoalLine = (title: string, date: string, today: string, allSections = false): string =>
  `${allSections ? NEXT_GOAL_ALL : NEXT_GOAL}: ${title}, by ${formatDate(date, today)}`;
export const dueTomorrowLine = (n: number): string => `Due tomorrow: ${n} review${n === 1 ? '' : 's'}`;

const STATE_SUFFIX = / at (new|learning|practised|mastered|retained)$/;
const LEVEL_LABEL = /\blevel \d+ \w+$/;
const CONCEPT_LABEL = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+) at (\w+)$/;
const NAMED_LABEL = /^\d+ of \d+ named concepts at (\w+)((?: \(\d+ not yet available\))?)$/;
/**
 * One goal criterion: "SQL level 2 practised: 4 of 12 concepts", "GA4 level 1: not yet available", "Named concepts practised: 0 of 12",
 * a concept by its title, and "n of m" for a count, "done" or "not yet" for a single result. The state is a word after the name, never
 * "at practised" (sprint 5a, finding 20).
 */
export function criterionLine(c: CriterionResult, titles: Titles | null): string {
  const named = NAMED_LABEL.exec(c.label);
  if (named) {
    const head = `Named concepts ${named[1]}`;
    return c.available && c.done !== null && c.total !== null ? `${head}: ${c.done} of ${c.total}${named[2]}` : `${head}: not yet available`;
  }
  const one = CONCEPT_LABEL.exec(c.label);
  const at = one ? `${conceptTitle(titles, one[1]!)} at ${one[2]}` : c.label;
  if (!c.available) return `${at.replace(STATE_SUFFIX, '')}: not yet available`;
  const label = at.replace(STATE_SUFFIX, ' $1');
  if (LEVEL_LABEL.test(label) && c.done !== null && c.total !== null) return `${label}: ${c.done} of ${c.total} concept${c.total === 1 ? '' : 's'}`;
  if (c.done !== null && c.total !== null && c.total > 1) return `${label}: ${c.done} of ${c.total}`;
  return `${label}: ${c.met ? 'done' : 'not yet'}`;
}

// ---- the lesson's place (owner decision D7) -----------------------------------------------------------------------

export type LessonStep = 'pretest' | 'reading' | 'worked' | 'block' | 'practice';
/** Where a learner was in a concept's lesson: the step, the lesson block's item and stage, and the pretest answers so far. */
export interface LessonPosition { step: LessonStep; block: BlockState; pretest: { passed: boolean; helped: boolean }[] }
/** The part of the browser's Storage this uses. */
export interface PositionStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

const STEPS: readonly LessonStep[] = ['pretest', 'reading', 'worked', 'block', 'practice'];
export const positionKey = (conceptId: string): string => `aydinlearns.lesson-position.${conceptId}`;
/** The browser's localStorage; reaching it can itself throw (blocked site data), which the callers catch. */
const browserStore = (): PositionStore | null => (globalThis as { localStorage?: PositionStore }).localStorage ?? null;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function asPosition(v: unknown): LessonPosition | null {
  if (!isObject(v) || !STEPS.includes(v.step as LessonStep)) return null;
  const b = v.block;
  if (!isObject(b) || !Number.isInteger(b.index) || (b.index as number) < 0 || ![1, 2, 3].includes(b.stage as number) || typeof b.showWorkedAgain !== 'boolean') return null;
  const p = v.pretest;
  if (!Array.isArray(p) || p.length > 2 || !p.every((x) => isObject(x) && typeof x.passed === 'boolean' && typeof x.helped === 'boolean')) return null;
  return {
    step: v.step as LessonStep,
    block: { index: b.index as number, stage: b.stage as 1 | 2 | 3, showWorkedAgain: b.showWorkedAgain },
    pretest: (p as { passed: boolean; helped: boolean }[]).map((x) => ({ passed: x.passed, helped: x.helped })),
  };
}

/** The concept's remembered place, or null: nothing stored, something else stored, or storage that throws or is missing. */
export function readPosition(conceptId: string, store: () => PositionStore | null = browserStore): LessonPosition | null {
  try {
    const raw = store()?.getItem(positionKey(conceptId));
    return typeof raw === 'string' ? asPosition(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
/** Remembers the concept's place. False when it could not be stored; the lesson works the same without it. */
export function writePosition(conceptId: string, position: LessonPosition, store: () => PositionStore | null = browserStore): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(positionKey(conceptId), JSON.stringify(position));
    return true;
  } catch {
    return false;
  }
}

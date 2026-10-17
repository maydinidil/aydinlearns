// web/src/tutor/snapshot.ts: what the tutor sees (AI tutor design §5, T-02): the parts the mounted components register (what the screen's
// text does not hold: an exercise's IDs and status, the editor's full text, a typed value, a form's fields), then the visible text of the
// screen's main area. Cut at SNAPSHOT_MAX characters, longest section first, with a note; the panel says so. Pure functions only.
import { SNAPSHOT_MAX, type TutorItemRef } from '../../../schemas/tutor.ts';
import type { OptionTable } from '../../../schemas/choice-types.ts';
import { optionTableView } from '../lib/sql-choice.ts';

/**
 * The item a question is about. `passed`: passed, answered or its answer shown, so a question on it counts for nothing and the help
 * note stays away (spec §7, N2). Never read from the reply's summary: an SQL instance stays open after its pass.
 */
export type SnapshotItem = TutorItemRef & { passed: boolean };
export interface SnapshotPart { label: string; text: string; item?: SnapshotItem }
export interface TutorSnapshot { text: string; item: SnapshotItem | null; cut: boolean }
/** The button's line while a timed run's clock runs (spec §10, D94). */
export const TUTOR_WAITS = 'The tutor waits for the review';

const render = (s: { label: string; text: string }[]): string => s.map((x) => `## ${x.label}\n${x.text}`).join('\n\n');
const cutNote = (n: number): string => `[${n} characters left out to fit]`;

/** The item the question is about: the last registered part that names one. */
export const itemOf = (parts: readonly SnapshotPart[]): SnapshotItem | null => [...parts].reverse().find((p) => p.item)?.item ?? null;

export function composeSnapshot(parts: readonly SnapshotPart[], visible: string, max = SNAPSHOT_MAX): TutorSnapshot {
  const sections = [...parts.map((p) => ({ label: p.label, text: p.text })), { label: 'What the screen shows', text: visible.trim() }]
    .filter((s) => s.text.trim() !== '');
  let cut = false;
  for (let guard = 0; render(sections).length > max && guard < 2 * sections.length; guard++) {
    const longest = sections.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    const keep = Math.max(0, longest.text.length - (render(sections).length - max) - 40);
    longest.text = `${longest.text.slice(0, keep)}\n${cutNote(longest.text.length - keep)}`;
    cut = true;
  }
  return { text: render(sections), item: itemOf(parts), cut };
}

export interface ExerciseState { itemId: string; instanceId: string; phase: string; passed: boolean; answerShown: boolean; query: string; hintsShown: number }
/** An SQL exercise (write, fix, a case's CP3): the full editor text, which the screen's text may show only in part. */
export function exercisePart(s: ExerciseState): SnapshotPart {
  const status = s.passed ? 'passed' : s.answerShown ? 'answer shown' : 'not passed';
  // T-18: no item ID in the label; an ID names its concept, which S2-39 may hide. The server adds the ID when labels show (T-16).
  return { label: 'Exercise', text: [`Status: ${status}`, `Hints opened: ${s.hintsShown}`, "The learner's query:", s.query.trim() === '' ? '(empty)' : s.query].join('\n'),
    item: { item_id: s.itemId, item_instance_id: s.instanceId, phase: s.phase, passed: s.passed || s.answerShown } };
}

/** An option as the screen draws it: its text, and a predict_result option's small result table. */
export interface ShownOption { text: string; table?: OptionTable }
export interface ChoiceState {
  label: string; itemId: string; instanceId: string; phase: string; answered: boolean; correct: boolean | null; answerShown: boolean;
  /** The text of the option picked. */
  chosen: string | null;
  typed: string;
  /** The options in the order the screen shows them, top down; null or left out for a typed question. */
  options?: readonly ShownOption[] | null;
}

const PLACES = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** An option's place on the screen, as the prompt tells the tutor to name it (seams review I1): "the third option". No screen numbers its options. */
const placeName = (i: number): string => (PLACES[i] ? `the ${PLACES[i]} option` : `option ${i + 1}`);
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One option as the screen shows it: its place, its text (a query on lines of its own) and a result table as the table draws it. */
function optionLines(o: ShownOption, i: number): string[] {
  const text = o.text.trim().split('\n');
  const t = o.table ? optionTableView(o.table) : null;
  const table = t ? [`(${t.count})`, t.columns.join(' | '), ...t.rows.map((r) => r.join(' | '))] : [];
  const head = `${capital(placeName(i).replace(/^the /, ''))}:`;
  const indent = (xs: string[]): string[] => xs.map((x) => `  ${x}`);
  return text.length === 1 ? [`${head} ${text[0]}`, ...indent(table)] : [head, ...indent([...text, ...table])];
}

/**
 * A GA4, Methodology or SQL choice question, or a case checkpoint: its status, its options top down by their place on the screen (the
 * model cannot count options in the screen's text; seams review I1), the option picked, by its place, and a typed value (inputs are
 * not in the text). The options are already on the screen, so nothing new reaches the tutor.
 */
export function choicePart(s: ChoiceState): SnapshotPart {
  const status = s.answerShown ? 'answer shown' : s.answered ? (s.correct === null ? 'answered' : s.correct ? 'answered, correct' : 'answered, wrong') : 'not answered';
  const options = s.options ?? [];
  const picked = s.chosen === null ? -1 : options.findIndex((o) => o.text === s.chosen);
  const lines = [
    `Status: ${status}`,
    ...(options.length > 0 ? ['Options, from the top of the screen down:', ...options.flatMap(optionLines)] : []),
    ...(s.chosen ? [`The learner picked: ${picked >= 0 ? placeName(picked) : s.chosen}`] : []),
    ...(s.typed.trim() ? [`The learner typed: ${s.typed.trim()}`] : []),
  ];
  return { label: s.label, text: lines.join('\n'), item: { item_id: s.itemId, item_instance_id: s.instanceId, phase: s.phase, passed: s.answered || s.answerShown } };
}

/** A form's fields as the learner has typed them (a case's plan or sketch, a lab's answers): inputs are not in the screen's text. */
export function fieldsPart(label: string, fields: Readonly<Record<string, string | string[] | boolean>>): SnapshotPart {
  const show = (v: string | string[] | boolean): string => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.trim()) || '(empty)';
  return { label, text: Object.entries(fields).map(([k, v]) => `${k}: ${show(v)}`).join('\n') };
}

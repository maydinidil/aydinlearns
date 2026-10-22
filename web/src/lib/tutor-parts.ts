// web/src/lib/tutor-parts.ts: what the screens give the tutor beyond their visible text (AI tutor design §5; sprint T, T9, T-02), and when
// the quick prompts show. Pure functions over what a screen already holds: the learner's own work, the item's IDs and status, the option
// picked, a mark only a square's colour shows. Never a key, a held-out item or anything the screen does not have. A panel that is not in
// view (another drill question, a case step not shown) names no item, so the question's item is the one on the screen (N3). Sprint 7 Part 2
// (Task N3, S7-17): a case mock review's CP6 part and its second-opinion prompt, which name no item.
import type { DrillQuestionOutcome } from '../api.ts';
import type { LabPart } from '../../../schemas/lab.ts';
import { quickPrompts, type QuickPrompt } from '../tutor/quick-prompts.ts';
import { exercisePart, fieldsPart, type ExerciseState, type SnapshotPart } from '../tutor/snapshot.ts';
import { keyFailed } from './exercise.ts';
import { NOTE_LABEL, partLabel, SELF_MATCH, SELF_NO_MATCH, type LabForm } from './lab-flow.ts';

/**
 * An SQL exercise panel: its part once the exercise has loaded, while it is the one in view. A drill question never answered shows no
 * editor in the review, so its starting text is not the learner's query. A review-only panel is a new mount whose editor opens with its
 * starting text (empty for a write item, the planted query for a fix item), so while the editor still holds that text the learner's
 * drill answer is not on this screen. The run's end closed the panel's instance, so a question there counts for nothing (S2-44, spec
 * section 7): the part names the item as passed, which keeps the help note away, while its status text stays as it is.
 */
export function exercisePanelPart(s: ExerciseState & { loaded: boolean; inView: boolean; unanswered: boolean; reviewOnly?: boolean; startText?: string }): SnapshotPart | null {
  if (!s.loaded || !s.inView) return null;
  const startText = s.reviewOnly === true && s.query === (s.startText ?? '');
  const p = exercisePart({ itemId: s.itemId, instanceId: s.instanceId, phase: s.phase, passed: s.passed, answerShown: s.answerShown,
    query: s.unanswered ? '' : s.query, hintsShown: s.hintsShown });
  const text = startText && !s.unanswered ? p.text.slice(0, p.text.indexOf("The learner's query:")) + "The learner's drill answer is not on this screen." : p.text;
  return s.reviewOnly === true ? { ...p, text, item: { ...p.item!, passed: true } } : p;
}

/** A form's fields by the labels the screen shows (a case's plan or sketch). Nothing typed at all is no part. */
export function labelledFieldsPart(label: string, points: readonly { id: string; label: string }[], values: Readonly<Record<string, string>>): SnapshotPart | null {
  if (points.every((p) => (values[p.id] ?? '').trim() === '')) return null;
  return fieldsPart(label, Object.fromEntries(points.map((p) => [p.label, values[p.id] ?? ''])));
}

/** A text the learner typed (a case's insight), trimmed. A blank one is no part. */
export function textPart(label: string, text: string): SnapshotPart | null {
  return text.trim() === '' ? null : { label, text: text.trim() };
}

/** A lab's answers by the questions the screen shows: the dates when the lab asks for them, each part shown, then the note. */
export function labAnswersPart(labId: string, parts: readonly LabPart[], form: LabForm, withDates: boolean): SnapshotPart {
  const self = (v: boolean | undefined): string => (v === undefined ? '' : v ? SELF_MATCH : SELF_NO_MATCH);
  const fields: Record<string, string | string[]> = withDates ? { From: form.from, To: form.to } : {};
  for (const p of parts) fields[partLabel(p)] = p.check === 'self_rubric' ? self(form.self[p.id]) : form.values[p.id] ?? '';
  fields[NOTE_LABEL] = form.note;
  return fieldsPart(`Lab ${labId}: your answers, as typed`, fields);
}

/** The explorer: the dataset chosen and the editor's full text (the editor may show only part of a long query). */
export function explorerPart(schema: string | null, query: string): SnapshotPart {
  return { label: 'Explorer', text: [`Dataset: ${schema ?? 'none chosen'}`, "The learner's query:", query.trim() || '(empty)'].join('\n') };
}

type DrillOutcome = DrillQuestionOutcome['outcome'];
const MARK: Record<DrillOutcome, string> = { passed: 'passed', failed: 'not passed', not_answered: 'not answered' };
/** The drill review: the mark of the question in view, which only its square's colour and name show. No mark known is no part. */
export function drillMarkPart(index: number, total: number, outcome: DrillOutcome | null): SnapshotPart | null {
  return outcome ? { label: 'Drill review', text: `In view: question ${index + 1} of ${total}. Its mark in the drill: ${MARK[outcome]}.` } : null;
}

/** The option picked, by the text the screen shows it with. */
export function optionText(options: readonly { oid: string; text: string }[] | null, chosen: string | null): string | null {
  return chosen === null ? null : options?.find((o) => o.oid === chosen)?.text ?? null;
}

/** The tutor is on and no timed run's clock closes it (D94): only then do the quick prompts show. */
export const tutorAvailable = (t: { enabled: boolean; closedBy: string | null } | null): boolean => t !== null && t.enabled && t.closedBy === null;

/** Beside a failed grade. Not when the exercise's own key failed: the learner may be right, so nothing asks why it is wrong. */
export function gradeQuickPrompts(t: { enabled: boolean; closedBy: string | null } | null,
  g: { outcome: string; diagnosis?: { errorId: string } | null; notes: string[] }): QuickPrompt[] {
  if (!tutorAvailable(t) || keyFailed(g)) return [];
  return quickPrompts({ outcome: g.outcome, errorId: g.diagnosis?.errorId ?? null });
}

const WHY: QuickPrompt = { label: 'Why is this wrong?', question: 'Why is this wrong?' };
/** Beside a wrong choice answer, where its explanation shows. */
export function choiceQuickPrompts(t: { enabled: boolean; closedBy: string | null } | null, result: { correct: boolean } | null): QuickPrompt[] {
  return tutorAvailable(t) && result !== null && !result.correct ? [WHY] : [];
}

/** S7-17 (D101): the tutor's second opinion on a case mock's written answer, in its review's CP6 panel. */
export const SECOND_OPINION: QuickPrompt = {
  label: 'Ask the tutor for a second opinion',
  question: 'Grade my written answer against each rubric line: met or not, with one reason each.',
};
/** S7-17: in a case-round's or take-home's review, while the tutor is on and something was written in the run. The review has no run's clock. */
export function secondOpinionPrompts(t: { enabled: boolean; closedBy: string | null } | null, wrote: boolean): QuickPrompt[] {
  return tutorAvailable(t) && wrote ? [SECOND_OPINION] : [];
}
/**
 * S7-17: what a case mock review's CP6 panel shows, for the second opinion: the learner's insight or memo, the model answer and the rubric
 * lines, core ones marked. It names no item, so the question is logged with no item instance: it is not help and changes no pass.
 */
export function mockReviewPart(r: { memo: boolean; written: string | null; modelAnswer: string; rubric: readonly { id: string; label: string }[]; core: readonly string[] }): SnapshotPart {
  const written = r.written?.trim() ? r.written.trim() : '(nothing written)';
  return {
    label: `${r.memo ? 'Take-home' : 'Case-round'} review: CP6, the written answer`,
    text: [`The learner's ${r.memo ? 'memo' : 'insight'}:`, written, '', 'The model answer:', r.modelAnswer.trim(), '',
      'The rubric lines (the core lines decide the checkpoint):', ...r.rubric.map((p) => `- ${p.label}${r.core.includes(p.id) ? ' (core)' : ''}`)].join('\n'),
  };
}

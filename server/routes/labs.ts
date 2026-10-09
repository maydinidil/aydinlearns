// server/routes/labs.ts: the GA4 lab routes (sprint 5b, Task B2; design §8; D68, D69). Grading and state are server/labs.ts's;
// this module reads the attempt log's lab_answer records, takes today's Amsterdam date from the clock at each request, and writes
// one lab_answer per answer. The security middleware (Host and Origin) covers every path here, as it covers all of /api/*.
//
// GET /api/labs: the guide's title and text, and every lab with its state.
// GET /api/labs/:id: the lab as its file has it (a lab file holds no key), its state, and the mode the screen should offer first:
//   recheck while a re-check waits, is due, or failed; first otherwise. `month` and `range` are what that mode reads: on a re-check
//   the baseline's, never any value it read; on a first answer the fixed month a fixed_month lab reads today, and no range.
// POST /api/labs/:id/answer { kind, values, self, range, note }: validated, graded, logged as one lab_answer, and answered with
//   each part's outcome and the new state. Only this reply carries a structural part's expected answer. The POST takes the kind it
//   is sent, so a first answer may start the week again during a re-check. A re-check sent before 7 days after the baseline is
//   logged and graded, and the reply says from when a re-check counts.
import type { Context, Hono } from 'hono';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';
import { isRecheck, sameText, type Lab, type LabPart } from '../../schemas/lab.ts';
import type { LabAnswer } from '../../schemas/log-ext.ts';
import type { RouteDeps } from '../app.ts';
import {
  addDays, fixedMonth, gradeFirst, gradeRecheck, labBaseline, labStatus, parseLabNumber, RANGE_PART, RECHECK_AFTER_DAYS, suggestedMode,
  type LabAnswerReply, type LabsView, type LabView,
} from '../labs.ts';

export const NOTE_LIMIT = 500;
const UNKNOWN = 'Unknown lab.';
const NO_BASELINE = 'There is no first answer to re-check yet. Answer the lab from the start.';
const RANGE_NEEDED = 'Type the From and To dates that GA4 shows for Last 28 days.';
const RANGE_ORDER = 'The From date cannot be after the To date.';
const RANGE_SPAN = "GA4's Last 28 days covers 28 days. Check From and To.";
const MONTH_CHANGED = 'The month to use has changed. Reload the lab.';
/** Days from the first day of Last 28 days to its last. */
const SPAN_DAYS = 27;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 2026-10-15 as "15 October". */
const dayMonth = (date: string): string => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** A refusal. `part_id` names the part a value refusal is about, so the screen can show it beside that part. */
class Refusal extends Error {
  readonly status: 400 | 404 | 409 | 500;
  readonly part_id: string | undefined;
  constructor(status: 400 | 404 | 409 | 500, message: string, part_id?: string) {
    super(message);
    this.status = status;
    this.part_id = part_id;
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** A lab_answer the app wrote. Anything else in the attempt files, or a record too damaged to read, is passed over. */
function isLabAnswer(r: object): r is LabAnswer {
  const a = r as Partial<LabAnswer>;
  return a.record === 'lab_answer' && typeof a.lab_id === 'string' && typeof a.lab_version === 'number' && typeof a.ts === 'string'
    && (a.kind === 'first' || a.kind === 'recheck') && Array.isArray(a.parts) && a.parts.every((p) => isObj(p) && typeof p.part_id === 'string');
}
const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The lab as its file has it, field by field, so nothing a lab file might carry beyond its shape goes out. */
function publicLab(l: Lab): Lab {
  const part = (p: LabPart): LabPart => ({
    id: p.id, ...(p.label !== undefined ? { label: p.label } : {}), question: p.question, answer: p.answer, ...(p.options ? { options: [...p.options] } : {}), ...(p.unit ? { unit: p.unit } : {}),
    check: p.check, ...(p.tolerance ? { tolerance: { ...p.tolerance } } : {}), ...(p.rubric !== undefined ? { rubric: p.rubric } : {}),
  });
  return {
    id: l.id, version: l.version, title: l.title, concept_id: l.concept_id, topic_id: l.topic_id, property: l.property, path: l.path,
    path_verified: l.path_verified, date: l.date, steps: [...l.steps], parts: l.parts.map(part), rules: l.rules.map((r) => ({ ...r })),
    interview_relevant: l.interview_relevant, source_ids: [...l.source_ids], as_of: l.as_of,
  };
}

/**
 * One part's value from the request, as it is graded and logged: a number part's parsed number; a choice or text part's text and
 * a multi part's list, trimmed. A choice must be one of the part's options, and a multi only its options. Refuses naming the part.
 */
function valueOf(p: LabPart, v: unknown): string | number | string[] {
  const missing = new Refusal(400, 'Answer this question first.', p.id);
  if (p.answer === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string' || v.trim() === '') throw missing;
    const parsed = parseLabNumber(v, p.unit ?? 'count');
    if (!parsed.ok) throw new Refusal(400, parsed.message, p.id);
    return parsed.value;
  }
  const options = p.options ?? [];
  if (p.answer === 'multi') {
    if (!Array.isArray(v) || !v.every((s) => typeof s === 'string') || v.length === 0) throw missing;
    const list = v.map((s) => s.trim());
    if (!list.every((s) => options.some((o) => sameText(o, s)))) throw new Refusal(400, 'Tick only the options shown.', p.id);
    return list;
  }
  if (typeof v !== 'string' || v.trim() === '') throw missing;
  if (p.answer === 'choice' && !options.some((o) => sameText(o, v))) throw new Refusal(400, 'Choose one of the options.', p.id);
  return v.trim();
}

/** The note: trimmed and cut to 500 characters; null when it is not text or is blank. */
function noteOf(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  return [...v.trim()].slice(0, NOTE_LIMIT).join('');
}

export function mountLabs(app: Hono, d: RouteDeps): void {
  const today = (): string => amsterdamDate(new Date());
  const labAnswers = async (): Promise<LabAnswer[]> => (await d.logger.readAll('attempts')).filter(isLabAnswer);
  const labOf = (id: string): Lab => {
    const lab = d.content.lab?.(id);
    if (!lab) throw new Refusal(404, UNKNOWN);
    return lab;
  };
  const refused = (c: Context, e: unknown): Response => {
    if (!(e instanceof Refusal)) throw e;
    return c.json({ error: e.message, ...(e.part_id === undefined ? {} : { part_id: e.part_id }) }, e.status);
  };

  app.get('/api/labs', async (c) => {
    const [answers, day] = [await labAnswers(), today()];
    const guide = d.content.labGuide?.();
    const body: LabsView = {
      guide: guide ? { title: guide.title, body_md: guide.body_md } : null,
      labs: (d.content.labs?.() ?? []).map((l) => ({
        id: l.id, title: l.title, topic_id: l.topic_id, concept_id: l.concept_id, interview_relevant: l.interview_relevant, ...labStatus(l, answers, day),
      })),
    };
    return c.json(body);
  });

  app.get('/api/labs/:id', async (c) => {
    try {
      const lab = labOf(c.req.param('id'));
      const [answers, day] = [await labAnswers(), today()];
      const status = labStatus(lab, answers, day);
      const mode = suggestedMode(lab, answers, day);
      const body: LabView = mode === 'recheck'
        ? { lab: publicLab(lab), status, mode, month: status.month, range: status.range }
        : { lab: publicLab(lab), status, mode, month: lab.date === 'fixed_month' ? fixedMonth(day) : null, range: null };
      return c.json(body);
    } catch (e) { return refused(c, e); }
  });

  app.post('/api/labs/:id/answer', async (c) => {
    try {
      const lab = labOf(c.req.param('id'));
      const b: unknown = await c.req.json().catch(() => null);
      if (!isObj(b)) throw new Refusal(400, 'The request body must be a JSON object.');
      if (b.kind !== 'first' && b.kind !== 'recheck') throw new Refusal(400, 'kind must be first or recheck.');
      const kind = b.kind;
      const now = new Date();
      const day = amsterdamDate(now);
      const answers = await labAnswers();
      const baseline = labBaseline(lab, answers);
      if (kind === 'recheck' && !baseline) throw new Refusal(409, NO_BASELINE);
      const key = d.content.labKey?.(lab.id);
      if (kind === 'first' && !key && lab.parts.some((p) => p.check === 'structural')) throw new Refusal(500, 'This lab has no answer key.');

      // Every part a first answer grades, or every re-check part; each value is required, and a self_rubric part needs only its self entry.
      const parts = kind === 'first' ? lab.parts : lab.parts.filter((p) => isRecheck(p.check));
      if (parts.length === 0) throw new Refusal(400, 'This lab has no re-check.');
      const sent = isObj(b.values) ? b.values : {};
      const values: Record<string, string | number | string[]> = {};
      for (const p of parts) if (p.check !== 'self_rubric') values[p.id] = valueOf(p, sent[p.id]);
      const self: Record<string, boolean> = {};
      if (kind === 'first') {
        const said = isObj(b.self) ? b.self : {};
        for (const p of parts.filter((x) => x.check === 'self_rubric')) {
          const v = said[p.id];
          if (typeof v !== 'boolean') throw new Refusal(400, 'Choose "My screen matches" or "It does not".', p.id);
          self[p.id] = v;
        }
      }
      // The dates read: a first answer to a last_28_days lab types the range GA4 shows; a re-check reads the baseline's again.
      let range: LabAnswer['range'] = null;
      let month: string | null = null;
      if (kind === 'recheck') {
        month = baseline!.month ?? null;
        range = baseline!.range ? { from: baseline!.range.from, to: baseline!.range.to } : null;
      } else if (lab.date === 'fixed_month') {
        // The month the screen showed is the month logged: today's or, across midnight, yesterday's.
        const sentMonth = b.month;
        if (sentMonth === undefined || sentMonth === null) month = fixedMonth(day);
        else if (sentMonth === fixedMonth(day) || sentMonth === fixedMonth(addDays(day, -1))) month = sentMonth as string;
        else throw new Refusal(400, MONTH_CHANGED);
      } else if (lab.date === 'last_28_days') {
        const r = b.range;
        if (!isObj(r) || !isDate(r.from) || !isDate(r.to)) throw new Refusal(400, RANGE_NEEDED, RANGE_PART);
        if (r.from > r.to) throw new Refusal(400, RANGE_ORDER, RANGE_PART);
        if (addDays(r.from, SPAN_DAYS) !== r.to) throw new Refusal(400, RANGE_SPAN, RANGE_PART);
        range = { from: r.from, to: r.to };
      }

      const outcomes = kind === 'first'
        ? gradeFirst(lab, key ?? { lab_id: lab.id, lab_version: lab.version, structural: {}, solver: null }, values, self)
        : gradeRecheck(lab, baseline!, values);
      const record: LabAnswer = {
        record: 'lab_answer', schema_version: SCHEMA_VERSION, ts: now.toISOString(), session_id: d.session.currentId ?? '',
        lab_id: lab.id, lab_version: lab.version, kind, month, range,
        parts: outcomes.map((o) => ({ part_id: o.part_id, value: values[o.part_id] ?? null, result: o.result })),
        note: noteOf(b.note),
      };
      await d.logger.labAnswer(record);
      const from = kind === 'recheck' ? addDays(amsterdamDate(new Date(baseline!.ts)), RECHECK_AFTER_DAYS) : null;
      const body: LabAnswerReply = {
        outcomes, status: labStatus(lab, [...answers, record], day),
        notice: from !== null && day < from ? `Too early to count: only a re-check from ${dayMonth(from)} counts. This one is saved.` : null,
      };
      return c.json(body);
    } catch (e) { return refused(c, e); }
  });
}

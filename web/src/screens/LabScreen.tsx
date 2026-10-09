// web/src/screens/LabScreen.tsx: one GA4 lab (sprint 5b, Task B3; design §8; D68, D69), at #/ga4/lab/<id>. Left, what to do in GA4;
// right, the answer panel. The server grades: a structural part's right answer comes back only in the reply to an answer. A
// re-check shows only the re-check parts. Nothing here fetches Google; the link opens it in another tab.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { amsterdamDate } from '../../../core/time.ts';
import { labApi, type LabAnswerReply, type LabView } from '../lib/lab-api.ts';
import {
  ALL_LABS, ANALYTICS_URL, answerBody, CHECK_LABEL, dateLine, firstMonth, NOTE_LABEL, NOTE_MAX, outcomeLine, partLabel, PATH_UNCONFIRMED, RANGE_PART,
  LABS_HREF, recheckHint, refusedPart, SELF_MATCH, SELF_NO_MATCH, shownParts, showStartOverNote, START_OVER, START_OVER_NOTE, STATUS_LABEL, stateChip, type LabForm,
} from '../lib/lab-flow.ts';
import type { LabPart } from '../../../schemas/lab.ts';

const PROPERTY_NAME: Record<string, string> = { MS: 'Google Merchandise Store', FI: 'Flood-It!' };
const EMPTY: LabForm = { values: {}, self: {}, from: '', to: '', note: '' };

function Field({ part, form, set, disabled }: { part: LabPart; form: LabForm; set: (f: LabForm) => void; disabled: boolean }) {
  const value = form.values[part.id];
  const put = (v: string | string[]) => set({ ...form, values: { ...form.values, [part.id]: v } });
  const name = `lab-${part.id}`;
  if (part.check === 'self_rubric') {
    const said = form.self[part.id];
    const pick = (v: boolean) => set({ ...form, self: { ...form.self, [part.id]: v } });
    return (
      <fieldset className="lab-field" disabled={disabled}>
        <legend>{partLabel(part)}</legend>
        <p className="muted">{part.rubric}</p>
        <p>
          <button type="button" className="lab-self" aria-pressed={said === true} onClick={() => pick(true)}>{SELF_MATCH}</button>{' '}
          <button type="button" className="lab-self" aria-pressed={said === false} onClick={() => pick(false)}>{SELF_NO_MATCH}</button>
        </p>
      </fieldset>
    );
  }
  if (part.answer === 'choice' || part.answer === 'multi') {
    const multi = part.answer === 'multi';
    const chosen = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    return (
      <fieldset className="lab-field choice" disabled={disabled}>
        <legend>{partLabel(part)}</legend>
        {(part.options ?? []).map((o) => (
          <label key={o} className="option">
            <input
              type={multi ? 'checkbox' : 'radio'} name={name} value={o} checked={chosen.includes(o)}
              onChange={(e) => put(multi ? (e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o)) : o)}
            />
            <span>{o}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  const unit = part.answer === 'number' ? ({ count: null, percent: '%', eur: '€' } as const)[part.unit ?? 'count'] : null;
  return (
    <div className="lab-field">
      <label htmlFor={name}>{partLabel(part)}</label>
      <div className="lab-input">
        <input
          id={name} type="text" value={typeof value === 'string' ? value : ''} disabled={disabled}
          inputMode={part.answer === 'number' ? 'decimal' : undefined} autoComplete="off"
          onChange={(e) => put(e.target.value)}
        />
        {unit && <span className="muted">{unit}</span>}
      </div>
    </div>
  );
}

export function LabScreen({ id }: { id: string }) {
  const [view, setView] = useState<LabView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<LabForm>(EMPTY);
  const [reply, setReply] = useState<LabAnswerReply | null>(null);
  const [busy, setBusy] = useState(false);
  /** The learner chose to send a first answer during a re-check. */
  const [fromStart, setFromStart] = useState(false);
  /** The fixed month shown after "Answer it from the start instead"; sent with the answer. */
  const [startMonth, setStartMonth] = useState<string | null>(null);
  const answersHead = useRef<HTMLHeadingElement>(null);
  const [refusal, setRefusal] = useState<{ message: string; part: string | null } | null>(null);
  useEffect(() => {
    setView(null); setLoadError(null); setForm(EMPTY); setReply(null); setRefusal(null); setFromStart(false); setStartMonth(null);
    labApi.get(id).then(setView, (e: Error) => setLoadError(e.message));
  }, [id]);
  if (loadError) return <><p role="alert">{loadError}</p><p><a href={LABS_HREF}>{ALL_LABS}</a></p></>;
  if (!view) return <p>Loading the lab...</p>;

  const { lab } = view;
  const mode = fromStart ? 'first' : view.mode;
  const status = reply?.status ?? view.status;
  const chip = stateChip(status);
  const shownMonth = fromStart ? startMonth : view.month;
  const date = dateLine(lab, mode, shownMonth, fromStart ? null : view.range);
  const parts = shownParts(lab, mode);
  const needsDates = mode === 'first' && lab.date === 'last_28_days';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    try {
      setReply(await labApi.answer(lab.id, answerBody(lab, mode, form, shownMonth)));
    } catch (err) {
      setReply(null);
      setRefusal({ message: (err as Error).message, part: refusedPart(err) });
    } finally {
      setBusy(false);
    }
  }
  function startOver() {
    setStartMonth(firstMonth(lab, amsterdamDate(new Date()))); setFromStart(true); setForm(EMPTY); setReply(null); setRefusal(null);
    setTimeout(() => answersHead.current?.focus(), 0);
  }
  const outcomeOf = (partId: string) => reply?.outcomes.find((o) => o.part_id === partId);
  const refusalFor = (partId: string) => (refusal?.part === partId ? <p role="alert" className="lab-refusal">{refusal.message}</p> : null);

  return (
    <section className="lab">
      <PageHead section="ga4" crumb={crumbParts({ section: 'ga4', place: 'Labs', hideLabels: true }).concat(lab.title)} title={lab.title} />
      <p><span className={`chip ${chip.className}`}>{chip.text}</span>{mode === 'recheck' && <span className="muted"> {recheckHint(status.state === 'recheck_waiting' ? status.recheck_from : null)}</span>}</p>
      <div className="lab-cols">
        <div className="card lab-steps">
          <h2>In GA4</h2>
          <p><strong>{PROPERTY_NAME[lab.property] ?? lab.property}</strong>{' '}
            <a href={ANALYTICS_URL} target="_blank" rel="noopener noreferrer">Open Google Analytics</a></p>
          <p>{lab.path}</p>
          {!lab.path_verified && <p className="muted">{PATH_UNCONFIRMED}</p>}
          {date && <p><strong>Date:</strong> {date}</p>}
          <ol>{lab.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
        <form className="card lab-answer" onSubmit={submit} aria-busy={busy}>
          <h2 ref={answersHead} tabIndex={-1}>Your answers</h2>
          {view.mode === 'recheck' && !fromStart && <p><button type="button" onClick={startOver}>{START_OVER}</button></p>}
          {showStartOverNote(view.status, mode) && <p className="muted">{START_OVER_NOTE}</p>}
          {refusal && refusal.part === null && <p role="alert" className="lab-refusal">{refusal.message}</p>}
          {reply?.notice && <p className="muted" role="status">{reply.notice}</p>}
          {needsDates && (
            <div className="lab-dates-block">
            <div className="lab-dates">
              <div className="lab-field">
                <label htmlFor="lab-from">From</label>
                <input id="lab-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </div>
              <div className="lab-field">
                <label htmlFor="lab-to">To</label>
                <input id="lab-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
            </div>
            {refusalFor(RANGE_PART)}
            </div>
          )}
          {parts.map((p) => {
            const o = outcomeOf(p.id);
            const line = o ? outcomeLine(o, reply?.status.state === 'look_again' ? null : reply?.status.recheck_from ?? null) : null;
            return (
              <div key={p.id} className="lab-part">
                <Field part={p} form={form} set={setForm} disabled={busy} />
                {refusalFor(p.id)}
                {line && <p className={`lab-result ${line.tone}`}>{line.mark && <strong>{line.mark} </strong>}{line.text}</p>}
              </div>
            );
          })}
          <div className="lab-field">
            <label htmlFor="lab-note">{NOTE_LABEL}</label>
            <input id="lab-note" type="text" maxLength={NOTE_MAX} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <p><button type="submit" aria-disabled={busy || undefined}>{CHECK_LABEL}</button></p>
          {reply && <p role="status">{STATUS_LABEL} <span className={`chip ${chip.className}`}>{chip.text}</span></p>}
        </form>
      </div>
      <p><a href={LABS_HREF}>{ALL_LABS}</a></p>
    </section>
  );
}

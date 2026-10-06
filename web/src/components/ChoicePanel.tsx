// web/src/components/ChoicePanel.tsx: one GA4 or Methodology question, multiple choice or a typed number (design §5, §8,
// §9; D14, D15, D16; S2-61, S2-63). The server grades it and holds the key; the panel shows the key only after an answer
// or a "Show answer", both logged.
import { useEffect, useRef, useState } from 'react';
import { api, type ChoicePanelSection, type ChoiceResult, type ChoiceReveal, type ChoiceServed, type TypedView } from '../api.ts';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import type { Phase } from '../../../core/envelope.ts';
import type { OptionTable } from '../../../schemas/choice-types.ts';
import { isClosedError } from '../lib/exercise.ts';
import { createBusyGate } from '../lib/busy-gate.ts';
import { canSaveAnswer, classifyRunRefusal, modeRules, runMayBeGone, shownAtAfter, type RunMode } from '../lib/run-flow.ts';
import { itemBadges } from '../lib/choice-flow.ts';
import { choicePhaseFor, optionTableView, sqlChoiceLayout } from '../lib/sql-choice.ts';
import { SchemaPanel } from './SchemaPanel.tsx';
import { SqlCode } from './SqlCode.tsx';
import { ConfidenceRow, type Confidence } from './ConfidenceRow.tsx';

type Props = {
  itemId: string;
  section: ChoicePanelSection;
  /** Section sql only (S3-17): a pretest names its phase to the server, which a serving would otherwise give. Every other phase is free. */
  phase?: Phase;
  /** Section sql only: the tables of the item's schema, shown beside the question. */
  schemaNotes?: TableNote[];
  /** An instance the server served (Today); left out, the panel starts its own. */
  instanceId?: string;
  /** "Next". The button stays disabled until the promise ends, and for good if the caller replaces this panel, so a double click serves one question. */
  onDone?: (r: { correct: boolean; helped?: boolean }) => void | Promise<void>;
  /**
   * The server closed the served instance (a session end, or a restart). When given, the caller serves a fresh question, so its
   * phase comes from a new serving (Task C5); left out, the panel opens the question again in an instance of its own (phase free).
   */
  onReopen?: () => void;
  /**
   * A timed GA4 run (Task B3): the answer is saved and nothing comes back, so there is no result, no "Show answer" and no
   * next button (S3-03). `confidence`: asked in a mini drill, never in a half-mock (S3-04). Practice takes a changed answer;
   * exam takes one. `onStopped`: the server says the run is over. `visible`: this question is the current one; its active time counts
   * from then (B3 I1), and from each save, not from when the run began.
   */
  run?: { mode: RunMode; confidence: boolean; answeredBefore?: boolean; visible?: boolean; onSaved: () => void; onStopped: (note?: string) => void };
};

const REOPENED = 'Your session ended, so this question was opened again. The options may be in a new order: check your answer, then send it again.';
const PERCENT_SCALE = 'ERR-LOG-21';
/** An answer saved before this screen was drawn (a reload): it matches no choice, so a changed answer still shows its send controls. */
const EARLIER = '(saved earlier)';

/** Keyed by item and instance, so every question gets a fresh showing. */
export function ChoicePanel(props: Props) {
  return <ChoicePanelInner key={`${props.itemId}:${props.instanceId ?? ''}`} {...props} />;
}

const decimalsText = (n: number): string => (n === 0 ? 'a whole number' : n === 1 ? '1 decimal' : `${n} decimals`);
/** What a typed answer looks like: its scale, its unit and the decimals the prompt asks for. */
function typedHint(t: TypedView): string {
  if (t.precision === 'count') return `Type a whole number${t.unit_label ? ` (${t.unit_label})` : ''}.`;
  const scale = t.scale === 'percent' ? 'a percentage' : t.scale === 'eur' ? 'an amount in euros' : 'a number';
  return `Type ${scale} with ${decimalsText(t.decimals)}. A decimal point or a decimal comma both work.`;
}
const withUnit = (value: number | undefined, t: TypedView | null): string => `${value ?? ''}${t?.unit_label ? ` ${t.unit_label}` : ''}`;

function ChoicePanelInner({ itemId, section, phase: asked, schemaNotes, instanceId, onDone, onReopen, run }: Props) {
  const instance = useRef(instanceId ?? crypto.randomUUID());
  const shownAt = useRef(Date.now());
  const visible = run?.visible ?? true;
  const visibleNow = useRef(visible);
  visibleNow.current = visible;
  const [data, setData] = useState<ChoiceServed | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ChoiceResult | null>(null);
  const [revealed, setRevealed] = useState<ChoiceReveal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const answerGate = useRef(createBusyGate());     // one "Show answer" request per click burst
  const nextGate = useRef(createBusyGate());
  const sendGate = useRef(createBusyGate());       // one answer request per click burst, in a run
  const [saved, setSaved] = useState<string | null>(run?.answeredBefore ? EARLIER : null);   // what a run has saved for this question

  function load(note: string | null) {
    api.choice(itemId, section, instance.current, section === 'sql' && asked ? choicePhaseFor(asked) : undefined).then((d) => { shownAt.current = shownAtAfter(shownAt.current, 'loaded', visibleNow.current, Date.now()); setData(d); setMessage(note); }, (e: Error) => setMessage(e.message));
  }
  useEffect(() => { load(null); }, [itemId, section]);
  useEffect(() => { if (visible) shownAt.current = shownAtAfter(shownAt.current, 'visible', true, Date.now()); }, [visible]);

  /** The server closed this instance (a session end, or a restart): open the question again in a new one. */
  function reopen() {
    if (onReopen) { onReopen(); return; }
    instance.current = crypto.randomUUID();
    setRevealed(null);
    load(REOPENED);
  }

  /** An answer inside a run: saved, never graded on screen (S3-03). A half-mock takes one; a mini drill takes each change. */
  async function sendRun(confidence: Confidence) {
    if (!data || !run || !canSaveAnswer(run.mode, saved !== null)) return;
    const value = data.item.kind === 'mcq' ? chosen ?? '' : typed;
    await sendGate.current.run(async () => {
      setBusy(true); setMessage(null);
      try {
        await api.choiceRunAnswer({
          item_id: itemId, item_instance_id: instance.current, confidence: run.confidence ? confidence : null, shown_order: data.shown_order, phase: data.phase,
          active_ms: Date.now() - shownAt.current, ...(data.item.kind === 'mcq' ? { chosen: value } : { typed: value }),
        });
        setSaved(value);
        shownAt.current = shownAtAfter(shownAt.current, 'saved', true, Date.now());     // a later change counts only its own time
        run.onSaved();
      } catch (e) {
        const why = classifyRunRefusal(e);
        if (why === 'answered') { setSaved(EARLIER); run.onSaved(); setMessage((e as Error).message); }
        else if (why === 'over') run.onStopped();
        else if (runMayBeGone(e)) run.onStopped((e as Error).message);       // S1: a 404, or a 409 with no code, may mean the run is gone
        else setMessage((e as Error).message);
      } finally { setBusy(false); }
    });
  }

  async function send(confidence: Confidence) {
    if (run) { await sendRun(confidence); return; }
    if (!data || busy || result) return;
    setBusy(true); setMessage(null);
    const phase: Phase = data.phase;
    try {
      setResult(await api.choiceAnswer({
        item_id: itemId, item_instance_id: instance.current, confidence, shown_order: data.shown_order, phase,
        active_ms: Date.now() - shownAt.current, ...(data.item.kind === 'mcq' ? { chosen: chosen ?? '' } : { typed }),
      }));
    } catch (e) {
      if (isClosedError(e)) reopen();
      else setMessage((e as Error).message);      // a typed answer the server cannot read says why, and nothing is logged
    } finally { setBusy(false); }
  }

  async function showAnswer() {
    if (!data || !confirm('Show the answer? Using it lowers this question\'s rating. You can still answer it yourself.')) return;
    await answerGate.current.run(async () => {
      try { setRevealed(await api.choiceShowAnswer(itemId, instance.current, data.phase)); }
      catch (e) { if (isClosedError(e)) reopen(); else setMessage((e as Error).message); }
    });
  }

  /** "Next": disabled while the caller fetches and serves the next question, which replaces this panel. */
  async function next(correct: boolean) {
    const helped = revealed !== null;      // a show-answer is a reveal (S2-11)
    setAdvancing(true);
    try { await nextGate.current.run(() => onDone?.({ correct, helped })); }
    finally { setAdvancing(false); }
  }

  if (!data) return <p>{message ?? 'Loading the question...'}</p>;
  const { item, options } = data;
  const answered = result !== null;
  const ready = item.kind === 'mcq' ? chosen !== null : typed.trim() !== '';
  // In a run nothing is graded on screen: the fields lock only in exam mode, once the one answer is saved.
  const locked = run ? !modeRules(run.mode).changeAnswer && saved !== null : answered;
  const current = item.kind === 'mcq' ? chosen : typed;
  const sendable = run ? ready && !locked && saved !== current : !answered && ready;
  const right = result?.correct_oid ?? revealed?.correct_oid;
  const badges = itemBadges(item);
  const sql = item.section === 'sql' ? sqlChoiceLayout(item) : null;
  const optionBody = (o: { text: string; table?: OptionTable }) => {
    if (!sql) return o.text;
    if (sql.optionStyle === 'code') return <SqlCode sql={o.text} className="option-code" />;
    if (sql.optionStyle === 'name') return <code>{o.text}</code>;
    if (sql.optionStyle === 'table' && o.table) {
      const t = optionTableView(o.table);
      return <span className="option-table">{o.text}
        <span className="table-scroll"><table><caption className="muted">{t.count}</caption><thead><tr>{t.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table></span></span>;
    }
    return o.text;
  };
  const sqlLead = sql && (
    <>
      {sql.shownSql && <SqlCode sql={sql.shownSql} className="shown-sql" />}
      {sql.note && <p className="muted">{sql.note}</p>}
    </>
  );
  const panel = (
    <section className="choice">
      {badges.length > 0 && <p>{badges.map((b) => <span key={b.kind}><strong className="badge">{b.label}</strong>{' '}</span>)}</p>}
      {item.kind === 'mcq' ? (
        <fieldset disabled={locked || busy}>
          <legend className="prompt">{item.stem}</legend>
          {sqlLead}
          {options.map((o) => {
            const mark = answered ? (o.oid === right ? 'ok' : o.oid === chosen ? 'bad' : '') : '';
            return (
              <div key={o.oid} className={`option ${mark}`}>
                <label><input type="radio" name={`choice-${instance.current}`} value={o.oid} checked={chosen === o.oid} onChange={() => setChosen(o.oid)} /> {optionBody(o)}</label>
                {mark === 'ok' && <span className="muted"> (right answer)</span>}
                {mark === 'bad' && <span className="muted"> (your answer)</span>}
              </div>
            );
          })}
        </fieldset>
      ) : (
        <div>
          <p className="prompt">{item.stem}</p>
          {sqlLead}
          {item.typed && <p className="muted">{typedHint(item.typed)}</p>}
          <label>Your answer <input type="text" inputMode="decimal" value={typed} disabled={locked || busy} onChange={(e) => setTyped(e.target.value)} /> {item.typed?.unit_label}</label>
        </div>
      )}
      {sendable && (run && !run.confidence
        ? <p><button type="button" disabled={busy} onClick={() => void send(null)}>Save answer</button></p>
        : <ConfidenceRow busy={busy} onPick={(c) => void send(c)} note={run ? 'Your answer is saved when you pick one. The result comes in the review.' : undefined} />)}
      {run && saved !== null && (
        <p role="status" className="muted">{modeRules(run.mode).changeAnswer ? 'Answer saved. You can change it until the run ends.' : 'Answer saved. A half-mock takes one answer per question.'}</p>
      )}
      {message && <p role="alert">{message}</p>}
      {result && (
        <div aria-live="polite" className="grade">
          <h3 className={result.correct ? 'ok' : 'bad'}>{result.correct ? 'Right.' : 'Not quite.'}</h3>
          {item.kind === 'typed' && !result.correct && <p>The answer is {withUnit(result.value, item.typed)}.</p>}
          {result.error_ids.includes(PERCENT_SCALE) && <p>Your answer is 100 times off. Check whether the question asks for a percentage or a share.</p>}
          <p>{result.explanation}</p>
          {onDone && <button type="button" disabled={advancing} onClick={() => void next(result.correct)}>Next</button>}
        </div>
      )}
      {!answered && !run && (
        <div className="help">
          {!revealed && <button type="button" onClick={() => void showAnswer()}>Show answer</button>}
          {revealed && (
            <div>
              <div className="option"><strong>Answer:</strong> {item.kind === 'mcq' ? optionBody(options.find((o) => o.oid === revealed.correct_oid) ?? { text: '' }) : withUnit(revealed.value, item.typed)}</div>
              <p>{revealed.explanation}</p>
            </div>
          )}
        </div>
      )}
      <details>
        <summary>Report a problem with this question</summary>
        <textarea value={report} onChange={(e) => setReport(e.target.value)} aria-label="What is wrong with this question?" />
        <button type="button" disabled={!report.trim()} onClick={() => api.report(itemId, report).then(() => { setReport(''); setMessage('Thanks, reported.'); }, (e: Error) => setMessage(e.message))}>Send</button>
      </details>
    </section>
  );
  // An SQL choice item shows its tables beside the question, as an exercise does.
  return sql && schemaNotes && schemaNotes.length > 0 ? <div className="exercise">{panel}<SchemaPanel notes={schemaNotes} /></div> : panel;
}

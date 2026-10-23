// web/src/components/MockSqlQuestion.tsx: one SQL question of a recruiter mock run (sprint 7 Part 2, Task N3, L105): the screen mock's
// questions (S7-09) and a case mock's CP3 (S7-13), one component. Served through the run's own instance (POST /api/serve purpose mock), a
// blank editor (useSqlEditor, the exercise panel's wiring; screen mode for the screen mock, S4B-22), Run free, and one Submit that asks in the
// page before it sends (F2-3-6), whose reply says only that the answer is recorded (S7-03). Ctrl+Shift+Enter sends nothing. A question whose
// one answer is in (Codex F36: the run view says so after a reload) shows its mark, and its Submit stays closed. Help and the tutor wait.
import { useEffect, useRef, useState } from 'react';
import type { DisplayOk } from '../../../server/runner/protocol.ts';
import { useSqlEditor } from '../editor/use-sql-editor.ts';
import { SCREEN_BANNER } from '../lib/drill-flow.ts';
import { grainLine, rulesBadge, runErrorLine } from '../lib/exercise.ts';
import { SEND_QUESTION, mocksApi, refusalCode, submitLine, type MockServed } from '../lib/mock-flow.ts';
import { ResultTable } from './ResultTable.tsx';
import { SchemaPanel } from './SchemaPanel.tsx';

const errorText = (e: unknown): string => (e as Error).message;

export interface MockSqlQuestionProps {
  blockId: string; instanceId: string;
  /** The question's heading ("Question 2 of 6", "Query"). */
  heading: string;
  /** The section's class around the question ("case-step" in a case mock). */
  sectionClass?: string;
  /** S7-09: the screen mock: its banner, and screen mode whatever the serving says. Otherwise the serving's mode. */
  screen?: boolean;
  /** Codex F36: its one answer is in, as the run view says. */
  answered: boolean;
  /** Its one answer was recorded, or the server says it already has one (ONE_ANSWER). */
  onAnswered: () => void;
  /**
   * A refusal of the serve or the answer that the run acts on (RUN_OVER, PLAN_FIRST; F4-2-1: RUN_CHANGED, an instance served before an app
   * restart, on which a case mock reads the run again): true when it did; otherwise its line shows here.
   */
  onRefused: (code: string) => boolean;
  /**
   * F4-2-1 (fixer A, sprint 7c): the typed query, kept by the screen. When the editor is taken down (the question reopens on a new instance
   * after an app restart, or the step remounts) its text goes here, and a new editor starts from it, so a take-home's CP3 keeps its query.
   */
  draft?: { current: string | null };
}

export function MockSqlQuestion(p: MockSqlQuestionProps) {
  const [data, setData] = useState<MockServed | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [answered, setAnswered] = useState(p.answered);
  const [ran, setRan] = useState<DisplayOk | null>(null);
  const [busy, setBusy] = useState(false);
  // F2-3-6: the one answer is final, so Submit asks first, in the page; "Send" sends it.
  const [confirming, setConfirming] = useState(false);
  // N2 M8: a serve that failed for another reason can be tried again.
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const shownAt = useRef(new Date());
  const refused = useRef(p.onRefused);
  refused.current = p.onRefused;
  const draft = useRef(p.draft);
  draft.current = p.draft;
  // F4-2-1 (fixer A): before the editor is taken down, its text goes to the draft. Declared before useSqlEditor, whose clean-up destroys the
  // editor, because React runs a component's clean-ups in the order its effects are declared.
  useEffect(() => () => { const text = editor.current?.getText(); if (draft.current && text !== undefined) draft.current.current = text; }, [data]);
  // F2-3-6: Ctrl+Shift+Enter, one key from Run's Ctrl+Enter, sends nothing here: the one answer goes only through Submit and its question.
  const editor = useSqlEditor(editorHost, data, { stage: 3, screenMode: p.screen === true || data?.screen_mode === true, run: () => void doRun(), submit: () => {} });
  // F4-2-1 (fixer A): a new editor starts from the draft, when the screen keeps one.
  useEffect(() => { const text = draft.current?.current; if (data && text != null && editor.current && editor.current.getText() !== text) editor.current.setText(text); }, [data]);

  useEffect(() => { if (p.answered) setAnswered(true); }, [p.answered]);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    mocksApi.serve(p.blockId, p.instanceId).then((d) => { if (alive) { shownAt.current = new Date(); setData(d); setMessage(null); } }, (e: unknown) => {
      const code = refusalCode(e);
      if (!alive || (code !== null && refused.current(code))) return;
      setMessage(errorText(e));
      setFailed(true);
    });
    return () => { alive = false; };
  }, [p.blockId, p.instanceId, tries]);
  // The question takes the focus Submit had, on its safer choice.
  useEffect(() => { if (confirming) keepEditing.current?.focus(); }, [confirming]);

  async function doRun(): Promise<void> {
    if (!editor.current || !data || busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await mocksApi.run(data.item_id, p.instanceId, editor.current.getText());
      if ('error' in r) { setRan(null); setMessage(runErrorLine(r.error)); } else setRan(r);
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  async function doSubmit(): Promise<void> {
    if (!editor.current || !data || busy || answered) return;
    setBusy(true); setMessage(null);
    try {
      const a = await mocksApi.submit({ block_id: p.blockId, item_id: data.item_id, item_instance_id: p.instanceId, sql: editor.current.getText(),
        started_at: shownAt.current.toISOString(), active_ms: Date.now() - shownAt.current.getTime() });
      setMessage(submitLine(a));
      if (a.recorded) { setAnswered(true); p.onAnswered(); }
    } catch (e) {
      const code = refusalCode(e);
      if (code === 'ONE_ANSWER') { setAnswered(true); p.onAnswered(); setMessage(errorText(e)); }
      else if (code === null || !p.onRefused(code)) setMessage(errorText(e));
    } finally { setBusy(false); }
  }

  const heading = <h2 tabIndex={-1}>{p.heading}</h2>;
  if (!data) {
    return (
      <section className={p.sectionClass}>
        {heading}
        <p>{message ?? 'Loading the question...'}</p>
        {failed && <p><button type="button" onClick={() => setTries((n) => n + 1)}>Try again</button></p>}
      </section>
    );
  }
  const { item } = data;
  return (
    <div className="exercise">
      <section className={p.sectionClass}>
        {heading}
        <div className="card exercise-card">
          {p.screen && <p className="notice" role="note">{SCREEN_BANNER}</p>}
          <p className="prompt">{item.prompt}</p>
          {item.output_contract && (
            <p className="contract">Return: {item.output_contract.columns.map((c) => `${c.name} (${c.type_class})`).join(', ')}{grainLine(item.output_contract)}</p>
          )}
          <ul className="badge-list">{rulesBadge(item.rules).map((b) => <li key={b}>{b}</li>)}</ul>
          <div ref={editorHost} />
          <div className="toolbar">
            <button type="button" onClick={() => void doRun()} disabled={busy}>Run (Ctrl+Enter)</button>
            {confirming && !answered ? (
              <div role="group" aria-label={SEND_QUESTION} style={{ display: 'contents' }}>
                <span>{SEND_QUESTION}</span>
                <button type="button" className="btn-main" onClick={() => { setConfirming(false); void doSubmit(); }} disabled={busy}>Send</button>
                <button type="button" ref={keepEditing} onClick={() => setConfirming(false)}>Keep editing</button>
              </div>
            ) : <button type="button" className="btn-main" onClick={() => setConfirming(true)} disabled={busy || answered}>{answered ? 'Answered' : 'Submit'}</button>}
          </div>
        </div>
        {message && <p role="status">{message}</p>}
        {ran && <ResultTable result={ran} caption="Your result" />}
      </section>
      <SchemaPanel notes={data.schemaNotes} level={item.level} />
    </div>
  );
}

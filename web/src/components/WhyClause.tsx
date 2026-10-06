// web/src/components/WhyClause.tsx: the optional "Why this clause?" question after a worked example (S3-18, T-05). One question,
// answered on the page: the answer and the explanation show at once. It is a teaching aid: nothing is graded, sent or logged, so this
// component never calls the server. "Skip" closes it.
import { useState } from 'react';
import type { WhyClause as Why } from '../../../schemas/lesson.ts';
import { SqlCode } from './SqlCode.tsx';
import { chooseWhy, skipWhy, startWhy, whyView } from '../lib/sql-choice.ts';

export function WhyClause({ why }: { why: Why }) {
  const [state, setState] = useState(startWhy);
  const v = whyView(why, state);
  if (v.status === 'skipped') return <p className="muted why-clause">You skipped the question about the clause. It is optional.</p>;
  return (
    <section className="why-clause">
      <h3>Why this clause? <span className="muted">(optional)</span></h3>
      <SqlCode sql={why.clause} />
      <fieldset disabled={v.status === 'answered'}>
        <legend className="prompt">{why.stem}</legend>
        {why.options.map((o) => {
          const mark = v.showAnswer ? (o.id === v.correctId ? 'ok' : o.id === v.chosenId ? 'bad' : '') : '';
          return (
            <p key={o.id} className={mark}>
              <label><input type="radio" name="why-clause" value={o.id} checked={v.chosenId === o.id} onChange={() => setState((s) => chooseWhy(s, o.id, why))} /> {o.text}</label>
              {mark === 'ok' && <span className="muted"> (right answer)</span>}
              {mark === 'bad' && <span className="muted"> (your answer)</span>}
            </p>
          );
        })}
      </fieldset>
      {v.status === 'open' && <button type="button" onClick={() => setState(skipWhy)}>Skip</button>}
      {v.status === 'answered' && (
        <div aria-live="polite">
          <h4 className={v.correct ? 'ok' : 'bad'}>{v.correct ? 'Right.' : 'Not quite.'}</h4>
          <p>{v.explanation}</p>
        </div>
      )}
    </section>
  );
}

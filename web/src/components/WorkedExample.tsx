// web/src/components/WorkedExample.tsx: stage 0 of fading (design §4). The query as written, then
// every clause labelled with its subgoal, in the order SQL evaluates them.
import type { WorkedExample as WE } from '../../../schemas/lesson.ts';
import type { Subgoal } from '../../../schemas/item.ts';
import { SqlCode } from './SqlCode.tsx';

export const SUBGOAL_LABEL: Record<Subgoal, string> = {
  source_grain: 'Source and grain', row_filter: 'Row filter', output_grain: 'Output grain',
  metrics: 'Metrics', group_filter: 'Group filter', sort_limit: 'Sort and limit',
};
/** The subgoal vocabulary in evaluation order (design §4; docs/content/prompt-style-guide.md). */
const EVALUATION_ORDER: Subgoal[] = ['source_grain', 'row_filter', 'output_grain', 'metrics', 'group_filter', 'sort_limit'];

export function WorkedExample({ example }: { example: WE }) {
  // A stable sort: clauses with the same subgoal keep their written order.
  const steps = [...example.clauses].sort((a, b) => EVALUATION_ORDER.indexOf(a.subgoal) - EVALUATION_ORDER.indexOf(b.subgoal));
  return (
    <section className="worked">
      <h2>{example.title}</h2>
      <p>{example.prompt}</p>
      <SqlCode sql={example.clauses.map((c) => c.text).join('\n')} className="shown-sql" />
      <p className="muted">The steps, in the order SQL works through them:</p>
      <table>
        <thead><tr><th>Step</th><th>Clause</th><th>Why</th></tr></thead>
        <tbody>{steps.map((c, i) => (
          <tr key={i}><td>{SUBGOAL_LABEL[c.subgoal]}</td><td><code>{c.text}</code></td><td>{c.why}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

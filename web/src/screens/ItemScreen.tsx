// web/src/screens/ItemScreen.tsx: one exercise outside a lesson (practice pool, re-test). Its phases show the labels
// line (the concept by title, the level and the item ID); the map is at #/map since Task B15. An SQL choice item (Task C5)
// opens in the choice panel through ItemPanel. A crumb and a title head the page, so route-change focus has a heading (P1 finding 14).
import { useState } from 'react';
import type { Phase } from '../../../core/envelope.ts';
import { ItemPanel } from '../components/ItemPanel.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { itemHead } from '../lib/polish-p2b.ts';

export function ItemScreen({ itemId, phase }: { itemId: string; phase: Phase }) {
  const [done, setDone] = useState(false);
  const head = itemHead(phase);
  if (done) return <section><PageHead section="sql" crumb={head.crumb} title={head.title} /><p>Done. <a href="#/map">Back to the SQL map</a></p></section>;
  return (
    <section>
      <PageHead section="sql" crumb={head.crumb} title={head.title} />
      <ItemPanel key={itemId} itemId={itemId} phase={phase} labels onClosed={() => setDone(true)} />
    </section>
  );
}

// web/src/screens/ItemScreen.tsx: one exercise outside a lesson (practice pool, re-test). Its phases show the labels
// line (the concept by title, the level and the item ID); the map is at #/map since Task B15. An SQL choice item (Task C5)
// opens in the choice panel through ItemPanel.
import { useState } from 'react';
import type { Phase } from '../../../core/envelope.ts';
import { ItemPanel } from '../components/ItemPanel.tsx';

export function ItemScreen({ itemId, phase }: { itemId: string; phase: Phase }) {
  const [done, setDone] = useState(false);
  if (done) return <p>Done. <a href="#/map">Back to the SQL map</a></p>;
  return <ItemPanel key={itemId} itemId={itemId} phase={phase} labels onClosed={() => setDone(true)} />;
}

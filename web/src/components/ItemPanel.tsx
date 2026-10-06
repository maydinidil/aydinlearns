// web/src/components/ItemPanel.tsx: one item of any SQL kind (Task C5). A write or fix item opens in the exercise panel; the
// SQL choice kinds (predict_rows, predict_result, choose_query, which_table, is_unique) open in the choice panel, with the
// schema panel beside the question. The kind comes from the item itself, so a screen that holds only an ID needs no guess.
import { useEffect, useState } from 'react';
import { api, type ItemView } from '../api.ts';
import type { Phase } from '../../../core/envelope.ts';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import { choiceClosedResult, usesChoicePanel } from '../lib/sql-choice.ts';
import { ChoicePanel } from './ChoicePanel.tsx';
import { ExercisePanel, type ClosedResult } from './ExercisePanel.tsx';

type Props = {
  itemId: string; phase: Phase; labels?: boolean; onClosed?: (r: ClosedResult) => void;
  /** The instance the server served (Today): the answer goes through it, so the server logs it under its own phase and block. */
  instanceId?: string;
  /** S2-39: the exercise panel keeps the concept, level and ID hidden until after a submission. The choice panel never shows them. */
  hideLabels?: boolean;
  /** A heading over the item that names no concept, such as "Review exercise". */
  heading?: string;
};

export function ItemPanel({ itemId, phase, labels, onClosed, instanceId, hideLabels, heading }: Props) {
  const [found, setFound] = useState<{ item: ItemView; schemaNotes: TableNote[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.item(itemId).then(setFound, (e: Error) => setError(e.message)); }, [itemId]);
  if (error) return <p role="alert">{error}</p>;
  if (!found) return <p>Loading the question...</p>;
  if (!usesChoicePanel(found.item.kind)) {
    return <ExercisePanel itemId={itemId} phase={phase} labels={labels} instanceId={instanceId} hideLabels={hideLabels} heading={heading} onClosed={onClosed} />;
  }
  const panel = <ChoicePanel itemId={itemId} section="sql" phase={phase} schemaNotes={found.schemaNotes} instanceId={instanceId}
    onDone={onClosed ? (r) => onClosed(choiceClosedResult(r)) : undefined} />;
  return heading ? <><h2>{heading}</h2>{panel}</> : panel;
}

// web/src/lib/allowed-values.ts: the schema panel's "Values: a, b, c" line per category-like column (E-019).
import type { TableNote } from '../../../schemas/schema-notes.ts';

/** One line per column that lists its values, in the order the columns appear in the sample. */
export function allowedValueLines(note: TableNote): { column: string; text: string }[] {
  const values = note.allowed_values ?? {};
  const order = [...note.sample.columns, ...Object.keys(values).filter((c) => !note.sample.columns.includes(c))];
  return order.filter((c) => (values[c]?.length ?? 0) > 0).map((c) => ({ column: c, text: `Values: ${values[c]!.join(', ')}` }));
}

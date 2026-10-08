/** A foreign key as data/schema-notes.json holds it: `columns` here link to `ref_table.ref_columns`, one row there to many here. */
export interface ForeignKey {
  columns: string[];
  references: string;                           // "table.column", as the first notes wrote it
  cardinality: '1:N';
  /** Sprint 4a (Task B1): the referenced table and columns as data. Older notes and fixtures may lack them. */
  ref_table?: string;
  ref_columns?: string[];
}

export interface TableNote {
  schema: string;
  table: string;
  grain: string;                                // "one row per product"
  primary_key: string[];
  foreign_keys: ForeignKey[];
  row_count: number;
  sample: { columns: string[]; rows: unknown[][] };   // 5 rows, JSON-safe
  /** E-019: the values of each category-like text column (1 to 12 distinct, missing values not listed), visible data only. */
  allowed_values?: Record<string, string[]>;
  /** S4-01: the first SQL level whose items show this table (3 for the order and price tables). Missing means level 1. */
  from_level?: number;
  /** A line of plain English about one column, by column name (for example that an `*_ts` column is a UTC instant). Missing means none. */
  column_notes?: Record<string, string>;
}

/**
 * Ruling P-9 (S4-01): the notes an item at `level` shows, in file order: those with `from_level` at or below it, a note
 * without one counting from level 1. Used by the schema panel and by autocomplete. When the level is not a number, every
 * note is kept, so a missing level never hides a table the item may need.
 */
export function notesForLevel<T extends Pick<TableNote, 'from_level'>>(notes: readonly T[], level: number | null | undefined): T[] {
  if (typeof level !== 'number' || Number.isNaN(level)) return [...notes];
  return notes.filter((n) => (n.from_level ?? 1) <= level);
}

/** The schema panel's line for one foreign key (design §11, T-06): "order_id → orders (1:N)". */
export function foreignKeyLine(fk: ForeignKey): { columns: string; table: string; cardinality: string; text: string } {
  const columns = fk.columns.join(', ');
  const table = fk.ref_table ?? fk.references.split('.')[0]!;
  return { columns, table, cardinality: fk.cardinality, text: `${columns} → ${table} (${fk.cardinality})` };
}

/** The foreign keys of `note` whose referenced table is among the `shown` notes: a key to a table the panel hides (B2 M2) is left out. */
export function shownForeignKeys(note: Pick<TableNote, 'foreign_keys'>, shown: readonly Pick<TableNote, 'table'>[]): ForeignKey[] {
  const tables = new Set(shown.map((n) => n.table));
  return note.foreign_keys.filter((f) => tables.has(foreignKeyLine(f).table));
}

/** One line per column note of `note`, in the order the notes list them: `{ column, text }`. */
export function columnNoteLines(note: Pick<TableNote, 'column_notes'>): { column: string; text: string }[] {
  return Object.entries(note.column_notes ?? {}).map(([column, text]) => ({ column, text }));
}

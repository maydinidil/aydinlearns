export interface TableNote {
  schema: string;
  table: string;
  grain: string;                                // "one row per product"
  primary_key: string[];
  foreign_keys: { columns: string[]; references: string; cardinality: '1:N' }[];
  row_count: number;
  sample: { columns: string[]; rows: unknown[][] };   // 5 rows, JSON-safe
  /** E-019: the values of each category-like text column (1 to 12 distinct, missing values not listed), visible data only. */
  allowed_values?: Record<string, string[]>;
}

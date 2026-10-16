"""pipeline/datasets/notes.py: schema-panel notes for the prepared real datasets and the real datasets' edge schemas (S6-23).

A note has the shape of every other table note (schemas/schema-notes.ts TableNote; pipeline/voltmarkt/notes.note): grain, keys,
1:N links, the row count, a 5-row sample, column notes and the allowed values of category-like text columns (E-019). Every note
written here adds `column_types` (each column's DuckDB type), the edge schemas' notes included; a prepared dataset's note also
adds `label` (the registry's label, the line every page shows about the data). Each dataset's prep module may give its tables' grain, keys, links and column notes as NOTES; a table it
does not describe (each 8 Week SQL Challenge table) gets DEFAULT_GRAIN and no keys. Real data arrives with level 4, so every note
shows from level 4. An edge schema's notes (our own invented rows, hidden test data) take the same grain, keys and column notes
and carry column_types, with no allowed values and no label.
"""
from __future__ import annotations

import datetime as dt
import importlib
import math
import re
from decimal import Decimal

from voltmarkt.notes import allowed_values, fk  # noqa: F401  (fk: the dataset modules' NOTES use it)

FROM_LEVEL = 4
DEFAULT_GRAIN = "a table of the source, as its prep loaded it"
PREP_SCRIPT = re.compile(r"^pipeline/datasets/([a-z_][a-z0-9_]*)\.py$")


def json_safe(v):
    """A sample value as JSON: dates and times as ISO text, decimals as text, anything else JSON has no form for as text."""
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return v if math.isfinite(v) else str(v)
    if isinstance(v, (dt.date, dt.datetime, dt.time)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (bytes, bytearray)):
        return v.hex()
    return str(v)


def _module_notes(record: dict) -> tuple[dict, str]:
    """The dataset's NOTES and its default grain, from its prep module (the registry's `prep`)."""
    m = PREP_SCRIPT.match(record.get("prep", ""))
    if not m:
        return {}, DEFAULT_GRAIN
    module = importlib.import_module(f"datasets.{m.group(1)}")
    return getattr(module, "NOTES", {}), getattr(module, "DEFAULT_GRAIN", DEFAULT_GRAIN)


def note(con, schema: str, table: str, grain: str, pk: list[str], fks: list[dict], column_notes: dict[str, str],
         label: str | None, visible: bool) -> dict:
    types = con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? "
                        "ORDER BY ordinal_position", [schema, table]).fetchall()
    order = ", ".join(f'"{c}"' for c in pk) if pk else "ALL"
    cur = con.execute(f'SELECT * FROM "{schema}"."{table}" ORDER BY {order} LIMIT 5')
    columns = [c[0] for c in cur.description]
    rows = [[json_safe(v) for v in r] for r in cur.fetchall()]
    count = con.execute(f'SELECT count(*) FROM "{schema}"."{table}"').fetchone()[0]
    out = {"schema": schema, "table": table, "grain": grain, "primary_key": list(pk), "foreign_keys": list(fks), "row_count": count,
           "sample": {"columns": columns, "rows": rows}, "from_level": FROM_LEVEL, "column_types": dict(types)}
    present = {c for c, _ in types}
    lines = {c: text for c, text in column_notes.items() if c in present}
    if lines:
        out["column_notes"] = lines
    values = allowed_values(con, schema, table) if visible else {}
    if values:
        out["allowed_values"] = values
    if label is not None:
        out["label"] = label
    return out


def _tables(con, schema: str) -> list[str]:
    return [t for (t,) in con.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ? AND NOT internal ORDER BY 1",
                                      [schema]).fetchall()]


def dataset_notes(con, record: dict, schema: str, tables: list[str]) -> list[dict]:
    """A prepared dataset's notes, in its prep's table order, each with its column types and the registry's label."""
    described, default = _module_notes(record)
    out = []
    for table in tables:
        grain, pk, fks, column_notes = described.get(table, (default, [], [], {}))
        out.append(note(con, schema, table, grain, pk, fks, column_notes, record["label"], visible=True))
    return out


def edge_notes(con, records: list[dict], built: set[str]) -> list[dict]:
    """The notes of each real dataset's edge schema the database holds (`<schema>_edge`), in registry order: the dataset's grain,
    keys and column notes, over the edge's own rows; no allowed values and no label (they are hidden test data, our own rows)."""
    out = []
    for record in records:
        if record.get("real") is not True:
            continue
        described, default = _module_notes(record)
        for s in record.get("schemas", []):
            edge = f"{s['name']}_edge"
            if edge not in built:
                continue
            for table in _tables(con, edge):
                grain, pk, fks, column_notes = described.get(table, (default, [], [], {}))
                out.append(note(con, edge, table, grain, pk, fks, column_notes, None, visible=False))
    return out

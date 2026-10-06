"""Schema-panel notes for the visible schema (design §11 UI: grain, keys, 1:N links, samples)."""
from __future__ import annotations

import datetime as dt
from decimal import Decimal

GRAINS = {
    "calendar": ("one row per calendar day", ["cal_date"], []),
    "stores": ("one row per store (store 99 is the webshop)", ["store_id"], []),
    "categories": ("one row per category", ["category_id"], []),
    "products": ("one row per product", ["product_id"], [
        {"columns": ["category_id"], "references": "categories.category_id", "cardinality": "1:N"},
        {"columns": ["sister_product_id"], "references": "products.product_id", "cardinality": "1:N"},
    ]),
    "promotions": ("one row per promotion", ["promo_id"], []),
}
# Design §10: the canonical beginner sales view. Its notes say the grain, so a learner sees that order_id
# repeats (an order has one or more lines) and that every measure belongs to its line.
VIEWS = {
    "sales": ("one row per order line", ["order_line_id"], [
        {"columns": ["order_id"], "references": "orders.order_id", "cardinality": "1:N"},
        {"columns": ["product_id"], "references": "products.product_id", "cardinality": "1:N"},
    ]),
}


# E-019: the notes list the allowed values of each category-like column. The rule: a text column with at
# least 1 and at most ALLOWED_VALUES_MAX distinct non-missing values in the visible data lists them, sorted;
# a missing value is never listed. Names, codes and IDs have more values and are not listed.
ALLOWED_VALUES_MAX = 12


def allowed_values(con, schema: str, table: str) -> dict[str, list[str]]:
    columns = con.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? "
                          "AND data_type = 'VARCHAR' ORDER BY ordinal_position", [schema, table]).fetchall()
    out = {}
    for (column,) in columns:
        values = con.execute(f'SELECT DISTINCT "{column}" FROM {schema}.{table} WHERE "{column}" IS NOT NULL '
                             f'ORDER BY 1 LIMIT {ALLOWED_VALUES_MAX + 1}').fetchall()
        if 1 <= len(values) <= ALLOWED_VALUES_MAX:
            out[column] = [v for (v,) in values]
    return out


def json_safe(v):
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


def note(con, schema: str, table: str, grain: str, pk: list[str], fks: list[dict], visible: bool) -> dict:
    cur = con.execute(f"SELECT * FROM {schema}.{table} ORDER BY {', '.join(pk)} LIMIT 5")
    cols = [c[0] for c in cur.description]
    rows = [[json_safe(v) for v in r] for r in cur.fetchall()]
    count = con.execute(f"SELECT count(*) FROM {schema}.{table}").fetchone()[0]
    out = {"schema": schema, "table": table, "grain": grain, "primary_key": pk,
           "foreign_keys": fks, "row_count": count, "sample": {"columns": cols, "rows": rows}}
    values = allowed_values(con, schema, table) if visible else {}
    if values:
        out["allowed_values"] = values
    return out


def schema_notes(con, schema: str) -> list[dict]:
    """The visible schema: the level 1 tables, then the views (the server shows the notes of an item's schema)."""
    return ([note(con, schema, t, *spec, visible=True) for t, spec in GRAINS.items()]
            + [note(con, schema, v, *spec, visible=True) for v, spec in VIEWS.items()])


def view_notes(con, schema: str) -> list[dict]:
    """The views of a level 2 edge schema. No allowed values: they come from the visible data only (E-019)."""
    return [note(con, schema, v, *spec, visible=False) for v, spec in VIEWS.items()]

"""Schema-panel notes for the visible schema (design §11 UI: grain, keys, 1:N links, samples)."""
from __future__ import annotations

import datetime as dt
from decimal import Decimal


def fk(column: str, table: str, ref_column: str) -> dict:
    """A foreign key as data: `column` here links to `table.ref_column`, one row there to many here (1:N).

    `ref_table` and `ref_columns` name the referenced table and columns (sprint 4a, so the panel can show
    "order_id -> orders (1:N)"); `references` keeps the "table.column" text today's panel and self-check read.
    """
    return {"columns": [column], "references": f"{table}.{ref_column}", "ref_table": table, "ref_columns": [ref_column],
            "cardinality": "1:N"}


# table -> (grain, primary key, foreign keys, from_level). from_level is the first SQL level whose items show the
# table in the schema panel (S4-01): the order and price tables, and competitor_prices, join at level 3, and items
# at levels 1 and 2 keep today's tables.
GRAINS = {
    "calendar": ("one row per calendar day", ["cal_date"], [], 1),
    "stores": ("one row per store (store 99 is the webshop)", ["store_id"], [], 1),
    "categories": ("one row per category", ["category_id"], [], 1),
    "products": ("one row per product", ["product_id"], [
        fk("category_id", "categories", "category_id"),
        fk("sister_product_id", "products", "product_id"),
    ], 1),
    "promotions": ("one row per promotion", ["promo_id"], [], 1),
    "orders": ("one row per order (customer_id is missing for a guest order)", ["order_id"], [
        fk("store_id", "stores", "store_id"),
    ], 3),
    "order_lines": ("one row per order line", ["order_line_id"], [
        fk("order_id", "orders", "order_id"),
        fk("product_id", "products", "product_id"),
        fk("promo_id", "promotions", "promo_id"),
    ], 3),
    "price_history": ("one row per product per price version (valid_to is missing for the current price)",
                      ["product_id", "valid_from"], [fk("product_id", "products", "product_id")], 3),
    # The bridge table the SQL-JOIN-01 reading uses (design §12).
    "promotion_products": ("one row per promotion and product (a bridge table: a product can be in several promotions)",
                           ["promo_id", "product_id"], [
        fk("promo_id", "promotions", "promo_id"),
        fk("product_id", "products", "product_id"),
    ], 3),
    "competitor_prices": ("one row per competitor price check of a product", ["product_id", "competitor", "observed_ts"], [
        fk("product_id", "products", "product_id"),
    ], 3),
}
# Sprint 5a (Task B2): the A/B test's tables, which pipeline/voltmarkt/ab_test.py builds, not generate(); so they are kept
# apart from GRAINS (the tables generate() returns). They show from level 3, with the order tables. There is no customers
# table, so customer_id links to nothing the panel shows.
AB_GRAINS = {
    "ab_assignments": ("one row per customer and variant of an A/B test", ["test_id", "customer_id", "variant"], [], 3),
    "ab_conversions": ("one row per web order placed by a customer of an A/B test during the test",
                       ["test_id", "customer_id", "converted_at"], [], 3),
}
# Sprint 6 (S6-07): cost_history, appended after the A/B test's tables. It shows from level 4, with CASE-PRICE-05's margin
# bridge; products keeps its one unit cost per product.
COST_GRAINS = {
    "cost_history": ("one row per product per cost version (valid_to is missing for the current cost)",
                     ["product_id", "valid_from"], [fk("product_id", "products", "product_id")], 4),
}
# Design §10: the canonical beginner sales view. Its notes say the grain, so a learner sees that order_id
# repeats (an order has one or more lines) and that every measure belongs to its line.
VIEWS = {
    "sales": ("one row per order line", ["order_line_id"], [
        fk("order_id", "orders", "order_id"),
        fk("product_id", "products", "product_id"),
    ], 1),
}
# S4B-31: the weekly competitor price view, in voltmarkt and in the edge schemas that hold competitor_prices. The
# build creates it in its own step, so it is not in VIEWS (those go to every edge schema with order_lines).
WEEKLY_VIEW = ("one row per product and ISO week, built from competitor_prices", ["product_id", "iso_year", "iso_week"], [
    fk("product_id", "products", "product_id"),
], 3)
# S6-06 (E-011): the zero-filled weekly series, in voltmarkt and voltmarkt_edge_promo, built by its own step too. E-011 gives
# the cases that read it the series as a prepared view, because date spines are taught at level 6. It shows from level 4
# (ruling P11): E-169 moved its only readers, CASE-PRICE-03 and -04, to level 4.
WEEKLY_UNITS_VIEW = ("one row per product and ISO week of the calendar, with 0 for a week with no sales",
                     ["product_id", "iso_year", "iso_week"], [fk("product_id", "products", "product_id")], 4)

# S6-02: the raw schema's notes. Each table keeps its clean grain, keys and links, after this line, and shows from level 4,
# where the data-quality arc starts (design §10). The clean UTC note is not given to raw order_ts: a store order's time is
# the store's local time there (Q-01-05), so its note says only what the column holds.
RAW_WARNING = "This table may hold errors."
RAW_FROM_LEVEL = 4
RAW_COLUMN_NOTES = {"orders": {"order_ts": "The order time as the till or the webshop recorded it."}}

# A line of plain English about one column, by table and column (the sales row is the backlog's ship-to note).
COLUMN_NOTES = {
    # F2: order_date is CAST(order_ts AS DATE) on a UTC clock (ddl.sql), so an order just after midnight in Amsterdam has the day before.
    "sales": {
        "order_date": "The UTC day of order_ts: an order placed just after midnight in Amsterdam falls on the day before.",
        "country_code": "The ship-to country: where the order is delivered, which can differ from the store's country.",
    },
    "competitor_price_weekly": {
        "iso_year": "The ISO year of the week, which can differ from the calendar year in late December and early January.",
        "iso_week": "The ISO week number (a week starts on Monday), taken from the UTC time of the price check.",
        "avg_competitor_price_eur": "The average of the competitors' prices checked that week, in euros.",
        "competitors_seen": "How many different competitors were checked that week.",
    },
    # Sprint 5a: these two are UTC instants too, though their names do not end in _ts.
    "ab_assignments": {"assigned_at": "A UTC instant: when the customer entered the test and first saw the variant."},
    "ab_conversions": {
        "converted_at": "A UTC instant: the time of the web order (order_ts in orders).",
        "revenue_eur": "The web order's net revenue in euros: over its lines, quantity times unit price less the line discount.",
    },
    # Sprint 6.
    "cost_history": {"unit_cost_eur": "What one unit cost Voltmarkt from valid_from to valid_to, both days included."},
    "weekly_units": {
        "iso_year": "The ISO year of the week, which can differ from the calendar year in late December and early January.",
        "iso_week": "The ISO week number (a week starts on Monday), as the calendar gives it.",
        "week_start": "The Monday the week starts on. An order counts in the week of its UTC date, as in the sales view.",
        "units": "Units sold that week, 0 when the product sold nothing that week.",
        "net_revenue_eur": "Net revenue that week in euros (quantity times unit price less the line discount), 0 when nothing sold.",
    },
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


UTC_NOTE = "A UTC instant (the database clock is UTC). Convert it for an Amsterdam day."


def note(con, schema: str, table: str, grain: str, pk: list[str], fks: list[dict], from_level: int, visible: bool,
         column_notes: dict[str, str] | None = None) -> dict:
    """One table's note. `column_notes`, when given, replaces the default ones (the UTC line of each *_ts column, then
    COLUMN_NOTES), as the raw tables need."""
    cur = con.execute(f"SELECT * FROM {schema}.{table} ORDER BY {', '.join(pk)} LIMIT 5")
    cols = [c[0] for c in cur.description]
    rows = [[json_safe(v) for v in r] for r in cur.fetchall()]
    count = con.execute(f"SELECT count(*) FROM {schema}.{table}").fetchone()[0]
    out = {"schema": schema, "table": table, "grain": grain, "primary_key": pk,
           "foreign_keys": fks, "row_count": count, "sample": {"columns": cols, "rows": rows}, "from_level": from_level}
    if column_notes is None:
        ts_notes = {c: UTC_NOTE for c in cols if c.endswith("_ts")}   # P-10: every *_ts column is a UTC instant
        ts_notes.update(COLUMN_NOTES.get(table, {}))
    else:
        ts_notes = dict(column_notes)
    if ts_notes:
        out["column_notes"] = ts_notes
    values = allowed_values(con, schema, table) if visible else {}
    if values:
        out["allowed_values"] = values
    return out


def schema_notes(con, schema: str) -> list[dict]:
    """The visible schema: its tables (level 1's, then level 3's, then the A/B test's, then cost_history), then the views
    (the server shows an item's schema's notes)."""
    return ([note(con, schema, t, *spec, visible=True) for t, spec in GRAINS.items()]
            + [note(con, schema, t, *spec, visible=True) for t, spec in AB_GRAINS.items()]
            + [note(con, schema, t, *spec, visible=True) for t, spec in COST_GRAINS.items()]
            + [note(con, schema, v, *spec, visible=True) for v, spec in VIEWS.items()]
            + [note(con, schema, "competitor_price_weekly", *WEEKLY_VIEW, visible=True)]
            + [note(con, schema, "weekly_units", *WEEKLY_UNITS_VIEW, visible=True)])


def raw_notes(con, schema: str, tables: tuple[str, ...]) -> list[dict]:
    """S6-02: the raw schema's tables, in GRAINS order. Each grain starts with RAW_WARNING, and the keys and links are the
    clean table's (what the data should hold). The raw schema is a visible schema for level 4's raw items (S6-01), so its
    allowed values come from its own data."""
    out = []
    for table, (grain, pk, fks, _) in GRAINS.items():
        if table in tables:
            out.append(note(con, schema, table, f"{RAW_WARNING} {grain[0].upper()}{grain[1:]}", pk, fks, RAW_FROM_LEVEL,
                            visible=True, column_notes=RAW_COLUMN_NOTES.get(table, {})))
    return out


def view_notes(con, schema: str) -> list[dict]:
    """The views of an edge schema that mirrors voltmarkt (since M5 the level 1 ones too, whose sales view has no rows). No allowed
    values: they come from the visible data only (E-019)."""
    return [note(con, schema, v, *spec, visible=False) for v, spec in VIEWS.items()]

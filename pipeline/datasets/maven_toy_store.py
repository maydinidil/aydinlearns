"""pipeline/datasets/maven_toy_store.py: the Toy Store E-Commerce Database, Maven Fuzzy Factory (DS-MKT-03, Maven Analytics; its
page states Public Domain; sprint 8 Part 2, Task D1: S8-16, E-213). Fictional data (E-075): a made-up online teddy bear shop, so the
registry marks it real: false and its label says so.

The download is Maven+Fuzzy+Factory.zip, holding six CSV files and maven_fuzzy_factory_data_dictionary.csv. The registry lists the
six the prep reads, found by name wherever they sit in the zip; each becomes one table of schema maven_toy_store (csvzip.py), every
column under the source's own name. The data dictionary is not read: the schema panel describes each column.

  website_sessions    one row per session: website_session_id integer; created_at timestamp; user_id, is_repeat_session integer;
                      utm_source, utm_campaign, utm_content, device_type, http_referer text
  website_pageviews   one row per page viewed: website_pageview_id integer; created_at timestamp; website_session_id integer;
                      pageview_url text
  orders              one row per order: order_id integer; created_at timestamp; website_session_id, user_id, primary_product_id,
                      items_purchased integer; price_usd, cogs_usd double
  order_items         one row per item of an order: order_item_id integer; created_at timestamp; order_id, product_id,
                      is_primary_item integer; price_usd, cogs_usd double
  order_item_refunds  one row per refunded item: order_item_refund_id integer; created_at timestamp; order_item_id, order_id integer;
                      refund_amount_usd double
  products            one row per product: product_id integer; created_at timestamp; product_name text

A database export writes a missing value as the word NULL: wherever the files do, the value is loaded as missing, and each column's
count is recorded (the registry's notes say so). Every other value stays as the source has it. Checks, recorded in prep.json: each
key in NOTES has no repeated row, each 1:N link's values are in the table it points to, and the rows against 03's counts: 1,735,068
records in all (the six tables), 30,000 or more orders and 400,000 or more sessions. A difference warns and is recorded, and the
prep goes on.

Manual steps (E-069): download the zip from the dataset's Data Playground page and keep it zipped (the registry's notes).
"""
from __future__ import annotations

import pathlib

from datasets import csvzip
from datasets.notes import fk

DATASET = "Maven Toy Store"
MISSING_TEXT = "NULL"
TABLES = {
    "website_sessions": [("website_session_id", "int"), ("created_at", "datetime"), ("user_id", "int"), ("is_repeat_session", "int"),
                         ("utm_source", "text"), ("utm_campaign", "text"), ("utm_content", "text"), ("device_type", "text"),
                         ("http_referer", "text")],
    "website_pageviews": [("website_pageview_id", "int"), ("created_at", "datetime"), ("website_session_id", "int"),
                          ("pageview_url", "text")],
    "orders": [("order_id", "int"), ("created_at", "datetime"), ("website_session_id", "int"), ("user_id", "int"),
               ("primary_product_id", "int"), ("items_purchased", "int"), ("price_usd", "float"), ("cogs_usd", "float")],
    "order_items": [("order_item_id", "int"), ("created_at", "datetime"), ("order_id", "int"), ("product_id", "int"),
                    ("is_primary_item", "int"), ("price_usd", "float"), ("cogs_usd", "float")],
    "order_item_refunds": [("order_item_refund_id", "int"), ("created_at", "datetime"), ("order_item_id", "int"), ("order_id", "int"),
                           ("refund_amount_usd", "float")],
    "products": [("product_id", "int"), ("created_at", "datetime"), ("product_name", "text")],
}
PUBLISHED_RECORDS = 1_735_068          # 03 (DS-MKT-03): "1,735,068 records, 36 fields", the six tables together
ORDERS_AT_LEAST = 30_000               # 03: "30K+ orders from 400K+ website sessions"
SESSIONS_AT_LEAST = 400_000
# The schema panel's notes (datasets/notes.py): grain, primary key, 1:N links and a line per column. The edge schema
# maven_toy_store_edge uses the same. A key or link here is also checked by the prep (csvzip.prepare_tables).
NOTES = {
    "website_sessions": ("one row per website session", ["website_session_id"], [], {
        "website_session_id": "The session's ID.",
        "created_at": "When the session started.",
        "user_id": "The visitor's ID: the same on every session of one visitor.",
        "is_repeat_session": "1 when the visitor had been on the site before, else 0.",
        "utm_source": "The traffic source the visit's tracking tag names, such as a search engine's paid ads; missing when the visit "
                      "carried no tag.",
        "utm_campaign": "The campaign the tracking tag names; missing when the visit carried no tag.",
        "utm_content": "The ad the tracking tag names; missing when the visit carried no tag.",
        "device_type": "The visitor's device: desktop or mobile.",
        "http_referer": "The site the visitor came from; missing when the visitor typed the address.",
    }),
    "website_pageviews": ("one row per page viewed in a session", ["website_pageview_id"],
                          [fk("website_session_id", "website_sessions", "website_session_id")], {
        "created_at": "When the page was viewed.",
        "pageview_url": "The page's path on the site.",
    }),
    "orders": ("one row per order", ["order_id"],
               [fk("website_session_id", "website_sessions", "website_session_id"), fk("primary_product_id", "products", "product_id")], {
        "created_at": "When the order was placed.",
        "website_session_id": "The session the order was placed in. Join it to website_sessions for the visit's source.",
        "user_id": "The visitor's ID, as in website_sessions.",
        "primary_product_id": "The first product the customer put in the cart.",
        "items_purchased": "The number of items in the order.",
        "price_usd": "The order's price, in US dollars.",
        "cogs_usd": "The order's cost of goods sold, in US dollars.",
    }),
    "order_items": ("one row per item of an order", ["order_item_id"],
                    [fk("order_id", "orders", "order_id"), fk("product_id", "products", "product_id")], {
        "is_primary_item": "1 for the order's primary product, the first put in the cart, else 0.",
        "price_usd": "The item's price, in US dollars.",
        "cogs_usd": "The item's cost of goods sold, in US dollars.",
    }),
    "order_item_refunds": ("one row per refunded order item", ["order_item_refund_id"],
                           [fk("order_item_id", "order_items", "order_item_id"), fk("order_id", "orders", "order_id")], {
        "created_at": "When the refund was made.",
        "refund_amount_usd": "The amount refunded, in US dollars.",
    }),
    "products": ("one row per product", ["product_id"], [], {
        "created_at": "When the product went on sale.",
        "product_name": "The product's name.",
    }),
}


def prepare(schema: str, source, out: pathlib.Path) -> dict:
    """Reads the six CSV files of the zip at source.path (source.members) into out/<table>.parquet, with their checks."""
    result, _ = csvzip.prepare_tables(DATASET, source, out, TABLES, NOTES, missing_text=MISSING_TEXT)
    tables, checks, warnings = result["tables"], result["checks"], result["warnings"]
    total = sum(tables.values())
    published = {
        "total_rows": {"expected": PUBLISHED_RECORDS, "read": total, "ok": total == PUBLISHED_RECORDS},
        "orders_at_least": {"expected": ORDERS_AT_LEAST, "read": tables["orders"], "ok": tables["orders"] >= ORDERS_AT_LEAST},
        "sessions_at_least": {"expected": SESSIONS_AT_LEAST, "read": tables["website_sessions"],
                              "ok": tables["website_sessions"] >= SESSIONS_AT_LEAST},
    }
    checks["published"] = published
    if not published["total_rows"]["ok"]:
        warnings.append(f"{DATASET}: the six tables hold {total:,} rows; 03 gives {PUBLISHED_RECORDS:,} records")
    if not published["orders_at_least"]["ok"]:
        warnings.append(f"{DATASET}: {tables['orders']:,} orders read; 03 gives more than {ORDERS_AT_LEAST:,}")
    if not published["sessions_at_least"]["ok"]:
        warnings.append(f"{DATASET}: {tables['website_sessions']:,} sessions read; 03 gives more than {SESSIONS_AT_LEAST:,}")
    duplicates, not_found = csvzip.check_totals(checks)
    as_missing = sum(n for columns in checks["missing_text"].values() for n in columns.values())
    result["summary"] = (f"{csvzip.rows_line(tables)}, {total:,} in all (03 gives {PUBLISHED_RECORDS:,}); {MISSING_TEXT} read as missing "
                         f"{as_missing:,}; key duplicates {duplicates:,}; link values not found {not_found:,}")
    return result

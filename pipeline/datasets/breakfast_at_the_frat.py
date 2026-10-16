"""pipeline/datasets/breakfast_at_the_frat.py: Breakfast at the Frat (DS-PRICE-101, dunnhumby; research, personal or
non-commercial use).

The download is dunnhumby_Breakfast-at-the-Frat.zip, holding a folder with the workbook "dunnhumby - Breakfast at the Frat.xlsx"
and a PDF user guide. Three sheets are read (xlsx.py, D84) into three tables of schema breakfast_at_the_frat:

  transactions  "dh Transaction Data": one row per store, product and week. week_end_date date; store_num integer; upc text (a
                product code); units, visits, hhs integer; spend, price (the shelf price paid), base_price (the regular price)
                double; feature (in the weekly circular), display (on an in-store display), tpr_only (a temporary price
                reduction with no feature or display) integer, 1 or 0
  products      "dh Products Lookup": upc, description, manufacturer, category, sub_category, product_size, all text
  stores        "dh Store Lookup": store_id integer; store_name, address_city_name, address_state_prov_code, msa_code (a code),
                seg_value_name (the price tier) text; parking_space_qty, sales_area_size_num integer; avg_weekly_baskets double

E-028: each sheet's header row is checked (a title row may sit above it) and each sheet is read up to its first empty row.
E-074: the sales name a store as STORE_NUM and the store lookup as STORE_ID; the prep checks that every STORE_NUM in the sales is
a STORE_ID of the lookup and records the counts, and records the product count (the UPCs in the sales and in the lookup). The
transaction rows are checked against the published count, 524,950 (knowledge file 09). A difference warns, is recorded, and the
prep goes on.

Manual steps (E-069): dunnhumby's Source Files page has the download button, and may ask for a name and email first.
"""
from __future__ import annotations

import pathlib

from datasets import ParquetTable, PrepError
from datasets import xlsx
from datasets.notes import fk

SHEETS = {
    "transactions": ("dh Transaction Data",
                     ["WEEK_END_DATE", "STORE_NUM", "UPC", "UNITS", "VISITS", "HHS", "SPEND", "PRICE", "BASE_PRICE", "FEATURE", "DISPLAY", "TPR_ONLY"],
                     [("week_end_date", "date"), ("store_num", "int"), ("upc", "text"), ("units", "int"), ("visits", "int"),
                      ("hhs", "int"), ("spend", "float"), ("price", "float"), ("base_price", "float"), ("feature", "int"),
                      ("display", "int"), ("tpr_only", "int")]),
    "products": ("dh Products Lookup",
                 ["UPC", "DESCRIPTION", "MANUFACTURER", "CATEGORY", "SUB_CATEGORY", "PRODUCT_SIZE"],
                 [("upc", "text"), ("description", "text"), ("manufacturer", "text"), ("category", "text"), ("sub_category", "text"),
                  ("product_size", "text")]),
    "stores": ("dh Store Lookup",
               ["STORE_ID", "STORE_NAME", "ADDRESS_CITY_NAME", "ADDRESS_STATE_PROV_CODE", "MSA_CODE", "SEG_VALUE_NAME",
                "PARKING_SPACE_QTY", "SALES_AREA_SIZE_NUM", "AVG_WEEKLY_BASKETS"],
               [("store_id", "int"), ("store_name", "text"), ("address_city_name", "text"), ("address_state_prov_code", "text"),
                ("msa_code", "text"), ("seg_value_name", "text"), ("parking_space_qty", "int"), ("sales_area_size_num", "int"),
                ("avg_weekly_baskets", "float")]),
}
PUBLISHED_TRANSACTIONS = 524_950
# The schema panel's notes (datasets/notes.py): grain, primary key, 1:N links and a line per column. E-074: the sales name a store
# store_num and the store list store_id. The edge schema breakfast_at_the_frat_edge uses the same.
NOTES = {
    "transactions": ("one row per store, product and week", ["week_end_date", "store_num", "upc"],
                     # No 1:N link to stores (F4 seams M1): two stores are listed twice there, so store_num's note says what a join does.
                     [fk("upc", "products", "upc")], {
                         "week_end_date": "The last day of the week the row covers.",
                         "store_num": "The store. Join it to stores.store_id: the two names differ, and two stores are listed twice "
                                      "there, so the join repeats their rows.",
                         "upc": "The product code, as text. Join it to products.upc.",
                         "units": "Units sold that week.",
                         "visits": "Visits that bought the product that week.",
                         "hhs": "Households that bought the product that week.",
                         "spend": "The sales value that week.",
                         "price": "The shelf price paid.",
                         "base_price": "The regular price. A price below it is a price reduction.",
                         "feature": "1 when the product was in the weekly circular, else 0.",
                         "display": "1 when the product was on an in-store display, else 0.",
                         "tpr_only": "1 for a temporary price reduction with no feature and no display, else 0.",
                     }),
    "products": ("one row per product", ["upc"], [], {"upc": "The product code, as text."}),
    # The real lookup has 79 rows for 77 store IDs: two stores are listed twice, each with another price tier, so store_id is no key.
    "stores": ("one row per store, apart from two stores listed twice", [], [], {
        "store_id": "The store. Two stores are listed twice, each time with a different price tier, so a join on store_id repeats "
                    "their rows.",
        "seg_value_name": "The store's price tier.",
        "msa_code": "The code of the store's metropolitan area, as text.",
        "avg_weekly_baskets": "The store's average number of baskets a week.",
    }),
}


def prepare(schema: str, source, out: pathlib.Path) -> dict:
    """Reads the workbook (source.path, or source.inside the zip at source.path) into out/<table>.parquet for the three tables."""
    tables, stats, keys = {}, [], {}
    with xlsx.Workbook(source.path, source.inside) as wb:
        missing = [sheet for sheet, _, _ in SHEETS.values() if sheet not in wb.sheet_names]
        if missing:
            raise PrepError(f"Breakfast at the Frat: the workbook has no sheet {', '.join(repr(s) for s in missing)} "
                            f"(it has {', '.join(repr(s) for s in wb.sheet_names)})")
        for table, (sheet, header, spec) in SHEETS.items():
            columns = [xlsx.Column(n, k) for n, k in spec]
            key = {"transactions": ("store_num", "upc"), "products": ("upc",), "stores": ("store_id",)}[table]
            seen = {name: set() for name in key}
            at = {name: [c.name for c in columns].index(name) for name in key}
            st = xlsx.SheetStats(sheet)
            with ParquetTable(out / f"{table}.parquet", columns) as writer:
                for record in xlsx.read_records(wb, sheet, header, columns, stats=st):
                    for name in key:
                        seen[name].add(record[at[name]])
                    writer.add(record)
            tables[table] = writer.rows
            stats.append(st)
            keys[table] = seen
    store_nums, store_ids = keys["transactions"]["store_num"] - {None}, keys["stores"]["store_id"] - {None}
    sale_upcs, product_upcs = keys["transactions"]["upc"] - {None}, keys["products"]["upc"] - {None}
    missing_stores = len(store_nums - store_ids)
    store_join = {"store_nums_in_sales": len(store_nums), "store_ids_in_lookup": len(store_ids),
                  "sales_store_nums_missing_from_lookup": missing_stores, "ok": missing_stores == 0}
    products = {"upcs_in_sales": len(sale_upcs), "products_in_lookup": tables["products"],
                "sales_upcs_missing_from_lookup": len(sale_upcs - product_upcs)}
    published_ok = tables["transactions"] == PUBLISHED_TRANSACTIONS
    warnings = []
    if not published_ok:
        warnings.append(f"Breakfast at the Frat: {tables['transactions']:,} transaction rows read; the published count is "
                        f"{PUBLISHED_TRANSACTIONS:,}")
    if missing_stores:
        warnings.append(f"Breakfast at the Frat (E-074): {missing_stores:,} STORE_NUM in the sales are not a STORE_ID of the store "
                        f"lookup")
    if products["sales_upcs_missing_from_lookup"]:
        warnings.append(f"Breakfast at the Frat: {products['sales_upcs_missing_from_lookup']:,} UPCs in the sales are not in the "
                        f"products lookup")
    for s in stats:
        if s.rows_after_empty:
            warnings.append(f"Breakfast at the Frat: sheet {s.sheet!r} has {s.rows_after_empty:,} rows after an empty row, not read")
    return {
        "tables": tables,
        "checks": {
            "sheets": [s.as_dict() for s in stats],
            "published_rows": {"expected": PUBLISHED_TRANSACTIONS, "read": tables["transactions"], "ok": published_ok},
            "store_join": store_join,
            "products": products,
        },
        "warnings": warnings,
        # Review M4: the counts the controller's Step 5 reads from the console.
        "summary": (f"transactions {tables['transactions']:,}, products {tables['products']:,}, stores {tables['stores']:,} rows; "
                    f"store join: {len(store_nums):,} store numbers in the sales, {len(store_ids):,} in the store lookup, "
                    f"{missing_stores:,} missing; products: {len(sale_upcs):,} UPCs in the sales, {tables['products']:,} in the "
                    f"lookup, {products['sales_upcs_missing_from_lookup']:,} missing"),
    }

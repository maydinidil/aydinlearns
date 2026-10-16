"""Voltmarkt's raw order quirks (sprint 6, S6-02; knowledge/05 CO-01 Q-01-01, -02, -05, -06; GEN-04, GEN-06).

The clean tables are generated first; this step copies the order tables and injects each quirk into the copy, so no
clean table changes. Every draw comes from the reserved quirks stream, after the product quirks (Q-01-04 and Q-01-07, in
generate.inject_product_quirks), so raw products stays as it was before sprint 6: Q-01-01's sample first, then Q-01-06's.
Q-01-02 and Q-01-05 draw nothing. Q-01-03 is not a quirk (E-155): a guest order is a business state, in both schemas.

- Q-01-01: 0.8% of store BE-14's lines are resent by its tills. Each copy repeats its line's business columns under a new
  order_line_id, numbered after the last clean one (S6-02 puts the 0.8% on BE-14's lines, not on all lines as FIND-01-13).
- Q-01-02: store BE-07 (Gent) logged unit_price_eur in cents during June 2024 (the order's date): 100 times the price.
  line_discount_eur stays in euros.
- Q-01-05: a store order's order_ts holds the store's local wall-clock time (its stores.timezone); a web order's stays UTC.
- Q-01-06: 1% of products have two overlapping price windows: one window's valid_to runs 3 to 14 days into the next one,
  which lasts longer, so exactly two windows overlap. No planted product's price story changes.
"""
from __future__ import annotations

import datetime as dt
import statistics

import duckdb
import numpy as np
import pyarrow as pa

from . import generate as vm

# S6-02: the tables voltmarkt_raw holds, in the order the build loads them: the quirk tables and the small tables a ticket joins.
RAW_TABLES = ("calendar", "stores", "categories", "products", "promotions", "price_history", "promotion_products",
              "orders", "order_lines")
RESENT = {"store": "BE-14", "share": 0.008}                  # Q-01-01
CENTS = {"store": "BE-07", "month": "2024-06", "factor": 100}  # Q-01-02
OVERLAP = {"share": 0.01, "days": (3, 15)}                   # Q-01-06; integers(low, high): 3 to 14 days
CENTS_MEDIAN_BAND = (80, 120)                                # 05's FIND-01-14 check: June median over other months' median
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17


def _cents(column: pa.ChunkedArray) -> np.ndarray:
    return (column.cast(pa.float64()).to_numpy() * 100).round().astype(np.int64)


def inject_order_quirks(rng: np.random.Generator, clean: dict) -> tuple[dict[str, pa.Table], dict]:
    """The raw orders, order_lines and price_history, and each quirk's counts for the truth file's planted.raw."""
    stores, orders, lines = clean["stores"], clean["orders"], clean["order_lines"]
    store_id = dict(zip(stores.column("store_code").to_pylist(), stores.column("store_id").to_pylist()))
    order_ids = orders.column("order_id").to_numpy()
    if not np.array_equal(order_ids, np.arange(1, len(order_ids) + 1)):
        raise ValueError("order ids must run 1..n in order")
    line_order = lines.column("order_id").to_numpy() - 1                   # row of each line's order
    line_store = orders.column("store_id").to_numpy()[line_order]
    order_month = orders.column("order_ts").cast(pa.int64()).to_numpy().astype("datetime64[us]").astype("datetime64[M]")

    # Q-01-02 (no draw): BE-07's June 2024 prices in cents.
    in_cents = (line_store == store_id[CENTS["store"]]) & (order_month[line_order] == np.datetime64(CENTS["month"], "M"))
    unit = _cents(lines.column("unit_price_eur"))
    unit[in_cents] *= CENTS["factor"]
    priced = lines.set_column(lines.schema.get_field_index("unit_price_eur"), "unit_price_eur", vm.decimal_array(unit))

    # Q-01-01 (the first draw after the product quirks): BE-14's resent lines, appended under new IDs.
    be14 = np.flatnonzero(line_store == store_id[RESENT["store"]])
    k = int(round(RESENT["share"] * len(be14)))
    resent = be14[np.sort(rng.choice(len(be14), size=k, replace=False))]
    first_id = int(lines.column("order_line_id").to_numpy().max()) + 1
    copies = priced.take(pa.array(resent))
    copies = copies.set_column(0, "order_line_id", pa.array(np.arange(first_id, first_id + k), pa.int64()))
    raw_lines = pa.concat_tables([priced, copies])

    # Q-01-06 (the next draws): two overlapping price windows for 1% of products.
    exclude = set(vm.PLANTED_PRODUCTS) | set(vm.FAKE_RAISES)
    raw_prices, overlapped, days = overlapping_windows(rng, clean["price_history"], len(clean["products"]), exclude)

    # Q-01-05 (no draw): store orders in their store's local time.
    raw_orders = local_store_times(orders, stores)
    store_orders = int(np.count_nonzero(orders.column("channel").to_numpy(zero_copy_only=False) == "store"))

    planted = {
        "Q-01-01": {"store": RESENT["store"], "share_of_store_lines": RESENT["share"], "store_lines": int(len(be14)),
                    "count": k, "first_new_id": first_id},
        "Q-01-02": {"store": CENTS["store"], "month": CENTS["month"], "factor": CENTS["factor"], "count": int(in_cents.sum())},
        "Q-01-05": {"channel": "store", "count": store_orders,
                    "note": "store orders hold the store's local time; web orders stay UTC"},
        "Q-01-06": {"share_of_products": OVERLAP["share"], "count": len(overlapped), "product_ids": overlapped,
                    "overlap_days": days},
    }
    return {"orders": raw_orders, "order_lines": raw_lines, "price_history": raw_prices}, planted


def overlapping_windows(rng: np.random.Generator, price_history: pa.Table, products: int,
                        exclude: set[int]) -> tuple[pa.Table, list[int], int]:
    """Q-01-06: for OVERLAP's share of products, one window's valid_to runs 3 to 14 days into the next window.

    A product qualifies when it is not excluded and has a window boundary whose next window is closed and lasts longer
    than the shortest overlap, or is open; the overlap stays shorter than the next window, so only two windows overlap.
    The draws have fixed shapes: the products, then a uniform per product (which boundary), then the days.
    """
    pids = price_history.column("product_id").to_pylist()
    starts = price_history.column("valid_from").to_pylist()
    ends = price_history.column("valid_to").to_pylist()
    rows: dict[int, list[int]] = {}
    for i, pid in enumerate(pids):
        rows.setdefault(pid, []).append(i)
    for pid in rows:
        rows[pid].sort(key=lambda i: starts[i])

    def length(i: int) -> int | None:
        return None if ends[i] is None else (ends[i] - starts[i]).days + 1

    shortest = OVERLAP["days"][0]
    boundaries = {pid: [k for k in range(len(r) - 1) if length(r[k + 1]) is None or length(r[k + 1]) > shortest]
                  for pid, r in rows.items()}
    candidates = np.array(sorted(pid for pid, b in boundaries.items() if b and pid not in exclude))
    n = int(round(OVERLAP["share"] * products))
    chosen = np.sort(rng.choice(candidates, size=n, replace=False))
    which = rng.random(n)
    extra = rng.integers(*OVERLAP["days"], n)
    new_ends = list(ends)
    total = 0
    for pid, u, d in zip(chosen.tolist(), which, extra):
        b = boundaries[pid][int(u * len(boundaries[pid]))]
        first, second = rows[pid][b], rows[pid][b + 1]
        room = length(second)
        days = int(d) if room is None else min(int(d), room - 1)
        new_ends[first] = ends[first] + dt.timedelta(days)
        total += days
    table = price_history.set_column(price_history.schema.get_field_index("valid_to"), "valid_to", pa.array(new_ends, pa.date32()))
    return table, [int(p) for p in chosen], total


def local_store_times(orders: pa.Table, stores: pa.Table) -> pa.Table:
    """Q-01-05: each store order's UTC order_ts as its store's local wall-clock time (DuckDB's built-in ICU time zones)."""
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        con.register("o", orders)
        con.register("s", stores)
        got = con.execute("""SELECT o.order_id, epoch_us(CASE WHEN o.channel = 'store'
                                 THEN timezone(s.timezone, timezone('UTC', o.order_ts)) ELSE o.order_ts END) AS us
                             FROM o JOIN s ON s.store_id = o.store_id ORDER BY o.order_id""").fetchnumpy()
    finally:
        con.close()
    if not np.array_equal(np.asarray(got["order_id"]), orders.column("order_id").to_numpy()):
        raise ValueError("Q-01-05: every order needs its store")
    local = pa.array(np.asarray(got["us"], dtype=np.int64).astype("datetime64[us]"), pa.timestamp("us"))
    return orders.set_column(orders.schema.get_field_index("order_ts"), "order_ts", local)


def product_quirk_counts(raw_products: pa.Table, clean_products: pa.Table, categories: pa.Table) -> dict:
    """The truth file's counts for the product quirks (Q-01-04 and Q-01-07), which generate.inject_product_quirks makes.
    Each respelled category_raw names its product's parent category (E-190, S6-03), recorded as spellings_of_parent."""
    raw, clean = raw_products.to_pylist(), clean_products.to_pylist()
    parent = dict(zip(categories.column("category_id").to_pylist(), categories.column("parent_category").to_pylist()))
    respelled = [(r["category_raw"], parent[c["category_id"]]) for r, c in zip(raw, clean) if r["category_raw"] != c["category_raw"]]
    missing = sum(1 for r in raw if r["category_id"] is None)
    return {
        "Q-01-04": {"count": missing, "missing_category_id": missing, "respelled_category_raw": len(respelled),
                    "spellings": sorted({s for s, _ in respelled}), "spellings_of_parent": sorted({p for _, p in respelled})},
        "Q-01-07": {"count": sum(1 for r, c in zip(raw, clean) if r["sku"] != c["sku"])},
    }


def validate(tables: dict, truth: dict) -> dict:
    """GEN-06 for the order quirks: each one exists in raw, with the count the truth file records, measured in SQL against
    the clean tables. Returns the measures (truth findings.raw). Raises ValueError naming the quirk on the first failure."""
    clean, raw = tables["clean"], tables["raw"]
    planted = truth["planted"]["raw"]
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for prefix, source in (("c", clean), ("r", raw)):
            for name in ("orders", "order_lines", "price_history", "stores"):
                con.register(f"{prefix}_{name}", source[name])
        max_id = con.execute("SELECT max(order_line_id) FROM c_order_lines").fetchone()[0]
        resent, resent_stores, repeats = con.execute(f"""SELECT count(*), list(DISTINCT s.store_code),
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM r_order_lines x WHERE x.order_line_id <= {max_id}
                    AND (x.order_id, x.product_id, x.quantity, x.unit_price_eur, x.promo_id, x.line_discount_eur)
                        IS NOT DISTINCT FROM (r.order_id, r.product_id, r.quantity, r.unit_price_eur, r.promo_id, r.line_discount_eur)))
            FROM r_order_lines r JOIN c_orders o ON o.order_id = r.order_id JOIN c_stores s ON s.store_id = o.store_id
            WHERE r.order_line_id > {max_id}""").fetchone()
        changed, hundredfold, placed = con.execute(f"""SELECT count(*), count(*) FILTER (WHERE r.unit_price_eur = {CENTS['factor']} * c.unit_price_eur),
                count(*) FILTER (WHERE s.store_code = '{CENTS['store']}' AND strftime(o.order_ts, '%Y-%m') = '{CENTS['month']}')
            FROM r_order_lines r JOIN c_order_lines c USING (order_line_id) JOIN c_orders o ON o.order_id = c.order_id
            JOIN c_stores s ON s.store_id = o.store_id WHERE r.unit_price_eur <> c.unit_price_eur""").fetchone()
        months = con.execute(f"""SELECT strftime(o.order_ts, '%Y-%m') = '{CENTS['month']}', r.unit_price_eur
            FROM r_order_lines r JOIN c_orders o ON o.order_id = r.order_id JOIN c_stores s ON s.store_id = o.store_id
            WHERE s.store_code = '{CENTS['store']}'""").fetchall()
        moved, store_orders, web_kept, web_orders = con.execute("""SELECT
                count(*) FILTER (WHERE c.channel = 'store' AND r.order_ts = timezone(s.timezone, timezone('UTC', c.order_ts))),
                count(*) FILTER (WHERE c.channel = 'store'),
                count(*) FILTER (WHERE c.channel = 'web' AND r.order_ts = c.order_ts), count(*) FILTER (WHERE c.channel = 'web')
            FROM r_orders r JOIN c_orders c USING (order_id) JOIN c_stores s ON s.store_id = c.store_id""").fetchone()
        overlapping = con.execute("""SELECT count(DISTINCT a.product_id) FROM r_price_history a JOIN r_price_history b
            ON a.product_id = b.product_id AND a.valid_from < b.valid_from AND (a.valid_to IS NULL OR a.valid_to >= b.valid_from)""").fetchone()[0]
    finally:
        con.close()
    june = [float(p) for in_june, p in months if in_june]
    other = [float(p) for in_june, p in months if not in_june]
    ratio = statistics.median(june) / statistics.median(other) if june and other else 0.0
    vm._check(resent > 0 and resent == planted["Q-01-01"]["count"] and resent_stores == [RESENT["store"]] and repeats == resent,
              f"Q-01-01: {resent} resent lines in stores {resent_stores}, {repeats} of them repeating a line")
    vm._check(changed > 0 and changed == planted["Q-01-02"]["count"] and hundredfold == changed == placed,
              f"Q-01-02: {changed} lines changed price, {hundredfold} by 100 times, {placed} at {CENTS['store']} in {CENTS['month']}")
    vm._check(CENTS_MEDIAN_BAND[0] <= ratio <= CENTS_MEDIAN_BAND[1], f"Q-01-02 (FIND-01-14): June's median price is {ratio:.1f} times the others'")
    vm._check(store_orders > 0 and moved == store_orders == planted["Q-01-05"]["count"] and web_kept == web_orders,
              f"Q-01-05: {moved} of {store_orders} store orders in local time, {web_kept} of {web_orders} web orders in UTC")
    vm._check(overlapping == planted["Q-01-06"]["count"] > 0, f"Q-01-06: {overlapping} products with overlapping price windows")
    return {
        "Q-01-01": {"resent_lines": resent, "share_of_all_lines": round(resent / max_id, 5)},
        "Q-01-02": {"lines_in_cents": changed, "june_over_other_months_median": round(ratio, 2)},
        "Q-01-05": {"store_orders_in_local_time": moved, "web_orders_in_utc": web_kept},
        "Q-01-06": {"products_with_overlapping_windows": overlapping},
    }

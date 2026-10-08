"""Voltmarkt's A/B test (sprint 5a Task B2; design §9: a few SQL items on conversion rate and lift per variant; D56).

Two tables join schema voltmarkt, built after every existing table (R37):
- ab_assignments: one row per customer and variant of a test; assigned_at is when the customer entered it;
- ab_conversions: one row per web order a customer in the test placed during the test weeks.

There is one test, AB-2025-01: a change to the web shop's checkout, assigned 50/50 by customer over two full ISO weeks of
2025 (weeks 36 and 37: Monday 1 to Sunday 14 September, UTC). Everyone who placed a web order in those weeks under a
customer_id visited the shop and is in the test, with VISITORS_WITHOUT_ORDER customers who visited and did not order (drawn
from the customers with an earlier web order). A conversion is a real web order: converted_at is its orders.order_ts and
revenue_eur its net revenue (E-103), so the order data and the test agree. The order data is only read.

The lift is planted through the split: the converting customers go to treatment a little more often than chance (evenly
down their revenue, so revenue per customer follows conversion and no large order tips it) and the other customers fill
each variant up to its drawn size, so the variants stay 50/50 (no sample ratio mismatch) while treatment converts
PLANNED_RELATIVE_LIFT better, a lift whose 95% interval includes zero, as does revenue's. The other plants: customers whose
only conversions come before their assigned_at, customers with one before and one after, and a handful of customers in
both variants. Every number below is a calibration estimate, not sourced data.

The test draws only from its own random stream, seeded on its own (AB_SEED), never from a child of Voltmarkt's SEED, so no
existing table's draws change (R37, GEN-02).
"""
from __future__ import annotations

import datetime as dt
import math

import duckdb
import numpy as np
import pyarrow as pa

from . import generate as vm

AB_SEED = 20250901                          # its own seed: the test's first day
TEST_ID = "AB-2025-01"
VARIANTS = ("control", "treatment")
TABLES = ("ab_assignments", "ab_conversions")
TEST_START = dt.datetime(2025, 9, 1)        # a Monday, 00:00 UTC (ISO week 36)
TEST_DAYS = 14                              # two full weeks, to Sunday 14 September
VISITORS_WITHOUT_ORDER = 28_500             # about 9.5% of the customers in the test convert
PLANNED_RELATIVE_LIFT = 0.05                # treatment's conversion rate against control's: +5%
SAME_VISIT_SHARE = 0.75                     # a converting customer usually orders in the visit that assigned them
SAME_VISIT_MEAN_S = 20 * 60                 # minutes from assignment to the order in that visit (exponential mean)
MIN_GAP_S = 60
PRE_ONLY_PER_VARIANT = 60                   # customers assigned only after their last web order of the test weeks
PRE_THEN_POST = 8                           # customers assigned between their first and second web order
PRE_ONLY_ROOM_S = 5 * 86400                 # such a customer is assigned 1 hour to 5 days after that order
REVENUE_BLOCK = 4                           # converters of similar revenue whose variants are shuffled together
BOTH_VARIANTS = {"visitors": 2, "converters": 1}   # per variant: customers given a second row in the other variant
SECOND_ASSIGNMENT_S = 4 * 86400             # that second row comes 1 hour to 4 days after the first
SRM_CRITICAL = 10.83                        # chi-square, 1 degree of freedom, p = 0.001 (KB-11 EXP-08; E-182)
Z95 = 1.96                                  # E-182
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17

ASSIGNMENTS = pa.schema([("test_id", pa.string()), ("customer_id", pa.int64()), ("variant", pa.string()),
                         ("assigned_at", pa.timestamp("us"))])
CONVERSIONS = pa.schema([("test_id", pa.string()), ("customer_id", pa.int64()), ("converted_at", pa.timestamp("us")),
                         ("revenue_eur", pa.decimal128(10, 2))])
EPOCH = dt.datetime(1970, 1, 1)
START_S = int((TEST_START - EPOCH).total_seconds())
END_S = START_S + TEST_DAYS * 86400         # exclusive

# Each web order of a known customer in the test weeks, grouped to one row per order (only orders with lines), and its net
# revenue (E-103). The callers choose the columns.
WEB_ORDERS_FROM = """FROM orders o JOIN order_lines l USING (order_id)
WHERE o.channel = 'web' AND o.customer_id IS NOT NULL AND o.order_ts >= $start AND o.order_ts < $end
GROUP BY o.order_id, o.customer_id, o.order_ts"""
NET = "sum(l.quantity * l.unit_price_eur - l.line_discount_eur)"
# The customers who visit and do not order: an earlier web order, none in the test weeks.
VISITOR_POOL_SQL = """SELECT DISTINCT customer_id FROM orders
WHERE channel = 'web' AND customer_id IS NOT NULL AND order_ts < $start
  AND customer_id NOT IN (SELECT customer_id FROM orders WHERE channel = 'web' AND customer_id IS NOT NULL
                          AND order_ts >= $start AND order_ts < $end)
ORDER BY 1"""
# The readout (KB-11 P1): per variant, the customers assigned and those with a conversion at or after their assigned_at.
READOUT_SQL = """WITH a AS (SELECT * FROM ab_assignments {where}),
     u AS (SELECT a.variant, a.customer_id, max(CASE WHEN c.converted_at >= a.assigned_at THEN 1 ELSE 0 END) AS converted
           FROM a LEFT JOIN ab_conversions c ON c.test_id = a.test_id AND c.customer_id = a.customer_id
           GROUP BY a.variant, a.customer_id)
SELECT variant, count(*), sum(converted) FROM u GROUP BY 1 ORDER BY 1"""
# Revenue per assigned customer (0 for a customer who did not convert), counted from assignment on: count, mean, variance.
REVENUE_SQL = """WITH a AS (SELECT * FROM ab_assignments {where}),
     u AS (SELECT a.variant, a.customer_id,
                  coalesce(sum(c.revenue_eur) FILTER (WHERE c.converted_at >= a.assigned_at), 0) AS revenue
           FROM a LEFT JOIN ab_conversions c ON c.test_id = a.test_id AND c.customer_id = a.customer_id
           GROUP BY a.variant, a.customer_id)
SELECT variant, count(*), CAST(avg(revenue) AS DOUBLE), CAST(var_samp(revenue) AS DOUBLE) FROM u GROUP BY 1 ORDER BY 1"""
BOTH_SQL = "SELECT customer_id FROM ab_assignments GROUP BY 1 HAVING count(DISTINCT variant) > 1"


def _connect(tables: dict[str, pa.Table]) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    for name, table in tables.items():
        con.register(name, table)
    return con


def read_orders(orders: pa.Table, order_lines: pa.Table) -> tuple[dict[int, list[tuple[int, int]]], np.ndarray]:
    """The test weeks' web orders by customer, as (seconds since 1970, net cents) in time order, and the visitor pool."""
    con = _connect({"orders": orders, "order_lines": order_lines})
    try:
        params = {"start": TEST_START, "end": TEST_START + dt.timedelta(TEST_DAYS)}
        window = con.execute(f"SELECT o.customer_id, epoch_us(o.order_ts) // 1000000, CAST({NET} * 100 AS BIGINT) "
                             f"{WEB_ORDERS_FROM} ORDER BY 1, 2, o.order_id", params).fetchall()
        pool = np.array([r[0] for r in con.execute(VISITOR_POOL_SQL, params).fetchall()], dtype=np.int64)
    finally:
        con.close()
    by_customer: dict[int, list[tuple[int, int]]] = {}
    for customer, seconds, cents in window:
        by_customer.setdefault(int(customer), []).append((int(seconds), int(cents)))
    for customer, rows in by_customer.items():
        if len({s for s, _ in rows}) != len(rows):
            raise ValueError(f"A/B test: customer {customer} has two web orders at the same second")
    return by_customer, pool


def _between(rng: np.random.Generator, low: int, high: int) -> int:
    """A whole second from low to high - 1 (low when the span is empty)."""
    return low + int(rng.integers(0, max(high - low, 1)))


def generate(orders: pa.Table, order_lines: pa.Table, seed: int = AB_SEED) -> tuple[dict[str, pa.Table], dict]:
    """The two tables and the plants, from the order data (read only) and the test's own stream."""
    rng = np.random.default_rng(np.random.SeedSequence(seed))
    by_customer, pool = read_orders(orders, order_lines)
    buyers = sorted(by_customer)

    # Who is assigned when, against their web orders of the test weeks.
    multi = [c for c in buyers if len(by_customer[c]) >= 2 and by_customer[c][1][0] - by_customer[c][0][0] >= 2]
    pre_then_post = {int(c) for c in rng.choice(multi, PRE_THEN_POST, replace=False)}
    late = [c for c in buyers if c not in pre_then_post and by_customer[c][-1][0] <= END_S - 1 - 86400]
    pre_only = sorted(int(c) for c in rng.choice(late, 2 * PRE_ONLY_PER_VARIANT, replace=False))
    converters = sorted(set(buyers) - set(pre_only))
    visitors = sorted(int(c) for c in rng.choice(pool, VISITORS_WITHOUT_ORDER, replace=False))

    assigned: dict[int, int] = {}
    same_visit = rng.random(len(converters)) < SAME_VISIT_SHARE
    delay = MIN_GAP_S + rng.exponential(SAME_VISIT_MEAN_S, len(converters)).astype(np.int64)
    for k, c in enumerate(converters):
        times = [s for s, _ in by_customer[c]]
        if c in pre_then_post:                         # after the first order, before the second
            assigned[c] = _between(rng, times[0] + 1, times[1])
        elif same_visit[k] and times[0] - int(delay[k]) >= START_S:
            assigned[c] = times[0] - int(delay[k])
        elif times[0] - 3600 > START_S:                # an earlier visit of the test weeks
            assigned[c] = _between(rng, START_S, times[0] - 3600)
        else:
            assigned[c] = _between(rng, START_S, times[0])
    for c in pre_only:
        last = by_customer[c][-1][0]
        assigned[c] = _between(rng, last + 3600, min(last + PRE_ONLY_ROOM_S, END_S - 1))
    weekday = np.array(vm.WEB_WEEKDAY * (TEST_DAYS // 7), dtype=float)
    hours, hour_weights = np.array(list(vm.WEB_HOURS)), np.array(list(vm.WEB_HOURS.values()), dtype=float)
    day = rng.choice(TEST_DAYS, len(visitors), p=weekday / weekday.sum())
    hour = rng.choice(hours, len(visitors), p=hour_weights / hour_weights.sum())
    minute, second = rng.integers(0, 60, len(visitors)), rng.integers(0, 60, len(visitors))
    for k, c in enumerate(visitors):
        assigned[c] = START_S + int(day[k]) * 86400 + int(hour[k]) * 3600 + int(minute[k]) * 60 + int(second[k])

    # The split: 50/50 by customer, with the planted lift carried by which variant the converting customers land in.
    total = len(converters) + len(pre_only) + len(visitors)
    n_t = int(rng.binomial(total, 0.5))
    n_c = total - n_t
    k_t = int(round(len(converters) * n_t * (1 + PLANNED_RELATIVE_LIFT) / (n_t * (1 + PLANNED_RELATIVE_LIFT) + n_c)))
    v_t = n_t - k_t - PRE_ONLY_PER_VARIANT
    if not 0 <= v_t <= len(visitors):
        raise ValueError(f"A/B test: {v_t} visitors for treatment cannot fill it")
    variant: dict[int, str] = {}
    # Converters, by the revenue they bring after assignment: a systematic draw from a random start puts k_t of them in
    # treatment, evenly down the revenue ranking, and a shuffle inside each block decides who. So the change moves how
    # many customers buy, not how much they spend, and a few large orders cannot make revenue per customer differ by chance.
    revenue = {c: sum(cents for s, cents in by_customer[c] if s >= assigned[c]) for c in converters}
    ranked = sorted(converters, key=lambda c: (-revenue[c], c))
    n, start = len(ranked), int(rng.integers(0, len(ranked)))     # whole numbers, so exactly k_t flags are 1
    flags = [((i + 1) * k_t + start) // n - (i * k_t + start) // n for i in range(n)]
    for b in range(0, len(ranked), REVENUE_BLOCK):
        block = flags[b:b + REVENUE_BLOCK]
        flags[b:b + REVENUE_BLOCK] = [block[int(k)] for k in rng.permutation(len(block))]
    for c, flag in zip(ranked, flags):
        variant[c] = VARIANTS[flag]
    for group, n_treatment in ((pre_only, PRE_ONLY_PER_VARIANT), (visitors, v_t)):
        order = rng.permutation(len(group))
        for rank, k in enumerate(order):
            variant[group[int(k)]] = VARIANTS[1] if rank < n_treatment else VARIANTS[0]

    # A handful of customers also get a row in the other variant, later (an assignment bug the analyst must catch).
    second_rows: list[tuple[int, str, int]] = []
    for v in VARIANTS:
        for group, n in ((visitors, BOTH_VARIANTS["visitors"]), (converters, BOTH_VARIANTS["converters"])):
            pool_v = [c for c in group if variant[c] == v and c not in pre_then_post and assigned[c] <= END_S - 1 - 86400]
            for c in sorted(int(x) for x in rng.choice(pool_v, n, replace=False)):
                other = VARIANTS[1 - VARIANTS.index(v)]
                second_rows.append((c, other, _between(rng, assigned[c] + 3600, min(assigned[c] + SECOND_ASSIGNMENT_S, END_S - 1))))

    rows = sorted([(assigned[c], c, variant[c]) for c in assigned] + [(at, c, v) for c, v, at in second_rows])
    conversions = sorted((s, c, cents) for c, orders_c in by_customer.items() for s, cents in orders_c)
    tables = {
        "ab_assignments": pa.table({
            "test_id": pa.array([TEST_ID] * len(rows), pa.string()),
            "customer_id": pa.array([r[1] for r in rows], pa.int64()),
            "variant": pa.array([r[2] for r in rows], pa.string()),
            "assigned_at": _timestamps([r[0] for r in rows]),
        }, schema=ASSIGNMENTS),
        "ab_conversions": pa.table({
            "test_id": pa.array([TEST_ID] * len(conversions), pa.string()),
            "customer_id": pa.array([r[1] for r in conversions], pa.int64()),
            "converted_at": _timestamps([r[0] for r in conversions]),
            "revenue_eur": vm.decimal_array(np.array([r[2] for r in conversions], dtype=np.int64)),
        }, schema=CONVERSIONS),
    }
    plants = {
        "test_id": TEST_ID, "seed": seed, "variants": list(VARIANTS),
        "start": TEST_START.date().isoformat(), "end": (TEST_START + dt.timedelta(TEST_DAYS - 1)).date().isoformat(),
        "iso_weeks": sorted({(TEST_START + dt.timedelta(d)).isocalendar()[1] for d in range(TEST_DAYS)}),
        "planned_relative_lift": PLANNED_RELATIVE_LIFT, "visitors_without_order": VISITORS_WITHOUT_ORDER,
        "pre_assignment_only_customers": len(pre_only), "pre_then_post_customers": len(pre_then_post),
        "customers_in_both_variants": len(second_rows),
    }
    return tables, plants


def _timestamps(seconds: list[int]) -> pa.Array:
    return pa.array((np.array(seconds, dtype=np.int64) * 1_000_000).astype("datetime64[us]"), pa.timestamp("us"))


def interval(counts: dict[str, tuple[int, int]]) -> dict:
    """Conversion rates, the lift (a share: 0.0045 is 0.45 points), the relative lift, the unpooled 95% interval (KB-11 P3)."""
    (nc, kc), (nt, kt) = counts[VARIANTS[0]], counts[VARIANTS[1]]
    pc, pt = kc / nc, kt / nt
    se = math.sqrt(pc * (1 - pc) / nc + pt * (1 - pt) / nt)
    diff = pt - pc
    return {"rate": {VARIANTS[0]: round(pc, 6), VARIANTS[1]: round(pt, 6)}, "lift": round(diff, 6),
            "relative_lift": round(diff / pc, 6), "low": round(diff - Z95 * se, 6), "high": round(diff + Z95 * se, 6),
            "z": round(diff / se, 4)}


def mean_interval(stats: dict[str, tuple[int, float, float]]) -> dict:
    """Revenue per assigned customer by variant, its difference, the relative difference and the 95% interval (Welch)."""
    (nc, mc, vc), (nt, mt, vt) = stats[VARIANTS[0]], stats[VARIANTS[1]]
    se = math.sqrt(vc / nc + vt / nt)
    diff = mt - mc
    return {"mean_eur": {VARIANTS[0]: round(mc, 4), VARIANTS[1]: round(mt, 4)}, "lift_eur": round(diff, 4),
            "relative_lift": round(diff / mc, 6), "low": round(diff - Z95 * se, 4), "high": round(diff + Z95 * se, 4),
            "z": round(diff / se, 4)}


def measure(tables: dict[str, pa.Table]) -> dict:
    """The plants as an analyst measures them, in SQL on the two tables."""
    con = _connect({name: tables[name] for name in TABLES})
    try:
        def one(sql: str):
            return con.execute(sql).fetchone()

        single = f"WHERE customer_id NOT IN ({BOTH_SQL})"
        counts = {v: (int(n), int(k)) for v, n, k in con.execute(READOUT_SQL.format(where=single)).fetchall()}
        kept = {v: (int(n), int(k)) for v, n, k in con.execute(READOUT_SQL.format(where="")).fetchall()}
        revenue = {v: (int(n), float(m), float(s)) for v, n, m, s in con.execute(REVENUE_SQL.format(where=single)).fetchall()}
        assigned = dict(con.execute("SELECT variant, count(DISTINCT customer_id) FROM ab_assignments GROUP BY 1 ORDER BY 1").fetchall())
        expected = sum(assigned.values()) / len(VARIANTS)
        before, only_before, before_and_after, repeat, ties = one(f"""
            WITH j AS (SELECT a.customer_id, a.variant, c.converted_at < a.assigned_at AS before, c.converted_at = a.assigned_at AS tie
                       FROM ab_assignments a JOIN ab_conversions c USING (test_id, customer_id) {single})
            SELECT count(*) FILTER (WHERE before),
                   (SELECT count(*) FROM (SELECT customer_id FROM j GROUP BY 1 HAVING bool_and(before))),
                   (SELECT count(*) FROM (SELECT customer_id FROM j GROUP BY 1 HAVING bool_or(before) AND bool_or(NOT before))),
                   (SELECT count(*) FROM (SELECT customer_id FROM j WHERE NOT before GROUP BY 1 HAVING count(*) > 1)),
                   count(*) FILTER (WHERE tie)
            FROM j""")
        return {
            "assigned": {v: int(assigned.get(v, 0)) for v in VARIANTS},
            "srm_chi_square": round(sum((n - expected) ** 2 / expected for n in assigned.values()), 4),
            "customers_in_both_variants": len(con.execute(BOTH_SQL).fetchall()),
            "readout": {v: {"assigned": n, "converted": k} for v, (n, k) in counts.items()},
            "interval_95": interval(counts),
            "interval_95_keeping_both": interval(kept),
            "revenue_per_customer_95": mean_interval(revenue),
            "conversions": tables["ab_conversions"].num_rows,
            "conversions_before_assignment": int(before),
            "customers_converting_only_before_assignment": int(only_before),
            "customers_converting_before_and_after": int(before_and_after),
            "customers_converting_more_than_once": int(repeat),
            "conversions_at_assigned_at": int(ties),
        }
    finally:
        con.close()


def _check(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(f"A/B test: {message}")


def validate(tables: dict[str, pa.Table], orders: pa.Table, order_lines: pa.Table) -> dict:
    """GEN-06 for the A/B test: shape, keys, window, the link to the order data, then the plants. Returns the measures.

    Raises ValueError on the first failed check (explicit raises, not assert, so `python -O` still checks)."""
    a, c = tables["ab_assignments"], tables["ab_conversions"]
    _check(a.schema.equals(ASSIGNMENTS) and c.schema.equals(CONVERSIONS), "the columns are not the planned ones")
    con = _connect({"ab_assignments": a, "ab_conversions": c, "orders": orders, "order_lines": order_lines})
    try:
        def one(sql: str, params: dict | None = None):
            return con.execute(sql, params or {}).fetchone()

        _check(one("SELECT list(DISTINCT test_id) FROM (SELECT test_id FROM ab_assignments UNION ALL SELECT test_id FROM ab_conversions)")[0]
               == [TEST_ID], f"the tables hold another test than {TEST_ID}")
        _check(sorted(one("SELECT list(DISTINCT variant) FROM ab_assignments")[0]) == list(VARIANTS), "the variants are not control and treatment")
        _check(one("SELECT count(*) FROM ab_assignments WHERE test_id IS NULL OR customer_id IS NULL OR variant IS NULL OR assigned_at IS NULL")[0] == 0
               and one("SELECT count(*) FROM ab_conversions WHERE test_id IS NULL OR customer_id IS NULL OR converted_at IS NULL "
                       "OR revenue_eur IS NULL")[0] == 0, "the visible data has missing values")
        _check(one("SELECT count(*) = count(DISTINCT (test_id, customer_id, variant)) FROM ab_assignments")[0]
               and one("SELECT count(*) = count(DISTINCT (test_id, customer_id, converted_at)) FROM ab_conversions")[0], "a key repeats")
        window = {"start": TEST_START, "end": TEST_START + dt.timedelta(TEST_DAYS)}
        _check(one("SELECT count(*) FROM ab_assignments WHERE assigned_at < $start OR assigned_at >= $end", window)[0] == 0
               and one("SELECT count(*) FROM ab_conversions WHERE converted_at < $start OR converted_at >= $end", window)[0] == 0,
               "a row falls outside the test weeks")
        _check(one("SELECT count(*) FROM (SELECT DISTINCT customer_id FROM ab_assignments) "
                   "WHERE customer_id NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL)")[0] == 0,
               "an assigned customer_id has no order")
        _check(one("SELECT count(*) FROM ab_conversions WHERE customer_id NOT IN (SELECT customer_id FROM ab_assignments)")[0] == 0,
               "a converting customer was never assigned")
        web = f"SELECT o.customer_id, o.order_ts, {NET} {WEB_ORDERS_FROM}"
        mine = "SELECT customer_id, converted_at, revenue_eur FROM ab_conversions"
        _check(one(f"SELECT count(*) FROM ({mine} EXCEPT ALL {web})", window)[0] == 0
               and one(f"SELECT count(*) FROM ({web} EXCEPT ALL {mine})", window)[0] == 0,
               "the conversions are not the web orders of the test weeks")
    finally:
        con.close()
    m = measure(tables)
    _check(m["srm_chi_square"] < SRM_CRITICAL, f"sample ratio mismatch {m['assigned']}, chi-square {m['srm_chi_square']}")
    _check(3 <= m["customers_in_both_variants"] <= 10, f"{m['customers_in_both_variants']} customers in both variants, not a handful")
    _check(m["customers_converting_only_before_assignment"] > 0 and m["customers_converting_before_and_after"] > 0,
           "no conversions before assignment")
    for name in ("interval_95", "interval_95_keeping_both"):
        r = m[name]
        _check(r["lift"] > 0 and 0.02 <= r["relative_lift"] <= 0.10, f"the lift is not modest: {r}")
        _check(r["low"] < 0 < r["high"], f"the 95% interval excludes zero: {r}")
    r = m["revenue_per_customer_95"]
    _check(r["low"] < 0 < r["high"], f"revenue per customer: the 95% interval excludes zero: {r}")
    return m

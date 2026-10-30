"""Sprint 8 Part 1, Task A2 (rulings S8-07 and S8-C14): the level 6 edge schemas, voltmarkt_edge_pat, mailvora_edge_pat and
ledgerloop_edge_saas, and ledgerloop_edge_clean, the edge schema of the raw-data items on ledgerloop_raw.

- Each holds every table (and, for Voltmarkt, every view) of the schema it mirrors, under the same names and columns, so every
  table the schema panel shows a level 6 item is there (C52). The build makes Voltmarkt's views over the edge's own tables.
- Each plants S8-07's cases, one test each: a tie at each top-N cutoff a prompt can name (the exact partitions, as at level 5,
  S7-22 and C53); two rows of one key at the same time (dedup); a missing day, week and month, so LAG 12 over months with rows is
  not the same month a year before; a cohort whose later months fall after as_of_date; a user who reaches a funnel step without
  the one before; an event pair across the 2025-10-26 clock change and one exactly 30 minutes apart; two overlapping promotions on
  one product (SQL-PAT-09); and on LedgerLoop an opening-balance account, a contraction, a churn then a reactivation, an annual
  plan's renewal month and a GBP subscription.
- F2 (seam 1, F2-1-1 and F2-1-2): exact 30-minute pairs inside the session items' windows; on Mailvora a short session across UTC
  midnight into each window start a whole-history prompt names; on LedgerLoop events whose Brussels day or month is not their UTC one
  and sessions across UTC and Brussels midnight. Each sits on users outside every other plant and outside EX-SQL-PAT-08-E2-02's.
- Across the LedgerLoop edge, opening MRR plus the month's movements is closing MRR, per month and currency (Review Focus 2), and
  every row follows S8-02's MRR rules. Clean items never meet a duplicate there (S8-C14).
- S8-C14: the subscription event sent twice with the same recorded_at lives in ledgerloop_edge_clean, which mirrors ledgerloop_raw
  (as voltmarkt_edge_clean and mailvora_edge_clean mirror theirs) and holds a case of each of Q-02-01 to Q-02-07. Once cleaned by
  the rules a prompt gives (one row per business key, the currency from the country, no sentinel end date, the clean segment
  spellings, no test account), its rows follow LedgerLoop's rules.
- Every table and view of manifest_before_sprint8.json keeps its rows and hash (Review Focus 1): sprint 8 Part 1 adds LedgerLoop's
  two schemas (Task L1) and these four, and nothing else.
- Each schema's rows follow its company's rules, and its description lists each plant under its tables.

Assertions name schemas, tables, IDs and counts only.
"""
import datetime as dt
import json
import pathlib
import re
import shutil
import tempfile
import unittest
from decimal import ROUND_HALF_UP, Decimal

import duckdb

from course_build import build_course_db   # L50: the paths, and Mailvora and LedgerLoop generated once per process

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(build_course_db.ROOT)
VM = "voltmarkt_edge_pat"
MV = "mailvora_edge_pat"
LL = "ledgerloop_edge_saas"
LLC = "ledgerloop_edge_clean"
MIRRORS = {VM: "voltmarkt", MV: "mailvora", LL: "ledgerloop", LLC: "ledgerloop_raw"}
FAMILIES = {VM: "pat", MV: "pat", LL: "saas", LLC: "clean"}
# Review Focus 1 (Task G0): every table and view as built before sprint 8. Part 1 adds LedgerLoop's clean and raw schemas (Task L1)
# and the four level 6 edge schemas (one each for Voltmarkt and Mailvora, two for LedgerLoop); every other object keeps its rows and
# hash.
BEFORE_SPRINT8 = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint8.json").read_text(encoding="utf-8"))["tables"]
# S8-C31: every table and view as built at the end of Part 1 (0.8.0). Part 2's Task V1 adds four objects to the companies' schemas
# (S8-15, E-212: chain-wide stock and its edge copy; S8-C28, E-215: LedgerLoop's mrr_monthly view and its edge copy).
BEFORE_SPRINT8B = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint8b.json").read_text(encoding="utf-8"))["tables"]
PART2_OBJECTS = {"inventory_chain_daily", "mrr_monthly"}
PART2_ADDS = {"voltmarkt.inventory_chain_daily", "voltmarkt_edge_pat.inventory_chain_daily", "ledgerloop.mrr_monthly",
              "ledgerloop_edge_saas.mrr_monthly"}
VOLTMARKT_VIEWS = {"sales", "competitor_price_weekly", "weekly_units"}
# S8-15's edge plants: a 28-day stock cover question over 1 to 28 December 2024, with the stock on 29 December (04's CASE-RETAIL-04;
# S8-C35: FIND-01-09's month, on the visible data and the edge).
STOCK_WINDOW = ("2024-12-01", "2024-12-28")
STOCK_COVER_DAY = "2024-12-29"
# E-215 worked out in SQL on a schema, apart from the view: per account and month (January 2024 to December 2025) the sum of its
# subscription events' mrr_delta_local up to the month's last day, at each currency's last fx_rates rate on or before 2025-12-31,
# rounded to the cent; a row only when that MRR is above 0.
E215_SQL = """WITH months AS (SELECT CAST(range AS DATE) AS month FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)),
    rate AS (SELECT currency, arg_max(eur_per_unit, rate_date) AS eur FROM {s}.fx_rates WHERE rate_date <= DATE '2025-12-31' GROUP BY 1),
    m AS (SELECT e.account_id, months.month, sum(e.mrr_delta_local * rate.eur) AS mrr
          FROM months JOIN {s}.subscription_events e ON e.event_date <= CAST(months.month + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE)
          JOIN {s}.subscriptions sub ON sub.subscription_id = e.subscription_id JOIN rate ON rate.currency = sub.currency GROUP BY ALL)
    SELECT account_id, month, round(mrr, 2) AS mrr_eur FROM m WHERE mrr > 0"""
YEAR_2025 = "BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'"
CLOCK_CHANGE_UTC = dt.datetime(2025, 10, 26, 1, 0, tzinfo=dt.timezone.utc).timestamp()   # 03:00 CEST becomes 02:00 CET


def ranked(source, order, n):
    """The partitions of `source` (rows of part, id, val) where ROW_NUMBER and RANK, over `order` within each partition, keep
    different rows at the cutoff n: the ties at that cutoff, which a query with the other tie rule meets (S7-22, C53)."""
    return f"""WITH r AS (SELECT part,
                   row_number() OVER (PARTITION BY part ORDER BY val {order}, id) AS rn,
                   rank() OVER (PARTITION BY part ORDER BY val {order}) AS rk
               FROM ({source}))
               SELECT part FROM r GROUP BY part HAVING count(*) FILTER (WHERE rn <= {n}) <> count(*) FILTER (WHERE rk <= {n}) ORDER BY part"""


# The rankings the generator brief names for level 6, as (part, id, val) rows, and where their ties sit: {(order, cutoff): partitions}.
VM_RANKINGS = {
    "revenue within category, 2025": (
        f"""SELECT p.category_id AS part, p.product_id AS id, sum(s.net_revenue_eur) AS val
            FROM {VM}.sales s JOIN {VM}.products p USING (product_id) WHERE s.order_date {YEAR_2025} GROUP BY ALL""",
        {("DESC", 1): [2, 16], ("DESC", 2): [1, 35], ("DESC", 3): [2, 16], ("ASC", 2): [1, 2, 16, 35]}),
    "units within store, 2025": (
        f"""SELECT o.store_id AS part, l.product_id AS id, sum(l.quantity) AS val
            FROM {VM}.order_lines l JOIN {VM}.orders o USING (order_id) WHERE CAST(o.order_ts AS DATE) {YEAR_2025} GROUP BY ALL""",
        {("DESC", 1): [1, 2, 13, 15, 24], ("DESC", 2): [13, 24, 99], ("DESC", 3): [1, 2, 13, 15, 24, 99]}),
    "latest order per customer": (
        f"SELECT customer_id AS part, order_id AS id, order_ts AS val FROM {VM}.orders WHERE customer_id IS NOT NULL",
        {("DESC", 1): [3001, 3002]}),
    "latest competitor check per product": (
        f"SELECT product_id AS part, competitor AS id, observed_ts AS val FROM {VM}.competitor_prices",
        {("DESC", 1): [1, 6]}),
}
MV_RANKINGS = {
    "spend within channel, 2025": (
        f"""SELECT c.channel_id AS part, a.campaign_id AS id, sum(a.spend) AS val
            FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id) WHERE a.spend_date {YEAR_2025} GROUP BY ALL""",
        {("DESC", 1): [1, 3], ("DESC", 2): [2, 6], ("DESC", 3): [1, 3]}),
    "clicks within channel, 2025": (
        f"""SELECT c.channel_id AS part, a.campaign_id AS id, sum(a.clicks) AS val
            FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id) WHERE a.spend_date {YEAR_2025} GROUP BY ALL""",
        {("DESC", 1): [1, 3], ("DESC", 2): [2, 6], ("DESC", 3): [1, 3]}),
    "first session per visitor": (
        f"SELECT visitor_id AS part, session_id AS id, session_start AS val FROM {MV}.sessions",
        {("ASC", 1): ["V9200002", "V9200003"]}),
    "latest activation event per user": (
        f"SELECT user_id AS part, event_name AS id, event_ts AS val FROM {MV}.activation_events",
        {("DESC", 1): [2]}),
}
# MRR on a date: the sum of a subscription's changes up to that date (S8-02), here per account, in euros at that day's rate.
LL_MRR_EUR = """SELECT a.account_id, a.segment, sum(e.mrr_delta_local) * fx.eur_per_unit AS mrr_eur
    FROM {s}.accounts a JOIN {s}.subscriptions s USING (account_id) JOIN {s}.subscription_events e USING (subscription_id)
    JOIN {s}.fx_rates fx ON fx.rate_date = DATE '{d}' AND fx.currency = s.currency
    WHERE e.event_date <= DATE '{d}' GROUP BY a.account_id, a.segment, fx.eur_per_unit"""
LL_RANKINGS = {
    "MRR in euros on 2025-12-31 within segment": (
        f"SELECT segment AS part, account_id AS id, mrr_eur AS val FROM ({LL_MRR_EUR.format(s=LL, d='2025-12-31')})",
        {("DESC", 1): ["Mid-Market", "SMB"], ("DESC", 2): ["Enterprise"], ("DESC", 3): ["SMB"]}),
    "latest event per subscription": (
        f"SELECT subscription_id AS part, event_id AS id, recorded_at AS val FROM {LL}.subscription_events",
        {("DESC", 1): [3]}),
    "earliest lead per email": (
        f"SELECT email AS part, lead_id AS id, created_at AS val FROM {LL}.leads",
        {("ASC", 1): ["finance@kustlijnmedia.example"]}),
}
# Monthly totals with LAG 12 over the months that have rows against the same calendar month a year before: the months where the
# two differ, so a year-over-year key that reads LAG 12 without a spine fails on the edge (S8-07, ERR-LOG-39).
LAG12_DIFFERS = """WITH m AS ({months}),
    by_rows AS (SELECT month, lag(total, 12) OVER (ORDER BY month) AS lagged FROM m)
    SELECT count(*) FROM by_rows r LEFT JOIN m p ON p.month = r.month - INTERVAL 12 MONTH
    WHERE r.month >= DATE '2025-01-01' AND r.lagged IS DISTINCT FROM p.total"""


class EdgePat(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        cls.manifest = build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir)
        cls.con = duckdb.connect(str(cls.dir / "course.duckdb"), read_only=True, config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def one(self, sql, params=None):
        return self.con.execute(sql, params or []).fetchone()

    def col(self, sql, params=None):
        return [r[0] for r in self.con.execute(sql, params or []).fetchall()]

    def names(self, schema):
        tables = set(self.col("SELECT table_name FROM duckdb_tables() WHERE schema_name = ? AND NOT internal", [schema]))
        views = set(self.col("SELECT view_name FROM duckdb_views() WHERE schema_name = ? AND NOT internal", [schema]))
        return tables, views

    def columns(self, schema, table):
        return self.con.execute("SELECT column_name, data_type FROM information_schema.columns "
                                "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position", [schema, table]).fetchall()

    def ties(self, rankings):
        for name, (source, cutoffs) in rankings.items():
            for (order, n), parts in cutoffs.items():
                with self.subTest(ranking=name, order=order, cutoff=n):
                    self.assertEqual(self.col(ranked(source, order, n)), parts, f"{name}: partitions with a tie at the top-{n} cutoff ({order})")

    def epochs(self, sql, params=None):
        """Seconds since 1970 of a TIMESTAMPTZ column, read in SQL (Python reads TIMESTAMPTZ only with a time zone library)."""
        return [float(x) for x in self.col(sql, params)]

    def pairs(self, schema, where, clock="UTC"):
        """Each pair of a user's consecutive events (by event_ts) that `where` keeps, in time order, as (user, the two UTC times, the day
        of each on `clock`, the gap in seconds). `where` reads gap, day and prev_day (F2-1-1, F2-1-2)."""
        table = "activation_events" if schema == MV else "app_events"
        rows = self.con.execute(f"""SELECT user_id, strftime(timezone('UTC', prev_ts), '%Y-%m-%d %H:%M'), strftime(timezone('UTC', event_ts), '%Y-%m-%d %H:%M'),
                                           strftime(prev_day, '%Y-%m-%d'), strftime(day, '%Y-%m-%d'), gap
            FROM (SELECT user_id, event_ts, lag(event_ts) OVER w AS prev_ts, CAST(timezone(?, event_ts) AS DATE) AS day,
                         CAST(timezone(?, lag(event_ts) OVER w) AS DATE) AS prev_day, epoch(event_ts) - epoch(lag(event_ts) OVER w) AS gap
                  FROM {schema}.{table} WINDOW w AS (PARTITION BY user_id ORDER BY event_ts))
            WHERE {where} ORDER BY prev_ts, user_id""", [clock, clock]).fetchall()
        return [(u, a, b, c, d, float(g)) for u, a, b, c, d, g in rows]

    # ---- the schemas, their names and the lock on everything else -------------------------------------------------------------------

    def test_each_schema_has_its_schemas_table_names_and_columns(self):
        for edge, source in MIRRORS.items():
            tables, views = self.names(edge)
            with self.subTest(schema=edge):
                self.assertEqual((tables, views), self.names(source), f"{edge} has {source}'s table and view names")
                for t in tables | views:
                    self.assertEqual(self.columns(edge, t), self.columns(source, t), f"{edge}.{t} mirrors {source}.{t}")
                for t in sorted(tables | views):
                    self.assertGreaterEqual(self.one(f"SELECT count(*) FROM {edge}.{t}")[0], 1, f"{edge}.{t} has rows")
        self.assertEqual(self.names(VM)[1], VOLTMARKT_VIEWS, "the build's three views, over the edge's own tables")
        self.assertEqual((self.names(MV)[1], self.names(LLC)[1]), (set(), set()), "Mailvora and ledgerloop_raw have no view")
        self.assertEqual(self.names(LL)[1], {"mrr_monthly"}, "LedgerLoop's one view (E-215), over the edge's own tables")

    def test_every_object_before_sprint8_is_unchanged_and_part_1_only_adds_six_schemas(self):
        self.assertEqual(len(BEFORE_SPRINT8), 253)
        moved = sorted(name for name, entry in BEFORE_SPRINT8.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects built before sprint 8 whose rows or hash changed")
        # Part 1's additions, as manifest_before_sprint8b.json holds them; Part 2's are held by the test below.
        added = sorted((set(self.manifest["tables"]) & set(BEFORE_SPRINT8B)) - set(BEFORE_SPRINT8))
        ledgerloop = [f"{s}.{t}" for s in ("ledgerloop", "ledgerloop_raw") for t in build_course_db.ll.CLEAN_TABLES]
        edges = [f"{edge}.{t}" for edge, source in MIRRORS.items() for t in set().union(*self.names(source)) - PART2_OBJECTS]
        self.assertEqual(added, sorted(ledgerloop + edges), "L1's two LedgerLoop schemas and the four level 6 edge schemas are new")
        self.assertEqual(len(edges), 16 + 11 + 16 + 16)
        for name in ledgerloop:
            self.assertEqual(len(self.manifest["tables"][name]["sha256"]), 64, name)

    def test_every_object_of_part_1_is_unchanged_and_part_2_adds_four(self):
        # S8-C31: Part 1's 344 objects keep their rows and hash (a view its SQL text). In the companies' schemas, Task V1 adds the four
        # objects of S8-15 and S8-C28 and nothing else; the real datasets' schemas are their own tasks'.
        self.assertEqual(len(BEFORE_SPRINT8B), 344)
        moved = sorted(name for name, entry in BEFORE_SPRINT8B.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects of Part 1 whose rows or hash changed")
        companies = tuple(build_course_db.MANIFEST_PREFIXES)
        # Task E1 (S8-C39): ledgerloop_edge_cases, the six LedgerLoop inbox cases' edge schema, is held by pipeline/tests/test_edge_cases.py.
        added = sorted(n for n in set(self.manifest["tables"]) - set(BEFORE_SPRINT8B)
                       if n.split(".")[0].startswith(companies) and n.split(".")[0] != "ledgerloop_edge_cases")
        self.assertEqual(added, sorted(PART2_ADDS), "voltmarkt's chain-wide stock and LedgerLoop's mrr_monthly, each with its edge copy")
        for name in ("voltmarkt.inventory_chain_daily", f"{VM}.inventory_chain_daily"):
            self.assertEqual(len(self.manifest["tables"][name]["sha256"]), 64, name)
        for name in ("ledgerloop.mrr_monthly", f"{LL}.mrr_monthly"):
            self.assertEqual(len(self.manifest["tables"][name]["view_sql_sha256"]), 64, name)
            self.assertGreater(self.manifest["tables"][name]["rows"], 0, name)

    def test_the_build_gives_the_voltmarkt_edge_its_views_and_lists_every_schema(self):
        self.assertIn(VM, build_course_db.WEEKLY_UNITS_SCHEMAS, "its items see weekly_units in the panel from level 4 (P11)")
        self.assertNotIn(VM, build_course_db.RAW_EDGE_SCHEMAS, "it mirrors the clean voltmarkt, so it gets its views")
        self.assertIn(LLC, build_course_db.RAW_EDGE_SCHEMAS, "S8-C14: it mirrors ledgerloop_raw, as mailvora_edge_clean mirrors mailvora_raw")
        self.assertNotIn(LL, build_course_db.RAW_EDGE_SCHEMAS)
        units, lines = self.one(f"SELECT (SELECT sum(units) FROM {VM}.weekly_units), (SELECT sum(quantity) FROM {VM}.order_lines)")
        self.assertEqual(units, lines, "weekly_units adds up to the order lines' units")
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted({n["table"] for n in notes if n["schema"] == VM}), sorted(VOLTMARKT_VIEWS), "notes for its views only")
        self.assertFalse([n for n in notes if n["schema"] in (MV, LL, LLC)], "an edge schema has no table notes")
        checkpoints = json.loads((self.dir / "truth" / "checkpoints.json").read_text(encoding="utf-8"))
        self.assertTrue(set(MIRRORS) <= set(checkpoints["schemas"]), "the schemas built, which say what a case can run on (S6-13)")

    # ---- S8-07 on voltmarkt_edge_pat (one test per plant) ---------------------------------------------------------------------------

    def test_vm_a_tie_at_each_top_n_cutoff(self):
        self.ties(VM_RANKINGS)
        first = self.col(f"""SELECT product_id FROM (SELECT product_id, sum(net_revenue_eur) AS revenue FROM {VM}.sales
                                 WHERE order_date {YEAR_2025} GROUP BY 1) QUALIFY rank() OVER (ORDER BY revenue DESC) = 1 ORDER BY 1""")
        self.assertEqual(first, [1, 2], "revenue in 2025 with no partition: products 1 and 2 tie for first, and no other product")

    def test_vm_two_rows_of_one_key_at_the_same_time(self):
        moment = self.col(f"""SELECT customer_id FROM {VM}.orders WHERE customer_id IS NOT NULL
                              GROUP BY customer_id, order_ts HAVING count(*) > 1 ORDER BY 1""")
        self.assertEqual(moment, [3001, 3002], "two customers with two orders at the same moment, their latest")
        checks = self.col(f"SELECT product_id FROM {VM}.competitor_prices GROUP BY product_id, observed_ts HAVING count(*) > 1 ORDER BY 1")
        self.assertEqual(checks, [1, 6], "two products checked by both competitors at the same moment, their latest check")

    def test_vm_a_missing_day_week_and_month(self):
        months = [str(m) for m in self.col(f"SELECT DISTINCT CAST(date_trunc('month', order_ts) AS DATE) FROM {VM}.orders ORDER BY 1")]
        self.assertEqual(len(months), 23, "orders in every month of 2024 and 2025 but one")
        self.assertNotIn("2024-09-01", months, "no order in September 2024")
        self.assertEqual(self.one(f"SELECT count(*) FROM {VM}.calendar")[0], 731, "the calendar holds every day of 2024 and 2025, so a spine shows it")
        weeks = [str(w) for w in self.col(f"""SELECT DISTINCT CAST(date_trunc('week', order_ts) AS DATE) FROM {VM}.orders
                                             WHERE order_ts >= TIMESTAMP '2025-03-03' AND order_ts < TIMESTAMP '2025-03-24' ORDER BY 1""")]
        self.assertEqual(weeks, ["2025-03-03", "2025-03-17"], "no order in the week of 10 March 2025, between two weeks with orders")
        days = [str(d) for d in self.col(f"""SELECT DISTINCT CAST(order_ts AS DATE) FROM {VM}.orders WHERE store_id = 1
                                            AND order_ts >= TIMESTAMP '2025-03-03' AND order_ts < TIMESTAMP '2025-03-08' ORDER BY 1""")]
        self.assertEqual(days, ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-07"], "store NL-01 skips 6 March 2025 in a run of days")
        revenue = f"SELECT CAST(date_trunc('month', order_date) AS DATE) AS month, sum(net_revenue_eur) AS total FROM {VM}.sales GROUP BY 1"
        self.assertGreater(self.one(LAG12_DIFFERS.format(months=revenue))[0], 0, "LAG 12 over the months with orders is not the month a year before")

    def test_vm_a_cohort_whose_later_months_fall_after_as_of_date(self):
        first = dict(self.con.execute(f"""SELECT customer_id, CAST(date_trunc('month', min(order_ts)) AS DATE) FROM {VM}.orders
                                          WHERE customer_id IS NOT NULL GROUP BY 1""").fetchall())
        late = sorted(c for c, m in first.items() if m >= dt.date(2025, 11, 1))
        self.assertEqual(late, [3010, 3011], "customers first ordering in November and December 2025: their months from January 2026 "
                                             "end after the as-of date, 2026-01-05")
        gap = self.con.execute(f"""SELECT CAST(order_ts AS DATE) FROM {VM}.orders WHERE customer_id = 3012 ORDER BY 1""").fetchall()
        self.assertEqual([str(d) for (d,) in gap], ["2025-01-31", "2025-03-01"],
                         "a customer whose second order is two calendar months after the first but only 29 days later (ERR-LOG-46)")

    def test_vm_two_overlapping_promotions_on_one_product(self):
        pairs = self.con.execute(f"""SELECT a.promo_id, b.promo_id, pa.product_id FROM {VM}.promotions a
            JOIN {VM}.promotion_products pa ON pa.promo_id = a.promo_id
            JOIN {VM}.promotion_products pb ON pb.product_id = pa.product_id AND pb.promo_id > pa.promo_id
            JOIN {VM}.promotions b ON b.promo_id = pb.promo_id
            WHERE a.start_date <= b.end_date AND b.start_date <= a.end_date""").fetchall()
        self.assertEqual(pairs, [(2, 3, 21)], "promotions 2 and 3 overlap on product 21, and no other pair does")
        fan_out = self.one(f"""SELECT count(*) FROM {VM}.sales s JOIN {VM}.promotion_products pp ON pp.product_id = s.product_id
                               JOIN {VM}.promotions pr ON pr.promo_id = pp.promo_id AND s.order_date BETWEEN pr.start_date AND pr.end_date
                               WHERE s.product_id = 21 AND s.order_date BETWEEN DATE '2025-04-18' AND DATE '2025-04-20'""")[0]
        self.assertEqual(fan_out, 2, "a line sold in the overlap meets both promotions in a date-range join (ERR-LOG-01)")
        baseline = self.one(f"""SELECT count(*) FROM {VM}.sales s JOIN {VM}.promotions pr ON pr.promo_id = 2
                                WHERE s.product_id IN (20, 21) AND s.order_date BETWEEN pr.start_date - 14 AND pr.start_date - 1""")[0]
        self.assertEqual(baseline, 2, "products 20 and 21 sold in the 14 days before promotion 2, a baseline to compare with")

    # ---- S8-15 (E-212), S8-C35 on voltmarkt_edge_pat: a 28-day stock cover question, 1 to 28 December 2024, the stock on 29 December

    def stock_days(self):
        """Each store and product's days of the window on a date spine: (store, product, day, closing stock, units sold that day)."""
        return self.con.execute(f"""
            WITH spine AS (SELECT CAST(range AS DATE) AS d FROM range(DATE '{STOCK_WINDOW[0]}', DATE '{STOCK_WINDOW[1]}' + 1, INTERVAL 1 DAY)),
            sold AS (SELECT o.store_id, l.product_id, CAST(o.order_ts AS DATE) AS d, sum(l.quantity) AS units
                     FROM {VM}.order_lines l JOIN {VM}.orders o USING (order_id) GROUP BY ALL)
            SELECT i.store_id, i.product_id, spine.d, i.units_on_hand, coalesce(s.units, 0)
            FROM spine JOIN {VM}.inventory_chain_daily i ON i.snapshot_date = spine.d
            LEFT JOIN sold s ON s.store_id = i.store_id AND s.product_id = i.product_id AND s.d = spine.d ORDER BY 1, 2, 3""").fetchall()

    def stock_cover(self):
        """04's CASE-RETAIL-04 per store and product: (in-stock days, units sold on them, units sold on every day, stock on the cover day).
        A day is in stock when it closes with stock (04's answer key)."""
        out = {}
        for store, product, _, on_hand, units in self.stock_days():
            days, sold_in_stock, sold = out.get((store, product), (0, 0, 0))
            out[(store, product)] = (days + (on_hand > 0), sold_in_stock + (units if on_hand > 0 else 0), sold + units)
        cover_day = dict(((s, p), u) for s, p, u in self.con.execute(
            f"SELECT store_id, product_id, units_on_hand FROM {VM}.inventory_chain_daily WHERE snapshot_date = DATE '{STOCK_COVER_DAY}'").fetchall())
        return {k: (*v, cover_day[k]) for k, v in out.items()}

    def test_vm_stock_rows_follow_voltmarkts_rules(self):
        rows, keys, first, last, pairs = self.one(f"""SELECT count(*), count(DISTINCT (snapshot_date, store_id, product_id)), min(snapshot_date),
                                                            max(snapshot_date), count(DISTINCT (store_id, product_id)) FROM {VM}.inventory_chain_daily""")
        self.assertEqual(rows, keys, "one row per snapshot date, store and product")
        self.assertEqual((str(first), str(last), rows), ("2024-12-01", "2024-12-31", 31 * pairs), "every day of December 2024 for each pair")
        self.assertEqual(self.one(f"SELECT count(*) FROM {VM}.inventory_chain_daily WHERE store_id = 99 OR store_id NOT IN (SELECT store_id FROM {VM}.stores)")[0], 0,
                         "physical stores of the edge only, as in voltmarkt")
        self.assertEqual(self.one(f"SELECT count(*) FROM {VM}.inventory_chain_daily WHERE product_id NOT IN (SELECT product_id FROM {VM}.products)")[0], 0)
        moves = self.con.execute(f"""
            WITH sold AS (SELECT o.store_id, l.product_id, CAST(o.order_ts AS DATE) AS d, sum(l.quantity) AS units
                          FROM {VM}.order_lines l JOIN {VM}.orders o USING (order_id) GROUP BY ALL),
            m AS (SELECT i.*, lag(i.units_on_hand) OVER (PARTITION BY i.store_id, i.product_id ORDER BY i.snapshot_date) AS prev, coalesce(s.units, 0) AS sold
                  FROM {VM}.inventory_chain_daily i LEFT JOIN sold s ON s.store_id = i.store_id AND s.product_id = i.product_id AND s.d = i.snapshot_date)
            SELECT list(store_id || '/' || product_id || '/' || strftime(snapshot_date, '%Y-%m-%d') ORDER BY snapshot_date)
                       FILTER (WHERE prev IS NOT NULL AND units_on_hand - prev + sold < 0),
                   count(*) FILTER (WHERE units_on_hand < 0), count(*) FILTER (WHERE units_on_hand = 0 AND sold > 0),
                   list(store_id || '/' || product_id || '/' || strftime(snapshot_date, '%Y-%m-%d') ORDER BY snapshot_date)
                       FILTER (WHERE prev IS NOT NULL AND units_on_hand - prev + sold > 0)
            FROM m""").fetchone()
        self.assertEqual(moves[0], ["24/2/2024-12-14"],
                         "stock falls only by the units sold, but for LU-01's product 2 units sent back on 14 December, as in voltmarkt's FIND-01-09")
        self.assertEqual(moves[1:3], (0, 0), "never below 0, and no sale on a day that closes with none")
        self.assertEqual(moves[3], ["24/2/2024-12-29"], "one delivery, on the cover day")
        inside = self.one(f"""SELECT min(order_ts) < TIMESTAMP '{STOCK_WINDOW[0]}' AND max(order_ts) > TIMESTAMP '{STOCK_COVER_DAY}' FROM {VM}.orders""")[0]
        self.assertTrue(inside, "the window lies inside the edge's own order dates")
        categories = self.col(f"""SELECT DISTINCT c.category_name FROM {VM}.inventory_chain_daily i JOIN {VM}.products p USING (product_id)
                                  JOIN {VM}.categories c USING (category_id) ORDER BY 1""")
        self.assertEqual(categories, ["Cables", "TVs 50-55 inch", "TVs up to 43 inch"], "other categories: the edge holds no console or controller")

    def test_vm_stock_a_stockout_day_inside_the_window_and_sales_on_the_in_stock_days(self):
        days = [(s, p, str(d), on_hand, units) for s, p, d, on_hand, units in self.stock_days()]
        out = sorted({(s, p) for s, p, _, on_hand, _ in days if on_hand == 0})
        self.assertEqual(out, [(24, 2)], "one pair is out of stock on days of the window")
        self.assertEqual([d for s, p, d, on_hand, _ in days if (s, p) == (24, 2) and on_hand == 0],
                         [f"2024-12-{d}" for d in range(14, 29)], "LU-01 and product 2 are out of stock from 14 to 28 December")
        self.assertEqual([(d, on_hand > 0) for s, p, d, on_hand, units in days if (s, p) == (24, 2) and units], [("2024-12-10", True)],
                         "and sell on 10 December, an in-stock day")
        in_stock, sold_in_stock, sold, _ = self.stock_cover()[(24, 2)]
        self.assertEqual((in_stock, sold_in_stock, sold), (13, 1, 1))
        self.assertNotEqual(7 * sold / 28, 7 * sold_in_stock / in_stock, "a rate over every day differs from one over the in-stock days")

    def test_vm_stock_a_product_with_days_of_no_sales(self):
        days = self.stock_days()
        sold = [str(d) for s, p, d, _, units in days if (s, p) == (24, 18) and units]
        self.assertEqual(sold, ["2024-12-10"], "LU-01 sells product 18 on one day of the window")
        self.assertEqual(len([d for s, p, d, _, _ in days if (s, p) == (24, 18)]), 28, "so 27 days of the spine have no sale")
        in_stock, sold_in_stock, _, on_hand = self.stock_cover()[(24, 18)]
        self.assertEqual((in_stock, sold_in_stock, on_hand), (28, 1, 3))
        self.assertLess(on_hand / 7.0, 2, "an average over its sales days alone puts it under 2 weeks of cover")
        self.assertEqual(on_hand / (7.0 * sold_in_stock / in_stock), 12.0, "an average over every day of the spine does not")

    def test_vm_stock_a_pair_whose_cover_sits_just_under_two_weeks(self):
        cover = self.stock_cover()
        in_stock_rate = {k: (on_hand / (7.0 * s / n) if s else None) for k, (n, s, _, on_hand) in cover.items()}
        every_day_rate = {k: (on_hand / (7.0 * s / 28) if s else None) for k, (_, _, s, on_hand) in cover.items()}
        under = sorted(k for k, c in in_stock_rate.items() if c is not None and c < 2)
        self.assertEqual(under, [(24, 2)], "one pair under 2 weeks of cover at the in-stock rate")
        self.assertTrue(1.8 <= in_stock_rate[(24, 2)] < 2, "just under 2 weeks")
        self.assertEqual(sorted(k for k, c in every_day_rate.items() if c is not None and c < 2), [], "and none at the rate over every day")
        self.assertEqual(every_day_rate[(24, 2)], 4.0, "which puts it well over 2 weeks")
        none = sorted(k for k, (_, _, s, _) in cover.items() if s == 0)
        self.assertEqual(none, [(1, 14), (13, 11), (15, 12)], "three pairs sell nothing in the window, so their rate is 0")
        early = self.one(f"""SELECT count(*) FROM {VM}.orders o JOIN {VM}.order_lines l USING (order_id)
                             WHERE o.store_id = 13 AND l.product_id = 11 AND CAST(o.order_ts AS DATE) = DATE '2024-11-26'""")[0]
        self.assertEqual(early, 1, "NL-13 sells product 11 on 26 November, before the window")

    # ---- voltmarkt_edge_pat follows Voltmarkt's rules ----------------------------------------------------------------------------

    def test_vm_lines_follow_e103_and_orders_follow_their_store(self):
        bad = self.one(f"""
            WITH l AS (SELECT ol.*, CAST(o.order_ts AS DATE) AS d FROM {VM}.order_lines ol JOIN {VM}.orders o USING (order_id)),
            deepest AS (SELECT l.order_line_id, max(pr.discount_pct) AS pct FROM l JOIN {VM}.promotion_products pp ON pp.product_id = l.product_id
                        JOIN {VM}.promotions pr ON pr.promo_id = pp.promo_id AND l.d BETWEEN pr.start_date AND pr.end_date GROUP BY 1)
            SELECT
              count(*) FILTER (WHERE l.unit_price_eur IS DISTINCT FROM (SELECT ph.list_price_eur FROM {VM}.price_history ph
                                WHERE ph.product_id = l.product_id AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to))),
              count(*) FILTER (WHERE l.promo_id IS NOT NULL AND l.line_discount_eur IS DISTINCT FROM
                                (SELECT round(l.quantity * l.unit_price_eur * pr.discount_pct / 100, 2) FROM {VM}.promotions pr
                                 JOIN {VM}.promotion_products pp ON pp.promo_id = pr.promo_id AND pp.product_id = l.product_id
                                 WHERE pr.promo_id = l.promo_id AND l.d BETWEEN pr.start_date AND pr.end_date)),
              count(*) FILTER (WHERE l.promo_id IS NULL AND (l.line_discount_eur <> 0 OR d.pct IS NOT NULL)),
              count(*) FILTER (WHERE l.promo_id IS NOT NULL AND (SELECT discount_pct FROM {VM}.promotions WHERE promo_id = l.promo_id) <> d.pct),
              count(*) FILTER (WHERE l.d < (SELECT launch_date FROM {VM}.products p WHERE p.product_id = l.product_id)),
              count(*) FILTER (WHERE l.promo_id IS NOT NULL)
            FROM l LEFT JOIN deepest d USING (order_line_id)""")
        self.assertEqual(bad[:5], (0, 0, 0, 0, 0), "lines off the list price, off their promotion, sold in a promotion without it, "
                                                     "not on the deepest promotion that day, or before launch")
        self.assertEqual(bad[5], 4, "four lines on promotion")
        stores = self.one(f"""SELECT count(*) FROM {VM}.orders o JOIN {VM}.stores st USING (store_id)
                              WHERE (o.channel = 'web') <> (st.store_id = 99) OR (o.channel = 'store' AND o.ship_to_country <> st.country_code)
                                 OR CAST(o.order_ts AS DATE) < st.opened_on OR CAST(o.order_ts AS DATE) > st.close_date""")[0]
        self.assertEqual(stores, 0, "orders follow their store (E-016, open dates)")
        foreign = self.one(f"SELECT count(*) FROM (SELECT * FROM {VM}.stores EXCEPT SELECT * FROM voltmarkt.stores)")[0]
        self.assertEqual(foreign, 0, "each store is voltmarkt's")
        orphans = self.one(f"""SELECT (SELECT count(*) FROM {VM}.order_lines WHERE order_id NOT IN (SELECT order_id FROM {VM}.orders)),
                                      (SELECT count(*) FROM {VM}.orders WHERE order_id NOT IN (SELECT order_id FROM {VM}.order_lines)),
                                      (SELECT count(*) FROM {VM}.products WHERE category_id NOT IN (SELECT category_id FROM {VM}.categories)),
                                      (SELECT count(*) FROM {VM}.order_lines WHERE product_id NOT IN (SELECT product_id FROM {VM}.products)),
                                      (SELECT count(*) FROM {VM}.promotion_products WHERE product_id NOT IN (SELECT product_id FROM {VM}.products))""")
        self.assertEqual(orphans, (0, 0, 0, 0, 0), "every line has its order and product, every order its lines, every product its category")
        ordered = self.one(f"SELECT count(*) FROM (SELECT order_id, lag(order_ts) OVER (ORDER BY order_id) AS p, order_ts FROM {VM}.orders) WHERE p > order_ts")[0]
        self.assertEqual(ordered, 0, "orders are numbered in time order")

    def test_vm_versions_the_calendar_and_the_ab_test_follow_voltmarkts_rules(self):
        for table in ("price_history", "cost_history"):
            bad = self.one(f"""SELECT count(*) FROM (SELECT product_id, valid_from, valid_to,
                                   lead(valid_from) OVER (PARTITION BY product_id ORDER BY valid_from) AS nxt,
                                   min(valid_from) OVER (PARTITION BY product_id) AS first FROM {VM}.{table}) h
                               JOIN {VM}.products p USING (product_id)
                               WHERE (nxt IS NULL) <> (valid_to IS NULL) OR valid_to + 1 <> nxt OR first <> p.launch_date""")[0]
            with self.subTest(table=table):
                self.assertEqual(bad, 0, f"{table}: versions start at launch and are contiguous")
                missing = self.one(f"SELECT count(*) FROM {VM}.products WHERE product_id NOT IN (SELECT product_id FROM {VM}.{table})")[0]
                self.assertEqual(missing, 0, f"every product has a {table} version")
        # S6-07: the Audio products' cost rises 8% (half up) from 2025-07-01; every other product keeps its cost.
        audio = self.one(f"""SELECT count(*) FROM {VM}.products p JOIN {VM}.categories c USING (category_id)
            WHERE (c.parent_category = 'Audio') <> EXISTS (SELECT 1 FROM {VM}.cost_history h WHERE h.product_id = p.product_id
                   AND h.valid_from = DATE '2025-07-01' AND h.unit_cost_eur = round(p.unit_cost_eur * 1.08, 2))
               OR (SELECT count(*) FROM {VM}.cost_history h WHERE h.product_id = p.product_id) <> CASE WHEN c.parent_category = 'Audio' THEN 2 ELSE 1 END""")[0]
        self.assertEqual(audio, 0, "Audio products' cost rises 8% from 2025-07-01, the others keep theirs")
        self.assertEqual(self.one(f"SELECT count(*) FROM {VM}.products WHERE launch_date IS NULL")[0], 0, "every product has a launch date")
        foreign = self.one(f"SELECT count(*) FROM (SELECT * FROM {VM}.calendar EXCEPT SELECT * FROM voltmarkt.calendar)")[0]
        self.assertEqual(foreign, 0, "each calendar row is voltmarkt's row for that day")
        categories = self.one(f"SELECT count(*) FROM (SELECT * FROM {VM}.categories EXCEPT SELECT * FROM voltmarkt.categories)")[0]
        self.assertEqual(categories, 0, "each category is voltmarkt's")
        # The A/B test (sprint 5a): customers assigned in its two weeks, and each conversion is a web order of theirs then, at its revenue.
        ab = self.one(f"""SELECT
            (SELECT count(*) FROM {VM}.ab_assignments WHERE assigned_at < TIMESTAMP '2025-09-01' OR assigned_at >= TIMESTAMP '2025-09-15'),
            (SELECT count(*) FROM {VM}.ab_conversions c WHERE NOT EXISTS (SELECT 1 FROM {VM}.orders o WHERE o.customer_id = c.customer_id
                 AND o.order_ts = c.converted_at AND o.channel = 'web'
                 AND c.revenue_eur = (SELECT sum(net_revenue_eur) FROM {VM}.sales s WHERE s.order_id = o.order_id))),
            (SELECT count(*) FROM {VM}.ab_conversions c WHERE c.customer_id NOT IN (SELECT customer_id FROM {VM}.ab_assignments))""")
        self.assertEqual(ab, (0, 0, 0), "A/B rows inside the test weeks, each conversion one of the customer's web orders")

    # ---- S8-07 on mailvora_edge_pat (one test per plant) ---------------------------------------------------------------------------

    def test_mv_a_tie_at_each_top_n_cutoff(self):
        self.ties(MV_RANKINGS)

    def test_mv_two_rows_of_one_key_at_the_same_time(self):
        visitors = self.col(f"SELECT visitor_id FROM {MV}.sessions GROUP BY visitor_id, session_start HAVING count(*) > 1 ORDER BY 1")
        self.assertEqual(visitors, ["V9200002", "V9200003"], "two visitors with two sessions at the same moment, their first, from two channels")
        users = self.col(f"SELECT user_id FROM {MV}.activation_events GROUP BY user_id, event_ts HAVING count(*) > 1 ORDER BY 1")
        self.assertEqual(users, [2], "a user with two activation events at the same moment, their latest")

    def test_mv_a_missing_day_week_and_month(self):
        months = [str(m) for m in self.col(f"SELECT DISTINCT CAST(date_trunc('month', spend_date) AS DATE) FROM {MV}.ad_spend_daily ORDER BY 1")]
        self.assertEqual(len(months), 23, "ad spend in every month of 2024 and 2025 but one")
        self.assertNotIn("2024-06-01", months, "no ad spend in June 2024")
        spine = self.one(f"SELECT count(*) FROM {MV}.budget_monthly WHERE month = DATE '2024-06-01'")[0]
        self.assertEqual(spine, 7, "budget_monthly holds June 2024 for every paid channel, so a month spine shows it")
        channel_1 = self.one(f"""SELECT count(DISTINCT date_trunc('month', a.spend_date)) FROM {MV}.ad_spend_daily a
                                 JOIN {MV}.campaigns c USING (campaign_id) WHERE c.channel_id = 1""")[0]
        self.assertEqual(channel_1, 23, "nonbrand search spends in every month but June 2024, so its own series has the gap")
        days = [str(d) for d in self.col(f"""SELECT spend_date FROM {MV}.ad_spend_daily WHERE campaign_id = 1
                                            AND spend_date BETWEEN DATE '2025-03-03' AND DATE '2025-03-09' ORDER BY 1""")]
        self.assertEqual(days, ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-07", "2025-03-08", "2025-03-09"],
                         "campaign 1 skips 6 March 2025 in a run of days")
        week = self.one(f"SELECT count(*) FROM {MV}.ad_spend_daily WHERE spend_date BETWEEN DATE '2025-03-10' AND DATE '2025-03-16'")[0]
        between = self.one(f"""SELECT count(*) FILTER (WHERE spend_date < DATE '2025-03-10'), count(*) FILTER (WHERE spend_date > DATE '2025-03-16')
                               FROM {MV}.ad_spend_daily WHERE spend_date BETWEEN DATE '2025-03-03' AND DATE '2025-03-23'""")
        self.assertEqual((week, min(between) > 0), (0, True), "no spend in the week of 10 March 2025, between two weeks with spend")
        spend = f"SELECT CAST(date_trunc('month', spend_date) AS DATE) AS month, sum(spend) AS total FROM {MV}.ad_spend_daily GROUP BY 1"
        self.assertGreater(self.one(LAG12_DIFFERS.format(months=spend))[0], 0, "LAG 12 over the months with spend is not the month a year before")

    def test_mv_a_cohort_whose_later_months_fall_after_as_of_date(self):
        late = self.col(f"SELECT user_id FROM {MV}.signups WHERE signup_ts >= TIMESTAMPTZ '2025-11-01 00:00:00+00' ORDER BY 1")
        self.assertEqual(late, [11, 12], "users who signed up in November and December 2025: their months from January 2026 end "
                                         "after the as-of date, 2026-01-05")
        paid = self.col(f"""SELECT DISTINCT p.subscription_id FROM {MV}.payments p JOIN {MV}.subscriptions s USING (subscription_id)
                            WHERE s.user_id IN (11, 12) ORDER BY 1""")
        self.assertEqual(len(paid), 2, "and both pay, so their early cells hold a value")
        # ERR-LOG-46 and ERR-LOG-50: user 4 signs up on 31 January 2025 and first pays on 1 March, 29 days later: month 2 by calendar
        # months, month 0 by days over 30, and another cohort by the first payment's month.
        signup, first_paid = self.one(f"""SELECT CAST(u.signup_ts AS DATE), (SELECT CAST(min(p.paid_at) AS DATE) FROM {MV}.payments p
                                              JOIN {MV}.subscriptions s USING (subscription_id) WHERE s.user_id = u.user_id)
                                          FROM {MV}.signups u WHERE u.user_id = 4""")
        self.assertEqual((str(signup), str(first_paid)), ("2025-01-31", "2025-03-01"))
        # A mature empty cell: a subscription that ends, so its cohort's later months hold 0, not missing.
        ended = self.col(f"SELECT subscription_id FROM {MV}.subscriptions WHERE end_date IS NOT NULL ORDER BY 1")
        self.assertEqual(ended, [3, 5, 6], "three subscriptions that ended before the as-of date")

    def test_mv_a_user_who_reaches_a_funnel_step_without_the_one_before(self):
        unactivated = self.col(f"""SELECT DISTINCT s.user_id FROM {MV}.subscriptions s WHERE NOT EXISTS (SELECT 1 FROM {MV}.activation_events a
                                   WHERE a.user_id = s.user_id AND a.event_name = 'first_campaign_sent') ORDER BY 1""")
        self.assertEqual(unactivated, [6], "a user who pays without ever being activated")
        early = self.col(f"""SELECT DISTINCT s.user_id FROM {MV}.subscriptions s JOIN {MV}.payments p USING (subscription_id)
            WHERE p.paid_at < (SELECT min(a.event_ts) FROM {MV}.activation_events a WHERE a.user_id = s.user_id AND a.event_name = 'first_campaign_sent')
            ORDER BY 1""")
        self.assertEqual(early, [7], "a user who pays before being activated, so a funnel in order counts that user later")
        idle = self.col(f"""SELECT u.user_id FROM {MV}.signups u WHERE u.user_id IN (SELECT user_id FROM {MV}.activation_events)
                            AND u.user_id NOT IN (SELECT user_id FROM {MV}.subscriptions) ORDER BY 1""")
        self.assertEqual(idle, [8], "an activated user who never pays")

    def test_mv_an_event_pair_across_the_clock_change_and_one_exactly_30_minutes_apart(self):
        times = self.epochs(f"""SELECT epoch(event_ts) FROM {MV}.activation_events WHERE user_id = 10
                                AND event_ts BETWEEN TIMESTAMPTZ '2025-10-25 23:00:00+00' AND TIMESTAMPTZ '2025-10-26 03:00:00+00' ORDER BY 1""")
        self.assertEqual(len(times), 2, "user 10 has two events in the night of the clock change")
        self.assertTrue(times[0] < CLOCK_CHANGE_UTC <= times[1], "one before 01:00 UTC, one after")
        self.assertEqual(times[1] - times[0], 35 * 60, "35 minutes apart in UTC, so two sessions under a 30-minute gap")
        local = self.col(f"""SELECT strftime(timezone('Europe/Amsterdam', event_ts), '%H:%M') FROM {MV}.activation_events WHERE user_id = 10
                             AND event_ts BETWEEN TIMESTAMPTZ '2025-10-25 23:00:00+00' AND TIMESTAMPTZ '2025-10-26 03:00:00+00' ORDER BY event_ts""")
        self.assertEqual(local, ["02:45", "02:20"], "on the user's wall clock (NL) the later event looks 25 minutes earlier")
        # F2-1-2: a second exact pair inside EX-SQL-PAT-08-E1-22's day (26 October), on a user outside every other plant.
        self.assertEqual(self.pairs(MV, "gap BETWEEN 1790 AND 1810"),
                         [(10, "2025-10-14 09:00", "2025-10-14 09:30", "2025-10-14", "2025-10-14", 1800.0),
                          (9, "2025-10-26 09:00", "2025-10-26 09:30", "2025-10-26", "2025-10-26", 1800.0)],
                         "two pairs of a user's events exactly 30 minutes apart, on 14 and 26 October 2025 (UTC days)")

    def test_mv_a_session_across_utc_midnight_into_each_window_start(self):
        # F2-1-1: one short session across UTC midnight into each window start the level 6 session prompts name (1 January, 1 October
        # and 13 October 2025), so working the gaps out over the whole history and filtering the window first give other counts. User 9
        # starts a second session later on 1 October, so a window-only count gives that user two session starts that day.
        self.assertEqual(self.pairs(MV, "gap <= 1800 AND day <> prev_day"),
                         [(1, "2024-12-31 23:50", "2025-01-01 00:10", "2024-12-31", "2025-01-01", 1200.0),
                          (9, "2025-09-30 23:50", "2025-10-01 00:10", "2025-09-30", "2025-10-01", 1200.0),
                          (1, "2025-10-12 23:50", "2025-10-13 00:10", "2025-10-12", "2025-10-13", 1200.0)],
                         "three sessions that start before UTC midnight and go on past it, each into a window's first day")
        later = self.col(f"""SELECT strftime(timezone('UTC', event_ts), '%H:%M') FROM {MV}.activation_events WHERE user_id = 9
                             AND CAST(event_ts AS DATE) = DATE '2025-10-01' ORDER BY event_ts""")
        self.assertEqual(later, ["00:10", "09:00"], "user 9's second session on 1 October starts at 09:00 UTC")
        users = self.col(f"""SELECT DISTINCT user_id FROM {MV}.activation_events WHERE (user_id = 1 AND event_ts >= TIMESTAMPTZ '2024-12-01 00:00:00+00')
                             OR (user_id = 9 AND event_ts >= TIMESTAMPTZ '2025-09-01 00:00:00+00') ORDER BY 1""")
        self.assertEqual(users, [1, 9], "users 1 and 9, outside every other plant")

    # ---- mailvora_edge_pat follows Mailvora's rules ------------------------------------------------------------------------------

    def test_mv_rows_follow_mailvoras_rules(self):
        checks = {
            "a spend day outside its campaign's dates": f"""SELECT count(*) FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id)
                WHERE a.spend_date < c.start_date OR a.spend_date > c.end_date""",
            "a spend row not in euros, not in UTC, or with more clicks than impressions": f"""SELECT count(*) FROM {MV}.ad_spend_daily
                WHERE currency <> 'EUR' OR export_timezone <> 'UTC' OR clicks > impressions OR clicks < 0 OR spend < 0""",
            "a campaign session on a day its campaign had no clicks": f"""SELECT count(*) FROM {MV}.sessions x JOIN {MV}.campaigns c USING (utm_campaign)
                WHERE NOT EXISTS (SELECT 1 FROM {MV}.ad_spend_daily a WHERE a.campaign_id = c.campaign_id
                                  AND a.spend_date = CAST(x.session_start AS DATE) AND a.clicks > 0)""",
            "a session with a campaign name no campaign has": f"""SELECT count(*) FROM {MV}.sessions WHERE utm_campaign IS NOT NULL
                AND utm_campaign NOT IN (SELECT utm_campaign FROM {MV}.campaigns)""",
            "a signup with no session before it": f"""SELECT count(*) FROM {MV}.signups u WHERE NOT EXISTS (SELECT 1 FROM {MV}.sessions x
                WHERE x.visitor_id = u.visitor_id AND x.session_start <= u.signup_ts)""",
            "a subscription of no signup, or one that starts before the signup": f"""SELECT count(*) FROM {MV}.subscriptions s
                LEFT JOIN {MV}.signups u USING (user_id) WHERE u.user_id IS NULL OR s.start_date < CAST(u.signup_ts AS DATE)""",
            "a payment outside its subscription or of another amount": f"""SELECT count(*) FROM {MV}.payments p JOIN {MV}.subscriptions s USING (subscription_id)
                WHERE CAST(p.paid_at AS DATE) < s.start_date OR CAST(p.paid_at AS DATE) > coalesce(s.end_date, DATE '2025-12-31')
                   OR p.amount_eur <> s.monthly_price_eur OR p.paid_at < (SELECT u.signup_ts FROM {MV}.signups u WHERE u.user_id = s.user_id)""",
            "a month of a subscription with no payment": f"""SELECT count(*) FROM {MV}.subscriptions s, range(0, 24) k(n)
                WHERE CAST(s.start_date + to_months(CAST(k.n AS INTEGER)) AS DATE) <= coalesce(s.end_date, DATE '2025-12-31')
                  AND NOT EXISTS (SELECT 1 FROM {MV}.payments p WHERE p.subscription_id = s.subscription_id
                                  AND CAST(p.paid_at AS DATE) = CAST(s.start_date + to_months(CAST(k.n AS INTEGER)) AS DATE))""",
            "an activation event before its signup": f"""SELECT count(*) FROM {MV}.activation_events e JOIN {MV}.signups u USING (user_id)
                WHERE e.event_ts < u.signup_ts""",
            "a user whose first event is not first_campaign_sent": f"""SELECT count(*) FROM (SELECT user_id, min(event_ts) AS first,
                min(event_ts) FILTER (WHERE event_name = 'first_campaign_sent') AS activated FROM {MV}.activation_events GROUP BY 1)
                WHERE activated IS NULL OR first < activated""",
            "a country no table of countries holds": f"""SELECT count(*) FROM (SELECT country_code FROM {MV}.sessions UNION ALL
                SELECT country_code FROM {MV}.signups) WHERE country_code NOT IN (SELECT country_code FROM {MV}.countries)""",
            "a plan at another price than its list": f"""SELECT count(*) FROM {MV}.subscriptions
                WHERE monthly_price_eur <> CASE plan_name WHEN 'Lite' THEN 15 WHEN 'Pro' THEN 45 WHEN 'Business' THEN 120 END""",
            "a row after 2025 or before 2024": f"""SELECT (SELECT count(*) FROM {MV}.ad_spend_daily WHERE spend_date NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                + (SELECT count(*) FROM {MV}.sessions WHERE session_start < TIMESTAMPTZ '2024-01-01 00:00:00+00' OR session_start >= TIMESTAMPTZ '2026-01-01 00:00:00+00')
                + (SELECT count(*) FROM {MV}.activation_events WHERE event_ts >= TIMESTAMPTZ '2026-01-01 00:00:00+00')
                + (SELECT count(*) FROM {MV}.payments WHERE paid_at >= TIMESTAMPTZ '2026-01-01 00:00:00+00')""",
        }
        for what, sql in checks.items():
            with self.subTest(check=what):
                self.assertEqual(self.one(sql)[0], 0, what)
        for table in ("channels", "countries", "fx_rates_monthly"):
            with self.subTest(copy=table):
                self.assertEqual(self.one(f"SELECT count(*) FROM (SELECT * FROM {MV}.{table} EXCEPT SELECT * FROM mailvora.{table})")[0], 0)
                self.assertEqual(self.one(f"SELECT count(*) FROM {MV}.{table}")[0], self.one(f"SELECT count(*) FROM mailvora.{table}")[0], f"every row of {table}")
        refunded = self.one(f"SELECT count(*) FILTER (WHERE refunded), count(*) FROM {MV}.payments")
        self.assertEqual(refunded[0], 1, "one refunded payment")

    # ---- S8-07 on ledgerloop_edge_saas (one test per plant) ------------------------------------------------------------------------

    def test_ll_a_tie_at_each_top_n_cutoff(self):
        self.ties(LL_RANKINGS)

    def test_ll_two_rows_of_one_key_at_the_same_time(self):
        same = self.con.execute(f"""SELECT subscription_id, list(event_type ORDER BY event_id) FROM {LL}.subscription_events
                                    GROUP BY subscription_id, recorded_at HAVING count(*) > 1 ORDER BY 1""").fetchall()
        self.assertEqual(same, [(3, ["expansion", "contraction"])],
                         "a subscription with two events recorded at the same moment, its latest: a price rise and a contraction")
        emails = self.col(f"SELECT email FROM {LL}.leads GROUP BY email, created_at HAVING count(*) > 1")
        self.assertEqual(emails, ["finance@kustlijnmedia.example"], "two leads of one email at the same moment, from two sources")

    def test_ll_a_missing_day_week_and_month(self):
        months = [str(m) for (m,) in self.con.execute(f"""SELECT month_end FROM (SELECT CAST(m + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS month_end
                FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH) t(m)) me
            WHERE (SELECT coalesce(sum(e.mrr_delta_local), 0) FROM {LL}.subscription_events e WHERE e.account_id = 6 AND e.event_date <= me.month_end) = 0
              AND me.month_end > DATE '2024-02-12' ORDER BY 1""").fetchall()]
        self.assertEqual(months, ["2024-08-31", "2024-09-30", "2024-10-31", "2024-11-30", "2024-12-31"],
                         "account 6 has no MRR from its churn to its reactivation, so an account-month spine needs those months")
        weeks = self.one(f"""SELECT count(*) FROM range(DATE '2024-08-12', DATE '2025-01-13', INTERVAL 7 DAY) t(w)
                             WHERE NOT EXISTS (SELECT 1 FROM {LL}.usage_weekly u WHERE u.account_id = 6 AND u.week_start = CAST(t.w AS DATE))""")[0]
        self.assertEqual(weeks, 22, "and no usage week while it was not a customer")
        new_months = [str(m) for m in self.col(f"""SELECT DISTINCT CAST(date_trunc('month', event_date) AS DATE) FROM {LL}.subscription_events
                                                  WHERE event_type = 'new' ORDER BY 1""")]
        self.assertEqual(len(new_months), 9, "new accounts in 9 of the 24 months: a monthly new-MRR series with gaps")
        billed = f"""SELECT CAST(date_trunc('month', invoice_date) AS DATE) AS month, sum(amount_local) AS total FROM {LL}.invoices
                     WHERE account_id = 6 GROUP BY 1"""
        self.assertGreater(self.one(LAG12_DIFFERS.format(months=billed))[0], 0,
                           "LAG 12 over account 6's months with an invoice is not the month a year before")
        days = [str(d) for d in self.col(f"""SELECT DISTINCT CAST(timezone('Europe/Brussels', event_ts) AS DATE) FROM {LL}.app_events
                                            WHERE user_id = 22 ORDER BY 1""")]
        self.assertEqual(days, ["2025-12-01", "2025-12-02", "2025-12-04"], "user 22 skips 3 December 2025 in a run of days")

    def test_ll_a_cohort_whose_later_months_fall_after_as_of_date(self):
        late = self.col(f"SELECT account_id FROM {LL}.accounts WHERE created_at >= TIMESTAMP '2025-11-01' ORDER BY 1")
        self.assertEqual(late, [13, 14], "accounts created in November and December 2025: their months from January 2026 end after "
                                         "the as-of date, 2026-01-01")
        legacy = self.col(f"""SELECT a.account_id FROM {LL}.accounts a WHERE a.created_at < TIMESTAMP '2024-01-01'
                              AND EXISTS (SELECT 1 FROM {LL}.subscription_events e WHERE e.account_id = a.account_id AND e.event_type = 'opening')
                              ORDER BY 1""")
        self.assertEqual(legacy, [1, 2, 3, 4], "accounts created before 2024, whose first event is the opening one on 2024-01-01 (S8-03)")

    def test_ll_a_user_who_reaches_a_funnel_step_without_the_one_before(self):
        skipped = self.col(f"""SELECT DISTINCT user_id FROM {LL}.app_events WHERE event_name = 'export_report'
                               AND user_id NOT IN (SELECT user_id FROM {LL}.app_events WHERE event_name = 'upload_statement') ORDER BY 1""")
        self.assertEqual(skipped, [23], "a user who exports a report without ever uploading a statement")
        order = self.col(f"""SELECT user_id FROM {LL}.app_events GROUP BY user_id
            HAVING min(event_ts) FILTER (WHERE event_name = 'match_transaction') < min(event_ts) FILTER (WHERE event_name = 'upload_statement')
            ORDER BY 1""")
        self.assertEqual(order, [6], "a user who matches a transaction before uploading a statement")

    def test_ll_an_event_pair_across_the_clock_change_and_one_exactly_30_minutes_apart(self):
        times = self.epochs(f"""SELECT epoch(event_ts) FROM {LL}.app_events WHERE user_id = 15
                                AND event_ts BETWEEN TIMESTAMPTZ '2025-10-25 23:00:00+00' AND TIMESTAMPTZ '2025-10-26 03:00:00+00' ORDER BY 1""")
        crossing = [(a, b) for a, b in zip(times, times[1:]) if a < CLOCK_CHANGE_UTC <= b]
        self.assertEqual(len(crossing), 1, "user 15 has events on both sides of 01:00 UTC")
        self.assertEqual(crossing[0][1] - crossing[0][0], 35 * 60, "35 minutes apart in UTC, so two sessions under a 30-minute gap")
        local = self.col(f"""SELECT strftime(timezone('Europe/Brussels', event_ts), '%H:%M') FROM {LL}.app_events WHERE user_id = 15
                             AND event_ts BETWEEN TIMESTAMPTZ '2025-10-25 23:00:00+00' AND TIMESTAMPTZ '2025-10-26 03:00:00+00' ORDER BY event_ts""")
        self.assertEqual(local, ["02:30", "02:45", "02:20", "02:35"], "in Brussels wall-clock time the gap looks 25 minutes backwards")
        # F2-1-2: besides user 17's pair (4 November), one inside the windows of EX-SQL-PAT-08-E1-04 and -E2-05 (26 October) and one
        # inside -E1-21's (5 December), each on the same day in UTC and in Brussels.
        exact = [(9, "2025-10-26 09:00", "2025-10-26 09:30", "2025-10-26", "2025-10-26", 1800.0),
                 (17, "2025-11-04 09:00", "2025-11-04 09:30", "2025-11-04", "2025-11-04", 1800.0),
                 (11, "2025-12-05 09:00", "2025-12-05 09:30", "2025-12-05", "2025-12-05", 1800.0)]
        self.assertEqual(self.pairs(LL, "gap BETWEEN 1790 AND 1810"), exact, "three pairs of a user's events exactly 30 minutes apart (UTC days)")
        self.assertEqual(self.pairs(LL, "gap BETWEEN 1790 AND 1810", clock="Europe/Brussels"), exact, "and the same days in Brussels")

    def test_ll_events_on_another_day_or_month_in_brussels_and_sessions_across_midnight(self):
        # F2-1-1: the events whose Brussels day is not their UTC day, all of them the only events of four users outside every other plant
        # and outside EX-SQL-PAT-08-E2-02's users: a session start that is 25 October in Brussels (-E2-05), a session across Brussels
        # midnight into 20 October (-E2-05), a first upload that is November in Brussels (EX-SQL-PAT-07-E3-02) and a session across UTC
        # midnight into 1 December (-E1-21), which starts on 1 December in Brussels.
        rows = self.con.execute(f"""SELECT user_id, strftime(timezone('UTC', event_ts), '%Y-%m-%d %H:%M'), event_name,
                                           strftime(CAST(event_ts AS DATE), '%Y-%m-%d'), strftime(CAST(timezone('Europe/Brussels', event_ts) AS DATE), '%Y-%m-%d')
            FROM {LL}.app_events WHERE user_id IN (SELECT user_id FROM {LL}.app_events
                                                   WHERE CAST(event_ts AS DATE) <> CAST(timezone('Europe/Brussels', event_ts) AS DATE))
            ORDER BY event_ts""").fetchall()
        self.assertEqual(rows, [(20, "2025-10-19 21:50", "login", "2025-10-19", "2025-10-19"),
                                (20, "2025-10-19 22:10", "view_dashboard", "2025-10-19", "2025-10-20"),
                                (19, "2025-10-24 22:30", "login", "2025-10-24", "2025-10-25"),
                                (19, "2025-10-24 22:40", "view_dashboard", "2025-10-24", "2025-10-25"),
                                (21, "2025-10-31 23:30", "upload_statement", "2025-10-31", "2025-11-01"),
                                (12, "2025-11-30 23:50", "login", "2025-11-30", "2025-12-01"),
                                (12, "2025-12-01 00:10", "open_reconciliation", "2025-12-01", "2025-12-01")],
                         "users 19, 20, 21 and 12, with every event of theirs")
        self.assertEqual(self.pairs(LL, "gap <= 1800 AND day <> prev_day"),
                         [(12, "2025-11-30 23:50", "2025-12-01 00:10", "2025-11-30", "2025-12-01", 1200.0)],
                         "one session across UTC midnight, into 1 December")
        self.assertEqual(self.pairs(LL, "gap <= 1800 AND day <> prev_day", clock="Europe/Brussels"),
                         [(20, "2025-10-19 21:50", "2025-10-19 22:10", "2025-10-19", "2025-10-20", 1200.0)],
                         "one session across Brussels midnight, into 20 October")
        months = self.one(f"""SELECT strftime(date_trunc('month', timezone('UTC', min(event_ts))), '%Y-%m'), strftime(date_trunc('month', timezone('Europe/Brussels', min(event_ts))), '%Y-%m')
                              FROM {LL}.app_events WHERE user_id = 21 AND event_name = 'upload_statement'""")
        self.assertEqual(months, ("2025-10", "2025-11"), "user 21's first upload is in October in UTC and in November in Brussels")
        third = self.one(f"""SELECT count(*) FROM {LL}.app_events WHERE DATE '2025-12-03' IN (CAST(event_ts AS DATE), CAST(timezone('Europe/Brussels', event_ts) AS DATE))""")[0]
        self.assertEqual(third, 0, "still no event on 3 December 2025, on either clock")
        self.assertTrue({9, 11, 12, 19, 20, 21}.isdisjoint({17, 128, 129, 278}), "no plant on EX-SQL-PAT-08-E2-02's users")

    def test_ll_an_opening_balance_account(self):
        opening = self.con.execute(f"""SELECT e.account_id, e.event_date FROM {LL}.subscription_events e WHERE e.event_type = 'opening'
                                       ORDER BY 1""").fetchall()
        self.assertEqual(opening, [(a, dt.date(2024, 1, 1)) for a in (1, 2, 3, 4)], "four accounts open with a balance on 2024-01-01")
        new_or_back = self.one(f"""SELECT count(*) FROM {LL}.subscription_events WHERE account_id IN (1, 2, 3, 4) AND event_type IN ('new', 'reactivation')""")[0]
        self.assertEqual(new_or_back, 0, "and none of them is ever booked as new (ERR-LOG-47)")

    def test_ll_a_contraction(self):
        rows = self.con.execute(f"""SELECT subscription_id, event_date FROM {LL}.subscription_events WHERE event_type = 'contraction' ORDER BY 2""").fetchall()
        self.assertEqual(rows, [(3, dt.date(2025, 2, 10)), (2, dt.date(2025, 3, 15)), (4, dt.date(2025, 6, 20))],
                         "three contractions, each on a renewal day: a dropped add-on, a seat cut on a GBP plan, a seat cut on an annual plan")

    def test_ll_a_churn_then_a_reactivation(self):
        rows = self.con.execute(f"""SELECT subscription_id, event_type, event_date FROM {LL}.subscription_events WHERE account_id = 6
                                    AND event_type IN ('new', 'churn', 'reactivation') ORDER BY event_date""").fetchall()
        self.assertEqual(rows, [(6, "new", dt.date(2024, 2, 12)), (6, "churn", dt.date(2024, 8, 12)), (11, "reactivation", dt.date(2025, 1, 14))],
                         "account 6 churns at a renewal and comes back five months later on a new subscription, as reactivation")

    def test_ll_an_annual_plans_renewal_month(self):
        renewals = self.con.execute(f"""SELECT i.subscription_id, i.invoice_date, i.amount_local = 12 * (SELECT sum(e.mrr_delta_local)
                FROM {LL}.subscription_events e WHERE e.subscription_id = i.subscription_id AND e.event_date <= i.invoice_date)
            FROM {LL}.invoices i JOIN {LL}.subscriptions s USING (subscription_id) WHERE s.billing_period = 'annual' ORDER BY 2""").fetchall()
        self.assertEqual(renewals, [(8, dt.date(2024, 3, 5), True), (4, dt.date(2024, 6, 20), True), (8, dt.date(2025, 3, 5), True),
                                    (4, dt.date(2025, 6, 20), True)],
                         "annual plans bill twelve months of MRR at the start and at each renewal; their MRR is a twelfth of the year")
        annual = self.col(f"SELECT subscription_id FROM {LL}.subscriptions WHERE billing_period = 'annual' ORDER BY 1")
        self.assertEqual(annual, [4, 8])

    def test_ll_a_gbp_subscription(self):
        rows = self.con.execute(f"""SELECT s.subscription_id, a.country_code FROM {LL}.subscriptions s JOIN {LL}.accounts a USING (account_id)
                                    WHERE s.currency = 'GBP' ORDER BY 1""").fetchall()
        self.assertEqual(rows, [(2, "GB"), (12, "GB")], "two subscriptions bill in GBP, both of accounts in GB")
        self.assertEqual(self.col(f"SELECT DISTINCT currency FROM {LL}.subscriptions ORDER BY 1"), ["CHF", "EUR", "GBP"])

    # ---- S8-C28 (E-215): mrr_monthly on ledgerloop and on ledgerloop_edge_saas, each over its own schema's tables ------------------

    def mrr_series(self, account):
        return [(str(m), v) for m, v in self.con.execute(f"SELECT month, mrr_eur FROM {LL}.mrr_monthly WHERE account_id = ? ORDER BY 1",
                                                          [account]).fetchall()]

    def test_mrr_monthly_reads_its_own_schema_and_gives_e215s_rows(self):
        for schema in ("ledgerloop", LL):
            sql = self.one("SELECT sql FROM duckdb_views() WHERE schema_name = ? AND view_name = 'mrr_monthly'", [schema])[0]
            with self.subTest(schema=schema):
                read = set(re.findall(r"\b(ledgerloop\w*)\.(\w+)", sql))
                self.assertEqual({s for s, _ in read}, {schema}, "it reads its own schema only")
                self.assertEqual({t for _, t in read} - {"mrr_monthly"}, {"fx_rates", "subscription_events", "subscriptions"})
                self.assertEqual(self.columns(schema, "mrr_monthly"), [("account_id", "INTEGER"), ("month", "DATE"), ("mrr_eur", "DECIMAL(12,2)")])
                e215 = f"SELECT * FROM ({E215_SQL.format(s=schema)})"
                extra, missing = self.one(f"""SELECT (SELECT count(*) FROM (SELECT * FROM {schema}.mrr_monthly EXCEPT {e215})),
                                                     (SELECT count(*) FROM ({e215} EXCEPT SELECT * FROM {schema}.mrr_monthly))""")
                self.assertEqual((extra, missing), (0, 0), "E-215's rows, to the cent")
                rows, keys = self.one(f"SELECT count(*), count(DISTINCT (account_id, month)) FROM {schema}.mrr_monthly")
                self.assertEqual(rows, keys, "one row per account and month")
        self.assertEqual(self.names("ledgerloop_raw")[1], set(), "ledgerloop_raw has no view: cases read the clean schema")

    def test_mrr_monthly_on_the_edge_opening_balance_accounts(self):
        all_months = [f"{2024 + i // 12}-{i % 12 + 1:02d}-01" for i in range(24)]
        for account in (1, 2, 3, 4):
            with self.subTest(account=account):
                self.assertEqual([m for m, _ in self.mrr_series(account)], all_months, "a row in every month from January 2024")

    def test_mrr_monthly_on_the_edge_a_churn_then_a_reactivation(self):
        series = self.mrr_series(6)
        self.assertEqual([m for m, _ in series], [f"2024-{m:02d}-01" for m in range(2, 8)] + [f"2025-{m:02d}-01" for m in range(1, 13)],
                         "account 6 has no row from August to December 2024, between its churn and its comeback")
        self.assertEqual({v for m, v in series if m < "2025-02-01"}, {Decimal("290.00")})
        self.assertEqual({v for m, v in series if m >= "2025-02-01"}, {Decimal("349.00")}, "the add-on from 14 February 2025")

    def test_mrr_monthly_on_the_edge_an_annual_plan(self):
        four = self.mrr_series(4)
        self.assertEqual(len(four), 24)
        self.assertEqual({v for m, v in four if m < "2025-06-01"}, {Decimal("1011.50")}, "a twelfth of the year's price, not the year's")
        self.assertEqual({v for m, v in four if m >= "2025-06-01"}, {Decimal("960.50")}, "the seat cut at the 2025-06-20 renewal")
        eight = self.mrr_series(8)
        self.assertEqual(eight[0], ("2024-03-01", Decimal("246.50")), "account 8 starts in March 2024")
        self.assertEqual({v for m, v in eight if m >= "2025-03-01"}, {Decimal("296.65")})

    def test_mrr_monthly_on_the_edge_a_gbp_subscription_at_one_fixed_rate(self):
        gbp = self.one(f"SELECT eur_per_unit FROM {LL}.fx_rates WHERE currency = 'GBP' AND rate_date = DATE '2025-12-31'")[0]
        euros = lambda local: (Decimal(local) * gbp).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)   # noqa: E731
        series = self.mrr_series(2)
        self.assertEqual({v for m, v in series if m < "2025-03-01"}, {euros("1169.00")}, "GBP 1,169 at 2025-12-31's rate in every month")
        self.assertEqual({v for m, v in series if m >= "2025-03-01"}, {euros("1069.00")}, "after the seat cut")
        month_end = self.one(f"""SELECT count(DISTINCT round(1169 * eur_per_unit, 2)) FROM {LL}.fx_rates WHERE currency = 'GBP'
                                 AND rate_date = last_day(rate_date) AND rate_date < DATE '2025-03-01'""")[0]
        self.assertGreater(month_end, 1, "month-end rates would move the euros from month to month")
        self.assertEqual(self.mrr_series(11)[0], ("2025-04-01", euros("299.00")), "account 11's GBP subscription starts in April 2025")

    def test_ll_clean_items_never_meet_a_duplicate(self):
        # S8-C14: the event sent twice is ledgerloop_edge_clean's; on the clean items' edge every business key is one row.
        copies = self.one(f"""SELECT count(*) FROM (SELECT subscription_id, event_type, event_date, mrr_delta_local FROM {LL}.subscription_events
                              GROUP BY ALL HAVING count(*) > 1)""")[0]
        self.assertEqual(copies, 0, "no two events share a business key")
        self.assertEqual(self.one(f"SELECT max(event_id) - count(*) FROM {LL}.subscription_events")[0], 0, "event IDs 1 to n")

    def test_ll_every_month_reconciles_to_the_cent(self):
        # Review Focus 2: opening MRR plus new, expansion and reactivation, less contraction and churn, is closing MRR, per currency;
        # closing MRR is each subscription active at the month end at its MRR in force, from the events.
        rows = self.con.execute(f"""WITH m AS (SELECT CAST(range AS DATE) AS month_start, CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS month_end
                                               FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)),
            c AS (SELECT DISTINCT currency FROM {LL}.subscriptions),
            closing AS (SELECT m.month_end, c.currency, (SELECT coalesce(sum(e.mrr_delta_local), 0) FROM {LL}.subscriptions s
                            JOIN {LL}.subscription_events e USING (subscription_id) WHERE s.currency = c.currency AND e.event_date <= m.month_end
                            AND s.start_date <= m.month_end AND (s.end_date IS NULL OR s.end_date > m.month_end)) AS mrr FROM m, c),
            moves AS (SELECT m.month_end, s.currency, e.event_type, sum(e.mrr_delta_local) AS amount
                      FROM {LL}.subscription_events e JOIN {LL}.subscriptions s USING (subscription_id)
                      JOIN m ON e.event_date BETWEEN m.month_start AND m.month_end GROUP BY ALL)
            SELECT cl.month_end, cl.currency, cl.mrr,
                   coalesce(lag(cl.mrr) OVER (PARTITION BY cl.currency ORDER BY cl.month_end),
                            (SELECT coalesce(sum(e.mrr_delta_local), 0) FROM {LL}.subscription_events e JOIN {LL}.subscriptions s USING (subscription_id)
                             WHERE e.event_type = 'opening' AND s.currency = cl.currency)) AS opening,
                   coalesce(sum(mv.amount) FILTER (WHERE mv.event_type IN ('new', 'expansion', 'reactivation')), 0) AS ups,
                   coalesce(sum(mv.amount) FILTER (WHERE mv.event_type IN ('contraction', 'churn')), 0) AS downs,
                   coalesce(sum(mv.amount) FILTER (WHERE mv.event_type = 'opening' AND cl.month_end > DATE '2024-01-31'), 0) AS stray
            FROM closing cl LEFT JOIN moves mv ON mv.month_end = cl.month_end AND mv.currency = cl.currency
            GROUP BY cl.month_end, cl.currency, cl.mrr""").fetchall()
        self.assertEqual(len(rows), 24 * 3)
        for month_end, currency, closing, opening, ups, downs, stray in rows:
            with self.subTest(month=str(month_end), currency=currency):
                self.assertTrue(opening + ups + downs == closing, "opening plus movements is closing")
                self.assertTrue(stray == 0, "movement queries leave opening events out: they are all in January 2024")
        december = self.one(f"""SELECT sum(mrr_local) FILTER (WHERE currency = 'EUR') FROM {LL}.subscriptions WHERE end_date IS NULL""")[0]
        closing_eur = [c for m, cur, c, *_ in rows if cur == "EUR" and m == dt.date(2025, 12, 31)][0]
        self.assertEqual(december, closing_eur, "closing MRR on 2025-12-31 is the running subscriptions' mrr_local, an independent source")

    def test_ll_a_euro_bridge_reconciles_at_one_fixed_rate_and_not_at_month_end_rates(self):
        # A2-plants-R1: across currencies a bridge adds up only when every amount takes one fixed date's rate (here 2025-12-31's); at
        # month-end rates the rate itself moves between months (GBP subscriptions 2 and 12, CHF subscription 1).
        bridge = """WITH m AS (SELECT CAST(range AS DATE) AS month_start, CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS month_end
                               FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)),
            r AS (SELECT m.month_end, fx.currency, fx.eur_per_unit FROM m JOIN {s}.fx_rates fx ON fx.rate_date = {rate_date}),
            closing AS (SELECT m.month_end, (SELECT coalesce(sum(e.mrr_delta_local * r.eur_per_unit), 0) FROM {s}.subscriptions s
                            JOIN {s}.subscription_events e USING (subscription_id) JOIN r ON r.month_end = m.month_end AND r.currency = s.currency
                            WHERE e.event_date <= m.month_end AND s.start_date <= m.month_end AND (s.end_date IS NULL OR s.end_date > m.month_end)) AS mrr
                        FROM m),
            moves AS (SELECT m.month_end, coalesce(sum(e.mrr_delta_local * r.eur_per_unit) FILTER (WHERE e.event_type <> 'opening'), 0) AS moved,
                             coalesce(sum(e.mrr_delta_local * r.eur_per_unit) FILTER (WHERE e.event_type = 'opening'), 0) AS opened
                      FROM m LEFT JOIN {s}.subscription_events e ON e.event_date BETWEEN m.month_start AND m.month_end
                      LEFT JOIN {s}.subscriptions s USING (subscription_id) LEFT JOIN r ON r.month_end = m.month_end AND r.currency = s.currency
                      GROUP BY m.month_end),
            b AS (SELECT c.month_end, coalesce(lag(c.mrr) OVER (ORDER BY c.month_end), mv.opened) + mv.moved - c.mrr AS gap
                  FROM closing c JOIN moves mv USING (month_end))
            SELECT count(*) FILTER (WHERE abs(gap) > 0.005), count(*) FROM b"""
        fixed = self.one(bridge.format(s=LL, rate_date="DATE '2025-12-31'"))
        self.assertEqual(fixed, (0, 24), "at 2025-12-31's rate, opening plus movements is closing in every month")
        month_end = self.one(bridge.format(s=LL, rate_date="m.month_end"))
        self.assertGreater(month_end[0], 0, "at each month end's rate the bridge does not add up, so the brief asks for one fixed rate")

    def test_err_log_41_pairs_pick_other_rows_on_the_visible_data_and_the_edge(self):
        # A2-rules-R1 (S8-C19): the clean column pairs the brief names for ERR-LOG-41, where ordering by the wrong column, highest first,
        # keeps another row than the latest whatever the tie-break: the latest row's value is below its partition's highest.
        pairs = {("voltmarkt", VM): ("price_history", "product_id", "valid_from", "list_price_eur", [21]),
                 ("ledgerloop", LL): ("invoices", "subscription_id", "invoice_date", "amount_local", [2, 3, 4])}
        sql = """WITH w AS (SELECT {part} AS p, {right} AS r, {wrong} AS v, max({right}) OVER (PARTITION BY {part}) AS last,
                                max({wrong}) OVER (PARTITION BY {part}) AS top FROM {schema}.{table})
                 SELECT DISTINCT p FROM w WHERE r = last AND v < top ORDER BY 1"""
        for (visible, edge), (table, part, right, wrong, parts) in pairs.items():
            args = dict(table=table, part=part, right=right, wrong=wrong)
            with self.subTest(table=table):
                self.assertGreater(len(self.col(sql.format(schema=visible, **args))), 0, f"{visible}.{table}: {wrong} picks other rows than {right}")
                self.assertEqual(self.col(sql.format(schema=edge, **args)), parts, f"{edge}.{table}: and on the edge")

    # ---- ledgerloop_edge_saas follows LedgerLoop's rules (S8-02, S8-03, S8-05, S8-06) ------------------------------------------------

    def test_ll_rows_follow_ledgerloops_rules(self):
        checks = {
            "a subscription whose MRR at a month end is not positive exactly while it is active": f"""SELECT count(*) FROM {LL}.subscriptions s,
                (SELECT CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS d FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)) m
                WHERE ((SELECT coalesce(sum(e.mrr_delta_local), 0) FROM {LL}.subscription_events e WHERE e.subscription_id = s.subscription_id
                        AND e.event_date <= m.d) > 0) <> (s.start_date <= m.d AND (s.end_date IS NULL OR s.end_date > m.d))""",
            "an mrr_local that is not the MRR at the end or on the as-of date": f"""SELECT count(*) FROM {LL}.subscriptions s
                JOIN (SELECT subscription_id, sum(mrr_delta_local) AS total, sum(mrr_delta_local) FILTER (WHERE event_type <> 'churn') AS before_end
                      FROM {LL}.subscription_events GROUP BY 1) e USING (subscription_id)
                WHERE (s.end_date IS NULL AND e.total <> s.mrr_local) OR (s.end_date IS NOT NULL AND (e.total <> 0 OR e.before_end <> s.mrr_local))""",
            "a monthly invoice that is not the MRR in force on its date": f"""SELECT count(*) FROM {LL}.invoices i JOIN {LL}.subscriptions s USING (subscription_id)
                WHERE i.amount_local <> (CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END) * (SELECT sum(e.mrr_delta_local)
                    FROM {LL}.subscription_events e WHERE e.subscription_id = i.subscription_id AND e.event_date <= i.invoice_date)
                   OR i.currency <> s.currency OR i.account_id <> s.account_id""",
            "a renewal or start with no invoice": f"""SELECT count(*) FROM {LL}.subscriptions s, range(0, 72) k(n)
                WHERE CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE)
                      BETWEEN DATE '2024-01-01' AND DATE '2025-12-31'
                  AND (s.end_date IS NULL OR CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE) < s.end_date)
                  AND NOT EXISTS (SELECT 1 FROM {LL}.invoices i WHERE i.subscription_id = s.subscription_id
                      AND i.invoice_date = CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE))""",
            "an invoice with no successful payment, or a payment off its invoice's day": f"""SELECT count(*) FROM {LL}.invoices i
                WHERE i.status <> 'paid' OR NOT EXISTS (SELECT 1 FROM {LL}.payments p WHERE p.invoice_id = i.invoice_id AND p.succeeded
                    AND CAST(p.attempted_at AS DATE) = i.invoice_date AND p.failure_reason IS NULL)""",
            "an opening event off 2024-01-01, or a subscription active that day without one": f"""SELECT
                (SELECT count(*) FROM {LL}.subscription_events WHERE event_type = 'opening' AND event_date <> DATE '2024-01-01')
                + (SELECT count(*) FROM {LL}.subscriptions s WHERE s.start_date <= DATE '2024-01-01' AND (s.end_date IS NULL OR s.end_date > DATE '2024-01-01')
                   AND NOT EXISTS (SELECT 1 FROM {LL}.subscription_events e WHERE e.subscription_id = s.subscription_id AND e.event_type = 'opening'))""",
            "an account created in the window without exactly one new event on its created day": f"""SELECT count(*) FROM {LL}.accounts a
                WHERE a.created_at >= TIMESTAMP '2024-01-01' AND (SELECT count(*) FROM {LL}.subscription_events e WHERE e.account_id = a.account_id
                      AND e.event_type = 'new' AND e.event_date = CAST(a.created_at AS DATE)) <> 1""",
            "a subscription that does not start with one opening, new or reactivation event": f"""SELECT count(*) FROM (SELECT event_type,
                row_number() OVER (PARTITION BY subscription_id ORDER BY event_date, event_id) AS k FROM {LL}.subscription_events)
                WHERE (k = 1) <> (event_type IN ('opening', 'new', 'reactivation'))""",
            "an up that is not positive or a down that is not negative": f"""SELECT count(*) FROM {LL}.subscription_events
                WHERE (event_type IN ('opening', 'new', 'expansion', 'reactivation') AND mrr_delta_local <= 0)
                   OR (event_type IN ('contraction', 'churn') AND mrr_delta_local >= 0)""",
            "a churn that is not the subscription's end, or an end with no churn": f"""SELECT count(*) FROM {LL}.subscriptions s
                LEFT JOIN {LL}.subscription_events e ON e.subscription_id = s.subscription_id AND e.event_type = 'churn'
                WHERE (s.end_date IS NULL) <> (e.event_id IS NULL) OR e.event_date <> s.end_date""",
            "a reactivation that does not follow a churned subscription of its account": f"""SELECT count(*) FROM {LL}.subscription_events e
                JOIN {LL}.subscriptions s USING (subscription_id) WHERE e.event_type = 'reactivation' AND NOT EXISTS (SELECT 1 FROM {LL}.subscriptions p
                WHERE p.account_id = s.account_id AND p.end_date IS NOT NULL AND p.end_date <= s.start_date)""",
            "an event of another account than its subscription's": f"""SELECT count(*) FROM {LL}.subscription_events e
                JOIN {LL}.subscriptions s USING (subscription_id) WHERE e.account_id <> s.account_id""",
            "a currency that is not the country's": f"""SELECT count(*) FROM {LL}.subscriptions s JOIN {LL}.accounts a USING (account_id)
                WHERE s.currency <> CASE a.country_code WHEN 'GB' THEN 'GBP' WHEN 'CH' THEN 'CHF' ELSE 'EUR' END""",
            "two subscriptions of one account at once": f"""SELECT count(*) FROM {LL}.subscriptions a JOIN {LL}.subscriptions b ON a.account_id = b.account_id
                AND a.subscription_id < b.subscription_id AND b.start_date < coalesce(a.end_date, DATE '9999-12-31')
                AND a.start_date < coalesce(b.end_date, DATE '9999-12-31')""",
            "a plan that is not the subscription's at its end or on the as-of date": f"""SELECT count(*) FROM {LL}.subscriptions s JOIN {LL}.plans p USING (plan_id)
                WHERE p.plan_name = 'Starter' AND (p.list_price_eur_month = 349) <> (s.mrr_local IN (349.00, 299.00, 335.00, 296.65))""",
            "an annual MRR that is not 85% of a whole monthly price": f"""SELECT count(*) FROM {LL}.subscription_events e
                JOIN {LL}.subscriptions s USING (subscription_id) WHERE s.billing_period = 'annual' AND e.event_type IN ('new', 'reactivation', 'opening')
                AND (CAST(round(e.mrr_delta_local * 100) AS BIGINT) * 100 % 85 <> 0 OR CAST(round(e.mrr_delta_local * 100) AS BIGINT) * 100 / 85 % 100 <> 0)""",
            "a usage week of an account that was not a customer that week": f"""SELECT count(*) FROM {LL}.usage_weekly u WHERE NOT EXISTS (
                SELECT 1 FROM {LL}.subscriptions s WHERE s.account_id = u.account_id AND s.start_date <= u.week_start + 6
                AND (s.end_date IS NULL OR s.end_date > u.week_start)) OR dayofweek(u.week_start) <> 1 OR u.active_users < 1""",
            "a customer week with no usage row": f"""SELECT count(*) FROM {LL}.accounts a, range(DATE '2024-01-01', DATE '2025-12-30', INTERVAL 7 DAY) t(w)
                WHERE EXISTS (SELECT 1 FROM {LL}.subscriptions s WHERE s.account_id = a.account_id AND s.start_date <= CAST(t.w AS DATE) + 6
                              AND (s.end_date IS NULL OR s.end_date > CAST(t.w AS DATE)))
                  AND NOT EXISTS (SELECT 1 FROM {LL}.usage_weekly u WHERE u.account_id = a.account_id AND u.week_start = CAST(t.w AS DATE))""",
            "a user active after the account's churn": f"""SELECT count(*) FROM {LL}.users u JOIN {LL}.subscriptions s ON s.account_id = u.account_id
                WHERE s.end_date IS NOT NULL AND u.invited_at < s.end_date AND (u.deactivated_at IS NULL OR u.deactivated_at > s.end_date + INTERVAL 1 DAY)
                  AND NOT EXISTS (SELECT 1 FROM {LL}.subscriptions r WHERE r.account_id = u.account_id AND r.start_date > s.end_date AND r.start_date <= CAST(u.invited_at AS DATE))""",
            "a won opportunity without its account, an account with no won opportunity, or a lost one with an account": f"""SELECT
                (SELECT count(*) FROM {LL}.opportunities o LEFT JOIN {LL}.accounts a USING (account_id)
                 WHERE (o.is_won IS TRUE) <> (o.account_id IS NOT NULL) OR (o.is_won AND (a.account_id IS NULL OR a.created_at < o.closed_at)))
                + (SELECT count(*) FROM {LL}.accounts a WHERE a.created_at >= TIMESTAMP '2024-01-01'
                   AND (SELECT count(*) FROM {LL}.opportunities o WHERE o.account_id = a.account_id) <> 1)
                + (SELECT count(*) FROM {LL}.opportunities WHERE (closed_at IS NULL) <> (is_won IS NULL) OR closed_at < created_at)
                + (SELECT count(*) FROM {LL}.opportunities o JOIN {LL}.leads l USING (lead_id) WHERE o.created_at < l.created_at)
                + (SELECT count(*) - count(DISTINCT lead_id) FROM {LL}.opportunities)
                + (SELECT count(*) FROM {LL}.opportunities o JOIN {LL}.leads l USING (lead_id) JOIN {LL}.accounts a USING (account_id)
                   WHERE a.acquisition_channel <> l.source OR a.segment <> l.segment)
                + (SELECT count(*) FROM {LL}.opportunities WHERE is_won AND stage <> 'contract')""",
            "an app event outside Q4 2025, of an inactive user or account, or two of a user at one instant": f"""SELECT
                (SELECT count(*) FROM {LL}.app_events WHERE event_ts < TIMESTAMPTZ '2025-10-01 00:00:00+00' OR event_ts >= TIMESTAMPTZ '2026-01-01 00:00:00+00')
                + (SELECT count(*) FROM {LL}.app_events a JOIN {LL}.users u USING (user_id) WHERE a.account_id <> u.account_id
                   OR u.invited_at > timezone('Europe/Brussels', a.event_ts) OR u.deactivated_at <= timezone('Europe/Brussels', a.event_ts))
                + (SELECT count(*) FROM (SELECT user_id, event_ts FROM {LL}.app_events GROUP BY ALL HAVING count(*) > 1))
                + (SELECT count(*) FROM (SELECT event_id, lag(event_id) OVER (ORDER BY event_ts, event_id) AS p FROM {LL}.app_events) WHERE p > event_id)""",
            "a ticket of an account that was not a customer when it opened": f"""SELECT count(*) FROM {LL}.support_tickets t WHERE NOT EXISTS (
                SELECT 1 FROM {LL}.subscriptions s WHERE s.account_id = t.account_id AND s.start_date <= CAST(t.opened_at AS DATE)
                AND (s.end_date IS NULL OR s.end_date > CAST(t.opened_at AS DATE))) OR t.resolved_at < t.opened_at""",
            "a dated row outside 2024 and 2025, or a test account": f"""SELECT
                (SELECT count(*) FROM {LL}.subscription_events WHERE event_date NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                + (SELECT count(*) FROM {LL}.invoices WHERE invoice_date NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                + (SELECT count(*) FROM {LL}.leads WHERE CAST(created_at AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                + (SELECT count(*) FROM {LL}.accounts WHERE is_test OR account_name ILIKE '%test%' OR created_at >= TIMESTAMP '2026-01-01')""",
        }
        for what, sql in checks.items():
            with self.subTest(check=what):
                self.assertEqual(self.one(sql)[0], 0, what)
        for table in ("plans", "fx_rates", "marketing_spend_monthly", "cogs_monthly", "sm_expense_monthly"):
            with self.subTest(copy=table):
                self.assertEqual(self.one(f"SELECT count(*) FROM (SELECT * FROM {LL}.{table} EXCEPT SELECT * FROM ledgerloop.{table})")[0], 0)
                self.assertEqual(self.one(f"SELECT count(*) FROM {LL}.{table}")[0], self.one(f"SELECT count(*) FROM ledgerloop.{table}")[0], f"every row of {table}")
        segments = set(self.col(f"SELECT DISTINCT segment FROM {LL}.accounts"))
        self.assertEqual(segments, {"SMB", "Mid-Market", "Enterprise"}, "the clean spellings")

    # ---- S8-C14: ledgerloop_edge_clean, the raw-data items' edge schema (one test per raw plant) -----------------------------------

    def test_llc_a_subscription_event_sent_twice_with_the_same_recorded_at(self):
        same = self.con.execute(f"""SELECT subscription_id, event_type, event_date, count(*), count(DISTINCT event_id) FROM {LLC}.subscription_events
                                    GROUP BY subscription_id, event_type, event_date, mrr_delta_local, recorded_at HAVING count(*) > 1""").fetchall()
        self.assertEqual(same, [(4, "expansion", dt.date(2024, 11, 19), 2, 2)],
                         "one expansion sent twice: the same subscription, type, day, amount and recorded_at under two event IDs")
        originals = self.one(f"SELECT count(DISTINCT (subscription_id, event_type, event_date, mrr_delta_local)) FROM {LLC}.subscription_events")[0]
        copies = self.col(f"""SELECT event_id FROM (SELECT event_id, row_number() OVER (PARTITION BY subscription_id, event_type, event_date,
                                  mrr_delta_local ORDER BY event_id) AS k FROM {LLC}.subscription_events) WHERE k > 1 ORDER BY 1""")
        self.assertEqual(copies, [originals + 1, originals + 2, originals + 3], "each copy has an ID after the last original, as Q-02-01's do")

    def test_llc_copies_sent_seconds_to_minutes_later_and_a_churn_sent_twice(self):
        groups = self.con.execute(f"""SELECT subscription_id, event_type, event_date, count(DISTINCT recorded_at) FROM {LLC}.subscription_events
                                      GROUP BY subscription_id, event_type, event_date, mrr_delta_local HAVING count(*) > 1 ORDER BY 3""").fetchall()
        self.assertEqual(groups, [(4, "expansion", dt.date(2024, 11, 19), 1), (4, "expansion", dt.date(2025, 6, 17), 2),
                                  (6, "churn", dt.date(2025, 7, 10), 2)],
                         "three events sent twice: one at the same moment, two recorded minutes later, one of them a churn")
        negative = self.col(f"""SELECT subscription_id FROM {LLC}.subscription_events GROUP BY 1 HAVING sum(mrr_delta_local) < 0""")
        self.assertEqual(negative, [6], "counted twice, the churn leaves subscription 6 with MRR below zero")

    def test_llc_a_churn_recorded_over_30_days_late(self):
        late = self.con.execute(f"""SELECT subscription_id, event_date, CAST(recorded_at AS DATE) FROM {LLC}.subscription_events
                                    WHERE recorded_at > event_date + INTERVAL 30 DAY""").fetchall()
        self.assertEqual(late, [(3, dt.date(2025, 4, 8), dt.date(2025, 6, 2))], "a churn recorded 55 days after it took effect (Q-02-02)")
        differ = [str(d) for d in self.col(f"""SELECT m.d FROM (SELECT CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS d
                FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)) m
            WHERE (SELECT sum(mrr_delta_local) FROM (SELECT DISTINCT subscription_id, event_type, event_date, mrr_delta_local, min(recorded_at) OVER
                       (PARTITION BY subscription_id, event_type, event_date, mrr_delta_local) AS recorded_at FROM {LLC}.subscription_events) e
                   WHERE e.event_date <= m.d)
               <> (SELECT sum(mrr_delta_local) FROM (SELECT DISTINCT subscription_id, event_type, event_date, mrr_delta_local, min(recorded_at) OVER
                       (PARTITION BY subscription_id, event_type, event_date, mrr_delta_local) AS recorded_at FROM {LLC}.subscription_events) e
                   WHERE e.event_date <= m.d AND e.recorded_at < m.d + INTERVAL 1 DAY) ORDER BY 1""")]
        self.assertEqual(differ, ["2025-04-30", "2025-05-31"], "reported and restated MRR differ at two month ends (FIND-02-12)")

    def test_llc_gbp_and_chf_amounts_labelled_eur(self):
        labels = self.one(f"""SELECT (SELECT list(DISTINCT currency) FROM {LLC}.subscriptions), (SELECT list(DISTINCT currency) FROM {LLC}.invoices)""")
        self.assertEqual(labels, (["EUR"], ["EUR"]), "every subscription and invoice says EUR (Q-02-03)")
        foreign = self.col(f"""SELECT a.country_code FROM {LLC}.subscriptions s JOIN {LLC}.accounts a USING (account_id)
                               WHERE a.country_code IN ('GB', 'CH') ORDER BY 1""")
        self.assertEqual(foreign, ["CH", "GB"], "though one account is in CH and one in GB, whose amounts stay in CHF and GBP")

    def test_llc_payments_are_utc_instants_one_on_another_brussels_day(self):
        shifted = self.col(f"""SELECT invoice_id FROM {LLC}.payments
                               WHERE CAST(timezone('UTC', attempted_at) AS DATE) <> CAST(timezone('Europe/Brussels', attempted_at) AS DATE)""")
        self.assertEqual(len(shifted), 1, "one attempt at 23:30 UTC, which is the next day in Brussels (Q-02-04)")
        attempts = self.con.execute(f"""SELECT attempt_no, succeeded, failure_reason IS NULL FROM {LLC}.payments WHERE invoice_id = ?
                                        ORDER BY attempt_no""", [shifted[0]]).fetchall()
        self.assertEqual(attempts, [(1, False, False), (2, True, True)], "a failed first attempt, then the late retry that succeeds")

    def test_llc_a_running_subscription_ends_on_9999_12_31(self):
        self.assertEqual(self.col(f"SELECT subscription_id FROM {LLC}.subscriptions WHERE end_date = DATE '9999-12-31'"), [5],
                         "a running subscription with the sentinel end date instead of a missing one (Q-02-05)")

    def test_llc_segment_spellings(self):
        spellings = set(self.col(f"SELECT DISTINCT segment FROM {LLC}.accounts"))
        self.assertTrue({"smb", "Small Business", "midmarket"} <= spellings, "raw's spellings beside the clean ones (Q-02-06)")
        raw = set(self.col("SELECT DISTINCT segment FROM ledgerloop_raw.accounts"))
        self.assertEqual(spellings - raw, set(), "and no spelling raw lacks, so a prompt's mapping covers them")

    def test_llc_test_accounts(self):
        tests = self.con.execute(f"""SELECT account_id, is_test FROM {LLC}.accounts WHERE is_test OR account_name ILIKE '%test%' ORDER BY 1""").fetchall()
        self.assertEqual(tests, [(7, True), (8, False)], "one flagged test account and one only named like a test, after the last real one (Q-02-07)")
        held = self.one(f"SELECT count(*) FROM {LLC}.subscriptions WHERE account_id IN (7, 8)")[0]
        self.assertEqual(held, 0, "they hold no subscription")

    def test_llc_cleaned_rows_follow_ledgerloops_rules(self):
        # The rules a raw-data prompt gives: one row per business key (the lowest event_id), the currency from the country, a missing end
        # date for the sentinel, no test account.
        events = f"""SELECT * FROM {LLC}.subscription_events QUALIFY row_number() OVER (PARTITION BY subscription_id, event_type, event_date,
                     mrr_delta_local ORDER BY event_id) = 1"""
        subs = f"""SELECT s.* REPLACE (CASE a.country_code WHEN 'GB' THEN 'GBP' WHEN 'CH' THEN 'CHF' ELSE 'EUR' END AS currency,
                                      nullif(s.end_date, DATE '9999-12-31') AS end_date)
                   FROM {LLC}.subscriptions s JOIN {LLC}.accounts a USING (account_id)"""
        checks = {
            "an mrr_local that is not the deduplicated events' MRR at the end or on the as-of date": f"""SELECT count(*) FROM ({subs}) s
                JOIN (SELECT subscription_id, sum(mrr_delta_local) AS total, sum(mrr_delta_local) FILTER (WHERE event_type <> 'churn') AS before_end
                      FROM ({events}) GROUP BY 1) e USING (subscription_id)
                WHERE (s.end_date IS NULL AND e.total <> s.mrr_local) OR (s.end_date IS NOT NULL AND (e.total <> 0 OR e.before_end <> s.mrr_local))""",
            "a subscription whose MRR at a month end is not positive exactly while it is active": f"""SELECT count(*) FROM ({subs}) s,
                (SELECT CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS d FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)) m
                WHERE ((SELECT coalesce(sum(e.mrr_delta_local), 0) FROM ({events}) e WHERE e.subscription_id = s.subscription_id
                        AND e.event_date <= m.d) > 0) <> (s.start_date <= m.d AND (s.end_date IS NULL OR s.end_date > m.d))""",
            "an invoice that is not the deduplicated MRR in force on its date": f"""SELECT count(*) FROM {LLC}.invoices i JOIN ({subs}) s USING (subscription_id)
                WHERE i.amount_local <> (CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END) * (SELECT sum(e.mrr_delta_local)
                    FROM ({events}) e WHERE e.subscription_id = i.subscription_id AND e.event_date <= i.invoice_date) OR i.account_id <> s.account_id""",
            "a renewal or start with no invoice": f"""SELECT count(*) FROM ({subs}) s, range(0, 72) k(n)
                WHERE CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE)
                      BETWEEN DATE '2024-01-01' AND DATE '2025-12-31'
                  AND (s.end_date IS NULL OR CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE) < s.end_date)
                  AND NOT EXISTS (SELECT 1 FROM {LLC}.invoices i WHERE i.subscription_id = s.subscription_id
                      AND i.invoice_date = CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE))""",
            "an invoice with no successful payment on its Brussels day or the days of its retries": f"""SELECT count(*) FROM {LLC}.invoices i
                WHERE i.status <> 'paid' OR NOT EXISTS (SELECT 1 FROM {LLC}.payments p WHERE p.invoice_id = i.invoice_id AND p.succeeded
                    AND CAST(timezone('Europe/Brussels', p.attempted_at) AS DATE) BETWEEN i.invoice_date AND i.invoice_date + 14)""",
            "an opening event off 2024-01-01, or one of an account created in the window": f"""SELECT count(*) FROM ({events}) e JOIN {LLC}.accounts a USING (account_id)
                WHERE e.event_type = 'opening' AND (e.event_date <> DATE '2024-01-01' OR a.created_at >= TIMESTAMP '2024-01-01')""",
            "a real account created in the window without one new event on its created day": f"""SELECT count(*) FROM {LLC}.accounts a
                WHERE NOT a.is_test AND a.account_name NOT ILIKE '%test%' AND a.created_at >= TIMESTAMP '2024-01-01'
                  AND (SELECT count(*) FROM ({events}) e WHERE e.account_id = a.account_id AND e.event_type = 'new'
                       AND e.event_date = CAST(a.created_at AS DATE)) <> 1""",
            "a churn that is not the subscription's end, or an end with no churn": f"""SELECT count(*) FROM ({subs}) s
                LEFT JOIN ({events}) e ON e.subscription_id = s.subscription_id AND e.event_type = 'churn'
                WHERE (s.end_date IS NULL) <> (e.event_id IS NULL) OR e.event_date <> s.end_date""",
            "a usage week of an account that was not a customer that week, or a customer week with none": f"""SELECT
                (SELECT count(*) FROM {LLC}.usage_weekly u WHERE NOT EXISTS (SELECT 1 FROM ({subs}) s WHERE s.account_id = u.account_id
                    AND s.start_date <= u.week_start + 6 AND (s.end_date IS NULL OR s.end_date > u.week_start)))
                + (SELECT count(*) FROM {LLC}.accounts a, range(DATE '2024-01-01', DATE '2025-12-30', INTERVAL 7 DAY) t(w)
                   WHERE EXISTS (SELECT 1 FROM ({subs}) s WHERE s.account_id = a.account_id AND s.start_date <= CAST(t.w AS DATE) + 6
                                 AND (s.end_date IS NULL OR s.end_date > CAST(t.w AS DATE)))
                     AND NOT EXISTS (SELECT 1 FROM {LLC}.usage_weekly u WHERE u.account_id = a.account_id AND u.week_start = CAST(t.w AS DATE)))""",
            "a won opportunity without its account, or an account in the window with no won opportunity": f"""SELECT
                (SELECT count(*) FROM {LLC}.opportunities o LEFT JOIN {LLC}.accounts a USING (account_id)
                 WHERE (o.is_won IS TRUE) <> (o.account_id IS NOT NULL) OR (o.is_won AND (a.account_id IS NULL OR a.created_at < o.closed_at)))
                + (SELECT count(*) FROM {LLC}.accounts a WHERE NOT a.is_test AND a.account_name NOT ILIKE '%test%'
                   AND a.created_at >= TIMESTAMP '2024-01-01' AND (SELECT count(*) FROM {LLC}.opportunities o WHERE o.account_id = a.account_id) <> 1)""",
            "an app event of an inactive user": f"""SELECT count(*) FROM {LLC}.app_events a JOIN {LLC}.users u USING (user_id)
                WHERE a.account_id <> u.account_id OR u.invited_at > timezone('Europe/Brussels', a.event_ts)
                   OR u.deactivated_at <= timezone('Europe/Brussels', a.event_ts)""",
        }
        for what, sql in checks.items():
            with self.subTest(check=what):
                self.assertEqual(self.one(sql)[0], 0, what)
        for table in ("plans", "fx_rates", "marketing_spend_monthly", "cogs_monthly", "sm_expense_monthly"):
            with self.subTest(copy=table):
                self.assertEqual(self.one(f"SELECT count(*) FROM (SELECT * FROM {LLC}.{table} EXCEPT SELECT * FROM ledgerloop_raw.{table})")[0], 0)
                self.assertEqual(self.one(f"SELECT count(*) FROM {LLC}.{table}")[0], self.one(f"SELECT count(*) FROM ledgerloop_raw.{table}")[0], f"every row of {table}")

    # ---- the descriptions ------------------------------------------------------------------------------------------------------------

    def test_each_description_lists_its_plants_under_their_tables(self):
        wanted = {VM: ["a tie", "at the same moment", "September 2024", "first order", "overlap", "out of stock", "date spine",
                       "just under 2 weeks", "no sale"],
                  MV: ["a tie", "at the same moment", "June 2024", "signed up in November", "without", "clock change", "exactly 30 minutes",
                       "on 26 October 2025", "into 1 January 2025", "into 1 October 2025", "into 13 October 2025"],
                  LL: ["a tie", "at the same moment", "opening", "contraction", "reactivation", "annual", "GBP",
                       "created in November", "without", "clock change", "exactly 30 minutes", "on 26 October 2025", "on 5 December 2025",
                       "25 October in Brussels", "into 20 October", "1 November in Brussels", "1 December in Brussels"],
                  LLC: ["sent twice", "at the same moment", "minutes later", "30 days", "EUR", "9999-12-31", "spelled", "test",
                        "UTC"]}
        for edge, source in MIRRORS.items():
            desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{edge}.json").read_text(encoding="utf-8"))
            tables, views = self.names(edge)
            with self.subTest(schema=edge):
                self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (edge, source, FAMILIES[edge]))
                self.assertEqual(len(set(desc["contains"])), len(desc["contains"]), "no line twice")
                self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables | views, sorted(set(desc["tables"]) - tables - views))
                listed = [line for lines in desc["tables"].values() for line in lines]
                self.assertEqual(set(listed) - set(desc["contains"]), set(), "every table line is a contains line")
                self.assertEqual(set(desc["contains"]) - set(listed), set(), "every contains line sits under a table")
                for table, lines in desc["tables"].items():
                    self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{table}: lines once each, in their order")
                text = " ".join(desc["contains"])
                for word in wanted[edge]:
                    self.assertIn(word, text, f"a line about the plant: {word}")
                if edge == LL:
                    self.assertNotIn("sent twice", text, "S8-C14: the duplicate is ledgerloop_edge_clean's")
                raw = json.dumps(desc, ensure_ascii=False)
                self.assertNotIn("—", raw, "no em dash")
                self.assertNotIn("NULL", raw, "missing, not NULL")
                self.assertNotRegex(raw, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")


class EdgeFiles(unittest.TestCase):
    """A2-build-R3: each pipeline/edge/<stem>.sql creates and inserts only into its own schema, <stem>., so no edge file can move an
    object of another schema (LedgerLoop's 32 included), whatever it reads."""

    def test_each_edge_file_creates_and_inserts_only_into_its_own_schema(self):
        scratch = duckdb.connect(config=NO_NETWORK)
        scratch.execute("SET TimeZone = 'UTC'")
        self.addCleanup(scratch.close)
        files = sorted((ROOT / "pipeline" / "edge").glob("*.sql"))
        self.assertTrue({f"{s}.sql" for s in MIRRORS} <= {f.name for f in files})
        target = re.compile(r"(?is)^(?:CREATE\s+SCHEMA\s+(\w+)|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(\w+)\.\w+|INSERT\s+INTO\s+(\w+)\.\w+)")
        for path in files:
            statements = scratch.extract_statements(path.read_text(encoding="utf-8"))
            with self.subTest(file=path.name):
                self.assertTrue(statements)
                for st in statements:
                    self.assertIn(st.type, (duckdb.StatementType.CREATE, duckdb.StatementType.INSERT), "only CREATE and INSERT")
                    m = target.match(re.sub(r"--[^\n]*", "", st.query).strip())
                    self.assertIsNotNone(m, "a schema-qualified CREATE or INSERT")
                    self.assertEqual(next(g for g in m.groups() if g), path.stem, "it writes only into its own schema")


if __name__ == "__main__":
    unittest.main()

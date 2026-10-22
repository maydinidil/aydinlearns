"""Sprint 7 Part 1, Task A2 (rulings S7-22, S7-25): the two level 5 window edge schemas, voltmarkt_edge_win and mailvora_edge_win.

- Each has its schema's table names (voltmarkt's views included: the build makes them over the edge's own tables) and columns.
- Each plants S7-25's six cases, one test each: a tie at a rank cutoff in two partitions; a partition with one row; a missing value
  in a window ORDER BY column; a month with no rows between two months with rows (LAG's gap); two rows with the same ORDER BY date
  (ROWS against RANGE); a group of 3 rows under NTILE(5).
- The rank cutoffs are exact (S7-22, C53): for each ranking the description and the generator brief name, the partitions where
  ROW_NUMBER and RANK keep different rows at each cutoff are the ones listed here, so an item knows which cutoff its edge run tests.
- Every table and view of manifest_before_sprint7.json keeps its rows and hash (R37): Part 1 only adds the two schemas, and no
  existing edge schema changes.
- Each schema's rows follow its company's rules (Voltmarkt's E-103 prices, store rules and cost versions; Mailvora's sessions on
  days their campaign had clicks, payments inside their subscription), and its description lists each plant under its tables.

Assertions name schemas, tables, IDs and counts only.
"""
import datetime as dt
import json
import pathlib
import shutil
import tempfile
import unittest

import duckdb

from course_build import build_course_db   # L50: the paths, and Mailvora generated once per process (S7-30)

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(build_course_db.ROOT)
VM = "voltmarkt_edge_win"
MV = "mailvora_edge_win"
# R37: every table and view as built before sprint 7 (Task 0). Sprint 7 Part 1 only adds the two window edge schemas.
BEFORE_SPRINT7 = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint7.json").read_text(encoding="utf-8"))["tables"]
# Every table and view as built at the end of Part 1 (G0). Part 2's own additions are held by their own tests
# (mailvora_edge_clean: pipeline/tests/test_mailvora_edge_clean.py), so Part 1's are the objects of this snapshot.
BEFORE_SPRINT7B = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint7b.json").read_text(encoding="utf-8"))["tables"]
VOLTMARKT_VIEWS = {"sales", "competitor_price_weekly", "weekly_units"}
# The span of voltmarkt_edge_win: its calendar holds every day of it, and its orders fall in every month of it but April.
VM_SPAN = (dt.date(2025, 1, 1), dt.date(2025, 6, 30))


def ranked(source, order, n):
    """The partitions of `source` (rows of part, id, val) where ROW_NUMBER and RANK, over `order` within each partition, keep
    different rows at the cutoff n: the ties at that cutoff, which a query with the other tie rule meets (S7-22)."""
    return f"""WITH r AS (SELECT part,
                   row_number() OVER (PARTITION BY part ORDER BY val {order}, id) AS rn,
                   rank() OVER (PARTITION BY part ORDER BY val {order}) AS rk
               FROM ({source}))
               SELECT part FROM r GROUP BY part HAVING count(*) FILTER (WHERE rn <= {n}) <> count(*) FILTER (WHERE rk <= {n}) ORDER BY part"""


# The rankings each schema's description names, as (part, id, val) rows, and where their ties sit: {(order, cutoff): partitions}.
VM_RANKINGS = {
    "unit cost within category": (
        f"SELECT category_id AS part, product_id AS id, unit_cost_eur AS val FROM {VM}.products",
        {("DESC", 1): [2, 16], ("DESC", 2): [1, 35], ("DESC", 3): [2, 16], ("ASC", 2): [1, 2, 16, 35]}),
    "revenue within category": (
        f"""SELECT p.category_id AS part, p.product_id AS id, sum(s.net_revenue_eur) AS val
            FROM {VM}.sales s JOIN {VM}.products p USING (product_id) GROUP BY ALL""",
        {("DESC", 1): [2, 16], ("DESC", 2): [1, 35], ("DESC", 3): [2, 16]}),
    "latest order per customer": (
        f"SELECT customer_id AS part, order_id AS id, order_ts AS val FROM {VM}.orders WHERE customer_id IS NOT NULL",
        {("DESC", 1): [3001, 3002]}),
    "latest competitor check per product": (
        f"SELECT product_id AS part, competitor AS id, observed_ts AS val FROM {VM}.competitor_prices",
        {("DESC", 1): [1, 6]}),
}
MV_RANKINGS = {
    "spend within channel": (
        f"""SELECT c.channel_id AS part, a.campaign_id AS id, sum(a.spend) AS val
            FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id) GROUP BY ALL""",
        {("DESC", 1): [1, 3], ("DESC", 2): [2, 6], ("DESC", 3): [1, 3]}),
    "clicks within channel": (
        f"""SELECT c.channel_id AS part, a.campaign_id AS id, sum(a.clicks) AS val
            FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id) GROUP BY ALL""",
        {("DESC", 1): [1, 3], ("DESC", 2): [2, 6], ("DESC", 3): [1, 3]}),
    "first session per visitor": (
        f"SELECT visitor_id AS part, session_id AS id, session_start AS val FROM {MV}.sessions",
        {("ASC", 1): ["V9100002", "V9100003"]}),
}


class EdgeWin(unittest.TestCase):
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

    # ---- the schemas, their names and the lock on everything else -----------------------------------------------------------------

    def test_each_schema_has_its_schemas_table_names_and_columns(self):
        for edge, source in ((VM, "voltmarkt"), (MV, "mailvora")):
            tables, views = self.names(edge)
            with self.subTest(schema=edge):
                self.assertEqual((tables, views), self.names(source), f"{edge} has {source}'s table and view names")
                for t in tables | views:
                    self.assertEqual(self.columns(edge, t), self.columns(source, t), f"{edge}.{t} mirrors {source}.{t}")
        self.assertEqual(self.names(VM)[1], VOLTMARKT_VIEWS, "the build's three views, over the edge's own tables")
        self.assertEqual(self.names(MV)[1], set(), "Mailvora has no view")
        span_days = (VM_SPAN[1] - VM_SPAN[0]).days + 1
        products, weeks = self.one(f"SELECT (SELECT count(*) FROM {VM}.products), (SELECT count(DISTINCT week_start) FROM {VM}.calendar)")
        caps = {"calendar": span_days, "weekly_units": products * weeks}
        for edge in (VM, MV):
            tables, views = self.names(edge)
            for t in sorted(tables | views):
                rows = self.one(f"SELECT count(*) FROM {edge}.{t}")[0]
                with self.subTest(table=f"{edge}.{t}"):
                    self.assertTrue(1 <= rows <= (caps.get(t, 60) if edge == VM else 60), f"{edge}.{t} has {rows} rows")

    def test_every_object_before_sprint7_is_unchanged_and_part_1_only_adds_the_two_schemas(self):
        self.assertEqual(len(BEFORE_SPRINT7), 219)
        moved = sorted(name for name, entry in BEFORE_SPRINT7.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects built before sprint 7 whose rows or hash changed")
        added = sorted((set(self.manifest["tables"]) & set(BEFORE_SPRINT7B)) - set(BEFORE_SPRINT7))
        expected = sorted([f"{VM}.{t}" for t in set().union(*self.names("voltmarkt"))]
                          + [f"{MV}.{t}" for t in set().union(*self.names("mailvora"))])
        self.assertEqual(added, expected, "only the two window edge schemas are new")
        self.assertEqual(len(added), 16 + 11)

    def test_the_build_makes_weekly_units_over_the_window_edge_schema(self):
        self.assertIn(VM, build_course_db.WEEKLY_UNITS_SCHEMAS, "its items see weekly_units in the panel from level 4 (P11)")
        units, lines = self.one(f"SELECT (SELECT sum(units) FROM {VM}.weekly_units), (SELECT sum(quantity) FROM {VM}.order_lines)")
        self.assertEqual(units, lines, "weekly_units adds up to the order lines' units")

    # ---- S7-25 on voltmarkt_edge_win (one test per plant) ---------------------------------------------------------------------------

    def test_vm_ties_at_rank_cutoffs_in_two_partitions(self):
        for name, (source, cutoffs) in VM_RANKINGS.items():
            for (order, n), parts in cutoffs.items():
                with self.subTest(ranking=name, order=order, cutoff=n):
                    got = self.col(ranked(source, order, n))
                    self.assertEqual(got, parts, f"{name}: partitions with a tie at the top-{n} cutoff ({order})")
                    self.assertGreaterEqual(len(got), 2, "a tie at the cutoff in two partitions (S7-25)")
        # The generator brief's revenue row: over all the edge orders with no partition, products 1 and 2 tie for first.
        first = self.col(f"""SELECT product_id FROM (SELECT product_id, sum(net_revenue_eur) AS revenue FROM {VM}.sales GROUP BY 1)
                             QUALIFY rank() OVER (ORDER BY revenue DESC) = 1 ORDER BY 1""")
        self.assertEqual(first, [1, 2], "revenue with no partition: products 1 and 2 tie for first, and no other product")

    def test_vm_partitions_with_one_row(self):
        self.assertIn(17, self.col(f"SELECT category_id FROM {VM}.products GROUP BY 1 HAVING count(*) = 1"), "a category with one product")
        self.assertIn(24, self.col(f"SELECT store_id FROM {VM}.orders GROUP BY 1 HAVING count(*) = 1"), "a store with one order")
        self.assertEqual(self.col(f"SELECT customer_id FROM {VM}.orders WHERE customer_id IS NOT NULL GROUP BY 1 HAVING count(*) = 1 ORDER BY 1"),
                         [3003, 3006], "customers with one order")
        self.assertIn(11, self.col(f"SELECT product_id FROM {VM}.competitor_prices GROUP BY 1 HAVING count(*) = 1"), "a product checked once")

    def test_vm_a_missing_value_in_a_window_order_by_column(self):
        self.assertEqual(self.col(f"SELECT product_id FROM {VM}.products WHERE launch_date IS NULL"), [5], "one product with no launch date")
        others = self.one(f"""SELECT count(*) FROM {VM}.products WHERE launch_date IS NOT NULL
                              AND category_id = (SELECT category_id FROM {VM}.products WHERE product_id = 5)""")[0]
        self.assertGreaterEqual(others, 3, "in a category whose other products have one, so it changes a ranking by launch date")
        self.assertGreater(self.one(f"SELECT count(*) FROM {VM}.sales WHERE product_id = 5")[0], 0, "and it sold")

    def test_vm_a_month_with_no_rows_between_two_months_with_rows(self):
        months = [str(m) for m in self.col(f"SELECT DISTINCT CAST(date_trunc('month', order_ts) AS DATE) FROM {VM}.orders ORDER BY 1")]
        self.assertEqual(months, ["2025-01-01", "2025-02-01", "2025-03-01", "2025-05-01", "2025-06-01"], "no order in April 2025")
        april = self.one(f"SELECT count(*) FROM {VM}.calendar WHERE cal_date BETWEEN DATE '2025-04-01' AND DATE '2025-04-30'")[0]
        self.assertEqual(april, 30, "the calendar holds April, so a date spine shows it")
        gaps = self.col(f"""SELECT customer_id FROM (SELECT customer_id, date_trunc('month', order_ts) AS m,
                                   lag(date_trunc('month', order_ts)) OVER (PARTITION BY customer_id ORDER BY order_ts, order_id) AS prev
                               FROM {VM}.orders WHERE customer_id IS NOT NULL)
                            WHERE prev < m - INTERVAL 1 MONTH GROUP BY 1 ORDER BY 1""")
        self.assertIn(3004, gaps, "a customer whose previous order is months back")

    def test_vm_two_rows_with_the_same_order_by_date(self):
        same = self.one(f"""SELECT count(*) FROM (SELECT store_id, CAST(order_ts AS DATE) FROM {VM}.orders
                            GROUP BY ALL HAVING count(*) > 1)""")[0]
        self.assertGreater(same, 0, "a store with two orders on one day")
        moment = self.col(f"""SELECT customer_id FROM {VM}.orders WHERE customer_id IS NOT NULL
                              GROUP BY customer_id, order_ts HAVING count(*) > 1 ORDER BY 1""")
        self.assertEqual(moment, [3001, 3002], "two customers with two orders at the same moment")
        differ = self.one(f"""SELECT count(*) FROM (SELECT
                                  sum(net_revenue_eur) OVER (PARTITION BY store_code ORDER BY order_date) AS by_range,
                                  sum(net_revenue_eur) OVER (PARTITION BY store_code ORDER BY order_date, order_line_id
                                                             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS by_rows
                              FROM {VM}.sales) WHERE by_range <> by_rows""")[0]
        self.assertGreater(differ, 0, "a running total by date differs between the default RANGE frame and ROWS")

    def test_vm_two_customers_last_ordered_on_the_same_day(self):
        # E-203 (CASE-RETAIL-05 runs on this schema): R uses NTILE(5) with customer_id as the tie-break, so a tie in the last order day
        # across an NTILE boundary is what tells the tie-break's direction apart (C53 on an NTILE cutoff).
        days = self.col(f"""SELECT customer_id FROM (SELECT customer_id, max(CAST(order_ts AS DATE)) AS last_day FROM {VM}.orders
                                WHERE customer_id IS NOT NULL GROUP BY 1)
                            QUALIFY count(*) OVER (PARTITION BY last_day) > 1 ORDER BY 1""")
        self.assertEqual(days, [3001, 3004], "two customers whose last orders fall on the same day")
        flips = self.one(f"""WITH c AS (SELECT customer_id, max(CAST(order_ts AS DATE)) AS last_day FROM {VM}.orders
                                        WHERE customer_id IS NOT NULL GROUP BY 1)
                             SELECT count(*) FROM (SELECT customer_id, ntile(5) OVER (ORDER BY last_day DESC, customer_id) AS a,
                                                          ntile(5) OVER (ORDER BY last_day DESC, customer_id DESC) AS b FROM c)
                             WHERE a <> b""")[0]
        self.assertEqual(flips, 2, "NTILE(5) by last order day puts them in different buckets by the tie-break's direction")

    def test_vm_a_group_of_three_rows_under_ntile_5(self):
        self.assertEqual(self.one(f"SELECT count(*) FROM {VM}.products WHERE category_id = 15")[0], 3, "Headphones has three products")
        top = self.one(f"SELECT max(t) FROM (SELECT ntile(5) OVER (ORDER BY product_id) AS t FROM {VM}.products WHERE category_id = 15)")[0]
        self.assertEqual(top, 3, "NTILE(5) over 3 rows fills buckets 1 to 3 only")
        self.assertEqual(self.one(f"SELECT count(*) FROM {VM}.orders WHERE customer_id = 3004")[0], 3, "a customer with three orders")

    # ---- voltmarkt_edge_win follows Voltmarkt's rules ----------------------------------------------------------------------------

    def test_vm_lines_follow_e103_and_orders_follow_their_store(self):
        bad = self.one(f"""
            WITH l AS (SELECT ol.*, CAST(o.order_ts AS DATE) AS d FROM {VM}.order_lines ol JOIN {VM}.orders o USING (order_id))
            SELECT
              count(*) FILTER (WHERE l.unit_price_eur IS DISTINCT FROM (SELECT ph.list_price_eur FROM {VM}.price_history ph
                                WHERE ph.product_id = l.product_id AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to))),
              count(*) FILTER (WHERE l.promo_id IS NOT NULL AND l.line_discount_eur IS DISTINCT FROM
                                (SELECT round(l.quantity * l.unit_price_eur * pr.discount_pct / 100, 2) FROM {VM}.promotions pr
                                 JOIN {VM}.promotion_products pp ON pp.promo_id = pr.promo_id AND pp.product_id = l.product_id
                                 WHERE pr.promo_id = l.promo_id AND l.d BETWEEN pr.start_date AND pr.end_date)),
              count(*) FILTER (WHERE l.promo_id IS NULL AND (l.line_discount_eur <> 0 OR EXISTS (
                                SELECT 1 FROM {VM}.promotions pr JOIN {VM}.promotion_products pp ON pp.promo_id = pr.promo_id
                                WHERE pp.product_id = l.product_id AND l.d BETWEEN pr.start_date AND pr.end_date))),
              count(*) FILTER (WHERE l.d < (SELECT coalesce(launch_date, (SELECT min(valid_from) FROM {VM}.price_history h
                                                                          WHERE h.product_id = p.product_id))
                                            FROM {VM}.products p WHERE p.product_id = l.product_id)),
              count(*) FILTER (WHERE l.promo_id IS NOT NULL)
            FROM l""")
        self.assertEqual(tuple(x or 0 for x in bad[:4]), (0, 0, 0, 0),
                         "lines off the list price, off their promotion, sold in a promotion without it, or before launch")
        self.assertGreater(bad[4], 0, "a line on promotion")
        stores = self.one(f"""SELECT count(*) FROM {VM}.orders o JOIN {VM}.stores st USING (store_id)
                              WHERE (o.channel = 'web') <> (st.store_id = 99) OR (o.channel = 'store' AND o.ship_to_country <> st.country_code)
                                 OR CAST(o.order_ts AS DATE) < st.opened_on OR CAST(o.order_ts AS DATE) > st.close_date""")[0]
        self.assertEqual(stores, 0, "orders follow their store (E-016, open dates)")
        orphans = self.one(f"""SELECT (SELECT count(*) FROM {VM}.order_lines WHERE order_id NOT IN (SELECT order_id FROM {VM}.orders)),
                                      (SELECT count(*) FROM {VM}.orders WHERE order_id NOT IN (SELECT order_id FROM {VM}.order_lines)),
                                      (SELECT count(*) FROM {VM}.products WHERE category_id NOT IN (SELECT category_id FROM {VM}.categories)),
                                      (SELECT count(*) FROM {VM}.order_lines WHERE product_id NOT IN (SELECT product_id FROM {VM}.products))""")
        self.assertEqual(orphans, (0, 0, 0, 0), "every line has its order and product, every order its lines, every product its category")

    def test_vm_versions_are_contiguous_and_start_at_launch(self):
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
        changed = self.one(f"SELECT count(*) FROM (SELECT product_id FROM {VM}.price_history GROUP BY 1 HAVING count(*) >= 3)")[0]
        self.assertGreater(changed, 0, "a product whose price changed twice, so LAG and FIRST_VALUE have something to read")

    def test_vm_calendar_is_every_day_of_its_span_and_holds_every_order_date(self):
        rows, days, first, last = self.one(f"SELECT count(*), count(DISTINCT cal_date), min(cal_date), max(cal_date) FROM {VM}.calendar")
        span = (VM_SPAN[1] - VM_SPAN[0]).days + 1
        self.assertEqual((rows, days, first, last), (span, span, *VM_SPAN))
        foreign = self.one(f"SELECT count(*) FROM (SELECT * FROM {VM}.calendar EXCEPT SELECT * FROM voltmarkt.calendar)")[0]
        self.assertEqual(foreign, 0, "each row is voltmarkt's row for that day")
        outside = self.one(f"""SELECT (SELECT count(*) FROM {VM}.orders WHERE CAST(order_ts AS DATE) NOT IN (SELECT cal_date FROM {VM}.calendar)),
                                      (SELECT count(*) FROM {VM}.promotions WHERE start_date < DATE '2025-01-01' OR end_date > DATE '2025-06-30')""")
        self.assertEqual(outside, (0, 0), "every order date and every promotion day is in the calendar")

    # ---- S7-25 on mailvora_edge_win (one test per plant) ---------------------------------------------------------------------------

    def test_mv_ties_at_rank_cutoffs_in_two_partitions(self):
        for name, (source, cutoffs) in MV_RANKINGS.items():
            for (order, n), parts in cutoffs.items():
                with self.subTest(ranking=name, order=order, cutoff=n):
                    got = self.col(ranked(source, order, n))
                    self.assertEqual(got, parts, f"{name}: partitions with a tie at the top-{n} cutoff ({order})")
                    self.assertGreaterEqual(len(got), 2, "a tie at the cutoff in two partitions (S7-25)")

    def test_mv_partitions_with_one_row(self):
        self.assertEqual(self.col(f"SELECT channel_id FROM {MV}.campaigns GROUP BY 1 HAVING count(*) = 1"), [4], "a channel with one campaign")
        rows = self.one(f"SELECT count(*) FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id) WHERE c.channel_id = 4")[0]
        self.assertEqual(rows, 1, "which spent on one day")
        self.assertIn("V9100004", self.col(f"SELECT visitor_id FROM {MV}.sessions GROUP BY 1 HAVING count(*) = 1"), "a visitor with one session")

    def test_mv_a_missing_value_in_a_window_order_by_column(self):
        active = self.one(f"SELECT count(*) FROM {MV}.subscriptions WHERE end_date IS NULL")[0]
        self.assertGreaterEqual(active, 2, "active plans have no end date")
        changed = self.col(f"""SELECT user_id FROM {MV}.subscriptions GROUP BY 1
                               HAVING count(*) = 2 AND count(end_date) = 1 AND max(start_date) = max(start_date) FILTER (WHERE end_date IS NULL)""")
        self.assertEqual(changed, [1], "a user whose plan changed: the ended plan has an end date, the later plan none")

    def test_mv_a_month_with_no_rows_between_two_months_with_rows(self):
        months = [str(m) for m in self.col(f"SELECT DISTINCT CAST(date_trunc('month', spend_date) AS DATE) FROM {MV}.ad_spend_daily ORDER BY 1")]
        self.assertEqual(months, ["2025-07-01", "2025-08-01", "2025-10-01"], "no ad spend in September 2025")
        per_channel = self.col(f"""SELECT c.channel_id FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id)
                                   GROUP BY 1 HAVING count(DISTINCT month(a.spend_date)) = 3 ORDER BY 1""")
        self.assertEqual(per_channel, [1, 2, 3, 5, 6], "each channel that spent in July, August and October skips September")
        spine = self.col(f"SELECT DISTINCT channel_id FROM {MV}.budget_monthly WHERE month = DATE '2025-09-01' ORDER BY 1")
        self.assertEqual(spine, [1, 2, 3, 4, 5, 6], "budget_monthly holds September for every channel, so a month spine shows it")
        skipped = self.col(f"""SELECT subscription_id FROM {MV}.payments GROUP BY 1
                               HAVING count(*) FILTER (WHERE date_trunc('month', paid_at) = TIMESTAMPTZ '2025-08-01 00:00:00+00') = 1
                                  AND count(*) FILTER (WHERE date_trunc('month', paid_at) = TIMESTAMPTZ '2025-09-01 00:00:00+00') = 0
                                  AND count(*) FILTER (WHERE date_trunc('month', paid_at) = TIMESTAMPTZ '2025-10-01 00:00:00+00') = 1""")
        self.assertEqual(skipped, [3], "a subscription paid in August and October and not in September")

    def test_mv_two_rows_with_the_same_order_by_date(self):
        same = self.col(f"""SELECT DISTINCT channel_id FROM (SELECT c.channel_id, a.spend_date
                                FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id) GROUP BY ALL HAVING count(*) > 1)
                            ORDER BY 1""")
        self.assertEqual(same, [1, 2, 3], "channels with two campaigns' spend on one day")
        differ = self.one(f"""SELECT count(*) FROM (SELECT
                                  sum(a.spend) OVER (PARTITION BY c.channel_id ORDER BY a.spend_date) AS by_range,
                                  sum(a.spend) OVER (PARTITION BY c.channel_id ORDER BY a.spend_date, a.campaign_id
                                                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS by_rows
                              FROM {MV}.ad_spend_daily a JOIN {MV}.campaigns c USING (campaign_id)) WHERE by_range <> by_rows""")[0]
        self.assertGreater(differ, 0, "a running spend by day differs between the default RANGE frame and ROWS")
        days = self.one(f"SELECT count(*) FROM (SELECT CAST(signup_ts AS DATE) FROM {MV}.signups GROUP BY 1 HAVING count(*) > 1)")[0]
        self.assertGreater(days, 0, "two signups on one day")

    def test_mv_a_group_of_three_rows_under_ntile_5(self):
        self.assertEqual(self.one(f"SELECT count(*) FROM {MV}.campaigns WHERE channel_id = 5")[0], 3, "YouTube has three campaigns")
        top = self.one(f"SELECT max(t) FROM (SELECT ntile(5) OVER (ORDER BY campaign_id) AS t FROM {MV}.campaigns WHERE channel_id = 5)")[0]
        self.assertEqual(top, 3, "NTILE(5) over 3 rows fills buckets 1 to 3 only")
        self.assertIn(4, self.col(f"SELECT subscription_id FROM {MV}.payments GROUP BY 1 HAVING count(*) = 3"), "a subscription with three payments")

    def test_mv_a_daily_series_for_moving_averages(self):
        days, first, last = self.one(f"SELECT count(*), min(spend_date), max(spend_date) FROM {MV}.ad_spend_daily WHERE campaign_id = 1")
        self.assertGreaterEqual(days, 8, "one campaign with a daily series longer than a 7-day window")
        self.assertEqual((last - first).days + 1 - days, 1, "with one day missing inside it, so 7 rows are not 7 days")
        averaged, pooled = self.one(f"""SELECT avg(clicks * 1.0 / impressions), sum(clicks) * 1.0 / sum(impressions)
                                        FROM {MV}.ad_spend_daily WHERE campaign_id = 1""")
        self.assertNotAlmostEqual(averaged, pooled, places=4, msg="the average of daily CTRs is not the CTR of the sums (ERR-LOG-20)")

    # ---- mailvora_edge_win follows Mailvora's rules ------------------------------------------------------------------------------

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
            "a signup before its visitor's first session": f"""SELECT count(*) FROM {MV}.signups u WHERE u.signup_ts < (SELECT min(session_start)
                FROM {MV}.sessions x WHERE x.visitor_id = u.visitor_id)""",
            "a subscription of no signup, or one that starts before the signup": f"""SELECT count(*) FROM {MV}.subscriptions s
                LEFT JOIN {MV}.signups u USING (user_id) WHERE u.user_id IS NULL OR s.start_date < CAST(u.signup_ts AS DATE)""",
            "a payment outside its subscription or of another amount": f"""SELECT count(*) FROM {MV}.payments p JOIN {MV}.subscriptions s USING (subscription_id)
                WHERE CAST(p.paid_at AS DATE) < s.start_date OR CAST(p.paid_at AS DATE) > coalesce(s.end_date, DATE '2025-12-31')
                   OR p.amount_eur <> s.monthly_price_eur""",
            "an activation event before its signup": f"""SELECT count(*) FROM {MV}.activation_events e JOIN {MV}.signups u USING (user_id)
                WHERE e.event_ts < u.signup_ts""",
            "a country no table of countries holds": f"""SELECT count(*) FROM (SELECT country_code FROM {MV}.sessions UNION ALL
                SELECT country_code FROM {MV}.signups) WHERE country_code NOT IN (SELECT country_code FROM {MV}.countries)""",
        }
        for what, sql in checks.items():
            with self.subTest(check=what):
                self.assertEqual(self.one(sql)[0], 0, what)
        self.assertEqual(self.one(f"SELECT count(*) FROM (SELECT * FROM {MV}.channels EXCEPT SELECT * FROM mailvora.channels)")[0], 0)
        self.assertEqual(self.one(f"SELECT count(*) FROM (SELECT * FROM {MV}.countries EXCEPT SELECT * FROM mailvora.countries)")[0], 0)

    # ---- the descriptions ------------------------------------------------------------------------------------------------------------

    def test_each_description_lists_its_plants_under_their_tables(self):
        for edge, source in ((VM, "voltmarkt"), (MV, "mailvora")):
            desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{edge}.json").read_text(encoding="utf-8"))
            tables, views = self.names(edge)
            with self.subTest(schema=edge):
                self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (edge, source, "win"))
                self.assertGreaterEqual(len(desc["contains"]), 6, "S7-25's six plants")
                if edge == VM:
                    self.assertIn("two customers whose last orders fall on the same day", desc["contains"], "E-203's recency tie")
                self.assertEqual(len(set(desc["contains"])), len(desc["contains"]), "no line twice")
                self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables | views, sorted(set(desc["tables"]) - tables - views))
                listed = [line for lines in desc["tables"].values() for line in lines]
                self.assertEqual(set(listed) - set(desc["contains"]), set(), "every table line is a contains line")
                self.assertEqual(set(desc["contains"]) - set(listed), set(), "every contains line sits under a table")
                for table, lines in desc["tables"].items():
                    self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{table}: lines once each, in their order")
                text = json.dumps(desc, ensure_ascii=False)
                self.assertNotIn("—", text, "no em dash")
                self.assertNotIn("NULL", text, "missing, not NULL")
                self.assertNotRegex(text, r"\b(he|she|him|her|his|hers)\b", "no gendered pronoun")


if __name__ == "__main__":
    unittest.main()

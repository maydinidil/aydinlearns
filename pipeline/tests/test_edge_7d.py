"""Sprint 7d, Task K2 (S7D-13): three data plants in two edge schemas, one test each, and the lock on everything else.

- CASE-RETAIL-05's money tie (backlog "CASE-RETAIL-05's money tie rule is never exercised"): in voltmarkt_edge_win two customers'
  revenue ties across the money score's 3|4 boundary (NTILE(5) by revenue, customer_id as the tie-break, E-007 and E-203), and one
  of them has a recent last order and four or more orders, so the tie-break's direction decides whether that customer is a champion.
- Q-03-07 (backlog "Mailvora edge schemas: Q-03-07's refunded-share plant catches only a hard-coded share"): mailvora_edge_clean holds
  a month with ad spend in which every payment is refunded, a shape mailvora_raw lacks, so a month's revenue is 0 there: a share
  fitted to mailvora_raw's 4%, or a sum of the payments that were not refunded with no 0 for a month without one, gives another value.
- EX-MOCK-CASE-A's edge (backlog "EX-MOCK-CASE-A's edge adds little"): voltmarkt_edge_win's 2025 promotions start on the day of a
  price rise, 14 days after a rise and a cut, and 15 days after a rise, on price versions that are each product's last; one product
  is in two 2025 promotions on one price version.
- Every table and view of manifest_before_sprint7d.json outside the planted tables keeps its rows and hash (R37, S7D-13). The sales
  view of voltmarkt_edge_win moves by its row count only: its rows follow order_lines, and its SQL text stays.
- Each schema's description lists the new plants under their tables.

Each schema's rows still follow its company's rules: pipeline/tests/test_edge_win.py holds voltmarkt_edge_win to them, and
pipeline/tests/test_mailvora_edge_clean.py holds mailvora_edge_clean. Assertions name schemas, tables, IDs and counts only.
"""
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
MV = "mailvora_edge_clean"
MV_RAW = build_course_db.MAILVORA_RAW_SCHEMA
# R37, S7D-13: every table and view as built before K2 (data/manifest.json at the start of sprint 7d's wave B).
BEFORE_SPRINT7D = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint7d.json").read_text(encoding="utf-8"))["tables"]
# The tables K2 plants in, and their rows after it.
PLANTED = {f"{VM}.order_lines": 41, f"{VM}.promotions": 5, f"{VM}.promotion_products": 7, f"{MV}.ad_spend_daily": 24,
           f"{MV}.fx_rates_monthly": 8, f"{MV}.payments": 10}
# A view over a planted table: its row count follows the table's, its SQL text stays.
FOLLOWS = {f"{VM}.sales": f"{VM}.order_lines"}

# Each known customer's last order day, orders and revenue in voltmarkt_edge_win (every order is in 2025).
CUSTOMERS = f"""SELECT o.customer_id, max(CAST(o.order_ts AS DATE)) AS last_day, count(DISTINCT o.order_id) AS orders,
                       sum(l.quantity * l.unit_price_eur - l.line_discount_eur) AS revenue
                FROM {VM}.orders o JOIN {VM}.order_lines l USING (order_id)
                WHERE o.customer_id IS NOT NULL AND o.order_ts >= TIMESTAMP '2025-01-01' AND o.order_ts < TIMESTAMP '2026-01-01'
                GROUP BY o.customer_id"""
# Each 2025 promotion's products with the price version in effect on its start_date: the change from the version before it (by
# valid_from, within the product), the days from that version's valid_from to the start_date, and whether it is the product's last.
VERSIONS_ON_START = f"""WITH v AS (
    SELECT product_id, valid_from, valid_to, list_price_eur,
           lag(list_price_eur) OVER (PARTITION BY product_id ORDER BY valid_from) AS price_before,
           lead(valid_from) OVER (PARTITION BY product_id ORDER BY valid_from) AS next_from
    FROM {VM}.price_history)
SELECT pr.promo_id, pp.product_id, v.valid_from,
       CASE WHEN v.list_price_eur > v.price_before THEN 'raised' WHEN v.list_price_eur < v.price_before THEN 'cut' END AS change,
       pr.start_date - v.valid_from AS days, v.next_from IS NULL AS last_version
FROM {VM}.promotions pr JOIN {VM}.promotion_products pp USING (promo_id)
JOIN v ON v.product_id = pp.product_id AND v.valid_from <= pr.start_date AND (v.valid_to >= pr.start_date OR v.valid_to IS NULL)
WHERE pr.start_date BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'"""


class Edge7d(unittest.TestCase):
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

    # ---- S7D-13: only the planted tables move -----------------------------------------------------------------------------------

    def test_only_the_planted_tables_move(self):
        self.assertEqual(len(BEFORE_SPRINT7D), 253)
        built = self.manifest["tables"]
        self.assertEqual(sorted(set(built) ^ set(BEFORE_SPRINT7D)), [], "K2 adds and drops no table or view")
        moved = sorted(name for name, entry in BEFORE_SPRINT7D.items() if built[name] != entry)
        self.assertEqual(moved, sorted([*PLANTED, *FOLLOWS]), "objects whose rows or hash changed")
        for name, rows in PLANTED.items():
            with self.subTest(table=name):
                self.assertEqual(built[name]["rows"], rows)
                self.assertNotEqual(built[name]["sha256"], BEFORE_SPRINT7D[name]["sha256"], "its rows changed")
        for view, table in FOLLOWS.items():
            with self.subTest(view=view):
                self.assertEqual(built[view]["view_sql_sha256"], BEFORE_SPRINT7D[view]["view_sql_sha256"], "the view's SQL text stays")
                self.assertEqual(built[view]["rows"], built[table]["rows"], "its rows are the lines'")

    # ---- CASE-RETAIL-05: a revenue tie at the money score's 3|4 boundary -------------------------------------------------------

    def test_retail_05_a_revenue_tie_across_the_money_scores_3_4_boundary(self):
        tied = self.col(f"SELECT customer_id FROM ({CUSTOMERS}) QUALIFY count(*) OVER (PARTITION BY revenue) > 1 ORDER BY 1")
        self.assertEqual(tied, [3002, 3006], "two customers with the same revenue, and no other tie")
        scores = self.con.execute(f"""SELECT customer_id, orders,
                                             ntile(5) OVER (ORDER BY last_day, customer_id) AS r_score,
                                             ntile(5) OVER (ORDER BY revenue, customer_id) AS m_lower_id_first,
                                             ntile(5) OVER (ORDER BY revenue, customer_id DESC) AS m_higher_id_first
                                      FROM ({CUSTOMERS}) ORDER BY customer_id""").fetchall()
        flips = {c: (a, b) for c, _, _, a, b in scores if a != b}
        self.assertEqual(sorted(flips), [3002, 3006], "reversing the money score's tie-break moves only the two tied customers")
        self.assertEqual({flips[3002], flips[3006]}, {(3, 4), (4, 3)}, "across the boundary between M 3 and M 4")
        by_id = {c: (orders, r) for c, orders, r, _, _ in scores}
        self.assertGreaterEqual(by_id[3002][1], 4, "customer 3002 has an R score of 4 or more")
        self.assertGreaterEqual(by_id[3002][0], 4, "and 4 or more orders, so M 4 or more makes a champion")
        self.assertEqual(by_id[3006][0], 1, "customer 3006 has one order, so its M score changes no segment")
        # The lines K2 moves and adds keep the webshop's tie at its 60% revenue mark, where a RANGE frame and a ROWS frame part.
        web = self.con.execute(f"""SELECT product_id, revenue,
                                          (sum(revenue) OVER (ORDER BY revenue DESC, product_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                                           - revenue < 0.6 * sum(revenue) OVER ()) <>
                                          (sum(revenue) OVER (ORDER BY revenue DESC) - revenue < 0.6 * sum(revenue) OVER ()) AS frames_part
                                   FROM (SELECT product_id, sum(net_revenue_eur) AS revenue FROM {VM}.sales WHERE store_code = 'WEB-01' GROUP BY 1)""").fetchall()
        self.assertEqual(sorted(p for p, _, part in web if part), [12], "only product 12 is inside the webshop's 60% by ROWS and outside it by RANGE")
        revenue = {p: r for p, r, _ in web}
        self.assertTrue(revenue[12] == revenue[19], "products 12 and 19 tie in the webshop")

    # ---- Q-03-07: a month with spend in which every payment is refunded --------------------------------------------------------

    def test_q_03_07_a_month_with_spend_where_every_payment_is_refunded(self):
        all_refunded = """SELECT CAST(date_trunc('month', paid_at) AS DATE) FROM {s}.payments GROUP BY 1 HAVING bool_and(refunded) ORDER BY 1"""
        self.assertEqual(self.col(all_refunded.format(s=MV_RAW)), [], "mailvora_raw has no month in which every payment is refunded")
        self.assertEqual([str(m) for m in self.col(all_refunded.format(s=MV))], ["2025-10-01"], f"{MV} has one: October 2025")
        spend = self.one(f"""SELECT count(*), count(*) FILTER (WHERE currency = 'EUR' AND export_timezone = 'UTC') FROM {MV}.ad_spend_daily
                             WHERE CASE WHEN export_timezone = 'America/Los_Angeles' THEN spend_date + 1 ELSE spend_date END
                                   BETWEEN DATE '2025-10-01' AND DATE '2025-10-31'""")
        self.assertEqual(spend, (1, 1), "a month with ad spend by UTC day, one row in euros and UTC, so a monthly return has a row for it")
        rates = self.col(f"SELECT currency FROM {MV}.fx_rates_monthly WHERE month = DATE '2025-10-01' ORDER BY 1")
        self.assertEqual(rates, ["GBP", "USD"], "and fx_rates_monthly holds that month's rates, as it holds every month's")
        months = """SELECT CAST(date_trunc('month', paid_at) AS DATE) AS m, sum(amount_eur) AS paid,
                           sum(amount_eur) FILTER (WHERE NOT refunded) AS kept FROM {s}.payments GROUP BY 1"""
        no_revenue = "SELECT count(*) FILTER (WHERE kept IS NULL), count(*) FILTER (WHERE paid > 0 AND kept IS NULL) FROM ({q})"
        self.assertEqual(self.one(no_revenue.format(q=months.format(s=MV_RAW))), (0, 0), "on mailvora_raw every month keeps revenue")
        self.assertEqual(self.one(no_revenue.format(q=months.format(s=MV))), (1, 1),
                         "here one month's payments that were not refunded add up to a missing value, not 0, though money was paid")
        counts = self.one(f"SELECT count(*) FILTER (WHERE refunded), count(*) FROM {MV}.payments")
        self.assertEqual(counts, (4, 10), "4 of 10 payments refunded: August's 2 and October's 2")

    # ---- EX-MOCK-CASE-A: raised and cut products on the 14-day rule's boundaries ---------------------------------------------

    def test_ex_mock_case_a_raised_and_cut_products_on_the_boundary_days(self):
        near = self.con.execute(f"""SELECT promo_id, product_id, change, days, last_version FROM ({VERSIONS_ON_START})
                                    WHERE change IS NOT NULL AND days <= 15 ORDER BY 1, 2""").fetchall()
        self.assertEqual(near, [(3, 8, "raised", 15, True), (4, 1, "raised", 14, True), (4, 21, "cut", 14, True), (5, 15, "raised", 0, True)],
                         "a rise 15 days before a start, a rise and a cut 14 days before one, and a rise on a start day, each on the product's last version")
        three = self.one(f"SELECT count(*) FROM {VM}.price_history WHERE product_id = 15")[0]
        self.assertEqual(three, 3, "product 15's rise is its third version, so the first version is not the one before it")
        twice = self.col(f"""SELECT product_id FROM ({VERSIONS_ON_START}) GROUP BY product_id
                             HAVING count(*) = 2 AND count(DISTINCT valid_from) = 1 ORDER BY 1""")
        self.assertEqual(twice, [21], "product 21 is in two 2025 promotions on one price version")
        # The promotions sit on days with no line of their products, so no line changes (E-103: test_edge_win holds the lines).
        clash = self.one(f"""SELECT count(*) FROM {VM}.order_lines l JOIN {VM}.orders o USING (order_id)
                             JOIN {VM}.promotion_products pp ON pp.product_id = l.product_id JOIN {VM}.promotions pr ON pr.promo_id = pp.promo_id
                             WHERE pr.promo_id IN (3, 4, 5) AND CAST(o.order_ts AS DATE) BETWEEN pr.start_date AND pr.end_date""")[0]
        self.assertEqual(clash, 0, "no line of a product falls in the days of a promotion K2 adds")

    # ---- the descriptions --------------------------------------------------------------------------------------------------------

    def test_each_description_lists_the_new_plants_under_their_tables(self):
        wanted = {
            VM: {"two customers with the same revenue, either side of a split into five groups by revenue":
                 ["orders", "order_lines", "sales"],
                 "promotions that start on the day of a price rise, 14 days after a rise and after a cut, and 15 days after a rise":
                 ["promotions", "promotion_products", "price_history"],
                 "a product in two promotions while one price version holds": ["promotions", "promotion_products", "price_history"]},
            MV: {"every payment of October 2025, a month with ad spend, refunded": ["ad_spend_daily", "fx_rates_monthly", "payments"]},
        }
        for schema, lines in wanted.items():
            desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{schema}.json").read_text(encoding="utf-8"))
            for line, tables in lines.items():
                with self.subTest(schema=schema, line=line):
                    self.assertIn(line, desc["contains"])
                    self.assertEqual(sorted(t for t, listed in desc["tables"].items() if line in listed), sorted(tables))
            text = json.dumps(desc, ensure_ascii=False)
            self.assertNotIn("—", text, "no em dash")
            self.assertNotIn("NULL", text, "missing, not NULL")
            self.assertNotRegex(text, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")


if __name__ == "__main__":
    unittest.main()

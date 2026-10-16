"""Sprint 4c Task A1: the edge rows two cases' claims need (sprint 4b record, deferred findings).

- voltmarkt_edge_join holds an ISO week 11 slice of 2025 (10 to 16 March, days in UTC) for CASE-PRICE-02 (EX-CASE-PRICE-02):
  lines on promotion compared with that week's competitor prices, a product sold with no competitor price that week, a
  product the rivals checked that did not sell that week, and a category where the average of the line ratios is not the
  ratio of the sums (its ERR-LOG-20 plant).
- voltmarkt_edge_set (the edge schema of CASE-VOLT-L3's CP3 item, EX-OPENER-L3-01) holds a promotion that started in 2025,
  covers a product, and no order line carried (the "keeps 0" clause).
- Every line in both schemas follows E-103: the list price on the order date, less the discount of a promotion that exists
  and covers the product on that day, rounded half up; a line of a covered product sold during a promotion carries it.
- Sprint 6 Task B1 (fix round): voltmarkt_edge_promo holds CASE-PRICE-04's promotion, P-2025-03 (FIND-01-05, E-092), with the
  code, name, dates and discount it has in voltmarkt: two Earbuds products on promotion, the sister of one of them not on it,
  and Earbuds sales in each of its 4 baseline weeks and 2 promotion weeks, with weeks where a product sold nothing (E-011).
  Its lines follow E-103 (pipeline/tests/test_build.py checks every line of the promo edge schema).

Assertions name data facts only; no key is read here.
"""
import datetime as dt
import pathlib
import shutil
import sys
import tempfile
import unittest

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import build_course_db  # noqa: E402

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}
JOIN = "voltmarkt_edge_join"
SET = "voltmarkt_edge_set"
WEEK_11 = ("DATE '2025-03-10'", "DATE '2025-03-16'")
PROMO = "voltmarkt_edge_promo"
P_2025_03 = "P-2025-03"                     # CASE-PRICE-04's promotion (05 FIND-01-05, E-092)
BASELINE = dt.timedelta(28)                 # its 4 baseline weeks (05 FIND-01-05)


class CaseEdgeSlices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir)
        cls.con = duckdb.connect(str(cls.dir / "course.duckdb"), read_only=True, config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def one(self, sql, params=None):
        return self.con.execute(sql, params or []).fetchone()

    def week11_lines(self, s=JOIN):
        """Every week 11 sales line with its product's category and that week's average competitor price (missing when none)."""
        return f"""SELECT x.order_line_id, x.product_id, p.category_id, x.units, x.net_revenue_eur, w.avg_competitor_price_eur AS comp,
                          ol.promo_id, ol.line_discount_eur
                   FROM {s}.sales x JOIN {s}.products p USING (product_id) JOIN {s}.order_lines ol USING (order_line_id)
                   LEFT JOIN {s}.competitor_price_weekly w
                     ON w.product_id = x.product_id AND w.iso_year = isoyear(x.order_date) AND w.iso_week = week(x.order_date)
                   WHERE x.order_date BETWEEN {WEEK_11[0]} AND {WEEK_11[1]}"""

    # ---- CASE-PRICE-02: ISO week 11 in voltmarkt_edge_join ----

    def test_join_calendar_covers_iso_week_11(self):
        days, weeks = self.one(f"""SELECT count(*), count(DISTINCT (iso_year, iso_week)) FROM {JOIN}.calendar
                                   WHERE cal_date BETWEEN {WEEK_11[0]} AND {WEEK_11[1]}""")
        self.assertEqual((days, weeks), (7, 1), "the calendar holds the seven days of ISO week 11")
        self.assertEqual(self.one(f"SELECT DISTINCT iso_week FROM {JOIN}.calendar WHERE cal_date = {WEEK_11[0]}")[0], 11)

    def test_week_11_compares_lines_on_promotion(self):
        compared, promoted = self.one(f"""SELECT count(DISTINCT product_id) FILTER (WHERE comp IS NOT NULL),
                                                 count(*) FILTER (WHERE comp IS NOT NULL AND line_discount_eur > 0
                                                                  AND promo_id IN (SELECT promo_id FROM {JOIN}.promotions))
                                          FROM ({self.week11_lines()})""")
        self.assertGreaterEqual(compared, 3, "several products sold in week 11 have a competitor price that week")
        self.assertGreater(promoted, 0, "a compared week 11 line carries a promotion's discount")

    def test_week_11_drops_a_product_with_no_competitor_price(self):
        dropped = self.one(f"SELECT count(*) FROM ({self.week11_lines()}) WHERE comp IS NULL")[0]
        self.assertGreater(dropped, 0, "a product sold in week 11 has no competitor price that week")

    def test_week_11_has_a_competitor_price_for_a_product_that_did_not_sell(self):
        unsold = self.one(f"""SELECT count(*) FROM {JOIN}.competitor_price_weekly w
                              WHERE w.iso_year = 2025 AND w.iso_week = 11
                                AND w.product_id NOT IN (SELECT product_id FROM {JOIN}.sales
                                                         WHERE order_date BETWEEN {WEEK_11[0]} AND {WEEK_11[1]})""")[0]
        self.assertGreater(unsold, 0, "the rivals checked a product that did not sell in week 11")

    def test_week_11_average_of_line_ratios_is_not_the_ratio_of_sums(self):
        # ERR-LOG-20: a category with two or more compared products, where the plain average of the line ratios, rounded
        # to 1 decimal, differs from the unit-weighted index.
        rows = self.con.execute(f"""SELECT category_id, count(DISTINCT product_id),
                                           round(100 * sum(net_revenue_eur) / sum(units * comp), 1),
                                           round(avg(100 * net_revenue_eur / (units * comp)), 1)
                                    FROM ({self.week11_lines()}) WHERE comp IS NOT NULL GROUP BY 1""").fetchall()
        self.assertTrue(any(n >= 2 and a != b for _, n, a, b in rows), f"week 11 categories {rows}")

    def test_join_edge_competitor_weeks_fan_out_a_product_only_join(self):
        # A product with competitor prices in two ISO weeks of the case's window, sold in week 11.
        n = self.one(f"""SELECT count(*) FROM (SELECT product_id FROM {JOIN}.competitor_price_weekly
                                              WHERE iso_year = 2025 AND iso_week BETWEEN 9 AND 11 GROUP BY 1 HAVING count(*) >= 2) c
                         WHERE c.product_id IN (SELECT product_id FROM {JOIN}.sales
                                                WHERE order_date BETWEEN {WEEK_11[0]} AND {WEEK_11[1]})""")[0]
        self.assertGreater(n, 0)

    # ---- CASE-VOLT-L3: a 2025 promotion no order line carried, in voltmarkt_edge_set ----

    def test_set_edge_has_a_2025_promotion_no_line_carried(self):
        n = self.one(f"""SELECT count(*) FROM {SET}.promotions pr
                         WHERE pr.start_date BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
                           AND NOT EXISTS (SELECT 1 FROM {SET}.order_lines ol WHERE ol.promo_id = pr.promo_id)
                           AND EXISTS (SELECT 1 FROM {SET}.promotion_products pp WHERE pp.promo_id = pr.promo_id)""")[0]
        self.assertGreater(n, 0, "a 2025 promotion that covers a product and that no order line carried")

    # ---- CASE-PRICE-04: P-2025-03 in voltmarkt_edge_promo (sprint 6 Task B1, fix round) ----

    def p_2025_03(self):
        """The edge schema's P-2025-03 as (promo_id, start_date, end_date); the test fails when it is not there."""
        row = self.one(f"SELECT promo_id, start_date, end_date FROM {PROMO}.promotions WHERE promo_code = ?", [P_2025_03])
        self.assertIsNotNone(row, f"{PROMO} holds {P_2025_03}, CASE-PRICE-04's promotion")
        return row

    def earbuds_weeks(self):
        """Every Earbuds product in every week of P-2025-03's baseline and promotion, from weekly_units, with whether it is in
        the promotion and whether the week is a baseline week."""
        promo_id, start, end = self.p_2025_03()
        return self.con.execute(f"""SELECT w.product_id, w.week_start, w.units, w.week_start < ? AS baseline,
                                           pp.product_id IS NOT NULL AS promoted
                                    FROM {PROMO}.weekly_units w JOIN {PROMO}.products p USING (product_id)
                                    JOIN {PROMO}.categories c USING (category_id)
                                    LEFT JOIN {PROMO}.promotion_products pp ON pp.promo_id = ? AND pp.product_id = w.product_id
                                    WHERE c.category_name = 'Earbuds' AND w.week_start BETWEEN ? AND ?""",
                                [start, promo_id, start - BASELINE, end]).fetchall()

    def test_promo_edge_has_p_2025_03_as_voltmarkt_does(self):
        cols = "promo_code, promo_name, promo_type, start_date, end_date, discount_pct"
        edge = self.con.execute(f"SELECT {cols} FROM {PROMO}.promotions WHERE promo_code = ?", [P_2025_03]).fetchall()
        visible = self.con.execute(f"SELECT {cols} FROM voltmarkt.promotions WHERE promo_code = ?", [P_2025_03]).fetchall()
        self.assertEqual(len(edge), 1, f"{PROMO} holds {P_2025_03} once")
        self.assertEqual(edge, visible, "with the code, name, type, dates and discount it has in voltmarkt")

    def test_promo_calendar_holds_p_2025_03_and_its_4_baseline_weeks(self):
        _, start, end = self.p_2025_03()
        days, weeks, mondays = self.one(f"""SELECT count(*), count(DISTINCT week_start), count(*) FILTER (WHERE cal_date = week_start)
                                            FROM {PROMO}.calendar WHERE cal_date BETWEEN ? AND ?""", [start - BASELINE, end])
        self.assertEqual((days, weeks, mondays), (42, 6, 6), "every day of the 4 weeks before the promotion and its 2 weeks")

    def test_p_2025_03_promotes_two_earbuds_products_and_not_a_sister(self):
        promo_id, _, _ = self.p_2025_03()
        rows = self.con.execute(f"""SELECT p.product_id, p.sister_product_id, pp.product_id IS NOT NULL
                                    FROM {PROMO}.products p JOIN {PROMO}.categories c USING (category_id)
                                    LEFT JOIN {PROMO}.promotion_products pp ON pp.promo_id = ? AND pp.product_id = p.product_id
                                    WHERE c.category_name = 'Earbuds'""", [promo_id]).fetchall()
        promoted = {p for p, _, on in rows if on}
        unpromoted = {p for p, _, on in rows if not on}
        self.assertGreaterEqual(len(promoted), 2, "two Earbuds products on promotion: each one leaves the cannibalisation set (E-092)")
        self.assertTrue(any(s in unpromoted for p, s, on in rows if on),
                        "a promoted product's sister is an Earbuds product not on promotion (FIND-01-05)")

    def test_p_2025_03_has_earbuds_sales_in_each_baseline_and_promotion_week(self):
        _, start, end = self.p_2025_03()
        weeks = self.one(f"""SELECT count(DISTINCT order_week) FROM {PROMO}.sales
                             WHERE category_name = 'Earbuds' AND order_date BETWEEN ? AND ?""", [start - BASELINE, end])[0]
        self.assertEqual(weeks, 6, "orders in each of the 4 baseline weeks and the 2 promotion weeks")

    def test_p_2025_03_has_weeks_of_no_sales_on_each_side(self):
        # E-011: a zero-filled week moves the average. A promoted product sells nothing in a baseline week, and a product
        # that is not on promotion sells nothing in a promotion week; each sells in another week of the slice.
        rows = self.earbuds_weeks()
        sold = {p for p, _, units, _, _ in rows if units > 0}
        promoted_baseline = [p for p, _, units, baseline, promoted in rows if promoted and baseline and units == 0 and p in sold]
        other_promotion = [p for p, _, units, baseline, promoted in rows if not promoted and not baseline and units == 0 and p in sold]
        self.assertTrue(promoted_baseline, "a promoted product with a baseline week of no sales")
        self.assertTrue(other_promotion, "a product not on promotion with a promotion week of no sales")

    # ---- E-103 for every line of both schemas ----

    def test_lines_follow_e103(self):
        for s in (JOIN, SET):
            bad = self.one(f"""
                WITH l AS (
                  SELECT ol.*, CAST(o.order_ts AS DATE) AS d FROM {s}.order_lines ol JOIN {s}.orders o USING (order_id))
                SELECT
                  count(*) FILTER (WHERE l.unit_price_eur IS DISTINCT FROM (SELECT ph.list_price_eur FROM {s}.price_history ph
                                    WHERE ph.product_id = l.product_id AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to))),
                  count(*) FILTER (WHERE l.promo_id IN (SELECT promo_id FROM {s}.promotions) AND l.line_discount_eur IS DISTINCT FROM
                                    (SELECT round(l.quantity * l.unit_price_eur * pr.discount_pct / 100, 2) FROM {s}.promotions pr
                                     JOIN {s}.promotion_products pp ON pp.promo_id = pr.promo_id AND pp.product_id = l.product_id
                                     WHERE pr.promo_id = l.promo_id AND l.d BETWEEN pr.start_date AND pr.end_date)),
                  count(*) FILTER (WHERE l.promo_id IS NULL AND (l.line_discount_eur <> 0 OR EXISTS (
                                    SELECT 1 FROM {s}.promotions pr JOIN {s}.promotion_products pp ON pp.promo_id = pr.promo_id
                                    WHERE pp.product_id = l.product_id AND l.d BETWEEN pr.start_date AND pr.end_date)))
                FROM l""")
            self.assertEqual(tuple(x or 0 for x in bad), (0, 0, 0),
                             f"{s}: lines off the list price, off their promotion's discount, or sold during a promotion without it")


if __name__ == "__main__":
    unittest.main()

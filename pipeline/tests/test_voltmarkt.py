import collections
import datetime as dt
import locale
import pathlib
import statistics
import sys
import unittest
from unittest import mock

import duckdb
import pyarrow as pa

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from voltmarkt import generate as vm  # noqa: E402

PLANTED_PROMO_CODES = {"P-2024-20", "P-2024-29", "P-2025-03", "P-2025-29"}
# Ruling R17: no extension downloads from DuckDB, ever.
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}
_GENERATED = None


def generated():
    """One generation shared by the test classes (it is the slow step)."""
    global _GENERATED
    if _GENERATED is None:
        _GENERATED = vm.generate()
    return _GENERATED


class VoltmarktV0(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.truth = generated()
        cls.clean = cls.tables["clean"]

    def test_deterministic(self):
        again, _ = vm.generate()
        for name, table in self.clean.items():
            self.assertTrue(table.equals(again["clean"][name]), name)
        self.assertTrue(self.tables["raw"]["products"].equals(again["raw"]["products"]), "raw products")

    def test_appending_to_table_order_keeps_streams(self):
        # GEN-02: tables appended to TABLE_ORDER later must not shift these tables' streams.
        with mock.patch.object(vm, "TABLE_ORDER", vm.TABLE_ORDER + ["a_later_table"]):
            later, _ = vm.generate()
        for name, table in self.clean.items():
            self.assertTrue(table.equals(later["clean"][name]), f"{name} after appending a table")
        self.assertTrue(self.tables["raw"]["products"].equals(later["raw"]["products"]), "raw products after appending")

    def test_names_do_not_follow_locale(self):
        # Day and month names must not follow LC_TIME (a Dutch LC_TIME turns "Monday" into "maandag").
        saved = locale.setlocale(locale.LC_TIME)
        applied = None
        try:
            for name in ("nl_NL.UTF-8", "Dutch_Netherlands.1252", "nl-NL"):
                try:
                    applied = locale.setlocale(locale.LC_TIME, name)
                    break
                except locale.Error:
                    continue
            if applied is None:
                self.skipTest("no Dutch LC_TIME locale could be set on this machine")
            if dt.date(2024, 1, 1).strftime("%A") == "Monday":
                self.skipTest(f"LC_TIME {applied} was set but strftime still gives English names")
            dutch, _ = vm.generate()
        finally:
            locale.setlocale(locale.LC_TIME, saved)
        for name, table in self.clean.items():
            self.assertTrue(table.equals(dutch["clean"][name]), f"{name} under LC_TIME {applied}")

    def test_counts(self):
        self.assertEqual(self.clean["stores"].num_rows, 26)
        self.assertEqual(self.clean["categories"].num_rows, 40)
        self.assertEqual(self.clean["products"].num_rows, 1200)
        self.assertEqual(self.clean["promotions"].num_rows, 60)
        self.assertEqual(self.clean["calendar"].num_rows, 731)

    def test_keys_and_links(self):
        p = self.clean["products"].to_pylist()
        by_id = {r["product_id"]: r for r in p}
        cats = {r["category_id"] for r in self.clean["categories"].to_pylist()}
        self.assertEqual(len(by_id), 1200)
        self.assertEqual(len({r["product_name"] for r in p}), 1200, "product names are unique")
        for r in p:
            self.assertIn(r["category_id"], cats)
            if r["sister_product_id"] is not None:
                s = by_id[r["sister_product_id"]]
                self.assertEqual(s["sister_product_id"], r["product_id"])
                self.assertEqual((s["brand"], s["category_id"]), (r["brand"], r["category_id"]), r["product_id"])

    def test_planted_facts(self):
        p = {r["product_id"]: r for r in self.clean["products"].to_pylist()}
        category = {r["category_id"]: r["category_name"] for r in self.clean["categories"].to_pylist()}
        self.assertEqual(p[311]["product_name"], "Earbuds Pro X")
        self.assertEqual(p[312]["product_name"], "Earbuds Lite")
        self.assertEqual(p[312]["sister_product_id"], 311)
        self.assertEqual(p[540]["product_name"], "PlayBox 5")
        for pid, name in {120: "TVs 50-55 inch", 311: "Earbuds", 312: "Earbuds", 540: "Consoles"}.items():
            self.assertEqual(category[p[pid]["category_id"]], name, pid)
        # GEN-03: planted products carry constant costs and launch dates, not random draws.
        planted = {120: ("520.00", dt.date(2023, 4, 3)), 311: ("99.00", dt.date(2023, 9, 18)),
                   312: ("39.00", dt.date(2022, 3, 14)), 540: ("415.00", dt.date(2021, 11, 19))}
        for pid, (cost, launch) in planted.items():
            self.assertEqual(str(p[pid]["unit_cost_eur"]), cost, pid)
            self.assertEqual(p[pid]["launch_date"], launch, pid)
        promos = {r["promo_code"]: r for r in self.clean["promotions"].to_pylist()}
        expected = {  # code: (start, end, type, discount)
            "P-2024-20": (dt.date(2024, 10, 7), dt.date(2024, 10, 20), "percent_off", "15.00"),
            "P-2025-03": (dt.date(2025, 3, 10), dt.date(2025, 3, 23), "percent_off", "25.00"),
            "P-2024-29": (dt.date(2024, 11, 25), dt.date(2024, 12, 1), "percent_off", "25.00"),
            "P-2025-29": (dt.date(2025, 11, 24), dt.date(2025, 11, 30), "percent_off", "25.00"),
        }
        for code, (start, end, ptype, pct) in expected.items():
            r = promos[code]
            self.assertEqual((r["start_date"], r["end_date"], r["promo_type"], str(r["discount_pct"])),
                             (start, end, ptype, pct), code)
        for code, black_friday in {"P-2024-29": dt.date(2024, 11, 29), "P-2025-29": dt.date(2025, 11, 28)}.items():
            self.assertEqual(promos[code]["promo_name"], "Black Week")
            self.assertTrue(promos[code]["start_date"] <= black_friday <= promos[code]["end_date"], code)
        self.assertEqual(set(self.truth["planted_promos"]), PLANTED_PROMO_CODES)
        stores = {r["store_code"]: r for r in self.clean["stores"].to_pylist()}
        self.assertEqual(stores["NL-13"]["opened_on"], dt.date(2024, 9, 1))
        self.assertEqual(stores["BE-09"]["opened_on"], dt.date(2025, 3, 1))
        self.assertEqual(stores["NL-06"]["close_date"], dt.date(2025, 6, 30))
        self.assertEqual(stores["WEB-01"]["store_id"], 99)
        self.assertEqual(self.truth["store_openings"], {"NL-13": "2024-09-01", "BE-09": "2025-03-01"})
        self.assertEqual(self.truth["store_closures"], {"NL-06": "2025-06-30"})

    def test_random_promotions_avoid_planted_windows(self):
        # FIND-01-05 and FIND-01-06 baselines: nothing random from 28 days before to 14 days after a plant.
        promos = self.clean["promotions"].to_pylist()
        planted = [r for r in promos if r["promo_code"] in PLANTED_PROMO_CODES]
        self.assertEqual(len(planted), 4)
        for r in promos:
            if r["promo_code"] in PLANTED_PROMO_CODES:
                continue
            for q in planted:
                lo, hi = q["start_date"] - dt.timedelta(28), q["end_date"] + dt.timedelta(14)
                self.assertTrue(r["end_date"] < lo or r["start_date"] > hi, (r["promo_code"], q["promo_code"]))

    def test_cost_bands_follow_child_category(self):
        names = {r["category_id"]: r["category_name"] for r in self.clean["categories"].to_pylist()}
        costs = collections.defaultdict(list)
        for r in self.clean["products"].to_pylist():
            costs[names[r["category_id"]]].append(r["unit_cost_eur"])
        median = {name: statistics.median(values) for name, values in costs.items()}
        self.assertGreater(median["Consoles"], median["Cables"])
        self.assertLess(median["TV Mounts"], median["TVs 50-55 inch"])
        # Magnitudes: mounts cost tens of euros, consoles hundreds (per-parent bands broke both).
        self.assertLess(median["TV Mounts"], 100)
        self.assertGreater(median["Consoles"], 150)

    def test_raw_quirks_only_in_raw(self):
        raw = self.tables["raw"]["products"].to_pylist()
        null_cat = sum(1 for r in raw if r["category_id"] is None)
        self.assertTrue(30 <= null_cat <= 42, null_cat)            # about 3% (Q-01-04)
        bad_sku = sum(1 for r in raw if r["sku"] != r["sku"].strip() or r["sku"] != r["sku"].upper())
        self.assertTrue(18 <= bad_sku <= 30, bad_sku)              # about 2% (Q-01-07)
        self.assertEqual(sum(1 for r in self.clean["products"].to_pylist() if r["category_id"] is None), 0)

    def test_validate_passes(self):
        vm.validate(self.tables, self.truth)

    def test_validate_rejects_bad_data(self):
        products = self.clean["products"]
        names = products.column("product_name").to_pylist()
        names[1] = names[0]
        dup = products.set_column(products.schema.get_field_index("product_name"), "product_name", pa.array(names))
        with self.assertRaisesRegex(ValueError, "product names"):
            vm.validate({"clean": {**self.clean, "products": dup}, "raw": self.tables["raw"]}, self.truth)
        wrong = {**self.truth, "planted_promos": {**self.truth["planted_promos"],
                                                  "P-2025-03": {"start": "2025-03-11", "end": "2025-03-23", "discount_pct": "25.00"}}}
        with self.assertRaisesRegex(ValueError, "P-2025-03"):
            vm.validate(self.tables, wrong)


# 05's columns for the order tables, plus E-016's ship_to_country on orders.
ORDER_TABLE_COLUMNS = {
    "price_history": [("product_id", pa.int32()), ("valid_from", pa.date32()), ("valid_to", pa.date32()),
                      ("list_price_eur", pa.decimal128(10, 2))],
    "promotion_products": [("promo_id", pa.int32()), ("product_id", pa.int32())],
    "orders": [("order_id", pa.int64()), ("customer_id", pa.int64()), ("store_id", pa.int32()),
               ("order_ts", pa.timestamp("us")), ("channel", pa.string()), ("ship_to_country", pa.string())],
    "order_lines": [("order_line_id", pa.int64()), ("order_id", pa.int64()), ("product_id", pa.int32()),
                    ("quantity", pa.int32()), ("unit_price_eur", pa.decimal128(10, 2)), ("promo_id", pa.int32()),
                    ("line_discount_eur", pa.decimal128(10, 2))],
}
# FIND-01-04 as E-079 rewrites it: 20 Nov to 5 Dec without Black Week (Monday before Black Friday to Cyber Monday).
SINTERKLAAS_DAYS = ("DATE '2024-11-20', DATE '2024-11-21', DATE '2024-11-22', DATE '2024-11-23', DATE '2024-11-24', "
                    "DATE '2024-12-03', DATE '2024-12-04', DATE '2024-12-05', "
                    "DATE '2025-11-20', DATE '2025-11-21', DATE '2025-11-22', DATE '2025-11-23', "
                    "DATE '2025-12-02', DATE '2025-12-03', DATE '2025-12-04', DATE '2025-12-05'")
GIFTS = "(parent_category = 'Gaming' OR category_name = 'Headphones') AND product_id <> 540"


class VoltmarktOrders(unittest.TestCase):
    """Slice 1b order data: the ERRATA rows with Slice = 1b that target the generator, and FIND-01-12.

    Each finding is recomputed here in SQL from the generated tables, independently of validate().
    """

    @classmethod
    def setUpClass(cls):
        cls.tables, cls.truth = generated()
        cls.clean = cls.tables["clean"]
        cls.con = duckdb.connect(config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")
        for name, table in cls.clean.items():
            cls.con.register(name, table)
        cls.con.execute("""CREATE TEMP VIEW l AS
            SELECT ol.*, o.store_id, o.channel, o.ship_to_country, CAST(o.order_ts AS DATE) AS d,
                   c.category_name, c.parent_category, p.unit_cost_eur,
                   ol.quantity * ol.unit_price_eur - ol.line_discount_eur AS net
            FROM order_lines ol JOIN orders o USING (order_id) JOIN products p USING (product_id)
            JOIN categories c USING (category_id)""")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()

    def one(self, sql):
        return self.con.execute(sql).fetchone()

    def rows(self, sql):
        return self.con.execute(sql).fetchall()

    def test_order_tables_and_columns(self):
        for name, columns in ORDER_TABLE_COLUMNS.items():
            schema = self.clean[name].schema
            self.assertEqual([(f.name, f.type) for f in schema], columns, name)
        self.assertEqual(self.one("SELECT count(*) FROM orders")[0], self.one("SELECT count(DISTINCT order_id) FROM orders")[0])
        self.assertEqual(self.one("SELECT count(*) FROM order_lines")[0], self.one("SELECT count(DISTINCT order_line_id) FROM order_lines")[0])
        self.assertEqual(self.one("SELECT count(*) FROM order_lines WHERE order_id NOT IN (SELECT order_id FROM orders)")[0], 0)
        self.assertEqual(self.one("SELECT count(*) FROM orders WHERE order_id NOT IN (SELECT order_id FROM order_lines)")[0], 0)
        # FIND-01-13 counts repeated business rows as POS duplicates, so clean data never repeats a product in an order.
        self.assertEqual(self.one("SELECT count(*) FROM (SELECT order_id, product_id FROM order_lines GROUP BY ALL HAVING count(*) > 1)")[0], 0)
        self.assertEqual(self.one("SELECT count(*) FROM order_lines WHERE quantity < 1 OR quantity IS NULL")[0], 0)
        window = self.one("SELECT min(CAST(order_ts AS DATE)), max(CAST(order_ts AS DATE)) FROM orders")
        self.assertEqual(window, (dt.date(2024, 1, 1), dt.date(2025, 12, 31)))
        self.assertEqual(self.one("SELECT count(*) FROM l JOIN products p USING (product_id) WHERE l.d < p.launch_date")[0], 0,
                         "no sales before a product's launch date")
        # Line keys follow the orders: lines of one order are consecutive, orders are numbered in time order.
        self.assertEqual(self.one("""SELECT count(*) FROM (SELECT order_id, lag(order_id) OVER (ORDER BY order_line_id) AS prev
                                     FROM order_lines) WHERE order_id < prev""")[0], 0)
        self.assertEqual(self.one("""SELECT count(*) FROM (SELECT order_ts, lag(order_ts) OVER (ORDER BY order_id) AS prev
                                     FROM orders) WHERE order_ts < prev""")[0], 0)

    def test_e105_line_count_keeps_the_basket_model(self):
        lines, orders = self.clean["order_lines"].num_rows, self.clean["orders"].num_rows
        self.assertTrue(912_000 <= lines <= 1_008_000, f"{lines} order lines, E-105 expects about 960,000")
        self.assertTrue(1.5 <= lines / orders <= 1.7, f"{lines / orders:.3f} lines per order, 1 + Poisson(0.6) gives 1.6")

    def test_e016_ship_to_country(self):
        self.assertEqual(self.one("SELECT count(*) FROM orders WHERE ship_to_country IS NULL OR ship_to_country NOT IN ('NL', 'BE', 'LU')")[0], 0)
        self.assertEqual(self.one("""SELECT count(*) FROM orders o JOIN stores s USING (store_id)
                                     WHERE o.channel = 'store' AND o.ship_to_country <> s.country_code""")[0], 0,
                         "a store order ships to its store's country")
        self.assertEqual({r[0] for r in self.rows("SELECT DISTINCT ship_to_country FROM orders WHERE channel = 'web'")}, {"NL", "BE", "LU"})
        self.assertEqual({r[0] for r in self.rows("SELECT DISTINCT channel FROM orders")}, {"store", "web"})
        self.assertEqual(self.one("SELECT count(*) FROM orders WHERE (channel = 'web') <> (store_id = 99)")[0], 0, "web orders are store 99's")

    def test_store_orders_only_while_the_store_is_open(self):
        self.assertEqual(self.one("""SELECT count(*) FROM orders o JOIN stores s USING (store_id)
                                     WHERE CAST(o.order_ts AS DATE) < s.opened_on
                                        OR CAST(o.order_ts AS DATE) > s.close_date""")[0], 0)
        first = dict(self.rows("""SELECT s.store_code, min(CAST(o.order_ts AS DATE)) FROM orders o JOIN stores s USING (store_id)
                                  WHERE s.store_code IN ('NL-13', 'BE-09') GROUP BY 1"""))
        self.assertEqual(first, {"NL-13": dt.date(2024, 9, 1), "BE-09": dt.date(2025, 3, 1)})
        last = self.one("SELECT max(CAST(o.order_ts AS DATE)) FROM orders o JOIN stores s USING (store_id) WHERE s.store_code = 'NL-06'")[0]
        self.assertEqual(last, dt.date(2025, 6, 30))

    def test_e103_unit_price_is_the_list_price_and_discounts_are_promotions(self):
        lines = self.clean["order_lines"].num_rows
        matched = self.one("""SELECT count(*) FROM l JOIN price_history ph ON ph.product_id = l.product_id
                              AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to)
                              AND ph.list_price_eur = l.unit_price_eur""")[0]
        self.assertEqual(matched, lines, "unit_price_eur is the list price in effect on the order date")
        self.assertEqual(self.one("""SELECT count(*) FROM price_history a JOIN price_history b ON a.product_id = b.product_id
                                     AND a.valid_from < b.valid_from AND (a.valid_to IS NULL OR a.valid_to >= b.valid_from)""")[0], 0,
                         "clean price periods do not overlap (Q-01-06 is a raw quirk)")
        self.assertEqual(self.one("""SELECT count(*) FROM (SELECT product_id, valid_to,
                                     lead(valid_from) OVER (PARTITION BY product_id ORDER BY valid_from) AS nxt FROM price_history)
                                     WHERE (nxt IS NULL) <> (valid_to IS NULL) OR valid_to + 1 <> nxt""")[0], 0,
                         "periods are contiguous and only the current one is open")
        self.assertEqual(self.one("""SELECT count(*) FROM (SELECT product_id, min(valid_from) AS first FROM price_history GROUP BY 1)
                                     JOIN products p USING (product_id) WHERE first <> p.launch_date""")[0], 0)
        self.assertEqual(self.one("SELECT count(DISTINCT product_id) FROM price_history")[0], 1200)
        self.assertTrue(7_000 <= self.clean["price_history"].num_rows <= 11_000, self.clean["price_history"].num_rows)
        bad = self.one("""SELECT count(*) FROM l LEFT JOIN promotions pr USING (promo_id)
                          WHERE (l.promo_id IS NULL AND l.line_discount_eur <> 0)
                             OR (l.promo_id IS NOT NULL AND (l.d NOT BETWEEN pr.start_date AND pr.end_date
                                 OR abs(l.line_discount_eur * 100 - l.quantity * l.unit_price_eur * pr.discount_pct) > 0.5))""")[0]
        self.assertEqual(bad, 0, "line_discount_eur is the promotion's discount on the line, else 0.00")
        self.assertEqual(self.one("""SELECT count(*) FROM l LEFT JOIN promotion_products pp USING (promo_id, product_id)
                                     WHERE l.promo_id IS NOT NULL AND pp.promo_id IS NULL""")[0], 0, "a line's promotion lists its product")
        self.assertEqual(self.one("""SELECT count(*) FROM l JOIN promotion_products pp USING (product_id) JOIN promotions pr ON pr.promo_id = pp.promo_id
                                     WHERE l.d BETWEEN pr.start_date AND pr.end_date AND l.promo_id IS NULL""")[0], 0,
                         "a promoted product sells at its promotion price")
        self.assertEqual(self.one("""SELECT count(*) FROM l JOIN promotions cur ON cur.promo_id = l.promo_id
                                     JOIN promotion_products pp ON pp.product_id = l.product_id JOIN promotions pr ON pr.promo_id = pp.promo_id
                                     WHERE l.d BETWEEN pr.start_date AND pr.end_date AND pr.discount_pct > cur.discount_pct""")[0], 0,
                         "overlapping promotions give the deeper discount")
        self.assertEqual(self.one("""SELECT count(*) FROM promotion_products pp JOIN promotions pr USING (promo_id) JOIN products p USING (product_id)
                                     WHERE p.launch_date > pr.start_date""")[0], 0, "no promotion of a product before its launch")
        self.assertTrue(700 <= self.clean["promotion_products"].num_rows <= 1_100, self.clean["promotion_products"].num_rows)

    def test_e147_top_parent_categories(self):
        by_revenue = self.rows("SELECT parent_category, sum(net) AS r FROM l GROUP BY 1 ORDER BY r DESC")
        by_units = self.rows("SELECT parent_category, sum(quantity) AS u FROM l GROUP BY 1 ORDER BY u DESC")
        self.assertEqual(by_revenue[0][0], "TV & Video", by_revenue)
        self.assertEqual(by_units[0][0], "Accessories", by_units)

    def test_find_01_01_web_share_and_countries_on_clean_data(self):
        # E-093: FIND-01-01 is checked on clean data; E-016: country is the ship-to country.
        share = self.one("SELECT sum(net) FILTER (WHERE channel = 'web') / sum(net) FROM l")[0]
        self.assertTrue(0.34 <= share <= 0.42, share)
        revenue = dict(self.rows("SELECT ship_to_country, sum(net) FROM l GROUP BY 1"))
        self.assertGreater(revenue["NL"], revenue["BE"])
        self.assertGreater(revenue["BE"], revenue["LU"])

    def test_e079_sinterklaas_without_black_week(self):
        ratios = dict(self.rows(f"""SELECT ship_to_country,
                (sum(net) FILTER (WHERE d IN ({SINTERKLAAS_DAYS})) / 16) / (sum(net) FILTER (WHERE month(d) = 10) / 62)
            FROM l WHERE {GIFTS} GROUP BY 1"""))
        self.assertTrue(1.4 <= ratios["NL"] <= 1.8, ratios)
        self.assertTrue(1.4 <= ratios["BE"] <= 1.8, ratios)
        self.assertLess(ratios["LU"], 1.25, ratios)
        for year in (2024, 2025):
            d5, d6 = self.one(f"""SELECT sum(net) FILTER (WHERE d = DATE '{year}-12-05'), sum(net) FILTER (WHERE d = DATE '{year}-12-06')
                                  FROM l WHERE {GIFTS} AND ship_to_country IN ('NL', 'BE')""")
            self.assertLess(float(d6), 0.7 * float(d5), f"{year}: 6 Dec {d6} against 5 Dec {d5}")

    def test_e094_cannibalisation(self):
        def weekly(where):
            before, during = self.one(f"""SELECT sum(quantity) FILTER (WHERE d BETWEEN DATE '2025-02-10' AND DATE '2025-03-09') / 4,
                                                 sum(quantity) FILTER (WHERE d BETWEEN DATE '2025-03-10' AND DATE '2025-03-23') / 2
                                          FROM l WHERE {where}""")
            return before, during
        pro_before, pro_during = weekly("product_id = 311")
        lite_before, lite_during = weekly("product_id = 312")
        cat_before, cat_during = weekly("category_name = 'Earbuds'")
        self.assertGreaterEqual(pro_during / pro_before, 2.2)
        self.assertTrue(0.5 <= lite_during / lite_before <= 0.7, lite_during / lite_before)
        self.assertTrue(1.05 <= cat_during / cat_before <= 1.25, cat_during / cat_before)
        # E-094's PLANTS: Lite's pre-promotion weekly units are 1.7 times Pro X's.
        self.assertTrue(1.5 <= lite_before / pro_before <= 1.9, lite_before / pro_before)
        members = {r[0] for r in self.rows("""SELECT product_id FROM promotion_products JOIN promotions USING (promo_id)
                                              WHERE promo_code = 'P-2025-03'""")}
        self.assertIn(311, members)
        self.assertNotIn(312, members)

    def test_e014_elasticity_within_sku(self):
        # E-014: regress weekly ln(units) on ln(price) after removing each SKU's own means, not pooled across
        # SKUs (which gave -0.19). Price is unit_price_eur, the list price (E-103); SKUs sold in at least 100
        # of the 105 weeks, so a week with no sale (no logarithm) is rare.
        slopes = {r[0]: (r[1], r[2]) for r in self.rows("""
            WITH w AS (SELECT product_id, category_name, date_trunc('week', d) AS wk,
                              ln(sum(quantity)) AS y, ln(avg(unit_price_eur)) AS x
                       FROM l WHERE category_name IN ('Laptops', 'Cables') GROUP BY ALL),
                 k AS (SELECT product_id FROM w GROUP BY 1 HAVING count(*) >= 100),
                 c AS (SELECT category_name, product_id, y - avg(y) OVER (PARTITION BY product_id) AS yc,
                              x - avg(x) OVER (PARTITION BY product_id) AS xc
                       FROM w WHERE product_id IN (SELECT product_id FROM k))
            SELECT category_name, regr_slope(yc, xc), count(DISTINCT product_id) FROM c GROUP BY 1""")}
        laptops, cables = slopes["Laptops"], slopes["Cables"]
        self.assertGreaterEqual(laptops[1], 5, slopes)
        self.assertGreaterEqual(cables[1], 5, slopes)
        self.assertTrue(-3.0 <= laptops[0] <= -2.2, slopes)
        self.assertTrue(-1.1 <= cables[0] <= -0.5, slopes)

    def test_find_01_08_four_fake_raises_on_clean_data(self):
        # E-093: FIND-01-08 is checked on clean data.
        found = self.rows("""WITH ph AS (SELECT *, lag(list_price_eur) OVER (PARTITION BY product_id ORDER BY valid_from) AS prev
                                         FROM price_history)
            SELECT DISTINCT ph.product_id, ph.list_price_eur / ph.prev
            FROM ph JOIN promotion_products pp USING (product_id) JOIN promotions pr USING (promo_id)
            WHERE ph.list_price_eur >= 1.10 * ph.prev
              AND ph.valid_from BETWEEN pr.start_date - INTERVAL 14 DAY AND pr.start_date""")
        self.assertEqual(sorted(r[0] for r in found), sorted(vm.FAKE_RAISES), found)
        for _, rise in found:
            self.assertTrue(1.10 <= rise <= 1.21, found)

    def test_find_01_12_negative_accessory_margins_at_30_percent_off(self):
        children = {r[0]: r[1] for r in self.rows("SELECT category_name, parent_category FROM categories")}
        self.assertTrue(vm.THIN_MARGIN_CHILDREN)
        for child in vm.THIN_MARGIN_CHILDREN:
            self.assertEqual(children[child], "Accessories", child)
        names = ", ".join(f"'{c}'" for c in vm.THIN_MARGIN_CHILDREN)
        self.assertEqual(self.one(f"""SELECT count(*) FROM price_history ph JOIN products p USING (product_id)
                                      JOIN categories c USING (category_id)
                                      WHERE c.category_name IN ({names}) AND p.unit_cost_eur <= 0.70 * ph.list_price_eur""")[0], 0,
                         "the planted accessories cost more than 70% of their list price")
        negative = self.one("""SELECT count(*) FROM l JOIN promotions pr USING (promo_id)
                               WHERE l.parent_category = 'Accessories' AND pr.discount_pct >= 30
                                 AND l.net - l.quantity * l.unit_cost_eur < 0""")[0]
        self.assertGreater(negative, 500)

    def test_find_01_09_stockout_has_no_sales(self):
        inside, before, after = self.one("""SELECT count(*) FILTER (WHERE d BETWEEN DATE '2024-12-06' AND DATE '2024-12-27'),
                                                   count(*) FILTER (WHERE d < DATE '2024-12-06'),
                                                   count(*) FILTER (WHERE d > DATE '2024-12-27')
                                            FROM l WHERE product_id = 540""")
        self.assertEqual(inside, 0)
        self.assertGreater(before, 0)
        self.assertGreater(after, 0)

    def test_measure_reports_the_findings(self):
        measured = vm.validate(self.tables, self.truth)
        for key in ("E-105", "E-147", "FIND-01-01", "FIND-01-04", "FIND-01-05", "FIND-01-08", "FIND-01-09", "FIND-01-11", "FIND-01-12"):
            self.assertIn(key, measured)

    def test_validate_rejects_broken_order_data(self):
        orders = self.clean["orders"]
        ship = orders.column("ship_to_country").to_pylist()
        channel = orders.column("channel").to_pylist()
        ship[channel.index("store")] = "DE"
        bad = orders.set_column(orders.schema.get_field_index("ship_to_country"), "ship_to_country", pa.array(ship))
        with self.assertRaisesRegex(ValueError, "E-016"):
            vm.validate({"clean": {**self.clean, "orders": bad}, "raw": self.tables["raw"]}, self.truth)
        lines = self.clean["order_lines"]
        product = lines.column("product_id").to_pylist()
        orders_of = lines.column("order_id").to_pylist()
        ts = dict(zip(orders.column("order_id").to_pylist(), orders.column("order_ts").to_pylist()))
        i = next(k for k, (p, o) in enumerate(zip(product, orders_of)) if p != 540 and ts[o].date() == dt.date(2024, 12, 10))
        product[i] = 540
        moved = lines.set_column(lines.schema.get_field_index("product_id"), "product_id", pa.array(product, pa.int32()))
        with self.assertRaisesRegex(ValueError, "FIND-01-09|E-103"):
            vm.validate({"clean": {**self.clean, "order_lines": moved}, "raw": self.tables["raw"]}, self.truth)


if __name__ == "__main__":
    unittest.main()

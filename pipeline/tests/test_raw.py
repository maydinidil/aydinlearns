"""Sprint 6 Task B1: Voltmarkt's raw tables (S6-02) and cost_history (S6-07), as the generator returns them.

The raw quirks Q-01-01, -02, -05 and -06 draw from the reserved quirks stream after the product quirks (Q-01-04, Q-01-07),
so raw products stays exactly as built before sprint 6; every clean table stays as it was. Q-01-03 is not a quirk (E-155).
cost_history draws from its own reserved stream and follows products.unit_cost_eur, but for an 8% supplier cost rise on
Audio from 2025-07-01. Assertions name data facts only; no truth value is printed.
"""
import datetime as dt
import hashlib
import pathlib
import sys
import unittest
from decimal import ROUND_HALF_UP, Decimal
from unittest import mock

import duckdb
import pyarrow as pa

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from voltmarkt import generate as vm  # noqa: E402
from voltmarkt import raw as vm_raw  # noqa: E402

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
RAW_TABLES = {"calendar", "stores", "categories", "products", "promotions", "price_history", "promotion_products",
              "orders", "order_lines"}
UNCHANGED = ("calendar", "stores", "categories", "promotions", "promotion_products")
# The raw products table as built before sprint 6 (sha256 of its rows in ORDER BY ALL order, as the manifest hashes a table).
RAW_PRODUCTS_SHA256 = "631944ae6173750eea6859e27bfb9a8b185e0939865fb650b43720bda1b2af64"
BUSINESS = "order_id, product_id, quantity, unit_price_eur, promo_id, line_discount_eur"
COST_COLUMNS = [("product_id", pa.int32()), ("valid_from", pa.date32()), ("valid_to", pa.date32()),
                ("unit_cost_eur", pa.decimal128(10, 2))]
RISE_FROM = dt.date(2025, 7, 1)
_GENERATED = None


def generated():
    """One generation shared by the test classes."""
    global _GENERATED
    if _GENERATED is None:
        _GENERATED = vm.generate()
    return _GENERATED


def connect(tables: dict) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    for schema in ("clean", "raw"):
        con.execute(f"CREATE SCHEMA {schema}")
        for name, table in tables[schema].items():
            con.register("src", table)
            con.execute(f"CREATE TABLE {schema}.{name} AS SELECT * FROM src")
            con.unregister("src")
    return con


class RawTables(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.truth = generated()
        cls.clean, cls.raw = cls.tables["clean"], cls.tables["raw"]
        cls.con = connect(cls.tables)

    @classmethod
    def tearDownClass(cls):
        cls.con.close()

    def one(self, sql):
        return self.con.execute(sql).fetchone()

    def test_raw_holds_the_s6_02_tables_with_the_clean_columns(self):
        self.assertEqual(set(self.raw), RAW_TABLES)
        for name, table in self.raw.items():
            self.assertEqual(table.schema, self.clean[name].schema, f"raw {name} has the clean columns and types")

    def test_the_small_tables_are_unchanged_copies(self):
        for name in UNCHANGED:
            self.assertTrue(self.raw[name].equals(self.clean[name]), name)

    def test_raw_products_is_unchanged_from_before_sprint6(self):
        rows = self.con.execute("SELECT * FROM raw.products ORDER BY ALL").fetchall()
        self.assertEqual(hashlib.sha256(repr(rows).encode("utf-8")).hexdigest(), RAW_PRODUCTS_SHA256)

    def test_q01_01_resent_be14_lines(self):
        be14_lines = self.one("""SELECT count(*) FROM clean.order_lines l JOIN clean.orders o USING (order_id)
                                 JOIN clean.stores s USING (store_id) WHERE s.store_code = 'BE-14'""")[0]
        max_id = self.one("SELECT max(order_line_id) FROM clean.order_lines")[0]
        copies, stores, matched = self.one(f"""SELECT count(*), count(DISTINCT s.store_code),
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM raw.order_lines c WHERE c.order_line_id <= {max_id}
                    AND (c.order_id, c.product_id, c.quantity, c.unit_price_eur, c.promo_id, c.line_discount_eur)
                        IS NOT DISTINCT FROM (r.order_id, r.product_id, r.quantity, r.unit_price_eur, r.promo_id, r.line_discount_eur)))
            FROM raw.order_lines r JOIN raw.orders o USING (order_id) JOIN raw.stores s USING (store_id)
            WHERE r.order_line_id > {max_id}""")
        self.assertEqual(copies, round(0.008 * be14_lines), "0.8% of BE-14's lines are resent")
        self.assertEqual(stores, 1)
        self.assertEqual(self.one(f"""SELECT DISTINCT s.store_code FROM raw.order_lines r JOIN raw.orders o USING (order_id)
                                      JOIN raw.stores s USING (store_id) WHERE r.order_line_id > {max_id}""")[0], "BE-14")
        self.assertEqual(matched, copies, "each resent copy has a line with the same business columns")
        self.assertEqual(self.one("SELECT count(*) - count(DISTINCT order_line_id) FROM raw.order_lines")[0], 0, "new IDs")
        repeated = self.one(f"SELECT count(*) FROM (SELECT {BUSINESS} FROM raw.order_lines GROUP BY ALL HAVING count(*) > 1)")[0]
        self.assertEqual(repeated, copies, "each copy repeats one line, once")
        self.assertEqual(self.one("SELECT count(*) FROM raw.order_lines")[0], self.one("SELECT count(*) FROM clean.order_lines")[0] + copies)

    def test_q01_02_be07_june_2024_prices_in_cents(self):
        rows = self.con.execute("""SELECT s.store_code = 'BE-07' AND strftime(o.order_ts, '%Y-%m') = '2024-06' AS planted,
                   count(*), count(*) FILTER (WHERE r.unit_price_eur = 100 * c.unit_price_eur),
                   count(*) FILTER (WHERE r.unit_price_eur = c.unit_price_eur)
            FROM raw.order_lines r JOIN clean.order_lines c USING (order_line_id) JOIN clean.orders o ON o.order_id = c.order_id
            JOIN clean.stores s ON s.store_id = o.store_id GROUP BY 1 ORDER BY 1""").fetchall()
        (_, others, _, others_same), (_, planted, hundredfold, _) = rows
        self.assertGreater(planted, 0)
        self.assertEqual(hundredfold, planted, "every BE-07 line of June 2024 is 100 times its clean price")
        self.assertEqual(others_same, others, "no other line's price changes")
        same = self.one("""SELECT count(*) FROM raw.order_lines r JOIN clean.order_lines c USING (order_line_id)
                           WHERE (r.order_id, r.product_id, r.quantity, r.promo_id, r.line_discount_eur)
                                 IS DISTINCT FROM (c.order_id, c.product_id, c.quantity, c.promo_id, c.line_discount_eur)""")[0]
        self.assertEqual(same, 0, "only unit_price_eur changes")

    def test_q01_05_store_orders_in_local_time_web_orders_in_utc(self):
        store, store_ok, web, web_ok, other = self.one("""SELECT
                count(*) FILTER (WHERE o.channel = 'store'),
                count(*) FILTER (WHERE o.channel = 'store' AND r.order_ts = timezone(s.timezone, timezone('UTC', o.order_ts))),
                count(*) FILTER (WHERE o.channel = 'web'),
                count(*) FILTER (WHERE o.channel = 'web' AND r.order_ts = o.order_ts),
                count(*) FILTER (WHERE (r.customer_id, r.store_id, r.channel, r.ship_to_country)
                                       IS DISTINCT FROM (o.customer_id, o.store_id, o.channel, o.ship_to_country))
            FROM raw.orders r JOIN clean.orders o USING (order_id) JOIN clean.stores s ON s.store_id = o.store_id""")
        self.assertEqual(store_ok, store, "a store order's order_ts is the clean UTC time in the store's time zone")
        self.assertEqual(web_ok, web, "a web order's order_ts stays UTC")
        self.assertEqual(other, 0, "nothing else in orders changes")
        self.assertEqual(self.one("SELECT count(*) FROM raw.orders")[0], self.one("SELECT count(*) FROM clean.orders")[0])
        self.assertEqual(self.one("SELECT count(*) FROM raw.orders r JOIN clean.orders o USING (order_id) "
                                  "WHERE o.channel = 'store' AND r.order_ts = o.order_ts")[0], 0, "every store order moves")

    def test_q01_06_one_percent_of_products_have_two_overlapping_windows(self):
        pairs = self.con.execute("""SELECT a.product_id, count(*) FROM raw.price_history a JOIN raw.price_history b
                ON a.product_id = b.product_id AND a.valid_from < b.valid_from AND (a.valid_to IS NULL OR a.valid_to >= b.valid_from)
            GROUP BY 1""").fetchall()
        self.assertEqual(len(pairs), round(0.01 * self.clean["products"].num_rows), "1% of products")
        self.assertTrue(all(n == 1 for _, n in pairs), "each has exactly two overlapping windows")
        changed = self.one("""SELECT count(*), count(*) FILTER (WHERE r.valid_to > c.valid_to)
            FROM raw.price_history r JOIN clean.price_history c USING (product_id, valid_from)
            WHERE (r.valid_to, r.list_price_eur) IS DISTINCT FROM (c.valid_to, c.list_price_eur)""")
        self.assertEqual(changed, (len(pairs), len(pairs)), "one window per product ends later; nothing else changes")
        self.assertEqual(self.one("SELECT count(*) FROM raw.price_history")[0], self.clean["price_history"].num_rows)
        planted = {int(k) for k in vm.PLANTED_PRODUCTS} | set(vm.FAKE_RAISES)
        self.assertFalse({p for p, _ in pairs} & planted, "no planted product's price story changes")

    def test_s6_03_category_spellings_name_the_parent(self):
        # E-190: each respelled category_raw is a messy spelling of its product's parent category, never of a child.
        rows = self.con.execute("""SELECT DISTINCT r.category_raw, c.parent_category FROM raw.products r
            JOIN clean.products p USING (product_id) JOIN clean.categories c ON c.category_id = p.category_id
            WHERE r.category_raw <> p.category_raw""").fetchall()
        self.assertEqual({s for s, _ in rows}, {"TV & Video", "tv en video", "TV/Video ", "Téléviseurs"})
        self.assertEqual({p for _, p in rows}, {"TV & Video"})
        children = {r[0] for r in self.con.execute("SELECT category_name FROM clean.categories").fetchall()}
        self.assertFalse({s for s, _ in rows} & children, "no spelling is a child category's name")
        self.assertEqual(self.truth["planted"]["raw"]["Q-01-04"]["spellings_of_parent"], ["TV & Video"])

    def test_q01_03_is_not_a_quirk(self):
        # E-155: a guest order is a business state, the same in both schemas.
        self.assertEqual(self.one("""SELECT count(*) FROM raw.orders r JOIN clean.orders c USING (order_id)
                                     WHERE r.customer_id IS DISTINCT FROM c.customer_id""")[0], 0)
        self.assertNotIn("Q-01-03", self.truth["planted"]["raw"])

    def test_truth_records_each_quirk_with_its_counts(self):
        planted = self.truth["planted"]["raw"]
        self.assertEqual(set(planted), {"Q-01-01", "Q-01-02", "Q-01-04", "Q-01-05", "Q-01-06", "Q-01-07"})
        max_id = self.one("SELECT max(order_line_id) FROM clean.order_lines")[0]
        measured = {
            "Q-01-01": self.one(f"SELECT count(*) FROM raw.order_lines WHERE order_line_id > {max_id}")[0],
            "Q-01-02": self.one("""SELECT count(*) FROM raw.order_lines r JOIN clean.order_lines c USING (order_line_id)
                                   WHERE r.unit_price_eur <> c.unit_price_eur""")[0],
            "Q-01-04": self.one("SELECT count(*) FROM raw.products WHERE category_id IS NULL")[0],
            "Q-01-05": self.one("SELECT count(*) FROM raw.orders r JOIN clean.orders c USING (order_id) WHERE r.order_ts <> c.order_ts")[0],
            "Q-01-06": self.one("""SELECT count(*) FROM raw.price_history r JOIN clean.price_history c USING (product_id, valid_from)
                                   WHERE r.valid_to IS DISTINCT FROM c.valid_to""")[0],
            "Q-01-07": self.one("SELECT count(*) FROM raw.products WHERE sku <> upper(trim(sku))")[0],
        }
        for quirk, count in measured.items():
            self.assertGreater(count, 0, quirk)
            self.assertEqual(planted[quirk]["count"], count, f"{quirk}: the truth records the count the raw data holds")
        self.assertEqual(planted["Q-01-01"]["store"], "BE-14")
        self.assertEqual(planted["Q-01-02"]["store"], "BE-07")
        self.assertEqual(planted["Q-01-02"]["month"], "2024-06")

    def test_validate_measures_the_quirks_and_rejects_raw_data_without_them(self):
        found = vm_raw.validate(self.tables, self.truth)
        self.assertEqual(set(found), {"Q-01-01", "Q-01-02", "Q-01-05", "Q-01-06"})
        broken = {"clean": self.clean, "raw": {**self.raw, "order_lines": self.clean["order_lines"]}}
        with self.assertRaisesRegex(ValueError, "Q-01-01"):
            vm_raw.validate(broken, self.truth)
        broken = {"clean": self.clean, "raw": {**self.raw, "orders": self.clean["orders"]}}
        with self.assertRaisesRegex(ValueError, "Q-01-05"):
            vm_raw.validate(broken, self.truth)


class CostHistory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.truth = generated()
        cls.clean = cls.tables["clean"]
        cls.con = connect(cls.tables)
        cls.con.execute("""CREATE TEMP VIEW audio AS SELECT p.product_id FROM clean.products p
                           JOIN clean.categories c USING (category_id) WHERE c.parent_category = 'Audio'""")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()

    def one(self, sql):
        return self.con.execute(sql).fetchone()

    def test_columns(self):
        self.assertEqual([(f.name, f.type) for f in self.clean["cost_history"].schema], COST_COLUMNS)
        self.assertNotIn("cost_history", self.tables["raw"], "cost_history is clean only")

    def test_covers_every_product_over_the_window_with_no_gap_or_overlap(self):
        self.assertEqual(self.one("SELECT count(DISTINCT product_id) FROM clean.cost_history")[0], 1200)
        first = self.one("""SELECT count(*) FROM (SELECT product_id, min(valid_from) AS f FROM clean.cost_history GROUP BY 1)
                            JOIN clean.products p USING (product_id) WHERE f <> p.launch_date""")[0]
        self.assertEqual(first, 0, "each product's costs start at its launch, as its prices do")
        bad = self.one("""SELECT count(*) FROM (SELECT product_id, valid_from, valid_to,
                              lead(valid_from) OVER (PARTITION BY product_id ORDER BY valid_from) AS nxt FROM clean.cost_history)
                          WHERE (nxt IS NULL) <> (valid_to IS NULL) OR valid_to + 1 <> nxt OR valid_to < valid_from""")[0]
        self.assertEqual(bad, 0, "versions are contiguous and only the current one is open")
        days = self.one("""SELECT count(*) FROM clean.products p, range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 DAY) d(day)
                           WHERE CAST(d.day AS DATE) >= p.launch_date AND (SELECT count(*) FROM clean.cost_history h
                               WHERE h.product_id = p.product_id AND CAST(d.day AS DATE) >= h.valid_from
                                 AND (h.valid_to IS NULL OR CAST(d.day AS DATE) <= h.valid_to)) <> 1
                             AND p.product_id % 50 = 0""")[0]
        self.assertEqual(days, 0, "every day of the window after launch has exactly one cost (every 50th product checked)")

    def test_audio_cost_rises_8_percent_from_2025_07_01(self):
        rows = self.con.execute("""SELECT p.product_id, p.unit_cost_eur, p.launch_date, list(h.valid_from ORDER BY h.valid_from),
                                          list(h.unit_cost_eur ORDER BY h.valid_from)
                                   FROM clean.products p JOIN clean.cost_history h USING (product_id)
                                   WHERE p.product_id IN (SELECT product_id FROM audio) GROUP BY ALL""").fetchall()
        self.assertGreater(len(rows), 100)
        for pid, cost, launch, starts, costs in rows:
            risen = (cost * Decimal("1.08")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if launch < RISE_FROM:
                self.assertEqual((starts, costs), ([launch, RISE_FROM], [cost, risen]), pid)
            else:
                self.assertEqual((starts, costs), ([launch], [risen]), f"{pid} launched after the rise, at the new cost")

    def test_every_other_product_keeps_its_unit_cost(self):
        bad = self.one("""SELECT count(*) FROM clean.cost_history h JOIN clean.products p USING (product_id)
                          WHERE h.product_id NOT IN (SELECT product_id FROM audio)
                            AND (h.unit_cost_eur <> p.unit_cost_eur OR h.valid_to IS NOT NULL)""")[0]
        self.assertEqual(bad, 0, "one open version at products.unit_cost_eur")

    def test_truth_records_the_plant(self):
        plant = self.truth["planted"]["cost_history"]
        self.assertEqual((plant["parent_category"], plant["from"], plant["rise_pct"]), ("Audio", "2025-07-01", 8))

    def test_neither_the_raw_quirks_nor_cost_history_shift_any_other_table(self):
        # GEN-02 and R37: with both new steps replaced, every other table is the same.
        empty = pa.table({n: pa.array([], t) for n, t in COST_COLUMNS})
        with mock.patch.object(vm, "build_cost_history", return_value=empty):
            other, _ = vm.generate()
        for name, table in self.clean.items():
            if name != "cost_history":
                self.assertTrue(table.equals(other["clean"][name]), name)
        for name, table in self.tables["raw"].items():
            self.assertTrue(table.equals(other["raw"][name]), f"raw {name}")
        with mock.patch.object(vm_raw, "inject_order_quirks", return_value=({}, {})):
            plain, _ = vm.generate()
        for name, table in self.clean.items():
            self.assertTrue(table.equals(plain["clean"][name]), f"{name} without the order quirks")
        self.assertTrue(self.tables["raw"]["products"].equals(plain["raw"]["products"]), "raw products without the order quirks")


if __name__ == "__main__":
    unittest.main()

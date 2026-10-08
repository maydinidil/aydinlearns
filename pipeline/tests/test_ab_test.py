"""Sprint 5a Task B2: the Voltmarkt A/B test (ab_assignments, ab_conversions), its plants, its edge rows and R37.

The plants, each checked by a number here: a handful of customers in both variants; conversions before assignment, which
must not count; a modest lift whose 95% interval includes zero ("can we conclude it worked?": not yet); no sample ratio
mismatch. The edge rows in voltmarkt_edge_join: a variant with no conversions, a customer in both variants, a conversion at
exactly assigned_at (it counts), one before it (it does not), a missing revenue. R37: no existing table, view, row or stream
changes. Assertions name data facts only; no key is read here.
"""
import datetime as dt
import json
import math
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

import duckdb
import pyarrow as pa

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import build_course_db  # noqa: E402
from voltmarkt import ab_test as ab  # noqa: E402
from voltmarkt import generate as vm  # noqa: E402
from voltmarkt import notes as vm_notes  # noqa: E402

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
TEST_ID = "AB-2025-01"
JOIN = "voltmarkt_edge_join"
# The brief's columns, verbatim, as DuckDB names their types.
COLUMNS = {
    "ab_assignments": [("test_id", "VARCHAR"), ("customer_id", "BIGINT"), ("variant", "VARCHAR"), ("assigned_at", "TIMESTAMP")],
    "ab_conversions": [("test_id", "VARCHAR"), ("customer_id", "BIGINT"), ("converted_at", "TIMESTAMP"),
                       ("revenue_eur", "DECIMAL(10,2)")],
}
ARROW = {
    "ab_assignments": [("test_id", pa.string()), ("customer_id", pa.int64()), ("variant", pa.string()), ("assigned_at", pa.timestamp("us"))],
    "ab_conversions": [("test_id", pa.string()), ("customer_id", pa.int64()), ("converted_at", pa.timestamp("us")),
                       ("revenue_eur", pa.decimal128(10, 2))],
}
PRIMARY_KEYS = {"ab_assignments": ["test_id", "customer_id", "variant"], "ab_conversions": ["test_id", "customer_id", "converted_at"]}
START, END = dt.datetime(2025, 9, 1), dt.datetime(2025, 9, 15)     # Monday 1 to Sunday 14 September 2025, UTC, end exclusive
Z95 = 1.96                     # E-182: the stem gives 1.96 for 95%
SRM_CRITICAL = 10.83           # E-182, KB-11 EXP-08: chi-square, 1 degree of freedom, p = 0.001
# R37: every table and view as built before the A/B test (a rebuild of commit 6caa834, equal to data/manifest.json then).
BEFORE = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_ab_test.json").read_text(encoding="utf-8"))["tables"]

# The analyst's readout, written here on its own (not the module's): per variant, the customers assigned and those with a
# conversion at or after their assigned_at. A customer in both variants is left out, unless keep_both.
READOUT = """WITH a AS (SELECT * FROM {s}.ab_assignments WHERE test_id = 'AB-2025-01'{single}),
    u AS (SELECT a.variant, a.customer_id, max(CASE WHEN c.converted_at >= a.assigned_at THEN 1 ELSE 0 END) AS converted
          FROM a LEFT JOIN {s}.ab_conversions c ON c.test_id = a.test_id AND c.customer_id = a.customer_id
          GROUP BY a.variant, a.customer_id)
    SELECT variant, count(*), sum(converted) FROM u GROUP BY 1 ORDER BY 1"""
SINGLE = (" AND customer_id NOT IN (SELECT customer_id FROM {s}.ab_assignments WHERE test_id = 'AB-2025-01' "
          "GROUP BY 1 HAVING count(DISTINCT variant) > 1)")
BOTH = "SELECT customer_id FROM {s}.ab_assignments GROUP BY 1 HAVING count(DISTINCT variant) > 1"


def readout(con, s, keep_both=False):
    sql = READOUT.format(s=s, single="" if keep_both else SINGLE.format(s=s))
    return {v: (int(n), int(k)) for v, n, k in con.execute(sql).fetchall()}


def interval(counts):
    """Conversion rates, the lift in points (as a share), the relative lift, and its 95% interval (unpooled, KB-11 P3)."""
    (nc, kc), (nt, kt) = counts["control"], counts["treatment"]
    pc, pt = kc / nc, kt / nt
    se = math.sqrt(pc * (1 - pc) / nc + pt * (1 - pt) / nt)
    diff = pt - pc
    return {"control": pc, "treatment": pt, "diff": diff, "relative": diff / pc, "low": diff - Z95 * se, "high": diff + Z95 * se}


def chi_square(counts):
    expected = sum(counts) / len(counts)
    return sum((n - expected) ** 2 / expected for n in counts)


_GENERATED = None


def generated():
    """One Voltmarkt generation and one A/B generation, shared (Voltmarkt's is the slow step)."""
    global _GENERATED
    if _GENERATED is None:
        tables, _ = vm.generate()
        clean = tables["clean"]
        _GENERATED = clean, ab.generate(clean["orders"], clean["order_lines"])
    return _GENERATED


class ABTestTables(unittest.TestCase):
    """The generated tables, before any build: columns, stream, window, customers and the four plants."""

    @classmethod
    def setUpClass(cls):
        cls.clean, (cls.tables, cls.plants) = generated()
        cls.con = duckdb.connect(config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")
        cls.con.execute("CREATE SCHEMA gen")
        for name, table in {**cls.tables, "orders": cls.clean["orders"], "order_lines": cls.clean["order_lines"]}.items():
            cls.con.register("src", table)
            cls.con.execute(f"CREATE TABLE gen.{name} AS SELECT * FROM src")
            cls.con.unregister("src")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()

    def one(self, sql):
        return self.con.execute(sql).fetchone()

    def test_columns_are_the_briefs(self):
        self.assertEqual(sorted(self.tables), sorted(ARROW))
        for name, fields in ARROW.items():
            self.assertEqual([(f.name, f.type) for f in self.tables[name].schema], fields, name)
        for name, keys in PRIMARY_KEYS.items():
            rows, distinct = self.one(f"SELECT count(*), count(DISTINCT ({', '.join(keys)})) FROM gen.{name}")
            self.assertEqual(rows, distinct, f"{name}: one row per {', '.join(keys)}")
            nulls = self.one(f"SELECT count(*) FROM gen.{name} WHERE " + " OR ".join(f"{c} IS NULL" for c, _ in ARROW[name]))[0]
            self.assertEqual(nulls, 0, f"{name}: the visible data has no missing values")

    def test_deterministic(self):
        clean = self.clean
        again, plants = ab.generate(clean["orders"], clean["order_lines"])
        for name, table in self.tables.items():
            self.assertTrue(table.equals(again[name]), f"{name}: same seed, same rows")
        self.assertEqual(plants, self.plants)

    def test_its_own_stream(self):
        # R37 and GEN-02: the test is seeded on its own and never draws from Voltmarkt's streams.
        self.assertNotEqual(ab.AB_SEED, vm.SEED)
        with mock.patch.object(vm, "rngs", side_effect=AssertionError("the A/B test drew from a Voltmarkt stream")):
            again, _ = ab.generate(self.clean["orders"], self.clean["order_lines"])
        for name, table in self.tables.items():
            self.assertTrue(table.equals(again[name]), name)
        other, _ = ab.generate(self.clean["orders"], self.clean["order_lines"], seed=ab.AB_SEED + 1)
        self.assertFalse(other["ab_assignments"].equals(self.tables["ab_assignments"]), "the seed drives the draws")

    def test_one_checkout_test_over_two_full_weeks_of_2025(self):
        self.assertEqual(self.one("SELECT list(DISTINCT test_id) FROM gen.ab_assignments")[0], [TEST_ID])
        self.assertEqual(self.one("SELECT list(DISTINCT test_id) FROM gen.ab_conversions")[0], [TEST_ID])
        self.assertEqual(sorted(self.one("SELECT list(DISTINCT variant) FROM gen.ab_assignments")[0]), ["control", "treatment"])
        first, last, days = self.one("""SELECT min(assigned_at), max(assigned_at), count(DISTINCT CAST(assigned_at AS DATE))
                                        FROM gen.ab_assignments""")
        weeks = self.con.execute("SELECT DISTINCT isoyear(assigned_at), week(assigned_at) FROM gen.ab_assignments ORDER BY ALL").fetchall()
        self.assertTrue(START <= first and last < END, (first, last))
        self.assertEqual(START.weekday(), 0, "the test starts on a Monday")
        self.assertEqual(days, 14, "customers are assigned on each of the 14 days")
        self.assertEqual(weeks, [(2025, 36), (2025, 37)], "two full ISO weeks")
        first, last = self.one("SELECT min(converted_at), max(converted_at) FROM gen.ab_conversions")
        self.assertTrue(START <= first and last < END, (first, last))

    def test_customers_exist_and_every_conversion_is_a_web_order(self):
        missing = self.one("""SELECT count(*) FROM (SELECT DISTINCT customer_id FROM gen.ab_assignments)
                              WHERE customer_id NOT IN (SELECT customer_id FROM gen.orders WHERE customer_id IS NOT NULL)""")[0]
        self.assertEqual(missing, 0, "every assigned customer_id is a customer of voltmarkt.orders")
        self.assertEqual(self.one("""SELECT count(*) FROM gen.ab_conversions
                                     WHERE customer_id NOT IN (SELECT customer_id FROM gen.ab_assignments)""")[0], 0)
        web = """SELECT o.customer_id, o.order_ts, sum(l.quantity * l.unit_price_eur - l.line_discount_eur) AS net
                 FROM gen.orders o JOIN gen.order_lines l USING (order_id)
                 WHERE o.channel = 'web' AND o.customer_id IS NOT NULL
                   AND o.order_ts >= TIMESTAMP '2025-09-01' AND o.order_ts < TIMESTAMP '2025-09-15'
                 GROUP BY o.order_id, o.customer_id, o.order_ts"""
        mine = "SELECT customer_id, converted_at, revenue_eur FROM gen.ab_conversions"
        self.assertEqual(self.one(f"SELECT count(*) FROM ({mine} EXCEPT ALL {web})")[0], 0, "each conversion is a web order")
        self.assertEqual(self.one(f"SELECT count(*) FROM ({web} EXCEPT ALL {mine})")[0], 0, "each web order of a customer then is one")
        self.assertGreater(self.one("SELECT count(*) FROM gen.ab_conversions")[0], 2_000)

    def test_assigned_50_50_with_no_sample_ratio_mismatch(self):
        counts = dict(self.con.execute("SELECT variant, count(DISTINCT customer_id) FROM gen.ab_assignments GROUP BY 1").fetchall())
        chi = chi_square(list(counts.values()))
        self.assertLess(chi, SRM_CRITICAL, f"sample ratio mismatch {counts}, chi-square {chi:.2f}")
        self.assertLess(chi, 3.84, f"comfortably balanced: chi-square {chi:.2f} is below the p = 0.05 value too")
        share = counts["treatment"] / sum(counts.values())
        self.assertTrue(0.49 <= share <= 0.51, share)
        self.assertGreater(sum(counts.values()), 25_000)

    def test_a_handful_of_customers_in_both_variants(self):
        both = self.con.execute(BOTH.format(s="gen")).fetchall()
        self.assertTrue(3 <= len(both) <= 10, f"{len(both)} customers in both variants")
        rows = self.one(f"""SELECT count(*), count(DISTINCT (customer_id, variant)) FROM gen.ab_assignments
                            WHERE customer_id IN ({BOTH.format(s='gen')})""")
        self.assertEqual(rows, (2 * len(both), 2 * len(both)), "each is in each variant once")
        self.assertEqual(self.plants["customers_in_both_variants"], len(both))
        converting = self.one(f"""SELECT count(DISTINCT customer_id) FROM gen.ab_conversions
                                  WHERE customer_id IN ({BOTH.format(s='gen')})""")[0]
        self.assertGreater(converting, 0, "some of them convert, so leaving them out changes a numerator too")

    def test_conversions_before_assignment_do_not_count(self):
        single = SINGLE.format(s="gen")
        rows, only_before = self.one(f"""WITH a AS (SELECT * FROM gen.ab_assignments WHERE test_id = '{TEST_ID}'{single}),
                j AS (SELECT a.customer_id, c.converted_at < a.assigned_at AS before
                      FROM a JOIN gen.ab_conversions c USING (test_id, customer_id))
            SELECT count(*) FILTER (WHERE before),
                   (SELECT count(*) FROM (SELECT customer_id FROM j GROUP BY 1 HAVING bool_and(before)))
            FROM j""")
        self.assertGreater(rows, 100, "conversions dated before their customer's assigned_at")
        self.assertGreater(only_before, 100, "customers whose only conversions come before assignment")
        both_sides = self.one(f"""SELECT count(*) FROM (SELECT a.customer_id FROM gen.ab_assignments a JOIN gen.ab_conversions c USING (test_id, customer_id)
                                  GROUP BY 1 HAVING bool_or(c.converted_at < a.assigned_at) AND bool_or(c.converted_at >= a.assigned_at))""")[0]
        self.assertGreater(both_sides, 0, "customers with a conversion before and one after assignment")
        right = readout(self.con, "gen")
        wrong = {v: (n, k) for v, n, k in self.con.execute(f"""WITH a AS (SELECT * FROM gen.ab_assignments WHERE test_id = '{TEST_ID}'{single})
            SELECT a.variant, count(DISTINCT a.customer_id), count(DISTINCT c.customer_id)
            FROM a LEFT JOIN gen.ab_conversions c USING (test_id, customer_id) GROUP BY 1""").fetchall()}
        self.assertEqual(sum(w[1] for w in wrong.values()) - sum(r[1] for r in right.values()), only_before,
                         "counting them adds exactly those customers as converters")
        self.assertEqual(self.one("SELECT count(*) FROM gen.ab_assignments a JOIN gen.ab_conversions c USING (test_id, customer_id) "
                                  "WHERE c.converted_at = a.assigned_at")[0], 0, "a conversion at exactly assigned_at is an edge case only")

    def test_a_modest_lift_whose_95_percent_interval_includes_zero(self):
        for keep_both in (False, True):
            counts = readout(self.con, "gen", keep_both)
            r = interval(counts)
            label = f"keep_both={keep_both}: {counts}, {r}"
            self.assertTrue(0.08 <= r["control"] <= 0.11, label)
            self.assertGreater(r["diff"], 0, f"treatment converts better: {label}")
            self.assertTrue(0.02 <= r["relative"] <= 0.10, f"a modest relative lift: {label}")
            self.assertTrue(r["low"] < 0 < r["high"], f"the 95% interval includes zero, so not yet: {label}")
        counts = readout(self.con, "gen")
        self.assertEqual(self.plants["planned_relative_lift"], ab.PLANNED_RELATIVE_LIFT)
        self.assertAlmostEqual(interval(counts)["relative"], ab.PLANNED_RELATIVE_LIFT, delta=0.005,
                               msg="the lift is the planned one")

    def test_revenue_per_customer_does_not_say_otherwise(self):
        # "Not yet" must hold for revenue too: revenue per assigned customer (0 without a conversion, counted from assignment
        # on) has a 95% interval (Welch) that includes zero, and revenue per converting customer is close in both variants.
        rows = self.con.execute(f"""WITH a AS (SELECT * FROM gen.ab_assignments WHERE test_id = '{TEST_ID}'{SINGLE.format(s='gen')}),
                u AS (SELECT a.variant, a.customer_id, coalesce(sum(c.revenue_eur) FILTER (WHERE c.converted_at >= a.assigned_at), 0) AS rev,
                             count(c.customer_id) FILTER (WHERE c.converted_at >= a.assigned_at) > 0 AS converted
                      FROM a LEFT JOIN gen.ab_conversions c USING (test_id, customer_id) GROUP BY ALL)
            SELECT variant, count(*), avg(rev)::DOUBLE, var_samp(rev)::DOUBLE, (sum(rev) / count(*) FILTER (WHERE converted))::DOUBLE
            FROM u GROUP BY 1 ORDER BY 1""").fetchall()
        (_, nc, mc, vc, pc), (_, nt, mt, vt, pt) = rows
        se = math.sqrt(vc / nc + vt / nt)
        low, high = mt - mc - Z95 * se, mt - mc + Z95 * se
        self.assertTrue(low < 0 < high, f"revenue per customer {mc:.2f} against {mt:.2f}, interval {low:.2f} to {high:.2f}")
        self.assertLess(abs(pt / pc - 1), 0.03, f"revenue per converting customer {pc:.2f} against {pt:.2f}")

    def test_customers_convert_more_than_once(self):
        repeat = self.one("""SELECT count(*) FROM (SELECT a.customer_id FROM gen.ab_assignments a JOIN gen.ab_conversions c USING (test_id, customer_id)
                             WHERE c.converted_at >= a.assigned_at GROUP BY a.customer_id, a.variant HAVING count(*) > 1)""")[0]
        self.assertGreater(repeat, 0, "conversions are rows; converters are customers")

    def test_validate_measures_and_rejects_broken_data(self):
        orders, lines = self.clean["orders"], self.clean["order_lines"]
        found = ab.validate(self.tables, orders, lines)
        self.assertTrue(found["interval_95"]["low"] < 0 < found["interval_95"]["high"], found)
        self.assertLess(found["srm_chi_square"], SRM_CRITICAL)
        a, c = self.tables["ab_assignments"], self.tables["ab_conversions"]
        variant, customer = a.column("variant").to_pylist(), a.column("customer_id").to_pylist()
        converting = set(c.column("customer_id").to_pylist())
        keep = [i for i, v in enumerate(variant) if v == "control" or customer[i] in converting or i % 3]   # a third of treatment's visitors go
        unknown = next(i for i, x in enumerate(customer) if x not in converting)
        cases = {
            "sample ratio mismatch": {"ab_assignments": a.take(keep), "ab_conversions": c},
            "has no order": {"ab_assignments": a.set_column(1, "customer_id", pa.array(
                [999_999_999 if i == unknown else x for i, x in enumerate(customer)], pa.int64())), "ab_conversions": c},
            "web orders": {"ab_assignments": a, "ab_conversions": c.set_column(3, "revenue_eur", pa.array(
                [c.column("revenue_eur")[0].as_py() + 1] + c.column("revenue_eur").to_pylist()[1:], pa.decimal128(10, 2)))},
        }
        for message, broken in cases.items():
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                ab.validate(broken, orders, lines)


class ABTestBuild(unittest.TestCase):
    """A full build into a temporary folder: R37, the built tables, their schema notes, the truth file and the edge rows."""

    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        cls.manifest = build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir, keys_dir=cls.dir / "no-keys")
        cls.con = duckdb.connect(str(cls.dir / "course.duckdb"), read_only=True, config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def one(self, sql):
        return self.con.execute(sql).fetchone()

    def columns(self, schema, table):
        return self.con.execute("SELECT column_name, data_type FROM information_schema.columns "
                                "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position", [schema, table]).fetchall()

    def test_r37_every_existing_table_and_view_is_unchanged(self):
        # Rows and a checksum of each table (a view: its rows and its SQL text's hash), against the build before Task B2.
        self.assertEqual(len(BEFORE), 98)
        for name, entry in BEFORE.items():
            self.assertEqual(self.manifest["tables"].get(name), entry, name)
        added = sorted(set(self.manifest["tables"]) - set(BEFORE))
        self.assertEqual(added, sorted(f"{s}.{t}" for s in ("voltmarkt", JOIN) for t in ab.TABLES), "only the A/B tables are new")

    def test_built_tables(self):
        _, (tables, _) = generated()
        for name, cols in COLUMNS.items():
            self.assertEqual(self.columns("voltmarkt", name), cols, name)
            self.assertEqual(self.columns(JOIN, name), cols, f"{JOIN}.{name} mirrors voltmarkt.{name}")
            self.assertEqual(self.manifest["tables"][f"voltmarkt.{name}"]["rows"], tables[name].num_rows, name)
            rows = self.one(f"SELECT count(*) FROM {JOIN}.{name}")[0]
            self.assertTrue(1 <= rows <= 40, f"{JOIN}.{name} has {rows} rows")
        for other in ("voltmarkt_edge_date", "voltmarkt_edge_set", "voltmarkt_edge_agg", "voltmarkt_edge_basics"):
            names = {r[0] for r in self.con.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ?", [other]).fetchall()}
            self.assertFalse(names & set(ab.TABLES), f"{other} gets no A/B table")
        self.assertEqual(self.one("SELECT count(*) FROM duckdb_views() WHERE NOT internal AND (view_name LIKE 'ab%')")[0], 0)

    def test_the_plants_hold_in_the_built_database(self):
        counts = readout(self.con, "voltmarkt")
        r = interval(counts)
        self.assertTrue(r["low"] < 0 < r["high"] and r["diff"] > 0, r)
        srm = dict(self.con.execute("SELECT variant, count(DISTINCT customer_id) FROM voltmarkt.ab_assignments GROUP BY 1").fetchall())
        self.assertLess(chi_square(list(srm.values())), SRM_CRITICAL, srm)
        self.assertTrue(3 <= len(self.con.execute(BOTH.format(s="voltmarkt")).fetchall()) <= 10)

    def test_schema_notes(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        visible = [n for n in notes if n["schema"] == "voltmarkt"]
        order = [n["table"] for n in visible]
        self.assertEqual(order.index("ab_assignments"), order.index("competitor_prices") + 1, "after the level 3 tables")
        self.assertEqual(order.index("ab_conversions"), order.index("ab_assignments") + 1)
        self.assertLess(order.index("ab_conversions"), order.index("sales"), "before the views")
        by_table = {n["table"]: n for n in visible}
        for name, keys in PRIMARY_KEYS.items():
            n = by_table[name]
            self.assertEqual(n["primary_key"], keys, name)
            self.assertEqual(n["foreign_keys"], [], f"{name}: no customers table to link to")
            self.assertEqual(n["from_level"], 3, f"{name} shows from level 3 on, with the order tables")
            self.assertEqual(n["sample"]["columns"], [c for c, _ in COLUMNS[name]], name)
            self.assertEqual(len(n["sample"]["rows"]), 5, name)
            self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM voltmarkt.{name}")[0], name)
            self.assertTrue(n["grain"].startswith("one row per"), name)
            self.assertNotIn("\u2014", json.dumps(n, ensure_ascii=False), "no em dash")
        self.assertEqual(by_table["ab_assignments"]["allowed_values"], {"test_id": [TEST_ID], "variant": ["control", "treatment"]})
        self.assertEqual(by_table["ab_conversions"]["allowed_values"], {"test_id": [TEST_ID]})
        self.assertIn("UTC", by_table["ab_assignments"]["column_notes"]["assigned_at"])
        self.assertIn("UTC", by_table["ab_conversions"]["column_notes"]["converted_at"])
        self.assertIn("revenue_eur", by_table["ab_conversions"]["column_notes"])
        self.assertFalse([n for n in notes if n["schema"] != "voltmarkt" and n["table"] in ab.TABLES], "edge schemas get view notes only")

    def test_truth_file_records_the_plants_and_their_measures(self):
        truth = json.loads((self.dir / "truth" / "voltmarkt.json").read_text(encoding="utf-8"))
        planted, found = truth["planted"]["ab_test"], truth["findings"]["ab_test"]
        self.assertEqual((planted["test_id"], planted["seed"]), (TEST_ID, ab.AB_SEED))
        self.assertEqual(planted["start"], "2025-09-01")
        self.assertEqual(planted["end"], "2025-09-14")
        self.assertTrue(found["interval_95"]["low"] < 0 < found["interval_95"]["high"], found)
        self.assertEqual(found["readout"], {v: {"assigned": n, "converted": k} for v, (n, k) in readout(self.con, "voltmarkt").items()})
        self.assertEqual(truth["seed"], vm.SEED, "Voltmarkt's own seed is untouched")

    # ---- the edge rows (voltmarkt_edge_join) the A/B SQL items read ----

    def test_edge_a_variant_with_no_conversions(self):
        per_variant = dict(self.con.execute(f"""SELECT a.variant, count(c.customer_id) FROM {JOIN}.ab_assignments a
            LEFT JOIN {JOIN}.ab_conversions c ON c.test_id = a.test_id AND c.customer_id = a.customer_id GROUP BY 1""").fetchall())
        self.assertEqual(per_variant["treatment"], 0, "no customer of treatment has any conversion row")
        self.assertGreater(per_variant["control"], 0)
        inner = [r[0] for r in self.con.execute(f"""SELECT DISTINCT a.variant FROM {JOIN}.ab_assignments a
            JOIN {JOIN}.ab_conversions c ON c.test_id = a.test_id AND c.customer_id = a.customer_id""").fetchall()]
        self.assertEqual(inner, ["control"], "an inner join loses the variant")

    def test_edge_a_customer_in_both_variants(self):
        self.assertEqual(len(self.con.execute(BOTH.format(s=JOIN)).fetchall()), 1)

    def test_edge_a_conversion_at_exactly_assigned_at_and_one_before(self):
        at, before_only = self.one(f"""WITH j AS (SELECT a.customer_id, c.converted_at, a.assigned_at FROM {JOIN}.ab_assignments a
                                           JOIN {JOIN}.ab_conversions c USING (test_id, customer_id))
            SELECT count(*) FILTER (WHERE converted_at = assigned_at),
                   (SELECT count(*) FROM (SELECT customer_id FROM j GROUP BY 1 HAVING bool_and(converted_at < assigned_at)))
            FROM j""")
        self.assertEqual(at, 1, "a conversion at exactly assigned_at: it counts")
        self.assertEqual(before_only, 1, "a customer whose only conversion is before assigned_at: it does not count")

    def test_edge_a_missing_revenue_on_a_conversion_that_counts(self):
        n = self.one(f"""SELECT count(*) FROM {JOIN}.ab_conversions c JOIN {JOIN}.ab_assignments a USING (test_id, customer_id)
                         WHERE c.revenue_eur IS NULL AND c.converted_at >= a.assigned_at""")[0]
        self.assertEqual(n, 1)

    def test_edge_readout(self):
        # What the plants add up to, so each slip gives another answer on the edge data.
        self.assertEqual(readout(self.con, JOIN), {"control": (6, 3), "treatment": (4, 0)})
        self.assertEqual(readout(self.con, JOIN, keep_both=True), {"control": (7, 3), "treatment": (5, 0)})
        rows = self.one(f"""SELECT count(*) FROM {JOIN}.ab_conversions c JOIN {JOIN}.ab_assignments a USING (test_id, customer_id)
                            WHERE c.converted_at >= a.assigned_at""")[0]
        self.assertEqual(rows, 4, "4 conversion rows from 3 converting customers: one converts twice")

    def test_edge_description_names_the_cases(self):
        desc = json.loads((build_course_db.ROOT / "content" / "sql" / "edge" / f"{JOIN}.json").read_text(encoding="utf-8"))
        text = " ".join(desc["contains"])
        for phrase in ("A/B test", "no conversions", "both variants", "exactly", "before", "missing revenue"):
            self.assertIn(phrase, text)
        self.assertNotIn("\u2014", text, "no em dash")


if __name__ == "__main__":
    unittest.main()

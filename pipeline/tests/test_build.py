import datetime as dt
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import unittest
from unittest import mock

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import build_course_db  # noqa: E402
from voltmarkt import notes as vm_notes  # noqa: E402

LEVEL1_TABLES = {"calendar", "stores", "categories", "products", "promotions"}
ORDER_TABLES = {"price_history", "promotion_products", "orders", "order_lines"}
LEVEL2_TABLES = LEVEL1_TABLES | ORDER_TABLES            # voltmarkt before sprint 4a, and each level 2 edge schema
LEVEL3_TABLES = {"competitor_prices"}                   # sprint 4a (S4-02)
VOLTMARKT_TABLES = LEVEL2_TABLES | LEVEL3_TABLES
# Sprint 5a (Task B2): the A/B test's tables, in voltmarkt and in the join edge schema only (pipeline/tests/test_ab_test.py).
AB_TABLES = {"ab_assignments", "ab_conversions"}
VIEWS = {"sales"}
WEEKLY = "competitor_price_weekly"                      # S4B-31: its own build step, only where competitor_prices exists
WEEKLY_SCHEMAS = ["voltmarkt", "voltmarkt_edge_join", "voltmarkt_edge_date", "voltmarkt_edge_set",
                  "voltmarkt_edge_subq", "voltmarkt_edge_interval", "voltmarkt_edge_promo"]
WEEKLY_COLUMNS = [("product_id", "INTEGER"), ("iso_year", "BIGINT"), ("iso_week", "BIGINT"),
                  ("avg_competitor_price_eur", "DOUBLE"), ("competitors_seen", "BIGINT")]
LEVEL1_EDGE_SCHEMAS = ["voltmarkt_edge_basics", "voltmarkt_edge_filter", "voltmarkt_edge_sort", "voltmarkt_edge_null"]
LEVEL2_EDGE_SCHEMAS = ["voltmarkt_edge_agg", "voltmarkt_edge_case", "voltmarkt_edge_type"]
LEVEL3_EDGE_SCHEMAS = ["voltmarkt_edge_date", "voltmarkt_edge_join", "voltmarkt_edge_set"]   # S4-03
ORDER_EDGE_SCHEMAS = LEVEL2_EDGE_SCHEMAS + LEVEL3_EDGE_SCHEMAS
# Sprint 6 (S6-02 to S6-07). The raw schema holds the quirk tables and the small tables a ticket joins, under voltmarkt's names.
RAW = "voltmarkt_raw"
RAW_TABLES = LEVEL2_TABLES
RAW_WARNING = "This table may hold errors."
COST = "cost_history"                                   # S6-07: appended to voltmarkt
WEEKLY_UNITS = "weekly_units"                           # S6-06: its own build step, in voltmarkt and the level 4 edge schemas
# F2 C1: the schema panel shows weekly_units to every level 4 item (P11), so every level 4 edge schema that mirrors voltmarkt has it.
WEEKLY_UNITS_SCHEMAS = ["voltmarkt", "voltmarkt_edge_subq", "voltmarkt_edge_interval", "voltmarkt_edge_promo"]
WEEKLY_UNITS_COLUMNS = [("product_id", "INTEGER"), ("iso_year", "INTEGER"), ("iso_week", "INTEGER"), ("week_start", "DATE"),
                        ("units", "BIGINT"), ("net_revenue_eur", "DECIMAL(38,2)")]
# S6-04: three new edge schemas mirror voltmarkt (every table and view name it has, weekly_units included since F2 C1), and the
# clean edge schema mirrors voltmarkt_raw.
LEVEL4_EDGE_SCHEMAS = ["voltmarkt_edge_subq", "voltmarkt_edge_interval", "voltmarkt_edge_promo"]
# B1 fix round: the promo edge schema's calendar holds whole ISO weeks (each week with an order, and P-2025-03's 4 baseline
# and 2 promotion weeks: 21 weeks), and weekly_units has a row per product (7) and week. F2 C2: the interval edge schema's
# calendar holds every day from 31 January 2024 to 31 December 2025 (701 days in 101 ISO weeks), and weekly_units a row per
# product (5) and week. M5 (S6-36): the subquery edge schema's orders fall in 10 ISO weeks spread over six months, and its
# weekly_units has a row per product (8) and each of those weeks only. Every other object stays within 60.
LEVEL4_ROW_CAPS = {"voltmarkt_edge_promo.calendar": 21 * 7, "voltmarkt_edge_promo.weekly_units": 7 * 21,
                   "voltmarkt_edge_interval.calendar": 701, "voltmarkt_edge_interval.weekly_units": 5 * 101,
                   "voltmarkt_edge_subq.weekly_units": 8 * 10}
# F2 C2: the schemas whose calendar holds every day of every promotion, so a promotion's days counted through the calendar are its
# length, as date arithmetic gives it. Since M5 every edge schema's calendar does too (pipeline/tests/test_edge_m5.py).
PROMOTION_DAY_SCHEMAS = ["voltmarkt", "voltmarkt_edge_interval", "voltmarkt_edge_promo"]
# Backlog M5 (D90, S6-36): the ten edge schemas built before sprint 6 are unlocked once, for the tables their schema panel shows
# and the days of their own promotions. These are the only objects of manifest_before_sprint6.json M5 may move: each calendar
# gains voltmarkt's rows for the promotion days it lacked. Every other object keeps its hash; the lock is taken again in
# manifest_before_sprint6b.json at the end of block K.
M5_MOVES = {f"voltmarkt_edge_{f}.calendar" for f in ("agg", "basics", "case", "date", "filter", "join", "null", "set", "sort", "type")}
# The objects M5 adds: the level 1 edge schemas get the sales view, over empty copies of the order tables it reads (they hold no
# orders), and the date and set edge schemas empty copies of the A/B test's tables.
M5_EMPTY_ORDER_TABLES = {"orders", "order_lines"}
M5_ADDS = ([f"{s}.{t}" for s in LEVEL1_EDGE_SCHEMAS for t in M5_EMPTY_ORDER_TABLES | VIEWS]
           + [f"{s}.{t}" for s in ("voltmarkt_edge_date", "voltmarkt_edge_set") for t in AB_TABLES])
CLEAN_EDGE = "voltmarkt_edge_clean"
NEW_EDGE_FAMILIES = {"voltmarkt_edge_subq": "subq", "voltmarkt_edge_interval": "interval", "voltmarkt_edge_clean": "clean",
                     "voltmarkt_edge_promo": "promo"}
# R37 (Review Focus 1): data/manifest.json's entries as built before sprint 6. Sprint 6 only adds objects.
BEFORE_SPRINT6 = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint6.json").read_text(encoding="utf-8"))["tables"]
# R37 and S4-02: data/manifest.json's entries as built before sprint 4a. Level 3 only adds objects.
BEFORE_LEVEL3 = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_level3.json").read_text(encoding="utf-8"))["tables"]
# Review Focus 1 (Task G1): every table and view as built at the end of block K, before Part 2. Part 2 only adds objects.
BEFORE_SPRINT6B = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint6b.json").read_text(encoding="utf-8"))["tables"]
# Task G1 (S6-20, P31): Mailvora's clean schema (05 CO-03's 9 tables, budget_monthly, countries), its raw schema, its edge schema.
MAILVORA = "mailvora"
MAILVORA_RAW = "mailvora_raw"
MAILVORA_EDGE = "mailvora_edge_case"
MAILVORA_TABLES = {"channels", "campaigns", "ad_spend_daily", "fx_rates_monthly", "sessions", "signups", "activation_events",
                   "subscriptions", "payments", "budget_monthly", "countries"}
MAILVORA_RAW_TABLES = {"sessions", "ad_spend_daily", "payments", "channels", "campaigns", "fx_rates_monthly", "signups"}   # P37
BUILD_LIMIT_SECONDS = 300                               # Task G1: the build stays under 5 minutes
# The schema each edge schema mirrors when it is not voltmarkt: the clean edge schema mirrors voltmarkt_raw (S6-04), Mailvora's
# mirrors mailvora (S6-20), and Part 2's real-data edge schemas (Task G2) mirror their dataset's schema. The build runs every
# pipeline/edge/*.sql; the real-data ones stay out of the manifest's voltmarkt and mailvora coverage.
EDGE_MIRRORS = {"voltmarkt_edge_clean": RAW, MAILVORA_EDGE: MAILVORA, "online_retail_ii_edge": "online_retail_ii",
                "breakfast_at_the_frat_edge": "breakfast_at_the_frat"}
# S4-01: the order and price tables join the schema panel from level 3: (grain, primary key, foreign keys as
# (column, referenced table, referenced column), each 1:N). Levels 1 and 2 keep today's tables (from_level 1).
LEVEL3_NOTES = {
    "orders": ("one row per order (customer_id is missing for a guest order)", ["order_id"], [("store_id", "stores", "store_id")]),
    "order_lines": ("one row per order line", ["order_line_id"],
                    [("order_id", "orders", "order_id"), ("product_id", "products", "product_id"), ("promo_id", "promotions", "promo_id")]),
    "price_history": ("one row per product per price version (valid_to is missing for the current price)", ["product_id", "valid_from"],
                      [("product_id", "products", "product_id")]),
    "promotion_products": ("one row per promotion and product (a bridge table: a product can be in several promotions)",
                           ["promo_id", "product_id"], [("promo_id", "promotions", "promo_id"), ("product_id", "products", "product_id")]),
    "competitor_prices": ("one row per competitor price check of a product", ["product_id", "competitor", "observed_ts"],
                          [("product_id", "products", "product_id")]),
}
AMSTERDAM = "timezone('Europe/Amsterdam', timezone('UTC', order_ts))"   # a UTC TIMESTAMP as Amsterdam wall-clock time
# Ruling R17: no extension downloads from DuckDB, ever.
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}
# Design §10: the canonical beginner sales view, at order-line grain, with no order-level measure.
SALES_COLUMNS = [
    ("order_line_id", "BIGINT"), ("order_id", "BIGINT"),
    ("order_date", "DATE"), ("order_week", "DATE"), ("order_month", "DATE"),
    ("store_code", "VARCHAR"), ("country_code", "VARCHAR"), ("channel", "VARCHAR"),
    ("parent_category", "VARCHAR"), ("category_name", "VARCHAR"), ("product_id", "INTEGER"), ("product_name", "VARCHAR"),
    ("units", "INTEGER"), ("net_revenue_eur", "DECIMAL(18,2)"), ("unit_cost_eur", "DECIMAL(10,2)"),
]
# The only literals a view body may hold (design §10: no data literals in view bodies).
DATE_PARTS = {"week", "month"}
# R37: the level 1 tables and their edge copies, as built before slice 1b (data/manifest.json, 2026-10-03).
# Level 1 keys read these, so an order build that changed any of them would stale or fail level 1 items.
LEVEL1_SHA256 = {
    "voltmarkt.calendar": "e8d9b989f2bd591620bf43322bdd79eb50d5c052654b7c5898f5fc6604ab18b6",
    "voltmarkt.categories": "c08da16fa1af22225b195a1d22ef74013420f3b9e23702a41005da86ff28b5aa",
    "voltmarkt.products": "d8e45c8971e4f7619ccf2c8d4cefc282e12ce8412b52ddc1a4347ca666268cd8",
    "voltmarkt.promotions": "dca58ae6f46e92d493361c1a3a9082d4ded43c6d9e6081a7fdaa73cdbd184ce2",
    "voltmarkt.stores": "51e7b5dddccb4148b52d80d548c1ed23dc1cf86a51d68a421227a8f4c3408026",
    "voltmarkt_edge_basics.calendar": "92b4c9b76b0f011d409c494e501f56a6b14b718598c08b491f31e76b813d703a",
    "voltmarkt_edge_basics.categories": "3f0da87748c4ae94ca1020375d46ae564ad363ff8c92772bacb11afa49fa64d3",
    "voltmarkt_edge_basics.products": "7b0ed206c87bcab2b1b55b79ba6d814792d70f05996fc08f0431c91a826b8f81",
    "voltmarkt_edge_basics.promotions": "b5a2700c876a15d9a4830aa091dce163113131a8fcc29a93f33324fed65a1514",
    "voltmarkt_edge_basics.stores": "470b8269bcf3b92fab7c4da7c79bb2f41d87ab11bfa032344ff78e2f9ec5aa2c",
    "voltmarkt_edge_filter.calendar": "baed41d54d13d1f4cdcfe86cd38cb9f8dd7ef3f050460f147d422c9f55722442",
    "voltmarkt_edge_filter.categories": "5f703bc3ca3716c7298a43cbb387f86a7ecc141349a5bd63551f02790d1229ef",
    "voltmarkt_edge_filter.products": "937225d6c055e8b59f87b5c4193ddb14b8515cd04876d4da68273251869d1a79",
    "voltmarkt_edge_filter.promotions": "c67ac9f28fdd3ecf405bf1d4d37ea40a7528c0321de40d4ac42a89dcabe46d83",
    "voltmarkt_edge_filter.stores": "c07b6c392520a154446a367567541c2bc5f0fb47fa613446e732878acc92006a",
    "voltmarkt_edge_null.calendar": "ff98295fe38d56ad6a18a9ea478d587d82328a36bf291f82d79ca6b990c70ea8",
    "voltmarkt_edge_null.categories": "7f35326a1782e4a638b21b9ac1d3992962aa6abf9d5b70df9573579a0e962af4",
    "voltmarkt_edge_null.products": "de728e4fb810b5ec8a7e2e26abd5e282867a8be49b70292eb6a16488c328e853",
    "voltmarkt_edge_null.promotions": "6e2b1035e100ccda050706405c8906a72ed796a0339c934296cc4e0d6a75df67",
    "voltmarkt_edge_null.stores": "52d2264a82533eab69f285c97209da41c4939593d9fc87bbeed9b890dfdaa5b8",
    "voltmarkt_edge_sort.calendar": "19c678a01df0eec254f3ae550ac04e2e452587a9880b6b8ce9f13017f6016106",
    "voltmarkt_edge_sort.categories": "cfe827ffeb6c8401f99d171aab81053bb83002e71ab40fdad69c215412e7c40a",
    "voltmarkt_edge_sort.products": "8c31713bc7fd9016d9cc2b4699992a15ddfcbfc0daeefd21127bc743b2c9cf3e",
    "voltmarkt_edge_sort.promotions": "9f556a4068bcfe1a3e78c88bb18e87fd6c679cba873de354f20e5f2e7f96df5a",
    "voltmarkt_edge_sort.stores": "194840bba1fddfa9833588c55830235c3250caaf40491b9f6367034bb1b9a265",
}
# C15: each level 2 edge schema plants ties exactly at the top-N cutoffs its description states.
# (ranking query over {s}.sales, N): the N-th and (N+1)-th values are equal.
EDGE_TIES = {
    "voltmarkt_edge_agg": [
        ("SELECT product_name, sum(net_revenue_eur) AS v FROM {s}.sales GROUP BY 1 ORDER BY v DESC NULLS LAST", 3),
        ("SELECT store_code, sum(units) AS v FROM {s}.sales GROUP BY 1 ORDER BY v DESC NULLS LAST", 2),
    ],
    "voltmarkt_edge_case": [
        ("SELECT product_name, sum(net_revenue_eur) AS v FROM {s}.sales GROUP BY 1 ORDER BY v DESC NULLS LAST", 3),
        ("SELECT category_name, count(*) AS v FROM {s}.sales GROUP BY 1 ORDER BY v DESC NULLS LAST", 2),
    ],
    "voltmarkt_edge_type": [
        ("SELECT store_code, sum(units) / count(units) AS v FROM {s}.sales GROUP BY 1 ORDER BY v DESC NULLS LAST", 2),
        ("SELECT product_name, sum(net_revenue_eur) AS v FROM {s}.sales GROUP BY 1 ORDER BY v DESC NULLS LAST", 3),
    ],
}
PIPELINE = pathlib.Path(build_course_db.__file__).resolve().parent


class CourseDb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        cls.connects = []
        real_connect = duckdb.connect

        def spy(*args, **kwargs):
            cls.connects.append(kwargs.get("config"))
            return real_connect(*args, **kwargs)

        started = time.perf_counter()
        with mock.patch("duckdb.connect", spy):
            cls.manifest = build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir)
        cls.build_seconds = time.perf_counter() - started
        cls.con = duckdb.connect(str(cls.dir / "course.duckdb"), read_only=True, config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def one(self, sql, params=None):
        return self.con.execute(sql, params or []).fetchone()

    def columns(self, schema, table):
        return self.con.execute("SELECT column_name, data_type FROM information_schema.columns "
                                "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position", [schema, table]).fetchall()

    def names(self, schema):
        tables = {r[0] for r in self.con.execute(
            "SELECT table_name FROM duckdb_tables() WHERE schema_name = ? AND NOT internal", [schema]).fetchall()}
        views = {r[0] for r in self.con.execute(
            "SELECT view_name FROM duckdb_views() WHERE schema_name = ? AND NOT internal", [schema]).fetchall()}
        return tables, views

    def test_schemas_and_tables(self):
        self.assertEqual(self.names("voltmarkt"), (VOLTMARKT_TABLES | AB_TABLES | {COST}, VIEWS | {WEEKLY, WEEKLY_UNITS}))
        # M5 (S6-36): the level 1 edge schemas also hold the sales view, over empty copies of orders and order_lines. A calendar M5
        # filled is held to its promotions' days in pipeline/tests/test_edge_m5.py, not to a row count.
        for s in LEVEL1_EDGE_SCHEMAS:
            self.assertEqual(self.names(s), (LEVEL1_TABLES | M5_EMPTY_ORDER_TABLES, VIEWS), s)
            for t in LEVEL1_TABLES | M5_EMPTY_ORDER_TABLES | VIEWS:
                self.assertEqual(self.columns(s, t), self.columns("voltmarkt", t), f"{s}.{t} mirrors voltmarkt.{t}")
                rows = self.one(f"SELECT count(*) FROM {s}.{t}")[0]
                if t in M5_EMPTY_ORDER_TABLES | VIEWS:
                    self.assertEqual(rows, 0, f"{s}.{t} holds no rows: the level 1 edge schemas have no orders")
                elif f"{s}.{t}" not in M5_MOVES:
                    self.assertTrue(4 <= rows <= 8, f"{s}.{t} has {rows} rows, not 4-8")
        # Level 2 edge schemas keep the names voltmarkt had when level 2 was written (no competitor_prices); the level 3 ones
        # hold the A/B test's tables, with rows in the join edge schema only (sprint 5a; M5 gave date and set empty copies).
        for s, names, views in ([(s, LEVEL2_TABLES, VIEWS) for s in LEVEL2_EDGE_SCHEMAS]
                                + [(s, VOLTMARKT_TABLES | AB_TABLES, VIEWS | {WEEKLY}) for s in LEVEL3_EDGE_SCHEMAS]):
            self.assertEqual(self.names(s), (names, views), f"{s} has the same table and view names as voltmarkt")
            for t in names | views:
                self.assertEqual(self.columns(s, t), self.columns("voltmarkt", t), f"{s}.{t} mirrors voltmarkt.{t}")
                rows = self.one(f"SELECT count(*) FROM {s}.{t}")[0]
                if f"{s}.{t}" in M5_ADDS:
                    self.assertEqual(rows, 0, f"{s}.{t} is an empty copy")
                elif f"{s}.{t}" not in M5_MOVES:
                    self.assertTrue(1 <= rows <= 40, f"{s}.{t} has {rows} rows, not 1-40")
        # Sprint 6: the raw schema has voltmarkt's columns under its table names, and no view (S6-02).
        self.assertEqual(self.names(RAW), (RAW_TABLES, set()))
        for t in RAW_TABLES:
            self.assertEqual(self.columns(RAW, t), self.columns("voltmarkt", t), f"{RAW}.{t} has voltmarkt.{t}'s columns")
        # S6-04: each new edge schema has the table and view names of the schema it mirrors, its columns, and a few rows.
        for s in LEVEL4_EDGE_SCHEMAS:
            views = VIEWS | {WEEKLY} | ({WEEKLY_UNITS} if s in WEEKLY_UNITS_SCHEMAS else set())
            self.assertEqual(self.names(s), (VOLTMARKT_TABLES | AB_TABLES | {COST}, views), s)
            for t in VOLTMARKT_TABLES | AB_TABLES | {COST} | views:
                self.assertEqual(self.columns(s, t), self.columns("voltmarkt", t), f"{s}.{t} mirrors voltmarkt.{t}")
                rows = self.one(f"SELECT count(*) FROM {s}.{t}")[0]
                cap = LEVEL4_ROW_CAPS.get(f"{s}.{t}", 60)
                self.assertTrue(1 <= rows <= cap, f"{s}.{t} has {rows} rows, not 1-{cap}")
        self.assertEqual(self.names(CLEAN_EDGE), (RAW_TABLES, set()), "the clean edge schema mirrors voltmarkt_raw: no view")
        for t in RAW_TABLES:
            self.assertEqual(self.columns(CLEAN_EDGE, t), self.columns(RAW, t), f"{CLEAN_EDGE}.{t} mirrors {RAW}.{t}")
            rows = self.one(f"SELECT count(*) FROM {CLEAN_EDGE}.{t}")[0]
            self.assertTrue(1 <= rows <= 40, f"{CLEAN_EDGE}.{t} has {rows} rows, not 1-40")

    def test_nothing_in_schema_main(self):
        # Design §10 and ruling R23: an object in main could be read from every dataset.
        self.assertEqual(self.one("SELECT count(*) FROM duckdb_tables() WHERE schema_name = 'main' AND NOT internal")[0], 0)
        self.assertEqual(self.one("SELECT count(*) FROM duckdb_views() WHERE schema_name = 'main' AND NOT internal")[0], 0)

    def test_sales_view_at_order_line_grain(self):
        for s in ["voltmarkt", *LEVEL1_EDGE_SCHEMAS, *ORDER_EDGE_SCHEMAS, *LEVEL4_EDGE_SCHEMAS]:
            self.assertEqual(self.columns(s, "sales"), SALES_COLUMNS, s)
            views, lines = self.one(f"SELECT (SELECT count(*) FROM {s}.sales), (SELECT count(*) FROM {s}.order_lines)")
            self.assertEqual(views, lines, f"{s}.sales has one row per order line")
            self.assertEqual(self.one(f"SELECT count(DISTINCT order_line_id) FROM {s}.sales")[0], views, s)
        # No order-level measure: nothing in the view repeats a whole order's value on each of its lines.
        for name, _ in SALES_COLUMNS:
            self.assertNotRegex(name, r"order_(total|value|revenue|discount|units)|shipping|basket", name)
        multi = self.one("SELECT count(*) FROM (SELECT order_id FROM voltmarkt.sales GROUP BY 1 HAVING count(*) > 1)")[0]
        self.assertGreater(multi, 100_000, "most baskets hold several lines, so order_id repeats")
        net, lines_net = self.one("""SELECT (SELECT sum(net_revenue_eur) FROM voltmarkt.sales),
            (SELECT sum(quantity * unit_price_eur - line_discount_eur) FROM voltmarkt.order_lines)""")
        self.assertEqual(net, lines_net, "net revenue follows E-103")
        self.assertEqual(self.one("SELECT sum(units) FROM voltmarkt.sales")[0], self.one("SELECT sum(quantity) FROM voltmarkt.order_lines")[0])
        self.assertEqual(self.one("SELECT count(*) FROM voltmarkt.sales WHERE country_code IS NULL OR parent_category IS NULL "
                                  "OR net_revenue_eur IS NULL OR unit_cost_eur IS NULL")[0], 0, "the visible view has no missing values")
        week = self.one("SELECT order_week, order_month FROM voltmarkt.sales WHERE order_date = DATE '2025-01-01' LIMIT 1")
        self.assertEqual([str(v) for v in week], ["2024-12-30", "2025-01-01"], "ISO weeks start on Monday")

    @staticmethod
    def numbers(sql):
        """The numeric constants of a SQL text, as written."""
        tokens = duckdb.tokenize(sql)
        return {sql[start:tokens[k + 1][0] if k + 1 < len(tokens) else len(sql)].strip()
                for k, (start, kind) in enumerate(tokens) if kind == duckdb.token_type.numeric_const}

    def zero_fill_views(self):
        """S6-06: the views the build's weekly_units step makes, by (schema, view), each with the SQL text DuckDB keeps for it and
        the numbers that step writes. Taken from WEEKLY_UNITS_SCHEMAS and WEEKLY_UNITS_SQL, run here on an empty copy of each
        schema, so the exemption below is that build step's view and no other, whatever it is called. The copy is written to a
        file and read back, as the build's is: DuckDB keeps a view's text in the form it reads back from the file."""
        template = build_course_db.WEEKLY_UNITS_SQL
        name = re.match(r"CREATE VIEW \{schema\}\.(\w+)", template).group(1)
        allowed = frozenset(self.numbers(template))
        path = self.dir / "zerofill.duckdb"
        path.unlink(missing_ok=True)
        writer = duckdb.connect(str(path), config=NO_NETWORK)
        writer.execute("SET TimeZone = 'UTC'")
        for s in build_course_db.WEEKLY_UNITS_SCHEMAS:
            writer.execute(build_course_db.DDL.read_text(encoding="utf-8").replace("{schema}", s))
            writer.execute(template.replace("{schema}", s))
        writer.close()
        reader = duckdb.connect(str(path), read_only=True, config=NO_NETWORK)
        reader.execute("SET TimeZone = 'UTC'")
        self.addCleanup(reader.close)
        return {(s, name): (reader.execute("SELECT sql FROM duckdb_views() WHERE schema_name = ? AND view_name = ?", [s, name]).fetchone()[0],
                            allowed) for s in build_course_db.WEEKLY_UNITS_SCHEMAS}

    def test_view_bodies_hold_no_data_literals_and_read_their_own_schema(self):
        views = self.con.execute("SELECT schema_name, view_name, sql FROM duckdb_views() WHERE NOT internal").fetchall()
        self.assertEqual(len(views), 1 + len(LEVEL1_EDGE_SCHEMAS) + len(ORDER_EDGE_SCHEMAS) + len(LEVEL4_EDGE_SCHEMAS) + len(WEEKLY_SCHEMAS)
                         + len(WEEKLY_UNITS_SCHEMAS))
        zero_fill = self.zero_fill_views()
        self.assertEqual({numbers for _, numbers in zero_fill.values()}, {frozenset({"0"})},
                         "S6-06: the zero-fill's 0 is the one number the weekly_units step writes, and it holds no data")
        exempt = {}
        for schema, name, sql in views:
            if (schema, name) in zero_fill:
                built, numbers = zero_fill[(schema, name)]
                self.assertEqual(sql, built, f"{schema}.{name} is the build step's view")
                exempt[(schema, name)] = numbers
        self.assertEqual(set(exempt), set(zero_fill), "each schema the weekly_units step names has that step's view")
        for schema, name, sql in views:
            tokens = duckdb.tokenize(sql)
            for k, (start, kind) in enumerate(tokens):
                end = tokens[k + 1][0] if k + 1 < len(tokens) else len(sql)
                text = sql[start:end].strip()
                if kind == duckdb.token_type.numeric_const and text in exempt.get((schema, name), set()):
                    continue
                self.assertNotEqual(kind, duckdb.token_type.numeric_const, f"{schema}.{name} holds the number {text}")
                if kind == duckdb.token_type.string_const:
                    self.assertIn(text.strip("'").lower(), DATE_PARTS, f"{schema}.{name} holds the string {text}")
            body = sql.split(" AS ", 1)[1]
            refs = re.findall(r"\b(?:from|join)\s+([A-Za-z_][\w.]*)", body, flags=re.IGNORECASE)
            self.assertTrue(refs, f"{schema}.{name}")
            own = self.names(schema)[0]
            for ref in refs:
                self.assertRegex(ref, rf"^{schema}\.\w+$", f"{schema}.{name} reads {ref} without its own schema")
                self.assertIn(ref.split(".")[1], own, f"{schema}.{name} reads {ref}")

    def test_level1_data_unchanged(self):
        # R37: the order build only adds objects; every table a level 1 key reads keeps its rows. M5 (D90) unlocked the edge
        # calendars once (M5_MOVES); the sprint 6 lock test below holds them to that list.
        for name, sha in LEVEL1_SHA256.items():
            if name not in M5_MOVES:
                self.assertEqual(self.manifest["tables"][name]["sha256"], sha, name)

    def test_every_existing_table_is_unchanged(self):
        # R37 and S4-02: level 3 data is appended. Every table and view built before sprint 4a keeps its rows and hash
        # (a view its SQL text), so no level 1 or 2 key reads a changed table and no blind solve goes stale. M5 (D90) moved the
        # objects in M5_MOVES once.
        self.assertEqual(len(BEFORE_LEVEL3), 60)
        for name, entry in BEFORE_LEVEL3.items():
            if name not in M5_MOVES:
                self.assertEqual(self.manifest["tables"].get(name), entry, name)
        added = sorted((set(self.manifest["tables"]) & set(BEFORE_SPRINT6)) - set(BEFORE_LEVEL3))   # sprint 6's own test is below
        expected = (["voltmarkt.competitor_prices", f"voltmarkt.{WEEKLY}"]
                    + [f"{s}.{t}" for s in LEVEL3_EDGE_SCHEMAS for t in sorted(VOLTMARKT_TABLES | VIEWS | {WEEKLY})]
                    + [f"{s}.{t}" for s in ("voltmarkt", "voltmarkt_edge_join") for t in sorted(AB_TABLES)])
        self.assertEqual(added, sorted(expected), "only competitor_prices, the weekly view, the level 3 edge schemas and the A/B test are new")

    def test_every_table_and_view_before_sprint6_is_unchanged(self):
        # R37, Review Focus 1: every table (rows and sha256) and view (rows and its SQL text's sha256) built before sprint 6
        # is exactly as it was, so no level 1 to 3 key, case truth or solver record goes stale. D90 unlocked the ten older edge
        # schemas once, for M5: the objects in M5_MOVES moved, and nothing else did.
        self.assertEqual(len(BEFORE_SPRINT6), 102)
        self.assertTrue(M5_MOVES <= set(BEFORE_SPRINT6), sorted(M5_MOVES - set(BEFORE_SPRINT6)))
        moved = sorted(name for name, entry in BEFORE_SPRINT6.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, sorted(M5_MOVES), "M5 moves the objects it names, and only those")
        for name in M5_MOVES:
            self.assertGreater(self.manifest["tables"][name]["rows"], BEFORE_SPRINT6[name]["rows"], f"{name} only gains rows")
        # Part 2's own additions (Mailvora) are held by test_every_object_before_sprint6b_is_unchanged below.
        added = sorted(n for n in set(self.manifest["tables"]) - set(BEFORE_SPRINT6) if n.startswith("voltmarkt"))

        def level4(s):
            return VOLTMARKT_TABLES | AB_TABLES | {COST} | VIEWS | {WEEKLY} | ({WEEKLY_UNITS} if s in WEEKLY_UNITS_SCHEMAS else set())
        expected = ([f"voltmarkt.{COST}", f"voltmarkt.{WEEKLY_UNITS}"] + [f"{RAW}.{t}" for t in RAW_TABLES]
                    + [f"{s}.{t}" for s in LEVEL4_EDGE_SCHEMAS for t in level4(s)] + [f"{CLEAN_EDGE}.{t}" for t in RAW_TABLES]
                    + M5_ADDS)
        self.assertEqual(added, sorted(expected),
                         "only the raw schema, cost_history, weekly_units, the four edge schemas and M5's empty copies and views are new")

    def test_manifest(self):
        m = self.manifest
        self.assertEqual(m["duckdb_version"], duckdb.__version__)
        self.assertEqual(m["library_version"], f"v{duckdb.__version__}", "pragma_version(), as the Node runner reports it")
        self.assertEqual(m["tables"]["voltmarkt.products"]["rows"], 1200)
        self.assertEqual(m["tables"]["voltmarkt.sales"]["rows"], m["tables"]["voltmarkt.order_lines"]["rows"])
        self.assertTrue(140_000 <= m["tables"]["voltmarkt.competitor_prices"]["rows"] <= 160_000)
        for s in ["voltmarkt", *LEVEL1_EDGE_SCHEMAS, *ORDER_EDGE_SCHEMAS, RAW, *LEVEL4_EDGE_SCHEMAS, CLEAN_EDGE,
                  MAILVORA, MAILVORA_RAW, MAILVORA_EDGE]:
            tables, views = self.names(s)
            self.assertTrue(tables, s)
            for t in tables | views:
                self.assertIn(f"{s}.{t}", m["tables"])
        self.assertEqual(len(m["dataset_version"]), 16)
        again = build_course_db.build(self.dir / "again" / "course.duckdb", data_dir=self.dir / "again")
        self.assertEqual(again["tables"], m["tables"], "same seed, same rows and hashes")
        self.assertEqual(again["dataset_version"], m["dataset_version"], "same seed, same dataset version")

    def test_every_duckdb_connect_is_offline(self):
        # R17 at run time: every instance the build opened passed both settings at creation.
        self.assertTrue(self.connects)
        for config in self.connects:
            self.assertEqual({k: (config or {}).get(k) for k in NO_NETWORK}, NO_NETWORK)
        # R17 in the source: every duckdb.connect passes config and sets TimeZone with SET straight after.
        needle = "duckdb." + "connect("
        for path in sorted(PIPELINE.rglob("*.py")):
            if ".venv" in path.parts:
                continue
            lines = path.read_text(encoding="utf-8").splitlines()
            for i, line in enumerate(lines):
                if needle not in line or line.lstrip().startswith("#"):
                    continue
                self.assertIn("config=", line, f"{path.name}:{i + 1}")
                after = "\n".join(lines[i + 1:i + 3])
                self.assertIn("SET TimeZone", after, f"{path.name}:{i + 1} sets TimeZone right after opening")

    def test_checkpoint_truths_have_their_own_file_with_the_schemas_built(self):
        """S6-13: the CP2 and CP4 values move to data/truth/checkpoints.json, with each value's source hash and every schema the
        database holds; voltmarkt.json keeps the data's own truth only."""
        checkpoints = json.loads((self.dir / "truth" / "checkpoints.json").read_text(encoding="utf-8"))
        self.assertEqual(set(checkpoints), {"schemas", "checkpoints", "sources"})
        self.assertEqual(set(checkpoints["checkpoints"]), set(checkpoints["sources"]))
        self.assertTrue(checkpoints["checkpoints"], "the real cases have values")
        built = {r[0] for r in self.con.execute(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('main', 'information_schema', 'pg_catalog')").fetchall()}
        self.assertEqual(checkpoints["schemas"], sorted(built))
        self.assertIn("voltmarkt", checkpoints["schemas"])
        self.assertIn(RAW, checkpoints["schemas"])
        self.assertNotIn("checkpoints", json.loads((self.dir / "truth" / "voltmarkt.json").read_text(encoding="utf-8")))

    def test_notes_truth_and_descriptions(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        visible = [n for n in notes if n["schema"] == "voltmarkt"]
        self.assertEqual({n["table"] for n in visible},
                         LEVEL1_TABLES | set(LEVEL3_NOTES) | AB_TABLES | {COST} | VIEWS | {WEEKLY, WEEKLY_UNITS})
        sales = {n["schema"]: n for n in notes if n["table"] == "sales"}
        self.assertEqual(set(sales), {"voltmarkt", *LEVEL1_EDGE_SCHEMAS, *ORDER_EDGE_SCHEMAS, *LEVEL4_EDGE_SCHEMAS},
                         "the view and every edge copy have notes")
        for s, n in sales.items():
            self.assertEqual(n["grain"], "one row per order line")
            self.assertEqual(n["primary_key"], ["order_line_id"])
            self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM {s}.sales")[0])
            self.assertEqual(n["sample"]["columns"], [c for c, _ in SALES_COLUMNS])
            self.assertEqual(len(n["sample"]["rows"]), min(5, n["row_count"]), s)   # M5: a level 1 edge copy has no rows
        truth = json.loads((self.dir / "truth" / "voltmarkt.json").read_text(encoding="utf-8"))
        self.assertEqual(truth["seed"], 1101)
        self.assertIn("FIND-01-04", truth["findings"])
        root = pathlib.Path(build_course_db.ROOT)
        for sql in (root / "pipeline" / "edge").glob("*.sql"):
            path = root / "content" / "sql" / "edge" / f"{sql.stem}.json"
            self.assertTrue(path.exists(), sql.stem)
            desc = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual((desc["schema"], desc["mirrors"]), (sql.stem, EDGE_MIRRORS.get(sql.stem, "voltmarkt")))
            self.assertTrue(desc["contains"], sql.stem)
        families = {json.loads((root / "content" / "sql" / "edge" / f"{s}.json").read_text(encoding="utf-8"))["family"]
                    for s in LEVEL2_EDGE_SCHEMAS}
        self.assertEqual(families, {"agg", "case", "type"})
        families = {s: json.loads((root / "content" / "sql" / "edge" / f"{s}.json").read_text(encoding="utf-8"))["family"]
                    for s in LEVEL3_EDGE_SCHEMAS}
        self.assertEqual(families, {"voltmarkt_edge_date": "date", "voltmarkt_edge_join": "join", "voltmarkt_edge_set": "set"})

    def test_level3_tables_in_the_schema_notes(self):
        # S4-01: grain, primary key, foreign keys labelled 1:N, row count, a 5-row sample, allowed values of code columns.
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        visible = {n["table"]: n for n in notes if n["schema"] == "voltmarkt"}
        for table, (grain, pk, fks) in LEVEL3_NOTES.items():
            n = visible[table]
            self.assertEqual(n["grain"], grain, table)
            self.assertEqual(n["primary_key"], pk, table)
            self.assertEqual(n["foreign_keys"], [{"columns": [c], "references": f"{t}.{rc}", "ref_table": t, "ref_columns": [rc],
                                                  "cardinality": "1:N"} for c, t, rc in fks], table)
            self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM voltmarkt.{table}")[0], table)
            self.assertEqual(n["sample"]["columns"], [c for c, _ in self.columns("voltmarkt", table)], table)
            self.assertEqual(len(n["sample"]["rows"]), 5, table)
            self.assertEqual(n["from_level"], 3, f"{table} shows from level 3 on")
            keys = self.one(f"SELECT count(*) = count(DISTINCT ({', '.join(pk)})) FROM voltmarkt.{table}")[0]
            self.assertTrue(keys, f"{table}'s primary key is unique")
        self.assertEqual(visible["orders"]["allowed_values"], {"channel": ["store", "web"], "ship_to_country": ["BE", "LU", "NL"]})
        self.assertEqual(visible["competitor_prices"]["allowed_values"], {"competitor": sorted(build_course_db.vm.COMPETITORS)})
        for table in ("order_lines", "price_history", "promotion_products"):
            self.assertNotIn("allowed_values", visible[table], table)
        # Levels 1 and 2 keep today's tables: every other note shows from level 1. Sprint 6: the raw tables, cost_history and
        # weekly_units arrive with level 4 (ruling P11: E-169 moved weekly_units' only readers, CASE-PRICE-03 and -04, to level 4).
        # Mailvora's notes are held by test_mailvora_notes_in_the_file.
        notes = [n for n in notes if n["schema"].startswith("voltmarkt")]
        for n in notes:
            if n["schema"] == RAW or n["table"] in (COST, WEEKLY_UNITS):
                self.assertEqual(n["from_level"], 4, f"{n['schema']}.{n['table']} shows from level 4 on")
            elif n["table"] == WEEKLY or n["table"] in AB_TABLES:
                self.assertEqual(n["from_level"], 3, f"{n['table']} shows from level 3 on, with competitor_prices")
            elif n["table"] not in LEVEL3_NOTES:
                self.assertEqual(n["from_level"], 1, f"{n['schema']}.{n['table']}")
        # Every foreign key of every note carries its referenced table and columns as data (Task B2 renders them).
        for n in notes:
            for f in n["foreign_keys"]:
                self.assertEqual(f["references"], f"{f['ref_table']}.{', '.join(f['ref_columns'])}", f"{n['table']}: {f}")
                self.assertIn(f["ref_table"], VOLTMARKT_TABLES, f"{n['table']}: {f}")
                self.assertEqual(f["cardinality"], "1:N")
        for name in LEVEL3_NOTES:
            for f in visible[name]["foreign_keys"]:
                orphans = self.one(f"""SELECT count(*) FROM voltmarkt.{name} x WHERE x.{f['columns'][0]} IS NOT NULL AND NOT EXISTS
                                       (SELECT 1 FROM voltmarkt.{f['ref_table']} r WHERE r.{f['ref_columns'][0]} = x.{f['columns'][0]})""")[0]
                self.assertEqual(orphans, 0, f"voltmarkt.{name}.{f['columns'][0]} always meets {f['references']}")

    def test_notes_list_allowed_values_of_category_like_columns(self):
        # E-019: the notes list the allowed values of each category-like column, from the visible data only.
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        visible = {n["table"]: n.get("allowed_values", {}) for n in notes if n["schema"] == "voltmarkt"}
        self.assertEqual(visible["stores"]["country_code"], ["BE", "LU", "NL"])
        self.assertEqual(visible["stores"]["store_type"], ["flagship", "outlet", "standard", "web"])
        self.assertEqual(visible["promotions"]["promo_type"], ["bundle", "clearance", "loyalty", "percent_off"])
        self.assertEqual(visible["calendar"]["event"], ["black_friday", "cyber_monday", "sinterklaas"])
        self.assertEqual(visible["sales"]["channel"], ["store", "web"])
        self.assertEqual(visible["sales"]["country_code"], ["BE", "LU", "NL"])
        self.assertEqual(len(visible["sales"]["parent_category"]), 7)
        for table, values in visible.items():
            for column in values:
                self.assertNotIn(column, {"store_code", "city", "product_name", "category_name", "sku", "brand",
                                          "promo_code", "promo_name"}, f"{table}.{column} has too many values to list")
        self.assertEqual(visible["products"], {}, "no products column is category-like")
        for n in notes:
            if n["schema"] not in ("voltmarkt", RAW, MAILVORA, MAILVORA_RAW):
                self.assertNotIn("allowed_values", n, f"{n['schema']}: never from the edge schemas")
        # The raw schema is a visible schema too (S6-01): its notes list its own values.
        raw = {n["table"]: n.get("allowed_values", {}) for n in notes if n["schema"] == RAW}
        self.assertEqual(raw["orders"], {"channel": ["store", "web"], "ship_to_country": ["BE", "LU", "NL"]})
        self.assertEqual(raw["products"], {}, "category_raw has too many spellings to list")

    def test_level2_edge_schemas_plant_their_cases(self):
        for s, ties in EDGE_TIES.items():
            for sql, n in ties:
                rows = self.con.execute(sql.format(s=s)).fetchall()
                self.assertGreater(len(rows), n, f"{s}: {sql}")
                self.assertEqual(rows[n - 1][1], rows[n][1], f"{s}: a tie at the top-{n} cutoff of {sql}")
                self.assertNotEqual(rows[n - 2][1], rows[n - 1][1], f"{s}: the tie sits exactly at the cutoff of {sql}")
            nulls = self.one(f"SELECT count(*) - count(units), count(*) - count(net_revenue_eur), count(*) - count(unit_cost_eur) FROM {s}.sales")
            self.assertTrue(all(x > 0 for x in nulls), f"{s}: missing units, net revenue and unit cost {nulls}")
            empty = self.one(f"""SELECT count(*) FROM (SELECT DISTINCT store_code FROM {s}.sales) a,
                                     (SELECT DISTINCT order_month FROM {s}.sales) b
                                 WHERE NOT EXISTS (SELECT 1 FROM {s}.sales x WHERE x.store_code = a.store_code AND x.order_month = b.order_month)""")[0]
            self.assertGreater(empty, 0, f"{s}: a store with no rows in a month that has rows")
            boundary = self.one(f"""SELECT count(*) FILTER (WHERE order_week < order_month),
                                           count(*) FILTER (WHERE order_date = last_day(order_date)) FROM {s}.sales""")
            self.assertTrue(all(x > 0 for x in boundary), f"{s}: ISO-week and month-end boundary dates {boundary}")
        # _type: integer columns whose division truncates, and CAST rounds where trunc does not (E-055).
        trunc = self.one("""SELECT count(*) FILTER (WHERE sum_units % lines <> 0),
                                   count(*) FILTER (WHERE CAST(sum_units / lines AS INTEGER) <> sum_units // lines)
                            FROM (SELECT store_code, sum(units) AS sum_units, count(units) AS lines
                                  FROM voltmarkt_edge_type.sales GROUP BY 1)""")
        self.assertTrue(all(x > 0 for x in trunc), trunc)
        # _type: a share of exactly 0.15, so 15 and 0.15 are both plausible answers (ERR-LOG-21).
        share = self.one("""SELECT count(*) FROM (SELECT product_name, sum(net_revenue_eur) AS net, sum(units * unit_cost_eur) AS cost
                                                  FROM voltmarkt_edge_type.sales GROUP BY 1)
                            WHERE (net - cost) / net = 0.15""")[0]
        self.assertGreater(share, 0)
        # _case: line values exactly on common band boundaries.
        bands = self.one("SELECT count(DISTINCT net_revenue_eur) FROM voltmarkt_edge_case.sales WHERE net_revenue_eur IN (50, 100, 500)")[0]
        self.assertEqual(bands, 3)

    # S4-03: each level 3 edge schema holds each of its cases (one assertion per case).

    def test_join_edge_schema_plants_its_cases(self):
        s = "voltmarkt_edge_join"
        no_lines = self.one(f"SELECT count(*) FROM {s}.orders o WHERE NOT EXISTS (SELECT 1 FROM {s}.order_lines l WHERE l.order_id = o.order_id)")[0]
        self.assertGreater(no_lines, 0, "an order with no lines")
        promo = self.one(f"""SELECT count(*) FILTER (WHERE promo_id IS NOT NULL AND promo_id NOT IN (SELECT promo_id FROM {s}.promotions)),
                                    count(*) FILTER (WHERE promo_id IS NULL) FROM {s}.order_lines""")
        self.assertTrue(all(x > 0 for x in promo), f"a line whose promotion has no row in promotions, beside lines with no promotion {promo}")
        two = self.one(f"""SELECT count(*) FROM (SELECT product_id FROM {s}.promotion_products GROUP BY 1 HAVING count(*) >= 2) p
                           WHERE p.product_id IN (SELECT product_id FROM {s}.order_lines)""")[0]
        self.assertGreater(two, 0, "a product in two promotions, with sales, so a join on product repeats its lines")
        prices = self.one(f"""WITH v AS (SELECT product_id, date_trunc('week', valid_from) AS wk FROM {s}.price_history GROUP BY ALL HAVING count(*) >= 2)
                              SELECT count(DISTINCT l.unit_price_eur) FROM {s}.order_lines l JOIN {s}.orders o USING (order_id)
                              JOIN v ON v.product_id = l.product_id AND v.wk = date_trunc('week', o.order_ts)""")[0]
        self.assertGreaterEqual(prices, 2, "two price versions in one week, each with a sale")
        idle = self.one(f"SELECT count(*) FROM {s}.stores s WHERE NOT EXISTS (SELECT 1 FROM {s}.orders o WHERE o.store_id = s.store_id)")[0]
        self.assertGreater(idle, 0, "a store with no orders")
        guest = self.one(f"SELECT count(*) FROM {s}.orders WHERE customer_id IS NULL AND order_id IN (SELECT order_id FROM {s}.order_lines)")[0]
        self.assertGreater(guest, 0, "a guest order with a missing customer")
        # SQL-JOIN-03's third fan-out source: several competitor rows for a product in a week it sold.
        rivals = self.one(f"""SELECT count(*) FROM (SELECT product_id, date_trunc('week', observed_ts) AS wk FROM {s}.competitor_prices
                              GROUP BY ALL HAVING count(*) >= 2) c
                              WHERE EXISTS (SELECT 1 FROM {s}.sales x WHERE x.product_id = c.product_id AND x.order_week = c.wk)""")[0]
        self.assertGreater(rivals, 0, "competitor rows that fan out a product's sales in one week")

    def test_date_edge_schema_plants_its_cases(self):
        s = "voltmarkt_edge_date"
        late = {r[0] for r in self.con.execute(f"""SELECT date_diff('hour', order_ts, {AMSTERDAM}) FROM {s}.orders
            WHERE channel = 'web' AND strftime(order_ts, '%H:%M') = '23:30'
              AND CAST({AMSTERDAM} AS DATE) = CAST(order_ts AS DATE) + 1""").fetchall()}
        self.assertEqual(late, {1, 2}, "23:30 UTC web orders that fall on the next Amsterdam day, in winter and in summer time")
        repeated = self.one(f"""SELECT count(DISTINCT order_ts) FROM {s}.orders
                                WHERE channel = 'web' AND {AMSTERDAM} = TIMESTAMP '2025-10-26 02:30:00'""")[0]
        self.assertEqual(repeated, 2, "the 2025-10-26 clock change: two UTC times that read 02:30 in Amsterdam")
        ends = {r[0] for r in self.con.execute(f"""SELECT DISTINCT CAST(order_ts AS DATE) FROM {s}.orders
            WHERE CAST(order_ts AS DATE) = last_day(CAST(order_ts AS DATE)) AND order_ts > CAST(CAST(order_ts AS DATE) AS TIMESTAMP)""").fetchall()}
        self.assertTrue(ends >= {dt.date(2024, 2, 29), dt.date(2024, 12, 31), dt.date(2025, 1, 31), dt.date(2025, 6, 30)},
                        f"orders after midnight on month ends, the leap day among them {sorted(ends)}")
        iso = {r[0] for r in self.con.execute(f"""SELECT DISTINCT isoyear(order_ts) FROM {s}.orders
                                                  WHERE week(order_ts) = 1 AND year(order_ts) <> isoyear(order_ts)""").fetchall()}
        self.assertEqual(iso, {2025, 2026}, "ISO week 1 across a year: late December orders in week 1 of the next ISO year")

    def test_set_edge_schema_plants_its_cases(self):
        s = "voltmarkt_edge_set"
        both = self.one(f"""SELECT count(*) FROM (SELECT product_id FROM {s}.sales WHERE channel = 'web'
                            INTERSECT SELECT product_id FROM {s}.sales WHERE channel = 'store')""")[0]
        self.assertGreater(both, 0, "rows in both inputs")
        dupes = self.one(f"SELECT count(*) - count(DISTINCT product_id) FROM {s}.sales WHERE channel = 'web'")[0]
        self.assertGreater(dupes, 0, "duplicates inside one input")
        missing = self.one(f"""SELECT
            (SELECT count(*) FROM (SELECT customer_id FROM {s}.orders WHERE channel = 'web'
                                   INTERSECT SELECT customer_id FROM {s}.orders WHERE channel = 'store') WHERE customer_id IS NULL),
            (SELECT count(*) FROM {s}.orders WHERE channel = 'web'
                AND customer_id NOT IN (SELECT customer_id FROM {s}.orders WHERE channel = 'store')),
            (SELECT count(*) FROM (SELECT customer_id FROM {s}.orders WHERE channel = 'web'
                                   EXCEPT SELECT customer_id FROM {s}.orders WHERE channel = 'store'))""")
        self.assertTrue(missing[0] == 1 and missing[1] == 0 and missing[2] > 0,
                        f"missing values in compared columns: INTERSECT keeps one missing row, NOT IN finds nothing, EXCEPT does {missing}")

    def test_weekly_view_exists_where_competitor_prices_does_and_nowhere_else(self):
        # S4B-31: built by its own step, not by ddl.sql's view list, so the level 2 edge schemas never see it.
        found = sorted(r[0] for r in self.con.execute(
            "SELECT schema_name FROM duckdb_views() WHERE view_name = ? AND NOT internal", [WEEKLY]).fetchall())
        self.assertEqual(found, sorted(WEEKLY_SCHEMAS))
        self.assertEqual(self.one("SELECT count(*) FROM duckdb_tables() WHERE table_name = ?", [WEEKLY])[0], 0)
        for s in WEEKLY_SCHEMAS:
            self.assertEqual(self.columns(s, WEEKLY), WEEKLY_COLUMNS, s)
        for s in [*LEVEL1_EDGE_SCHEMAS, *LEVEL2_EDGE_SCHEMAS]:
            self.assertNotIn(WEEKLY, self.names(s)[1], s)

    def test_weekly_view_one_row_per_product_and_iso_week(self):
        for s in WEEKLY_SCHEMAS:
            rows, distinct_view = self.one(f"SELECT count(*), count(DISTINCT (product_id, iso_year, iso_week)) FROM {s}.{WEEKLY}")
            weeks = self.one(f"SELECT count(*) FROM (SELECT DISTINCT product_id, isoyear(observed_ts), week(observed_ts) "
                             f"FROM {s}.competitor_prices)")[0]
            self.assertGreater(rows, 0, s)
            self.assertEqual(rows, distinct_view, f"{s}: the grain is unique")
            self.assertEqual(rows, weeks, f"{s}: one row per product and ISO week present in competitor_prices")
            bad = self.one(f"SELECT count(*) FROM {s}.{WEEKLY} WHERE competitors_seen < 1 OR avg_competitor_price_eur IS NULL")[0]
            self.assertEqual(bad, 0, s)

    def test_weekly_view_average_and_count_match_a_recomputation(self):
        top = self.con.execute("SELECT product_id FROM voltmarkt.competitor_prices GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 2").fetchall()
        self.assertEqual(len(top), 2)
        for (pid,) in top:
            raw = self.con.execute("SELECT competitor, observed_ts, price_eur FROM voltmarkt.competitor_prices WHERE product_id = ?", [pid]).fetchall()
            expected = {}
            for competitor, ts, price in raw:
                iso = ts.isocalendar()   # the stored instant is UTC and the connection's TimeZone is UTC
                expected.setdefault((iso[0], iso[1]), []).append((competitor, float(price)))
            got = {(y, w): (a, n) for y, w, a, n in self.con.execute(
                f"SELECT iso_year, iso_week, avg_competitor_price_eur, competitors_seen FROM voltmarkt.{WEEKLY} WHERE product_id = ?", [pid]).fetchall()}
            self.assertEqual(set(got), set(expected), f"product {pid}")
            for key, obs in expected.items():
                self.assertAlmostEqual(got[key][0], sum(p for _, p in obs) / len(obs), places=9, msg=f"product {pid} {key}")
                self.assertEqual(got[key][1], len({c for c, _ in obs}), f"product {pid} {key}")

    def test_weekly_view_uses_the_iso_year_across_new_year(self):
        # A day in late December or early January belongs to the ISO year of its week, not its calendar year.
        mismatch = self.one(f"""SELECT count(*) FROM (SELECT DISTINCT product_id, isoyear(observed_ts) AS y, week(observed_ts) AS w
                                FROM voltmarkt.competitor_prices WHERE month(observed_ts) = 12 AND day(observed_ts) >= 29
                                OR month(observed_ts) = 1 AND day(observed_ts) <= 3) c
                                LEFT JOIN voltmarkt.{WEEKLY} v ON v.product_id = c.product_id AND v.iso_year = c.y AND v.iso_week = c.w
                                WHERE v.product_id IS NULL""")[0]
        self.assertEqual(mismatch, 0)

    def test_weekly_view_iso_year_boundary_days_have_fixed_weeks(self):
        # K7a (backlog 4b, B3-m2): the expected weeks are written out, not derived with isoyear() and week(), which the view itself uses.
        # voltmarkt's competitor_prices run from 2024-01-01 to 2025-12-31, so three year ends fall inside them.
        fixed = {
            "2024-12-29": (2024, 52), "2024-12-30": (2025, 1),     # a Sunday ends 2024-W52; the Monday after opens 2025-W01
            "2024-12-31": (2025, 1), "2025-01-01": (2025, 1), "2025-01-04": (2025, 1),
            "2025-12-28": (2025, 52), "2025-12-29": (2026, 1),     # the same in the second year
            "2025-12-31": (2026, 1),
        }
        for day, (year, week) in fixed.items():
            products = [p for (p,) in self.con.execute(
                "SELECT DISTINCT product_id FROM voltmarkt.competitor_prices WHERE CAST(observed_ts AS DATE) = CAST(? AS DATE)", [day]).fetchall()]
            self.assertTrue(products, f"{day}: competitor_prices has observations that day")
            have = {p for (p,) in self.con.execute(
                f"SELECT product_id FROM voltmarkt.{WEEKLY} WHERE iso_year = ? AND iso_week = ?", [year, week]).fetchall()}
            self.assertEqual(set(products) - have, set(), f"{day}: every product observed that day has a row in {year}-W{week:02d}")
        stray = self.con.execute(f"SELECT DISTINCT iso_year, iso_week FROM voltmarkt.{WEEKLY} WHERE iso_week = 53 OR (iso_year = 2026 AND iso_week > 1) "
                                 f"OR (iso_year = 2024 AND iso_week > 52)").fetchall()
        self.assertEqual(stray, [], "no week 53 and nothing past 2026-W01, though the data ends on 2025-12-31")

    def test_weekly_view_notes_and_ship_to_country_note(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        by_schema = {n["schema"]: n for n in notes if n["table"] == WEEKLY}
        self.assertEqual(set(by_schema), set(WEEKLY_SCHEMAS))
        for s, n in by_schema.items():
            self.assertEqual(n["grain"], "one row per product and ISO week, built from competitor_prices", s)
            self.assertEqual(n["primary_key"], ["product_id", "iso_year", "iso_week"], s)
            self.assertEqual(n["sample"]["columns"], [c for c, _ in WEEKLY_COLUMNS], s)
            self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM {s}.{WEEKLY}")[0], s)
            self.assertEqual(set(n["column_notes"]), {"iso_year", "iso_week", "avg_competitor_price_eur", "competitors_seen"}, s)
            self.assertIn("UTC", n["column_notes"]["iso_week"], s)
        sales = [n for n in notes if n["table"] == "sales"]
        self.assertEqual({n["schema"] for n in sales}, {"voltmarkt", *LEVEL1_EDGE_SCHEMAS, *ORDER_EDGE_SCHEMAS, *LEVEL4_EDGE_SCHEMAS})
        for n in sales:
            self.assertIn("ship-to country", n["column_notes"]["country_code"], n["schema"])

    def test_weekly_view_is_deterministic(self):
        again = build_course_db.build(self.dir / "again2" / "course.duckdb", data_dir=self.dir / "again2")
        for s in WEEKLY_SCHEMAS:
            self.assertEqual(again["tables"][f"{s}.{WEEKLY}"], self.manifest["tables"][f"{s}.{WEEKLY}"], s)
        for name in [f"{RAW}.{t}" for t in RAW_TABLES] + [f"voltmarkt.{COST}", f"voltmarkt.{WEEKLY_UNITS}"]:
            self.assertEqual(again["tables"][name], self.manifest["tables"][name], f"{name}: same seed, same rows and hash")

    # ---- Sprint 6 (Task B1): the raw schema, cost_history and weekly_units in the built database ----

    def test_raw_schema_notes(self):
        # S6-02: the raw tables show in the schema panel from level 4, each with "This table may hold errors.", and the raw
        # order_ts is not called a UTC instant (store orders are in the store's local time there: Q-01-05).
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        raw = {n["table"]: n for n in notes if n["schema"] == RAW}
        visible = {n["table"]: n for n in notes if n["schema"] == "voltmarkt"}
        self.assertEqual(set(raw), RAW_TABLES)
        for table, n in raw.items():
            self.assertTrue(n["grain"].startswith(RAW_WARNING), f"{table}: {n['grain']}")
            self.assertIn(visible[table]["grain"].lower(), n["grain"].lower(), f"{table} keeps the clean grain after the warning")
            self.assertEqual(n["primary_key"], visible[table]["primary_key"], table)
            self.assertEqual(n["from_level"], 4, table)
            self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM {RAW}.{table}")[0], table)
            self.assertEqual(n["sample"]["columns"], [c for c, _ in self.columns(RAW, table)], table)
            self.assertEqual(len(n["sample"]["rows"]), 5, table)
            for f in n["foreign_keys"]:
                self.assertIn(f["ref_table"], RAW_TABLES, f"{table}: {f}")
            self.assertNotIn("—", json.dumps(n, ensure_ascii=False), "no em dash")
        self.assertNotIn("UTC", raw["orders"]["column_notes"]["order_ts"], "a raw store order's time is local, not UTC")
        names = [n["table"] for n in notes if n["schema"] == RAW]
        self.assertEqual(len(names), len(set(names)), "one note per raw table")

    def test_cost_history_and_weekly_units_notes(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        visible = {n["table"]: n for n in notes if n["schema"] == "voltmarkt"}
        order = [n["table"] for n in notes if n["schema"] == "voltmarkt"]
        cost = visible[COST]
        self.assertEqual(cost["primary_key"], ["product_id", "valid_from"])
        self.assertEqual([f["ref_table"] for f in cost["foreign_keys"]], ["products"])
        self.assertIn("valid_to is missing for the current cost", cost["grain"])
        self.assertEqual(order.index(COST), order.index("ab_conversions") + 1, "appended after the A/B test's tables")
        self.assertLess(order.index(COST), order.index("sales"), "before the views")
        units = visible[WEEKLY_UNITS]
        self.assertEqual(units["primary_key"], ["product_id", "iso_year", "iso_week"])
        self.assertEqual(units["sample"]["columns"], [c for c, _ in WEEKLY_UNITS_COLUMNS])
        self.assertEqual(set(units["column_notes"]), {"iso_year", "iso_week", "week_start", "units", "net_revenue_eur"})
        self.assertIn("0", units["column_notes"]["units"], "the units note says a week with no sales holds 0")
        by_schema = {n["schema"] for n in notes if n["table"] == WEEKLY_UNITS}
        self.assertEqual(by_schema, set(WEEKLY_UNITS_SCHEMAS), "the view and its edge copy have notes")

    def test_weekly_units_is_one_zero_filled_row_per_product_and_calendar_week(self):
        # S6-06, E-011: every product in every ISO week of the calendar, with 0 for a week with no sales.
        found = sorted(r[0] for r in self.con.execute(
            "SELECT schema_name FROM duckdb_views() WHERE view_name = ? AND NOT internal", [WEEKLY_UNITS]).fetchall())
        self.assertEqual(found, sorted(WEEKLY_UNITS_SCHEMAS))
        for s in WEEKLY_UNITS_SCHEMAS:
            self.assertEqual(self.columns(s, WEEKLY_UNITS), WEEKLY_UNITS_COLUMNS, s)
            rows, grain, products, weeks, missing = self.one(f"""SELECT count(*), count(DISTINCT (product_id, iso_year, iso_week)),
                    (SELECT count(*) FROM {s}.products), (SELECT count(DISTINCT week_start) FROM {s}.calendar),
                    count(*) - count(units) + count(*) - count(net_revenue_eur) FROM {s}.{WEEKLY_UNITS}""")
            self.assertEqual((rows, grain, missing), (products * weeks, rows, 0), s)
        s = "voltmarkt"
        self.assertEqual(self.one(f"SELECT count(*) FROM {s}.{WEEKLY_UNITS}")[0], 1200 * 105, "1,200 products in 105 ISO weeks")
        zeros = self.one(f"SELECT count(*) FROM {s}.{WEEKLY_UNITS} WHERE units = 0 AND net_revenue_eur = 0")[0]
        self.assertGreater(zeros, 1000, "weeks with no sales are rows with 0")
        units, net = self.one(f"SELECT sum(units), sum(net_revenue_eur) FROM {s}.{WEEKLY_UNITS}")
        self.assertEqual(units, self.one(f"SELECT sum(quantity) FROM {s}.order_lines")[0], "its units add up to the order lines'")
        self.assertEqual(net, self.one(f"SELECT sum(net_revenue_eur) FROM {s}.sales")[0], "its net revenue adds up to the sales view's")
        week = self.one(f"""SELECT units, net_revenue_eur FROM {s}.{WEEKLY_UNITS} WHERE product_id = 311 AND week_start = DATE '2025-03-10'""")
        again = self.one(f"""SELECT sum(units), sum(net_revenue_eur) FROM {s}.sales WHERE product_id = 311 AND order_week = DATE '2025-03-10'""")
        self.assertEqual(week, again, "a promotion week recomputed from the sales view")
        iso = self.one(f"SELECT DISTINCT iso_year, iso_week FROM {s}.{WEEKLY_UNITS} WHERE week_start = DATE '2025-12-29'")
        self.assertEqual(iso, (2026, 1), "the last partial week of 2025 is ISO week 1 of 2026, as the calendar says")

    def test_truth_file_records_the_raw_and_cost_plants(self):
        truth = json.loads((self.dir / "truth" / "voltmarkt.json").read_text(encoding="utf-8"))
        self.assertEqual(set(truth["planted"]["raw"]), {"Q-01-01", "Q-01-02", "Q-01-04", "Q-01-05", "Q-01-06", "Q-01-07"})
        self.assertIn("cost_history", truth["planted"])
        self.assertEqual(set(truth["findings"]["raw"]), {"Q-01-01", "Q-01-02", "Q-01-05", "Q-01-06"})
        max_id = self.one("SELECT max(order_line_id) FROM voltmarkt.order_lines")[0]
        resent = self.one(f"SELECT count(*) FROM {RAW}.order_lines WHERE order_line_id > {max_id}")[0]
        self.assertEqual(truth["planted"]["raw"]["Q-01-01"]["count"], resent, "the truth matches the built raw table")

    # ---- S6-04: each new edge schema holds each of its cases (one assertion per case) ----

    def test_subq_edge_schema_plants_its_cases(self):
        s = "voltmarkt_edge_subq"
        not_in, not_exists = self.one(f"""SELECT
            (SELECT count(*) FROM {s}.promotions WHERE promo_id NOT IN (SELECT promo_id FROM {s}.order_lines)),
            (SELECT count(*) FROM {s}.promotions pr WHERE NOT EXISTS (SELECT 1 FROM {s}.order_lines l WHERE l.promo_id = pr.promo_id))""")
        self.assertTrue(not_in == 0 < not_exists, f"a missing value in a column NOT IN reads: NOT IN finds nothing, NOT EXISTS does {(not_in, not_exists)}")
        one = self.one(f"SELECT count(*) FROM (SELECT category_id FROM {s}.products GROUP BY 1 HAVING count(*) = 1)")[0]
        self.assertGreater(one, 0, "a category with one product")
        tied = self.one(f"""WITH cur AS (SELECT p.product_id, p.category_id, ph.list_price_eur FROM {s}.products p
                                         JOIN {s}.price_history ph USING (product_id) WHERE ph.valid_to IS NULL),
                                 top AS (SELECT category_id, max(list_price_eur) AS m FROM cur GROUP BY 1)
                            SELECT count(*) FROM (SELECT c.category_id FROM cur c JOIN top t ON t.category_id = c.category_id AND c.list_price_eur = t.m
                                                  GROUP BY 1 HAVING count(*) = 2)""")[0]
        self.assertGreater(tied, 0, "two products tied at a category's top current list price")
        no_orders = self.one(f"""SELECT (SELECT count(*) FROM {s}.ab_assignments a WHERE NOT EXISTS
                                            (SELECT 1 FROM {s}.orders o WHERE o.customer_id = a.customer_id)),
                                        (SELECT count(*) FROM {s}.ab_assignments WHERE customer_id NOT IN (SELECT customer_id FROM {s}.orders))""")
        self.assertTrue(no_orders[0] > 0 == no_orders[1], f"a customer with no orders, which NOT IN over a guest order misses {no_orders}")
        empty = self.one(f"""SELECT (SELECT count(*) FROM {s}.categories c WHERE NOT EXISTS (SELECT 1 FROM {s}.products p WHERE p.category_id = c.category_id)),
                                    (SELECT count(*) FROM {s}.products p WHERE NOT EXISTS (SELECT 1 FROM {s}.order_lines l WHERE l.product_id = p.product_id)),
                                    (SELECT count(*) FROM {s}.stores st WHERE NOT EXISTS (SELECT 1 FROM {s}.orders o WHERE o.store_id = st.store_id))""")
        self.assertTrue(all(x > 0 for x in empty), f"correlated groups with no rows: a category, a product and a store {empty}")

    def test_interval_edge_schema_plants_its_cases(self):
        s = "voltmarkt_edge_interval"
        one_day = self.one(f"""SELECT count(*) FROM {s}.promotions pr WHERE pr.start_date = pr.end_date AND EXISTS (
            SELECT 1 FROM {s}.order_lines l JOIN {s}.orders o USING (order_id) WHERE l.promo_id = pr.promo_id)""")[0]
        self.assertGreater(one_day, 0, "a one-day promotion, with a sale on its day")
        month_on = {r[0] for r in self.con.execute(f"""SELECT CAST(CAST(order_ts AS DATE) + INTERVAL 1 MONTH AS DATE) FROM {s}.orders
                                                       WHERE month(order_ts) = 1 AND day(order_ts) = 31""").fetchall()}
        days = {r[0] for r in self.con.execute(f"SELECT DISTINCT CAST(order_ts AS DATE) FROM {s}.orders").fetchall()}
        self.assertTrue(month_on == {dt.date(2024, 2, 29), dt.date(2025, 2, 28)} and month_on <= days,
                        f"orders on 31 January, one month on from which is the last day of February, with orders that day {sorted(month_on)}")
        leap = self.one(f"""SELECT count(*) FROM {s}.orders WHERE CAST(order_ts AS DATE) = DATE '2024-02-29'
                            AND EXISTS (SELECT 1 FROM {s}.calendar WHERE cal_date = DATE '2024-02-29')""")[0]
        self.assertGreater(leap, 0, "orders on 29 February 2024, a day the calendar has")
        year_end = self.one(f"""SELECT count(*) FROM {s}.promotions WHERE year(start_date) < year(end_date)
                                AND date_diff('year', start_date, end_date) = 1 AND date_diff('day', start_date, end_date) < 30""")[0]
        self.assertGreater(year_end, 0, "a date difference across a year end: one year boundary in under 30 days")
        inclusive = self.one(f"""SELECT count(*) FROM {s}.promotions pr WHERE date_diff('day', pr.start_date, pr.end_date) = 0
                                 AND (SELECT count(*) FROM {s}.calendar c WHERE c.cal_date BETWEEN pr.start_date AND pr.end_date) = 1""")[0]
        self.assertGreater(inclusive, 0, "an inclusive count where start equals end: 0 days apart, 1 day long")
        window = {r[0] for r in self.con.execute(f"""SELECT DISTINCT CAST(order_ts AS DATE) FROM {s}.orders
                                                     WHERE CAST(order_ts AS DATE) BETWEEN DATE '2025-12-05' AND DATE '2025-12-07'""").fetchall()}
        self.assertEqual(window, {dt.date(2025, 12, 5), dt.date(2025, 12, 6), dt.date(2025, 12, 7)},
                         "orders on each side of 30 days before the as-of date (2026-01-05)")

    def test_clean_edge_schema_plants_its_cases(self):
        s = CLEAN_EDGE
        exact, near = self.one(f"""SELECT
            (SELECT count(*) FROM (SELECT order_id, product_id, quantity, unit_price_eur, promo_id, line_discount_eur
                                   FROM {s}.order_lines GROUP BY ALL HAVING count(*) > 1)),
            (SELECT count(*) FROM (SELECT order_id, product_id FROM {s}.order_lines GROUP BY ALL
                                   HAVING count(DISTINCT (quantity, unit_price_eur, promo_id, line_discount_eur)) > 1))""")
        self.assertTrue(exact > 0 and near > 0, f"an exact duplicate and a near duplicate {(exact, near)}")
        cents = {r[0] for r in self.con.execute(f"""SELECT DISTINCT month(o.order_ts) FROM {s}.order_lines l JOIN {s}.orders o USING (order_id)
            JOIN {s}.stores st USING (store_id) JOIN {s}.price_history ph ON ph.product_id = l.product_id
             AND CAST(o.order_ts AS DATE) BETWEEN ph.valid_from AND coalesce(ph.valid_to, DATE '9999-12-31')
            WHERE st.store_code = 'BE-07' AND l.unit_price_eur = 100 * ph.list_price_eur""").fetchall()}
        self.assertTrue(6 in cents and cents - {6}, f"BE-07 lines in cents in June and outside June (months {sorted(cents)})")
        spellings = {r[0] for r in self.con.execute(f"SELECT DISTINCT category_raw FROM {s}.products").fetchall()}
        self.assertTrue({"TV & Video", "tv en video", "TV/Video ", "Téléviseurs"} <= spellings, f"every category spelling {sorted(spellings)}")
        inner = self.one(f"SELECT count(*) FROM {s}.products WHERE trim(sku) LIKE '% %'")[0]
        self.assertGreater(inner, 0, "a sku with an inner space")
        touch, overlap, one_day = self.one(f"""SELECT count(*) FILTER (WHERE a.valid_to + 1 = b.valid_from),
                                                      count(*) FILTER (WHERE b.valid_from <= a.valid_to),
                                                      count(*) FILTER (WHERE b.valid_from = a.valid_to)
            FROM {s}.price_history a JOIN {s}.price_history b ON a.product_id = b.product_id AND a.valid_from < b.valid_from""")
        self.assertTrue(touch > 0 and overlap > one_day > 0, f"two windows that touch but do not overlap, beside overlaps {(touch, overlap, one_day)}")
        late = self.one(f"""SELECT count(*) FILTER (WHERE channel = 'store'), count(*) FILTER (WHERE channel = 'web')
                            FROM {s}.orders WHERE strftime(order_ts, '%H:%M') = '23:30'""")
        self.assertTrue(all(x > 0 for x in late), f"a store order at 23:30 local time, beside a web order at 23:30 UTC {late}")

    def test_promo_edge_schema_plants_its_cases(self):
        s = "voltmarkt_edge_promo"
        gaps = self.one(f"""WITH b AS (SELECT pp.promo_id, w.product_id, w.units FROM {s}.promotions pr
                                       JOIN {s}.promotion_products pp USING (promo_id) JOIN {s}.{WEEKLY_UNITS} w ON w.product_id = pp.product_id
                                       WHERE w.week_start >= pr.start_date - INTERVAL 28 DAY AND w.week_start < pr.start_date)
                            SELECT count(*) FROM (SELECT promo_id, product_id FROM b GROUP BY ALL
                                                  HAVING count(*) = 4 AND bool_or(units = 0) AND bool_or(units > 0))""")[0]
        self.assertGreater(gaps, 0, "a promoted product with weeks of no sales in its 4 baseline weeks (E-011)")
        two = self.one(f"SELECT count(*) FROM (SELECT product_id FROM {s}.promotion_products GROUP BY 1 HAVING count(*) >= 2)")[0]
        self.assertGreater(two, 0, "a product in two promotions")
        lfl = f"""SELECT st.store_id, st.opened_on, st.close_date,
                         count(*) FILTER (WHERE CAST(o.order_ts AS DATE) BETWEEN DATE '2024-09-01' AND DATE '2024-09-30') AS prior,
                         count(*) FILTER (WHERE CAST(o.order_ts AS DATE) BETWEEN DATE '2025-09-01' AND DATE '2025-09-30') AS cur
                  FROM {s}.stores st LEFT JOIN {s}.orders o ON o.store_id = st.store_id AND o.channel = 'store'
                  WHERE st.store_type <> 'web' GROUP BY ALL"""
        opened = self.one(f"SELECT count(*) FROM ({lfl}) WHERE opened_on > DATE '2023-09-01' AND prior > 0 AND cur > 0")[0]
        self.assertGreater(opened, 0, "a store opened inside the like-for-like window that trades in both Septembers")
        closed = self.one(f"SELECT count(*) FROM ({lfl}) WHERE close_date <= DATE '2025-09-30' AND prior > 0 AND cur = 0")[0]
        self.assertGreater(closed, 0, "a closed store")
        quiet = self.one(f"""SELECT count(*) FROM ({lfl}) WHERE opened_on <= DATE '2023-09-01' AND close_date IS NULL
                             AND prior > 0 AND cur = 0""")[0]
        self.assertGreater(quiet, 0, "an eligible store with no sales in one period (E-006)")
        inside = self.one(f"""SELECT count(*) FROM {s}.cost_history h WHERE (month(h.valid_from) NOT IN (1, 4, 7, 10) OR day(h.valid_from) <> 1)
            AND h.valid_from > (SELECT min(valid_from) FROM {s}.cost_history f WHERE f.product_id = h.product_id)
            AND EXISTS (SELECT 1 FROM {s}.order_lines l JOIN {s}.orders o USING (order_id) WHERE l.product_id = h.product_id
                        AND CAST(o.order_ts AS DATE) < h.valid_from AND quarter(o.order_ts) = quarter(h.valid_from) AND year(o.order_ts) = year(h.valid_from))
            AND EXISTS (SELECT 1 FROM {s}.order_lines l JOIN {s}.orders o USING (order_id) WHERE l.product_id = h.product_id
                        AND CAST(o.order_ts AS DATE) >= h.valid_from AND quarter(o.order_ts) = quarter(h.valid_from) AND year(o.order_ts) = year(h.valid_from))""")[0]
        self.assertGreater(inside, 0, "a cost change inside a quarter, with sales on both sides of it")

    def test_new_clean_edge_schemas_follow_e103(self):
        # The three edge schemas that mirror voltmarkt price their lines as voltmarkt does (E-103): the list price on the
        # order date, less the discount of a promotion that covers the product that day, rounded half up.
        for s in LEVEL4_EDGE_SCHEMAS:
            bad = self.one(f"""
                WITH l AS (SELECT ol.*, CAST(o.order_ts AS DATE) AS d FROM {s}.order_lines ol JOIN {s}.orders o USING (order_id))
                SELECT
                  count(*) FILTER (WHERE l.unit_price_eur IS DISTINCT FROM (SELECT ph.list_price_eur FROM {s}.price_history ph
                                    WHERE ph.product_id = l.product_id AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to))),
                  count(*) FILTER (WHERE l.promo_id IS NOT NULL AND l.line_discount_eur IS DISTINCT FROM
                                    (SELECT round(l.quantity * l.unit_price_eur * pr.discount_pct / 100, 2) FROM {s}.promotions pr
                                     JOIN {s}.promotion_products pp ON pp.promo_id = pr.promo_id AND pp.product_id = l.product_id
                                     WHERE pr.promo_id = l.promo_id AND l.d BETWEEN pr.start_date AND pr.end_date)),
                  count(*) FILTER (WHERE l.promo_id IS NULL AND (l.line_discount_eur <> 0 OR EXISTS (
                                    SELECT 1 FROM {s}.promotions pr JOIN {s}.promotion_products pp ON pp.promo_id = pr.promo_id
                                    WHERE pp.product_id = l.product_id AND l.d BETWEEN pr.start_date AND pr.end_date))),
                  count(*) FILTER (WHERE l.d < (SELECT launch_date FROM {s}.products p WHERE p.product_id = l.product_id))
                FROM l""")
            self.assertEqual(tuple(x or 0 for x in bad), (0, 0, 0, 0),
                             f"{s}: lines off the list price, off their promotion, sold in a promotion without it, or before launch")
            stores = self.one(f"""SELECT count(*) FROM {s}.orders o JOIN {s}.stores st USING (store_id)
                                  WHERE (o.channel = 'web') <> (st.store_id = 99) OR (o.channel = 'store' AND o.ship_to_country <> st.country_code)
                                     OR CAST(o.order_ts AS DATE) < st.opened_on OR CAST(o.order_ts AS DATE) > st.close_date""")[0]
            self.assertEqual(stores, 0, f"{s}: orders follow their store (E-016, open dates)")
            costs = self.one(f"""SELECT count(*) FROM (SELECT product_id, valid_to, lead(valid_from) OVER (PARTITION BY product_id ORDER BY valid_from) AS nxt,
                                                         valid_from, min(valid_from) OVER (PARTITION BY product_id) AS first FROM {s}.{COST}) h
                                 JOIN {s}.products p USING (product_id)
                                 WHERE (nxt IS NULL) <> (valid_to IS NULL) OR valid_to + 1 <> nxt OR first <> p.launch_date""")[0]
            self.assertEqual(costs, 0, f"{s}: cost versions start at launch and are contiguous")

    def test_new_edge_calendars_hold_every_order_date(self):
        # B1 fix round: an order bucketed through calendar.quarter or calendar.month_start, as on voltmarkt, is never dropped.
        # The clean edge schema mirrors voltmarkt_raw, where a store order holds the store's local time (Q-01-05), so its UTC
        # date is computed from the store's time zone; a web order's time is UTC there too.
        for s in [*LEVEL4_EDGE_SCHEMAS, CLEAN_EDGE]:
            ts = ("CASE WHEN o.channel = 'store' THEN timezone('UTC', timezone(st.timezone, o.order_ts)) ELSE o.order_ts END"
                  if s == CLEAN_EDGE else "o.order_ts")
            missing = [str(r[0]) for r in self.con.execute(f"""SELECT DISTINCT CAST({ts} AS DATE) AS d
                FROM {s}.orders o LEFT JOIN {s}.stores st USING (store_id)
                WHERE NOT EXISTS (SELECT 1 FROM {s}.calendar c WHERE c.cal_date = CAST({ts} AS DATE)) ORDER BY 1""").fetchall()]
            with self.subTest(schema=s):
                self.assertEqual(missing, [], f"{s}: order dates (UTC) the calendar does not hold")
        # So weekly_units, built over the calendar's weeks, holds every unit sold (S6-06), in the promo edge schema too.
        for s in WEEKLY_UNITS_SCHEMAS:
            units, lines = self.one(f"SELECT (SELECT sum(units) FROM {s}.{WEEKLY_UNITS}), (SELECT sum(quantity) FROM {s}.order_lines)")
            with self.subTest(schema=s):
                self.assertTrue(units == lines, f"{s}: weekly_units adds up to the order lines' units")

    def test_interval_edge_calendar_holds_every_day_of_its_span(self):
        # F2 C2: as on voltmarkt, one row per day from the calendar's first day to its last (the span its rows covered before),
        # each voltmarkt's row for that day; so EX-SQL-DATE-02's promotion days counted through the calendar match date arithmetic.
        s = "voltmarkt_edge_interval"
        rows, days, first, last = self.one(f"SELECT count(*), count(DISTINCT cal_date), min(cal_date), max(cal_date) FROM {s}.calendar")
        self.assertEqual((first, last), (dt.date(2024, 1, 31), dt.date(2025, 12, 31)), f"{s}: the calendar's span")
        self.assertEqual((rows, days), ((last - first).days + 1, (last - first).days + 1), f"{s}: one row per day of its span")
        self.assertEqual(self.one(f"SELECT count(*) FROM (SELECT * FROM {s}.calendar EXCEPT SELECT * FROM voltmarkt.calendar)")[0], 0,
                         f"{s}: each row is voltmarkt's row for that day")
        for schema in PROMOTION_DAY_SCHEMAS:
            short = [r[0] for r in self.con.execute(f"""SELECT promo_code FROM {schema}.promotions p
                WHERE (SELECT count(*) FROM {schema}.calendar c WHERE c.cal_date BETWEEN p.start_date AND p.end_date)
                      <> date_diff('day', p.start_date, p.end_date) + 1 ORDER BY 1""").fetchall()]
            with self.subTest(schema=schema):
                self.assertEqual(short, [], f"{schema}: promotions with days the calendar does not hold")

    def test_sales_order_date_note_says_it_is_the_utc_day(self):
        # F2 (triage: five SQL-DATE-02 solver notes stumbled on it): the schema panel says order_date is the UTC day of order_ts,
        # in voltmarkt and in every edge copy of the sales view.
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        sales = [n for n in notes if n["table"] == "sales"]
        self.assertEqual({n["schema"] for n in sales}, {"voltmarkt", *LEVEL1_EDGE_SCHEMAS, *ORDER_EDGE_SCHEMAS, *LEVEL4_EDGE_SCHEMAS})
        for n in sales:
            text = n.get("column_notes", {}).get("order_date", "")
            with self.subTest(schema=n["schema"]):
                self.assertIn("UTC day of order_ts", text)
                self.assertNotIn("—", text, "no em dash")
                self.assertEqual(list(n["column_notes"])[0], "order_date", "in column order: order_date before country_code")

    def test_new_edge_descriptions_are_per_table(self):
        # S6-05 with the controller's P2 ruling: the existing shape plus tables, mapping each table to its contains lines.
        root = pathlib.Path(build_course_db.ROOT)
        for s, family in NEW_EDGE_FAMILIES.items():
            desc = json.loads((root / "content" / "sql" / "edge" / f"{s}.json").read_text(encoding="utf-8"))
            self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (s, RAW if s == CLEAN_EDGE else "voltmarkt", family))
            self.assertTrue(desc["contains"] and all(isinstance(x, str) and x for x in desc["contains"]), s)
            tables, views = self.names(s)
            self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables | views, f"{s}: {sorted(set(desc['tables']) - tables - views)}")
            listed = [line for lines in desc["tables"].values() for line in lines]
            self.assertEqual(set(listed) - set(desc["contains"]), set(), f"{s}: every table line is a contains line")
            for table, lines in desc["tables"].items():
                self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{s}.{table}: lines once each, in their order")
            self.assertEqual(set(desc["contains"]) - set(listed), set(), f"{s}: every contains line sits under a table")
            text = json.dumps(desc, ensure_ascii=False)
            self.assertNotIn("—", text, "no em dash")
            self.assertNotIn("NULL", text, "missing, not NULL")

    # ---- Task G1 (S6-20): Mailvora in the built database ----

    def test_every_object_before_sprint6b_is_unchanged_and_part_2_only_adds_mailvora(self):
        # Review Focus 1: every Voltmarkt and edge table and view keeps its rows and hash; Mailvora only adds objects.
        self.assertEqual(len(BEFORE_SPRINT6B), 186)
        moved = sorted(name for name, entry in BEFORE_SPRINT6B.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects built before Part 2 whose rows or hash changed")
        added = sorted(set(self.manifest["tables"]) - set(BEFORE_SPRINT6B))
        expected = ([f"{MAILVORA}.{t}" for t in MAILVORA_TABLES] + [f"{MAILVORA_RAW}.{t}" for t in MAILVORA_RAW_TABLES]
                    + [f"{MAILVORA_EDGE}.{t}" for t in MAILVORA_TABLES])
        # Task G2, ruling P38: the real datasets' edge schemas are our own rows, always built, so they are in the main section too.
        expected += ["online_retail_ii_edge.invoice_lines"] + [f"breakfast_at_the_frat_edge.{t}" for t in ("products", "stores", "transactions")]
        self.assertEqual(added, sorted(expected), "only Mailvora's three schemas and the two real edge schemas are new")
        self.assertEqual(len(added), 33, "Mailvora: 11 clean, 7 raw (P37 adds signups), 11 edge; the real edges: 1 and 3")
        for name in expected:
            self.assertEqual(len(self.manifest["tables"][name]["sha256"]), 64, name)

    def test_mailvora_schemas_and_tables(self):
        self.assertEqual(self.names(MAILVORA), (MAILVORA_TABLES, set()))
        self.assertEqual(self.names(MAILVORA_RAW), (MAILVORA_RAW_TABLES, set()), "P31")
        for t in MAILVORA_RAW_TABLES:
            self.assertEqual(self.columns(MAILVORA_RAW, t), self.columns(MAILVORA, t), f"{MAILVORA_RAW}.{t} has {MAILVORA}.{t}'s columns")
        self.assertEqual(self.names(MAILVORA_EDGE), (MAILVORA_TABLES, set()), "the edge schema mirrors mailvora")
        for t in MAILVORA_TABLES:
            self.assertEqual(self.columns(MAILVORA_EDGE, t), self.columns(MAILVORA, t), f"{MAILVORA_EDGE}.{t} mirrors {MAILVORA}.{t}")
            rows = self.one(f"SELECT count(*) FROM {MAILVORA_EDGE}.{t}")[0]
            self.assertTrue(1 <= rows <= 40, f"{MAILVORA_EDGE}.{t} has {rows} rows, not 1-40")
        sessions = self.one(f"SELECT count(*) FROM {MAILVORA}.sessions")[0]
        self.assertTrue(1_800_000 <= sessions <= 2_200_000, "05 CO-03: about 2,000,000 sessions")
        keys = self.one(f"SELECT count(*) FROM duckdb_constraints() WHERE schema_name = '{MAILVORA}' AND constraint_type = 'PRIMARY KEY'")[0]
        self.assertEqual(keys, 10, "every clean table but activation_events has its key")
        raw_spend_key = self.one(f"""SELECT count(*) FROM duckdb_constraints() WHERE schema_name = '{MAILVORA_RAW}'
                                     AND table_name = 'ad_spend_daily' AND constraint_type = 'PRIMARY KEY'""")[0]
        self.assertEqual(raw_spend_key, 0, "GEN-05: the table with a key quirk (Q-03-04) has no key")

    def test_mailvora_notes_in_the_file(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        clean = {n["table"]: n for n in notes if n["schema"] == MAILVORA}
        raw = {n["table"]: n for n in notes if n["schema"] == MAILVORA_RAW}
        self.assertEqual(set(clean), MAILVORA_TABLES)
        self.assertEqual(set(raw), MAILVORA_RAW_TABLES)
        self.assertFalse([n for n in notes if n["schema"] == MAILVORA_EDGE], "an edge schema has no table notes")
        for schema, by in ((MAILVORA, clean), (MAILVORA_RAW, raw)):
            for table, n in by.items():
                self.assertEqual(n["from_level"], 4, f"{schema}.{table}")
                self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM {schema}.{table}")[0], f"{schema}.{table}")
                for f in n["foreign_keys"]:
                    self.assertIn(f["ref_table"], MAILVORA_TABLES, f"{schema}.{table}: {f}")
                    self.assertEqual(f["cardinality"], "1:N")
        for table, n in raw.items():
            self.assertTrue(n["grain"].startswith(RAW_WARNING), table)
        self.assertIn("allowed_values", clean["channels"])

    def test_mailvora_truth_file_and_no_truth_in_the_database(self):
        # OD-GEN-01, E-091: each finding's values and each quirk's counts go to data/truth/mailvora.json, never into the database.
        truth = json.loads((self.dir / "truth" / "mailvora.json").read_text(encoding="utf-8"))
        self.assertEqual((truth["company"], truth["seed"]), ("mailvora", 3303))
        for i in range(1, 16):
            self.assertIs(truth["findings"][f"FIND-03-{i:02d}"]["pass"], True, f"FIND-03-{i:02d}")
        self.assertEqual(set(truth["planted"]["raw"]), {f"Q-03-0{i}" for i in range(1, 8)})
        schemas = {r[0] for r in self.con.execute("SELECT schema_name FROM information_schema.schemata").fetchall()}
        self.assertFalse({s for s in schemas if "truth" in s}, "no truth schema")
        checkpoints = json.loads((self.dir / "truth" / "checkpoints.json").read_text(encoding="utf-8"))
        self.assertTrue({MAILVORA, MAILVORA_RAW, MAILVORA_EDGE} <= set(checkpoints["schemas"]), "S6-13: Mailvora cases are available")

    def test_the_build_stays_under_five_minutes(self):
        self.assertLess(self.build_seconds, BUILD_LIMIT_SECONDS)

    # ---- S6-20: mailvora_edge_case holds each of its five plants (one assertion each) ----

    def test_mailvora_edge_a_channel_with_spend_and_no_clicks(self):
        s = MAILVORA_EDGE
        found = self.one(f"""SELECT count(*) FROM (SELECT c.channel_id FROM {s}.ad_spend_daily a JOIN {s}.campaigns c USING (campaign_id)
                             GROUP BY 1 HAVING sum(a.spend) > 0 AND sum(a.clicks) = 0)""")[0]
        self.assertGreater(found, 0, "a channel whose CPC divides by zero clicks")
        clickless = self.one(f"""SELECT count(*) FROM {s}.sessions x JOIN {s}.campaigns c USING (utm_campaign)
                                 WHERE NOT EXISTS (SELECT 1 FROM {s}.ad_spend_daily a WHERE a.campaign_id = c.campaign_id
                                                   AND a.spend_date = CAST(x.session_start AS DATE) AND a.clicks > 0)""")[0]
        self.assertEqual(clickless, 0, "no session comes from a campaign on a day it had no clicks")

    def test_mailvora_edge_a_campaign_with_budget_and_no_spend(self):
        s = MAILVORA_EDGE
        found = self.one(f"""SELECT count(*) FROM {s}.campaigns c
            WHERE NOT EXISTS (SELECT 1 FROM {s}.ad_spend_daily a WHERE a.campaign_id = c.campaign_id)
              AND EXISTS (SELECT 1 FROM {s}.budget_monthly b WHERE b.channel_id = c.channel_id AND b.budget_eur > 0
                          AND NOT EXISTS (SELECT 1 FROM {s}.ad_spend_daily a JOIN {s}.campaigns k USING (campaign_id)
                                          WHERE k.channel_id = b.channel_id AND date_trunc('month', a.spend_date) = b.month))""")[0]
        self.assertGreater(found, 0, "a campaign that never spent, in a channel with a budget and no spend that month")

    def test_mailvora_edge_a_signup_with_no_session(self):
        s = MAILVORA_EDGE
        found = self.one(f"SELECT count(*) FROM {s}.signups u WHERE NOT EXISTS (SELECT 1 FROM {s}.sessions x WHERE x.visitor_id = u.visitor_id)")[0]
        self.assertGreater(found, 0, "a signup that attribution cannot credit")

    def test_mailvora_edge_a_user_with_two_first_touch_candidates_at_the_same_time(self):
        s = MAILVORA_EDGE
        found = self.one(f"""WITH t AS (SELECT u.user_id, x.session_start, x.utm_campaign, x.utm_medium,
                                         min(x.session_start) OVER (PARTITION BY u.user_id) AS first
                                  FROM {s}.signups u JOIN {s}.sessions x ON x.visitor_id = u.visitor_id AND x.session_start <= u.signup_ts)
            SELECT count(*) FROM (SELECT user_id FROM t WHERE session_start = first GROUP BY 1
                                  HAVING count(*) = 2 AND count(DISTINCT coalesce(utm_campaign, utm_medium, '')) = 2)""")[0]
        self.assertGreater(found, 0, "two sessions from two channels start at the user's first instant")

    def test_mailvora_edge_a_refunded_payment(self):
        s = MAILVORA_EDGE
        self.assertGreater(self.one(f"SELECT count(*) FROM {s}.payments WHERE refunded")[0], 0)
        self.assertGreater(self.one(f"SELECT count(*) FROM {s}.payments WHERE NOT refunded")[0], 0)

    def test_mailvora_edge_description(self):
        root = pathlib.Path(build_course_db.ROOT)
        desc = json.loads((root / "content" / "sql" / "edge" / f"{MAILVORA_EDGE}.json").read_text(encoding="utf-8"))
        self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (MAILVORA_EDGE, MAILVORA, "case"))
        tables, _ = self.names(MAILVORA_EDGE)
        self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables, sorted(set(desc["tables"]) - tables))
        listed = [line for lines in desc["tables"].values() for line in lines]
        self.assertEqual(set(desc["contains"]) - set(listed), set(), "every contains line sits under a table")
        self.assertEqual(set(listed) - set(desc["contains"]), set(), "every table line is a contains line")
        for table, lines in desc["tables"].items():
            self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{table}: lines once each, in their order")
        text = json.dumps(desc, ensure_ascii=False)
        self.assertNotIn("—", text, "no em dash")
        self.assertNotIn("NULL", text, "missing, not NULL")
        self.assertGreaterEqual(len(desc["contains"]), 5, "S6-20's five plants")


class CheckpointTruth(unittest.TestCase):
    """Task C7, S4B-02: each case's CP2 and CP4 truth queries run on the visible schema at build time, and only their values are
    written (design §7). A case key is {case_id, truths: {CP2?, CP4?}, choices: {CP1?, CP5?}}."""

    QUERY = "SELECT ROUND(AVG(discount_pct), 2) FROM promotions WHERE discount_pct IS NOT NULL"
    COUNT = "WITH p AS (SELECT promo_id FROM promotions WHERE discount_pct IS NOT NULL) SELECT count(*) FROM p"

    def key(self, keys_dir, case_id="CASE-FAKE-L1", query=QUERY, truths=None, **extra):
        keys_dir.mkdir(parents=True, exist_ok=True)
        key = {"case_id": case_id, "truths": {"CP4": query} if truths is None else truths, "choices": {}, **extra}
        (keys_dir / f"{case_id}.json").write_text(json.dumps(key), encoding="utf-8")

    def build(self, root, keys_dir, name="a", case_dirs=None):
        out = root / name
        build_course_db.build(out / "course.duckdb", data_dir=out, keys_dir=keys_dir, case_dirs=case_dirs)
        truth = json.loads((out / "truth" / "checkpoints.json").read_text(encoding="utf-8"))
        return out, truth

    def test_the_value_is_written_under_checkpoints_and_two_builds_agree(self):
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.key(root / "keys")
        out, truth = self.build(root, root / "keys")
        con = duckdb.connect(str(out / "course.duckdb"), read_only=True, config=NO_NETWORK)
        con.execute("SET TimeZone = 'UTC'")
        expected = float(con.execute("SELECT ROUND(AVG(discount_pct), 2) FROM voltmarkt.promotions WHERE discount_pct IS NOT NULL").fetchone()[0])
        con.close()
        self.assertEqual(truth["checkpoints"], {"CASE-FAKE-L1:CP4": expected})
        self.assertIsInstance(truth["checkpoints"]["CASE-FAKE-L1:CP4"], float)
        _, again = self.build(root, root / "keys", "b")
        self.assertEqual(again["checkpoints"], truth["checkpoints"], "same seed and query, same value")
        for path in out.rglob("*.json"):
            self.assertNotIn("discount_pct IS NOT NULL", path.read_text(encoding="utf-8"), f"{path.name} holds no truth query")

    def test_no_keys_means_no_checkpoints(self):
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        _, truth = self.build(root, root / "no-keys")
        self.assertEqual(truth["checkpoints"], {})

    def test_a_query_that_is_not_one_number_fails_the_build_without_printing_it(self):
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.key(root / "keys", query="SELECT promo_id FROM promotions")
        with self.assertRaises(ValueError) as caught:
            self.build(root, root / "keys")
        self.assertIn("CASE-FAKE-L1:CP4", str(caught.exception))
        self.assertNotIn("promo_id", str(caught.exception))

    def test_two_truths_per_case_are_written_as_case_id_cp2_and_cp4(self):
        """S4B-02: a case with CP2 and CP4 gets both values, CP2 first, beside a case that has only a CP4."""
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.key(root / "keys", "CASE-FAKE-02", truths={"CP4": self.QUERY, "CP2": self.COUNT})
        self.key(root / "keys", "CASE-FAKE-01")
        out, truth = self.build(root, root / "keys")
        con = duckdb.connect(str(out / "course.duckdb"), read_only=True, config=NO_NETWORK)
        con.execute("SET TimeZone = 'UTC'")
        con.execute("SET search_path = 'voltmarkt'")
        average = float(con.execute(self.QUERY).fetchone()[0])
        count = float(con.execute(self.COUNT).fetchone()[0])
        con.close()
        self.assertEqual(list(truth["checkpoints"].items()),
                         [("CASE-FAKE-01:CP4", average), ("CASE-FAKE-02:CP2", count), ("CASE-FAKE-02:CP4", average)])
        for path in out.rglob("*.json"):
            self.assertNotIn("discount_pct IS NOT NULL", path.read_text(encoding="utf-8"), f"{path.name} holds no truth query")

    def test_a_key_without_truths_or_with_another_checkpoints_truth_fails_the_build_naming_the_case_only(self):
        """The old key shape, a key without truths, and a truth for a checkpoint other than CP2 or CP4 each stop the build."""
        for name, extra in [("old shape", {"truths": None}), ("CP3", {"truths": {"CP3": self.QUERY}})]:
            with self.subTest(name):
                root = pathlib.Path(tempfile.mkdtemp())
                self.addCleanup(shutil.rmtree, root, ignore_errors=True)
                (root / "keys").mkdir(parents=True)
                key = {"case_id": "CASE-FAKE-03", "choices": {}}
                if extra["truths"] is None:
                    key.update({"checkpoint_id": "CP4", "truth_query": self.QUERY})
                else:
                    key["truths"] = extra["truths"]
                (root / "keys" / "CASE-FAKE-03.json").write_text(json.dumps(key), encoding="utf-8")
                con = duckdb.connect(config=NO_NETWORK)
                con.execute("SET TimeZone = 'UTC'")
                self.addCleanup(con.close)
                with self.assertRaises(ValueError) as caught:
                    build_course_db.checkpoint_truth(con, root / "keys")
                self.assertIn("CASE-FAKE-03", str(caught.exception))
                self.assertNotIn("discount_pct", str(caught.exception))

    def test_the_source_hash_is_the_schema_and_the_query(self):
        """C41 compares it with the key it reads now: a key or a case schema changed since the build makes the truth stale.
        tests/server/content-checkpoints.test.ts pins the same value for truthSourceHash."""
        self.assertEqual(build_course_db.truth_source("voltmarkt", "SELECT 1"), "091a04a12e9ae508")
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.key(root / "keys")
        _, truth = self.build(root, root / "keys")
        self.assertEqual(truth["sources"], {"CASE-FAKE-L1:CP4": build_course_db.truth_source("voltmarkt", self.QUERY)})

    def case(self, cases_dir, case_id, schema=None):
        cases_dir.mkdir(parents=True, exist_ok=True)
        record = {"case_id": case_id, "checkpoints": []}
        if schema is not None:
            record["schema"] = schema
        (cases_dir / f"{case_id}.json").write_text(json.dumps(record), encoding="utf-8")

    def scratch(self):
        """A database with the same table in voltmarkt and in mailvora, holding other rows."""
        con = duckdb.connect(config=NO_NETWORK)
        con.execute("SET TimeZone = 'UTC'")
        self.addCleanup(con.close)
        for schema, rows in (("voltmarkt", 3), ("mailvora", 5)):
            con.execute(f"CREATE SCHEMA {schema}")
            con.execute(f"CREATE TABLE {schema}.contacts AS SELECT range AS contact_id FROM range({rows})")
        return con

    def test_each_case_truth_runs_on_its_own_schema(self):
        """S6-13: a Mailvora case's truth runs on mailvora; a case that names no schema, or has no record, runs on voltmarkt."""
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        count = "SELECT count(*) FROM contacts"
        self.key(root / "keys", "CASE-MKT-09", query=count)
        self.key(root / "keys", "CASE-VOLT-L9", query=count)
        self.key(root / "keys", "CASE-NO-RECORD", query=count)
        self.case(root / "cases", "CASE-MKT-09", "mailvora")
        self.case(root / "cases", "CASE-VOLT-L9")
        got = build_course_db.checkpoint_truth(self.scratch(), root / "keys", [root / "cases"])
        self.assertEqual(got["checkpoints"], {"CASE-MKT-09:CP4": 5.0, "CASE-NO-RECORD:CP4": 3.0, "CASE-VOLT-L9:CP4": 3.0})
        self.assertEqual(got["sources"]["CASE-MKT-09:CP4"], build_course_db.truth_source("mailvora", count))
        self.assertEqual(got["sources"]["CASE-VOLT-L9:CP4"], build_course_db.truth_source("voltmarkt", count))

    def test_a_case_on_a_schema_the_database_lacks_gets_no_value_and_does_not_stop_the_build(self):
        """S6-13: the case is unavailable until its dataset is prepared, so the build skips its truths."""
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.key(root / "keys", "CASE-REAL-09", query="SELECT count(*) FROM invoices")
        self.case(root / "cases", "CASE-REAL-09", "online_retail_ii")
        got = build_course_db.checkpoint_truth(self.scratch(), root / "keys", [root / "cases"])
        self.assertEqual(got, {"checkpoints": {}, "sources": {}})

    def test_a_truth_query_that_is_not_one_select_fails_the_build_and_never_runs(self):
        """B2-M4: the query is parsed, not judged by its first word. Two statements or a WITH ... INSERT stop the build, naming the
        case only, before anything runs."""
        for name, query in (("two statements", "SELECT count(*) FROM contacts; DROP TABLE contacts"),
                            ("an insert", "WITH c AS (SELECT 9 AS contact_id) INSERT INTO contacts SELECT contact_id FROM c")):
            with self.subTest(name):
                root = pathlib.Path(tempfile.mkdtemp())
                self.addCleanup(shutil.rmtree, root, ignore_errors=True)
                self.key(root / "keys", "CASE-FAKE-04", query=query)
                con = self.scratch()
                with self.assertRaises(ValueError) as caught:
                    build_course_db.checkpoint_truth(con, root / "keys", [root / "cases"])
                self.assertIn("CASE-FAKE-04:CP4", str(caught.exception))
                self.assertIn("one SELECT", str(caught.exception))
                self.assertNotIn("contacts", str(caught.exception))
                self.assertEqual(con.execute("SELECT count(*) FROM voltmarkt.contacts").fetchone()[0], 3, "nothing ran")

    # Sprint 6 minors (backlog "Case build and inbox details"): the truth run is wrapped. A string only the failing query holds,
    # as a column name, so DuckDB's own bind error quotes it.
    MARKER = "k5_planted_marker_col"

    def test_a_truth_query_that_fails_to_bind_names_the_checkpoint_and_the_error_class_only(self):
        """The error names the checkpoint and the error's class; neither its message nor the traceback a console would print holds
        any part of the query, and it carries no chained DuckDB error that quotes it."""
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        query = f"SELECT count(*) FROM contacts WHERE {self.MARKER} > 0"
        con = self.scratch()
        con.execute("SET search_path = 'voltmarkt'")      # where checkpoint_truth runs a case that names no schema
        with self.assertRaises(duckdb.Error) as engine:
            con.execute(query)
        con.execute("SET search_path = 'main'")
        self.assertIn(self.MARKER, str(engine.exception), "DuckDB's own message quotes the query, so the plant can show a leak")
        self.key(root / "keys", "CASE-FAKE-05", truths={"CP2": query})
        with self.assertRaises(ValueError) as caught:
            build_course_db.checkpoint_truth(con, root / "keys", [root / "cases"])
        self.assertIn("CASE-FAKE-05:CP2", str(caught.exception))
        self.assertIn(type(engine.exception).__name__, str(caught.exception), "the error's class")
        self.assertIsNone(caught.exception.__cause__)
        self.assertIsNone(caught.exception.__context__, "no chained DuckDB error that quotes the query")
        self.assertNotIn(self.MARKER, "".join(traceback.format_exception(caught.exception)))

    def test_a_build_whose_truth_query_fails_prints_no_part_of_it(self):
        """The launcher's console sees the build's own output: a separate interpreter runs the build on a key whose CP2 fails to bind."""
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.key(root / "keys", "CASE-FAKE-05", truths={"CP2": f"SELECT count(*) FROM promotions WHERE {self.MARKER} > 0", "CP4": self.QUERY})
        code = ("import pathlib, sys; sys.path.insert(0, sys.argv[1]); import build_course_db; out = pathlib.Path(sys.argv[2]); "
                "build_course_db.build(out / 'course.duckdb', data_dir=out, keys_dir=pathlib.Path(sys.argv[3]))")
        done = subprocess.run([sys.executable, "-I", "-c", code, str(PIPELINE), str(root / "out"), str(root / "keys")],
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
        output = done.stdout + done.stderr
        self.assertNotEqual(done.returncode, 0, "the build stops")
        self.assertIn("CASE-FAKE-05:CP2", output)
        self.assertIn("BinderException", output)
        self.assertNotIn(self.MARKER, output)

    def test_the_real_openers_each_get_a_value(self):
        """Every CP2 and CP4 of the real cases, the openers and content/sql/cases/ alike, gets its value when the build holds the
        case's schema, and nothing else does: a case on a real dataset this build did not prepare gets none (S6-13, unavailable)."""
        content = build_course_db.ROOT / "content"
        wanted, schema_of = {}, {}
        for folder in ("openers", "cases"):
            for path in sorted((content / "sql" / folder).glob("*.json")):
                record = json.loads(path.read_text(encoding="utf-8"))
                for cp in record["checkpoints"]:
                    if cp["kind"] in ("CP2", "CP4"):
                        wanted[cp["truth_key"]] = cp
                        schema_of[cp["truth_key"]] = record.get("schema", "voltmarkt")
        self.assertTrue(wanted, "the openers have a CP4")
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        _, truth = self.build(root, content / "keys" / "cases")
        built = set(truth["schemas"])
        self.assertIn("voltmarkt", built)
        self.assertEqual(set(truth["checkpoints"]), {k for k in wanted if schema_of[k] in built})
        for key, value in truth["checkpoints"].items():
            self.assertIsInstance(value, float, key)
            self.assertEqual(value, round(value, wanted[key]["typed"]["decimals"]), f"{key} is held at the decimals its prompt asks")


class AllowedValues(unittest.TestCase):
    """E-019's rule on a small table: text columns with 1 to 12 distinct non-missing values, sorted."""

    def test_rule(self):
        con = duckdb.connect(config=NO_NETWORK)
        con.execute("SET TimeZone = 'UTC'")
        con.execute("CREATE SCHEMA s")
        con.execute("""CREATE TABLE s.t AS SELECT i AS id, CAST(i AS VARCHAR) AS many,
                       CASE WHEN i % 3 = 0 THEN NULL WHEN i % 3 = 1 THEN 'b' ELSE 'a' END AS few,
                       CAST(NULL AS VARCHAR) AS empty, 'x' || (i % 12) AS twelve, i % 2 AS number
                       FROM range(1, 40) r(i)""")
        values = vm_notes.allowed_values(con, "s", "t")
        con.close()
        self.assertEqual(values["few"], ["a", "b"], "missing values are not listed")
        self.assertEqual(len(values["twelve"]), 12)
        self.assertEqual(set(values), {"few", "twelve"}, "13 or more values, all missing, or not text: not listed")


if __name__ == "__main__":
    unittest.main()

import json
import pathlib
import re
import shutil
import sys
import tempfile
import unittest
from unittest import mock

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import build_course_db  # noqa: E402
from voltmarkt import notes as vm_notes  # noqa: E402

LEVEL1_TABLES = {"calendar", "stores", "categories", "products", "promotions"}
ORDER_TABLES = {"price_history", "promotion_products", "orders", "order_lines"}
VOLTMARKT_TABLES = LEVEL1_TABLES | ORDER_TABLES
VIEWS = {"sales"}
LEVEL1_EDGE_SCHEMAS = ["voltmarkt_edge_basics", "voltmarkt_edge_filter", "voltmarkt_edge_sort", "voltmarkt_edge_null"]
LEVEL2_EDGE_SCHEMAS = ["voltmarkt_edge_agg", "voltmarkt_edge_case", "voltmarkt_edge_type"]
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

        with mock.patch("duckdb.connect", spy):
            cls.manifest = build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir)
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
        self.assertEqual(self.names("voltmarkt"), (VOLTMARKT_TABLES, VIEWS))
        for s in LEVEL1_EDGE_SCHEMAS:
            self.assertEqual(self.names(s), (LEVEL1_TABLES, set()), s)
            for t in LEVEL1_TABLES:
                self.assertEqual(self.columns(s, t), self.columns("voltmarkt", t), f"{s}.{t} mirrors voltmarkt.{t}")
                rows = self.one(f"SELECT count(*) FROM {s}.{t}")[0]
                self.assertTrue(4 <= rows <= 8, f"{s}.{t} has {rows} rows, not 4-8")
        for s in LEVEL2_EDGE_SCHEMAS:
            self.assertEqual(self.names(s), (VOLTMARKT_TABLES, VIEWS), f"{s} has the same table and view names as voltmarkt")
            for t in VOLTMARKT_TABLES | VIEWS:
                self.assertEqual(self.columns(s, t), self.columns("voltmarkt", t), f"{s}.{t} mirrors voltmarkt.{t}")
                rows = self.one(f"SELECT count(*) FROM {s}.{t}")[0]
                self.assertTrue(1 <= rows <= 40, f"{s}.{t} has {rows} rows, not 1-40")

    def test_nothing_in_schema_main(self):
        # Design §10 and ruling R23: an object in main could be read from every dataset.
        self.assertEqual(self.one("SELECT count(*) FROM duckdb_tables() WHERE schema_name = 'main' AND NOT internal")[0], 0)
        self.assertEqual(self.one("SELECT count(*) FROM duckdb_views() WHERE schema_name = 'main' AND NOT internal")[0], 0)

    def test_sales_view_at_order_line_grain(self):
        for s in ["voltmarkt", *LEVEL2_EDGE_SCHEMAS]:
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

    def test_view_bodies_hold_no_data_literals_and_read_their_own_schema(self):
        views = self.con.execute("SELECT schema_name, view_name, sql FROM duckdb_views() WHERE NOT internal").fetchall()
        self.assertEqual(len(views), 1 + len(LEVEL2_EDGE_SCHEMAS))
        for schema, name, sql in views:
            tokens = duckdb.tokenize(sql)
            for k, (start, kind) in enumerate(tokens):
                end = tokens[k + 1][0] if k + 1 < len(tokens) else len(sql)
                text = sql[start:end].strip()
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
        # R37: the order build only adds objects; every table a level 1 key reads keeps its rows.
        for name, sha in LEVEL1_SHA256.items():
            self.assertEqual(self.manifest["tables"][name]["sha256"], sha, name)

    def test_manifest(self):
        m = self.manifest
        self.assertEqual(m["duckdb_version"], duckdb.__version__)
        self.assertEqual(m["library_version"], f"v{duckdb.__version__}", "pragma_version(), as the Node runner reports it")
        self.assertEqual(m["tables"]["voltmarkt.products"]["rows"], 1200)
        self.assertEqual(m["tables"]["voltmarkt.sales"]["rows"], m["tables"]["voltmarkt.order_lines"]["rows"])
        for s in ["voltmarkt", *LEVEL1_EDGE_SCHEMAS, *LEVEL2_EDGE_SCHEMAS]:
            tables, views = self.names(s)
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

    def test_notes_truth_and_descriptions(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        visible = [n for n in notes if n["schema"] == "voltmarkt"]
        self.assertEqual({n["table"] for n in visible}, LEVEL1_TABLES | VIEWS)
        sales = {n["schema"]: n for n in notes if n["table"] == "sales"}
        self.assertEqual(set(sales), {"voltmarkt", *LEVEL2_EDGE_SCHEMAS}, "the view and every edge copy have notes")
        for s, n in sales.items():
            self.assertEqual(n["grain"], "one row per order line")
            self.assertEqual(n["primary_key"], ["order_line_id"])
            self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM {s}.sales")[0])
            self.assertEqual(n["sample"]["columns"], [c for c, _ in SALES_COLUMNS])
            self.assertEqual(len(n["sample"]["rows"]), 5)
        truth = json.loads((self.dir / "truth" / "voltmarkt.json").read_text(encoding="utf-8"))
        self.assertEqual(truth["seed"], 1101)
        self.assertIn("FIND-01-04", truth["findings"])
        root = pathlib.Path(build_course_db.ROOT)
        for sql in (root / "pipeline" / "edge").glob("*.sql"):
            path = root / "content" / "sql" / "edge" / f"{sql.stem}.json"
            self.assertTrue(path.exists(), sql.stem)
            desc = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual((desc["schema"], desc["mirrors"]), (sql.stem, "voltmarkt"))
            self.assertTrue(desc["contains"], sql.stem)
        families = {json.loads((root / "content" / "sql" / "edge" / f"{s}.json").read_text(encoding="utf-8"))["family"]
                    for s in LEVEL2_EDGE_SCHEMAS}
        self.assertEqual(families, {"agg", "case", "type"})

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
            if n["schema"] != "voltmarkt":
                self.assertNotIn("allowed_values", n, f"{n['schema']}: never from the edge schemas")

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


class CheckpointTruth(unittest.TestCase):
    """Task C7: each CP4 truth query runs on the visible schema at build time, and only its value is written (design §7)."""

    QUERY = "SELECT ROUND(AVG(discount_pct), 2) FROM promotions WHERE discount_pct IS NOT NULL"

    def key(self, keys_dir, case_id="CASE-FAKE-L1", query=QUERY):
        keys_dir.mkdir(parents=True, exist_ok=True)
        (keys_dir / f"{case_id}.json").write_text(
            json.dumps({"case_id": case_id, "checkpoint_id": "CP4", "truth_query": query}), encoding="utf-8")

    def build(self, root, keys_dir, name="a"):
        out = root / name
        build_course_db.build(out / "course.duckdb", data_dir=out, keys_dir=keys_dir)
        truth = json.loads((out / "truth" / "voltmarkt.json").read_text(encoding="utf-8"))
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
        self.assertIn("CASE-FAKE-L1", str(caught.exception))
        self.assertNotIn("promo_id", str(caught.exception))

    def test_the_real_openers_each_get_a_value(self):
        content = build_course_db.ROOT / "content"
        wanted = {}
        for path in sorted((content / "sql" / "openers").glob("*.json")):
            record = json.loads(path.read_text(encoding="utf-8"))
            for cp in record["checkpoints"]:
                if cp["kind"] == "CP4":
                    wanted[cp["truth_key"]] = cp
        self.assertTrue(wanted, "the openers have a CP4")
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        _, truth = self.build(root, content / "keys" / "cases")
        self.assertEqual(set(truth["checkpoints"]), set(wanted))
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

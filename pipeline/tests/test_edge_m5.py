"""Sprint 6 block K, Task K5: backlog M5 (rulings D90, S6-36, R37). The edge schemas gain the tables their schema panel shows and
every day of their own promotions, voltmarkt_edge_subq's orders spread over the year, and M5 only adds rows.

- Every table C52 found missing is in its edge schema, and each view an edge schema holds is the build's own view over that
  schema's own tables: the level 1 edge schemas' sales view reads empty copies of orders and order_lines (S6-36).
- Every table the schema panel shows an active write or fix item at its level is in the item's edge schema (C52's rule).
- Each edge calendar holds every day of each of its own promotions, each day once, as the visible calendar has it.
- The part of each edge file before its M5 block rebuilds each table as it was (the locked hashes of
  manifest_before_sprint6.json for the older ones), and every row of it is still in the built table.
- voltmarkt_edge_subq's orders fall in at least three months, and the three items S6-36 names return rows on it with their
  reference.

The objects M5 may move in manifest_before_sprint6.json are listed in pipeline/tests/test_build.py (M5_MOVES), which holds every
other object to its hash. Assertions name item IDs, schemas, tables and counts only: a reference runs here, and nothing of its
text or its rows is printed.
"""
import collections
import json
import pathlib
import re
import shutil
import tempfile
import unittest

import duckdb

from course_build import build_course_db   # L50: the paths, and Mailvora generated once per process (S7-30)

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(build_course_db.ROOT)
EDGE_DIR = ROOT / "pipeline" / "edge"
RAW = build_course_db.RAW_SCHEMA
BEFORE_SPRINT6 = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint6.json").read_text(encoding="utf-8"))["tables"]
# C52's warnings on a4e3b11 (the K5 brief): the tables each edge schema lacked that the schema panel shows its items.
C52_MISSING = {
    "voltmarkt_edge_basics": {"sales"}, "voltmarkt_edge_filter": {"sales"}, "voltmarkt_edge_null": {"sales"}, "voltmarkt_edge_sort": {"sales"},
    "voltmarkt_edge_date": {"ab_assignments", "ab_conversions"}, "voltmarkt_edge_set": {"ab_assignments", "ab_conversions"},
}
# The edge files M5 changed: every edge schema with a promotion whose days its calendar lacked (the ten older ones, subq and
# clean). Each holds one block that starts with M5_MARKER, after every statement it had before M5.
M5_CHANGED = {f"voltmarkt_edge_{f}" for f in ("agg", "basics", "case", "date", "filter", "join", "null", "set", "sort", "type", "subq", "clean")}
# The description line M5 gives each calendar it filled (K5 review I1: the line itself, not only a calendar entry).
M5_CALENDAR_LINE = "a calendar that holds every day of each promotion"
M5_MARKER = "-- M5 (D90, S6-36)"
SUBQ = "voltmarkt_edge_subq"
# S6-36: the items whose reference returned no row on voltmarkt_edge_subq while its orders all fell in May 2025.
SUBQ_ITEMS = ("EX-SQL-SUBQ-01-E2-03", "EX-SQL-SUBQ-01-E3-03", "EX-SQL-SUBQ-02-E2-02")
CHOICE_KINDS = {"predict_rows", "predict_result", "choose_query", "which_table", "is_unique"}   # schemas/item.ts, SQL_CHOICE_KINDS
# C52's count: the promotions whose days counted through the calendar are not their length (a missing end date counts none).
SHORT_PROMOTIONS = """SELECT count(*) FROM {s}.promotions p
    WHERE (SELECT count(*) FROM {s}.calendar c WHERE c.cal_date BETWEEN p.start_date AND p.end_date) <> date_diff('day', p.start_date, p.end_date) + 1"""


def written_schema(query):
    """The schema a statement of an M5 block writes into: the one in front of the table after INSERT INTO or CREATE TABLE (comments left out)."""
    code = re.sub(r"--[^\n]*", "", query)
    m = re.search(r"\b(?:INSERT\s+INTO|CREATE\s+TABLE)\s+(\w+)\.\w+", code, re.IGNORECASE)
    return m.group(1) if m else None


class WrittenSchema(unittest.TestCase):
    def test_the_schema_a_statement_writes_into(self):
        self.assertEqual(written_schema("INSERT INTO voltmarkt_edge_agg.calendar SELECT c.* FROM voltmarkt.calendar AS c"), "voltmarkt_edge_agg")
        self.assertEqual(written_schema("-- INSERT INTO voltmarkt.calendar\nINSERT INTO voltmarkt_edge_set.orders VALUES (1)"), "voltmarkt_edge_set")
        self.assertEqual(written_schema("create table voltmarkt_edge_date.ab_assignments AS SELECT * FROM voltmarkt.ab_assignments LIMIT 0"), "voltmarkt_edge_date")
        self.assertEqual(written_schema("INSERT INTO voltmarkt.calendar SELECT * FROM voltmarkt_edge_agg.calendar"), "voltmarkt", "an insert into another schema is seen as one")
        self.assertIsNone(written_schema("INSERT INTO calendar VALUES (1)"))


class EdgeM5(unittest.TestCase):
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

    def names(self, schema):
        tables = {r[0] for r in self.con.execute(
            "SELECT table_name FROM duckdb_tables() WHERE schema_name = ? AND NOT internal", [schema]).fetchall()}
        views = {r[0] for r in self.con.execute(
            "SELECT view_name FROM duckdb_views() WHERE schema_name = ? AND NOT internal", [schema]).fetchall()}
        return tables, views

    def edges(self):
        return [r[0] for r in self.con.execute("SELECT schema_name FROM information_schema.schemata "
                                               "WHERE starts_with(schema_name, 'voltmarkt_edge_') ORDER BY 1").fetchall()]

    def test_the_tables_c52_found_missing_are_there(self):
        for s, wanted in C52_MISSING.items():
            tables, views = self.names(s)
            with self.subTest(schema=s):
                self.assertEqual(sorted(wanted - tables - views), [], f"{s} lacks tables its schema panel shows")

    def test_every_edge_view_is_the_builds_own_view_over_the_edges_own_tables(self):
        own = dict(self.con.execute("SELECT view_name, sql FROM duckdb_views() WHERE schema_name = 'voltmarkt' AND NOT internal").fetchall())
        for s in self.edges():
            tables, views = self.names(s)
            for name in sorted(views):
                sql = self.one("SELECT sql FROM duckdb_views() WHERE schema_name = ? AND view_name = ?", [s, name])[0]
                with self.subTest(view=f"{s}.{name}"):
                    self.assertIn(name, own, "a view voltmarkt has")
                    self.assertEqual(sql, own[name].replace("voltmarkt.", f"{s}."), "the build's own view, on this schema")
                    read = {t for t in re.findall(rf"\b{s}\.(\w+)", sql)} - {name}
                    self.assertTrue(read and read <= tables, f"reads tables of {s} only: {sorted(read - tables)}")
                    self.assertEqual({q for q in re.findall(r"\b(voltmarkt\w*)\.\w+", sql)}, {s}, "reads no other schema")
        for s in C52_MISSING:
            for t in sorted(C52_MISSING[s] - {"sales"}) + (["orders", "order_lines", "sales"] if "sales" in C52_MISSING[s] else []):
                with self.subTest(empty=f"{s}.{t}"):
                    self.assertEqual(self.one(f"SELECT count(*) FROM {s}.{t}")[0], 0, "an empty copy: the edge schema holds no such rows")

    def test_every_table_the_schema_panel_shows_is_in_the_items_edge_schema(self):
        # C52's rule, on this build: the panel shows an item its schema's notes from its level (notesForLevel); choice items are never
        # graded on an edge schema.
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        shown = collections.defaultdict(lambda: collections.defaultdict(list))
        for path in sorted((ROOT / "content" / "sql" / "items").glob("*.json")):
            item = json.loads(path.read_text(encoding="utf-8"))
            if (item.get("status") != "active" or item.get("kind") in CHOICE_KINDS or not isinstance(item.get("edge_schema"), str)
                    or not isinstance(item.get("schema"), str)):
                continue
            level = item.get("level")
            for n in notes:
                if n["schema"] == item["schema"] and (not isinstance(level, (int, float)) or n.get("from_level", 1) <= level):
                    shown[item["edge_schema"]][n["table"]].append(item["id"])
        self.assertTrue(shown, "items with an edge schema")
        gaps = {}
        for edge, tables in sorted(shown.items()):
            have, views = self.names(edge)
            missing = sorted(set(tables) - have - views)
            if missing:
                gaps[edge] = {t: len(tables[t]) for t in missing}
        self.assertEqual(gaps, {}, "edge schemas that lack a table the panel shows (table: items)")

    def test_each_edge_calendar_holds_every_day_of_its_own_promotions(self):
        short = {s: n for s in self.edges() if (n := self.one(SHORT_PROMOTIONS.format(s=s))[0])}
        self.assertEqual(short, {}, "edge schemas with promotions whose days the calendar lacks (schema: promotions)")
        for s in self.edges():
            source = RAW if s in build_course_db.RAW_EDGE_SCHEMAS else "voltmarkt"
            rows, days = self.one(f"SELECT count(*), count(DISTINCT cal_date) FROM {s}.calendar")
            foreign = self.one(f"SELECT count(*) FROM (SELECT * FROM {s}.calendar EXCEPT SELECT * FROM {source}.calendar)")[0]
            with self.subTest(schema=s):
                self.assertEqual(rows, days, "one row per day")
                self.assertEqual(foreign, 0, f"each row is {source}'s row for that day")

    def test_m5_only_adds_rows(self):
        files = {p.stem: p.read_text(encoding="utf-8") for p in sorted(EDGE_DIR.glob("*.sql"))}
        self.assertEqual({s for s, text in files.items() if M5_MARKER in text}, M5_CHANGED, "the edge files with an M5 block")
        scratch = duckdb.connect(config=NO_NETWORK)
        scratch.execute("SET TimeZone = 'UTC'")
        self.addCleanup(scratch.close)
        # The schemas the edge files copy from: voltmarkt's tables (and voltmarkt_raw's), with the calendar rows the files select.
        scratch.execute(build_course_db.DDL.read_text(encoding="utf-8").replace("{schema}", "voltmarkt"))
        for schema in ("voltmarkt", RAW):
            rows = self.con.execute(f"SELECT * FROM {schema}.calendar").fetchall()
            scratch.executemany(f"INSERT INTO {schema}.calendar VALUES ({', '.join('?' * len(rows[0]))})", rows)
        for s in sorted(M5_CHANGED):
            text = files[s]
            with self.subTest(schema=s):
                self.assertEqual(text.count(M5_MARKER), 1, "one M5 block")
                before, block = text.split(M5_MARKER)
                kinds = [(st.type, st.query) for st in scratch.extract_statements(M5_MARKER + block)]
                self.assertTrue(kinds, "the block has statements")
                for kind, query in kinds:
                    adds = kind == duckdb.StatementType.INSERT or (
                        kind == duckdb.StatementType.CREATE and re.search(r"\bLIMIT\s+0\s*;?\s*$", query.strip(), re.IGNORECASE))
                    self.assertTrue(adds, f"{s}: M5's block only inserts rows or creates empty copies ({kind})")
                    # S7-30: and only into this file's own schema (an insert into voltmarkt or another edge schema would pass the check above).
                    target = written_schema(query)
                    self.assertIsNotNone(target, f"{s}: a statement of M5's block names no schema-qualified table")
                    self.assertEqual(target, s, f"{s}: M5's block writes into {target}")
                scratch.execute(before)
                tables = [r[0] for r in scratch.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ? ORDER BY 1", [s]).fetchall()]
                self.assertTrue(tables)
                for t in tables:
                    name = f"{s}.{t}"
                    if name in BEFORE_SPRINT6:
                        self.assertEqual(build_course_db.table_sha(scratch, name), BEFORE_SPRINT6[name]["sha256"],
                                         f"{name}: the file before its M5 block builds the locked table")
                    old = collections.Counter(scratch.execute(f"SELECT * FROM {name}").fetchall())
                    new = collections.Counter(self.con.execute(f"SELECT * FROM {name}").fetchall())
                    gone = old - new
                    self.assertEqual(sum(gone.values()), 0, f"{name}: rows from before M5 that are gone or changed")

    def test_subq_orders_spread_and_the_items_s6_36_names_return_rows(self):
        months = self.one(f"SELECT count(DISTINCT date_trunc('month', order_ts)) FROM {SUBQ}.orders")[0]
        self.assertGreaterEqual(months, 3, f"{SUBQ}'s orders fall in {months} months")
        counts = {}
        try:
            for item_id in SUBQ_ITEMS:
                item = json.loads((ROOT / "content" / "sql" / "items" / f"{item_id}.json").read_text(encoding="utf-8"))
                self.assertEqual(item["edge_schema"], SUBQ, item_id)
                reference = json.loads((ROOT / "content" / "keys" / "sql" / f"{item_id}.json").read_text(encoding="utf-8"))["reference_sql"]
                self.con.execute(f"SET search_path = '{SUBQ}'")
                try:
                    counts[item_id] = len(self.con.execute(reference).fetchall())
                except duckdb.Error as e:            # the class only: an engine message can quote the query
                    counts[item_id] = type(e).__name__
        finally:
            self.con.execute("SET search_path = 'main'")
        self.assertTrue(all(isinstance(n, int) and n >= 1 for n in counts.values()), f"rows each reference returns on {SUBQ}: {counts}")

    def test_edge_descriptions_name_what_m5_added(self):
        # A failed hidden run shows the description's lines about the tables the query read (S6-05), so each table M5 added has its
        # line, and every table a description lists is in its schema.
        for s in self.edges():
            desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{s}.json").read_text(encoding="utf-8"))
            tables, views = self.names(s)
            listed = desc.get("tables", {})
            with self.subTest(schema=s):
                self.assertEqual(sorted(set(listed) - tables - views), [], "tables the description lists that the schema lacks")
                self.assertEqual(sorted(set(C52_MISSING.get(s, set())) - set(listed)), [], "tables M5 added with no line")
                self.assertEqual([x for lines in listed.values() for x in lines if x not in desc["contains"]], [], "every table line is a contains line")
                text = json.dumps(desc, ensure_ascii=False)
                self.assertNotIn("—", text, "no em dash")
                if s in M5_CHANGED:
                    self.assertIn(M5_CALENDAR_LINE, listed.get("calendar", []), "the calendar M5 filled has its own line")


if __name__ == "__main__":
    unittest.main()

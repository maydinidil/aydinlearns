"""Builds data/course.duckdb (design §10): one file, one schema per dataset, TimeZone UTC."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import sys

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from voltmarkt import ab_test as ab  # noqa: E402
from voltmarkt import generate as vm  # noqa: E402
from voltmarkt import notes as vm_notes  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DDL = ROOT / "pipeline" / "voltmarkt" / "ddl.sql"
CASE_KEYS = ROOT / "content" / "keys" / "cases"
VOLTMARKT_TABLES = vm.LEVEL1_TABLES + vm.ORDER_TABLES + vm.LEVEL3_TABLES
# Ruling R17: DuckDB must never download an extension. TimeZone is SET after opening, because a
# TimeZone given at creation is rejected once autoloading is off.
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}


def table_sha(con, qualified: str) -> str:
    """sha256 of repr(rows) in ORDER BY ALL order, streamed: the same value as hashing the whole list at once."""
    cur = con.execute(f"SELECT * FROM {qualified} ORDER BY ALL")
    h = hashlib.sha256(b"[")
    first = True
    while batch := cur.fetchmany(50_000):
        for row in batch:
            h.update(repr(row).encode("utf-8") if first else b", " + repr(row).encode("utf-8"))
            first = False
    h.update(b"]")
    return h.hexdigest()


def view_statements(schema: str) -> list[str]:
    """The CREATE VIEW statements of ddl.sql, for a schema (comment lines dropped before splitting)."""
    text = "\n".join(line for line in DDL.read_text(encoding="utf-8").splitlines() if not line.lstrip().startswith("--"))
    return [s.strip().replace("{schema}", schema) for s in text.split(";") if s.strip().upper().startswith("CREATE VIEW")]


# S4B-31: one row per product and ISO week of competitor_prices. It is built here, not in ddl.sql, because the build
# applies ddl.sql's views to every edge schema with order_lines, and three of those have no competitor_prices. The ISO
# year and week come from the UTC timestamp (P-10), and no data literal is allowed in a view body.
COMPETITOR_WEEKLY_SQL = """CREATE VIEW {schema}.competitor_price_weekly AS
SELECT
    product_id,
    isoyear(observed_ts) AS iso_year,
    week(observed_ts) AS iso_week,
    avg(price_eur) AS avg_competitor_price_eur,
    count(DISTINCT competitor) AS competitors_seen
FROM {schema}.competitor_prices
GROUP BY product_id, isoyear(observed_ts), week(observed_ts)"""


# S4B-02: the checkpoints whose value the build computes, in the order the truth file lists them.
TRUTH_CHECKPOINTS = ("CP2", "CP4")


def checkpoint_truth(con, keys_dir: pathlib.Path) -> dict:
    """Task C7, S4B-02: each case key's CP2 and CP4 truth queries (server-only) run on the visible schema; only each one value
    is kept.

    A case key is {case_id, truths: {CP2?, CP4?}, choices: {CP1?, CP5?}}. Values are keyed "<case_id>:CP2" and
    "<case_id>:CP4", in key file name order, CP2 before CP4. A key without truths (the old shape included), a truth for any
    other checkpoint, or a query that does not return exactly one number fails the build, naming the case and never the
    query."""
    values = {}
    for path in sorted(pathlib.Path(keys_dir).glob("*.json")) if pathlib.Path(keys_dir).is_dir() else []:
        key = json.loads(path.read_text(encoding="utf-8"))
        case_id = key.get("case_id")
        truths = key.get("truths")
        if not isinstance(truths, dict):
            raise ValueError(f"The key of {case_id} needs truths: an object of its CP2 and CP4 truth queries.")
        other = sorted(set(truths) - set(TRUTH_CHECKPOINTS))
        if other:
            raise ValueError(f"The key of {case_id} has a truth for {', '.join(other)}; only CP2 and CP4 have one.")
        for checkpoint in TRUTH_CHECKPOINTS:
            if checkpoint not in truths:
                continue
            name = f"{case_id}:{checkpoint}"
            con.execute("SET search_path = 'voltmarkt'")
            rows = con.execute(truths[checkpoint]).fetchall()
            if len(rows) != 1 or len(rows[0]) != 1 or rows[0][0] is None or isinstance(rows[0][0], (str, bool)):
                raise ValueError(f"The truth query of {name} must return exactly one number.")
            values[name] = float(rows[0][0])
    return values


def build(out: pathlib.Path, data_dir: pathlib.Path | None = None, keys_dir: pathlib.Path | None = None) -> dict:
    out = pathlib.Path(out)
    data_dir = pathlib.Path(data_dir or out.parent)
    out.parent.mkdir(parents=True, exist_ok=True)
    (data_dir / "truth").mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".tmp.duckdb")
    for p in (tmp, pathlib.Path(str(tmp) + ".wal")):
        p.unlink(missing_ok=True)

    tables, truth = vm.generate()
    truth["findings"] = vm.validate(tables, truth)
    # Sprint 5a (Task B2, R37): the A/B test, after every existing table, from its own stream; it only reads the order data.
    clean = tables["clean"]
    ab_tables, truth["planted"]["ab_test"] = ab.generate(clean["orders"], clean["order_lines"])
    truth["findings"]["ab_test"] = ab.validate(ab_tables, clean["orders"], clean["order_lines"])

    con = duckdb.connect(str(tmp), config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    con.execute("SET enable_progress_bar = false")
    con.execute(DDL.read_text(encoding="utf-8").replace("{schema}", "voltmarkt"))
    for name in VOLTMARKT_TABLES:
        con.register("src", tables["clean"][name])
        con.execute(f"INSERT INTO voltmarkt.{name} SELECT * FROM src")
        con.unregister("src")
    for name in ab.TABLES:                 # after every existing table; the join edge file copies their columns
        con.register("src", ab_tables[name])
        con.execute(f"INSERT INTO voltmarkt.{name} SELECT * FROM src")
        con.unregister("src")
    for sql_file in sorted((ROOT / "pipeline" / "edge").glob("*.sql")):
        con.execute(sql_file.read_text(encoding="utf-8"))
    # Level 2 and 3 edge schemas mirror the order tables too, so they get the same views as voltmarkt.
    order_edges = [r[0] for r in con.execute(
        "SELECT DISTINCT schema_name FROM duckdb_tables() WHERE schema_name LIKE 'voltmarkt_edge_%' "
        "AND table_name = 'order_lines' ORDER BY 1").fetchall()]
    for schema in order_edges:
        for statement in view_statements(schema):
            con.execute(statement)

    # The weekly competitor view goes in voltmarkt and in each edge schema that holds competitor_prices.
    price_schemas = [r[0] for r in con.execute(
        "SELECT DISTINCT schema_name FROM duckdb_tables() WHERE schema_name LIKE 'voltmarkt%' "
        "AND table_name = 'competitor_prices' ORDER BY 1").fetchall()]
    for schema in price_schemas:
        con.execute(COMPETITOR_WEEKLY_SQL.replace("{schema}", schema))

    truth["checkpoints"] =checkpoint_truth(con, keys_dir if keys_dir is not None else CASE_KEYS)
    con.execute("SET search_path = 'main'")

    meta = {}
    schemas = [r[0] for r in con.execute(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'voltmarkt%' ORDER BY 1").fetchall()]
    for s in schemas:
        for t, kind in con.execute("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY 1", [s]).fetchall():
            q = f"{s}.{t}"
            rows = con.execute(f"SELECT count(*) FROM {q}").fetchone()[0]
            if kind == "VIEW":   # its rows follow from its tables, so the view's own text is what it adds
                sql = con.execute("SELECT sql FROM duckdb_views() WHERE schema_name = ? AND view_name = ?", [s, t]).fetchone()[0]
                meta[q] = {"rows": rows, "view_sql_sha256": hashlib.sha256(sql.encode("utf-8")).hexdigest()}
            else:
                meta[q] = {"rows": rows, "sha256": table_sha(con, q)}
    library_version, source_id = con.execute("SELECT library_version, source_id FROM pragma_version()").fetchone()
    notes = vm_notes.schema_notes(con, "voltmarkt") + [n for s in order_edges for n in vm_notes.view_notes(con, s)]
    notes += [vm_notes.note(con, s, "competitor_price_weekly", *vm_notes.WEEKLY_VIEW, visible=False)
              for s in price_schemas if s != "voltmarkt"]
    con.close()
    os.replace(tmp, out)

    manifest = {
        "dataset_version": hashlib.sha256(json.dumps(meta, sort_keys=True).encode()).hexdigest()[:16],
        "duckdb_version": duckdb.__version__,
        "library_version": library_version,
        "source_id": source_id,
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "file_sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        "tables": meta,
    }
    (data_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (data_dir / "schema-notes.json").write_text(json.dumps(notes, indent=2, ensure_ascii=False), encoding="utf-8")
    (data_dir / "truth" / "voltmarkt.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    m = build(ROOT / "data" / "course.duckdb")
    print(f"built data/course.duckdb, dataset {m['dataset_version']}, duckdb {m['duckdb_version']}")

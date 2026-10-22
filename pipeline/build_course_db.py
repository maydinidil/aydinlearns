"""Builds data/course.duckdb (design §10): one file, one schema per dataset, TimeZone UTC."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import sys
from dataclasses import dataclass

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from datasets import REAL_DIR  # noqa: E402
from datasets import notes as real_notes  # noqa: E402
from mailvora import generate as mv  # noqa: E402
from mailvora import notes as mv_notes  # noqa: E402
from mailvora import raw as mv_raw  # noqa: E402
from voltmarkt import ab_test as ab  # noqa: E402
from voltmarkt import generate as vm  # noqa: E402
from voltmarkt import notes as vm_notes  # noqa: E402
from voltmarkt import raw as vm_raw  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DDL = ROOT / "pipeline" / "voltmarkt" / "ddl.sql"
CASE_KEYS = ROOT / "content" / "keys" / "cases"
# S6-13: the case records, whose `schema` says where their truth queries run (absent means voltmarkt).
CASE_DIRS = (ROOT / "content" / "sql" / "openers", ROOT / "content" / "sql" / "cases", ROOT / "content" / "sql" / "mocks")
DEFAULT_CASE_SCHEMA = "voltmarkt"
# The schemas DuckDB holds in every database: never a dataset, so never listed as built.
SYSTEM_SCHEMAS = ("main", "information_schema", "pg_catalog")
VOLTMARKT_TABLES = vm.LEVEL1_TABLES + vm.ORDER_TABLES + vm.LEVEL3_TABLES
RAW_SCHEMA = "voltmarkt_raw"                             # sprint 6 (S6-02): ddl.sql's {schema}_raw
# Sprint 6 Part 2 (S6-20): Mailvora's clean schema and its raw schema (pipeline/mailvora/ddl.sql's {schema}_raw).
MAILVORA_DDL = ROOT / "pipeline" / "mailvora" / "ddl.sql"
MAILVORA_SCHEMA = "mailvora"
MAILVORA_RAW_SCHEMA = "mailvora_raw"
# The schemas the manifest covers, in this order: Voltmarkt's (its edge schemas included), then Mailvora's, then every other schema
# the build makes from its own rows (P38: the real datasets' edge schemas). A prepared real dataset goes in the manifest's `real`
# section instead, outside dataset_version (S6-23).
MANIFEST_PREFIXES = ("voltmarkt", "mailvora")
# Sprint 6 Part 2 (S6-21, S6-23): the dataset registry, and where the prep wrote each prepared dataset (data/real/<schema>/).
REGISTRY = ROOT / "content" / "datasets" / "registry.json"
# S6-04: an edge schema mirrors its company's clean schema unless named here. Each one here mirrors a raw schema, which has no
# view, so it gets none of the clean schema's views: voltmarkt_edge_clean mirrors voltmarkt_raw, and mailvora_edge_clean (sprint 7
# Part 2, Task G1, S7-15: the take-home on raw Mailvora data) mirrors mailvora_raw. Mailvora has no view, so for
# mailvora_edge_clean the entry only records what it mirrors.
RAW_EDGE_SCHEMAS = ("voltmarkt_edge_clean", "mailvora_edge_clean")
# Ruling R17: DuckDB must never download an extension. TimeZone is SET after opening, because a
# TimeZone given at creation is rejected once autoloading is off.
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}


def table_sha(con, qualified: str) -> str:
    """sha256 of repr(rows) in ORDER BY ALL order, streamed: the same value as hashing the whole list at once. A TIMESTAMPTZ
    column (Mailvora's) is read as its microseconds since 1970: Python reads a TIMESTAMPTZ value only with a time zone library
    this build does not have, and an instant needs no zone. A table without one reads every column as it is, as before."""
    schema, table = qualified.split(".")
    zoned = [c for (c,) in con.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? "
                                       "AND data_type = 'TIMESTAMP WITH TIME ZONE' ORDER BY ordinal_position", [schema, table]).fetchall()]
    columns = "*"
    if zoned:
        replaced = ", ".join(f'epoch_us("{c}") AS "{c}"' for c in zoned)
        columns = f"* REPLACE ({replaced})"
    cur = con.execute(f"SELECT {columns} FROM {qualified} ORDER BY ALL")
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


def view_base_tables(statement: str, schema: str) -> list[str]:
    """The objects of `schema` a CREATE VIEW statement reads, in order of first mention, the view it creates left out."""
    names = re.findall(rf"\b{re.escape(schema)}\.(\w+)", statement)
    return list(dict.fromkeys(n for n in names[1:] if n != names[0]))


def apply_view(con, schema: str, statement: str) -> None:
    """S6-36 (backlog M5): a view the build applies to voltmarkt is applied to an edge schema over the edge's own tables. A base
    table the edge schema lacks becomes an empty copy of voltmarkt's (LIMIT 0), so the view exists and holds the edge's rows: the
    level 1 edge schemas, which hold no orders, get a sales view with no rows."""
    have = {r[0] for r in con.execute(
        "SELECT table_name FROM duckdb_tables() WHERE schema_name = ? UNION ALL "
        "SELECT view_name FROM duckdb_views() WHERE schema_name = ?", [schema, schema]).fetchall()}
    for table in view_base_tables(statement, schema):
        if table not in have:
            con.execute(f"CREATE TABLE {schema}.{table} AS SELECT * FROM voltmarkt.{table} LIMIT 0")
    con.execute(statement)


# S4B-31: one row per product and ISO week of competitor_prices. It is built here, not in ddl.sql, because the build
# applies ddl.sql's views to every edge schema that mirrors voltmarkt, and the level 1 and 2 ones have no competitor_prices. The ISO
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


# S6-06 (E-011): one row per product and ISO week of the schema's calendar, zero-filled, in voltmarkt and the three level 4
# edge schemas that mirror it (F2 C1: the schema panel shows it to every level 4 item, P11, so their hidden runs need it too).
# Built here, like competitor_price_weekly, because ddl.sql's views go to every edge schema that mirrors voltmarkt, the level 1
# to 3 ones included. A week is the Monday of the order's UTC date, as the sales view's order_week; the ISO year and week come from
# the calendar. The one number in the body is the 0 of the zero-fill, which holds no data. Sprint 7 (S7-25): the level 5 window edge
# schema mirrors voltmarkt too, and the panel shows its items weekly_units, so it has the view as well.
WEEKLY_UNITS_SCHEMAS = ("voltmarkt", "voltmarkt_edge_subq", "voltmarkt_edge_interval", "voltmarkt_edge_promo", "voltmarkt_edge_win")
WEEKLY_UNITS_SQL = """CREATE VIEW {schema}.weekly_units AS
SELECT
    p.product_id,
    w.iso_year,
    w.iso_week,
    w.week_start,
    CAST(coalesce(s.units, 0) AS BIGINT) AS units,
    coalesce(s.net_revenue_eur, 0) AS net_revenue_eur
FROM {schema}.products AS p
CROSS JOIN (SELECT DISTINCT iso_year, iso_week, week_start FROM {schema}.calendar) AS w
LEFT JOIN (
    SELECT ol.product_id, CAST(date_trunc('week', o.order_ts) AS DATE) AS week_start, sum(ol.quantity) AS units,
           sum(ol.quantity * ol.unit_price_eur - ol.line_discount_eur) AS net_revenue_eur
    FROM {schema}.order_lines AS ol
    JOIN {schema}.orders AS o ON o.order_id = ol.order_id
    GROUP BY ol.product_id, CAST(date_trunc('week', o.order_ts) AS DATE)
) AS s ON s.product_id = p.product_id AND s.week_start = w.week_start"""


# S4B-02: the checkpoints whose value the build computes, in the order the truth file lists them.
TRUTH_CHECKPOINTS = ("CP2", "CP4")
SCHEMA_NAME = re.compile(r"^[a-z_][a-z0-9_]*$")


def truth_source(schema: str, query: str) -> str:
    """Sprint 6 (Task B3): what a truth value was computed from, the case's schema and its query, as 16 hex of sha256. C41 compares
    it with the key and the case it reads now, so a truth whose key or schema changed since this build is stale (server/content.ts
    truthSourceHash computes the same)."""
    return hashlib.sha256(f"{schema}\n{query}".encode("utf-8")).hexdigest()[:16]


def case_schemas(case_dirs) -> dict:
    """S6-13: each case record's schema by case ID, from the openers, content/sql/cases/ and content/sql/mocks/ (absent means voltmarkt)."""
    schemas = {}
    for folder in case_dirs:
        for path in sorted(pathlib.Path(folder).glob("*.json")) if pathlib.Path(folder).is_dir() else []:
            record = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(record, dict) and isinstance(record.get("case_id"), str):
                schema = record.get("schema")
                schemas.setdefault(record["case_id"], schema if isinstance(schema, str) and schema else DEFAULT_CASE_SCHEMA)
    return schemas


def built_schemas(con) -> list:
    """Every dataset schema the database holds, sorted: what makes a case available (S6-13)."""
    return sorted(r[0] for r in con.execute(
        "SELECT DISTINCT schema_name FROM information_schema.schemata WHERE schema_name NOT IN (?, ?, ?)", list(SYSTEM_SCHEMAS)).fetchall())


@dataclass
class Prepared:
    """A dataset the prep wrote to data/real/<schema>/: its registry record, its schema, its folder, its prep.json and its tables
    with their row counts."""
    record: dict
    schema: str
    folder: pathlib.Path
    info: dict
    tables: dict


def registry_records(path: pathlib.Path = REGISTRY) -> list:
    """The registry's records (content/datasets/registry.json), none when there is no registry."""
    path = pathlib.Path(path)
    return json.loads(path.read_text(encoding="utf-8"))["datasets"] if path.is_file() else []


def prepared_datasets(real_dir: pathlib.Path, registry: pathlib.Path = REGISTRY) -> list[Prepared]:
    """S6-23: each registry schema that data/real/<schema>/prep.json says is prepared, in registry order. Only the registry's own
    schema folders are read, so nothing else in data/real/ (a work folder, a folder no registry dataset names) and nothing outside
    it is imported. A folder with no prep.json is not prepared. One whose prep.json names another dataset or schema, lists no table,
    or lacks one of its Parquet files stops the build before anything is generated, naming the folder."""
    real_dir = pathlib.Path(real_dir)
    if not real_dir.is_dir():
        return []
    out = []
    for record in registry_records(registry):
        for entry in record.get("schemas", []):
            schema = entry.get("name") if isinstance(entry, dict) else None
            if not isinstance(schema, str) or not SCHEMA_NAME.match(schema):
                continue
            folder = real_dir / schema
            prep_file = folder / "prep.json"
            if not prep_file.is_file():
                continue

            def fail(why: str):
                raise ValueError(f"data/real/{schema} is not a complete prepared dataset: {why}. Run npm run prep:datasets again.")

            try:
                info = json.loads(prep_file.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                fail("its prep.json cannot be read")
            if not isinstance(info, dict):
                fail("its prep.json is not an object")
            if info.get("dataset") != record.get("id"):
                fail(f"its prep.json names {info.get('dataset')}, not {record.get('id')}")
            if info.get("schema") != schema:
                fail(f"its prep.json names the schema {info.get('schema')}")
            tables = info.get("tables")
            if not isinstance(tables, dict) or not tables:
                fail("its prep.json lists no table")
            for table, rows in tables.items():
                if not SCHEMA_NAME.match(table):
                    fail(f"{table!r} is not a plain table name")
                if not isinstance(rows, int) or isinstance(rows, bool) or rows < 0:
                    fail(f"the row count of {table} is not a whole number")
                if not (folder / f"{table}.parquet").is_file():
                    fail(f"{table}.parquet is missing")
            out.append(Prepared(record, schema, folder, info, dict(tables)))
    return out


def import_prepared(con, prepared: list[Prepared]) -> None:
    """S6-23: each prepared dataset into its own schema, each table from its own Parquet file, checked against prep.json's rows."""
    existing = set(built_schemas(con))
    for p in prepared:
        if p.schema in existing:
            raise ValueError(f"data/real/{p.schema}: the database already has a schema {p.schema}, so the prepared data cannot go there.")
        con.execute(f"CREATE SCHEMA {p.schema}")
        for table, rows in p.tables.items():
            path = (p.folder / f"{table}.parquet").as_posix().replace("'", "''")
            con.execute(f"CREATE TABLE {p.schema}.{table} AS SELECT * FROM read_parquet('{path}')")
            got = con.execute(f"SELECT count(*) FROM {p.schema}.{table}").fetchone()[0]
            if got != rows:
                raise ValueError(f"data/real/{p.schema}/{table}.parquet holds {got} rows, but its prep.json says {rows}. "
                                 "Run npm run prep:datasets again.")


def real_section(con, prepared: list[Prepared]) -> dict:
    """S6-23: the manifest's `real` section, outside dataset_version: each prepared schema's dataset, source file and fingerprint
    (and whether it matched the registry's), when it was prepared, and each table's rows and hash."""
    out = {}
    for p in prepared:
        source = p.info.get("source") if isinstance(p.info.get("source"), dict) else {}
        out[p.schema] = {
            "dataset": p.record["id"],
            "source": source.get("file"),
            "fingerprint": source.get("sha256"),
            "fingerprint_check": source.get("fingerprint"),
            "prepared_at": p.info.get("prepared_at"),
            "tables": {f"{p.schema}.{t}": {"rows": con.execute(f"SELECT count(*) FROM {p.schema}.{t}").fetchone()[0],
                                           "sha256": table_sha(con, f"{p.schema}.{t}")} for t in p.tables},
        }
    return out


def checkpoint_truth(con, keys_dir: pathlib.Path, case_dirs=None) -> dict:
    """Task C7, S4B-02: each case key's CP2 and CP4 truth queries (server-only) run on the case's own schema (S6-13); only each one
    value is kept, with its source hash (truth_source).

    A case key is {case_id, truths: {CP2?, CP4?}, choices: {CP1?, CP5?}, solver?}. Values are keyed "<case_id>:CP2" and
    "<case_id>:CP4", in key file name order, CP2 before CP4. A case whose schema the database does not hold is unavailable, so its
    truths are skipped (S6-13). A key without truths (the old shape included), a truth for any other checkpoint, a query that is
    not exactly one SELECT (parsed before it runs, B2-M4), one that fails to run (named by the error's class, raised outside the
    handler so no DuckDB message, which can quote the query, rides along), or one that does not return exactly one number fails
    the build, naming the case and never the query."""
    schema_of = case_schemas(CASE_DIRS if case_dirs is None else case_dirs)
    have = set(built_schemas(con))
    values, sources = {}, {}
    for path in sorted(pathlib.Path(keys_dir).glob("*.json")) if pathlib.Path(keys_dir).is_dir() else []:
        key = json.loads(path.read_text(encoding="utf-8"))
        case_id = key.get("case_id")
        truths = key.get("truths")
        if not isinstance(truths, dict):
            raise ValueError(f"The key of {case_id} needs truths: an object of its CP2 and CP4 truth queries.")
        other = sorted(set(truths) - set(TRUTH_CHECKPOINTS))
        if other:
            raise ValueError(f"The key of {case_id} has a truth for {', '.join(other)}; only CP2 and CP4 have one.")
        schema = schema_of.get(case_id, DEFAULT_CASE_SCHEMA)
        if not SCHEMA_NAME.match(schema):
            raise ValueError(f"The case {case_id} names a schema that is not a plain schema name.")
        if schema not in have:
            continue
        for checkpoint in TRUTH_CHECKPOINTS:
            if checkpoint not in truths:
                continue
            name = f"{case_id}:{checkpoint}"
            query = truths[checkpoint]
            try:
                statements = con.extract_statements(query) if isinstance(query, str) else []
            except duckdb.Error:
                statements = []
            if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
                raise ValueError(f"The truth query of {name} must be exactly one SELECT.")
            con.execute(f"SET search_path = '{schema}'")
            failure = None
            try:
                rows = con.execute(query).fetchall()
            except duckdb.Error as e:
                failure = type(e).__name__
            if failure is not None:
                raise ValueError(f"The truth query of {name} failed on {schema}: {failure}.")
            if len(rows) != 1 or len(rows[0]) != 1 or rows[0][0] is None or isinstance(rows[0][0], (str, bool)):
                raise ValueError(f"The truth query of {name} must return exactly one number.")
            values[name] = float(rows[0][0])
            sources[name] = truth_source(schema, query)
    return {"checkpoints": values, "sources": sources}


def build(out: pathlib.Path, data_dir: pathlib.Path | None = None, keys_dir: pathlib.Path | None = None, case_dirs=None) -> dict:
    out = pathlib.Path(out)
    data_dir = pathlib.Path(data_dir or out.parent)
    out.parent.mkdir(parents=True, exist_ok=True)
    (data_dir / "truth").mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".tmp.duckdb")
    for p in (tmp, pathlib.Path(str(tmp) + ".wal")):
        p.unlink(missing_ok=True)
    # S6-23: the datasets the prep wrote to data/real/, checked before anything is generated (an incomplete one stops the build).
    registry = registry_records()
    prepared = prepared_datasets(data_dir / REAL_DIR)

    tables, truth = vm.generate()
    truth["findings"] = vm.validate(tables, truth)
    # Sprint 5a (Task B2, R37): the A/B test, after every existing table, from its own stream; it only reads the order data.
    clean = tables["clean"]
    ab_tables, truth["planted"]["ab_test"] = ab.generate(clean["orders"], clean["order_lines"])
    truth["findings"]["ab_test"] = ab.validate(ab_tables, clean["orders"], clean["order_lines"])
    truth["findings"]["raw"] = vm_raw.validate(tables, truth)      # sprint 6 (S6-02, GEN-06): each quirk exists in raw
    # Sprint 6 Part 2 (S6-20): Mailvora from its own seed and streams; its validation fails the build (GEN-01).
    mv_tables, mv_truth = mv.generate()
    mv_truth["findings"] = mv.validate(mv_tables, mv_truth)

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
    # Sprint 6: cost_history after the A/B test (S6-07), then the raw schema (S6-02), before the edge files that copy them.
    for name in vm.COST_TABLES:
        con.register("src", tables["clean"][name])
        con.execute(f"INSERT INTO voltmarkt.{name} SELECT * FROM src")
        con.unregister("src")
    for name in vm_raw.RAW_TABLES:
        con.register("src", tables["raw"][name])
        con.execute(f"INSERT INTO {RAW_SCHEMA}.{name} SELECT * FROM src")
        con.unregister("src")
    # Sprint 6 Part 2 (S6-20, P31): mailvora and mailvora_raw, before the edge files, as mailvora_edge_case copies their columns.
    con.execute(MAILVORA_DDL.read_text(encoding="utf-8").replace("{schema}", MAILVORA_SCHEMA))
    for schema, source, names in ((MAILVORA_SCHEMA, mv_tables["clean"], mv.CLEAN_TABLES),
                                  (MAILVORA_RAW_SCHEMA, mv_tables["raw"], mv_raw.RAW_TABLES)):
        for name in names:
            con.register("src", source[name])
            con.execute(f"INSERT INTO {schema}.{name} SELECT * FROM src")
            con.unregister("src")
    for sql_file in sorted((ROOT / "pipeline" / "edge").glob("*.sql")):
        con.execute(sql_file.read_text(encoding="utf-8"))
    # Every edge schema that mirrors voltmarkt gets voltmarkt's views over its own tables (S6-36: since M5 the level 1 ones too,
    # over empty copies of the order tables); one that mirrors voltmarkt_raw gets none.
    mirror_edges = [r[0] for r in con.execute(
        "SELECT schema_name FROM information_schema.schemata WHERE starts_with(schema_name, 'voltmarkt_edge_') ORDER BY 1").fetchall()
        if r[0] not in RAW_EDGE_SCHEMAS]
    for schema in mirror_edges:
        for statement in view_statements(schema):
            apply_view(con, schema, statement)

    # The weekly competitor view goes in voltmarkt and in each edge schema that holds competitor_prices.
    price_schemas = [r[0] for r in con.execute(
        "SELECT DISTINCT schema_name FROM duckdb_tables() WHERE schema_name LIKE 'voltmarkt%' "
        "AND table_name = 'competitor_prices' ORDER BY 1").fetchall()]
    for schema in price_schemas:
        con.execute(COMPETITOR_WEEKLY_SQL.replace("{schema}", schema))
    for schema in WEEKLY_UNITS_SCHEMAS:
        apply_view(con, schema, WEEKLY_UNITS_SQL.replace("{schema}", schema))
    # S6-23: each prepared dataset in its own schema, before the case truths, so a real-data case's truths run once it is prepared.
    import_prepared(con, prepared)

    # S6-13: the case truths, each on its case's own schema, go to their own file with the schemas this database holds. The list
    # names the prepared schemas too: case availability and the explorer read it.
    checkpoints = {"schemas": built_schemas(con), **checkpoint_truth(con, keys_dir if keys_dir is not None else CASE_KEYS, case_dirs)}
    con.execute("SET search_path = 'main'")

    meta = {}
    schemas = [s for prefix in MANIFEST_PREFIXES for (s,) in con.execute(
        "SELECT schema_name FROM information_schema.schemata WHERE starts_with(schema_name, ?) ORDER BY 1", [prefix]).fetchall()]
    # P38: every other schema made from the build's own rows (the real datasets' edge schemas); never a prepared dataset.
    prepared_names = {p.schema for p in prepared}
    schemas += [s for s in built_schemas(con) if s not in schemas and s not in prepared_names]
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
    notes = vm_notes.schema_notes(con, "voltmarkt") + [n for s in mirror_edges for n in vm_notes.view_notes(con, s)]
    notes += [vm_notes.note(con, s, "competitor_price_weekly", *vm_notes.WEEKLY_VIEW, visible=False)
              for s in price_schemas if s != "voltmarkt"]
    notes += [vm_notes.note(con, s, "weekly_units", *vm_notes.WEEKLY_UNITS_VIEW, visible=False)
              for s in WEEKLY_UNITS_SCHEMAS if s != "voltmarkt"]
    notes += vm_notes.raw_notes(con, RAW_SCHEMA, vm_raw.RAW_TABLES)
    notes += mv_notes.schema_notes(con, MAILVORA_SCHEMA) + mv_notes.raw_notes(con, MAILVORA_RAW_SCHEMA, mv_raw.RAW_TABLES)
    # S6-23: the real datasets' edge schemas (always built), then each prepared dataset with its registry label.
    notes += real_notes.edge_notes(con, registry, set(built_schemas(con)))
    notes += [n for p in prepared for n in real_notes.dataset_notes(con, p.record, p.schema, list(p.tables))]
    real = real_section(con, prepared)
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
        "real": real,   # S6-23: outside dataset_version, so preparing a dataset leaves the fictional data's version as it is
    }
    (data_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (data_dir / "schema-notes.json").write_text(json.dumps(notes, indent=2, ensure_ascii=False), encoding="utf-8")
    (data_dir / "truth" / "voltmarkt.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
    (data_dir / "truth" / "mailvora.json").write_text(json.dumps(mv_truth, indent=2), encoding="utf-8")   # OD-GEN-01, E-091
    (data_dir / "truth" / "checkpoints.json").write_text(json.dumps(checkpoints, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    m = build(ROOT / "data" / "course.duckdb")
    real = ", ".join(m["real"]) or "none"
    print(f"built data/course.duckdb, dataset {m['dataset_version']}, duckdb {m['duckdb_version']}, prepared real data: {real}")

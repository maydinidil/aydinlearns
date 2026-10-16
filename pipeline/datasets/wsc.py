"""pipeline/datasets/wsc.py: the 8 Week SQL Challenge loader (CH-01; S6-22, S6-39, D87, E-193, E-198).

Each case study's schema script (PostgreSQL, from the case study's DB Fiddle) is the owner's own download, in a folder named
8-week-sql-challenge. The script is split into statements (quotes and comments respected) and every statement is checked
before any runs. The loader runs only:
- CREATE SCHEMA, of the case study's own schema (the registry's name for it), which then becomes the default schema;
- CREATE TABLE with a column list, in that schema; PostgreSQL's FLOAT (8 bytes) is created as DOUBLE (DuckDB's FLOAT is 4);
- INSERT INTO ... VALUES, into that schema, with only rows in parentheses after VALUES;
- UPDATE of a table of that schema (S6-39: script 8 turns blank or 'NULL' text into missing values);
and none of those three may hold SELECT or FROM outside a string or a quoted name (no subquery, set operation or FROM-first
query), and a CREATE TABLE ends at its column list (review I1: the whole statement is checked, not only its head);
and skips SET search_path (scripts 1 to 5 name their tables without the schema, which is the default here instead) and
DROP TABLE IF EXISTS (the scratch database starts empty). Any other statement, or one that calls a function that reads files
(read_csv and the like), refuses the whole script, naming the statement's number and first word. The statements run in a scratch,
in-memory DuckDB with external access off (enable_external_access=false) and R17's settings, and each table of the schema is then
written to Parquet. No question text, data or script of the challenge is ever copied into the repository (D87).
"""
from __future__ import annotations

import pathlib
import re

import duckdb

from datasets import NO_NETWORK, PrepError

IDENT = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
NAME = rf"{IDENT}(?:\s*\.\s*{IDENT})*"
SCHEMA_NAME = re.compile(r"^[a-z_][a-z0-9_]*$")
# A call to a function that reads files or the environment: refused wherever it appears.
READS_FILES = re.compile(r"\b(read_\w+|glob|\w+_scan|sniff_csv|getenv|parquet_\w+)\s*\(", re.IGNORECASE)
RULES = [
    ("skip", "SET search_path", re.compile(r"^SET\s+(?:SESSION\s+|LOCAL\s+)?search_path\b", re.IGNORECASE)),
    ("skip", "DROP TABLE IF EXISTS", re.compile(r"^DROP\s+TABLE\s+IF\s+EXISTS\b", re.IGNORECASE)),
    ("schema", "CREATE SCHEMA", re.compile(rf"^CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?({NAME})\s*$", re.IGNORECASE)),
    ("table", "CREATE TABLE", re.compile(rf"^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?({NAME})\s*\(", re.IGNORECASE)),
    ("insert", "INSERT", re.compile(rf"^INSERT\s+INTO\s+({NAME})\s*(?:\([^()]*\))?\s*VALUES\b", re.IGNORECASE)),
    ("update", "UPDATE", re.compile(rf"^UPDATE\s+({NAME})\s+SET\b", re.IGNORECASE)),
]
TYPES = {"schema": duckdb.StatementType.CREATE, "table": duckdb.StatementType.CREATE, "insert": duckdb.StatementType.INSERT,
         "update": duckdb.StatementType.UPDATE}
FLOAT = re.compile(r"\bFLOAT\b", re.IGNORECASE)
# The schema panel's grain line for each table (datasets/notes.py): the case study's own page describes its tables, and no text
# of the challenge is copied into the app (D87).
DEFAULT_GRAIN = "a table of the case study, as its script made it (its page describes it)"
ALLOWED = ("the loader runs only CREATE SCHEMA, CREATE TABLE and INSERT INTO ... VALUES, and UPDATE on the script's own tables; "
           "it skips SET search_path and DROP TABLE IF EXISTS")


def segments(text: str) -> list[tuple[str, str]]:
    """The text as (kind, text) pieces: code, a 'string', an "identifier" or a comment. A doubled quote stays inside its piece."""
    out, i, n, start = [], 0, len(text), 0
    while i < n:
        ch = text[i]
        if ch in ("'", '"'):
            j = i + 1
            while True:
                j = text.find(ch, j)
                if j < 0:
                    raise PrepError("a quote that is never closed")
                if j + 1 < n and text[j + 1] == ch:
                    j += 2
                    continue
                break
            out.append(("code", text[start:i]))
            out.append(("string" if ch == "'" else "ident", text[i:j + 1]))
            i = start = j + 1
            continue
        if text.startswith("--", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(("code", text[start:i]))
            out.append(("comment", text[i:j]))
            i = start = j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            if j < 0:
                raise PrepError("a comment that is never closed")
            out.append(("code", text[start:i]))
            out.append(("comment", text[i:j + 2]))
            i = start = j + 2
            continue
        i += 1
    out.append(("code", text[start:]))
    return [(k, t) for k, t in out if t]


def split_statements(text: str) -> list[str]:
    """The script's statements, split at each ; outside quotes and comments; a piece with comments only is no statement."""
    statements, current = [], []

    def close():
        statement = "".join(current).strip()
        if any(k != "comment" and t.strip() for k, t in segments(statement)):
            statements.append(statement)
        current.clear()

    for kind, piece in segments(text.lstrip("﻿")):
        if kind != "code":
            current.append(piece)
            continue
        parts = piece.split(";")
        for k, part in enumerate(parts):
            current.append(part)
            if k < len(parts) - 1:
                close()
    close()
    return statements


def masked(statement: str) -> str:
    """The statement's code with every string reduced to '' and every comment to a space: what the rules read."""
    return "".join(t if k in ("code", "ident") else ("''" if k == "string" else " ") for k, t in segments(statement)).strip()


def code_only(statement: str) -> str:
    """As masked, with every quoted identifier reduced to "_" too: what the shape checks read, so a name such as "from" is no
    keyword."""
    return "".join({"code": t, "ident": '"_"', "string": "''"}.get(k, " ") for k, t in segments(statement)).strip()


# Review I1: a query hidden after an allowed head (CREATE TABLE ... AS SELECT, INSERT ... VALUES (1) UNION ALL SELECT ..., a
# subquery in VALUES or SET, UPDATE ... FROM) holds one of these words outside any string or quoted name.
QUERY_WORD = re.compile(r"\b(SELECT|FROM)\b", re.IGNORECASE)


def _closing(code: str, start: int) -> int:
    """The index of the ")" that closes the "(" at `start`, or -1."""
    depth = 0
    for i in range(start, len(code)):
        if code[i] == "(":
            depth += 1
        elif code[i] == ")":
            depth -= 1
            if depth == 0:
                return i
    return -1


def _rows_only(text: str) -> bool:
    """True when `text` is only parenthesised rows separated by commas: what may follow VALUES."""
    i, n = 0, len(text)
    while True:
        while i < n and text[i].isspace():
            i += 1
        if i >= n or text[i] != "(":
            return False
        end = _closing(text, i)
        if end < 0:
            return False
        i = end + 1
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            return True
        if text[i] != ",":
            return False
        i += 1


def shape_problem(action: str, code: str) -> str | None:
    """What is wrong with the whole shape of an allowed statement after its head (`code` is code_only's), or None: no SELECT or
    FROM anywhere; a CREATE TABLE ends at its column list's closing parenthesis; VALUES is followed only by rows."""
    found = QUERY_WORD.search(code)
    if found:
        return f"it holds {found.group(1).upper()}, so it would run a query"
    if action == "table":
        start = code.index("(")
        end = _closing(code, start)
        if end < 0 or code[end + 1:].strip():
            return "something follows its column list"
    if action == "insert":
        values = re.search(r"\bVALUES\b", code, re.IGNORECASE)
        if values is None or not _rows_only(code[values.end():]):
            return "VALUES must be followed only by rows in parentheses, separated by commas"
    return None


def _parts(name: str) -> list[str]:
    return [p.strip().strip('"').lower() for p in re.findall(IDENT, name)]


def plan(text: str, schema: str, file: str) -> list[tuple[str, str, str, int]]:
    """Every statement's (action, label, SQL to run, FLOAT columns made DOUBLE), checked before any runs. Refuses the script at
    the first statement the loader does not run, naming its number and first word."""
    if not SCHEMA_NAME.match(schema):
        raise PrepError(f"{file}: {schema!r} is not a plain schema name")
    steps = []
    for k, statement in enumerate(split_statements(text), start=1):
        code = masked(statement)
        first = (re.match(r"[A-Za-z_]+", code) or re.match(r".", code)).group(0).upper()
        where = f"{file}: statement {k} ({first})"
        if READS_FILES.search(code):
            raise PrepError(f"{where} calls {READS_FILES.search(code).group(1)}, which reads files: {ALLOWED}")
        for action, label, rule in RULES:
            m = rule.match(code)
            if not m:
                continue
            if action == "skip":
                steps.append(("skip", label, statement, 0))
                break
            parts = _parts(m.group(1))
            if action == "schema":
                if parts != [schema]:
                    raise PrepError(f"{where} creates schema {'.'.join(parts)}, but this script's schema is {schema}")
            elif len(parts) > 2 or (len(parts) == 2 and parts[0] != schema):
                raise PrepError(f"{where} writes to {'.'.join(parts)}, outside this script's schema {schema}")
            problem = shape_problem(action, code_only(statement)) if action in ("table", "insert", "update") else None
            if problem:
                raise PrepError(f"{where} is not a plain {label}: {problem}. {ALLOWED[0].upper()}{ALLOWED[1:]}")
            run, floats = statement, 0
            if action == "table":
                pieces = segments(statement)
                floats = sum(len(FLOAT.findall(t)) for kind, t in pieces if kind == "code")
                run = "".join(FLOAT.sub("DOUBLE", t) if kind == "code" else t for kind, t in pieces)
            steps.append((action, label, run, floats))
            break
        else:
            raise PrepError(f"{where} is not a statement the loader runs: {ALLOWED}")
    return steps


def scratch() -> duckdb.DuckDBPyConnection:
    """The scratch database: in memory, external access off, no extension ever loaded (R17), TimeZone UTC."""
    con = duckdb.connect(":memory:", config={**NO_NETWORK, "enable_external_access": False})
    con.execute("SET TimeZone = 'UTC'")
    return con


def load(text: str, schema: str, file: str):
    """Loads one script into a scratch database. Returns the connection and a summary: statements run, skipped by kind,
    edited, and UPDATEs run."""
    steps = plan(text, schema, file)
    con = scratch()
    summary = {"run": 0, "skipped": {}, "edited": {}, "updates": 0}
    try:
        for k, (action, label, sql, floats) in enumerate(steps, start=1):
            if action == "skip":
                summary["skipped"][label] = summary["skipped"].get(label, 0) + 1
                continue
            try:
                parsed = con.extract_statements(sql)
            except duckdb.Error as e:
                raise PrepError(f"{file}: statement {k} does not parse in DuckDB ({type(e).__name__})") from None
            if len(parsed) != 1 or parsed[0].type != TYPES[action]:
                raise PrepError(f"{file}: statement {k} is not the single {label} statement it looks like")
            try:
                con.execute(sql)
            except duckdb.Error as e:
                raise PrepError(f"{file}: statement {k} ({label}) failed in DuckDB: {str(e).splitlines()[0]}") from None
            summary["run"] += 1
            if action == "schema":
                con.execute(f'USE memory."{schema}"')     # the default schema, as SET search_path makes it in PostgreSQL
            elif action == "update":
                summary["updates"] += 1
            if floats:
                summary["edited"]["FLOAT as DOUBLE"] = summary["edited"].get("FLOAT as DOUBLE", 0) + floats
        others = con.execute("SELECT schema_name, table_name FROM duckdb_tables() WHERE schema_name <> ? AND NOT internal",
                             [schema]).fetchall()
        if others:
            raise PrepError(f"{file}: the script made tables outside its schema {schema}: {', '.join(f'{s}.{t}' for s, t in others)}")
    except Exception:
        con.close()
        raise
    return con, summary


def prepare(schema: str, source, out: pathlib.Path) -> dict:
    """Loads source.path (one case study's script) and writes each table of its schema to out/<table>.parquet."""
    import pyarrow.parquet as pq
    try:
        text = pathlib.Path(source.path).read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raise PrepError(f"{source.name} is not UTF-8 text: save the script again as UTF-8") from None
    con, summary = load(text, schema, source.name)
    try:
        names = [r[0] for r in con.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ? AND NOT internal ORDER BY 1",
                                           [schema]).fetchall()]
        if not names:
            raise PrepError(f"{source.name}: the script made no table in {schema}")
        tables = {}
        for name in names:
            if not SCHEMA_NAME.match(name):
                raise PrepError(f"{source.name}: the table name {name!r} is not a plain name")
            data = con.execute(f'SELECT * FROM "{schema}"."{name}"').to_arrow_table()
            pq.write_table(data, str(out / f"{name}.parquet"))
            tables[name] = data.num_rows
    finally:
        con.close()
    skipped = ", ".join(f"{k} {v}" for k, v in summary["skipped"].items()) or "none"
    line = (f"statements run {summary['run']}; skipped {skipped}; FLOAT as DOUBLE {summary['edited'].get('FLOAT as DOUBLE', 0)}; "
            f"UPDATEs {summary['updates']}")
    return {"tables": tables, "checks": {"statements": summary}, "warnings": [], "summary": line}

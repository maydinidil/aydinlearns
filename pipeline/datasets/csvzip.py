"""pipeline/datasets/csvzip.py: the reader for the real datasets whose download is a zip of CSV files (sprint 8 Part 2, Task D1;
S8-16, E-213), using only Python's standard library, as xlsx.py does for workbooks (D84).

prep.py finds each CSV file the registry names by its file name, wherever it sits in the zip (source.members: table -> its path in
the zip). Each one is read straight from the zip, never unpacked on disk, as UTF-8 text (a byte-order mark is dropped), with Python's
csv module in strict mode: a quoted field may hold commas, quotes and line breaks. Its first line must read exactly the table's
column names; every other line holds one value per column, and a blank line is skipped and counted. Values convert by column kind
(xlsx.Column.kind), into the Parquet types every real dataset uses (datasets.arrow_type):
- text: as the file writes it, never trimmed, so a code such as 01037 or an ID such as 1e5 stays text; an empty field is missing;
- int: a whole number (40, or 40.0); an empty field is missing; anything else, or a number too large for the column, is refused;
- float: a plain decimal number; an empty field is missing; NaN, infinity and any other text are refused;
- date and datetime: ISO 8601, 2017-10-03 and 2017-10-03 09:15:00; an empty field is missing; a time zone is refused.
A dataset may name a text that stands for a missing value in its files (Maven's NULL, a database export's way of writing one): in
any column it becomes missing, and each column's count is recorded. Each error names the file, its line and the column, never a value.

prepare_tables reads every table of a dataset in its prep module's order, then checks each table's key and each 1:N link its notes
give (the same notes the schema panel shows, datasets/notes.py): the key's repeated rows, and each link's values that are not in the
table it points to. A difference warns and is recorded; the prep goes on.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import math
import pathlib
import re
import zipfile
import zlib
from dataclasses import dataclass, field

from datasets import ParquetTable, PrepError
from datasets.xlsx import Column

# The largest declared size of a CSV file the reader reads (review M1's rule for workbooks): zipfile never reads past an entry's
# declared size, so it bounds the read. The largest file read, Maven's website_pageviews, is well under 100 MB.
MAX_MEMBER_BYTES = 1024 * 1024 * 1024
DAMAGED = (zipfile.BadZipFile, zlib.error, EOFError)
INTEGER = re.compile(r"^[+-]?\d+$")
DECIMAL = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")
INT32 = (-2**31, 2**31 - 1)


def _int(s: str):
    t = s.strip()
    if t == "":
        return None
    if INTEGER.match(t):
        n = int(t)
    elif DECIMAL.match(t) and float(t).is_integer():
        n = int(float(t))
    else:
        raise ValueError("not a whole number")
    if not INT32[0] <= n <= INT32[1]:
        raise ValueError("a whole number too large for the column")
    return n


def _float(s: str):
    t = s.strip()
    if t == "":
        return None
    if not DECIMAL.match(t):
        raise ValueError("not a number")
    v = float(t)
    if not math.isfinite(v):
        raise ValueError("not a number")
    return v


def _datetime(s: str):
    t = s.strip()
    if t == "":
        return None
    try:
        v = dt.datetime.fromisoformat(t)
    except ValueError:
        raise ValueError("not a date and time such as 2017-10-03 09:15:00") from None
    if v.tzinfo is not None:
        raise ValueError("a date and time with a time zone")
    return v


def _date(s: str):
    t = s.strip()
    if t == "":
        return None
    try:
        return dt.date.fromisoformat(t)
    except ValueError:
        raise ValueError("not a date such as 2017-10-03") from None


def _text(s: str):
    return None if s == "" else s


CONVERT = {"text": _text, "int": _int, "float": _float, "date": _date, "datetime": _datetime}


@dataclass
class FileStats:
    """What read_table saw in one CSV file: its path in the zip, the rows read, the blank lines skipped, the values each column
    read as missing because the file wrote the dataset's missing text, and the rows that repeat the key it was given."""
    file: str
    rows: int = 0
    blank_lines: int = 0
    missing_text: dict = field(default_factory=dict)
    duplicates: int = 0

    def as_dict(self) -> dict:
        return {"file": self.file, "rows": self.rows, "blank_lines": self.blank_lines, "missing_text": dict(self.missing_text)}


def read_table(zf: zipfile.ZipFile, member: str, columns: list[Column], path: pathlib.Path, *, missing_text: str | None = None,
               key: list[str] | tuple = (), keep: list[str] | tuple = (), stats: FileStats | None = None,
               kept: dict | None = None) -> FileStats:
    """Reads the CSV file `member` of `zf` into Parquet at `path`, converting each value by its column's kind. `key` names the
    columns whose repeated rows are counted (stats.duplicates); `keep` the columns whose distinct values go into `kept`
    ({column: set}), for the links."""
    names = [c.name for c in columns]
    convert = [CONVERT[c.kind] for c in columns]
    key_at = [names.index(k) for k in key]
    keep_at = {c: names.index(c) for c in keep}
    stats = stats if stats is not None else FileStats(member)
    kept = kept if kept is not None else {}
    for c in keep:
        kept.setdefault(c, set())
    seen: set = set()
    duplicates = 0
    try:
        size = zf.getinfo(member).file_size
    except KeyError:
        raise PrepError(f"the zip holds no {member}") from None
    if size > MAX_MEMBER_BYTES:
        raise PrepError(f"{member} declares {size:,} bytes, more than the reader takes ({MAX_MEMBER_BYTES:,} bytes)")
    line = 0
    try:
        with zf.open(member) as raw, io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as text, \
                ParquetTable(path, columns) as table:
            reader = csv.reader(text, strict=True)
            header = next(reader, None)
            line = reader.line_num
            got = [h.strip() for h in header] if header else []
            if got != names:
                raise PrepError(f"{member}: its first line reads {', '.join(got) or 'nothing'}, not {', '.join(names)}")
            for row in reader:
                line = reader.line_num
                if not row:
                    stats.blank_lines += 1
                    continue
                if len(row) != len(names):
                    raise PrepError(f"{member} line {line}: {len(row)} values, not {len(names)}")
                record = []
                for k, value in enumerate(row):
                    if missing_text is not None and value == missing_text:
                        stats.missing_text[names[k]] = stats.missing_text.get(names[k], 0) + 1
                        record.append(None)
                        continue
                    try:
                        record.append(convert[k](value))
                    except ValueError as e:
                        raise PrepError(f"{member} line {line}, column {names[k]}: {e}") from None
                record = tuple(record)
                if key_at:
                    k_value = tuple(record[i] for i in key_at)
                    if k_value in seen:
                        duplicates += 1
                    else:
                        seen.add(k_value)
                for c, i in keep_at.items():
                    if record[i] is not None:
                        kept[c].add(record[i])
                table.add(record)
                stats.rows += 1
    except DAMAGED as e:
        raise PrepError(f"{member} is damaged ({type(e).__name__})") from None
    except UnicodeDecodeError:
        raise PrepError(f"{member} is not UTF-8 text" + (f" (after line {line})" if line else "")) from None
    except csv.Error as e:   # its message names the problem (a stray quote, a field over the size limit), never the value
        raise PrepError(f"{member} after line {line}: {e}") from None
    stats.duplicates = duplicates
    return stats


def prepare_tables(dataset: str, source, out: pathlib.Path, tables: dict, notes: dict, *, missing_text: str | None = None,
                   keep: dict | None = None) -> tuple[dict, dict]:
    """Reads each table of `tables` ({table: [(column, kind), ...]}, in that order) from its CSV file in the zip at source.path
    (source.members: {table: its path in the zip}) into out/<table>.parquet, then checks each key and each 1:N link of `notes` (a
    prep module's NOTES: {table: (grain, key, links, column notes)}). `keep` ({table: [column]}) names more columns whose distinct
    values the dataset's own checks need. Returns the result prep.py records (tables, checks, warnings; the module adds its own
    checks and the summary) and the distinct values kept, {(table, column): set}."""
    if set(source.members) != set(tables):
        raise PrepError(f"{dataset}: the registry names the tables {', '.join(sorted(source.members)) or 'none'}, and the prep reads "
                        f"{', '.join(tables)}")
    links = []
    watch: dict[str, set] = {t: set((keep or {}).get(t, ())) for t in tables}
    for table, (_, _, fks, _) in notes.items():
        for fk in fks:
            column, ref_table, ref_column = fk["columns"][0], fk["ref_table"], fk["ref_columns"][0]
            links.append((table, column, ref_table, ref_column))
            watch[table].add(column)
            watch[ref_table].add(ref_column)
    counts, files, keys, kept, warnings = {}, [], {}, {}, []
    try:
        zf = zipfile.ZipFile(source.path)
    except (zipfile.BadZipFile, OSError) as e:
        raise PrepError(f"{dataset}: {source.path.name} is not a zip that can be read ({type(e).__name__})") from None
    with zf:
        for table, spec in tables.items():
            columns = [Column(name, kind) for name, kind in spec]
            pk = notes.get(table, ("", [], [], {}))[1]
            values: dict = {}
            st = read_table(zf, source.members[table], columns, out / f"{table}.parquet", missing_text=missing_text, key=pk,
                            keep=sorted(watch[table]), kept=values)
            counts[table] = st.rows
            files.append(st.as_dict())
            if pk:
                keys[table] = {"key": list(pk), "duplicates": st.duplicates}
                if st.duplicates:
                    warnings.append(f"{dataset}: {st.duplicates:,} rows of {table} repeat its key ({', '.join(pk)})")
            for column, found in values.items():
                kept[(table, column)] = found
    link_checks = []
    for table, column, ref_table, ref_column in links:
        missing = len(kept[(table, column)] - kept[(ref_table, ref_column)])
        link_checks.append({"link": f"{table}.{column} -> {ref_table}.{ref_column}", "not_found": missing})
        if missing:
            warnings.append(f"{dataset}: {missing:,} {'value' if missing == 1 else 'values'} of {table}.{column} "
                            f"{'is' if missing == 1 else 'are'} not in {ref_table}.{ref_column}")
    missing_by_table = {t: f["missing_text"] for t, f in zip(tables, files) if f["missing_text"]}
    checks = {"files": files, "keys": keys, "links": link_checks}
    if missing_text is not None:
        checks["missing_text"] = missing_by_table
    return {"tables": counts, "checks": checks, "warnings": warnings}, kept


def rows_line(tables: dict) -> str:
    """The rows of each table, for the console's checks line: "customers 4, orders 4 rows"."""
    return ", ".join(f"{t} {n:,}" for t, n in tables.items()) + " rows"


def check_totals(checks: dict) -> tuple[int, int]:
    """The key duplicates and the link values not found, over every table."""
    return (sum(k["duplicates"] for k in checks["keys"].values()), sum(c["not_found"] for c in checks["links"]))

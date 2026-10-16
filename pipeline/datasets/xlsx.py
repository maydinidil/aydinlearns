"""pipeline/datasets/xlsx.py: the Excel reader for the real datasets (D84), using only Python's standard library.

An .xlsx workbook is a zip of XML parts. The reader follows the workbook's relationships to each sheet, streams the sheet's XML
row by row (so a sheet of half a million rows never sits in memory whole), and places each value by its cell reference (`r`,
such as C7), so an empty cell, which Excel leaves out, keeps the next value in its own column. It reads shared strings, inline
strings and rich-text runs (joined, without phonetic runs), numbers, booleans and formula results.

Values are then converted by column (Column.kind), the same way for every dataset:
- text: codes are always text. A number in a text column becomes its digits, 85123 and not 85123.0, so StockCode 85123 and
  85123A are both text;
- int: IDs are whole numbers. 13085.0 becomes 13085; a value with a fraction is refused;
- float: numbers;
- date and datetime: serial numbers in Excel's 1900 date system (serial 61 is 1 March 1900, after Excel's 29 February 1900,
  serial 60, which never existed), datetimes to the nearest second. A workbook in the 1904 system is refused.

read_records finds the header row in a sheet's first rows (E-028: a title row may sit above it), checks it reads exactly the
expected column names, and reads up to the first empty row (stop at empty), counting any rows left after it. Errors name the
sheet, row and column.
"""
from __future__ import annotations

import contextlib
import datetime as dt
import io
import math
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
import zlib
from dataclasses import dataclass

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DOC_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"
CELL_REF = re.compile(r"^([A-Z]{1,3})(\d+)$")
# OOXML writes a control character in a string as _xHHHH_ (and a literal "_x" as _x005F_x).
ESCAPED = re.compile(r"_x([0-9A-Fa-f]{4})_")
INTEGER = re.compile(r"^[+-]?\d+$")
KINDS = ("text", "int", "float", "date", "datetime")
# Review M1: the largest declared size of a zip entry the reader reads whole into memory (the workbook inside a download, the
# shared strings and the other small parts), and of a sheet, which is streamed row by row. The real workbooks are about 45 and
# 31 MB, and each Online Retail II sheet is roughly 130 MB of XML, so both caps sit well above them.
MAX_HELD_BYTES = 300 * 1024 * 1024
MAX_STREAMED_BYTES = 1024 * 1024 * 1024
DAMAGED = (zipfile.BadZipFile, zlib.error, EOFError, ET.ParseError)


class XlsxError(Exception):
    """A workbook the reader cannot read as the dataset expects: the message names the sheet, row and column."""


@dataclass(frozen=True)
class Column:
    """A table column: its name and how its cells convert (text, int, float, date or datetime)."""
    name: str
    kind: str

    def __post_init__(self):
        if self.kind not in KINDS:
            raise ValueError(f"column {self.name}: kind must be one of {', '.join(KINDS)}")


@dataclass
class SheetStats:
    """What read_records saw in one sheet: the header's row, the rows read, and the rows after the first empty row."""
    sheet: str
    header_row: int = 0
    rows: int = 0
    rows_after_empty: int = 0

    def as_dict(self) -> dict:
        return {"sheet": self.sheet, "header_row": self.header_row, "rows": self.rows, "rows_after_empty": self.rows_after_empty}


def column_index(letters: str) -> int:
    """A, B, ..., Z, AA, ... as 0, 1, ..., 25, 26, ..."""
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def unescape(text: str) -> str:
    return ESCAPED.sub(lambda m: chr(int(m.group(1), 16)), text) if "_x" in text else text


def _number(text: str):
    text = text.strip()
    return int(text) if INTEGER.match(text) else float(text)


def _text_of(elem) -> str:
    """The text of a shared string item (si) or an inline string (is): its t, or its rich runs' t joined; phonetic runs left out."""
    parts = []
    for child in elem:
        if child.tag == MAIN + "t":
            parts.append(child.text or "")
        elif child.tag == MAIN + "r":
            t = child.find(MAIN + "t")
            parts.append((t.text or "") if t is not None else "")
    return unescape("".join(parts))


def _check_size(zf: zipfile.ZipFile, name: str, cap: int) -> None:
    """Review M1: a zip entry's declared size is checked before it is read. zipfile never reads past the declared size (a larger
    stream fails its CRC check), so the declared size bounds what the read can cost."""
    size = zf.getinfo(name).file_size
    if size > cap:
        raise XlsxError(f"the zip entry {name} declares {size:,} bytes, more than the reader takes ({cap:,} bytes)")


@contextlib.contextmanager
def _intact(name: str):
    """Review M1: a damaged zip entry (a bad CRC, a broken deflate stream, a cut-off file) or a part that is not XML, found while
    it is read, is an XlsxError naming the part, never a traceback."""
    try:
        yield
    except DAMAGED as e:
        raise XlsxError(f"the workbook part {name} is damaged or is not XML ({type(e).__name__})") from None


class Workbook:
    """An .xlsx file, or the .xlsx at path `inside` a downloaded zip (read into memory, never unpacked on disk)."""

    def __init__(self, path, inside: str | None = None):
        try:
            if inside is not None:
                with zipfile.ZipFile(path) as outer:
                    _check_size(outer, inside, MAX_HELD_BYTES)
                    with _intact(inside):
                        data = outer.read(inside)
                self._zip = zipfile.ZipFile(io.BytesIO(data))
            else:
                self._zip = zipfile.ZipFile(path)
        except KeyError as e:
            raise XlsxError(f"the zip holds no {inside}") from e
        except zipfile.BadZipFile as e:
            raise XlsxError("the file is not an Excel workbook (not a zip)") from e
        try:
            self._load()
        except Exception:
            self._zip.close()
            raise

    def _part(self, name: str, streamed: bool = False):
        """A part of the workbook, opened for parsing, after its declared size is checked against MAX_STREAMED_BYTES (a sheet,
        read row by row) or MAX_HELD_BYTES (every other part, read whole). A downloaded file is untrusted: the bundled expat (2.4.1
        and later) limits entity expansion and ElementTree never fetches an external entity, and a part whose first 4,096 bytes
        declare a DOCTYPE, which no workbook part has, is refused before it is parsed."""
        try:
            _check_size(self._zip, name, MAX_STREAMED_BYTES if streamed else MAX_HELD_BYTES)
            with _intact(name), self._zip.open(name) as head:
                prolog = head.read(4096)
            if b"<!DOCTYPE" in prolog or b"<!ENTITY" in prolog:
                raise XlsxError(f"the workbook part {name} declares a DOCTYPE, which no workbook has")
            return self._zip.open(name)
        except KeyError as e:
            raise XlsxError(f"the workbook has no part {name}") from e

    def _rels(self, part: str) -> dict:
        folder, base = posixpath.split(part)
        rels_name = posixpath.join(folder, "_rels", base + ".rels")
        if rels_name not in self._zip.namelist():
            return {}
        out = {}
        with self._part(rels_name) as f, _intact(rels_name):
            relationships = list(ET.parse(f).getroot().iter(PKG_REL + "Relationship"))
        for rel in relationships:
            target = rel.get("Target", "")
            path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(folder, target))
            out[rel.get("Id")] = (rel.get("Type", ""), path)
        return out

    def _load(self) -> None:
        root_rels = self._rels("")
        office = [p for t, p in root_rels.values() if t.endswith("/officeDocument")]
        self._book_part = office[0] if office else "xl/workbook.xml"
        with self._part(self._book_part) as f, _intact(self._book_part):
            book = ET.parse(f).getroot()
        pr = book.find(MAIN + "workbookPr")
        if pr is not None and pr.get("date1904", "").lower() in ("1", "true"):
            raise XlsxError("the workbook uses the 1904 date system; the reader reads the 1900 system only")
        rels = self._rels(self._book_part)
        self._sheets: dict[str, str] = {}
        for s in book.iter(MAIN + "sheet"):
            rel = rels.get(s.get(DOC_REL + "id"))
            if rel is None:
                raise XlsxError(f"sheet {s.get('name')!r} has no part")
            self._sheets[s.get("name")] = rel[1]
        self._shared: list[str] = []
        shared = [p for t, p in rels.values() if t.endswith("/sharedStrings")]
        if shared:
            with self._part(shared[0]) as f, _intact(shared[0]):
                sst = None
                for event, elem in ET.iterparse(f, events=("start", "end")):
                    if event == "start":
                        if elem.tag == MAIN + "sst":
                            sst = elem
                    elif elem.tag == MAIN + "si":
                        self._shared.append(_text_of(elem))
                        if sst is not None:
                            sst.clear()

    @property
    def sheet_names(self) -> list[str]:
        return list(self._sheets)

    def close(self) -> None:
        self._zip.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _value(self, c):
        t = c.get("t", "n")
        if t == "inlineStr":
            inline = c.find(MAIN + "is")
            return _text_of(inline) if inline is not None else None
        v = c.find(MAIN + "v")
        if v is None or v.text is None:
            return None
        text = v.text
        if t == "s":
            return self._shared[int(text)]
        if t == "b":
            return text.strip() == "1"
        if t in ("str", "e"):
            return unescape(text)
        if t == "d":
            return dt.datetime.fromisoformat(text)
        return _number(text)

    def rows(self, sheet: str):
        """Each row element of a sheet as (row number, values by column index); a missing cell is None. A row the sheet's XML
        leaves out is not yielded; a row element whose cells hold no value (styled blanks) is yielded as an empty list, which
        read_records takes as the first empty row (review M6)."""
        if sheet not in self._sheets:
            raise XlsxError(f"the workbook has no sheet {sheet!r} (it has {', '.join(repr(s) for s in self._sheets)})")
        part = self._sheets[sheet]
        with self._part(part, streamed=True) as f, _intact(part):
            sheet_data = None
            row_no, next_row, col = 0, 1, -1
            values: dict[int, object] = {}
            for event, elem in ET.iterparse(f, events=("start", "end")):
                tag = elem.tag
                if event == "start":
                    if tag == MAIN + "row":
                        r = elem.get("r")
                        row_no = int(r) if r else next_row
                        values, col = {}, -1
                    elif tag == MAIN + "sheetData":
                        sheet_data = elem
                    continue
                if tag == MAIN + "c":
                    ref = elem.get("r")
                    if ref:
                        m = CELL_REF.match(ref)
                        if not m:
                            raise XlsxError(f"sheet {sheet!r} row {row_no}: a cell reference {ref!r} the reader cannot place")
                        col = column_index(m.group(1))
                    else:
                        col += 1
                    try:
                        value = self._value(elem)
                    except (IndexError, ValueError):
                        raise XlsxError(f"sheet {sheet!r} row {row_no}, column {col + 1}: a cell value the reader cannot read") from None
                    if value is not None:
                        values[col] = value
                elif tag == MAIN + "row":
                    width = max(values) + 1 if values else 0
                    out = [None] * width
                    for k, v in values.items():
                        out[k] = v
                    yield row_no, out
                    next_row = row_no + 1
                    if sheet_data is not None:
                        sheet_data.clear()   # the rows read so far: streamed, not kept


# ---- conversion by column ------------------------------------------------------------------------------------------------

def to_text(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    if isinstance(v, dt.datetime):
        return v.isoformat(sep=" ")
    return v


def to_int(v):
    if v is None:
        return None
    if isinstance(v, bool):
        raise ValueError("a true or false value, not a whole number")
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v.is_integer():
            return int(v)
        raise ValueError("not a whole number")
    s = str(v).strip()
    if s == "":
        return None
    try:
        n = _number(s)
    except ValueError:
        raise ValueError("text, not a whole number") from None
    return to_int(n)


def to_float(v):
    if v is None:
        return None
    if isinstance(v, bool):
        raise ValueError("a true or false value, not a number")
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        raise ValueError("text, not a number") from None


def _serial(v) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError("not a date serial number")
    if not math.isfinite(v) or v < 1:
        raise ValueError("a serial number before 1 January 1900")
    return float(v)


def _serial_day(days: int) -> dt.date:
    if days == 60:
        raise ValueError("serial 60 is 29 February 1900, a day Excel counts that never existed")
    # Serials 1 to 59 count from 31 December 1899; from 61 on, one more day for Excel's 29 February 1900.
    return (dt.date(1899, 12, 31) if days < 60 else dt.date(1899, 12, 30)) + dt.timedelta(days=days)


def to_date(v):
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        if v.time() != dt.time():
            raise ValueError("a date with a time of day")
        return v.date()
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return None
        try:
            return dt.date.fromisoformat(s)
        except ValueError:
            raise ValueError("text, not a date") from None
    serial = _serial(v)
    if not serial.is_integer():
        raise ValueError("a date with a time of day")
    return _serial_day(int(serial))


def to_datetime(v):
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return None
        try:
            return dt.datetime.fromisoformat(s)
        except ValueError:
            raise ValueError("text, not a date and time") from None
    serial = _serial(v)
    days = math.floor(serial)
    seconds = round((serial - days) * 86400)
    return dt.datetime.combine(_serial_day(days), dt.time()) + dt.timedelta(seconds=seconds)


CONVERT = {"text": to_text, "int": to_int, "float": to_float, "date": to_date, "datetime": to_datetime}


def _label(v) -> str | None:
    return str(v).strip() if v is not None else None


def read_records(wb: Workbook, sheet: str, header: list[str], columns: list[Column], *, search_rows: int = 10,
                 stop_at_empty: bool = True, stats: SheetStats | None = None):
    """The sheet's data rows as tuples converted by `columns`, after the row that reads exactly `header` (found in the first
    `search_rows` rows), up to the first empty row. `stats` records the header's row and the rows read and left after it."""
    if len(header) != len(columns):
        raise ValueError("one column per header name")
    stats = stats if stats is not None else SheetStats(sheet)
    rows = wb.rows(sheet)
    want = [h.strip() for h in header]
    first_seen = None
    for row_no, values in rows:
        labels = [_label(v) for v in values]
        while labels and labels[-1] in (None, ""):
            labels.pop()
        if labels == want:
            stats.header_row = row_no
            break
        if first_seen is None and labels:
            first_seen = (row_no, labels)
        if row_no >= search_rows:
            break
    if not stats.header_row:
        seen = f"; row {first_seen[0]} reads {', '.join(str(x) for x in first_seen[1])}" if first_seen else ""
        raise XlsxError(f"sheet {sheet!r}: no header row reading {', '.join(want)} in its first {search_rows} rows{seen}")
    width = len(columns)
    converters = [CONVERT[c.kind] for c in columns]
    previous = stats.header_row
    ended = False
    for row_no, values in rows:
        empty = all(v is None or (isinstance(v, str) and v.strip() == "") for v in values)
        if ended:
            stats.rows_after_empty += 0 if empty else 1
            continue
        if stop_at_empty and (empty or row_no > previous + 1):
            ended = True
            stats.rows_after_empty += 0 if empty else 1
            continue
        previous = row_no
        if empty:
            continue
        if any(v is not None and not (isinstance(v, str) and v.strip() == "") for v in values[width:]):
            raise XlsxError(f"sheet {sheet!r} row {row_no}: a value beyond the header's last column, {header[-1]}")
        record = []
        for k in range(width):
            v = values[k] if k < len(values) else None
            try:
                record.append(converters[k](v))
            except ValueError as e:
                raise XlsxError(f"sheet {sheet!r} row {row_no}, column {header[k]}: {e}") from None
        stats.rows += 1
        yield tuple(record)

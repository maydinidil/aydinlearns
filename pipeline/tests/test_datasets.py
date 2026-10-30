"""Sprint 6 Part 2, Task G2: the real datasets' prep package, pipeline/datasets/ (Stage A: S6-22, D84, D87, S6-39), and the data
build's import of what it prepared (Stage B: S6-23, ruling P38). Sprint 8 Part 2, Task D1 (S8-16, E-213): Olist and Maven Toy
Store, each a zip of CSV files (csvzip.py, olist.py, maven_toy_store.py), a browser's copies of a download's name, and the two
datasets' edge schemas.

Everything runs on fixtures this file generates: a tiny workbook built with zipfile (shared strings, inline strings, rich-text
runs, numbers, date and datetime serials, empty cells), the two Excel datasets' workbooks in their zips, the two CSV datasets'
zips (a few invented rows per table under the real column names), and the three small SQL scripts in pipeline/tests/fixtures/
(invented, nothing from the 8 Week SQL Challenge). The owner's downloads are never read: the real files are prepared by the
controller (the brief's Step 5). The builds here go to temporary folders, never to data/. Every DuckDB instance follows R17.
"""
import contextlib
import csv
import datetime as dt
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import sys
import tempfile
import unittest
import zipfile
from unittest import mock
from xml.sax.saxutils import escape

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from course_build import build_course_db   # L50: the paths, and Mailvora generated once per process (S7-30)
from datasets import breakfast_at_the_frat as baf  # noqa: E402
from datasets import csvzip  # noqa: E402
from datasets import maven_toy_store as maven  # noqa: E402
from datasets import olist  # noqa: E402
from datasets import online_retail_ii as orii  # noqa: E402
from datasets import prep  # noqa: E402
from datasets import wsc  # noqa: E402
from datasets import xlsx  # noqa: E402
from datasets import PrepError  # noqa: E402

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"
REGISTRY = ROOT / "content" / "datasets" / "registry.json"
EDGE = ROOT / "pipeline" / "edge"
EPOCH = dt.datetime(1899, 12, 30)


def serial(value) -> float:
    """An Excel 1900-system serial for a date or datetime after February 1900 (this test's own conversion)."""
    if not isinstance(value, dt.datetime):
        value = dt.datetime.combine(value, dt.time())
    delta = value - EPOCH
    return delta.days + delta.seconds / 86400


# ---- a tiny .xlsx, built with zipfile -------------------------------------------------------------------------------------

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


class Inline(str):
    """A string written as an inline string (t="inlineStr")."""


class Rich(tuple):
    """A rich-text string: its runs, written as shared (or, with inline=True, inline) rich text."""
    inline = False


class InlineRich(Rich):
    inline = True


class Raw:
    """A number cell written exactly as given, `<v>text</v>`."""
    def __init__(self, text):
        self.text = text


class StyledEmpty:
    """A cell element with a style and no value, as Excel writes a formatted blank cell."""


class Typed:
    """A cell written with an explicit type attribute, `<c t="...."><v>text</v></c>`: b (boolean), str (a formula's text), e (an error), d (ISO 8601)."""
    def __init__(self, t, text):
        self.t, self.text = t, text


def letters(index: int) -> str:
    out, n = "", index + 1
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out


class Book:
    """Sheets of rows; a row is None (an empty row, no element) or a list of values (None: no cell)."""

    def __init__(self, date1904=False):
        self.date1904 = date1904
        self.shared: list = []
        self.sheets: list = []

    def sheet(self, name, rows):
        self.sheets.append((name, rows))
        return self

    def _sst(self, value) -> int:
        if value not in self.shared:
            self.shared.append(value)
        return self.shared.index(value)

    @staticmethod
    def _runs(runs) -> str:
        return "".join(f'<r><rPr><b/></rPr><t xml:space="preserve">{escape(t)}</t></r>' for t in runs)

    def _cell(self, ref, v) -> str:
        if isinstance(v, StyledEmpty):
            return f'<c r="{ref}" s="1"/>'
        if isinstance(v, Raw):
            return f'<c r="{ref}"><v>{v.text}</v></c>'
        if isinstance(v, Typed):
            return f'<c r="{ref}" t="{v.t}"><v>{escape(v.text)}</v></c>'
        if isinstance(v, Rich):
            if v.inline:
                return f'<c r="{ref}" t="inlineStr"><is>{self._runs(v)}</is></c>'
            return f'<c r="{ref}" t="s"><v>{self._sst(v)}</v></c>'
        if isinstance(v, Inline):
            return f'<c r="{ref}" t="inlineStr"><is><t>{escape(v)}</t></is></c>'
        if isinstance(v, bool):
            return f'<c r="{ref}" t="b"><v>{int(v)}</v></c>'
        if isinstance(v, str):
            return f'<c r="{ref}" t="s"><v>{self._sst(v)}</v></c>'
        if isinstance(v, (dt.date, dt.datetime)):
            return f'<c r="{ref}" s="2"><v>{repr(serial(v))}</v></c>'
        return f'<c r="{ref}"><v>{repr(v)}</v></c>'

    def _sheet_xml(self, rows) -> str:
        out = []
        for r, row in enumerate(rows, start=1):
            if row is None:
                continue
            cells = "".join(self._cell(f"{letters(c)}{r}", v) for c, v in enumerate(row) if v is not None)
            out.append(f'<row r="{r}">{cells}</row>')
        return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="{MAIN_NS}" xmlns:r="{REL_NS}">'
                f'<sheetData>{"".join(out)}</sheetData></worksheet>')

    def bytes(self) -> bytes:
        sheets_xml = [self._sheet_xml(rows) for _, rows in self.sheets]   # interns the shared strings first
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
            z.writestr("_rels/.rels", f'<?xml version="1.0"?><Relationships xmlns="{PKG_NS}"><Relationship Id="rId1" '
                                      f'Type="{REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
            pr = '<workbookPr date1904="1"/>' if self.date1904 else '<workbookPr/>'
            # Sheet relationship IDs are not in sheet order, and the last sheet's target is absolute: the reader follows the rels.
            sheets = "".join(f'<sheet name="{escape(n, {chr(34): "&quot;"})}" sheetId="{k + 1}" r:id="rId{len(self.sheets) - k}"/>'
                             for k, (n, _) in enumerate(self.sheets))
            z.writestr("xl/workbook.xml", f'<?xml version="1.0"?><workbook xmlns="{MAIN_NS}" xmlns:r="{REL_NS}">{pr}<sheets>{sheets}</sheets></workbook>')
            rels = []
            for k in range(len(self.sheets)):
                target = f"worksheets/sheet{k + 1}.xml" if k < len(self.sheets) - 1 else f"/xl/worksheets/sheet{k + 1}.xml"
                rels.append(f'<Relationship Id="rId{len(self.sheets) - k}" Type="{REL_NS}/worksheet" Target="{target}"/>')
            rels.append(f'<Relationship Id="rIdS" Type="{REL_NS}/sharedStrings" Target="sharedStrings.xml"/>')
            z.writestr("xl/_rels/workbook.xml.rels", f'<?xml version="1.0"?><Relationships xmlns="{PKG_NS}">{"".join(rels)}</Relationships>')
            for k, xml in enumerate(sheets_xml):
                z.writestr(f"xl/worksheets/sheet{k + 1}.xml", xml)
            sis = []
            for s in self.shared:
                if isinstance(s, Rich):
                    # A phonetic run (rPh) is not part of the text.
                    sis.append(f"<si>{self._runs(s)}<rPh sb=\"0\" eb=\"1\"><t>yomi</t></rPh></si>")
                else:
                    sis.append(f'<si><t xml:space="preserve">{escape(s)}</t></si>')
            z.writestr("xl/sharedStrings.xml", f'<?xml version="1.0"?><sst xmlns="{MAIN_NS}" count="{len(sis)}" uniqueCount="{len(sis)}">'
                                                f'{"".join(sis)}</sst>')
        return buf.getvalue()

    def write(self, path: pathlib.Path) -> pathlib.Path:
        path.write_bytes(self.bytes())
        return path


def zip_with(path: pathlib.Path, members: dict) -> pathlib.Path:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in members.items():
            z.writestr(name, data)
    return path


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class TempDir(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)


# ---- D84: the Excel reader --------------------------------------------------------------------------------------------------

CELL_HEADER = ["code", "label", "amount", "day", "moment", "customer", "note"]
CELL_COLUMNS = [xlsx.Column("code", "text"), xlsx.Column("label", "text"), xlsx.Column("amount", "float"),
                xlsx.Column("day", "date"), xlsx.Column("moment", "datetime"), xlsx.Column("customer", "int"),
                xlsx.Column("note", "text")]


class Reader(TempDir):
    def book(self):
        return Book().sheet("Cells", [
            CELL_HEADER,
            [85123, "plain shared", 12.5, dt.date(2010, 12, 1), dt.datetime(2009, 12, 1, 7, 45), Raw("13085.0"), Inline("inline text")],
            [Inline("85123A"), Rich(("rich ", "runs")), -3, dt.date(2011, 1, 4), dt.datetime(2010, 12, 9, 16, 30), None, "after a gap"],
            ["C489449", InlineRich(("inline ", "rich")), Raw("4.2E-2"), Raw("40148"), Raw("40148.322916666664"), StyledEmpty(), StyledEmpty()],
        ])

    def test_cell_kinds_by_reference(self):
        path = self.book().write(self.tmp / "cells.xlsx")
        with xlsx.Workbook(path) as wb:
            self.assertEqual(wb.sheet_names, ["Cells"])
            rows = list(wb.rows("Cells"))
        self.assertEqual([r for r, _ in rows], [1, 2, 3, 4])
        self.assertEqual(rows[0][1], CELL_HEADER)
        # Raw cells: a number stays a number, shared, inline and rich strings are text, and an empty cell is missing.
        self.assertEqual(rows[1][1][0], 85123)
        self.assertEqual(rows[1][1][1], "plain shared")
        self.assertEqual(rows[1][1][5], 13085.0)
        self.assertEqual(rows[1][1][6], "inline text")
        self.assertEqual(rows[2][1][:2], ["85123A", "rich runs"], "an inline string, and a shared string's rich runs joined")
        self.assertIsNone(rows[2][1][5], "no cell in column F")
        self.assertEqual(rows[2][1][6], "after a gap", "the value after an empty cell keeps its column")
        self.assertEqual(rows[3][1][1], "inline rich", "an inline string's rich runs joined")
        self.assertEqual(rows[3][1][2], 0.042)
        self.assertEqual(rows[3][1][5:], [], "styled cells with no value hold nothing")

    def test_column_conversion(self):
        path = self.book().write(self.tmp / "cells.xlsx")
        stats = xlsx.SheetStats("Cells")
        with xlsx.Workbook(path) as wb:
            recs = list(xlsx.read_records(wb, "Cells", CELL_HEADER, CELL_COLUMNS, stats=stats))
        self.assertEqual(recs[0], ("85123", "plain shared", 12.5, dt.date(2010, 12, 1), dt.datetime(2009, 12, 1, 7, 45), 13085, "inline text"))
        self.assertEqual(recs[1], ("85123A", "rich runs", -3.0, dt.date(2011, 1, 4), dt.datetime(2010, 12, 9, 16, 30), None, "after a gap"))
        self.assertEqual(recs[2], ("C489449", "inline rich", 0.042, dt.date(2009, 12, 1), dt.datetime(2009, 12, 1, 7, 45), None, None))
        self.assertIsInstance(recs[0][0], str, "a code that looks like a number reads as text")
        self.assertIsInstance(recs[0][5], int, "an ID 13085.0 reads as the whole number 13085")
        self.assertEqual((stats.header_row, stats.rows, stats.rows_after_empty), (1, 3, 0))

    def test_serials_in_the_1900_system(self):
        self.assertEqual(xlsx.to_date(1), dt.date(1900, 1, 1))
        self.assertEqual(xlsx.to_date(59), dt.date(1900, 2, 28))
        self.assertEqual(xlsx.to_date(61), dt.date(1900, 3, 1), "after Excel's 29 February 1900, which never existed")
        self.assertEqual(xlsx.to_date(40148), dt.date(2009, 12, 1))
        self.assertEqual(xlsx.to_datetime(40148.322916666664), dt.datetime(2009, 12, 1, 7, 45))
        self.assertEqual(xlsx.to_datetime(40521.6875), dt.datetime(2010, 12, 9, 16, 30))
        with self.assertRaisesRegex(ValueError, "29 February 1900"):
            xlsx.to_date(60)
        with self.assertRaisesRegex(ValueError, "time"):
            xlsx.to_date(40148.5)
        self.assertEqual(xlsx.to_text(85123.0), "85123")
        self.assertEqual(xlsx.to_text(1.5), "1.5")
        self.assertEqual(xlsx.to_int("13085"), 13085)
        with self.assertRaisesRegex(ValueError, "whole number"):
            xlsx.to_int(13085.5)

    def test_the_1904_date_system_is_refused(self):
        path = Book(date1904=True).sheet("Cells", [CELL_HEADER]).write(self.tmp / "mac.xlsx")
        with self.assertRaisesRegex(xlsx.XlsxError, "1904"):
            xlsx.Workbook(path)

    def test_header_below_a_title_row_and_a_wrong_header(self):
        rows = [["A title above the table"], None, ["x", "y"], [1, "a"], [2, "b"]]
        path = Book().sheet("Data", rows).sheet("Other", [["x", "z"], [1, "a"]]).write(self.tmp / "h.xlsx")
        cols = [xlsx.Column("x", "int"), xlsx.Column("y", "text")]
        stats = xlsx.SheetStats("Data")
        with xlsx.Workbook(path) as wb:
            self.assertEqual(list(xlsx.read_records(wb, "Data", ["x", "y"], cols, stats=stats)), [(1, "a"), (2, "b")])
            self.assertEqual(stats.header_row, 3)
            with self.assertRaisesRegex(xlsx.XlsxError, r"Other.*x, y"):
                list(xlsx.read_records(wb, "Other", ["x", "y"], cols))
            with self.assertRaisesRegex(xlsx.XlsxError, "Missing sheet"):
                list(xlsx.read_records(wb, "Missing sheet", ["x", "y"], cols))

    def test_stop_at_empty_counts_the_rows_left_behind(self):
        rows = [["x"], [1], [2], None, [3], [4]]
        path = Book().sheet("Data", rows).write(self.tmp / "e.xlsx")
        stats = xlsx.SheetStats("Data")
        with xlsx.Workbook(path) as wb:
            self.assertEqual(list(xlsx.read_records(wb, "Data", ["x"], [xlsx.Column("x", "int")], stats=stats)), [(1,), (2,)])
        self.assertEqual((stats.rows, stats.rows_after_empty), (2, 2))

    def test_a_value_beyond_the_header_is_refused(self):
        path = Book().sheet("Data", [["x"], [1, "stray"]]).write(self.tmp / "w.xlsx")
        with xlsx.Workbook(path) as wb, self.assertRaisesRegex(xlsx.XlsxError, "row 2"):
            list(xlsx.read_records(wb, "Data", ["x"], [xlsx.Column("x", "int")]))

    def test_an_entry_larger_than_the_caps_is_refused_naming_it_and_its_size(self):
        # Review M1: a zip entry's declared size is checked before it is read; the caps are lowered here, not the files raised.
        outer = zip_with(self.tmp / "outer.zip", {"folder/inner book.xlsx": self.book().bytes()})
        size = zipfile.ZipFile(outer).getinfo("folder/inner book.xlsx").file_size
        with mock.patch.object(xlsx, "MAX_HELD_BYTES", 1000), self.assertRaisesRegex(xlsx.XlsxError, rf"folder/inner book\.xlsx .*{size:,}"):
            xlsx.Workbook(outer, inside="folder/inner book.xlsx")
        long_strings = Book().sheet("Cells", [["x"], ["y" * 5000]]).write(self.tmp / "long.xlsx")   # only its shared strings are big
        with mock.patch.object(xlsx, "MAX_HELD_BYTES", 2000), self.assertRaisesRegex(xlsx.XlsxError, r"xl/sharedStrings\.xml .*bytes"):
            xlsx.Workbook(long_strings)
        path = self.book().write(self.tmp / "cells.xlsx")
        with mock.patch.object(xlsx, "MAX_STREAMED_BYTES", 50), xlsx.Workbook(path) as wb, \
                self.assertRaisesRegex(xlsx.XlsxError, r"xl/worksheets/sheet1\.xml .*bytes"):
            list(wb.rows("Cells"))

    def test_a_damaged_sheet_part_is_an_xlsx_error_naming_the_part(self):
        # Review M1: a bad CRC found while streaming is a named XlsxError, not a traceback.
        with zipfile.ZipFile(io.BytesIO(self.book().bytes())) as src:
            members = {n: src.read(n) for n in src.namelist()}
        stored = io.BytesIO()
        with zipfile.ZipFile(stored, "w", zipfile.ZIP_STORED) as z:
            for name, data in members.items():
                z.writestr(name, data)
        data = stored.getvalue()
        at = data.index(b"inline text")   # an inline string, so it sits in sheet1: change one byte, so its CRC no longer matches
        path = self.tmp / "damaged.xlsx"
        path.write_bytes(data[:at] + b"A" + data[at + 1:])
        with xlsx.Workbook(path) as wb, self.assertRaisesRegex(xlsx.XlsxError, r"xl/worksheets/sheet1\.xml"):
            list(wb.rows("Cells"))

    def test_leading_zeros_survive_in_strings_and_a_number_cell_is_its_digits(self):
        # S7-30: a code written as a string keeps its zeros, shared or inline; a number cell is a number, so its zeros were never there.
        path = Book().sheet("Codes", [["code", "n"], ["007", 1], [Inline("00123"), 2], [Raw("0045"), 3], [Raw("0045.0"), 4]]).write(self.tmp / "z.xlsx")
        with xlsx.Workbook(path) as wb:
            self.assertEqual(list(xlsx.read_records(wb, "Codes", ["code", "n"], [xlsx.Column("code", "text"), xlsx.Column("n", "int")])),
                             [("007", 1), ("00123", 2), ("45", 3), ("45", 4)])
            self.assertEqual(list(xlsx.read_records(wb, "Codes", ["code", "n"], [xlsx.Column("code", "int"), xlsx.Column("n", "int")]))[:2],
                             [(7, 1), (123, 2)], "an int column takes the digits of a string")

    def test_boolean_formula_text_error_and_iso_date_cells(self):
        # S7-30: the t="b", "str", "e" and "d" cell types, read raw and then converted by column.
        rows = [["flag", "formula", "problem", "moment"],
                [Typed("b", "1"), Typed("str", "a_x0009_b"), Typed("e", "#N/A"), Typed("d", "2010-12-01T07:45:00")],
                [Typed("b", "0"), Typed("str", "plain"), Typed("e", "#DIV/0!"), Typed("d", "2010-12-02")]]
        path = Book().sheet("Kinds", rows).write(self.tmp / "kinds.xlsx")
        with xlsx.Workbook(path) as wb:
            raw = [values for _, values in wb.rows("Kinds")][1:]
            self.assertEqual(raw[0], [True, "a\tb", "#N/A", dt.datetime(2010, 12, 1, 7, 45)])
            self.assertEqual(raw[1], [False, "plain", "#DIV/0!", dt.datetime(2010, 12, 2)])
            header = rows[0]
            text = [xlsx.Column(n, "text") for n in header[:3]] + [xlsx.Column("moment", "datetime")]
            self.assertEqual(list(xlsx.read_records(wb, "Kinds", header, text)),
                             [("TRUE", "a\tb", "#N/A", dt.datetime(2010, 12, 1, 7, 45)), ("FALSE", "plain", "#DIV/0!", dt.datetime(2010, 12, 2))])
            as_date = [xlsx.Column("flag", "text"), xlsx.Column("formula", "text"), xlsx.Column("problem", "text"), xlsx.Column("moment", "date")]
            with self.assertRaisesRegex(xlsx.XlsxError, r"Kinds.* row 2, column moment: a date with a time of day"):
                list(xlsx.read_records(wb, "Kinds", header, as_date))
            with self.assertRaisesRegex(xlsx.XlsxError, r"Kinds.* row 2, column flag: a true or false value, not a whole number"):
                list(xlsx.read_records(wb, "Kinds", header, [xlsx.Column("flag", "int")] + text[1:]))
            with self.assertRaisesRegex(xlsx.XlsxError, r"Kinds.* row 2, column problem: text, not a whole number"):
                list(xlsx.read_records(wb, "Kinds", header, text[:2] + [xlsx.Column("problem", "int"), text[3]]))

    def test_a_cell_the_reader_cannot_read_is_an_xlsx_error_naming_it(self):
        path = Book().sheet("Bad", [["x"], [Typed("d", "not a date")], [Typed("s", "99")]]).write(self.tmp / "bad.xlsx")
        with xlsx.Workbook(path) as wb, self.assertRaisesRegex(xlsx.XlsxError, r"Bad.* row 2, column 1: a cell value the reader cannot read"):
            list(wb.rows("Bad"))

    def _with_sheet_xml(self, change) -> pathlib.Path:
        """The one-sheet workbook of this test class, with its first sheet's XML passed through `change`."""
        with zipfile.ZipFile(io.BytesIO(self.book().bytes())) as src:
            members = {n: src.read(n) for n in src.namelist()}
        members["xl/worksheets/sheet1.xml"] = change(members["xl/worksheets/sheet1.xml"].decode("utf-8")).encode("utf-8")
        return zip_with(self.tmp / "changed.xlsx", members)

    def test_a_doctype_is_refused_wherever_the_prolog_puts_it(self):
        # S7-30: the guard reads the prolog up to the root element, so a comment up to the prolog limit before the DOCTYPE does not hide it.
        entity = '<!DOCTYPE worksheet [<!ENTITY a "b">]>'
        for padding in (0, 100, 5000, 60000):
            path = self._with_sheet_xml(lambda xml: xml.replace("?>\n", f"?>\n<!--{'x' * padding}-->\n{entity}\n", 1))
            with self.subTest(padding=padding), xlsx.Workbook(path) as wb, self.assertRaisesRegex(xlsx.XlsxError, r"xl/worksheets/sheet1\.xml declares a DOCTYPE"):
                list(wb.rows("Cells"))
        path = self._with_sheet_xml(lambda xml: xml.replace("?>\n", f"?>\n<?pi {'y' * 6000}?>\n{entity}\n", 1))
        with xlsx.Workbook(path) as wb, self.assertRaisesRegex(xlsx.XlsxError, "DOCTYPE"):
            list(wb.rows("Cells"))

    def test_a_long_prolog_is_refused_quickly_and_read_only_to_a_fixed_limit(self):
        # Review F2-6-1: the prolog reader took time in proportion to the square of a long comment or instruction and held it all in
        # memory. It now reads at most 64 KiB and refuses a longer prolog (no workbook part has one), in time proportional to that.
        import time
        for opening, closing in (("<!--", "-->"), ("<?pi ", "?>")):
            for size in (70000, 24_000_000):
                path = self._with_sheet_xml(lambda xml: xml.replace("?>\n", f"?>\n{opening}{'x' * size}{closing}\n", 1))
                with self.subTest(opening=opening, size=size), xlsx.Workbook(path) as wb:
                    started = time.perf_counter()
                    with self.assertRaisesRegex(xlsx.XlsxError, r"xl/worksheets/sheet1\.xml.*prolog"):
                        list(wb.rows("Cells"))
                    self.assertLess(time.perf_counter() - started, 1.0, "the prolog reader is bounded")

    def test_a_doctype_in_another_part_is_refused_when_the_workbook_opens(self):
        with zipfile.ZipFile(io.BytesIO(self.book().bytes())) as src:
            members = {n: src.read(n) for n in src.namelist()}
        members["xl/sharedStrings.xml"] = members["xl/sharedStrings.xml"].replace(b"?>", b"?>\n<!--" + b"x" * 5000 + b'-->\n<!DOCTYPE sst [<!ENTITY a "b">]>', 1)
        with self.assertRaisesRegex(xlsx.XlsxError, r"xl/sharedStrings\.xml declares a DOCTYPE"):
            xlsx.Workbook(zip_with(self.tmp / "sst.xlsx", members))

    def test_text_that_looks_like_a_doctype_is_no_prolog(self):
        # A literal "<!DOCTYPE" inside a CDATA section, in the first 4,096 bytes or after a long comment, is not a declaration.
        text = "<!DOCTYPE inside a cdata section>"
        for padding in (0, 5000):
            path = self._with_sheet_xml(lambda xml: xml.replace("?>\n", f"?>\n<!--{'x' * padding}-->\n", 1).replace(
                "<sheetData>", f'<sheetData><row r="9"><c r="A9" t="inlineStr"><is><t><![CDATA[{text}]]></t></is></c></row>', 1))
            with self.subTest(padding=padding), xlsx.Workbook(path) as wb:
                self.assertEqual([values for r, values in wb.rows("Cells") if r == 9], [[text]])
                self.assertEqual(len(list(wb.rows("Cells"))), 5)

    def test_a_workbook_inside_a_zip_is_read_without_unpacking(self):
        outer = zip_with(self.tmp / "outer.zip", {"folder/inner book.xlsx": self.book().bytes()})
        with xlsx.Workbook(outer, inside="folder/inner book.xlsx") as wb:
            self.assertEqual(len(list(wb.rows("Cells"))), 4)
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir()), ["outer.zip"], "nothing unpacked beside it")


# ---- the two Excel datasets -------------------------------------------------------------------------------------------------

ORII_HEADER = ["Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price", "Customer ID", "Country"]
DEC_A = [538001, "90001B", "GREEN ENAMEL MUG", 4, dt.datetime(2010, 12, 1, 9, 0), 1.25, Raw("17001.0"), "United Kingdom"]
DEC_B = [538002, 90002, "TIN TEA SET", 2, dt.datetime(2010, 12, 9, 16, 30), 4.95, 12001, "France"]
SHEET_2009 = [ORII_HEADER,
              [489001, Inline("90001B"), "GREEN ENAMEL MUG", 12, dt.datetime(2009, 12, 1, 7, 45), 6.95, Raw("13001.0"), "United Kingdom"],
              [489002, 90003, "RED ENAMEL MUG", 6, dt.datetime(2010, 11, 30, 10, 0), 2.55, None, "France"],
              DEC_A, DEC_B, DEC_B,
              ["C538003", "90001B", "GREEN ENAMEL MUG", -1, dt.datetime(2010, 12, 2, 11, 0), 1.25, 17001, "United Kingdom"]]
SHEET_2010 = [ORII_HEADER, DEC_A, DEC_B,
              [538010, "POST", "POSTAGE", 1, dt.datetime(2010, 12, 5, 12, 0), 18.0, 12001, "France"],
              [540001, 90003, "RED ENAMEL MUG", 3, dt.datetime(2011, 1, 4, 8, 0), 2.55, 13001, "United Kingdom"]]


def orii_workbook() -> bytes:
    return Book().sheet("Year 2009-2010", SHEET_2009).sheet("Year 2010-2011", SHEET_2010).bytes()


def orii_zip(folder: pathlib.Path) -> pathlib.Path:
    return zip_with(folder / "online+retail+ii.zip", {"online_retail_II.xlsx": orii_workbook()})


BAF_T = ["WEEK_END_DATE", "STORE_NUM", "UPC", "UNITS", "VISITS", "HHS", "SPEND", "PRICE", "BASE_PRICE", "FEATURE", "DISPLAY", "TPR_ONLY"]
BAF_P = ["UPC", "DESCRIPTION", "MANUFACTURER", "CATEGORY", "SUB_CATEGORY", "PRODUCT_SIZE"]
BAF_S = ["STORE_ID", "STORE_NAME", "ADDRESS_CITY_NAME", "ADDRESS_STATE_PROV_CODE", "MSA_CODE", "SEG_VALUE_NAME",
         "PARKING_SPACE_QTY", "SALES_AREA_SIZE_NUM", "AVG_WEEKLY_BASKETS"]
BAF_INSIDE = "dunnhumby_Breakfast-at-the-Frat/dunnhumby - Breakfast at the Frat.xlsx"


def baf_workbook() -> bytes:
    return (Book()
            .sheet("dh Transaction Data", [["Invented title row above the header"], None, BAF_T,
                                           [dt.date(2009, 1, 14), 101, 9000000001, 13, 12, 11, 18.07, 1.39, 1.57, 0, 0, 1],
                                           [dt.date(2009, 1, 14), 102, 9000000002, 20, 18, 17, 27.8, 1.39, 1.39, 0, 1, 0],
                                           [dt.date(2009, 1, 21), 101, 9000000001, 5, 5, 5, 6.95, 1.39, 1.39, 1, 0, 0],
                                           [dt.date(2009, 1, 21), 999, 9000000001, 2, 2, 2, 2.78, 1.39, 1.39, 0, 0, 0],
                                           None, [dt.date(2009, 1, 28), 101, 9000000001, 1, 1, 1, 1.39, 1.39, 1.39, 0, 0, 0]])
            .sheet("dh Products Lookup", [BAF_P,
                                          [9000000001, "INVENTED PRETZELS", "MAKER ONE", "BAG SNACKS", "PRETZELS", "15 OZ"],
                                          [9000000002, "INVENTED CEREAL", "MAKER TWO", "COLD CEREAL", "ALL FAMILY CEREAL", "12 OZ"],
                                          [9000000003, "INVENTED MOUTHWASH", "MAKER ONE", "ORAL HYGIENE PRODUCTS", "MOUTHWASHES", "500 ML"]])
            .sheet("dh Store Lookup", [BAF_S,
                                       [101, "STORE ONE", "TOWN ONE", "OH", 17140, "VALUE", 196, 24721, 12707],
                                       [102, "STORE TWO", "TOWN TWO", "KY", 17140, "UPSCALE", None, 46073, Raw("24766.5")]])
            .bytes())


def baf_zip(folder: pathlib.Path) -> pathlib.Path:
    return zip_with(folder / "dunnhumby_Breakfast-at-the-Frat.zip",
                    {BAF_INSIDE: baf_workbook(), "dunnhumby_Breakfast-at-the-Frat/user guide.pdf": b"%PDF-1.4 invented"})


def source_for(path, inside=None, schema="x"):
    return prep.Source(name=path.name, path=path, inside=inside, sha256="0" * 64, expected="0" * 64, fingerprint="matches")


class OnlineRetail(TempDir):
    def test_both_sheets_read_and_the_december_2010_overlap_removed_and_counted(self):
        out = self.tmp / "out"
        out.mkdir()
        result = orii.prepare("online_retail_ii", source_for(orii_zip(self.tmp), "online_retail_II.xlsx"), out)
        checks = result["checks"]
        self.assertEqual([(s["sheet"], s["rows"]) for s in checks["sheets"]], [("Year 2009-2010", 6), ("Year 2010-2011", 4)])
        self.assertEqual(checks["overlap_removed"], 2, "the two December 2010 rows repeated in the second sheet (E-068)")
        self.assertEqual(result["tables"], {"invoice_lines": 8})
        self.assertFalse(checks["published_rows"]["ok"], "a fixture is not the published 525,461 and 541,910 rows")
        self.assertTrue(any("525,461" in w for w in result["warnings"]))
        table = pq.read_table(out / "invoice_lines.parquet")
        self.assertEqual(table.schema, pa.schema([("invoice", pa.string()), ("stock_code", pa.string()), ("description", pa.string()),
                                                  ("quantity", pa.int32()), ("invoice_date", pa.timestamp("us")), ("price", pa.float64()),
                                                  ("customer_id", pa.int32()), ("country", pa.string())]))
        rows = table.to_pylist()
        decb = [r for r in rows if r["invoice"] == "538002"]
        self.assertEqual(len(decb), 2, "a row repeated inside one sheet is kept: only the copy in the other sheet goes")
        self.assertEqual(sorted({r["stock_code"] for r in rows}), ["90001B", "90002", "90003", "POST"], "codes are text")
        self.assertEqual({r["customer_id"] for r in rows}, {13001, 17001, 12001, None})
        self.assertIn("C538003", {r["invoice"] for r in rows})

    def test_a_workbook_with_other_sheets_is_refused(self):
        wb = Book().sheet("Year 2009-2010", SHEET_2009).write(self.tmp / "one.xlsx")
        with self.assertRaisesRegex(PrepError, "two sheets"):
            orii.prepare("online_retail_ii", source_for(wb), self.tmp)


class BreakfastAtTheFrat(TempDir):
    def test_three_sheets_the_header_check_and_the_store_join(self):
        out = self.tmp / "out"
        out.mkdir()
        result = baf.prepare("breakfast_at_the_frat", source_for(baf_zip(self.tmp), BAF_INSIDE), out)
        self.assertEqual(result["tables"], {"transactions": 4, "products": 3, "stores": 2})
        checks = result["checks"]
        sheets = {s["sheet"]: s for s in checks["sheets"]}
        self.assertEqual(sheets["dh Transaction Data"]["header_row"], 3, "E-028: the header sits below a title row")
        self.assertEqual(sheets["dh Transaction Data"]["rows_after_empty"], 1, "E-028: read up to the first empty row")
        self.assertEqual(checks["store_join"], {"store_nums_in_sales": 3, "store_ids_in_lookup": 2,
                                                "sales_store_nums_missing_from_lookup": 1, "ok": False})
        self.assertEqual(checks["products"], {"upcs_in_sales": 2, "products_in_lookup": 3, "sales_upcs_missing_from_lookup": 0})
        self.assertTrue(any("STORE_NUM" in w for w in result["warnings"]), "E-074: a store number missing from the lookup warns")
        t = pq.read_table(out / "transactions.parquet")
        self.assertEqual(t.column_names, ["week_end_date", "store_num", "upc", "units", "visits", "hhs", "spend", "price",
                                          "base_price", "feature", "display", "tpr_only"])
        self.assertEqual(t.schema.field("week_end_date").type, pa.date32())
        self.assertEqual(t.schema.field("upc").type, pa.string(), "a UPC is a code: text")
        self.assertEqual(t.column("upc").to_pylist()[0], "9000000001")
        stores = pq.read_table(out / "stores.parquet").to_pylist()
        self.assertEqual([s["parking_space_qty"] for s in stores], [196, None])
        self.assertEqual([s["msa_code"] for s in stores], ["17140", "17140"])

    def test_the_store_notes_say_two_stores_are_listed_twice(self):
        # The real store lookup has 79 rows for 77 store IDs: two stores appear twice, each with another price tier. The notes
        # must not call store_id a key, and must say a join on it repeats those stores' rows.
        grain, pk, _, cols = baf.NOTES["stores"]
        self.assertEqual(pk, [], "store_id is not unique in the real lookup")
        self.assertIn("listed twice", grain)
        self.assertIn("listed twice", cols["store_id"])
        self.assertIn("repeats", cols["store_id"])
        # F4 seams M1: the sales' link to stores is not one row there to many here, so the panel shows no 1:N link to stores; the
        # store_num note says how the join behaves instead.
        _, _, fks, sale_cols = baf.NOTES["transactions"]
        self.assertEqual([f["ref_table"] for f in fks], ["products"])
        self.assertIn("listed twice", sale_cols["store_num"])

    def test_a_changed_header_stops_the_prep_naming_the_sheet(self):
        bad = Book().sheet("dh Transaction Data", [BAF_T[:-1] + ["TPR"]]).sheet("dh Products Lookup", [BAF_P]).sheet("dh Store Lookup", [BAF_S])
        with self.assertRaisesRegex(xlsx.XlsxError, "dh Transaction Data"):
            baf.prepare("breakfast_at_the_frat", source_for(bad.write(self.tmp / "b.xlsx")), self.tmp)


# ---- the 8 Week SQL Challenge loader (S6-22, S6-39, D87) -------------------------------------------------------------------

class WeekChallengeLoader(TempDir):
    def test_split_respects_quotes_and_comments(self):
        statements = wsc.split_statements((FIXTURES / "wsc_loads.sql").read_text(encoding="utf-8"))
        self.assertEqual(len(statements), 6)
        self.assertTrue(statements[-1].rstrip().endswith("('2', 'chef''s stew', '12')"))
        self.assertIn("'beans; on toast'", statements[-1])

    def test_a_script_loads_with_search_path_skipped_and_its_schema_the_default(self):
        con, summary = wsc.load((FIXTURES / "wsc_loads.sql").read_text(encoding="utf-8"), "tiny_bistro", "wsc_loads.sql")
        self.addCleanup(con.close)
        self.assertEqual(con.execute("SELECT schema_name, table_name FROM duckdb_tables() ORDER BY 2").fetchall(),
                         [("tiny_bistro", "dishes"), ("tiny_bistro", "visits")])
        self.assertEqual(con.execute("SELECT dish_name FROM tiny_bistro.dishes ORDER BY dish_id").fetchall(),
                         [("beans; on toast",), ("chef's stew",)])
        self.assertEqual(summary["skipped"], {"SET search_path": 1})
        self.assertEqual(summary["run"], 5)

    def test_postgres_edits_float_as_double_drop_skipped_and_own_updates(self):
        con, summary = wsc.load((FIXTURES / "wsc_edits.sql").read_text(encoding="utf-8"), "tiny_panels", "wsc_edits.sql")
        self.addCleanup(con.close)
        types = dict(con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'readings'").fetchall())
        self.assertEqual((types["share"], types["score"]), ("DOUBLE", "DOUBLE"), "PostgreSQL's FLOAT is 8 bytes (E-198)")
        self.assertEqual(con.execute("SELECT share FROM tiny_panels.readings WHERE panel_id = '501'").fetchone()[0], 0.1)
        self.assertEqual(con.execute("SELECT count(*) FILTER (month_label IS NULL), count(*) FILTER (panel_id IS NULL) "
                                     "FROM tiny_panels.readings").fetchone(), (2, 1))
        self.assertEqual(summary["skipped"], {"DROP TABLE IF EXISTS": 1})
        self.assertEqual(summary["edited"], {"FLOAT as DOUBLE": 2})
        self.assertEqual(summary["updates"], 3)

    def test_refused_statements_name_their_first_word_and_nothing_runs(self):
        spied = []
        real_connect = duckdb.connect

        def spy(*args, **kwargs):
            spied.append(kwargs.get("config"))
            return real_connect(*args, **kwargs)

        with mock.patch("duckdb.connect", spy), self.assertRaisesRegex(PrepError, r"statement 3 \(COPY\)"):
            wsc.load((FIXTURES / "wsc_refused.sql").read_text(encoding="utf-8"), "tiny_refused", "wsc_refused.sql")
        self.assertEqual(spied, [], "a refused script is refused before a database is opened")
        head = "CREATE SCHEMA tiny_x;\nCREATE TABLE tiny_x.t (\"n\" INTEGER);\n"
        for statement, word in [("ATTACH 'elsewhere.duckdb' AS other", "ATTACH"),
                                ("INSTALL httpfs", "INSTALL"),
                                ("LOAD httpfs", "LOAD"),
                                ("INSERT INTO tiny_x.t SELECT * FROM read_csv('numbers.csv')", "INSERT"),
                                ("INSERT INTO tiny_x.t VALUES ((SELECT count(*) FROM read_csv('numbers.csv')))", "INSERT"),
                                ("SELECT * FROM read_csv('numbers.csv')", "SELECT"),
                                ("SET enable_external_access = true", "SET"),
                                ("CREATE TABLE tiny_x.u AS SELECT 1 AS n", "CREATE"),
                                ("CREATE VIEW tiny_x.v AS SELECT 1 AS n", "CREATE"),
                                ("UPDATE other_schema.t SET n = 1", "UPDATE"),
                                ("INSERT INTO other_schema.t VALUES (1)", "INSERT"),
                                ("PRAGMA version", "PRAGMA"),
                                # Review I1: the whole shape after the head is checked, not only the head.
                                ("CREATE TABLE tiny_x.u (n) AS SELECT 1", "CREATE"),
                                ("CREATE TABLE tiny_x.u (n) AS FROM range(4)", "CREATE"),
                                ("INSERT INTO tiny_x.t VALUES (1) UNION ALL SELECT 2", "INSERT"),
                                ("INSERT INTO tiny_x.t VALUES (1) UNION ALL FROM range(3)", "INSERT"),
                                ("INSERT INTO tiny_x.t VALUES ((SELECT count(*) FROM range(10)))", "INSERT"),
                                ("INSERT INTO tiny_x.t VALUES (1), (2) RETURNING n", "INSERT"),
                                ("UPDATE tiny_x.t SET n = (SELECT 1)", "UPDATE"),
                                ("UPDATE tiny_x.t SET n = 1 FROM range(3)", "UPDATE")]:
            with self.subTest(word=word, statement=statement), self.assertRaisesRegex(PrepError, rf"statement 3 \({word}\)"):
                wsc.load(head + statement + ";\n", "tiny_x", "made.sql")
        with self.assertRaisesRegex(PrepError, "tiny_y"):
            wsc.load("CREATE SCHEMA tiny_y;", "tiny_x", "made.sql")

    def test_select_and_from_inside_strings_or_quoted_names_still_load(self):
        script = ('CREATE SCHEMA tiny_x;\nCREATE TABLE tiny_x.t ("from" VARCHAR(20), "n" INTEGER, "at" TIMESTAMP);\n'
                  "INSERT INTO tiny_x.t (\"from\", \"n\", \"at\") VALUES ('SELECT * FROM x', -1, '2020-01-01 18:15:34'),\n"
                  "  ('b', 2, NULL), ('c', CAST('3' AS INTEGER), '2020-01-02 00:00:00');\n"
                  "UPDATE tiny_x.t SET \"from\" = NULL WHERE \"from\" = 'b';\n")
        con, summary = wsc.load(script, "tiny_x", "made.sql")
        self.addCleanup(con.close)
        self.assertEqual(con.execute('SELECT count(*), count("from") FROM tiny_x.t').fetchone(), (3, 2))
        self.assertEqual((summary["run"], summary["updates"]), (4, 1))

    def test_external_access_is_off_during_the_run(self):
        spied = []
        real_connect = duckdb.connect

        def spy(*args, **kwargs):
            spied.append(kwargs.get("config"))
            return real_connect(*args, **kwargs)

        with mock.patch("duckdb.connect", spy):
            con, _ = wsc.load((FIXTURES / "wsc_loads.sql").read_text(encoding="utf-8"), "tiny_bistro", "wsc_loads.sql")
        self.addCleanup(con.close)
        self.assertEqual(len(spied), 1)
        self.assertEqual({k: spied[0][k] for k in ("autoinstall_known_extensions", "autoload_known_extensions", "enable_external_access")},
                         {**NO_NETWORK, "enable_external_access": False})
        self.assertEqual(con.execute("SELECT current_setting('enable_external_access'), current_setting('TimeZone')").fetchone(), (False, "UTC"))
        (self.tmp / "numbers.csv").write_text("n\n1\n", encoding="utf-8")
        with self.assertRaises(duckdb.PermissionException):
            con.execute(f"SELECT * FROM read_csv('{(self.tmp / 'numbers.csv').as_posix()}')")

    def test_prepare_exports_each_table_to_parquet(self):
        out = self.tmp / "out"
        out.mkdir()
        result = wsc.prepare("tiny_bistro", source_for(FIXTURES / "wsc_loads.sql"), out)
        self.assertEqual(result["tables"], {"dishes": 2, "visits": 3})
        self.assertEqual(sorted(p.name for p in out.iterdir()), ["dishes.parquet", "visits.parquet"])
        self.assertEqual(pq.read_table(out / "visits.parquet").schema.field("visit_date").type, pa.date32())


# ---- the prep command (S6-22) -------------------------------------------------------------------------------------------------

def registry(**sha_of) -> dict:
    """The committed registry, with a file's fingerprint replaced where a test names it ({file name: sha256})."""
    data = json.loads(REGISTRY.read_text(encoding="utf-8"))
    for record in data["datasets"]:
        for f in record["files"]:
            f["sha256"] = sha_of.get(f["name"], f["sha256"])
    return data


def snapshot(folder: pathlib.Path) -> dict:
    return {p.relative_to(folder).as_posix(): (p.stat().st_size, sha(p)) for p in folder.rglob("*") if p.is_file()}


class PrepCommand(TempDir):
    def setUp(self):
        super().setUp()
        self.downloads = self.tmp / "downloads"
        self.data = self.tmp / "data"
        self.downloads.mkdir()
        self.data.mkdir()
        (self.data / "course.duckdb").write_bytes(b"the controller's database, untouched")

    def run_prep(self, reg: dict, *args):
        path = self.tmp / "registry.json"
        path.write_text(json.dumps(reg), encoding="utf-8")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = prep.main(["--from", str(self.downloads), "--data", str(self.data), "--registry", str(path), *args])
        return code, out.getvalue()

    def test_a_matching_fingerprint_prepares_into_data_real_and_nothing_else(self):
        zip_path = orii_zip(self.downloads)
        before_downloads = snapshot(self.downloads)
        before_data = snapshot(self.data)
        code, out = self.run_prep(registry(**{"online+retail+ii.zip": sha(zip_path)}), "--only", "DS-RETAIL-02")
        self.assertEqual(code, 0, out)
        # Review M4: the checks are printed, counts only.
        self.assertIn("DS-RETAIL-02 checks (online_retail_ii): sheets 6 and 4 rows; overlap removed 2; rows written 8", out)
        self.assertEqual(snapshot(self.downloads), before_downloads, "the download is read, never changed or unpacked")
        after = snapshot(self.data)
        new = {p for p in after if p not in before_data or after[p] != before_data[p]}
        self.assertEqual(new, {"real/online_retail_ii/invoice_lines.parquet", "real/online_retail_ii/prep.json"})
        self.assertEqual(sorted(p.name for p in (self.data / "real").iterdir()), ["online_retail_ii"], "no work folder is left")
        info = json.loads((self.data / "real" / "online_retail_ii" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual(info["dataset"], "DS-RETAIL-02")
        self.assertEqual(info["schema"], "online_retail_ii")
        self.assertEqual(info["source"], {"file": "online+retail+ii.zip", "inside": "online_retail_II.xlsx", "found": "online+retail+ii.zip",
                                          "sha256": sha(zip_path), "expected_sha256": sha(zip_path), "fingerprint": "matches"})
        self.assertEqual(info["tables"], {"invoice_lines": 8})
        self.assertEqual(info["checks"]["overlap_removed"], 2)
        self.assertTrue(info["real"])
        self.assertRegex(info["prepared_at"], r"^\d{4}-\d{2}-\d{2}T")
        self.assertNotIn(self.tmp.name, json.dumps(info), "prep.json names files, never the folder they came from")

    def test_a_differing_fingerprint_warns_records_it_and_goes_on(self):
        zip_path = baf_zip(self.downloads)
        code, out = self.run_prep(registry(), "--only", "DS-PRICE-101")
        self.assertEqual(code, 0, out)
        self.assertRegex(out, r"WARN DS-PRICE-101 .*dunnhumby_Breakfast-at-the-Frat\.zip.*fingerprint")
        self.assertIn("DS-PRICE-101 checks (breakfast_at_the_frat): transactions 4, products 3, stores 2 rows; store join: "
                      "3 store numbers in the sales, 2 in the store lookup, 1 missing; products: 2 UPCs in the sales, "
                      "3 in the lookup, 0 missing", out)
        info = json.loads((self.data / "real" / "breakfast_at_the_frat" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual(info["source"]["fingerprint"], "differs")
        self.assertEqual(info["source"]["sha256"], sha(zip_path))
        self.assertNotEqual(info["source"]["expected_sha256"], sha(zip_path))
        self.assertEqual(info["tables"], {"transactions": 4, "products": 3, "stores": 2})

    def test_the_unzipped_workbook_is_found_too(self):
        (self.downloads / "online_retail_II.xlsx").write_bytes(orii_workbook())
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-02")
        self.assertEqual(code, 0, out)
        info = json.loads((self.data / "real" / "online_retail_ii" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((info["source"]["found"], info["source"]["inside"], info["source"]["fingerprint"]),
                         ("online_retail_II.xlsx", None, "unzipped"))

    def test_a_missing_file_names_the_expected_name_and_the_dataset(self):
        code, out = self.run_prep(registry(), "--only", "DS-PRICE-101")
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"DS-PRICE-101 Breakfast at the Frat: dunnhumby_Breakfast-at-the-Frat\.zip .*not in")
        self.assertFalse((self.data / "real" / "breakfast_at_the_frat").exists())
        code, out = self.run_prep(registry(), "--only", "DS-NOPE-01")
        self.assertEqual(code, 2, out)
        self.assertIn("DS-RETAIL-02", out, "an unknown ID lists the registry's IDs")

    def test_the_challenge_scripts_are_found_in_their_folder_by_id_or_alias(self):
        folder = self.downloads / "8-week-sql-challenge"
        folder.mkdir()
        script = (FIXTURES / "wsc_loads.sql").read_text(encoding="utf-8").replace("tiny_bistro", "foodie_fi")
        (folder / "case-study-3-foodie-fi.sql").write_text(script, encoding="utf-8")
        code, out = self.run_prep(registry(), "--only", "DS-SAAS-04")
        self.assertEqual(code, 0, out)
        self.assertRegex(out, r"CH-01 8 Week SQL Challenge: case-study-1-dannys-diner\.sql .*not in")
        self.assertEqual(sorted(p.name for p in (self.data / "real").iterdir()), ["foodie_fi"])
        info = json.loads((self.data / "real" / "foodie_fi" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((info["dataset"], info["real"], info["tables"]), ("CH-01", False, {"dishes": 2, "visits": 3}))
        self.assertEqual(info["checks"]["statements"]["skipped"], {"SET search_path": 1})
        self.assertIn("CH-01 checks (foodie_fi): statements run 5; skipped SET search_path 1; FLOAT as DOUBLE 0; UPDATEs 0", out)

    def test_a_failed_prep_leaves_the_last_prepared_copy(self):
        orii_zip(self.downloads)
        self.assertEqual(self.run_prep(registry(), "--only", "DS-RETAIL-02")[0], 0)
        before = snapshot(self.data)
        (self.downloads / "online+retail+ii.zip").unlink()
        zip_with(self.downloads / "online+retail+ii.zip", {"online_retail_II.xlsx": Book().sheet("Only one", [ORII_HEADER]).bytes()})
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-02")
        self.assertEqual(code, 1, out)
        self.assertIn("two sheets", out)
        self.assertEqual(snapshot(self.data), before, "the earlier prepared copy stays, and no work folder is left")

    def test_a_failed_swap_restores_the_last_prepared_copy(self):
        # Review M3: the old copy is moved aside, not removed, until the new one is in place.
        orii_zip(self.downloads)
        self.assertEqual(self.run_prep(registry(), "--only", "DS-RETAIL-02")[0], 0)
        before = snapshot(self.data)
        original = pathlib.Path.rename

        def locked(path, target):
            if path.name.endswith(".work"):
                raise PermissionError("the folder is in use")
            return original(path, target)

        with mock.patch.object(pathlib.Path, "rename", locked):
            code, out = self.run_prep(registry(), "--only", "DS-RETAIL-02")
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL DS-RETAIL-02 Online Retail II: online_retail_ii was not prepared", out)
        self.assertEqual(snapshot(self.data), before)
        self.assertEqual(sorted(p.name for p in (self.data / "real").iterdir()), ["online_retail_ii"], "no .old or .work folder")

    def test_names_and_paths_are_checked_before_anything_is_touched(self):
        # Review M3: a registry schema `..` would make data/real/.. the folder to replace; it is refused first.
        orii_zip(self.downloads)
        before = snapshot(self.data)
        for change, why in ((lambda r: r["schemas"][0].__setitem__("name", ".."), "not a plain schema name"),
                            (lambda r: r["files"][0].__setitem__("name", "../online+retail+ii.zip"), "not a plain file name"),
                            (lambda r: r["files"][0].__setitem__("inside", "C:/online_retail_II.xlsx"), "not a path inside the zip"),
                            (lambda r: r["files"][0].__setitem__("inside", "../online_retail_II.xlsx"), "not a path inside the zip")):
            reg = registry()
            change(reg["datasets"][0])
            with self.subTest(why=why):
                code, out = self.run_prep(reg, "--only", "DS-RETAIL-02")
                self.assertEqual(code, 1, out)
                self.assertIn(f"FAIL DS-RETAIL-02", out)
                self.assertIn(why, out)
                self.assertEqual(snapshot(self.data), before, "nothing removed or written")
                real = self.data / "real"
                self.assertEqual([p.name for p in real.iterdir()] if real.exists() else [], [])

    def test_any_other_error_is_a_fail_line_and_the_next_dataset_still_runs(self):
        # Review M1: an error that is not a PrepError or an XlsxError fails its dataset only.
        orii_zip(self.downloads)
        baf_zip(self.downloads)
        with mock.patch.object(orii, "prepare", side_effect=RuntimeError("an invented failure")):
            code, out = self.run_prep(registry())
        self.assertEqual(code, 1, out)
        self.assertIn("FAIL DS-RETAIL-02 Online Retail II: online_retail_ii was not prepared (RuntimeError", out)
        self.assertIn("DS-PRICE-101 Breakfast at the Frat: breakfast_at_the_frat prepared", out)
        self.assertTrue((self.data / "real" / "breakfast_at_the_frat" / "prep.json").is_file())
        self.assertFalse((self.data / "real" / "online_retail_ii").exists())


# ---- the real datasets' edge schemas (S6-23): our own rows, the prepared tables' names and columns -------------------------

def fresh():
    con = duckdb.connect(":memory:", config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    return con


class RealEdgeSchemas(TempDir):
    def columns(self, con, schema, table):
        return con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? "
                           "ORDER BY ordinal_position", [schema, table]).fetchall()

    def parquet_columns(self, con, path):
        return [(r[0], r[1]) for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{path.as_posix()}')").fetchall()]

    def test_each_edge_schema_builds_alone_with_the_prepared_tables_columns(self):
        orii_out, baf_out = self.tmp / "orii", self.tmp / "baf"
        orii_out.mkdir()
        baf_out.mkdir()
        orii.prepare("online_retail_ii", source_for(orii_zip(self.tmp), "online_retail_II.xlsx"), orii_out)
        baf.prepare("breakfast_at_the_frat", source_for(baf_zip(self.tmp), BAF_INSIDE), baf_out)
        con = fresh()
        self.addCleanup(con.close)
        for name in ("online_retail_ii_edge", "breakfast_at_the_frat_edge"):
            con.execute((EDGE / f"{name}.sql").read_text(encoding="utf-8"))
        for schema, out in (("online_retail_ii_edge", orii_out), ("breakfast_at_the_frat_edge", baf_out)):
            tables = sorted(r[0] for r in con.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ?", [schema]).fetchall())
            self.assertEqual(tables, sorted(p.stem for p in out.glob("*.parquet")), schema)
            for t in tables:
                self.assertEqual(self.columns(con, schema, t), self.parquet_columns(con, out / f"{t}.parquet"), f"{schema}.{t}")
                self.assertTrue(1 <= con.execute(f"SELECT count(*) FROM {schema}.{t}").fetchone()[0] <= 40, f"{schema}.{t}")
        self.assertEqual(con.execute("SELECT count(*) FROM duckdb_views() WHERE NOT internal").fetchone()[0], 0, "no view, no data literal")

    def test_the_planted_rows(self):
        con = fresh()
        self.addCleanup(con.close)
        for name in ("online_retail_ii_edge", "breakfast_at_the_frat_edge"):
            con.execute((EDGE / f"{name}.sql").read_text(encoding="utf-8"))
        one = lambda sql: con.execute(sql).fetchone()[0]   # noqa: E731
        r = "online_retail_ii_edge.invoice_lines"
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {r} WHERE invoice LIKE 'C%' AND quantity < 0"), 1, "a cancellation invoice")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {r} WHERE customer_id IS NULL"), 1, "a missing customer")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {r} WHERE quantity < 0 AND invoice NOT LIKE 'C%'"), 1, "a negative quantity")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {r} WHERE stock_code = 'POST'"), 1, "a postage code")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM (SELECT count(*) FROM {r} GROUP BY ALL HAVING count(*) > 1)"), 1, "a duplicate row")
        b = "breakfast_at_the_frat_edge"
        weeks = one(f"SELECT date_diff('day', min(week_end_date), max(week_end_date)) // 7 + 1 - count(DISTINCT week_end_date) "
                    f"FROM {b}.transactions")
        self.assertGreaterEqual(weeks, 1, "a week with no sales")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {b}.transactions WHERE store_num NOT IN (SELECT store_id FROM {b}.stores)"), 1,
                                "a store missing from the lookup")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {b}.transactions WHERE tpr_only = 1 AND feature = 1"), 1,
                                "a TPR row that is also featured")


# ---- Stage B: the data build imports what the prep wrote (S6-23, ruling P38) ----------------------------------------------------

PREPARED = ("online_retail_ii", "foodie_fi", "olist", "maven_toy_store")   # sprint 8 Part 2 (Task D1): Olist and Maven Toy Store
REAL_EDGES = {"online_retail_ii_edge": ("invoice_lines",), "breakfast_at_the_frat_edge": ("products", "stores", "transactions"),
              # Task D1 (S8-16): the two dataset edge schemas, our own rows, built with or without the downloads (fixtures below).
              "olist_edge": ("customers", "order_items", "order_payments", "order_reviews", "orders", "product_category_name_translation",
                             "products", "sellers"),
              "maven_toy_store_edge": ("order_item_refunds", "order_items", "orders", "products", "website_pageviews", "website_sessions")}


class Recorder:
    """A build connection that records every SQL text it runs, so a test can see each file the build reads."""

    def __init__(self, con, log):
        self._con, self._log = con, log

    def execute(self, sql, *args, **kwargs):
        self._log.append(sql)
        return self._con.execute(sql, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._con, name)


class RealDataBuild(unittest.TestCase):
    """Two builds into temporary folders: one with no data/real/ (as on a machine where nothing is prepared), and one after the prep
    ran on fixture downloads (Online Retail II, one 8 Week SQL Challenge script, and since Task D1 Olist's and Maven Toy Store's
    zips), with a folder no registry dataset names in data/real/ and a copy of a prepared dataset outside it, neither of which may
    be read."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = pathlib.Path(tempfile.mkdtemp())
        downloads = cls.tmp / "downloads"
        (downloads / "8-week-sql-challenge").mkdir(parents=True)
        orii_zip(downloads)
        olist_zip(downloads, "archive (2).zip")   # Task D1: as the owner's browser saved it
        maven_zip(downloads)
        script = (FIXTURES / "wsc_loads.sql").read_text(encoding="utf-8").replace("tiny_bistro", "foodie_fi")
        (downloads / "8-week-sql-challenge" / "case-study-3-foodie-fi.sql").write_text(script, encoding="utf-8")
        cls.with_dir = cls.tmp / "with"
        with contextlib.redirect_stdout(io.StringIO()):
            assert prep.main(["--from", str(downloads), "--data", str(cls.with_dir)]) == 0
        real = cls.with_dir / "real"
        shutil.copytree(real / "online_retail_ii", real / "not_in_registry")        # a folder no registry dataset names
        shutil.copytree(real / "online_retail_ii", cls.with_dir / "online_retail_ii")  # a prepared copy outside data/real/
        cls.sql = []
        real_connect = duckdb.connect

        def recording(*args, **kwargs):
            return Recorder(real_connect(*args, **kwargs), cls.sql)

        with mock.patch("duckdb.connect", recording):
            cls.with_manifest = build_course_db.build(cls.with_dir / "course.duckdb", data_dir=cls.with_dir)
        cls.without_dir = cls.tmp / "without"
        cls.without_manifest = build_course_db.build(cls.without_dir / "course.duckdb", data_dir=cls.without_dir)
        cls.cons = {}
        for name, folder in (("with", cls.with_dir), ("without", cls.without_dir)):
            con = duckdb.connect(str(folder / "course.duckdb"), read_only=True, config=NO_NETWORK)
            con.execute("SET TimeZone = 'UTC'")
            cls.cons[name] = con
        print(f"\n[G2 build] dataset_version {cls.with_manifest['dataset_version']}", file=sys.stderr)

    @classmethod
    def tearDownClass(cls):
        for con in cls.cons.values():
            con.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def read(self, folder, name):
        return json.loads((folder / name).read_text(encoding="utf-8"))

    def schemas(self, which):
        return {r[0] for r in self.cons[which].execute("SELECT schema_name FROM information_schema.schemata").fetchall()}

    def test_a_prepared_dataset_becomes_a_schema_with_notes(self):
        con = self.cons["with"]
        self.assertTrue(set(PREPARED) <= self.schemas("with"))
        self.assertNotIn("not_in_registry", self.schemas("with"))
        self.assertEqual(con.execute("SELECT count(*) FROM online_retail_ii.invoice_lines").fetchone()[0], 8)
        self.assertEqual(con.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = 'foodie_fi' ORDER BY 1").fetchall(),
                         [("dishes",), ("visits",)])
        parquet = self.with_dir / "real" / "online_retail_ii" / "invoice_lines.parquet"
        described = [(r[0], r[1]) for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{parquet.as_posix()}')").fetchall()]
        columns = con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'online_retail_ii' "
                              "AND table_name = 'invoice_lines' ORDER BY ordinal_position").fetchall()
        self.assertEqual(columns, described, "the Parquet file's columns and types")
        registry = {r["id"]: r for r in json.loads(REGISTRY.read_text(encoding="utf-8"))["datasets"]}
        notes = {(n["schema"], n["table"]): n for n in self.read(self.with_dir, "schema-notes.json")}
        n = notes[("online_retail_ii", "invoice_lines")]
        self.assertEqual(n["row_count"], 8)
        self.assertEqual(n["sample"]["columns"], [c for c, _ in columns])
        self.assertEqual(len(n["sample"]["rows"]), 5)
        self.assertEqual(n["column_types"], dict(columns))
        self.assertEqual(n["label"], registry["DS-RETAIL-02"]["label"])
        self.assertEqual(n["from_level"], 4)
        self.assertEqual(n["grain"], "one row per invoice line")
        self.assertIn("cancel", n["column_notes"]["invoice"])
        for table, rows in (("dishes", 2), ("visits", 3)):
            m = notes[("foodie_fi", table)]
            self.assertEqual((m["row_count"], len(m["sample"]["rows"]), m["label"]), (rows, rows, registry["CH-01"]["label"]))
        text = json.dumps([v for (s, _), v in notes.items() if s in PREPARED or s in REAL_EDGES], ensure_ascii=False)
        self.assertNotIn("—", text)
        self.assertNotIn("NULL", text)

    def test_the_real_edge_schemas_are_always_built_with_notes_and_in_the_manifest(self):
        for which, folder, manifest in (("with", self.with_dir, self.with_manifest), ("without", self.without_dir, self.without_manifest)):
            notes = {(n["schema"], n["table"]): n for n in self.read(folder, "schema-notes.json")}
            for schema, tables in REAL_EDGES.items():
                got = {r[0] for r in self.cons[which].execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ?", [schema]).fetchall()}
                self.assertEqual(got, set(tables), f"{which}: {schema}")
                for t in tables:
                    self.assertEqual(len(manifest["tables"][f"{schema}.{t}"]["sha256"]), 64, f"P38: {schema}.{t} in the main section")
                    note = notes[(schema, t)]
                    self.assertNotIn("allowed_values", note, "hidden data lists no values")
                    self.assertNotIn("label", note, "our own rows carry no dataset's label")
                    self.assertEqual(note["row_count"], manifest["tables"][f"{schema}.{t}"]["rows"])

    def test_dataset_version_is_the_same_with_and_without_a_prepared_dataset(self):
        self.assertEqual(self.with_manifest["dataset_version"], self.without_manifest["dataset_version"])
        self.assertEqual(self.with_manifest["tables"], self.without_manifest["tables"])
        self.assertFalse([t for t in self.with_manifest["tables"] if t.split(".")[0] in PREPARED], "prepared data is not in the main section")

    def test_the_manifest_real_section_lists_each_prepared_schema(self):
        self.assertEqual(self.without_manifest["real"], {})
        real = self.with_manifest["real"]
        self.assertEqual(sorted(real), sorted(PREPARED))
        info = self.read(self.with_dir / "real" / "online_retail_ii", "prep.json")
        entry = real["online_retail_ii"]
        self.assertEqual((entry["dataset"], entry["source"], entry["fingerprint"], entry["fingerprint_check"], entry["prepared_at"]),
                         ("DS-RETAIL-02", "online+retail+ii.zip", info["source"]["sha256"], info["source"]["fingerprint"], info["prepared_at"]))
        self.assertEqual(entry["tables"]["online_retail_ii.invoice_lines"]["rows"], 8)
        self.assertEqual(entry["tables"]["online_retail_ii.invoice_lines"]["sha256"],
                         build_course_db.table_sha(self.cons["with"], "online_retail_ii.invoice_lines"))
        self.assertEqual(sorted(real["foodie_fi"]["tables"]), ["foodie_fi.dishes", "foodie_fi.visits"])
        self.assertEqual(real["foodie_fi"]["dataset"], "CH-01")

    def test_the_built_schema_list_names_the_prepared_schemas(self):
        with_schemas = self.read(self.with_dir / "truth", "checkpoints.json")["schemas"]
        without_schemas = self.read(self.without_dir / "truth", "checkpoints.json")["schemas"]
        self.assertTrue(set(PREPARED) <= set(with_schemas), "S6-13 and the explorer read this list")
        self.assertEqual(sorted(set(with_schemas) - set(PREPARED)), without_schemas)

    def test_nothing_outside_data_real_is_read_for_real_data(self):
        reads = [s for s in self.sql if "read_parquet" in s]
        real = (self.with_dir / "real").as_posix()
        expected = {f"{real}/online_retail_ii/invoice_lines.parquet", f"{real}/foodie_fi/dishes.parquet", f"{real}/foodie_fi/visits.parquet"}
        expected |= {f"{real}/olist/{t}.parquet" for t in OLIST_ROWS} | {f"{real}/maven_toy_store/{t}.parquet" for t in MAVEN_ROWS}
        self.assertEqual({re.search(r"read_parquet\('([^']+)'\)", s).group(1) for s in reads}, expected)
        self.assertFalse([s for s in self.sql if "not_in_registry" in s])

    def test_an_absent_data_real_builds_as_today(self):
        self.assertFalse(set(PREPARED) & self.schemas("without"))
        self.assertFalse((self.without_dir / "real").exists(), "the build makes no data/real/")
        with_notes = [n for n in self.read(self.with_dir, "schema-notes.json") if n["schema"] not in PREPARED]
        self.assertEqual(self.read(self.without_dir, "schema-notes.json"), with_notes)
        for name in ("voltmarkt.json", "mailvora.json"):
            self.assertEqual(self.read(self.without_dir / "truth", name), self.read(self.with_dir / "truth", name), name)

    def test_without_the_files_neither_dataset_schema_is_built_both_edges_are_and_dataset_version_holds(self):
        # Review Focus 5 and E-213 (Task D1): a fresh clone has no Olist or Maven download.
        without, with_ = self.schemas("without"), self.schemas("with")
        self.assertFalse({"olist", "maven_toy_store"} & without, "no dataset schema without its files")
        self.assertTrue({"olist_edge", "maven_toy_store_edge"} <= without, "both edge schemas are always built")
        self.assertTrue({"olist", "maven_toy_store", "olist_edge", "maven_toy_store_edge"} <= with_)
        self.assertEqual(self.without_manifest["dataset_version"], self.with_manifest["dataset_version"])
        for edge, tables in (("olist_edge", OLIST_ROWS), ("maven_toy_store_edge", MAVEN_ROWS)):
            for t in tables:
                self.assertIn(f"{edge}.{t}", self.without_manifest["tables"], "P38: our own rows are in dataset_version")
        names = {(n["schema"], n["table"]) for n in self.read(self.without_dir, "schema-notes.json")}
        self.assertTrue({("maven_toy_store_edge", t) for t in MAVEN_ROWS} <= names, "a fictional dataset's edge has notes too")
        self.assertFalse({s for s, _ in names} & {"olist", "maven_toy_store"})
        # Prepared: each table imported, its notes carrying the registry's label, and the manifest's real section naming the dataset.
        con = self.cons["with"]
        for schema, rows, dataset in (("olist", OLIST_ROWS, "DS-RETAIL-01"), ("maven_toy_store", MAVEN_ROWS, "DS-MKT-03")):
            for t, n in rows.items():
                self.assertEqual(con.execute(f"SELECT count(*) FROM {schema}.{t}").fetchone()[0], n, f"{schema}.{t}")
            self.assertEqual(self.with_manifest["real"][schema]["dataset"], dataset)
            self.assertEqual(self.with_manifest["real"][schema]["fingerprint_check"], "differs", "a fixture is not the owner's file")
        notes = {(n["schema"], n["table"]): n for n in self.read(self.with_dir, "schema-notes.json")}
        self.assertTrue(notes[("maven_toy_store", "orders")]["label"].startswith("Fictional data"))
        self.assertTrue(notes[("olist", "orders")]["label"].startswith("Real data"))
        self.assertEqual(notes[("olist", "customers")]["column_types"]["customer_unique_id"], "VARCHAR")
        self.assertEqual(self.with_manifest["real"]["olist"]["source"], "archive.zip")


class PreparedDatasets(TempDir):
    """The build's first step finds the prepared datasets, and refuses an incomplete one before anything is generated."""

    def prepared(self, real):
        return build_course_db.prepared_datasets(real, REGISTRY)

    def make(self, schema="online_retail_ii", dataset="DS-RETAIL-02", tables=None):
        folder = self.tmp / "real" / schema
        folder.mkdir(parents=True)
        tables = {"invoice_lines": 1} if tables is None else tables
        for t in tables:
            pq.write_table(pa.table({"n": [1]}), folder / f"{t}.parquet")
        (folder / "prep.json").write_text(json.dumps({"dataset": dataset, "schema": schema, "tables": tables,
                                                      "source": {"file": "x", "sha256": "0" * 64, "fingerprint": "matches"},
                                                      "prepared_at": "2026-10-16T00:00:00+00:00"}), encoding="utf-8")
        return folder

    def test_no_folder_no_datasets_and_a_folder_without_prep_json_is_not_prepared(self):
        self.assertEqual(self.prepared(self.tmp / "real"), [])
        (self.tmp / "real" / "breakfast_at_the_frat").mkdir(parents=True)
        (self.tmp / "real" / ".online_retail_ii.work").mkdir()
        self.assertEqual(self.prepared(self.tmp / "real"), [])
        self.make()
        self.assertEqual([(p.record["id"], p.schema, p.tables) for p in self.prepared(self.tmp / "real")],
                         [("DS-RETAIL-02", "online_retail_ii", {"invoice_lines": 1})])

    def test_an_incomplete_prepared_dataset_stops_the_build_naming_it(self):
        folder = self.make()
        (folder / "invoice_lines.parquet").unlink()
        with self.assertRaisesRegex(ValueError, r"data/real/online_retail_ii .*invoice_lines\.parquet.*prep:datasets"):
            self.prepared(self.tmp / "real")
        shutil.rmtree(folder)
        self.make(dataset="DS-PRICE-101")
        with self.assertRaisesRegex(ValueError, r"data/real/online_retail_ii .*DS-PRICE-101"):
            self.prepared(self.tmp / "real")
        shutil.rmtree(self.tmp / "real" / "online_retail_ii")
        self.make(tables={"bad name": 1})
        with self.assertRaisesRegex(ValueError, r"data/real/online_retail_ii .*not a plain table name"):
            self.prepared(self.tmp / "real")

    def test_olist_and_maven_toy_store_are_found_from_their_prep_json_in_registry_order(self):
        self.make("maven_toy_store", "DS-MKT-03", {"orders": 1, "website_sessions": 1})
        self.make("olist", "DS-RETAIL-01", {"orders": 1})
        self.assertEqual([(p.record["id"], p.schema, p.tables) for p in self.prepared(self.tmp / "real")],
                         [("DS-RETAIL-01", "olist", {"orders": 1}), ("DS-MKT-03", "maven_toy_store", {"orders": 1, "website_sessions": 1})])
        (self.tmp / "real" / "maven_toy_store" / "website_sessions.parquet").unlink()
        with self.assertRaisesRegex(ValueError, r"data/real/maven_toy_store .*website_sessions\.parquet"):
            self.prepared(self.tmp / "real")


# ---- sprint 8 Part 2 (Task D1): Olist and Maven Toy Store, each a zip of CSV files (S8-16, E-213) ---------------------------------

def csv_bytes(header, rows, *, bom=False, crlf=False) -> bytes:
    """A CSV file as Python's csv module writes it (fields with a comma, a quote or a line break are quoted)."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n" if crlf else "\n")
    writer.writerow(header)
    writer.writerows(rows)
    return (("﻿" if bom else "") + buf.getvalue()).encode("utf-8")


# Invented rows under Olist's real file and column names: never a row of the real files.
OLIST_REVIEW = 'Chegou antes do prazo, "perfeito".\nÓtimo, recomendo.'   # a comma, quotes, a line break and accents in one field
OLIST_FILES = {
    "olist_customers_dataset.csv": (
        ["customer_id", "customer_unique_id", "customer_zip_code_prefix", "customer_city", "customer_state"],
        [["c1", "00012345678901234567890123456789", "01037", "invented city one", "SP"],
         ["c2", "00012345678901234567890123456789", "01037", "invented city one", "SP"],    # the same person's second order
         ["c3", "1e5", "20040", "invented city two", "RJ"],                                 # an ID that looks like a number
         ["c4", "f00d", "30110", "invented city three", "MG"]]),
    "olist_orders_dataset.csv": (
        ["order_id", "customer_id", "order_status", "order_purchase_timestamp", "order_approved_at", "order_delivered_carrier_date",
         "order_delivered_customer_date", "order_estimated_delivery_date"],
        [["o1", "c1", "delivered", "2017-11-03 09:15:00", "2017-11-03 09:40:00", "2017-11-06 15:00:00", "2017-11-13 18:20:00", "2017-11-24 00:00:00"],
         ["o2", "c2", "delivered", "2018-01-08 20:05:10", "2018-01-08 20:30:00", "2018-01-10 11:00:00", "2018-01-19 14:45:00", "2018-02-01 00:00:00"],
         ["o3", "c3", "shipped", "2018-02-11 07:30:00", "2018-02-11 08:00:00", "2018-02-13 16:10:00", "", "2018-03-02 00:00:00"],
         ["o4", "c9", "canceled", "2018-03-04 12:00:00", "", "", "", "2018-03-22 00:00:00"]]),   # c9 is in no customer row
    "olist_order_items_dataset.csv": (
        ["order_id", "order_item_id", "product_id", "seller_id", "shipping_limit_date", "price", "freight_value"],
        [["o1", "1", "p1", "s1", "2017-11-07 09:40:00", "40.00", "10.50"],
         ["o2", "1", "p2", "s1", "2018-01-12 20:30:00", "100.00", "20.25"],
         ["o2", "2", "p2", "s1", "2018-01-12 20:30:00", "100.00", "20.25"],
         ["o3", "1", "p3", "s2", "2018-02-15 08:00:00", "150.00", "18.00"]]),
    "olist_order_payments_dataset.csv": (
        ["order_id", "payment_sequential", "payment_type", "payment_installments", "payment_value"],
        [["o1", "1", "credit_card", "2", "30.50"], ["o1", "2", "voucher", "1", "20.00"], ["o2", "1", "boleto", "1", "240.50"],
         ["o3", "1", "credit_card", "6", "168.00"], ["o4", "1", "debit_card", "1", "55.00"]]),
    "olist_order_reviews_dataset.csv": (
        ["review_id", "order_id", "review_score", "review_comment_title", "review_comment_message", "review_creation_date",
         "review_answer_timestamp"],
        [["r1", "o1", "4", "", "", "2017-11-14 00:00:00", "2017-11-15 10:00:00"],
         ["r2", "o2", "5", "Ótimo", OLIST_REVIEW, "2018-01-20 00:00:00", "2018-01-21 09:30:00"],
         ["r1", "o3", "1", "", "Não chegou", "2018-03-03 00:00:00", "2018-03-03 12:00:00"]]),   # a review ID used twice
    "olist_products_dataset.csv": (
        ["product_id", "product_category_name", "product_name_lenght", "product_description_lenght", "product_photos_qty",
         "product_weight_g", "product_length_cm", "product_height_cm", "product_width_cm"],
        [["p1", "invented_category_one", "40", "300", "2", "500", "20", "10", "15"],
         ["p2", "invented_category_two", "44.0", "250", "1", "1200", "30", "12", "25"],     # a whole number written 44.0
         ["p3", "", "", "", "", "300", "16", "5", "11"]]),                                  # a product with no category
    "olist_sellers_dataset.csv": (
        ["seller_id", "seller_zip_code_prefix", "seller_city", "seller_state"],
        [["s1", "13023", "invented city four", "SP"], ["s2", "04195", "invented city one", "SP"]]),
    "product_category_name_translation.csv": (
        ["product_category_name", "product_category_name_english"],
        [["invented_category_one", "invented category one"], ["invented_category_two", "invented category two"]]),
    "olist_geolocation_dataset.csv": (
        ["geolocation_zip_code_prefix", "geolocation_lat", "geolocation_lng", "geolocation_city", "geolocation_state"],
        [["01037", "-23.5", "-46.6", "invented city one", "SP"]]),
}
OLIST_ROWS = {"customers": 4, "orders": 4, "order_items": 4, "order_payments": 5, "order_reviews": 3, "products": 3, "sellers": 2,
              "product_category_name_translation": 2}
OLIST_GEO = "olist_geolocation_dataset.csv"


def olist_zip(folder: pathlib.Path, name: str = "archive.zip", drop=()) -> pathlib.Path:
    """Olist's download as Kaggle zips it: nine CSV files at the zip's top, geolocation included. The translation file starts with a
    byte-order mark and the orders file has Windows line ends."""
    members = {}
    for member, (header, rows) in OLIST_FILES.items():
        if member not in drop:
            members[member] = csv_bytes(header, rows, bom=member == "product_category_name_translation.csv",
                                        crlf=member == "olist_orders_dataset.csv")
    return zip_with(folder / name, members)


MAVEN_DIR = "Maven Fuzzy Factory/"
MAVEN_DICTIONARY = "maven_fuzzy_factory_data_dictionary.csv"
# Invented rows under the Toy Store database's real file and column names. NULL is how the files may write a missing value.
MAVEN_FILES = {
    "website_sessions.csv": (
        ["website_session_id", "created_at", "user_id", "is_repeat_session", "utm_source", "utm_campaign", "utm_content",
         "device_type", "http_referer"],
        [["1", "2013-04-01 08:00:00", "11", "0", "gsearch", "nonbrand", "g_ad_1", "desktop", "https://www.gsearch.com"],
         ["2", "2013-04-01 09:30:00", "12", "0", "NULL", "NULL", "NULL", "mobile", "NULL"],
         ["3", "2013-04-02 10:00:00", "11", "1", "bsearch", "brand", "b_ad_2", "desktop", "https://www.bsearch.com"]]),
    "website_pageviews.csv": (
        ["website_pageview_id", "created_at", "website_session_id", "pageview_url"],
        [["1", "2013-04-01 08:00:00", "1", "/home"], ["2", "2013-04-01 08:10:00", "1", "/cart"],
         ["3", "2013-04-01 09:30:00", "2", "/home"], ["4", "2013-04-02 10:00:00", "3", "/products"]]),
    "orders.csv": (
        ["order_id", "created_at", "website_session_id", "user_id", "primary_product_id", "items_purchased", "price_usd", "cogs_usd"],
        [["1", "2013-04-01 08:20:00", "1", "11", "1", "2", "79.98", "29.98"],
         ["2", "2013-04-02 10:30:00", "3", "11", "2", "1", "29.99", "9.99"]]),
    "order_items.csv": (
        ["order_item_id", "created_at", "order_id", "product_id", "is_primary_item", "price_usd", "cogs_usd"],
        [["1", "2013-04-01 08:20:00", "1", "1", "1", "49.99", "19.99"], ["2", "2013-04-01 08:20:00", "1", "2", "0", "29.99", "9.99"],
         ["3", "2013-04-02 10:30:00", "2", "2", "1", "29.99", "9.99"]]),
    "order_item_refunds.csv": (
        ["order_item_refund_id", "created_at", "order_item_id", "order_id", "refund_amount_usd"],
        [["1", "2013-04-10 12:00:00", "2", "1", "29.99"]]),
    "products.csv": (
        ["product_id", "created_at", "product_name"],
        [["1", "2012-01-01 09:00:00", "An invented bear"], ["2", "2013-01-01 09:00:00", "An invented bear, mini"]]),
}
MAVEN_ROWS = {"website_sessions": 3, "website_pageviews": 4, "orders": 2, "order_items": 3, "order_item_refunds": 1, "products": 2}


def maven_zip(folder: pathlib.Path, name: str = "Maven+Fuzzy+Factory.zip", drop=()) -> pathlib.Path:
    """Maven's download: the six CSV files and the data dictionary in a folder inside the zip, beside a macOS resource fork."""
    members = {MAVEN_DIR + m: csv_bytes(h, r) for m, (h, r) in MAVEN_FILES.items() if m not in drop}
    members[MAVEN_DIR + MAVEN_DICTIONARY] = csv_bytes(["Table", "Field", "Description"], [["orders", "order_id", "Invented."]])
    members["__MACOSX/" + MAVEN_DIR + "._orders.csv"] = b"\x00\x05\x16\x07 invented resource fork"
    return zip_with(folder / name, members)


def committed(dataset_id: str) -> dict:
    return next(r for r in json.loads(REGISTRY.read_text(encoding="utf-8"))["datasets"] if r["id"] == dataset_id)


def found(folder: pathlib.Path, dataset_id: str):
    source = prep.find(folder, committed(dataset_id)["files"][0])
    assert source is not None, f"{dataset_id}'s zip is in {folder}"
    return source


class CsvReader(TempDir):
    """csvzip.py: a CSV file read straight from its zip, by column kind, with errors that name the file, line and column."""
    COLUMNS = [xlsx.Column("code", "text"), xlsx.Column("n", "int"), xlsx.Column("amount", "float"), xlsx.Column("at", "datetime"),
               xlsx.Column("day", "date"), xlsx.Column("note", "text")]
    HEADER = [c.name for c in COLUMNS]

    def read(self, data: bytes, member="folder/t.csv", columns=None, **kw):
        path = zip_with(self.tmp / "t.zip", {member: data})
        out = self.tmp / "t.parquet"
        with zipfile.ZipFile(path) as zf:
            stats = csvzip.read_table(zf, member, columns or self.COLUMNS, out, **kw)
        return stats, pq.read_table(out)

    def test_values_convert_by_column_kind_and_text_stays_as_written(self):
        rows = [["007", "40", "12.50", "2017-10-03 09:15:00", "2017-10-03", "a, \"quoted\"\nline"],
                ["1e5", "44.0", "-3", "", "", ""],
                [" padded ", "", "", "2018-01-01 00:00:00", "2018-01-01", "Ótimo"]]
        stats, table = self.read(csv_bytes(self.HEADER, rows, bom=True, crlf=True))
        self.assertEqual(table.schema, pa.schema([("code", pa.string()), ("n", pa.int32()), ("amount", pa.float64()),
                                                  ("at", pa.timestamp("us")), ("day", pa.date32()), ("note", pa.string())]))
        self.assertEqual(table.to_pylist(), [
            {"code": "007", "n": 40, "amount": 12.5, "at": dt.datetime(2017, 10, 3, 9, 15), "day": dt.date(2017, 10, 3), "note": 'a, "quoted"\nline'},
            {"code": "1e5", "n": 44, "amount": -3.0, "at": None, "day": None, "note": None},
            {"code": " padded ", "n": None, "amount": None, "at": dt.datetime(2018, 1, 1), "day": dt.date(2018, 1, 1), "note": "Ótimo"}])
        self.assertEqual((stats.rows, stats.blank_lines, stats.missing_text), (3, 0, {}))

    def test_a_text_that_stands_for_missing_is_missing_and_counted_by_column(self):
        stats, table = self.read(csv_bytes(self.HEADER, [["NULL", "NULL", "1", "NULL", "", "null"]]), missing_text="NULL")
        self.assertEqual(table.to_pylist()[0], {"code": None, "n": None, "amount": 1.0, "at": None, "day": None, "note": "null"})
        self.assertEqual(stats.missing_text, {"code": 1, "n": 1, "at": 1})
        _, table = self.read(csv_bytes(self.HEADER, [["NULL", "", "", "", "", ""]]))
        self.assertEqual(table.to_pylist()[0]["code"], "NULL", "with no such text named, NULL is text")

    def test_a_changed_header_names_the_file(self):
        with self.assertRaisesRegex(PrepError, r"folder/t\.csv: its first line reads code, n, amount, at, day, remark"):
            self.read(csv_bytes(self.HEADER[:-1] + ["remark"], []))

    def test_a_value_the_column_cannot_take_names_the_file_line_and_column(self):
        for value, column, why in (("x", "n", "not a whole number"), ("4.5", "n", "not a whole number"), ("1_000", "amount", "not a number"),
                                   ("nan", "amount", "not a number"), ("3000000000", "n", "too large"),
                                   ("2017-13-01 00:00:00", "at", "date and time"), ("2017-10-03T09:15:00+02:00", "at", "time zone")):
            row = ["a", "1", "1", "2017-10-03 09:15:00", "2017-10-03", "x"]
            row[self.HEADER.index(column)] = value
            with self.subTest(value=value), self.assertRaisesRegex(PrepError, rf"folder/t\.csv line 3, column {column}: .*{why}"):
                self.read(csv_bytes(self.HEADER, [["a", "1", "1", "", "", ""], row]))

    def test_a_row_with_too_few_or_too_many_values_names_its_line_and_a_blank_line_is_counted(self):
        data = csv_bytes(self.HEADER, [["a", "1", "1", "", "", ""]]) + b"\n" + b"b,2\n"
        with self.assertRaisesRegex(PrepError, r"folder/t\.csv line 4: 2 values, not 6"):
            self.read(data)
        stats, _ = self.read(csv_bytes(self.HEADER, [["a", "1", "1", "", "", ""]]) + b"\n" + b"b,2,2,,,\n")
        self.assertEqual((stats.rows, stats.blank_lines), (2, 1))

    def test_a_damaged_member_text_that_is_not_utf8_and_an_oversized_member_are_named(self):
        with self.assertRaisesRegex(PrepError, r"folder/t\.csv is not UTF-8 text"):
            self.read(csv_bytes(self.HEADER, []) + "a,1,1,,,café\n".encode("latin-1"))
        with mock.patch.object(csvzip, "MAX_MEMBER_BYTES", 10), self.assertRaisesRegex(PrepError, r"folder/t\.csv declares \d+ bytes"):
            self.read(csv_bytes(self.HEADER, []))
        stored = io.BytesIO()
        with zipfile.ZipFile(stored, "w", zipfile.ZIP_STORED) as z:
            z.writestr("folder/t.csv", csv_bytes(self.HEADER, [["abcdef", "1", "1", "", "", ""]]))
        data = stored.getvalue()
        at = data.index(b"abcdef")
        (self.tmp / "t.zip").write_bytes(data[:at] + b"X" + data[at + 1:])   # its CRC no longer matches
        with zipfile.ZipFile(self.tmp / "t.zip") as zf, self.assertRaisesRegex(PrepError, r"folder/t\.csv is damaged"):
            csvzip.read_table(zf, "folder/t.csv", self.COLUMNS, self.tmp / "t.parquet")


class OlistPrep(TempDir):
    def prepared(self, **zip_kw):
        out = self.tmp / "out"
        out.mkdir()
        olist_zip(self.tmp, **zip_kw)
        return olist.prepare("olist", found(self.tmp, "DS-RETAIL-01"), out), out

    def test_every_table_is_read_by_its_file_name_and_the_geolocation_file_is_not(self):
        olist_zip(self.tmp)
        source = found(self.tmp, "DS-RETAIL-01")
        self.assertEqual(source.members["orders"], "olist_orders_dataset.csv")
        self.assertEqual(source.unread, [OLIST_GEO], "the zip's ninth file is left out")
        out = self.tmp / "out"
        out.mkdir()
        result = olist.prepare("olist", source, out)
        self.assertEqual(result["tables"], OLIST_ROWS)
        self.assertEqual(list(result["tables"]), list(olist.TABLES), "in the prep's order")
        self.assertEqual(sorted(p.name for p in out.iterdir()), sorted(f"{t}.parquet" for t in OLIST_ROWS), "no geolocation table")
        for table in OLIST_ROWS:
            member = next(m for m in committed("DS-RETAIL-01")["files"][0]["members"] if m["table"] == table)["name"]
            self.assertEqual(pq.read_table(out / f"{table}.parquet").column_names, OLIST_FILES[member][0], f"{table}: the source's column names")
        orders = pq.read_table(out / "orders.parquet")
        self.assertEqual(orders.schema.field("order_purchase_timestamp").type, pa.timestamp("us"))
        self.assertEqual(orders.column("order_delivered_customer_date").to_pylist()[2], None, "a missing delivery date stays missing")
        items = pq.read_table(out / "order_items.parquet")
        self.assertEqual((items.schema.field("order_item_id").type, items.schema.field("price").type), (pa.int32(), pa.float64()))
        reviews = pq.read_table(out / "order_reviews.parquet").to_pylist()
        self.assertEqual(reviews[1]["review_comment_message"], OLIST_REVIEW, "a quoted field keeps its comma, quotes, line break and accents")
        self.assertIsNone(reviews[0]["review_comment_title"])
        products = pq.read_table(out / "products.parquet").to_pylist()
        self.assertEqual([p["product_name_lenght"] for p in products], [40, 44, None])
        self.assertIsNone(products[2]["product_category_name"])
        self.assertEqual(pq.read_table(out / "product_category_name_translation.parquet").column("product_category_name").to_pylist()[0],
                         "invented_category_one", "the byte-order mark is not part of the first name")

    def test_customer_unique_id_and_the_codes_survive_as_text(self):
        _, out = self.prepared()
        customers = pq.read_table(out / "customers.parquet")
        self.assertEqual(customers.schema.field("customer_unique_id").type, pa.string())
        self.assertEqual(customers.column("customer_unique_id").to_pylist(), ["00012345678901234567890123456789",
                                                                               "00012345678901234567890123456789", "1e5", "f00d"])
        self.assertEqual(customers.column("customer_zip_code_prefix").to_pylist()[0], "01037", "a postcode prefix keeps its zero")
        self.assertEqual(pq.read_table(out / "sellers.parquet").column("seller_zip_code_prefix").to_pylist(), ["13023", "04195"])

    def test_the_checks_keys_links_customers_and_the_published_order_count(self):
        result, _ = self.prepared()
        checks = result["checks"]
        self.assertEqual(checks["customers"], {"customer_ids": 4, "customer_unique_ids": 3})
        self.assertEqual(checks["keys"]["orders"], {"key": ["order_id"], "duplicates": 0})
        self.assertNotIn("order_reviews", checks["keys"], "the source repeats some review IDs, so the reviews have no key")
        links = {c["link"]: c["not_found"] for c in checks["links"]}
        self.assertEqual(links["orders.customer_id -> customers.customer_id"], 1)
        self.assertEqual(links["order_items.order_id -> orders.order_id"], 0)
        self.assertTrue(any("customers.customer_id" in w for w in result["warnings"]), "a link value not found warns")
        self.assertEqual(checks["published"]["orders"]["ok"], False)
        self.assertTrue(any("about 100,000" in w for w in result["warnings"]), "03's about 100k orders")
        self.assertEqual(result["summary"], "customers 4, orders 4, order_items 4, order_payments 5, order_reviews 3, products 3, sellers 2, "
                                            "product_category_name_translation 2 rows; customer_unique_id 3 for 4 customer_id; "
                                            "key duplicates 0; link values not found 1")

    def test_a_changed_column_stops_the_prep_naming_the_file(self):
        members = {m: csv_bytes(h, r) for m, (h, r) in OLIST_FILES.items()}
        members["olist_orders_dataset.csv"] = csv_bytes(["order_id", "customer"], [])
        zip_with(self.tmp / "archive.zip", members)
        out = self.tmp / "out"
        out.mkdir()
        with self.assertRaisesRegex(PrepError, r"olist_orders_dataset\.csv: its first line reads order_id, customer, not order_id, customer_id"):
            olist.prepare("olist", found(self.tmp, "DS-RETAIL-01"), out)


class MavenToyStorePrep(TempDir):
    def test_six_tables_from_a_folder_inside_the_zip_and_the_dictionary_is_not_read(self):
        maven_zip(self.tmp)
        source = found(self.tmp, "DS-MKT-03")
        self.assertEqual(source.members["orders"], MAVEN_DIR + "orders.csv", "found by its name, in the folder inside the zip")
        self.assertEqual(source.unread, [MAVEN_DIR + MAVEN_DICTIONARY], "a macOS resource fork is not counted")
        out = self.tmp / "out"
        out.mkdir()
        result = maven.prepare("maven_toy_store", source, out)
        self.assertEqual(result["tables"], MAVEN_ROWS)
        sessions = pq.read_table(out / "website_sessions.parquet")
        self.assertEqual(sessions.column_names, MAVEN_FILES["website_sessions.csv"][0])
        self.assertEqual(sessions.column("utm_source").to_pylist(), ["gsearch", None, "bsearch"], "NULL in the file is missing")
        self.assertEqual(sessions.schema.field("website_session_id").type, pa.int32())
        self.assertEqual(pq.read_table(out / "orders.parquet").schema.field("price_usd").type, pa.float64())
        self.assertEqual(pq.read_table(out / "products.parquet").column("product_name").to_pylist(), ["An invented bear", "An invented bear, mini"])
        checks = result["checks"]
        self.assertEqual(checks["missing_text"], {"website_sessions": {"utm_source": 1, "utm_campaign": 1, "utm_content": 1, "http_referer": 1}})
        links = {c["link"]: c["not_found"] for c in checks["links"]}
        self.assertEqual(links["orders.website_session_id -> website_sessions.website_session_id"], 0)
        self.assertEqual(links["order_item_refunds.order_item_id -> order_items.order_item_id"], 0)
        self.assertEqual(checks["published"]["total_rows"], {"expected": 1_735_068, "read": 15, "ok": False})
        self.assertTrue(any("1,735,068" in w for w in result["warnings"]))
        self.assertTrue(any("30,000" in w for w in result["warnings"]) and any("400,000" in w for w in result["warnings"]))
        self.assertEqual(result["summary"], "website_sessions 3, website_pageviews 4, orders 2, order_items 3, order_item_refunds 1, products 2 "
                                            "rows, 15 in all (03 gives 1,735,068); NULL read as missing 4; key duplicates 0; "
                                            "link values not found 0")


class RegistryRecordsD1(unittest.TestCase):
    """S8-16 and E-213: the two records, and their agreement with the prep modules."""

    def test_each_record_lists_the_files_its_prep_reads_as_its_tables(self):
        for dataset_id, module, schema in (("DS-RETAIL-01", olist, "olist"), ("DS-MKT-03", maven, "maven_toy_store")):
            record = committed(dataset_id)
            with self.subTest(dataset=dataset_id):
                self.assertEqual([s["name"] for s in record["schemas"]], [schema])
                self.assertEqual(record["prep"], f"pipeline/datasets/{module.__name__.split('.')[-1]}.py")
                self.assertEqual(len(record["files"]), 1)
                self.assertEqual([m["table"] for m in record["files"][0]["members"]], list(module.TABLES))
                self.assertEqual(set(module.NOTES), set(module.TABLES), "every table has its note")
                prep.check_record(record)
        olist_files = [m["name"] for m in committed("DS-RETAIL-01")["files"][0]["members"]]
        self.assertEqual(sorted(olist_files), sorted(set(OLIST_FILES) - {OLIST_GEO}))
        self.assertEqual(sorted(m["name"] for m in committed("DS-MKT-03")["files"][0]["members"]), sorted(MAVEN_FILES))

    def test_the_labels_licences_and_the_geolocation_file(self):
        olist_record, maven_record = committed("DS-RETAIL-01"), committed("DS-MKT-03")
        self.assertEqual((olist_record["real"], olist_record["licence"]["name"]), (True, "CC BY-NC-SA 4.0"))
        self.assertIn("geolocation", olist_record["label"], "the card says the geolocation file is left out")
        self.assertTrue(any("olist_geolocation_dataset.csv" in n for n in olist_record["notes"]))
        self.assertEqual(olist_record["files"][0]["name"], "archive.zip", "the name Kaggle gives the download")
        self.assertEqual((maven_record["real"], maven_record["licence"]["name"]), (False, "Public Domain"))
        self.assertEqual(maven_record["licence"]["url"], "https://mavenanalytics.io/data-playground/toy-store-e-commerce-database")
        self.assertTrue(maven_record["label"].startswith("Fictional data"))
        self.assertIn("Maven Fuzzy Factory", maven_record["label"])
        self.assertTrue(maven_record["label"].endswith("Source: Maven Analytics. Licence: Public Domain."))


class PrepZipsOfCsvFiles(TempDir):
    """The prep command on Olist and Maven: by name, a missing file or member named with its dataset, a browser's copies."""
    run_prep = PrepCommand.run_prep

    def setUp(self):
        super().setUp()
        self.downloads = self.tmp / "downloads"
        self.data = self.tmp / "data"
        self.downloads.mkdir()
        self.data.mkdir()
        (self.data / "course.duckdb").write_bytes(b"the controller's database, untouched")

    def test_both_prepare_into_data_real_and_nothing_else(self):
        olist_zip(self.downloads)
        maven_zip(self.downloads)
        before_downloads, before_data = snapshot(self.downloads), snapshot(self.data)
        code, out = self.run_prep(registry())
        self.assertEqual(code, 0, out)
        self.assertEqual(snapshot(self.downloads), before_downloads, "the downloads are read, never changed or unpacked")
        after = snapshot(self.data)
        new = {p for p in after if p not in before_data or after[p] != before_data[p]}
        self.assertEqual(new, {f"real/olist/{t}.parquet" for t in OLIST_ROWS} | {"real/olist/prep.json"}
                         | {f"real/maven_toy_store/{t}.parquet" for t in MAVEN_ROWS} | {"real/maven_toy_store/prep.json"})
        self.assertEqual(sorted(p.name for p in (self.data / "real").iterdir()), ["maven_toy_store", "olist"], "no work folder is left")
        self.assertIn(f"DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: not read from archive.zip: {OLIST_GEO}", out)
        self.assertIn("DS-RETAIL-01 checks (olist): customers 4, orders 4,", out)
        self.assertIn("DS-MKT-03 checks (maven_toy_store): website_sessions 3,", out)
        info = json.loads((self.data / "real" / "olist" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((info["dataset"], info["real"], info["tables"]), ("DS-RETAIL-01", True, OLIST_ROWS))
        self.assertEqual(info["source"]["not_read"], [OLIST_GEO])
        self.assertEqual(info["source"]["members"]["customers"], "olist_customers_dataset.csv")
        self.assertEqual((info["source"]["file"], info["source"]["found"], info["source"]["inside"]), ("archive.zip", "archive.zip", None))
        m = json.loads((self.data / "real" / "maven_toy_store" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((m["dataset"], m["real"], m["tables"]), ("DS-MKT-03", False, MAVEN_ROWS))
        self.assertTrue(m["label"].startswith("Fictional data"))
        self.assertNotIn(self.tmp.name, json.dumps([info, m]), "prep.json names files, never the folder they came from")

    def test_a_missing_zip_is_named_with_its_dataset(self):
        for dataset_id, pattern in (("DS-RETAIL-01", r"DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: archive\.zip .*not in"),
                                    ("DS-MKT-03", r"DS-MKT-03 Toy Store E-Commerce Database \(Maven Fuzzy Factory\): Maven\+Fuzzy\+Factory\.zip .*not in")):
            with self.subTest(dataset=dataset_id):
                code, out = self.run_prep(registry(), "--only", dataset_id)
                self.assertEqual(code, 1, out)
                self.assertRegex(out, pattern)
        self.assertFalse((self.data / "real").exists())

    def test_a_missing_member_is_named_with_its_dataset(self):
        olist_zip(self.downloads, drop={"olist_orders_dataset.csv"})
        maven_zip(self.downloads, drop={"order_item_refunds.csv"})
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: archive\.zip .*olist_orders_dataset\.csv")
        code, out = self.run_prep(registry(), "--only", "DS-MKT-03")
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"DS-MKT-03 Toy Store E-Commerce Database \(Maven Fuzzy Factory\): .*order_item_refunds\.csv")
        self.assertFalse((self.data / "real").exists(), "nothing prepared from an incomplete zip")

    def age(self, path: pathlib.Path, days: int) -> pathlib.Path:
        when = 1_700_000_000 - days * 86400
        os.utime(path, (when, when))
        return path

    def test_a_browsers_copies_are_found_the_newest_that_holds_the_files_is_used_and_named(self):
        other = zip_with(self.downloads / "archive.zip", {"another_kaggle_dataset.csv": b"x\n1\n"})   # another Kaggle download
        self.age(other, 1)
        self.age(olist_zip(self.downloads, "archive (1).zip"), 30)
        self.age(olist_zip(self.downloads, "archive (2).zip"), 5)
        self.age(zip_with(self.downloads / "archive (3).zip", {"yet_another.csv": b"y\n2\n"}), 0)   # the newest, but not Olist
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 0, out)
        self.assertIn("DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: 4 copies of archive.zip are in the folder "
                      "(archive (3).zip, archive.zip, archive (2).zip, archive (1).zip); using archive (2).zip, the newest that "
                      "holds the files the prep reads", out)
        info = json.loads((self.data / "real" / "olist" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((info["source"]["file"], info["source"]["found"], info["source"]["fingerprint"]),
                         ("archive.zip", "archive (2).zip", "differs"))

    def test_a_copy_whose_fingerprint_matches_wins_over_a_newer_one(self):
        older = self.age(olist_zip(self.downloads, "archive (1).zip"), 30)
        self.age(olist_zip(self.downloads, "archive (2).zip", drop={"olist_sellers_dataset.csv"}), 9)
        newer = zip_with(self.downloads / "archive (4).zip", {**{m: csv_bytes(h, r) for m, (h, r) in OLIST_FILES.items()},
                                                               "extra.txt": b"a newer version"})
        self.age(newer, 1)
        code, out = self.run_prep(registry(**{"archive.zip": sha(older)}), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 0, out)
        self.assertIn("using archive (1).zip, whose fingerprint matches the registry's", out)
        info = json.loads((self.data / "real" / "olist" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((info["source"]["found"], info["source"]["fingerprint"]), ("archive (1).zip", "matches"))

    def test_no_copy_holds_every_file_names_what_the_newest_lacks(self):
        self.age(zip_with(self.downloads / "archive.zip", {"another_kaggle_dataset.csv": b"x\n1\n"}), 1)
        self.age(olist_zip(self.downloads, "archive (1).zip", drop={"olist_sellers_dataset.csv"}), 3)
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 1, out)
        self.assertIn("DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: archive.zip is in the folder (2 copies: archive.zip, "
                      "archive (1).zip), but none holds every file the prep reads: archive (1).zip has no olist_sellers_dataset.csv", out)

    def test_every_dataset_finds_a_browsers_copy_of_its_file(self):
        orii_zip(self.downloads).rename(self.downloads / "online+retail+ii (1).zip")
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-02")
        self.assertEqual(code, 0, out)
        self.assertIn("DS-RETAIL-02 Online Retail II: using online+retail+ii (1).zip, a copy of online+retail+ii.zip", out)
        info = json.loads((self.data / "real" / "online_retail_ii" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual((info["source"]["file"], info["source"]["found"]), ("online+retail+ii.zip", "online+retail+ii (1).zip"))
        self.assertNotIn("members", info["source"], "a workbook's source keeps its own shape")
        self.assertIsNone(prep.copy_number("online+retail+ii (1)x.zip", "online+retail+ii.zip"))
        self.assertIsNone(prep.copy_number("archive (2).zip.part", "archive.zip"))
        self.assertEqual(prep.copy_number("ARCHIVE (12).ZIP", "archive.zip"), 12, "Windows names ignore case")
        self.assertEqual(prep.copy_number("archive.zip", "archive.zip"), 0)

    def test_a_member_held_twice_and_a_copy_that_is_no_zip_are_passed_over_and_named(self):
        # Review finding 7a: the "holds it twice" and "not a zip" paths.
        members = {m: csv_bytes(h, r) for m, (h, r) in OLIST_FILES.items()}
        zip_with(self.downloads / "archive.zip", {**members, "a folder/olist_orders_dataset.csv": members["olist_orders_dataset.csv"]})
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 1, out)
        self.assertIn("DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: archive.zip is in the folder, but it does not hold every "
                      "file the prep reads: it holds olist_orders_dataset.csv twice", out)
        (self.downloads / "archive.zip").unlink()
        (self.downloads / "archive (1).zip").write_bytes(b"these bytes are not a zip")
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 1, out)
        self.assertIn("archive.zip is in the folder as archive (1).zip, but it does not hold every file the prep reads: it is not a zip "
                      "that can be read", out)
        self.assertNotIn("Traceback", out)
        self.assertFalse((self.data / "real").exists(), "nothing prepared")

    def test_a_member_named_with_dot_dot_is_only_read_never_written(self):
        # Review finding 7b: an entry such as ../../evil/<name> is found by its file name and read in memory; no path is made from it.
        members = {m: csv_bytes(h, r) for m, (h, r) in OLIST_FILES.items()}
        evil = "../../evil/olist_orders_dataset.csv"
        zip_with(self.downloads / "archive.zip", {**members, evil: members["olist_orders_dataset.csv"]})
        outside = lambda: {k: v for k, v in snapshot(self.tmp).items() if not k.startswith("data/real/") and k != "registry.json"}  # noqa: E731
        before = outside()
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 1, out)
        self.assertIn("holds olist_orders_dataset.csv twice", out, "beside the real one, it makes the member ambiguous")
        self.assertEqual(outside(), before, "nothing written outside data/real/")
        del members["olist_orders_dataset.csv"]
        (self.downloads / "archive.zip").unlink()
        zip_with(self.downloads / "archive.zip", {**members, evil: csv_bytes(*OLIST_FILES["olist_orders_dataset.csv"])})
        before = outside()
        code, out = self.run_prep(registry(), "--only", "DS-RETAIL-01")
        self.assertEqual(code, 0, out)
        info = json.loads((self.data / "real" / "olist" / "prep.json").read_text(encoding="utf-8"))
        self.assertEqual(info["source"]["members"]["orders"], evil, "read from the zip by its name")
        self.assertEqual(info["tables"]["orders"], 4)
        self.assertEqual(outside(), before, "nothing written outside data/real/")
        for place in (self.tmp / "evil", self.tmp.parent / "evil", self.downloads / "evil", self.data / "evil"):
            self.assertFalse(place.exists(), place.name)

    def test_a_folder_that_cannot_be_listed_is_passed_over_and_named_once(self):
        # Review finding 6: one locked folder in the downloads folder fails no dataset and escapes as no traceback.
        olist_zip(self.downloads)
        (self.downloads / "locked").mkdir()
        original = pathlib.Path.iterdir

        def iterdir(path):
            if path.name == "locked":
                raise PermissionError("the folder is locked")
            return original(path)

        with mock.patch.object(pathlib.Path, "iterdir", iterdir):
            code, out = self.run_prep(registry())
            self.assertEqual(code, 0, out)
            self.assertIn("DS-RETAIL-01 Brazilian E-Commerce Public Dataset by Olist: olist prepared", out)
            self.assertIn("DS-MKT-03 Toy Store E-Commerce Database (Maven Fuzzy Factory): Maven+Fuzzy+Factory.zip is not in the folder", out)
            self.assertEqual(out.count("could not look inside locked"), 1, "named once, by the folder's name")
            self.assertNotIn("FAIL", out)
            code, out = self.run_prep(registry(), "--only", "DS-MKT-03")   # a members entry's not-found message lists the copies again
            self.assertEqual(code, 1, out)
            self.assertIn("could not look inside locked", out)
            self.assertNotIn("Traceback", out)

    def test_member_names_and_tables_are_checked_before_anything_is_touched(self):
        olist_zip(self.downloads)
        before = snapshot(self.data)
        for change, why in ((lambda f: f["members"][0].__setitem__("name", "../olist_customers_dataset.csv"), "not a plain file name"),
                            (lambda f: f["members"][0].__setitem__("name", "folder/olist_customers_dataset.csv"), "not a plain file name"),
                            (lambda f: f["members"][0].__setitem__("table", "Bad Name"), "not a plain table name"),
                            (lambda f: f["members"][1].__setitem__("table", "customers"), "repeats"),
                            (lambda f: f.__setitem__("members", []), "lists no files"),
                            (lambda f: f.__setitem__("inside", "olist_orders_dataset.csv"), "either")):
            reg = registry()
            change(next(r for r in reg["datasets"] if r["id"] == "DS-RETAIL-01")["files"][0])
            with self.subTest(why=why):
                code, out = self.run_prep(reg, "--only", "DS-RETAIL-01")
                self.assertEqual(code, 1, out)
                self.assertIn("FAIL DS-RETAIL-01", out)
                self.assertIn(why, out)
                self.assertEqual(snapshot(self.data), before, "nothing removed or written")


# The two dataset edge files sit with every other edge file; the build runs each one (S8-C34).
DATASET_EDGE = EDGE
DATASET_EDGES = {"olist_edge": ("olist", OLIST_ROWS), "maven_toy_store_edge": ("maven_toy_store", MAVEN_ROWS)}


class DatasetEdgeSchemas(TempDir):
    """S8-16: olist_edge and maven_toy_store_edge, our own rows under the prepared tables' names, columns and types, with the plants the
    dataset cases (H3) ask about."""

    def built(self):
        con = fresh()
        self.addCleanup(con.close)
        for name in DATASET_EDGES:
            con.execute((DATASET_EDGE / f"{name}.sql").read_text(encoding="utf-8"))
        return con

    def test_each_edge_schema_builds_alone_with_the_prepared_tables_columns(self):
        outs = {"olist": self.tmp / "olist", "maven_toy_store": self.tmp / "maven"}
        for out in outs.values():
            out.mkdir()
        olist_zip(self.tmp)
        maven_zip(self.tmp)
        olist.prepare("olist", found(self.tmp, "DS-RETAIL-01"), outs["olist"])
        maven.prepare("maven_toy_store", found(self.tmp, "DS-MKT-03"), outs["maven_toy_store"])
        con = self.built()
        for edge, (schema, rows) in DATASET_EDGES.items():
            tables = sorted(r[0] for r in con.execute("SELECT table_name FROM duckdb_tables() WHERE schema_name = ?", [edge]).fetchall())
            self.assertEqual(tables, sorted(rows), edge)
            for t in tables:
                parquet = [(r[0], r[1]) for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{(outs[schema] / f'{t}.parquet').as_posix()}')").fetchall()]
                ours = con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? "
                                   "ORDER BY ordinal_position", [edge, t]).fetchall()
                self.assertEqual(ours, parquet, f"{edge}.{t}")
                self.assertTrue(1 <= con.execute(f"SELECT count(*) FROM {edge}.{t}").fetchone()[0] <= 40, f"{edge}.{t}")
        self.assertEqual(con.execute("SELECT count(*) FROM duckdb_views() WHERE NOT internal").fetchone()[0], 0, "no view")

    def test_the_olist_plants(self):
        con = self.built()
        one = lambda sql: con.execute(sql).fetchone()[0]   # noqa: E731
        e = "olist_edge"
        self.assertEqual(one(f"SELECT max(n) FROM (SELECT count(*) AS n FROM {e}.orders GROUP BY customer_id)"), 1,
                         "as in the source, every order has its own customer_id")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM (SELECT c.customer_unique_id FROM {e}.orders o JOIN {e}.customers c USING (customer_id) "
                                    f"GROUP BY 1 HAVING count(DISTINCT o.customer_id) >= 2)"), 1, "a returning customer under one customer_unique_id")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.orders WHERE order_delivered_customer_date IS NULL AND order_status <> 'delivered'"), 1,
                                "an order with a missing delivery date that is not delivered")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM (SELECT order_id FROM {e}.order_payments GROUP BY 1 HAVING count(*) >= 2)"), 1,
                                "an order paid in two payments")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.products WHERE product_category_name IS NULL"), 1, "a product with no category")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM (SELECT review_id FROM {e}.order_reviews GROUP BY 1 HAVING count(*) >= 2)"), 1,
                                "a review ID used twice")
        first_canceled = one(f"""SELECT count(*) FROM (SELECT c.customer_unique_id, arg_min(o.order_status, o.order_purchase_timestamp) AS first_status,
                                 count(*) AS orders FROM {e}.orders o JOIN {e}.customers c USING (customer_id) GROUP BY 1)
                                 WHERE first_status = 'canceled' AND orders >= 2""")
        self.assertGreaterEqual(first_canceled, 1, "a customer whose first order was canceled comes back")
        self.assertEqual(one(f"""SELECT count(*) FROM {e}.orders o WHERE round((SELECT sum(price + freight_value) FROM {e}.order_items i
                                 WHERE i.order_id = o.order_id), 2) <> round((SELECT sum(payment_value) FROM {e}.order_payments p
                                 WHERE p.order_id = o.order_id), 2)"""), 0, "each order's payments add up to its items and freight")

    def test_the_maven_plants(self):
        con = self.built()
        one = lambda sql: con.execute(sql).fetchone()[0]   # noqa: E731
        e = "maven_toy_store_edge"
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.website_sessions WHERE utm_source IS NULL"), 1, "a session with no UTM source")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM (SELECT website_session_id FROM {e}.orders GROUP BY 1 HAVING count(*) = 2)"), 1,
                                "a session with two orders")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.website_sessions WHERE website_session_id NOT IN (SELECT website_session_id FROM {e}.orders)"), 1,
                                "a session with no order")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.order_item_refunds r JOIN {e}.order_items i USING (order_item_id)"), 1, "a refund")
        self.assertGreaterEqual(one(f"""SELECT count(*) FROM {e}.orders o JOIN {e}.website_sessions s USING (website_session_id)
                                        WHERE date_trunc('month', o.created_at) <> date_trunc('month', s.created_at)"""), 1,
                                "an order in the month after its session started")
        self.assertEqual(one(f"""SELECT count(*) FROM {e}.orders o WHERE round(o.price_usd, 2) <> round((SELECT sum(price_usd) FROM {e}.order_items i
                                 WHERE i.order_id = o.order_id), 2) OR o.items_purchased <> (SELECT count(*) FROM {e}.order_items i
                                 WHERE i.order_id = o.order_id)"""), 0, "each order's price and item count match its items")
        for table, column in (("orders", "website_session_id"), ("website_pageviews", "website_session_id"), ("order_items", "order_id"),
                              ("order_item_refunds", "order_item_id")):
            ref = {"website_session_id": "website_sessions", "order_id": "orders", "order_item_id": "order_items"}[column]
            self.assertEqual(one(f"SELECT count(*) FROM {e}.{table} WHERE {column} NOT IN (SELECT {column} FROM {e}.{ref})"), 0, f"{table}.{column}")
        # Review finding 2: the pageviews agree with the orders, one thank-you page per order, in its session, at its time.
        self.assertEqual(one(f"""SELECT count(*) FROM {e}.website_sessions s
                                 WHERE (SELECT count(*) FROM {e}.website_pageviews p WHERE p.website_session_id = s.website_session_id
                                        AND p.pageview_url = '/thank-you-for-your-order')
                                    <> (SELECT count(*) FROM {e}.orders o WHERE o.website_session_id = s.website_session_id)"""), 0)
        self.assertEqual(one(f"""SELECT count(*) FROM {e}.orders o WHERE NOT EXISTS (SELECT 1 FROM {e}.website_pageviews p
                                 WHERE p.website_session_id = o.website_session_id AND p.created_at = o.created_at
                                 AND p.pageview_url = '/thank-you-for-your-order')"""), 0)
        self.assertEqual(one(f"""SELECT count(*) FROM {e}.order_items i JOIN {e}.products p USING (product_id)
                                 WHERE i.created_at < p.created_at"""), 0, "no product is sold before it went on sale")

    def test_olist_q1_window_holds_every_plant(self):
        # Review finding 1: DS-RETAIL-01-Q1 (CASE-REAL-03): delivered orders only, a customer by customer_unique_id, cohorts by the
        # month of the first delivered order in 2017, a return on a later day up to 31 August 2018. Each plant must sit in that window.
        con = self.built()
        e = "olist_edge"
        rows = con.execute(f"""
            WITH o AS (SELECT c.customer_unique_id AS person, o.order_status AS status, o.order_purchase_timestamp AS placed
                       FROM {e}.orders o JOIN {e}.customers c USING (customer_id)),
            d AS (SELECT * FROM o WHERE status = 'delivered'),
            f AS (SELECT person, min(placed) AS first_at FROM d GROUP BY 1),
            a AS (SELECT person, min(placed) AS first_any FROM o GROUP BY 1)
            SELECT f.person, f.first_at, a.first_any,
                   count(*) FILTER (WHERE d.placed::DATE > f.first_at::DATE AND d.placed < TIMESTAMP '2018-09-01') AS returns,
                   count(*) FILTER (WHERE d.placed::DATE = f.first_at::DATE) - 1 AS same_day,
                   count(*) FILTER (WHERE d.placed >= TIMESTAMP '2018-09-01') AS after_window,
                   count(*) FILTER (WHERE d.placed >= TIMESTAMP '2017-01-01' AND d.placed < TIMESTAMP '2018-01-01') AS in_2017
            FROM f JOIN a USING (person) JOIN d USING (person) GROUP BY ALL""").fetchall()
        people = {r[0]: dict(zip(("first", "first_any", "returns", "same_day", "after", "in_2017"), r[1:])) for r in rows}
        cohort = {p: v for p, v in people.items() if v["first"].year == 2017}
        march = [v for v in cohort.values() if v["first"].month == 3]
        self.assertEqual(sorted(v["returns"] > 0 for v in march), [False, True], "a March 2017 cohort with one return and one one-time buyer")
        self.assertTrue(any(v["same_day"] > 0 and v["returns"] == 0 for v in cohort.values()), "a second order on the same day is no return")
        self.assertTrue(any(v["after"] > 0 and v["returns"] == 0 for v in cohort.values()), "a return after 31 August 2018 is outside")
        self.assertTrue(any(v["first_any"] < v["first"] and v["first"].month == 6 for v in cohort.values()),
                        "a canceled first order: the cohort is the first delivered order's month")
        self.assertTrue(any(v["first"] == dt.datetime(2017, 1, 31, 23, 50) for v in cohort.values()), "an order at 23:50 on 31 January")
        self.assertTrue(any(v["first"].year == 2016 and v["in_2017"] > 0 for v in people.values()),
                        "a customer first seen in 2016 orders in 2017 and belongs to no 2017 cohort")
        one = lambda sql: con.execute(sql).fetchone()[0]   # noqa: E731
        self.assertGreaterEqual(one(f"""SELECT count(*) FROM {e}.orders WHERE order_status <> 'delivered' AND order_delivered_customer_date IS NULL
                                        AND year(order_purchase_timestamp) = 2017"""), 2, "2017 orders that were never delivered")
        self.assertGreaterEqual(one(f"""SELECT count(*) FROM {e}.order_items i JOIN {e}.orders o USING (order_id) JOIN {e}.products p USING (product_id)
                                        WHERE year(o.order_purchase_timestamp) = 2017 AND (p.product_category_name IS NULL
                                        OR p.product_category_name NOT IN (SELECT product_category_name FROM {e}.product_category_name_translation))"""), 2,
                                "Q3: 2017 items with no category and with an untranslated one")

    def test_maven_q1_window_holds_every_plant(self):
        # Review finding 1: DS-MKT-03-Q1 (CASE-MAVEN-01): sessions, orders and conversion by traffic source for each month of 2013.
        con = self.built()
        one = lambda sql: con.execute(sql).fetchone()[0]   # noqa: E731
        e = "maven_toy_store_edge"
        in_2013 = "s.created_at >= TIMESTAMP '2013-01-01' AND s.created_at < TIMESTAMP '2014-01-01'"
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.website_sessions s WHERE {in_2013} AND utm_source IS NULL AND http_referer IS NULL"), 1)
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.website_sessions s WHERE {in_2013} AND utm_source IS NULL AND http_referer IS NOT NULL"), 1)
        self.assertGreaterEqual(one(f"""SELECT count(*) FROM {e}.website_sessions s JOIN {e}.orders o USING (website_session_id)
                                        WHERE {in_2013} AND s.utm_source IS NULL"""), 1, "a 2013 order from a session with no source")
        self.assertGreaterEqual(one(f"""SELECT count(*) FROM (SELECT s.website_session_id FROM {e}.website_sessions s JOIN {e}.orders o
                                        USING (website_session_id) WHERE {in_2013} GROUP BY 1 HAVING count(*) = 2)"""), 1, "a 2013 session with two orders")
        self.assertGreaterEqual(one(f"""SELECT count(*) FROM {e}.website_sessions s WHERE {in_2013}
                                        AND website_session_id NOT IN (SELECT website_session_id FROM {e}.orders)"""), 2, "2013 sessions with no order")
        months = con.execute(f"""SELECT strftime(s.created_at, '%Y-%m'), strftime(o.created_at, '%Y-%m') FROM {e}.website_sessions s
                                 JOIN {e}.orders o USING (website_session_id) WHERE {in_2013} AND date_trunc('month', s.created_at)
                                 <> date_trunc('month', o.created_at) ORDER BY 1""").fetchall()
        self.assertEqual(months, [("2013-07", "2013-08"), ("2013-12", "2014-01")], "a month boundary inside 2013, and the year's end")
        self.assertEqual(sorted(r[0] for r in con.execute(f"SELECT DISTINCT coalesce(utm_source, 'none') FROM {e}.website_sessions s WHERE {in_2013}").fetchall()),
                         ["bsearch", "gsearch", "none", "socialbook"], "every kind of source in 2013")
        self.assertGreaterEqual(one(f"SELECT count(*) FROM {e}.website_sessions s WHERE {in_2013} AND is_repeat_session = 1"), 1)

    def test_each_edge_file_creates_and_inserts_only_into_its_own_schema(self):
        scratch = fresh()
        self.addCleanup(scratch.close)
        target = re.compile(r"(?is)^(?:CREATE\s+SCHEMA\s+(\w+)|CREATE\s+TABLE\s+(\w+)\.\w+|INSERT\s+INTO\s+(\w+)\.\w+)")
        for name in DATASET_EDGES:
            statements = scratch.extract_statements((DATASET_EDGE / f"{name}.sql").read_text(encoding="utf-8"))
            with self.subTest(file=name):
                self.assertTrue(statements)
                for st in statements:
                    self.assertIn(st.type, (duckdb.StatementType.CREATE, duckdb.StatementType.INSERT))
                    m = target.match(re.sub(r"--[^\n]*", "", st.query).strip())
                    self.assertIsNotNone(m)
                    self.assertEqual(next(g for g in m.groups() if g), name)

    def test_each_description_assigns_every_line_to_a_table_its_file_creates(self):
        for name, (schema, rows) in DATASET_EDGES.items():
            with self.subTest(schema=name):
                d = json.loads((ROOT / "content" / "sql" / "edge" / f"{name}.json").read_text(encoding="utf-8"))
                self.assertEqual((d["schema"], d["mirrors"], d["family"]), (name, schema, "real" if schema == "olist" else "fictional"))
                created = set(re.findall(rf"CREATE TABLE {name}\.(\w+)", (DATASET_EDGE / f"{name}.sql").read_text(encoding="utf-8")))
                self.assertEqual(created, set(rows))
                self.assertTrue(d["contains"] and set(d["tables"]) <= created)
                listed = [line for lines in d["tables"].values() for line in lines]
                self.assertEqual(set(d["contains"]), set(listed), "every line sits under a table, and every table line is a line")
                for table, lines in d["tables"].items():
                    self.assertEqual(lines, [x for x in d["contains"] if x in lines], f"{table}: lines once each, in their order")
                raw = json.dumps(d, ensure_ascii=False)
                self.assertNotRegex(raw, r"\bNULL\b|\bempty\b|—", "missing, not NULL; no em dash")
                self.assertNotRegex(raw, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")


if __name__ == "__main__":
    unittest.main()

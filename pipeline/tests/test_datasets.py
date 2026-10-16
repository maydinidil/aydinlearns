"""Sprint 6 Part 2, Task G2: the real datasets' prep package, pipeline/datasets/ (Stage A: S6-22, D84, D87, S6-39), and the data
build's import of what it prepared (Stage B: S6-23, ruling P38).

Everything runs on fixtures this file generates: a tiny workbook built with zipfile (shared strings, inline strings, rich-text
runs, numbers, date and datetime serials, empty cells), the two Excel datasets' workbooks in their zips, and the three small
SQL scripts in pipeline/tests/fixtures/ (invented, nothing from the 8 Week SQL Challenge). The owner's downloads are never
read: the real files are prepared by the controller (the brief's Step 5). The builds here go to temporary folders, never to
data/. Every DuckDB instance follows R17.
"""
import contextlib
import datetime as dt
import hashlib
import io
import json
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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import build_course_db  # noqa: E402
from datasets import breakfast_at_the_frat as baf  # noqa: E402
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

PREPARED = ("online_retail_ii", "foodie_fi")
REAL_EDGES = {"online_retail_ii_edge": ("invoice_lines",), "breakfast_at_the_frat_edge": ("products", "stores", "transactions")}


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
    ran on fixture downloads (Online Retail II, and one 8 Week SQL Challenge script), with a folder no registry dataset names in
    data/real/ and a copy of a prepared dataset outside it, neither of which may be read."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = pathlib.Path(tempfile.mkdtemp())
        downloads = cls.tmp / "downloads"
        (downloads / "8-week-sql-challenge").mkdir(parents=True)
        orii_zip(downloads)
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
        self.assertEqual({re.search(r"read_parquet\('([^']+)'\)", s).group(1) for s in reads}, expected)
        self.assertFalse([s for s in self.sql if "not_in_registry" in s])

    def test_an_absent_data_real_builds_as_today(self):
        self.assertFalse(set(PREPARED) & self.schemas("without"))
        self.assertFalse((self.without_dir / "real").exists(), "the build makes no data/real/")
        with_notes = [n for n in self.read(self.with_dir, "schema-notes.json") if n["schema"] not in PREPARED]
        self.assertEqual(self.read(self.without_dir, "schema-notes.json"), with_notes)
        for name in ("voltmarkt.json", "mailvora.json"):
            self.assertEqual(self.read(self.without_dir / "truth", name), self.read(self.with_dir / "truth", name), name)


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


if __name__ == "__main__":
    unittest.main()

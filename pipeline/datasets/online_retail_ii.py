"""pipeline/datasets/online_retail_ii.py: Online Retail II (DS-RETAIL-02, UCI Machine Learning Repository, CC BY 4.0).

The download is online+retail+ii.zip, holding online_retail_II.xlsx: two sheets of invoice lines, the years 2009-2010 and
2010-2011, with the same eight columns. Both are read (xlsx.py, D84) into one table, online_retail_ii.invoice_lines, one row per
invoice line, every line kept as the source has it (cancellations, missing customers, negative quantities, postage and other
non-product codes, repeated rows are the data's lessons):

  invoice       text      Invoice: a number, or C and a number for a cancellation
  stock_code    text      StockCode: a code, so 85123 and 85123A are both text
  description   text      Description
  quantity      integer   Quantity
  invoice_date  timestamp InvoiceDate, to the second
  price         double    Price, per unit in pounds sterling
  customer_id   integer   Customer ID (13085.0 in the sheet is 13085); missing on many lines
  country       text      Country

E-068: the two sheets overlap in December 2010. A row of the second sheet that is identical in every column to a December 2010
row of the first is the same line twice, so it is removed and counted (as often as the first sheet holds it: a row repeated
inside one sheet is the source's own and stays). The rows each sheet holds are checked against the published counts, 525,461
and 541,910 (the brief's Step 5; 1,067,371 together); a difference warns and is recorded, and the prep goes on.

Manual steps (E-069): download the zip from the UCI page and keep it zipped; the prep reads the workbook inside it, or the
workbook itself when it was unzipped.
"""
from __future__ import annotations

import pathlib
from collections import Counter

from datasets import ParquetTable, PrepError
from datasets import xlsx

TABLE = "invoice_lines"
# The schema panel's note for the table (datasets/notes.py): grain, primary key (none: the source repeats some lines), links,
# and a line per column. The edge schema online_retail_ii_edge uses the same.
NOTES = {
    TABLE: ("one row per invoice line", [], [], {
        "invoice": "The invoice number. One that starts with C is a cancellation, and its quantities are negative.",
        "stock_code": "The product code, as text. POST (postage) and a few other codes are not products but fees or adjustments.",
        "description": "The product's name; missing on some lines.",
        "quantity": "Units on the line: negative on a cancellation, and on some stock adjustments.",
        "invoice_date": "The date and time of the invoice.",
        "price": "The price of one unit, in pounds sterling.",
        "customer_id": "The customer's number; missing on many lines.",
        "country": "The customer's country.",
    }),
}
HEADER = ["Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price", "Customer ID", "Country"]
COLUMNS = [xlsx.Column("invoice", "text"), xlsx.Column("stock_code", "text"), xlsx.Column("description", "text"),
           xlsx.Column("quantity", "int"), xlsx.Column("invoice_date", "datetime"), xlsx.Column("price", "float"),
           xlsx.Column("customer_id", "int"), xlsx.Column("country", "text")]
DATE = 4
PUBLISHED_ROWS = (525_461, 541_910)
OVERLAP_MONTH = (2010, 12)


def prepare(schema: str, source, out: pathlib.Path) -> dict:
    """Reads the workbook (source.path, or source.inside the zip at source.path) into out/invoice_lines.parquet."""
    with xlsx.Workbook(source.path, source.inside) as wb:
        sheets = wb.sheet_names
        if len(sheets) != 2:
            raise PrepError(f"Online Retail II has two sheets, 2009-2010 and 2010-2011; this workbook has {len(sheets)}: "
                            f"{', '.join(sheets)}")
        first_december: Counter = Counter()
        overlap = 0
        stats = []
        with ParquetTable(out / f"{TABLE}.parquet", COLUMNS) as table:
            for k, sheet in enumerate(sheets):
                st = xlsx.SheetStats(sheet)
                for record in xlsx.read_records(wb, sheet, HEADER, COLUMNS, stats=st):
                    when = record[DATE]
                    december = when is not None and (when.year, when.month) == OVERLAP_MONTH
                    if k == 0 and december:
                        first_december[record] += 1
                    elif k == 1 and december and first_december[record] > 0:
                        first_december[record] -= 1
                        overlap += 1
                        continue
                    table.add(record)
                stats.append(st)
        written = table.rows
    read = [s.rows for s in stats]
    warnings = []
    published_ok = tuple(read) == PUBLISHED_ROWS
    if not published_ok:
        warnings.append(f"Online Retail II: the sheets hold {read[0]:,} and {read[1]:,} rows; the published counts are "
                        f"{PUBLISHED_ROWS[0]:,} and {PUBLISHED_ROWS[1]:,}")
    for s in stats:
        if s.rows_after_empty:
            warnings.append(f"Online Retail II: sheet {s.sheet!r} has {s.rows_after_empty:,} rows after an empty row, not read")
    return {
        "tables": {TABLE: written},
        "checks": {
            "sheets": [s.as_dict() for s in stats],
            "published_rows": {"expected": list(PUBLISHED_ROWS), "read": read, "ok": published_ok},
            "overlap_removed": overlap,
            "rows_written": written,
        },
        "warnings": warnings,
        # Review M4: the counts the controller's Step 5 reads from the console.
        "summary": f"sheets {read[0]:,} and {read[1]:,} rows; overlap removed {overlap:,}; rows written {written:,}",
    }

"""pipeline/datasets: the real datasets' prep (sprint 6 Part 2; S6-22, D84, D87, E-026).

`npm run prep:datasets -- --from <folder>` (tools/prep-datasets.ts) runs prep.py, which finds each registry dataset's file in
the owner's own download folder, checks its fingerprint, and hands it to the dataset's prep module (the registry's `prep`):
online_retail_ii.py and breakfast_at_the_frat.py read their Excel workbooks with xlsx.py, the standard-library reader (D84);
wsc.py loads the 8 Week SQL Challenge's PostgreSQL scripts in a scratch DuckDB with external access off. Each writes Parquet
to data/real/<schema>/<table>.parquet, and prep.py writes data/real/<schema>/prep.json beside it. Nothing else is written,
the downloads are never changed or unpacked on disk, and no data file is ever committed (design §10). The data is prepared
in DuckDB only (E-078). The data build (pipeline/build_course_db.py) then imports each prepared schema into data/course.duckdb,
writes its schema notes with notes.py, and records it in the manifest's `real` section, outside dataset_version (S6-23).
"""
from __future__ import annotations

import hashlib
import pathlib

# Ruling R17: no DuckDB instance may download an extension; TimeZone is SET after opening.
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}
# Where the prepared datasets go, under the data folder (data/real/<schema>/).
REAL_DIR = "real"
BATCH_ROWS = 50_000


class PrepError(Exception):
    """A prep that cannot go on. Its message names the dataset, file, sheet, row, column or statement."""


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


# The Parquet type of each reader column kind (xlsx.Column.kind). DuckDB reads them as VARCHAR, INTEGER, DOUBLE, DATE and
# TIMESTAMP: the edge schemas' columns (pipeline/edge/<schema>_edge.sql) use the same types.
def arrow_type(kind: str):
    import pyarrow as pa
    return {"text": pa.string(), "int": pa.int32(), "float": pa.float64(), "date": pa.date32(), "datetime": pa.timestamp("us")}[kind]


class ParquetTable:
    """One table written to Parquet in batches, so a sheet of half a million rows never sits in memory whole."""

    def __init__(self, path: pathlib.Path, columns):
        import pyarrow as pa
        import pyarrow.parquet as pq
        self._pa = pa
        self._columns = list(columns)
        self.schema = pa.schema([(c.name, arrow_type(c.kind)) for c in self._columns])
        self._writer = pq.ParquetWriter(str(path), self.schema)
        self._batch: list[tuple] = []
        self.rows = 0

    def add(self, record: tuple) -> None:
        self._batch.append(record)
        if len(self._batch) >= BATCH_ROWS:
            self._flush()

    def _flush(self) -> None:
        if not self._batch:
            return
        arrays = [self._pa.array([r[k] for r in self._batch], type=self.schema.field(k).type) for k in range(len(self._columns))]
        self._writer.write_table(self._pa.Table.from_arrays(arrays, schema=self.schema))
        self.rows += len(self._batch)
        self._batch = []

    def close(self) -> None:
        self._flush()
        self._writer.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        # After a failure the file is closed without its last batch (the prep removes its work folder): an open handle would
        # keep Windows from removing it.
        if exc_type is None:
            self.close()
        else:
            self._writer.close()

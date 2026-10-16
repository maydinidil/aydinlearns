"""pipeline/datasets/prep.py: prepares the registry's datasets from the owner's own downloads (S6-22).

    npm run prep:datasets -- --from <your downloads folder> [--only <dataset ID or alias>]

(tools/prep-datasets.ts runs this in the pipeline's venv, in isolated mode, then the data build.) For each dataset in
content/datasets/registry.json, or only the one named, and each of its schemas:
- find the registry's file in the folder or a folder inside it: the zip, or the workbook unzipped from it (`inside`);
- check its fingerprint (SHA-256) against the registry's. A difference warns and is recorded in prep.json; the prep goes on.
  An unzipped workbook cannot be checked against the zip's fingerprint, so its own is recorded;
- hand it to the dataset's prep module (the registry's `prep` script) to write data/real/<schema>/<table>.parquet, and write
  data/real/<schema>/prep.json: the source's name and fingerprint, the row counts, the checks and the time it was prepared.
Each schema is prepared in a work folder inside data/real/. When it is done the last prepared copy is moved aside, the work folder
takes its place, and only then is the old copy removed; if the swap fails, the old copy is put back. So a failure leaves the last
prepared copy as it was. Before anything is touched, every schema name, file name and `inside` path the record gives is checked
(review M3), so a registry entry such as a schema named `..` cannot point outside data/real/. Nothing is written outside
data/real/, and the downloads are never changed or unpacked on disk. One line of checks per schema is printed, counts only.

A file that is not there is named with its dataset, and the other datasets are still prepared. Any failure (a refused file, a
damaged one, an error the prep did not foresee) is one FAIL line naming the dataset and schema, and the next datasets still run.
The exit code is 0 when at least one schema was prepared and none failed; 1 when one failed, when --only names a dataset none of
whose files are there, or when nothing was found at all; 2 for a wrong argument.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
import pathlib
import posixpath
import re
import shutil
import sys
from dataclasses import dataclass

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
if str(HERE.parent) not in sys.path:
    sys.path.insert(0, str(HERE.parent))   # pipeline/, so `datasets` imports when this runs as a script in isolated mode
from datasets import REAL_DIR, PrepError, sha256_file  # noqa: E402
from datasets.xlsx import XlsxError  # noqa: E402

REGISTRY = ROOT / "content" / "datasets" / "registry.json"
DATA = ROOT / "data"
PREP_SCRIPT = re.compile(r"^pipeline/datasets/([a-z_][a-z0-9_]*)\.py$")
# The registry's rules (schemas/dataset.ts), checked again here before any path is made from them (review M3).
SCHEMA_NAME = re.compile(r"^[a-z_][a-z0-9_]*$")
FILE_NAME = re.compile(r'^[^/\\:*?"<>|]+$')


def check_record(record: dict) -> None:
    """Every schema name, file name and `inside` path of a record, before any path is made from them: a schema name is a plain
    name, a file name has no folder in it, and `inside` is a relative path inside the zip, with no `..`, no drive and no
    backslash."""
    for s in record.get("schemas", []):
        name = s.get("name") if isinstance(s, dict) else None
        if not isinstance(name, str) or not SCHEMA_NAME.match(name):
            raise PrepError(f"the registry's schema {name!r} is not a plain schema name; nothing was touched")
    for f in record.get("files", []):
        name = f.get("name") if isinstance(f, dict) else None
        if not isinstance(name, str) or not FILE_NAME.match(name) or ".." in name:
            raise PrepError(f"the registry's file {name!r} is not a plain file name; nothing was touched")
        inside = f.get("inside")
        if inside is not None and (not isinstance(inside, str) or not inside or inside.startswith("/") or "\\" in inside
                                   or ":" in inside or ".." in inside.split("/")):
            raise PrepError(f"the registry's inside {inside!r} is not a path inside the zip; nothing was touched")


@dataclass
class Source:
    """A registry file found in the download folder. `inside` is the workbook's path in the zip at `path`, or None when `path`
    is the file itself. `fingerprint` is matches, differs, or unzipped (a workbook found without its zip)."""
    name: str
    path: pathlib.Path
    inside: str | None
    sha256: str
    expected: str
    fingerprint: str


def find(folder: pathlib.Path, entry: dict) -> Source | None:
    """The registry file `entry` in `folder` or a folder directly inside it; else the workbook it holds, unzipped there."""
    places = [folder] + sorted(p for p in folder.iterdir() if p.is_dir())
    for place in places:
        path = place / entry["name"]
        if path.is_file():
            actual = sha256_file(path)
            return Source(entry["name"], path, entry.get("inside"), actual, entry["sha256"],
                          "matches" if actual == entry["sha256"] else "differs")
    inside = entry.get("inside")
    if inside:
        candidates = [folder / inside] + [place / posixpath.basename(inside) for place in places]
        for path in candidates:
            if path.is_file():
                return Source(entry["name"], path, None, sha256_file(path), entry["sha256"], "unzipped")
    return None


def schema_files(record: dict) -> list[tuple[str, dict]]:
    """Each schema of a record with the file it is prepared from (a one-schema record has one file)."""
    schemas = [s["name"] for s in record["schemas"]]
    if len(schemas) == 1:
        return [(schemas[0], record["files"][0])]
    by_schema = {f.get("schema"): f for f in record["files"]}
    return [(s, by_schema[s]) for s in schemas]


def prep_module(record: dict):
    m = PREP_SCRIPT.match(record.get("prep", ""))
    if not m or not (HERE / f"{m.group(1)}.py").is_file():
        raise PrepError(f"its prep script {record.get('prep')!r} is not a script in pipeline/datasets/")
    return importlib.import_module(f"datasets.{m.group(1)}")


def swap_in(work: pathlib.Path, final: pathlib.Path) -> None:
    """Review M3: the finished work folder takes the place of the last prepared copy. The old copy is moved aside first and
    removed only once the new one is in place; if that move fails, the old copy is put back."""
    old = final.with_name(f".{final.name}.old")
    shutil.rmtree(old, ignore_errors=True)
    had = final.exists()
    if had:
        final.rename(old)
    try:
        work.rename(final)
    except BaseException:
        if had:
            old.rename(final)
        raise
    if had:
        shutil.rmtree(old, ignore_errors=True)


def prepare_schema(record: dict, schema: str, source: Source, real: pathlib.Path, module, say) -> dict:
    if not SCHEMA_NAME.match(schema):   # check_record ran first; this is the last guard before a path is made
        raise PrepError(f"the schema {schema!r} is not a plain schema name")
    work = real / f".{schema}.work"
    real.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    try:
        result = module.prepare(schema, source, work)
        info = {
            "dataset": record["id"],
            "name": record["name"],
            "schema": schema,
            "real": record["real"],
            "label": record["label"],
            "licence": record["licence"]["name"],
            "source": {"file": source.name, "inside": source.inside, "found": source.path.name, "sha256": source.sha256,
                       "expected_sha256": source.expected, "fingerprint": source.fingerprint},
            "tables": result["tables"],
            "checks": result["checks"],
            "warnings": result["warnings"],
            "prepared_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        }
        (work / "prep.json").write_text(json.dumps(info, indent=2, ensure_ascii=False), encoding="utf-8")
        swap_in(work, real / schema)
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise
    for w in result["warnings"]:
        say(f"WARN {record['id']} {w}")
    if result.get("summary"):
        say(f"{record['id']} checks ({schema}): {result['summary']}")   # review M4: counts only
    rows = ", ".join(f"{t} {n:,} rows" for t, n in result["tables"].items())
    say(f"{record['id']} {record['name']}: {schema} prepared ({rows})")
    return info


def prepare_dataset(record: dict, folder: pathlib.Path, real: pathlib.Path, say) -> str:
    """Prepares every schema of one record whose file is there. Returns prepared, missing or failed. Its names and paths are
    checked before anything is touched; any failure is one FAIL line naming the dataset (and schema), never a traceback."""
    who = f"{record.get('id')} {record.get('name')}"
    try:
        check_record(record)
        module = prep_module(record)
        plan = schema_files(record)
    except PrepError as e:
        say(f"FAIL {who}: {e}")
        return "failed"
    except Exception as e:  # noqa: BLE001  (a registry entry this code did not foresee)
        say(f"FAIL {who}: the registry entry could not be read ({type(e).__name__}: {e})")
        return "failed"
    prepared = missing = 0
    for schema, entry in plan:
        source = find(folder, entry)
        if source is None:
            missing += 1
            also = f" (or the workbook inside it, {posixpath.basename(entry['inside'])})" if entry.get("inside") else ""
            say(f"{record['id']} {record['name']}: {entry['name']}{also} is not in the folder or a folder inside it. "
                f"Get it from {entry.get('url') or record['source_url']}, then run the prep again.")
            continue
        if source.fingerprint == "differs":
            say(f"WARN {record['id']} {record['name']}: {source.name}'s fingerprint differs from the registry's; it is recorded "
                f"in prep.json, and the prep goes on")
        elif source.fingerprint == "unzipped":
            say(f"{record['id']} {record['name']}: found the unzipped workbook {source.path.name}; its fingerprint is recorded, "
                f"since the registry's is the zip's")
        say(f"{record['id']} {record['name']}: reading {source.path.name} into {schema}")
        try:
            prepare_schema(record, schema, source, real, module, say)
        except (PrepError, XlsxError) as e:
            say(f"FAIL {who}: {schema} was not prepared: {e}")
            return "failed"
        except Exception as e:  # noqa: BLE001  (review M1: a damaged file, a full disk, a locked folder)
            say(f"FAIL {who}: {schema} was not prepared ({type(e).__name__}: {e})")
            return "failed"
        prepared += 1
    return "prepared" if prepared else "missing"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="npm run prep:datasets --", description="Prepare the registry's datasets from your downloads.")
    parser.add_argument("--from", dest="source", required=True, metavar="FOLDER", help="the folder that holds your downloaded files")
    parser.add_argument("--only", metavar="ID", help="one dataset ID or alias, such as DS-RETAIL-02")
    parser.add_argument("--data", default=str(DATA), help=argparse.SUPPRESS)
    parser.add_argument("--registry", default=str(REGISTRY), help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    def say(line: str) -> None:
        print(line, flush=True)

    folder = pathlib.Path(args.source)
    if not folder.is_dir():
        say(f"The folder {args.source} does not exist.")
        return 2
    every = json.loads(pathlib.Path(args.registry).read_text(encoding="utf-8"))["datasets"]
    records = [r for r in every if not args.only or args.only == r["id"] or args.only in r.get("aliases", [])]
    if not records:
        say(f"No dataset {args.only} in the registry. Its datasets: {', '.join(r['id'] for r in every)}.")
        return 2
    real = pathlib.Path(args.data) / REAL_DIR   # made by the first schema that is prepared, never before
    outcomes = {}
    for record in records:
        try:
            outcomes[record["id"]] = prepare_dataset(record, folder, real, say)
        except PrepError as e:
            say(f"FAIL {record['id']}: {e}")
            outcomes[record["id"]] = "failed"
    if "failed" in outcomes.values():
        return 1
    if "prepared" not in outcomes.values():
        say("Nothing was prepared: no registry file is in that folder.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

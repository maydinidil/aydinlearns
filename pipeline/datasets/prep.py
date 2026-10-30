"""pipeline/datasets/prep.py: prepares the registry's datasets from the owner's own downloads (S6-22).

    npm run prep:datasets -- --from <your downloads folder> [--only <dataset ID or alias>]

(tools/prep-datasets.ts runs this in the pipeline's venv, in isolated mode, then the data build.) For each dataset in
content/datasets/registry.json, or only the one named, and each of its schemas:
- find the registry's file in the folder or a folder inside it: the zip, or the workbook unzipped from it (`inside`). A browser
  saves a second download of a name as a copy, `<name> (N).<ext>` (Kaggle names every download archive.zip, so the owner's Olist
  zip is archive (2).zip), and every copy of the name counts (S8-16). For a zip of CSV files (`members`), only a copy that holds
  each listed file once, found by its file name anywhere in the zip, can be used. Of the copies that can, the newest whose
  fingerprint matches the registry's is used, else the newest; when there is more than one copy, or the one used is a copy, the
  prep says which it used and why;
- check its fingerprint (SHA-256) against the registry's. A difference warns and is recorded in prep.json; the prep goes on.
  An unzipped workbook cannot be checked against the zip's fingerprint, so its own is recorded;
- hand it to the dataset's prep module (the registry's `prep` script) to write data/real/<schema>/<table>.parquet, and write
  data/real/<schema>/prep.json: the source's name and fingerprint, the row counts, the checks and the time it was prepared.
Each schema is prepared in a work folder inside data/real/. When it is done the last prepared copy is moved aside, the work folder
takes its place, and only then is the old copy removed; if the swap fails, the old copy is put back. So a failure leaves the last
prepared copy as it was. Before anything is touched, every schema name, file name, `inside` path and member the record gives is
checked (review M3), so a registry entry such as a schema named `..` cannot point outside data/real/. Nothing is written outside
data/real/, and the downloads are never changed or unpacked on disk. One line of checks per schema is printed, counts only, and a
zip's files that are not read (Olist's geolocation file) are named.

A file that is not there, or a zip that lacks a file the prep reads, is named with its dataset, and the other datasets are still
prepared. Any failure (a refused file, a damaged one, an error the prep did not foresee) is one FAIL line naming the dataset and
schema, and the next datasets still run.
The exit code is 0 when at least one schema was prepared and none failed; 1 when one failed, when --only names a dataset none of
whose files are there, or when nothing was found at all; 2 for a wrong argument.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib
import json
import os
import pathlib
import posixpath
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass, field

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
    """Every schema name, file name, `inside` path and member of a record, before any path is made from them: a schema name is a
    plain name, a file name has no folder in it, `inside` is a relative path inside the zip, with no `..`, no drive and no
    backslash, and a zip's members (S8-16) are plain file names, each loading a table with a plain name, none twice."""
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
        if "members" in f:
            check_members(name, f)


def check_members(name: str, f: dict) -> None:
    """S8-16: a zip's members, as schemas/dataset.ts checks them."""
    members = f.get("members")
    if f.get("inside") is not None:
        raise PrepError(f"the registry's file {name!r} names either the workbook inside the zip or the files it holds, not both; "
                        f"nothing was touched")
    if not isinstance(members, list) or not members:
        raise PrepError(f"the registry's file {name!r} lists no files the zip holds; nothing was touched")
    names, tables = set(), set()
    for m in members:
        member = m.get("name") if isinstance(m, dict) else None
        table = m.get("table") if isinstance(m, dict) else None
        if not isinstance(member, str) or not FILE_NAME.match(member) or ".." in member:
            raise PrepError(f"the registry's member {member!r} is not a plain file name; nothing was touched")
        if not isinstance(table, str) or not SCHEMA_NAME.match(table):
            raise PrepError(f"the registry's table {table!r} is not a plain table name; nothing was touched")
        if member.casefold() in names or table in tables:
            raise PrepError(f"the registry's file {name!r} repeats the member {member!r} or the table {table!r}; nothing was touched")
        names.add(member.casefold())
        tables.add(table)


@dataclass
class Source:
    """A registry file found in the download folder. `inside` is the workbook's path in the zip at `path`, or None when `path`
    is the file itself. `fingerprint` is matches, differs, or unzipped (a workbook found without its zip). For a zip of CSV files
    (S8-16), `members` maps each table to its file's path in the zip and `unread` lists the zip's other files. `copies` names every
    copy of the registry's name that was found, newest first, and `why` says why this one was used."""
    name: str
    path: pathlib.Path
    inside: str | None
    sha256: str
    expected: str
    fingerprint: str
    members: dict = field(default_factory=dict)
    unread: list = field(default_factory=list)
    copies: list = field(default_factory=list)
    why: str = ""


def copy_number(found: str, name: str) -> int | None:
    """0 when `found` is `name`, N when it is a browser's copy of it, `<stem> (N)<ext>`, else None. Windows names ignore case."""
    stem, ext = os.path.splitext(name)
    if found.casefold() == name.casefold():
        return 0
    m = re.fullmatch(re.escape(stem) + r" \((\d+)\)" + re.escape(ext), found, re.IGNORECASE)
    return int(m.group(1)) if m else None


def listing(place: pathlib.Path, unsearched: set | None) -> list[pathlib.Path]:
    """The entries of one folder; none when it cannot be listed (a folder Windows locks, or one without permission), whose name then
    goes into `unsearched` so the prep can say it was not searched. Review finding 6: one such folder must not fail every dataset."""
    try:
        return list(place.iterdir())
    except OSError:
        if unsearched is not None:
            unsearched.add(place.name)
        return []


def copies_of(folder: pathlib.Path, name: str, unsearched: set | None = None) -> list[pathlib.Path]:
    """`name` and a browser's copies of it, in `folder` or a folder directly inside it, newest first: by modification time, then
    the higher copy number, then the folder before the folders inside it. A folder that cannot be listed, or a file that vanishes
    while it is looked at, is passed over."""
    places = [folder] + sorted(p for p in listing(folder, unsearched) if p.is_dir())
    found = []
    for k, place in enumerate(places):
        for path in listing(place, unsearched):
            n = copy_number(path.name, name)
            if n is None or not path.is_file():
                continue
            try:
                found.append((path.stat().st_mtime, n, -k, path))
            except OSError:
                continue
    return [path for *_, path in sorted(found, key=lambda x: x[:3], reverse=True)]


@dataclass
class Holding:
    """What a zip holds of a record's members: each table's file path in the zip, the zip's other files, and the members it
    lacks or holds twice. `readable` is False when the file is no zip."""
    tables: dict
    unread: list
    missing: list
    twice: list
    readable: bool = True

    @property
    def complete(self) -> bool:
        return self.readable and not self.missing and not self.twice


def holding(path: pathlib.Path, members: list) -> Holding:
    """S8-16: each member found by its file name wherever it sits in the zip at `path` (a folder's own entry and a macOS resource
    fork, under __MACOSX/, are no files). Reads the zip's list of files only."""
    try:
        with zipfile.ZipFile(path) as zf:
            files = [n for n in zf.namelist() if not n.endswith("/") and not n.startswith("__MACOSX/")]
    except (zipfile.BadZipFile, OSError, ValueError, EOFError):
        return Holding({}, [], [m["name"] for m in members], [], readable=False)
    by_name: dict[str, list[str]] = {}
    for n in files:
        by_name.setdefault(posixpath.basename(n.replace("\\", "/")).casefold(), []).append(n)
    tables, missing, twice = {}, [], []
    for m in members:
        hits = by_name.get(m["name"].casefold(), [])
        if not hits:
            missing.append(m["name"])
        elif len(hits) > 1:
            twice.append(m["name"])
        else:
            tables[m["table"]] = hits[0]
    used = set(tables.values())
    return Holding(tables, sorted(n for n in files if n not in used), missing, twice)


def find(folder: pathlib.Path, entry: dict, unsearched: set | None = None) -> Source | None:
    """The registry file `entry` in `folder` or a folder directly inside it, or a browser's copy of it (S8-16); else the workbook
    it holds, unzipped there. For a zip of CSV files, only a copy that holds every member can be used. Of those that can, the
    newest whose fingerprint matches the registry's is used, else the newest."""
    copies = copies_of(folder, entry["name"], unsearched)
    members = entry.get("members")
    usable = []
    for path in copies:
        held = holding(path, members) if members else None
        if held is None or held.complete:
            usable.append((path, held))
    digests = {}
    chosen = None
    for path, held in usable:
        digests[path] = sha256_file(path)
        if digests[path] == entry["sha256"]:
            chosen, why = (path, held), "whose fingerprint matches the registry's"
            break
    if chosen is None and usable:
        chosen = usable[0]
        why = "the newest that holds the files the prep reads" if members else "the newest"
    if chosen is not None:
        path, held = chosen
        actual = digests[path]
        if len(copies) == 1 and path.name != entry["name"]:
            why = f"a copy of {entry['name']}"
        elif len(copies) == 1:
            why = ""
        return Source(entry["name"], path, entry.get("inside"), actual, entry["sha256"],
                      "matches" if actual == entry["sha256"] else "differs",
                      members=held.tables if held else {}, unread=held.unread if held else [],
                      copies=[p.name for p in copies], why=why)
    inside = entry.get("inside")
    if inside and not copies:
        places = [folder] + sorted(p for p in listing(folder, unsearched) if p.is_dir())
        candidates = [folder / inside] + [place / posixpath.basename(inside) for place in places]
        for path in candidates:
            if path.is_file():
                return Source(entry["name"], path, None, sha256_file(path), entry["sha256"], "unzipped")
    return None


def not_found(folder: pathlib.Path, entry: dict, unsearched: set | None = None) -> str:
    """Why `entry` was not found, for its dataset's line: the file is not there, or (S8-16) no copy of it holds every file the
    prep reads, naming what the closest copy lacks."""
    also = f" (or the workbook inside it, {posixpath.basename(entry['inside'])})" if entry.get("inside") else ""
    copies = copies_of(folder, entry["name"], unsearched) if entry.get("members") else []
    if not copies:
        return f"{entry['name']}{also} is not in the folder or a folder inside it"
    helds = [(p, holding(p, entry["members"])) for p in copies]
    path, held = min(helds, key=lambda x: (len(x[1].missing) + len(x[1].twice), copies.index(x[0])))
    if not held.readable:
        lack = "is not a zip that can be read"
    elif held.missing:
        more = len(held.missing) - 1
        lack = f"has no {held.missing[0]}" + (f" and {more} more of them" if more else "")
    else:
        lack = f"holds {held.twice[0]} twice"
    if len(copies) == 1:
        named = "" if copies[0].name == entry["name"] else f" as {copies[0].name}"
        return f"{entry['name']} is in the folder{named}, but it does not hold every file the prep reads: it {lack}"
    return (f"{entry['name']} is in the folder ({len(copies)} copies: {', '.join(p.name for p in copies)}), but none holds every file "
            f"the prep reads: {path.name} {lack}")


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
        found = {"file": source.name, "inside": source.inside, "found": source.path.name, "sha256": source.sha256,
                 "expected_sha256": source.expected, "fingerprint": source.fingerprint}
        if source.members:   # S8-16: a zip of CSV files: each table's file in the zip, and the files not read
            found.update({"members": dict(source.members), "not_read": list(source.unread)})
        info = {
            "dataset": record["id"],
            "name": record["name"],
            "schema": schema,
            "real": record["real"],
            "label": record["label"],
            "licence": record["licence"]["name"],
            "source": found,
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
    if source.unread:   # S8-16: Olist's geolocation file, Maven's data dictionary
        say(f"{record['id']} {record['name']}: not read from {source.path.name}: {', '.join(source.unread)}")
    rows = ", ".join(f"{t} {n:,} rows" for t, n in result["tables"].items())
    say(f"{record['id']} {record['name']}: {schema} prepared ({rows})")
    return info


def prepare_dataset(record: dict, folder: pathlib.Path, real: pathlib.Path, say, unsearched: set | None = None) -> str:
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
        try:
            source = find(folder, entry, unsearched)
        except OSError as e:   # a file that cannot be read while its fingerprint is taken
            say(f"FAIL {who}: {entry['name']} could not be read ({type(e).__name__})")
            return "failed"
        if source is None:
            missing += 1
            say(f"{record['id']} {record['name']}: {not_found(folder, entry, unsearched)}. "
                f"Get it from {entry.get('url') or record['source_url']}, then run the prep again.")
            continue
        if source.why and len(source.copies) > 1:
            say(f"{record['id']} {record['name']}: {len(source.copies)} copies of {entry['name']} are in the folder "
                f"({', '.join(source.copies)}); using {source.path.name}, {source.why}")
        elif source.why:
            say(f"{record['id']} {record['name']}: using {source.path.name}, {source.why}")
        if source.fingerprint == "differs":
            say(f"WARN {record['id']} {record['name']}: {source.path.name}'s fingerprint differs from the registry's; it is recorded "
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
    unsearched: set = set()   # the folders inside the downloads folder that could not be listed
    for record in records:
        try:
            outcomes[record["id"]] = prepare_dataset(record, folder, real, say, unsearched)
        except PrepError as e:
            say(f"FAIL {record['id']}: {e}")
            outcomes[record["id"]] = "failed"
    if unsearched:   # review finding 6: named once, by folder name only, never a path
        say(f"WARN the prep could not look inside {', '.join(sorted(unsearched))}, so a download there was not found. Check that the "
            f"folder can be opened, then run the prep again.")
    if "failed" in outcomes.values():
        return 1
    if "prepared" not in outcomes.values():
        say("Nothing was prepared: no registry file is in that folder.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

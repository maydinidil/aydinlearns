"""LedgerLoop is generated once per process in the pipeline suite (sprint 8, Task L1; mailvora_once.py's pattern, S7-30).

Every build in the suite calls `ledgerloop.generate.generate()` and `validate()` through `build_course_db.ll`, and test_ledgerloop
builds the same data again for its own classes. `install(build_course_db)` puts a stand-in in front of `build_course_db.ll` that
returns this module's one generation, each caller getting its own copy of the truth (the build adds to it). A call with an argument
(another seed) and every other attribute go to the real module, and test_ledgerloop's determinism test calls
`ledgerloop.generate.generate()` itself, so the generator is still run for real wherever a test is about the generator.
"""
import copy
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from ledgerloop import generate as ll  # noqa: E402

_made = None   # (tables, truth before validation, findings)


def generated():
    """(tables, truth, findings) of the one generation, validated: the tables are shared, so a caller must not change them."""
    global _made
    if _made is None:
        tables, truth = ll.generate()
        _made = (tables, truth, ll.validate(tables, truth))
    return _made


class _Once:
    """`build_course_db.ll` with generate() and validate() answered from the one generation."""

    def __getattr__(self, name):
        return getattr(ll, name)

    def generate(self, *args, **kwargs):
        if args or kwargs:
            return ll.generate(*args, **kwargs)
        tables, truth, _ = generated()
        return tables, copy.deepcopy(truth)

    def validate(self, tables, truth):
        made_tables, _, findings = generated()
        if tables is made_tables:
            return copy.deepcopy(findings)
        return ll.validate(tables, truth)


def install(build_course_db) -> None:
    """Puts the stand-in in front of `build_course_db.ll`; calling it again changes nothing."""
    if not isinstance(build_course_db.ll, _Once):
        build_course_db.ll = _Once()

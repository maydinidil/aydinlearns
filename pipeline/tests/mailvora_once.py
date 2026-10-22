"""Mailvora is generated once per process in the pipeline suite (S7-30).

Every build in the suite (test_build, test_edge_m5, test_case_edge_slices, test_datasets, test_ab_test) calls
`mailvora.generate.generate()` and `validate()` through `build_course_db.mv`, and test_mailvora builds the same data again for its
own classes: the suite spent most of its time regenerating one seeded dataset. `install(build_course_db)` puts a stand-in in front of
`build_course_db.mv` that returns this module's one generation, each caller getting its own copy of the truth (the build adds to it).
A call with an argument (another seed) and every other attribute go to the real module, and test_mailvora's determinism test calls
`mailvora.generate.generate()` itself, so the generator is still run for real wherever a test is about the generator.
"""
import copy
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from mailvora import generate as mv  # noqa: E402

_made = None   # (tables, truth before validation, findings)


def generated():
    """(tables, truth, findings) of the one generation, validated: the tables are shared, so a caller must not change them."""
    global _made
    if _made is None:
        tables, truth = mv.generate()
        _made = (tables, truth, mv.validate(tables, truth))
    return _made


class _Once:
    """`build_course_db.mv` with generate() and validate() answered from the one generation."""

    def __getattr__(self, name):
        return getattr(mv, name)

    def generate(self, *args, **kwargs):
        if args or kwargs:
            return mv.generate(*args, **kwargs)
        tables, truth, _ = generated()
        return tables, copy.deepcopy(truth)

    def validate(self, tables, truth):
        made_tables, _, findings = generated()
        if tables is made_tables:
            return copy.deepcopy(findings)
        return mv.validate(tables, truth)


def install(build_course_db) -> None:
    """Puts the stand-in in front of `build_course_db.mv`; calling it again changes nothing."""
    if not isinstance(build_course_db.mv, _Once):
        build_course_db.mv = _Once()

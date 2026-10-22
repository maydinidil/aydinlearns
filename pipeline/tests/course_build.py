"""The pipeline tests' one way in to the build (L50): `from course_build import build_course_db`.

Importing it puts pipeline/ (build_course_db, voltmarkt, mailvora, datasets) and pipeline/tests (mailvora_once, test_build)
on sys.path, as each test file that builds the database did for itself, and puts mailvora_once's stand-in in front of
`build_course_db.mv`, so Mailvora is generated once per process, not once per build (S7-30). Every test file that builds
imports the build from here.
"""
import pathlib
import sys

TESTS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS.parent))
sys.path.insert(0, str(TESTS))
import build_course_db  # noqa: E402
import mailvora_once  # noqa: E402

mailvora_once.install(build_course_db)

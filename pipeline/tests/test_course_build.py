"""L50 (Task G1): the shared helper `course_build` keeps every way of running a pipeline test file working.

Every test file that builds imports `from course_build import build_course_db`. Each such file must load, with the same tests and
with Mailvora's once-per-process stand-in in place, in the three ways the suite is run:
- discover: `python -m unittest discover -s pipeline/tests [-p <file>]` (the README and the plans);
- the dotted form: `python -m unittest pipeline.tests.<module>`, run from aydinlearns/ (this sprint's focused runs);
- a direct file run: `python pipeline/tests/<file>.py` (the file's own folder comes first on sys.path).
Each form loads one file in a fresh interpreter, as its command would, and counts the tests without running any.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import unittest

TESTS = pathlib.Path(__file__).resolve().parent
PROJECT = TESTS.parents[1]   # aydinlearns/, where the dotted form and discover are run from
USERS = sorted(p.stem for p in TESTS.glob("test_*.py")
               if re.search(r"^from course_build import ", p.read_text(encoding="utf-8"), re.M))
# Run in a fresh interpreter: argv[1] is the form, argv[2] the module. Prints the test count, the last line of each load error
# and the class of build_course_db.mv.
LOAD = """
import json, sys, unittest
form, name = sys.argv[1], sys.argv[2]
loader = unittest.TestLoader()
errors = []
try:
    if form == "discover":
        suite = loader.discover("pipeline/tests", pattern=name + ".py")
    elif form == "dotted":
        suite = loader.loadTestsFromName("pipeline.tests." + name)
    else:
        suite = loader.loadTestsFromModule(__import__(name))
    count = suite.countTestCases()
except Exception as e:
    count, errors = 0, [f"{type(e).__name__}: {e}"]
errors += [[line for line in text.splitlines() if line.strip()][-1] for text in loader.errors]
bcd = sys.modules.get("build_course_db")
print(json.dumps({"tests": count, "errors": errors, "mv": type(bcd.mv).__name__ if bcd else None}))
"""
FORMS = {"discover": PROJECT, "dotted": PROJECT, "direct": TESTS}   # the folder each form's command runs in


def load(form: str, module: str) -> dict:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}   # only the run form decides what is on sys.path
    done = subprocess.run([sys.executable, "-c", LOAD, form, module], cwd=FORMS[form], env=env,
                          capture_output=True, text=True, timeout=300)
    if done.returncode != 0:
        return {"tests": 0, "errors": [f"exit {done.returncode}"], "mv": None}
    return json.loads(done.stdout.strip().splitlines()[-1])


class CourseBuildRunForms(unittest.TestCase):
    def test_every_file_that_uses_the_helper_loads_the_same_tests_in_all_three_run_forms(self):
        self.assertTrue({"test_ab_test", "test_build", "test_case_edge_slices", "test_datasets", "test_edge_m5",
                         "test_edge_win", "test_mailvora_edge_clean"} <= set(USERS), "the files that use course_build")
        for module in USERS:
            with self.subTest(module=module):
                loaded = {form: load(form, module) for form in FORMS}
                for form, got in loaded.items():
                    self.assertEqual(got["errors"], [], f"{module} loads in the {form} form")
                    self.assertGreater(got["tests"], 0, f"{module} has tests in the {form} form")
                    self.assertEqual(got["mv"], "_Once", f"{module}: build_course_db.mv is the stand-in in the {form} form")
                counts = {form: got["tests"] for form, got in loaded.items()}
                self.assertEqual(len(set(counts.values())), 1, f"{module}: the same tests in every form, {counts}")


if __name__ == "__main__":
    unittest.main()

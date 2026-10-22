"""The pipeline tests as a package, for the dotted run form: `python -m unittest pipeline.tests.<module>` from aydinlearns/.

The test files import their helpers by plain name (`from course_build import build_course_db`, L50). Discover and a direct file
run put this folder on sys.path themselves; the dotted form imports this package first, so it puts the folder there here.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

// tools/prep-datasets.ts: `npm run prep:datasets -- --from <your downloads folder> [--only <dataset ID>]` (sprint 6 Part 2,
// Task G2; S6-22). It runs the prep, pipeline/datasets/prep.py, in the pipeline's venv (pipeline/.venv, which the launcher sets up,
// as build:data uses it) with the arguments it was given, in Python's isolated mode because the prep reads downloaded files. When
// the prep finishes without a failure it runs the data build, as `npm run build:data` does, so the prepared datasets reach
// data/course.duckdb. Every download is triggered by the owner: nothing here touches the network.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p: string): string => join(ROOT, p);
const VENV_PYTHON = at('pipeline/.venv/Scripts/python.exe');

export const PREP_USAGE = 'Usage: npm run prep:datasets -- --from <your downloads folder> [--only <dataset ID>]';

/** The two steps: the prep with the given arguments, then the data build. */
export function prepSteps(args: readonly string[]): { cmd: string; args: string[] }[] {
  return [
    { cmd: VENV_PYTHON, args: ['-I', at('pipeline/datasets/prep.py'), ...args] },
    { cmd: VENV_PYTHON, args: [at('pipeline/build_course_db.py')] },
  ];
}

/**
 * Runs the steps in order and stops at the first that fails, returning its exit code; with --help, only the prep runs, to print its
 * help. The spawner is a parameter for the tests.
 */
export function runPrep(args: readonly string[], spawner: typeof spawnSync = spawnSync): number {
  const help = args.some((a) => a === '-h' || a === '--help');
  if (!help && !args.some((a) => a === '--from' || a.startsWith('--from='))) {
    console.error(PREP_USAGE);
    return 2;
  }
  for (const step of prepSteps(args).slice(0, help ? 1 : 2)) {
    const r = spawner(step.cmd, step.args, { cwd: ROOT, stdio: 'inherit' });
    if (r.error) {
      console.error((r.error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'pipeline/.venv is not set up: start the app once with Start aydinlearns.bat, then run this again.'
        : `The prep could not start (${r.error.name}).`);
      return 1;
    }
    if (r.status !== 0) return r.status ?? 1;
  }
  return 0;
}

if (import.meta.main) process.exitCode = runPrep(process.argv.slice(2));

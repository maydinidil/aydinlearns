// A log that fails once, for the tests of what a failed write leaves behind.
import type { JsonlLog } from '../../core/jsonl.ts';

/** A log whose append number `failAt` (0-based, every file counted) throws once; every other append reaches the real log. */
export function flakyLog(real: JsonlLog, failAt: number): JsonlLog {
  let calls = 0;
  return {
    dir: real.dir,
    readAll: (f) => real.readAll(f),
    append: async (f, r) => {
      if (calls++ === failAt) throw new Error('disk hiccup');
      await real.append(f, r);
    },
  };
}

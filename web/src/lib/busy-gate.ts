// web/src/lib/busy-gate.ts: one request at a time for a button. A click while the last one is still running does nothing, so a
// double click sends one request ("Show answer", "Next"; sprint 3 Task A1).

export interface BusyGate {
  busy(): boolean;
  /** Runs fn unless a run is in flight (then nothing is sent and the result is undefined). The gate opens again when fn ends, however it ends. */
  run<T>(fn: () => Promise<T> | T): Promise<T | undefined>;
}

export function createBusyGate(): BusyGate {
  let held = false;
  return {
    busy: () => held,
    async run(fn) {
      if (held) return undefined;
      held = true;
      try { return await fn(); } finally { held = false; }
    },
  };
}

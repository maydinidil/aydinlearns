// server/runner/deadline.ts: repeated interrupt, because DuckDB clears the flag when a query starts (design §11)
export interface Interruptible { interrupt(): void }
export type DeadlineResult<T> = { timedOut: false; value: T } | { timedOut: false; error: unknown } | { timedOut: true };

export async function withDeadline<T>(conn: Interruptible, ms: number, work: () => Promise<T>, repeatMs = 200): Promise<DeadlineResult<T>> {
  let timedOut = false;
  let repeat: ReturnType<typeof setInterval> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    conn.interrupt();
    repeat = setInterval(() => conn.interrupt(), repeatMs);
  }, ms);
  try {
    const value = await work();
    return timedOut ? { timedOut: true } : { timedOut: false, value };
  } catch (error) {
    return timedOut ? { timedOut: true } : { timedOut: false, error };
  } finally {
    clearTimeout(timer);
    if (repeat) clearInterval(repeat);
  }
}

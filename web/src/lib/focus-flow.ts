// web/src/lib/focus-flow.ts: when keyboard focus moves to a heading (Task A2). The decisions are pure; the last three functions touch the DOM.

const pathOf = (hash: string): string => (hash || '#/').split('?')[0]!;

/** After a route change focus moves to the new screen's heading. Not on the first load, and not when only the query changed. */
export function shouldFocusRoute(prevHash: string | null, hash: string): boolean {
  return prevHash !== null && pathOf(prevHash) !== pathOf(hash);
}

/** What the drill screen is showing: a running or reviewed question is its run and index; the choose screen is just its kind. */
export function drillFocusKey(kind: string, run: { block_id: string } | null, index: number): string {
  return (kind === 'running' || kind === 'review') && run ? `${kind}:${run.block_id}:${index}` : kind;
}

/**
 * Focus moves when the question or the drill screen changes, once the screen has loaded. A grade result, a timer tick or a
 * message leave the key as it was, so they never move focus; neither does the first render or a run that resumes on load.
 */
export function shouldFocusDrill(prevKey: string | null, key: string, loaded: boolean): boolean {
  return loaded && prevKey !== null && prevKey !== key;
}

/** Makes a heading focusable from script and focuses it, without adding it to the tab order. */
export function focusHeading(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus();
  return true;
}

/** The screen's heading: a title is an h1; a screen with only a section heading uses the first h2. */
export function focusTarget(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('main h1') ?? doc.querySelector<HTMLElement>('main h2');
}

/** How long route focus waits for a screen's heading to draw (S7-29). */
export const FOCUS_WAIT_MS = 2000;

/**
 * After a route change: focuses the screen's heading as soon as there is one, looking again each time the page changes (a screen
 * draws its heading when its data arrives). When there is still none after `waitMs`, the screen has no heading, and `main` gets focus
 * so the keyboard starts at the new screen. Returns the function that stops the watch.
 */
export function watchForHeading(doc: Document, waitMs = FOCUS_WAIT_MS): () => void {
  if (focusHeading(focusTarget(doc))) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => { if (focusHeading(focusTarget(doc))) stop(); });
  function stop(): void { observer.disconnect(); clearTimeout(timer); }
  observer.observe(doc.body, { childList: true, subtree: true });
  timer = setTimeout(() => { focusHeading(doc.querySelector<HTMLElement>('main')); stop(); }, waitMs);
  return stop;
}

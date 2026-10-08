// web/src/lib/focus-flow.ts: when keyboard focus moves to a heading (Task A2). Pure decisions, so they can be tested without a DOM.

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

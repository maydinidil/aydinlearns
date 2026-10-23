// web/src/tutor/page-inert.ts: where the tutor panel sits on the page (S7-36; sprint T review T8 M2, M7). At 700px or less the open panel
// covers the page, so the rest of the page is made inert (no focus, no clicks, hidden from a screen reader) until the panel closes, the
// window widens or the tutor goes. And the panel starts under the top bar wherever the page has scrolled to, not at a fixed distance.
import { useEffect, type RefObject } from 'react';

/** The window width, in CSS, up to which the panel covers the page (the same breakpoint as components.css). */
export const NARROW_QUERY = '(max-width: 700px)';

/**
 * Makes every other child of the panel's parent inert, and keeps doing so for children mounted while the panel is open (a route change,
 * K1 M3). Returns the undo: it stops watching and removes only the marks it added.
 */
export function makeSiblingsInert(panel: Element): () => void {
  const marked: Element[] = [];
  const parent = panel.parentElement;
  const mark = (): void => {
    for (const el of Array.from(parent?.children ?? [])) {
      if (el === panel || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      marked.push(el);
    }
  };
  mark();
  const observer = new MutationObserver(mark);
  if (parent) observer.observe(parent, { childList: true });
  return () => { observer.disconnect(); for (const el of marked) el.removeAttribute('inert'); };
}

/** While `active` and the window is narrow, the rest of the page is inert. */
export function usePageInert(panel: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active || typeof window.matchMedia !== 'function') return;
    const narrow = window.matchMedia(NARROW_QUERY);
    let undo: (() => void) | null = null;
    const sync = (): void => {
      if (narrow.matches && undo === null && panel.current) undo = makeSiblingsInert(panel.current);
      else if (!narrow.matches && undo !== null) { undo(); undo = null; }
    };
    sync();
    narrow.addEventListener('change', sync);
    return () => { narrow.removeEventListener('change', sync); undo?.(); };
  }, [panel, active]);
}

/** While `active`, the panel's `--tutor-top` is the top bar's bottom edge in the window (0 once it has scrolled away). */
export function usePanelTop(panel: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const place = (): void => {
      const bar = document.querySelector('header.shell');
      if (bar) panel.current?.style.setProperty('--tutor-top', `${Math.max(0, Math.round(bar.getBoundingClientRect().bottom))}px`);
    };
    place();
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [panel, active]);
}

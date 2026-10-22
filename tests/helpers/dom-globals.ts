// tests/helpers/dom-globals.ts: puts a happy-dom window on globalThis (S7-28). It is its own module so it runs before react-dom loads:
// react-dom reads `window` and `document` once, when it is first imported, to decide it can use the DOM and which events it listens to.
import { Window } from 'happy-dom';

// The browser globals React DOM and the screens read. Set once per test process, from one window.
const win = new Window({ url: 'http://localhost/', settings: { disableErrorCapturing: false } });
const globals = globalThis as unknown as Record<string, unknown>;
for (const key of [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'addEventListener', 'removeEventListener', 'dispatchEvent',
  'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement',
  'SVGElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent', 'MutationObserver', 'DOMParser', 'DocumentFragment',
]) {
  const value = (win as unknown as Record<string, unknown>)[key];
  if (value === undefined) continue;
  Object.defineProperty(globals, key, { value: typeof value === 'function' && !/^[A-Z]/.test(key) ? (value as (...a: unknown[]) => unknown).bind(win) : value, configurable: true, writable: true });
}
globals.IS_REACT_ACT_ENVIRONMENT = true;

export const happyWindow = win;

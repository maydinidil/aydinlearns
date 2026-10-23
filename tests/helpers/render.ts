// tests/helpers/render.ts: render a React element in a happy-dom window (S7-28, D113). `render(element)` mounts it inside React 19's
// `act`, so effects and state from the first render are done when it returns, and gives back the `container` to query and an `unmount`.
// Use `await settle()` after a click or a resolved fetch. Needs the hook: `--import ./tests/helpers/register-tsx.ts`.
import assert from 'node:assert/strict';
import './dom-globals.ts';
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

const globals = globalThis as unknown as Record<string, unknown>;

export interface Rendered { container: HTMLElement; unmount: () => void }

/** Mounts `element` in a fresh container on the document body. */
export function render(element: ReactElement): Rendered {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return {
    container,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

/** Lets pending promises and the state updates they cause finish, inside `act`. Call it after a click or a resolved fetch. */
export async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) await act(async () => { await new Promise<void>((r) => setTimeout(r, 0)); });
}

export interface FetchCall { method: string; path: string; body: unknown }
/** What a stubbed route answers: a body (status 200), or `{ status, body }`. `undefined` is a 404. */
export type FetchAnswer = unknown;
const isStatused = (a: unknown): a is { status: number; body: unknown } => !!a && typeof a === 'object' && 'status' in a && 'body' in a;

/**
 * Replaces `fetch` with a stub that answers each call from `answer(method, path, body)`; no network is touched. A thrown error makes
 * the call reject, as a server that is not running does. Returns the calls made, in order.
 */
export function stubFetch(answer: (method: string, path: string, body: unknown) => FetchAnswer | Promise<FetchAnswer>): FetchCall[] {
  const calls: FetchCall[] = [];
  globals.fetch = async (input: unknown, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    // The server refuses a non-GET without a JSON content type with a 415 (S7C-10), so a call that forgets the header fails here too.
    if ((init?.method ?? 'GET') !== 'GET' && !(init?.headers?.['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      return new Response(JSON.stringify({ error: 'Send JSON.' }), { status: 415, headers: { 'content-type': 'application/json' } });
    }
    const call = { method: init?.method ?? 'GET', path: String(input), body: init?.body === undefined ? undefined : (JSON.parse(init.body) as unknown) };
    calls.push(call);
    const a = await answer(call.method, call.path, call.body);
    const status = a === undefined ? 404 : isStatused(a) ? a.status : 200;
    const body = a === undefined ? { error: 'Not found.' } : isStatused(a) ? a.body : a;
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

/** Clicks an element the way a learner does, then lets what the click starts (a fetch, the state it sets) finish, all inside `act`. */
export async function click(el: Element | null): Promise<void> {
  assert.ok(el, 'the element to click exists');
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
}

/** Types `value` into a text input or textarea the way a learner does (React reads the value setter, so it is set through the prototype). */
export async function type(el: Element | null, value: string): Promise<void> {
  assert.ok(el, 'the field to type in exists');
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  assert.ok(setter, 'the element has a value');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event('input', { bubbles: true }));
  });
}

// web/src/tutor/TutorContext.tsx: the tutor's app-wide state (AI tutor design §4): whether it is on, the parts mounted components register
// (useTutorPart, read at the moment of asking), whether a timed run closes it (useTutorClosed), the panel's open state, and a quick
// prompt waiting to fill the question. Two contexts: the registry never changes, so a component that only registers a part or closes the
// tutor does not draw again when the panel opens; the state changes with the panel, and when a part comes, goes or names another item
// or its passed flag changes, so the panel's thread follows the item on the screen (D96) and its help note the item's state (spec §7).
// The registry also carries the help channel (Codex F34): the item panels listen (useTutorHelp), and the tutor panel tells them which
// instance a reply the server counted as help (D95) was on.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collectParts } from './panel-a11y.ts';
import type { SnapshotPart } from './snapshot.ts';

type Build = () => SnapshotPart | null;
type HelpHandler = (instanceId: string) => void;
interface Registry {
  collect(): SnapshotPart[];
  register(build: { current: Build }): () => void;
  close(id: symbol, reason: string | null): void;
  /** A registered part now names another item, or its passed flag changed. */
  changed(): void;
  /** Codex F34: an item panel listens, while it is mounted, for the instances tutor answers counted as help on. */
  listen(handler: { current: HelpHandler }): () => void;
  /** Codex F34 (D95): a reply the server counted as help on this instance; each listening panel decides whether it is its own. */
  helped(instanceId: string): void;
}
export interface TutorState extends Registry {
  enabled: boolean; open: boolean; closedBy: string | null; prefill: string | null;
  setOpen(open: boolean): void;
  /** A quick prompt: opens the panel with the question filled in; the learner sends it. */
  ask(question: string): void;
  clearPrefill(): void;
}
const Ctx = createContext<TutorState | null>(null);
const RegistryCtx = createContext<Registry | null>(null);

export function TutorProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const builds = useRef<{ current: Build }[]>([]);
  const listeners = useRef<{ current: HelpHandler }[]>([]);
  const closers = useRef(new Map<symbol, string>());
  const [closedBy, setClosedBy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);
  /** Counts changes to the registered parts, so the state (and the panel) is drawn again. */
  const [parts, setParts] = useState(0);
  const registry = useRef<Registry>({
    register(build: { current: Build }): () => void {
      builds.current = [...builds.current, build];
      setParts((n) => n + 1);
      return () => { builds.current = builds.current.filter((b) => b !== build); setParts((n) => n + 1); };
    },
    collect(): SnapshotPart[] { return collectParts(builds.current); },
    close(id: symbol, reason: string | null): void {
      if (reason) closers.current.set(id, reason); else closers.current.delete(id);
      setClosedBy([...closers.current.values()][0] ?? null);
    },
    changed(): void { setParts((n) => n + 1); },
    listen(handler: { current: HelpHandler }): () => void {
      listeners.current = [...listeners.current, handler];
      return () => { listeners.current = listeners.current.filter((h) => h !== handler); };
    },
    helped(instanceId: string): void { for (const h of listeners.current) h.current(instanceId); },
  }).current;
  const value = useMemo<TutorState>(() => ({ ...registry, enabled, open, closedBy, prefill, setOpen,
    ask: (q) => { setPrefill(q); setOpen(true); }, clearPrefill: () => setPrefill(null) }), [enabled, open, closedBy, prefill, registry, parts]);
  return <RegistryCtx.Provider value={registry}><Ctx.Provider value={value}>{children}</Ctx.Provider></RegistryCtx.Provider>;
}

export const useTutor = (): TutorState | null => useContext(Ctx);

/** The item a part names and whether it is passed: what the panel's thread key and help note read. */
const itemSign = (p: SnapshotPart | null): string => (p?.item ? `${p.item.item_instance_id}\n${p.item.passed}` : '');

/**
 * Registers a part while the component is mounted. `build` runs when a question is sent, so it reads the latest state. It also runs after
 * each draw of the component, to tell the panel when the part names another item or the item passes (keep it cheap and pure).
 */
export function useTutorPart(build: Build): void {
  const registry = useContext(RegistryCtx);
  const ref = useRef(build);
  ref.current = build;
  useEffect(() => registry?.register(ref), [registry]);
  const sign = useRef<string | null>(null);
  useEffect(() => {
    const now = itemSign(ref.current());
    if (sign.current !== null && sign.current !== now) registry?.changed();
    sign.current = now;
  });
}

/**
 * Codex F34 (D95): while the component is mounted, `handle` hears each instance a tutor reply was counted as help on, at the reply's end.
 * It runs the latest `handle`, so it reads the component's latest state; it decides whether the instance is its own (marksHelped).
 */
export function useTutorHelp(handle: HelpHandler): void {
  const registry = useContext(RegistryCtx);
  const ref = useRef(handle);
  ref.current = handle;
  useEffect(() => registry?.listen(ref), [registry]);
}

/** Closes the tutor while `reason` is set (a timed run's clock runs, D94), with the line the button shows. */
export function useTutorClosed(reason: string | null): void {
  const registry = useContext(RegistryCtx);
  const id = useRef(Symbol('tutor-closer'));
  useEffect(() => { registry?.close(id.current, reason); return () => registry?.close(id.current, null); }, [registry, reason]);
}

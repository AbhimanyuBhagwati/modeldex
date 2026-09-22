'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { MAX_DECK } from '@/lib/site';
import { Dock } from './Dock';
import styles from './Dock.module.css';

export interface DeckEntry {
  key: string;
  name: string;
  color: string;
}

function createStore() {
  let entries: DeckEntry[] = [];
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => entries,
    set(next: DeckEntry[]) {
      entries = next;
      listeners.forEach((l) => l());
    },
  };
}
type DeckStore = ReturnType<typeof createStore>;

interface DeckApi {
  store: DeckStore;
  toggle(entry: DeckEntry, from?: HTMLElement | null): void;
  remove(key: string): void;
  clear(): void;
  notify(message: string): void;
  registerDock(el: HTMLDivElement | null): void;
  registerSlot(key: string, el: HTMLElement | null): void;
}

const DeckContext = createContext<DeckApi | null>(null);
const STORAGE_KEY = 'modeldex:deck:v1';
const EMPTY: DeckEntry[] = [];

export function useDeckApi(): DeckApi {
  const api = useContext(DeckContext);
  if (!api) throw new Error('Deck hooks must be used inside <DeckProvider>');
  return api;
}

export function useDeck(): DeckEntry[] {
  const { store } = useDeckApi();
  return useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
}

/** Re-renders only when this one card joins or leaves the deck. */
export function useInDeck(key: string): boolean {
  const { store } = useDeckApi();
  return useSyncExternalStore(
    store.subscribe,
    () => store.get().some((e) => e.key === key),
    () => false,
  );
}

function readSaved(): DeckEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is DeckEntry =>
          typeof e?.key === 'string' && typeof e?.name === 'string' && typeof e?.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color),
      )
      .slice(0, MAX_DECK);
  } catch {
    return [];
  }
}

/** Flies a copy of the card into its dock slot along a short arc. */
function fly(card: HTMLElement, target: HTMLElement, shift: number): Promise<void> {
  const a = card.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('a, button').forEach((n) => n.remove());
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: '0',
    zIndex: '60',
    pointerEvents: 'none',
    transformOrigin: '0 0',
    transition: 'none',
  });
  ghost.style.setProperty('--rx', '0deg');
  ghost.style.setProperty('--ry', '0deg');
  document.body.appendChild(ghost);
  const dx = b.left - a.left;
  const dy = b.top - shift - a.top;
  const sx = b.width / a.width;
  const sy = b.height / a.height;
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1,1) rotate(0deg)' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 80}px) scale(${(1 + sx) / 2}, ${(1 + sy) / 2}) rotate(-8deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(0deg)` },
    ],
    { duration: 640, easing: 'cubic-bezier(.45,.05,.2,1)' },
  );
  return anim.finished.then(
    () => ghost.remove(),
    () => ghost.remove(),
  );
}

export function DeckProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const slots = useRef(new Map<string, HTMLElement>());
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    const saved = readSaved();
    if (saved.length) store.set(saved);
    return store.subscribe(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.get()));
      } catch {
        /* Private mode or full storage: the deck still works for this visit. */
      }
    });
  }, [store]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  const registerDock = useCallback((el: HTMLDivElement | null) => {
    dockRef.current = el;
  }, []);
  const registerSlot = useCallback((key: string, el: HTMLElement | null) => {
    if (el) slots.current.set(key, el);
    else slots.current.delete(key);
  }, []);

  const remove = useCallback((key: string) => store.set(store.get().filter((e) => e.key !== key)), [store]);
  const clear = useCallback(() => store.set([]), [store]);

  const toggle = useCallback(
    (entry: DeckEntry, from?: HTMLElement | null) => {
      const current = store.get();
      if (current.some((e) => e.key === entry.key)) {
        store.set(current.filter((e) => e.key !== entry.key));
        return;
      }
      if (current.length >= MAX_DECK) {
        notify(`Your deck holds ${MAX_DECK} cards. Remove one to add another.`);
        return;
      }
      const wasOpen = dockRef.current?.dataset.open === 'true';
      flushSync(() => store.set([...current, entry]));
      if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const slot = slots.current.get(entry.key);
      const dock = dockRef.current;
      if (!slot || !dock || dock.dataset.open !== 'true') return;
      const shift = wasOpen ? 0 : dock.getBoundingClientRect().height + 48;
      slot.dataset.state = 'incoming';
      fly(from, slot, shift).then(() => {
        slot.dataset.state = 'landed';
      });
    },
    [store, notify],
  );

  const api = useMemo<DeckApi>(
    () => ({ store, toggle, remove, clear, notify, registerDock, registerSlot }),
    [store, toggle, remove, clear, notify, registerDock, registerSlot],
  );

  return (
    <DeckContext.Provider value={api}>
      {children}
      <Dock />
      <div className={styles.toast} role="status" aria-live="polite" data-show={toast ? 'true' : 'false'}>
        {toast?.text}
      </div>
    </DeckContext.Provider>
  );
}

'use client';

import { useSyncExternalStore } from 'react';
import type { Adoption } from '@/lib/terrarium';

/** What this browser remembers about the Terrarium: which eggs it hatched and which creature it adopted. */
export interface TerrariumSave {
  hatched: string[];
  pet: Adoption | null;
}

const KEY = 'modeldex:terrarium:v1';
const EMPTY: TerrariumSave = { hatched: [], pet: null };

let state: TerrariumSave = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): TerrariumSave {
  if (loaded) return state;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<TerrariumSave> | null;
    const pet = raw?.pet && typeof raw.pet.key === 'string' && typeof raw.pet.at === 'string' ? raw.pet : null;
    state = { hatched: Array.isArray(raw?.hatched) ? raw.hatched.filter((k): k is string => typeof k === 'string') : [], pet };
  } catch {
    state = EMPTY;
  }
  return state;
}

function write(next: TerrariumSave) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: it still works until the tab closes.
  }
  listeners.forEach((l) => l());
}

/** The save as it is right now, for code outside React's render. */
export const currentSave = () => read();

export const markHatched = (key: string) => {
  const s = read();
  if (!s.hatched.includes(key)) write({ ...s, hatched: [...s.hatched, key] });
};
export const setPet = (pet: Adoption | null) => write({ ...read(), pet });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useTerrariumSave = () => useSyncExternalStore(subscribe, read, () => EMPTY);

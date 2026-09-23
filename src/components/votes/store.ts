'use client';

import { useSyncExternalStore } from 'react';
import { VOTES_API } from '@/lib/site';

type Tally = Record<string, number>;

export interface VoteState {
  status: 'off' | 'idle' | 'loading' | 'ready' | 'error';
  all: Tally;
  week: Tally;
  /** Cards this browser voted for today. The server enforces the real limit; this just shows it. */
  mine: string[];
}

const STORAGE = 'modeldex:votes:v1';
const OFF: VoteState = { status: 'off', all: {}, week: {}, mine: [] };
const SERVER: VoteState = { ...OFF, status: VOTES_API ? 'idle' : 'off' };

let state: VoteState = SERVER;
const listeners = new Set<() => void>();
const set = (patch: Partial<VoteState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const today = () => new Date().toISOString().slice(0, 10);
function readMine(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as { day?: string; keys?: unknown } | null;
    return saved?.day === today() && Array.isArray(saved.keys) ? saved.keys.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
function writeMine(keys: string[]) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ day: today(), keys }));
  } catch {
    // Private mode or blocked storage: the server still stops double votes.
  }
}

/** Fetches the tally once per page load; later calls are free. */
export function loadVotes() {
  if (state.status !== 'idle') return;
  set({ status: 'loading', mine: readMine() });
  fetch(`${VOTES_API}/counts`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { all?: Tally; week?: Tally }) => set({ status: 'ready', all: d.all ?? {}, week: d.week ?? {} }))
    .catch(() => set({ status: 'error' }));
}

/** Votes right away on screen, then confirms with the server. Returns an error to show, or null. */
export async function castVote(key: string): Promise<string | null> {
  if (!VOTES_API || state.mine.includes(key)) return null;
  const before = { all: state.all[key] ?? 0, week: state.week[key] ?? 0, mine: state.mine };
  const mine = [...state.mine, key];
  writeMine(mine);
  set({ mine, all: { ...state.all, [key]: before.all + 1 }, week: { ...state.week, [key]: before.week + 1 } });
  try {
    const res = await fetch(`${VOTES_API}/vote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: key }) });
    const body = (await res.json().catch(() => ({}))) as { all?: number; week?: number; error?: string };
    if (!res.ok) throw new Error(body.error ?? 'The vote didn’t go through. Try again in a moment.');
    set({ all: { ...state.all, [key]: body.all ?? before.all + 1 }, week: { ...state.week, [key]: body.week ?? before.week + 1 } });
    return null;
  } catch (err) {
    writeMine(before.mine);
    set({ mine: before.mine, all: { ...state.all, [key]: before.all }, week: { ...state.week, [key]: before.week } });
    return err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Couldn’t reach the vote counter. Try again in a moment.';
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useVotes = () => useSyncExternalStore(subscribe, () => state, () => SERVER);

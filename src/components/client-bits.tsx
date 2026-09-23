'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useDeck, useDeckApi, useInDeck, type DeckEntry } from '@/components/deck/DeckProvider';
import { Icon } from '@/components/icons';
import { compareHref } from '@/lib/site';

export function CompareNavLink({ className }: { className?: string }) {
  const deck = useDeck();
  return (
    <Link className={className} href={compareHref(deck.length >= 2 ? deck.map((e) => e.key) : [])}>
      Compare
      {deck.length > 0 && <b aria-label={`${deck.length} in deck`}>{deck.length}</b>}
    </Link>
  );
}

export function AddToDeckButton({ entry }: { entry: DeckEntry }) {
  const api = useDeckApi();
  const inDeck = useInDeck(entry.key);
  return (
    <button type="button" className="btn" aria-pressed={inDeck} onClick={() => api.toggle(entry)}>
      <Icon name={inDeck ? 'check' : 'plus'} />
      {inDeck ? 'In your deck' : 'Add to compare'}
    </button>
  );
}

/** Copies `text`, or the current page URL when `text` is omitted. */
export function CopyButton({ text, label, className = 'btn btn-tiny' }: { text?: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text ?? window.location.href);
      setState('copied');
    } catch {
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button type="button" className={className} onClick={copy}>
      <Icon name={state === 'copied' ? 'check' : 'link'} />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy blocked by browser' : label}</span>
    </button>
  );
}

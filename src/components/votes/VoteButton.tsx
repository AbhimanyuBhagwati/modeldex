'use client';

import { useEffect } from 'react';
import { useDeckApi } from '@/components/deck/DeckProvider';
import { Icon } from '@/components/icons';
import { castVote, loadVotes, useVotes } from './store';
import styles from './votes.module.css';

/** "♥ Vote 128". One vote per card per day. Renders nothing when voting isn't set up. */
export function VoteButton({ modelKey, name, label = 'Vote', className = 'btn' }: { modelKey: string; name: string; label?: string; className?: string }) {
  const votes = useVotes();
  const { notify } = useDeckApi();
  useEffect(loadVotes, []);
  if (votes.status === 'off') return null;
  const voted = votes.mine.includes(modelKey);
  const count = votes.all[modelKey] ?? 0;
  return (
    <button
      type="button"
      className={`${className} ${styles.vote}`}
      data-voted={voted || undefined}
      aria-pressed={voted}
      aria-label={voted ? `You voted for ${name} today` : `Vote for ${name}`}
      onClick={async () => {
        if (voted) return notify('One vote per card per day. Come back tomorrow.');
        const error = await castVote(modelKey);
        notify(error ?? `Voted for ${name}.`);
      }}
    >
      <Icon name="heart" />
      {voted ? 'Voted' : label}
      {votes.status === 'ready' && <small>{count.toLocaleString('en-US')}</small>}
    </button>
  );
}

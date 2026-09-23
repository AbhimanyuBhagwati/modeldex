'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import { VoteButton } from '@/components/votes/VoteButton';
import { loadVotes, useVotes } from '@/components/votes/store';
import { TYPE_LABEL } from '@/lib/format';
import { modelHref } from '@/lib/site';
import type { Model } from '@/lib/types';
import styles from './page.module.css';

type Row = Pick<Model, 'key' | 'lab' | 'slug' | 'name' | 'type'>;
type Lab = { key: string; name: string; color: string };

const TOP = 30;

export function FavoritesView({ cards, labs: labList }: { cards: Row[]; labs: Lab[] }) {
  const votes = useVotes();
  const [range, setRange] = useState<'week' | 'all'>('week');
  const [find, setFind] = useState('');
  useEffect(loadVotes, []);
  const labs = useMemo(() => Object.fromEntries(labList.map((l) => [l.key, l])), [labList]);
  const byKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards]);

  const tally = range === 'week' ? votes.week : votes.all;
  const ranked = Object.entries(tally)
    .filter(([key, n]) => n > 0 && byKey.has(key))
    .sort((a, b) => b[1] - a[1] || byKey.get(a[0])!.name.localeCompare(byKey.get(b[0])!.name))
    .slice(0, TOP)
    .map(([key, n]) => ({ card: byKey.get(key)!, n }));
  const terms = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = terms.length ? cards.filter((c) => terms.every((t) => `${c.name} ${labs[c.lab]?.name}`.toLowerCase().includes(t))).slice(0, 12) : [];

  if (votes.status === 'off') {
    return <p className={styles.notice}>Voting opens soon. Check back in a day or two.</p>;
  }

  const row = (card: Row, n: number | null, rank?: number) => (
    <li key={card.key} style={{ '--t': labs[card.lab]?.color } as CSSProperties}>
      {rank != null && <span className={styles.rank}>{rank}</span>}
      <span className={styles.name}>
        <span className={styles.dot} aria-hidden="true" />
        <Link href={modelHref(card)}>{card.name}</Link>
        <small>
          {labs[card.lab]?.name} · {TYPE_LABEL[card.type]}
        </small>
      </span>
      {n != null && (
        <span className={styles.votes}>
          <b>{n.toLocaleString('en-US')}</b> {n === 1 ? 'vote' : 'votes'}
        </span>
      )}
      <VoteButton modelKey={card.key} name={card.name} className="btn btn-tiny" />
    </li>
  );

  return (
    <div className={styles.board}>
      <div className={styles.tabs} role="group" aria-label="Time range">
        <button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>
          This week
        </button>
        <button type="button" aria-pressed={range === 'all'} onClick={() => setRange('all')}>
          All time
        </button>
      </div>

      {votes.status === 'loading' || votes.status === 'idle' ? (
        <p className={styles.notice}>Counting votes…</p>
      ) : votes.status === 'error' ? (
        <p className={styles.notice}>Couldn’t reach the vote counter. Try again in a moment.</p>
      ) : ranked.length ? (
        <ol className={styles.list}>{ranked.map(({ card, n }, i) => row(card, n, i + 1))}</ol>
      ) : (
        <p className={styles.notice}>{range === 'week' ? 'No votes yet this week.' : 'No votes yet.'} Find a card below and be the first.</p>
      )}

      <section className={styles.find} aria-labelledby="find-title">
        <h2 id="find-title">Vote for a card</h2>
        <label className={styles.search}>
          <Icon name="search" />
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a model or lab" aria-label="Find a model or lab" autoComplete="off" spellCheck={false} />
        </label>
        {found.length > 0 && <ul className={styles.list}>{found.map((c) => row(c, votes.all[c.key] ?? 0))}</ul>}
        {terms.length > 0 && found.length === 0 && <p className={styles.notice}>No card matches “{find}”.</p>}
      </section>
    </div>
  );
}

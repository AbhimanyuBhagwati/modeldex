'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import { MAX_DECK, compareHref } from '@/lib/site';
import { useDeck, useDeckApi } from './DeckProvider';
import styles from './Dock.module.css';

export function Dock() {
  const entries = useDeck();
  const { registerDock, registerSlot, remove, clear, notify } = useDeckApi();
  const onComparePage = usePathname().startsWith('/compare');
  const open = entries.length > 0 && !onComparePage;

  return (
    <div ref={registerDock} className={styles.dock} data-open={open ? 'true' : 'false'} role="region" aria-label="Compare deck" inert={!open}>
      <div className={styles.inner}>
        <div className={styles.label}>
          Deck
          <b>
            {entries.length}/{MAX_DECK}
          </b>
        </div>
        <ol className={styles.slots}>
          {Array.from({ length: MAX_DECK }, (_, i) => {
            const e = entries[i];
            if (!e) {
              return (
                <li key={`empty-${i}`} className={styles.slot}>
                  <span className={styles.mini} />
                  <span className={styles.name}>Empty slot</span>
                </li>
              );
            }
            return (
              <li key={e.key} className={`${styles.slot} ${styles.filled}`} style={{ '--t': e.color } as CSSProperties}>
                <span
                  className={styles.mini}
                  ref={(el) => {
                    registerSlot(e.key, el);
                    return () => registerSlot(e.key, null);
                  }}
                />
                <span className={styles.name} title={e.name}>{e.name}</span>
                <button type="button" className={styles.remove} onClick={() => remove(e.key)} aria-label={`Remove ${e.name}`}>
                  <Icon name="x" />
                </button>
              </li>
            );
          })}
        </ol>
        <div className={styles.actions}>
          <button type="button" className={`btn btn-ghost ${styles.clear}`} onClick={clear}>
            Clear
          </button>
          {entries.length >= 2 ? (
            <Link className="btn btn-gold" href={compareHref(entries.map((e) => e.key))}>
              Compare {entries.length}
            </Link>
          ) : (
            <button type="button" className="btn btn-gold" onClick={() => notify('Add one more card to compare.')}>
              Compare
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

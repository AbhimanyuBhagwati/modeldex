import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { Icon } from '@/components/icons';
import { compareHref } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import styles from './Hero.module.css';

interface Props {
  newest: Model[];
  labs: Record<string, LabSummary>;
  setSize: number;
  refDate: string;
  setName: string;
  stats: { cards: number; labs: number; openWeights: number; free: number; holo: number };
}

const FAN = [
  { x: 'calc(var(--w) * -0.16)', y: '16px', r: '-13deg', z: 1, pick: 1 },
  { x: '0px', y: '-8px', r: '0deg', z: 3, pick: 0 },
  { x: 'calc(var(--w) * 0.16)', y: '16px', r: '13deg', z: 2, pick: 2 },
];

export function Hero({ newest, labs, setSize, refDate, setName, stats }: Props) {
  const items: [number, string][] = [
    [stats.cards, 'cards'],
    [stats.labs, 'labs'],
    [stats.openWeights, 'open weights'],
    [stats.free, 'free to call'],
    [stats.holo, 'holo rares'],
  ];
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.copy}>
        <p className={styles.edition}>
          <span className={styles.editionDot} aria-hidden="true" />
          The AI model collection <span> / {setName}</span>
        </p>
        <h1 id="hero-title" className={styles.title}>
          Every model.<br /><em>One collection.</em>
        </h1>
        <p className={styles.lede}>
          Explore {stats.labs} AI labs. Pick up to four cards to compare context, capabilities, and cost.
        </p>
        <div className={styles.cta}>
          <a className="btn btn-gold" href="#binder">
            Explore the binder <Icon name="back" className={styles.arrow} />
          </a>
          <Link className="btn" href="/match/">
            Find my model
          </Link>
          {newest.length >= 2 && (
            <Link className="btn" href={compareHref(newest.map((m) => m.key))}>
              Compare latest pulls
            </Link>
          )}
        </div>
      </div>
      <div className={styles.booster}>
        <div className={styles.fan} role="group" aria-label="Newest cards">
          {FAN.map((slot, i) => {
            const m = newest[slot.pick];
            if (!m) return null;
            return (
              <div key={m.key} className={styles.slot} style={{ '--x': slot.x, '--y': slot.y, '--r': slot.r, '--i': i, zIndex: slot.z } as CSSProperties}>
                <Card model={m} lab={labs[m.lab]} setSize={setSize} refDate={refDate} tilt={14} />
              </div>
            );
          })}
        </div>
        <p className={styles.label}><span /> Latest pulls <span /></p>
      </div>
      <ul className={styles.stats} aria-label="Collection statistics">
        {items.map(([n, label]) => (
          <li key={label}><b>{n.toLocaleString('en-US')}</b><span>{label}</span></li>
        ))}
      </ul>
    </section>
  );
}

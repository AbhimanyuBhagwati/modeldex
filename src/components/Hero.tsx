import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
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
      <div>
        <p className="eyebrow">
          {setName} set · {stats.cards} cards
        </p>
        <h1 id="hero-title" className={styles.title}>
          Every model from {stats.labs} AI labs, dealt as a card.
        </h1>
        <p className={styles.lede}>
          Pick up to four and compare them side by side. Every card links to the lab’s own docs, so the source is one click away.
        </p>
        <ul className={styles.stats}>
          {items.map(([n, label]) => (
            <li key={label}>
              <b>{n}</b> {label}
            </li>
          ))}
        </ul>
        <div className={styles.cta}>
          <a className="btn btn-gold" href="#binder">
            Browse the binder
          </a>
          {newest.length >= 2 && (
            <Link className="btn" href={compareHref(newest.map((m) => m.key))}>
              Compare the newest {newest.length === 3 ? 'three' : newest.length}
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
        <p className={styles.label}>Latest pulls</p>
      </div>
    </section>
  );
}

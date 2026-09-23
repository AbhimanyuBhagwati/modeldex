import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset, labModels } from '@/lib/data';
import { formatMonth } from '@/lib/format';
import styles from './labs.module.css';

export const metadata: Metadata = {
  title: 'Labs',
  description: 'Every AI lab in the binder: how many cards each has, what they make, and their newest release.',
  alternates: { canonical: '/labs/' },
};

export default function LabsPage() {
  const data = getDataset();
  const labs = [...data.labs].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <p className="eyebrow">
            {data.labs.length} labs · {data.models.length} cards
          </p>
          <h1 className={styles.title}>The labs</h1>
          <p className={styles.lede}>Every company and research group in the binder, biggest collection first. Open one for its full release timeline and official links.</p>
        </div>
        <ul className={styles.tiles}>
          {labs.map((lab) => {
            const models = labModels(lab.key);
            const newest = models.find((m) => m.status !== 'deprecated') ?? models[0];
            const types = new Set(models.map((m) => m.type)).size;
            return (
              <li key={lab.key}>
                <Link className={styles.tile} href={`/labs/${lab.key}/`} style={{ '--t': lab.color } as CSSProperties}>
                  <span className={styles.swatch} aria-hidden="true" />
                  <span className={styles.tileText}>
                    <b>{lab.name}</b>
                    <small>
                      {lab.count} {lab.count === 1 ? 'card' : 'cards'} · {types} {types === 1 ? 'type' : 'types'}
                    </small>
                    {newest && (
                      <span className={styles.newest}>
                        Newest: {newest.name} <em>{formatMonth(newest.releaseDate)}</em>
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

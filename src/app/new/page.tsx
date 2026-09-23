import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { changeLog, getDataset, getModelByKey } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { newsItems, priceMove, type NewsItem } from '@/lib/news';
import { modelHref, withBase } from '@/lib/site';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'New this week',
  description: 'New AI models, price changes, and retirements from the last seven days, straight from the daily sync.',
  alternates: { canonical: '/new/' },
};

/** Cards shown per section before linking to the binder for the rest. */
const SHOW = 12;

export default function NewPage() {
  const data = getDataset();
  const labs = Object.fromEntries(data.labs.map((l) => [l.key, l]));
  const refDate = data.updatedAt;
  const items = newsItems(data.models, changeLog(), refDate, 7);
  const cardsFor = (kind: NewsItem['kind']) => items.filter((i) => i.kind === kind).map((i) => getModelByKey(i.key)).filter((m) => m != null);
  const released = cardsFor('released');
  const added = cardsFor('added');
  const prices = items.filter((i) => i.kind === 'price');
  const gone = items.filter((i) => i.kind === 'retired' || i.kind === 'removed');
  const start = new Date(Date.parse(refDate) - 6 * 864e5).toISOString().slice(0, 10);

  const grid = (list: typeof released) => (
    <>
      <div className={styles.grid}>
        {list.slice(0, SHOW).map((m) => (
          <Card key={m.key} model={m} lab={labs[m.lab]} setSize={data.models.length} refDate={refDate} />
        ))}
      </div>
      {list.length > SHOW && (
        <p className={styles.more}>
          And {list.length - SHOW} more. <Link href="/?sort=newest#binder">See them in the binder</Link>
        </p>
      )}
    </>
  );

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <div>
            <p className="eyebrow">
              {formatDate(start)} to {formatDate(refDate.slice(0, 10))}
            </p>
            <h1 className={styles.title}>New this week</h1>
            <p className={styles.lede}>What changed in the binder over the last seven days. The daily sync writes this page, so it’s never more than a day behind.</p>
          </div>
          <a className="btn" href={withBase('/feed.xml')}>
            <Icon name="rss" />
            RSS feed
          </a>
        </div>

        <section className={styles.section} aria-labelledby="released">
          <h2 id="released">
            Released <span>{released.length}</span>
          </h2>
          {released.length ? grid(released) : <p className={styles.empty}>No new releases this week.</p>}
        </section>

        {added.length > 0 && (
          <section className={styles.section} aria-labelledby="added">
            <h2 id="added">
              New to the binder <span>{added.length}</span>
            </h2>
            <p className={styles.sub}>Older models that just made the cut, like open models passing 100,000 downloads a month.</p>
            {grid(added)}
          </section>
        )}

        <section className={styles.section} aria-labelledby="prices">
          <h2 id="prices">
            Price changes <span>{prices.length}</span>
          </h2>
          {prices.length ? (
            <ul className={styles.rows}>
              {prices.map((p) => {
                const move = priceMove(p);
                const m = getModelByKey(p.key);
                return (
                  <li key={`${p.key}-${p.date}`} style={{ '--t': labs[p.lab]?.color } as CSSProperties}>
                    <time dateTime={p.date}>{formatDate(p.date).replace(/, \d{4}$/, '')}</time>
                    <span className={styles.rowName}>
                      <span className={styles.dot} aria-hidden="true" />
                      {m ? <Link href={modelHref(m)}>{p.name}</Link> : p.name}
                      <small>{labs[p.lab]?.name}</small>
                    </span>
                    <span className={styles.move}>
                      {move.side} {move.from} → <b>{move.to}</b>
                      {move.change != null && (
                        <em data-dir={move.change < 0 ? 'down' : 'up'}>
                          {move.change < 0 ? '↓' : '↑'} {Math.abs(move.change)}%
                        </em>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty}>No price changes this week. They show up here the morning after a lab or provider changes its list price.</p>
          )}
        </section>

        {gone.length > 0 && (
          <section className={styles.section} aria-labelledby="gone">
            <h2 id="gone">
              Retired <span>{gone.length}</span>
            </h2>
            <ul className={styles.rows}>
              {gone.map((g) => {
                const m = getModelByKey(g.key);
                return (
                  <li key={`${g.key}-${g.date}`} style={{ '--t': labs[g.lab]?.color } as CSSProperties}>
                    <time dateTime={g.date}>{formatDate(g.date).replace(/, \d{4}$/, '')}</time>
                    <span className={styles.rowName}>
                      <span className={styles.dot} aria-hidden="true" />
                      {m ? <Link href={modelHref(m)}>{g.name}</Link> : g.name}
                      <small>{labs[g.lab]?.name}</small>
                    </span>
                    <span className={styles.move}>{g.kind === 'retired' ? 'No longer offered' : 'Left the binder'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

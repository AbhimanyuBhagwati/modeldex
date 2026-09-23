import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset } from '@/lib/data';
import { FavoritesView } from './FavoritesView';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Community favorites',
  description: 'The AI models people vote for most on Modeldex, this week and all time. No sign-in needed to vote.',
  alternates: { canonical: '/favorites/' },
};

export default function FavoritesPage() {
  const data = getDataset();
  // Just what a leaderboard row needs; the full cards stay on their own pages.
  const cards = data.models
    .filter((m) => m.status !== 'deprecated')
    .map(({ key, lab, slug, name, type }) => ({ key, lab, slug, name, type }));
  const labs = data.labs.map(({ key, name, color }) => ({ key, name, color }));
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <p className="eyebrow">Voted by visitors</p>
          <h1 className={styles.title}>Community favorites</h1>
          <p className={styles.lede}>Anyone can vote, no sign-in needed: one vote per card per day. Open any card and tap Vote, or find one below.</p>
        </div>
        <FavoritesView cards={cards} labs={labs} />
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

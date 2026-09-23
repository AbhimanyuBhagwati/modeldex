import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { featuredBattles, getDataset } from '@/lib/data';
import { BattleView } from './BattleView';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Battle mode',
  description: 'Two AI model cards fight round by round on context, price, freshness, skills, size, and downloads. Pick your fighters or deal a random battle.',
  alternates: { canonical: '/battle/' },
};

export default function BattlePage() {
  const data = getDataset();
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <Suspense
          fallback={
            <div className={styles.lobby}>
              <p className="eyebrow">Battle mode</p>
              <h1 className={styles.title}>Pick two cards. Let them fight.</h1>
            </div>
          }
        >
          <BattleView models={data.models} labs={data.labs} setSize={data.models.length} refDate={data.updatedAt} featured={featuredBattles()} />
        </Suspense>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset, matchSignals, scoreBoards } from '@/lib/data';
import { TASKS } from '@/lib/match';
import { MatchView } from './MatchView';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Model Matchmaker',
  description: 'Answer four questions: your task, your budget, what it must handle, and open or paid. Three AI model cards get dealt, each with a reason, from public benchmarks and prices.',
  alternates: { canonical: '/match/' },
};

const TYPES = new Set(Object.values(TASKS).flatMap((t) => t.types as string[]).concat('rerank'));

export default function MatchPage() {
  const data = getDataset();
  // Only cards the matchmaker could ever deal, so the page ships less.
  const pool = data.models.filter((m) => m.status !== 'deprecated' && TYPES.has(m.type));
  const counts = Object.fromEntries(Object.entries(scoreBoards()).map(([b, v]) => [b, v!.count]));
  const intro = (
    <div className={styles.top}>
      <p className="eyebrow">Model Matchmaker</p>
      <h1 className={styles.title}>
        Four questions. <em>Three cards.</em>
      </h1>
      <p className={styles.lede}>
        Tell it the job, the budget, the must-haves, and whether you want open weights. It deals the three best cards from public leaderboards and prices, each with a
        reason. It all runs in your browser: no AI bill, and nothing you pick is sent anywhere.
      </p>
    </div>
  );
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        {intro}
        <Suspense fallback={<div className={styles.stage} />}>
          <MatchView pool={pool} signals={matchSignals(pool)} counts={counts} labs={data.labs} setSize={data.models.length} refDate={data.updatedAt} />
        </Suspense>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

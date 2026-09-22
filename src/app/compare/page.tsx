import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset, newestModels } from '@/lib/data';
import { CompareView } from './CompareView';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Compare models',
  description: 'Up to four AI models side by side: context, prices, modalities, capabilities, and licenses.',
  robots: { index: false, follow: true },
};

export default function ComparePage() {
  const data = getDataset();
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <Suspense
          fallback={
            <div className={styles.top}>
              <div>
                <p className="eyebrow">Head to head</p>
                <h1 className={styles.title}>Compare models</h1>
              </div>
            </div>
          }
        >
          <CompareView models={data.models} labs={data.labs} setSize={data.models.length} refDate={data.updatedAt} newest={newestModels(3).map((m) => m.key)} />
        </Suspense>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

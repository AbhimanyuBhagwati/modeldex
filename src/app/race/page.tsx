import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset, racers, terrariumData } from '@/lib/data';
import { RaceView } from './RaceView';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Race the machine',
  description: 'Type a short passage while AI models type it at the speed Hugging Face measured. See how many times faster they are, and whether you beat any to the first letter.',
  alternates: { canonical: '/race/' },
};

export default function RacePage() {
  const data = getDataset();
  const list = racers();
  const keys = new Set(list.map((r) => r.key));
  const creatures = Object.fromEntries(terrariumData().creatures.filter((c) => keys.has(c.key)).map((c) => [c.key, c]));
  const colors = Object.fromEntries(data.labs.map((l) => [l.key, l.color]));
  const labNames = Object.fromEntries(data.labs.map((l) => [l.key, l.name]));
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <p className="eyebrow">Race the machine</p>
          <h1 className={styles.title}>
            You type. <em>They type faster.</em>
          </h1>
          <p className={styles.lede}>
            Three models race you to type the same passage, each at the speed Hugging Face measured on its fastest host. You probably won’t win. You might beat one of
            them to the first letter.
          </p>
        </div>
        <Suspense fallback={<div className={styles.arena} />}>
          <RaceView racers={list} creatures={creatures} colors={colors} labNames={labNames} />
        </Suspense>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { evolutionLines, getDataset, getLab, getModelByKey } from '@/lib/data';
import { TYPE_LABEL } from '@/lib/format';
import { ArtThumb, chainLabel, lineHref } from './shared';
import styles from './evolution.module.css';

export const metadata: Metadata = {
  title: 'Evolution',
  description: 'Watch AI models evolve, like Pokémon: GPT from 1 to 5.6, Llama from 2 to 4, Claude Opus, Qwen, Gemma, and more, stage by stage.',
  alternates: { canonical: '/evolution/' },
};

export default function EvolutionPage() {
  const data = getDataset();
  const lines = evolutionLines();
  // The longest line from each lab, longest first.
  const seen = new Set<string>();
  const featured = [...lines]
    .sort((a, b) => b.stages.length - a.stages.length)
    .filter((l) => (seen.has(l.lab) ? false : (seen.add(l.lab), true)))
    .slice(0, 6);
  const labs = data.labs
    .map((lab) => ({ lab, lines: lines.filter((l) => l.lab === lab.key) }))
    .filter((x) => x.lines.length)
    .sort((a, b) => b.lines.reduce((n, l) => n + l.stages.length, 0) - a.lines.reduce((n, l) => n + l.stages.length, 0));

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <p className="eyebrow">
            {lines.length} evolution lines · {labs.length} labs
          </p>
          <h1 className={styles.title}>Evolution</h1>
          <p className={styles.lede}>Every model line, stage by stage, like a Pokémon evolving. Pick a lab, pick a line, and press Evolve to watch it grow.</p>
        </div>

        <section aria-labelledby="featured">
          <h2 id="featured" className={styles.h2}>
            Longest lines
          </h2>
          <ul className={styles.lines}>
            {featured.map((line) => {
              const lab = getLab(line.lab);
              const first = getModelByKey(line.stages[0].key)!;
              const last = getModelByKey(line.stages[line.stages.length - 1].key)!;
              return (
                <li key={`${line.lab}/${line.slug}`}>
                  <Link className={styles.line} href={lineHref(line)} style={{ '--t': lab.color } as CSSProperties}>
                    <span className={styles.thumbs} aria-hidden="true">
                      <ArtThumb model={first} color={lab.color} className={styles.thumb} />
                      <span className={styles.arrow}>→</span>
                      <ArtThumb model={last} color={lab.color} className={styles.thumb} />
                    </span>
                    <span className={styles.lineText}>
                      <small>{lab.name}</small>
                      <b>{line.name}</b>
                      <span>
                        {line.stages.length} stages · {chainLabel(line)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="by-lab" className={styles.section}>
          <h2 id="by-lab" className={styles.h2}>
            Pick a lab
          </h2>
          <ul className={styles.labs}>
            {labs.map(({ lab, lines: own }) => (
              <li key={lab.key}>
                <Link className={styles.lab} href={`/evolution/${lab.key}/`} style={{ '--t': lab.color } as CSSProperties}>
                  <span className={styles.swatch} aria-hidden="true" />
                  <span className={styles.labText}>
                    <b>{lab.name}</b>
                    <small>
                      {own.length} {own.length === 1 ? 'line' : 'lines'} · {own.reduce((n, l) => n + l.stages.length, 0)} stages
                    </small>
                    <span>
                      {own
                        .slice(0, 3)
                        .map((l) => (l.type === 'text' ? l.name : `${l.name} (${TYPE_LABEL[l.type].toLowerCase()})`))
                        .join(', ')}
                      {own.length > 3 ? '…' : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

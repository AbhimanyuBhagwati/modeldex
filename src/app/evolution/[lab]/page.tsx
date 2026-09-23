import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { evolutionLines, getDataset, getModelByKey, linesForLab } from '@/lib/data';
import { TYPE_LABEL, formatMonth } from '@/lib/format';
import { ArtThumb, chainLabel, lineHref } from '../shared';
import styles from '../evolution.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return [...new Set(evolutionLines().map((l) => l.lab))].map((lab) => ({ lab }));
}

const findLab = (key: string) => getDataset().labs.find((l) => l.key === key);

export async function generateMetadata({ params }: PageProps<'/evolution/[lab]'>): Promise<Metadata> {
  const lab = findLab((await params).lab);
  if (!lab) return {};
  return { title: `${lab.name} evolutions`, description: `How ${lab.name}’s models evolved, line by line, stage by stage.`, alternates: { canonical: `/evolution/${lab.key}/` } };
}

export default async function LabEvolutionPage({ params }: PageProps<'/evolution/[lab]'>) {
  const lab = findLab((await params).lab);
  if (!lab) notFound();
  const data = getDataset();
  const lines = linesForLab(lab.key).sort((a, b) => b.stages.length - a.stages.length || a.name.localeCompare(b.name));

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page" style={{ '--t': lab.color } as CSSProperties}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/evolution/">Evolution</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{lab.name}</span>
        </nav>
        <div className={styles.top}>
          <p className="eyebrow">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </p>
          <h1 className={styles.title}>{lab.name} evolutions</h1>
          <p className={styles.lede}>
            Pick a line to watch it evolve. <Link href={`/labs/${lab.key}/`}>See every {lab.name} card</Link>
          </p>
        </div>
        <ul className={styles.lines}>
          {lines.map((line) => {
            const first = getModelByKey(line.stages[0].key)!;
            const last = getModelByKey(line.stages[line.stages.length - 1].key)!;
            return (
              <li key={line.slug}>
                <Link className={styles.line} href={lineHref(line)}>
                  <span className={styles.thumbs} aria-hidden="true">
                    <ArtThumb model={first} color={lab.color} className={styles.thumb} />
                    <span className={styles.arrow}>→</span>
                    <ArtThumb model={last} color={lab.color} className={styles.thumb} />
                  </span>
                  <span className={styles.lineText}>
                    <small>
                      {TYPE_LABEL[line.type]} · {formatMonth(line.stages[0].releaseDate)} to {formatMonth(line.stages[line.stages.length - 1].releaseDate)}
                    </small>
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
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

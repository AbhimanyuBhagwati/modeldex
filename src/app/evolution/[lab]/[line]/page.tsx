import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { EvolutionTheater, type TheaterStage } from '@/components/evolution/EvolutionTheater';
import { evolutionLines, getDataset, getLab, getLine, getModelByKey, linesForLab } from '@/lib/data';
import { evolutionReport } from '@/lib/evolution';
import { TYPE_LABEL, formatCount, formatMonth, formatParams, formatPrice, formatTokens } from '@/lib/format';
import { modelHref } from '@/lib/site';
import type { Model } from '@/lib/types';
import { lineHref } from '../../shared';
import styles from '../../evolution.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return evolutionLines().map((l) => ({ lab: l.lab, line: l.slug }));
}

export async function generateMetadata({ params }: PageProps<'/evolution/[lab]/[line]'>): Promise<Metadata> {
  const { lab, line: slug } = await params;
  const line = getLine(lab, slug);
  if (!line) return {};
  const labName = getLab(lab).name;
  const names = line.stages.map((s) => getModelByKey(s.key)?.name).filter(Boolean);
  return {
    title: `${line.name} evolution`,
    description: `How ${labName}’s ${line.name} evolved: ${names.join(' → ')}.`.slice(0, 300),
    alternates: { canonical: lineHref(line) },
  };
}

/** One stat across every stage, drawn as bars. Log scale, since context grew from thousands to millions. */
const GROWTH: { label: string; note?: string; value: (m: Model) => number | null | undefined; format: (v: number) => string }[] = [
  { label: 'Context window', value: (m) => m.context, format: formatTokens },
  { label: 'Max output', value: (m) => m.maxOutput, format: formatTokens },
  { label: 'Output price', note: 'per 1M tokens, lower is better', value: (m) => m.price?.output || null, format: formatPrice },
  { label: 'Parameters', value: (m) => m.hub?.params, format: (v) => formatParams(v) },
  { label: 'Downloads', note: 'last 30 days', value: (m) => m.hub?.downloads, format: (v) => formatCount(v) },
];

export default async function LinePage({ params }: PageProps<'/evolution/[lab]/[line]'>) {
  const { lab: labKey, line: slug } = await params;
  const line = getLine(labKey, slug);
  if (!line) notFound();
  const data = getDataset();
  const lab = getLab(line.lab);
  const models = line.stages.map((s) => getModelByKey(s.key)!);
  const stages: TheaterStage[] = line.stages.map((s, i) => ({
    version: s.version,
    model: models[i],
    variants: s.variants,
    report: i > 0 ? evolutionReport(models[i - 1], models[i]) : null,
  }));
  const growth = GROWTH.map((g) => ({ ...g, values: models.map((m) => g.value(m) ?? null) })).filter((g) => g.values.filter((v) => v != null && v > 0).length >= 2);
  const siblings = linesForLab(line.lab).filter((l) => l.slug !== line.slug);
  const first = models[0];
  const last = models[models.length - 1];
  const months = Math.round((Date.parse(last.releaseDate) - Date.parse(first.releaseDate)) / (30.44 * 864e5));

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page" style={{ '--t': lab.color } as CSSProperties}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/evolution/">Evolution</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/evolution/${lab.key}/`}>{lab.name}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{line.name}</span>
        </nav>
        <div className={styles.top}>
          <p className="eyebrow">
            {lab.name} · {TYPE_LABEL[line.type]} line
          </p>
          <h1 className={styles.title}>{line.name}</h1>
          <p className={styles.lede}>
            {line.stages.length} stages {months > 0 ? `over ${months} months` : ''}, from {first.name} in {formatMonth(first.releaseDate)} to {last.name} in {formatMonth(last.releaseDate)}.
          </p>
        </div>

        <EvolutionTheater stages={stages} lab={lab} setSize={data.models.length} refDate={data.updatedAt} />

        {growth.length > 0 && (
          <section className={styles.section} aria-labelledby="growth">
            <h2 id="growth" className={styles.h2}>
              How it grew
            </h2>
            <div className={styles.growth} style={{ '--n': line.stages.length } as CSSProperties}>
              {growth.map((g) => {
                const present = g.values.filter((v): v is number => v != null && v > 0);
                const lo = Math.log(Math.min(...present));
                const hi = Math.log(Math.max(...present));
                return (
                  <div key={g.label} className={styles.stat}>
                    <p className={styles.statLabel}>
                      {g.label}
                      {g.note && <small>{g.note}</small>}
                    </p>
                    <ol className={styles.bars}>
                      {g.values.map((v, i) => (
                        <li key={line.stages[i].key} style={{ '--h': v ? (hi === lo ? 1 : 0.12 + (0.88 * (Math.log(v) - lo)) / (hi - lo)) : 0, '--i': i } as CSSProperties}>
                          <span className={styles.barValue}>{v ? g.format(v) : '—'}</span>
                          <span className={styles.bar} data-empty={!v || undefined} />
                          <span className={styles.barVersion}>v{line.stages[i].version}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className={styles.section} aria-labelledby="stages">
          <h2 id="stages" className={styles.h2}>
            Every stage
          </h2>
          <ol className={styles.stages}>
            {line.stages.map((s, i) => (
              <li key={s.key}>
                <p className={styles.stageHead}>
                  <b>v{s.version}</b> Stage {i + 1}
                </p>
                <Card model={models[i]} lab={lab} setSize={data.models.length} refDate={data.updatedAt} />
                {s.variants.length > 0 && (
                  <details className={styles.variants}>
                    <summary>
                      +{s.variants.length} more in v{s.version}
                    </summary>
                    <ul>
                      {s.variants.map((k) => {
                        const v = getModelByKey(k)!;
                        return (
                          <li key={k}>
                            <Link href={modelHref(v)}>{v.name}</Link>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>

        {siblings.length > 0 && (
          <section className={styles.section} aria-labelledby="more-lines">
            <h2 id="more-lines" className={styles.h2}>
              More {lab.name} lines
            </h2>
            <ul className={styles.pills}>
              {siblings.map((l) => (
                <li key={l.slug}>
                  <Link href={lineHref(l)}>
                    {l.name} <small>{l.stages.length} stages</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { Icon, RarityIcon } from '@/components/icons';
import { LABS } from '@/config/labs';
import { getDataset, labModels } from '@/lib/data';
import { ACCESS_LABEL, RARITY_LABEL, TYPE_LABEL, formatDate, formatMonth } from '@/lib/format';
import { modelHref } from '@/lib/site';
import { MODEL_TYPES, type Model } from '@/lib/types';
import styles from '../labs.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return getDataset().labs.map((l) => ({ lab: l.key }));
}

const findLab = (key: string) => getDataset().labs.find((l) => l.key === key);

export async function generateMetadata({ params }: PageProps<'/labs/[lab]'>): Promise<Metadata> {
  const lab = findLab((await params).lab);
  if (!lab) return {};
  const description = `All ${lab.count} ${lab.name} models in Modeldex, newest first, with a release timeline and links to ${lab.name}’s own docs.`;
  return { title: `${lab.name} models`, description, alternates: { canonical: `/labs/${lab.key}/` }, openGraph: { title: `${lab.name} models`, description } };
}

/** Year, then month, newest first. */
function timeline(models: Model[]) {
  const years = new Map<string, Map<string, Model[]>>();
  for (const m of models) {
    const year = m.releaseDate.slice(0, 4);
    const month = m.releaseDate.slice(0, 7);
    const months = years.get(year) ?? new Map<string, Model[]>();
    months.set(month, [...(months.get(month) ?? []), m]);
    years.set(year, months);
  }
  return [...years];
}

export default async function LabPage({ params }: PageProps<'/labs/[lab]'>) {
  const lab = findLab((await params).lab);
  if (!lab) notFound();
  const data = getDataset();
  const config = LABS.find((l) => l.key === lab.key);
  const models = labModels(lab.key);
  const live = models.filter((m) => m.status !== 'deprecated');
  const types = MODEL_TYPES.map((t) => [t, models.filter((m) => m.type === t).length] as const).filter(([, n]) => n > 0);
  const open = models.filter((m) => m.openWeights).length;
  const first = models[models.length - 1];
  const docsOnHub = lab.docUrl?.startsWith('https://huggingface.co/');
  const hubOrgs = config?.hub ?? [];

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page" style={{ '--t': lab.color } as CSSProperties}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/">Binder</Link>
          <span aria-hidden="true">/</span>
          <Link href="/labs/">Labs</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{lab.name}</span>
        </nav>

        <header className={styles.labHead}>
          <span className={styles.labMark} aria-hidden="true" />
          <div>
            <h1 className={styles.title}>{lab.name}</h1>
            <p className={styles.lede}>
              {lab.count} {lab.count === 1 ? 'card' : 'cards'}
              {first && `, from ${formatMonth(first.releaseDate)} to ${formatMonth(models[0].releaseDate)}`}. {open > 0 && `${open} with open weights.`}
            </p>
            <div className={styles.links}>
              {lab.docUrl && !docsOnHub && (
                <a className="btn btn-gold" href={lab.docUrl} target="_blank" rel="noopener noreferrer">
                  {lab.name} docs
                  <Icon name="out" />
                </a>
              )}
              {hubOrgs.map((org, i) => (
                <a key={org} className={docsOnHub && i === 0 ? 'btn btn-gold' : 'btn'} href={`https://huggingface.co/${org}`} target="_blank" rel="noopener noreferrer">
                  {hubOrgs.length > 1 ? `huggingface.co/${org}` : 'On Hugging Face'}
                  <Icon name="out" />
                </a>
              ))}
              <Link className="btn btn-ghost" href={`/?lab=${lab.key}#binder`}>
                Filter the binder
              </Link>
            </div>
          </div>
        </header>

        <ul className={styles.typeChips} aria-label="Cards by type">
          {types.map(([t, n]) => (
            <li key={t}>
              <Link href={`/?lab=${lab.key}&type=${t}#binder`}>
                {TYPE_LABEL[t]} <b>{n}</b>
              </Link>
            </li>
          ))}
        </ul>

        {live.length > 0 && (
          <section className={styles.section} aria-labelledby="latest">
            <h2 id="latest">Latest</h2>
            <div className={styles.grid}>
              {live.slice(0, 4).map((m) => (
                <Card key={m.key} model={m} lab={lab} setSize={data.models.length} refDate={data.updatedAt} />
              ))}
            </div>
          </section>
        )}

        <section className={styles.section} aria-labelledby="timeline">
          <h2 id="timeline">Timeline</h2>
          <ol className={styles.years}>
            {timeline(models).map(([year, months]) => (
              <li key={year} className={styles.year}>
                <h3>{year}</h3>
                <ol className={styles.months}>
                  {[...months].map(([month, list]) => (
                    <li key={month}>
                      <p className={styles.month}>{formatMonth(month)}</p>
                      <ul className={styles.releases}>
                        {list.map((m) => (
                          <li key={m.key} data-retired={m.status === 'deprecated' || undefined}>
                            <time dateTime={m.releaseDate}>{formatDate(m.releaseDate).replace(/, \d{4}$/, '')}</time>
                            <Link href={modelHref(m)}>{m.name}</Link>
                            <span className={styles.meta}>
                              {TYPE_LABEL[m.type]}
                              <span title={RARITY_LABEL[m.rarity]}>
                                <RarityIcon rarity={m.rarity} />
                              </span>
                              <span className={`acc acc-${m.access}`}>{ACCESS_LABEL[m.access]}</span>
                              {m.status === 'deprecated' && <span className="status status-deprecated">Retired</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          <p className={styles.note}>Dates are release dates from models.dev; for open models found on Hugging Face, the day the repo was published.</p>
        </section>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

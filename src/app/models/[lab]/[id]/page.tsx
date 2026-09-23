import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { CardShowcase } from '@/components/card/CardShowcase';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { AddToDeckButton, CopyButton } from '@/components/client-bits';
import { Icon, RarityIcon } from '@/components/icons';
import { getDataset, getLab, getModel, moreFromLab, opponentFor, rivalsOf } from '@/lib/data';
import {
  ACCESS_LABEL,
  INPUT_ONLY,
  RARITY_LABEL,
  STATUS_LABEL,
  TYPE_HINT,
  TYPE_LABEL,
  formatCount,
  formatDate,
  formatMonth,
  formatParams,
  formatPrice,
  formatTokens,
  formatTokensLong,
  modalityList,
  padSet,
} from '@/lib/format';
import { battleHref, compareHref, modelHref } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import styles from './page.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return getDataset().models.map((m) => ({ lab: m.lab, id: m.slug }));
}

export async function generateMetadata({ params }: PageProps<'/models/[lab]/[id]'>): Promise<Metadata> {
  const { lab, id } = await params;
  const m = getModel(lab, id);
  if (!m) return {};
  const l = getLab(m.lab);
  const facts = [
    m.context && `${formatTokens(m.context)} context`,
    m.price?.output != null && `${formatPrice(m.price.input)} in, ${formatPrice(m.price.output)} out per 1M tokens`,
    m.hub?.params && `${formatParams(m.hub.params)} parameters`,
    m.hub && `${formatCount(m.hub.downloads)} downloads a month`,
    m.license.name,
  ].filter(Boolean);
  const description = `${m.name} by ${l.name}: ${facts.join(' · ')}. ${m.description}`.trim().slice(0, 300);
  return {
    title: `${m.name} by ${l.name}`,
    description,
    alternates: { canonical: modelHref(m) },
    openGraph: {
      title: `${m.name} by ${l.name}`,
      description,
      type: 'article',
      url: modelHref(m),
      images: [{ url: `${modelHref(m)}og.png`, width: 1200, height: 630, alt: `${m.name} card` }],
    },
    twitter: { card: 'summary_large_image', images: [`${modelHref(m)}og.png`] },
  };
}

const perMillion = (v: number | null | undefined) => (v == null ? '—' : v === 0 ? 'Free' : `${formatPrice(v)} / 1M tokens`);
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

function licenseNote(m: Model, lab: LabSummary): string {
  switch (m.license.source) {
    case 'huggingface':
      return 'License read from the model’s Hugging Face card.';
    case 'override':
      return 'License set by hand after checking the model card.';
    case 'lab-default':
      return m.origin === 'huggingface'
        ? 'The Hugging Face repo doesn’t declare a license. Check the model card before relying on it.'
        : `No matching Hugging Face repo was found, so this shows ${lab.name}’s usual open-weight license. Check the model card before relying on it.`;
    default:
      return `Weights aren’t public. Use is governed by ${lab.name}’s terms.`;
  }
}

export default async function ModelPage({ params }: PageProps<'/models/[lab]/[id]'>) {
  const { lab: labKey, id } = await params;
  const m = getModel(labKey, id);
  if (!m) notFound();
  const data = getDataset();
  const lab = getLab(m.lab);
  const labs = Object.fromEntries(data.labs.map((l) => [l.key, l]));
  const rivals = rivalsOf(m, 3);
  const more = moreFromLab(m, 8);
  const opponent = opponentFor(m);
  const fromHub = m.origin === 'huggingface';
  const repoUrl = m.hub ? `https://huggingface.co/${m.hub.repo}` : m.license.url;
  const labOnHub = lab.docUrl?.startsWith('https://huggingface.co/');

  const hubSpecs: [string, string][] = m.hub
    ? [
        ['Parameters', m.hub.params ? `${formatParams(m.hub.params)} (${m.hub.params.toLocaleString('en-US')})` : '—'],
        ['Downloads', `${formatCount(m.hub.downloads)} in the last 30 days`],
        ['Likes', formatCount(m.hub.likes)],
        ['Access to weights', m.hub.gated ? 'Accept the license on Hugging Face first' : 'Open download'],
      ]
    : [];
  // Open models from Hugging Face have no API specs, so skip the rows that would all read "—".
  const apiSpecs: [string, string][] = [
    ['Context window', formatTokensLong(m.context)],
    ['Max output', formatTokensLong(m.maxOutput)],
    ['Input price', perMillion(m.price?.input)],
    ['Output price', INPUT_ONLY.has(m.type) && !m.price?.output ? 'Not billed' : perMillion(m.price?.output)],
    ['Cache read', perMillion(m.price?.cacheRead)],
    ['Cache write', perMillion(m.price?.cacheWrite)],
  ];
  const specs: [string, string][] = [
    ['Type', TYPE_LABEL[m.type]],
    ...(fromHub ? [] : apiSpecs),
    ...hubSpecs,
    [fromHub ? 'On Hugging Face since' : 'Released', formatDate(m.releaseDate)],
    ...(fromHub ? [] : ([['Knowledge cutoff', formatMonth(m.knowledge)]] as [string, string][])),
    ['Takes in', modalityList(m.input)],
    ['Puts out', modalityList(m.output)],
    ...(fromHub
      ? []
      : ([
          ['Reasoning', yesNo(m.reasoning)],
          ['Tool calling', yesNo(m.toolCall)],
          ['Structured output', yesNo(m.structuredOutput)],
          ['File attachments', yesNo(m.attachment)],
        ] as [string, string][])),
    ['Access', ACCESS_LABEL[m.access]],
    ['License', m.license.name],
    ['Rarity', RARITY_LABEL[m.rarity]],
    ['Set number', `${padSet(m.set)}/${data.models.length}`],
  ];

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/">Binder</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/?lab=${m.lab}#binder`}>{lab.name}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{m.name}</span>
        </nav>

        <article className={styles.layout}>
          <div className={styles.cardCol}>
            <CardShowcase model={m} lab={lab} setSize={data.models.length} refDate={data.updatedAt} headingLevel="h2" />
          </div>
          <div className={styles.info}>
            <p className={styles.kicker}>
              <span className={styles.dot} style={{ '--t': lab.color } as CSSProperties} />
              {lab.name}
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <span title={TYPE_HINT[m.type]}>{TYPE_LABEL[m.type]}</span>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <RarityIcon rarity={m.rarity} />
              {RARITY_LABEL[m.rarity]}
              {m.status && <span className={`status status-${m.status}`}>{STATUS_LABEL[m.status]}</span>}
            </p>
            <h1 className={styles.title}>{m.name}</h1>
            {m.description && <p className={styles.desc}>{m.description}</p>}
            <div className={styles.idRow}>
              <code>{m.id}</code>
              <CopyButton text={m.id} label="Copy ID" />
            </div>
            <dl className={styles.specs}>
              {specs.map(([k, v]) => (
                <div key={k} className={styles.spec}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.actions}>
              {fromHub && repoUrl ? (
                <a className="btn btn-gold" href={repoUrl} target="_blank" rel="noopener noreferrer">
                  Open on Hugging Face
                  <Icon name="out" />
                </a>
              ) : (
                lab.docUrl && (
                  <a className="btn btn-gold" href={lab.docUrl} target="_blank" rel="noopener noreferrer">
                    {labOnHub ? `${lab.name} on Hugging Face` : `Open ${lab.name} docs`}
                    <Icon name="out" />
                  </a>
                )
              )}
              {!fromHub && repoUrl && (
                <a className="btn" href={repoUrl} target="_blank" rel="noopener noreferrer">
                  Weights on Hugging Face
                  <Icon name="out" />
                </a>
              )}
              {opponent && (
                <Link className="btn" href={battleHref(m.key, opponent.key)}>
                  Battle {opponent.name}
                </Link>
              )}
              <AddToDeckButton entry={{ key: m.key, name: m.name, color: lab.color }} />
            </div>
            <p className={styles.note}>
              {licenseNote(m, lab)}{' '}
              {fromHub
                ? `Stats from ${lab.name}’s official Hugging Face account, refreshed daily.`
                : `Specs from models.dev${m.hub ? ', downloads from Hugging Face' : ''}, last changed ${formatDate(data.updatedAt.slice(0, 10))}.`}
              {!fromHub && lab.docUrl && ` Official source: ${new URL(lab.docUrl).host}.`}
            </p>
          </div>
        </article>

        {rivals.length > 0 && (
          <section className={styles.section} aria-labelledby="faceoff">
            <h2 id="faceoff">Face off</h2>
            <p className={styles.sectionLede}>Current {TYPE_LABEL[m.type].toLowerCase()} models from other labs at a similar output price.</p>
            <ul className={styles.rivals}>
              {rivals.map((r) => (
                <li key={r.key}>
                  <Link className={styles.rival} href={compareHref([m.key, r.key])}>
                    <span className={styles.vsDots} aria-hidden="true">
                      <span style={{ '--t': lab.color } as CSSProperties} />
                      <span style={{ '--t': labs[r.lab].color } as CSSProperties} />
                    </span>
                    <span className={styles.rivalText}>
                      <b>vs {r.name}</b>
                      <small>
                        {labs[r.lab].name} · {formatPrice(r.price?.output ?? null)} out per 1M
                      </small>
                    </span>
                    <Icon name="chev" className={styles.rivalChev} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {more.length > 0 && (
          <section className={styles.section} aria-labelledby="more">
            <h2 id="more">More from {lab.name}</h2>
            <div className={styles.grid}>
              {more.map((x) => (
                <Card key={x.key} model={x} lab={lab} setSize={data.models.length} refDate={data.updatedAt} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

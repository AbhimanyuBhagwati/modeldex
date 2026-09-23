'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Card } from '@/components/card/Card';
import { useDeckApi } from '@/components/deck/DeckProvider';
import { CopyButton } from '@/components/client-bits';
import { Energies, Icon, RarityIcon } from '@/components/icons';
import { ACCESS_LABEL, INPUT_ONLY, RARITY_LABEL, TYPE_LABEL, formatCount, formatDate, formatMonth, formatParams, formatPrice, formatTokens, modalityList } from '@/lib/format';
import { MAX_DECK, battleHref, compareHref, parseCompareParam } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import styles from './page.module.css';

interface Row {
  label: string;
  sub?: string;
  value?: (m: Model) => number | string | null;
  format?: (v: never) => string;
  better?: 'high' | 'low';
  tag?: string;
  bar?: boolean;
  render?: (m: Model) => ReactNode;
  flag?: (m: Model) => boolean;
}

function Mods({ list }: { list: Model['input'] }) {
  return (
    <span className={styles.mods}>
      <Energies list={list} />
      <span>{modalityList(list)}</span>
    </span>
  );
}

const ROWS: Row[] = [
  { label: 'Type', render: (m) => TYPE_LABEL[m.type] },
  {
    label: 'Quality',
    sub: 'share of its leaderboard it beats',
    value: (m) => m.quality?.value ?? null,
    format: (v: number | null) => (v == null ? 'Not rated' : `${v}/100`),
    better: 'high',
    tag: 'Best rated',
    bar: true,
  },
  { label: 'Context window', value: (m) => m.context, format: formatTokens, better: 'high', tag: 'Largest', bar: true },
  { label: 'Max output', value: (m) => m.maxOutput, format: formatTokens, better: 'high', tag: 'Longest', bar: true },
  { label: 'Input price', sub: 'per 1M tokens', value: (m) => m.price?.input ?? null, format: formatPrice, better: 'low', tag: 'Cheapest', bar: true },
  {
    label: 'Output price',
    sub: 'per 1M tokens',
    value: (m) => (INPUT_ONLY.has(m.type) && !m.price?.output ? null : (m.price?.output ?? null)),
    format: formatPrice,
    better: 'low',
    tag: 'Cheapest',
    bar: true,
  },
  { label: 'Cache read', sub: 'per 1M tokens', value: (m) => m.price?.cacheRead ?? null, format: formatPrice, better: 'low', tag: 'Cheapest', bar: true },
  { label: 'Parameters', sub: 'open weights', value: (m) => m.hub?.params ?? null, format: formatParams, better: 'high', tag: 'Largest', bar: true },
  { label: 'Downloads', sub: 'last 30 days, Hugging Face', value: (m) => m.hub?.downloads ?? null, format: formatCount, better: 'high', tag: 'Most used', bar: true },
  { label: 'Released', value: (m) => m.releaseDate, format: formatDate, better: 'high', tag: 'Newest' },
  { label: 'Knowledge cutoff', value: (m) => m.knowledge, format: formatMonth, better: 'high', tag: 'Freshest' },
  { label: 'Takes in', render: (m) => <Mods list={m.input} /> },
  { label: 'Puts out', render: (m) => <Mods list={m.output} /> },
  { label: 'Reasoning', flag: (m) => m.reasoning },
  { label: 'Tool calling', flag: (m) => m.toolCall },
  { label: 'Structured output', flag: (m) => m.structuredOutput },
  { label: 'File attachments', flag: (m) => m.attachment },
  { label: 'Access', render: (m) => <span className={`acc acc-${m.access}`}>{ACCESS_LABEL[m.access]}</span> },
  {
    label: 'License',
    render: (m) =>
      m.license.url ? (
        <a className={styles.inlineLink} href={m.license.url} target="_blank" rel="noopener noreferrer">
          {m.license.name}
        </a>
      ) : (
        m.license.name
      ),
  },
  {
    label: 'Rarity',
    render: (m) => (
      <span className={styles.rarity}>
        <RarityIcon rarity={m.rarity} />
        {RARITY_LABEL[m.rarity]}
      </span>
    ),
  },
];

function best(values: (number | string | null)[], better: 'high' | 'low') {
  const present = values.filter((v): v is number | string => v != null);
  if (present.length < 2 || new Set(present).size < 2) return null;
  return present.reduce((a, b) => ((better === 'high' ? b > a : b < a) ? b : a));
}

interface Props {
  models: Model[];
  labs: LabSummary[];
  setSize: number;
  refDate: string;
  newest: string[];
}

/** Reads `?m=` in the browser, since a static host can't build a page per combination. */
export function CompareView({ models: all, labs: labList, setSize, refDate, newest }: Props) {
  const params = useSearchParams();
  const deck = useDeckApi();
  const byKey = useMemo(() => new Map(all.map((m) => [m.key, m])), [all]);
  const labs = useMemo(() => Object.fromEntries(labList.map((l) => [l.key, l])), [labList]);
  const models = parseCompareParam(params.getAll('m'))
    .map((k) => byKey.get(k))
    .filter((m): m is Model => Boolean(m));
  const keys = models.map((m) => m.key);
  const editDeck = () => {
    if (models.length) deck.replace(models.map((m) => ({ key: m.key, name: m.name, color: labs[m.lab].color })));
  };
  const title = models.length >= 2 ? models.map((m) => m.name).join(' vs ') : 'Compare models';

  useEffect(() => {
    document.title = `${title} · Modeldex`;
  }, [title]);

  return (
    <>
      <div className={styles.top}>
        <div>
          <p className="eyebrow">Head to head</p>
          <h1 className={styles.title}>{title}</h1>
          {models.length >= 2 && <p className={styles.lede}>Gold tags mark the best value in each row. Share the link and the same cards show up for whoever opens it.</p>}
        </div>
        {models.length >= 2 && (
          <div className={styles.topActions}>
            <Link className="btn btn-gold" href={battleHref(keys[0], keys[1])}>
              {models.length === 2 ? 'Battle these two' : 'Battle the first two'}
            </Link>
            <CopyButton label="Copy link" className="btn" />
            <Link className="btn btn-ghost" href="/#binder">
              <Icon name="back" />
              Back to the binder
            </Link>
          </div>
        )}
      </div>

      {models.length < 2 ? (
        <Empty models={models} newest={newest} onBrowse={editDeck} />
      ) : (
        <div className={styles.scroll} role="region" aria-label="Model comparison, scroll horizontally to see all cards" tabIndex={0}>
          <div className={styles.grid} role="table" aria-label="Model specifications" style={{ '--n': models.length + (models.length < MAX_DECK ? 1 : 0) } as CSSProperties}>
            <div className={styles.row} role="row">
              <div className={`${styles.label} ${styles.corner}`} role="columnheader"><span className={styles.tableLabel}>Your matchup</span><b>{models.length} cards</b><small>Scroll to compare →</small></div>
              {models.map((m) => (
                <div key={m.key} className={styles.head} role="columnheader" aria-label={`${m.name} by ${labs[m.lab].name}`}>
                  <div className={styles.cardHost}>
                    <Card model={m} lab={labs[m.lab]} setSize={setSize} refDate={refDate} addable={false} headingLevel="h2" />
                  </div>
                  <Link className="btn btn-tiny btn-ghost" aria-label={`Remove ${m.name} from comparison`} href={compareHref(keys.filter((k) => k !== m.key))} scroll={false} onClick={() => deck.remove(m.key)}>
                    Remove
                  </Link>
                </div>
              ))}
              {models.length < MAX_DECK && (
                <div className={styles.head} role="columnheader">
                  <Link className={styles.addSlot} href="/#binder" onClick={editDeck}>
                    <Icon name="plus" />
                    <span>Add a card from the binder</span>
                  </Link>
                </div>
              )}
            </div>

            {ROWS.map((row) => {
              const values = row.value ? models.map(row.value) : [];
              const top = row.better ? best(values, row.better) : null;
              const max = row.bar ? Math.max(0, ...values.filter((v): v is number => typeof v === 'number')) : 0;
              return (
                <div key={row.label} className={styles.row} role="row">
                  <div className={styles.label} role="rowheader">
                    {row.label}
                    {row.sub && <small>{row.sub}</small>}
                  </div>
                  {models.map((m, i) => {
                    if (row.flag) {
                      return (
                        <div key={m.key} className={styles.cell} role="cell">
                          {row.flag(m) ? (
                            <span className={styles.yes}>
                              <Icon name="check" />
                              Yes
                            </span>
                          ) : (
                            <span className={styles.no}>No</span>
                          )}
                        </div>
                      );
                    }
                    if (row.render) {
                      return (
                        <div key={m.key} className={styles.cell} role="cell">
                          {row.render(m)}
                        </div>
                      );
                    }
                    const v = values[i];
                    const isBest = top != null && v === top;
                    const pct = row.bar && typeof v === 'number' && max > 0 ? (v / max) * 100 : 0;
                    return (
                      <div key={m.key} className={`${styles.cell} ${isBest ? styles.best : ''}`} role="cell" style={{ '--t': labs[m.lab].color } as CSSProperties}>
                        <div className={styles.val}>
                          <span>{row.format!(v as never)}</span>
                          {isBest && <span className={styles.tag}>{row.tag}</span>}
                        </div>
                        {row.bar && (
                          <div className={styles.bar} aria-hidden="true">
                            <i style={{ width: `${pct}%`, animationDelay: `${i * 30}ms` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {models.length < MAX_DECK && <div className={styles.cell} role="cell" />}
                </div>
              );
            })}

            <div className={styles.row} role="row">
              <div className={styles.label} role="rowheader">Official source</div>
              {models.map((m) => {
                const lab = labs[m.lab];
                return (
                  <div key={m.key} className={styles.cell} role="cell">
                    {lab.docUrl ? (
                      <a className="btn btn-tiny" href={lab.docUrl} target="_blank" rel="noopener noreferrer">
                        {lab.name} docs
                        <Icon name="out" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </div>
                );
              })}
              {models.length < MAX_DECK && <div className={styles.cell} role="cell" />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Empty({ models, newest, onBrowse }: { models: Model[]; newest: string[]; onBrowse: () => void }) {
  return (
    <div className={styles.empty}>
      <p>{models.length === 1 ? `${models[0].name} needs an opponent.` : 'Pick at least two cards to see them head to head.'}</p>
      <p className={styles.emptyHint}>Add cards with the + button on any card in the binder, then press Compare in the deck at the bottom of the screen.</p>
      <div className={styles.emptyActions}>
        <Link className="btn btn-gold" href="/#binder" onClick={onBrowse}>
          Browse the binder
        </Link>
        <Link className="btn" href={compareHref([...new Set([...models.map((m) => m.key), ...newest])].slice(0, 3))}>
          {models.length === 1 ? 'Face the newest cards' : 'Compare the newest three'}
        </Link>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { memo, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { useDeckApi, useInDeck } from '@/components/deck/DeckProvider';
import { Energies, Icon, RarityIcon } from '@/components/icons';
import { ART_H, ART_W, cardArt, type Shape } from '@/lib/art';
import { ACCESS_LABEL, STATUS_LABEL, cardFace, isNew, padSet, typeLine } from '@/lib/format';
import { qualityTier, qualityTitle } from '@/lib/quality';
import { modelHref } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import styles from './Card.module.css';
import { useTilt } from './useTilt';

export interface CardProps {
  model: Model;
  lab: Pick<LabSummary, 'name' | 'color'>;
  setSize: number;
  /** The dataset's own date; "New" is measured from it. */
  refDate: string;
  /** Whole card links to the model page. */
  link?: boolean;
  /** Shows the add-to-compare button. */
  addable?: boolean;
  tilt?: number;
  headingLevel?: 'h2' | 'h3';
}

const TILT_CLASSES = { hot: styles.hot, tilting: styles.tilting };

function ArtShape({ s }: { s: Shape }) {
  const paint = {
    fill: s.fill ?? 'none',
    fillOpacity: s.fo,
    stroke: s.stroke,
    strokeWidth: s.sw,
    strokeOpacity: s.so,
    strokeDasharray: s.dash,
  };
  if (s.k === 'c') return <circle cx={s.x} cy={s.y} r={s.r} {...paint} />;
  if (s.k === 'e') return <ellipse cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} transform={s.rot ? `rotate(${s.rot} ${s.x} ${s.y})` : undefined} {...paint} />;
  return <path d={s.d} {...paint} />;
}

function CardArt({ model, color }: { model: Model; color: string }) {
  const art = useMemo(() => cardArt(model, color), [model, color]);
  const { id, pattern } = art;
  return (
    <svg viewBox={`0 0 ${ART_W} ${ART_H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} gradientTransform={`rotate(${art.angle} .5 .5)`}>
          <stop offset="0" stopColor={art.from} />
          <stop offset="1" stopColor={art.to} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx={`${art.gx}%`} cy={`${art.gy}%`} r="70%">
          <stop offset="0" stopColor={art.glow} stopOpacity={0.55} />
          <stop offset="1" stopColor={art.glow} stopOpacity={0} />
        </radialGradient>
        {pattern && (
          <pattern id={`${id}-t`} patternUnits="userSpaceOnUse" width={pattern.w} height={pattern.h}>
            {pattern.mode === 'fill' ? <path d={pattern.d} fill="#fff" /> : <path d={pattern.d} fill="none" stroke="#fff" strokeWidth={0.6} />}
          </pattern>
        )}
      </defs>
      <rect width={ART_W} height={ART_H} fill={`url(#${id}-bg)`} />
      <rect width={ART_W} height={ART_H} fill={`url(#${id}-glow)`} />
      {pattern && <rect width={ART_W} height={ART_H} fill={`url(#${id}-t)`} opacity={pattern.o} />}
      {art.shapes.map((s, i) => (
        <ArtShape key={i} s={s} />
      ))}
    </svg>
  );
}

function AddButton({ model, color, cardRef }: { model: Model; color: string; cardRef: RefObject<HTMLElement | null> }) {
  const deck = useDeckApi();
  const inDeck = useInDeck(model.key);
  return (
    <button
      type="button"
      className={styles.add}
      aria-pressed={inDeck}
      aria-label={inDeck ? `Remove ${model.name} from compare` : `Add ${model.name} to compare`}
      onClick={() => deck.toggle({ key: model.key, name: model.name, color }, cardRef.current)}
    >
      <Icon name={inDeck ? 'check' : 'plus'} />
    </button>
  );
}

function CardImpl({ model: m, lab, setSize, refDate, link = true, addable = true, tilt = 12, headingLevel: Heading = 'h3' }: CardProps) {
  const ref = useRef<HTMLElement>(null);
  useTilt(ref, tilt, TILT_CLASSES);
  const fresh = isNew(m, refDate);
  const { corner, moves } = cardFace(m);

  return (
    <article ref={ref} className={styles.card} data-rarity={m.rarity} data-type={m.type} data-status={m.status ?? undefined} style={{ '--t': lab.color } as CSSProperties}>
      <div className={styles.frame}>
        <div className={styles.face}>
          <div className={styles.top}>
            <div className={styles.titles}>
              <span className={styles.lab}>{lab.name}</span>
              <Heading className={styles.name} title={m.name}>
                {m.name}
              </Heading>
            </div>
            {corner && (
              <div className={styles.hp} title={corner.title}>
                <span>{corner.label}</span>
                <b>{corner.value}</b>
              </div>
            )}
          </div>
          <div className={styles.art}>
            <CardArt model={m} color={lab.color} />
            {(fresh || m.status) && (
              <div className={styles.flags}>
                {fresh && <span className={styles.flag}>New</span>}
                {m.status && (
                  <span className={styles.flag} data-kind={m.status}>
                    {STATUS_LABEL[m.status]}
                  </span>
                )}
              </div>
            )}
            {m.quality && (
              <div className={styles.seal} data-tier={qualityTier(m.quality.value)} title={qualityTitle(m.quality)}>
                <b>{m.quality.value}</b>
                <span>Quality</span>
              </div>
            )}
          </div>
          <div className={styles.type}>{typeLine(m)}</div>
          <div className={styles.moves}>
            {moves.map((move) => (
              <div key={move.name} className={styles.move}>
                <span className={styles.ens}>
                  <Energies list={move.list} />
                </span>
                <span className={styles.moveName}>{move.name}</span>
                <span className={styles.movePrice}>
                  {move.value}
                  {move.unit ? <small>{move.unit}</small> : null}
                </span>
              </div>
            ))}
          </div>
          <p className={styles.flavor}>{m.description}</p>
          <div className={styles.foot}>
            <span className={`acc acc-${m.access}`}>{ACCESS_LABEL[m.access]}</span>
            <span className={styles.license}>{m.license.name}</span>
            <span className={styles.set}>
              <RarityIcon rarity={m.rarity} />
              {padSet(m.set)}/{setSize}
            </span>
          </div>
        </div>
        <div className={styles.holo} />
        <div className={styles.glare} />
      </div>
      {link && <Link className={styles.hit} href={modelHref(m)} aria-label={`${m.name} by ${lab.name}`} />}
      {addable && <AddButton model={m} color={lab.color} cardRef={ref} />}
    </article>
  );
}

export const Card = memo(CardImpl);

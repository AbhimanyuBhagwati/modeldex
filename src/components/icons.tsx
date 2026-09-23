import type { Modality, Rarity } from '@/lib/types';
import { MODALITY_LABEL, RARITY_LABEL } from '@/lib/format';

const STAR = 'M8 1.6l1.95 4.1 4.45.55-3.28 3.05.86 4.4L8 11.5l-3.98 2.2.86-4.4L1.6 6.25l4.45-.55z';

/** Rendered once in the root layout; everything else references symbols with <use>. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="e-text" viewBox="0 0 16 16"><path d="M4.5 4.5h7M8 4.5V12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="e-image" viewBox="0 0 16 16"><rect x="2.8" y="3.8" width="10.4" height="8.4" rx="1.4" fill="none" stroke="#fff" strokeWidth="1.5" /><path d="M4 11l2.6-2.8 1.8 1.8 1.4-1.3L12 11z" fill="#fff" /><circle cx="10.4" cy="6.4" r="1.1" fill="#fff" /></symbol>
        <symbol id="e-audio" viewBox="0 0 16 16"><path d="M4 7v2M6.7 5v6M9.3 3.5v9M12 6v4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /></symbol>
        <symbol id="e-video" viewBox="0 0 16 16"><path d="M6 4.3l5.6 3.7L6 11.7z" fill="#fff" /></symbol>
        <symbol id="e-pdf" viewBox="0 0 16 16"><path d="M5 2.8h4.2L12 5.6v7.6H5z" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /><path d="M6.8 8.2h3.4M6.8 10.4h3.4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></symbol>
        <symbol id="r-common" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.2" fill="currentColor" /></symbol>
        <symbol id="r-uncommon" viewBox="0 0 16 16"><path d="M8 2.6L13.4 8 8 13.4 2.6 8z" fill="currentColor" /></symbol>
        <symbol id="r-rare" viewBox="0 0 16 16"><path d={STAR} fill="currentColor" /></symbol>
        <symbol id="r-holo" viewBox="0 0 16 16"><path d={STAR} fill="currentColor" stroke="#8A5E00" strokeWidth=".7" strokeLinejoin="round" /></symbol>
        <symbol id="r-promo" viewBox="0 0 16 16"><path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></symbol>
        <symbol id="i-plus" viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
        <symbol id="i-check" viewBox="0 0 16 16"><path d="M3.5 8.4l2.9 2.9 6-6.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-x" viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
        <symbol id="i-search" viewBox="0 0 16 16"><circle cx="7.2" cy="7.2" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10.4 10.4l3.1 3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></symbol>
        <symbol id="i-out" viewBox="0 0 16 16"><path d="M6 3.5h6.5V10M12.2 3.8L4 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-chev" viewBox="0 0 16 16"><path d="M4.5 6.5L8 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-back" viewBox="0 0 16 16"><path d="M9.5 4L5.5 8l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-sliders" viewBox="0 0 16 16"><path d="M2.5 4.5h3.1M8.9 4.5h4.6M2.5 11.5h7.1M12.9 11.5h.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="7.25" cy="4.5" r="1.65" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="11.25" cy="11.5" r="1.65" fill="none" stroke="currentColor" strokeWidth="1.6" /></symbol>
        <symbol id="i-sort" viewBox="0 0 16 16"><path d="M5 12.5v-9M2.8 5.7L5 3.5l2.2 2.2M11 3.5v9M8.8 10.3l2.2 2.2 2.2-2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
        <symbol id="i-heart" viewBox="0 0 16 16"><path d="M8 13.6S2.4 10.3 2.4 6.3a2.9 2.9 0 0 1 5.6-1.1 2.9 2.9 0 0 1 5.6 1.1c0 4-5.6 7.3-5.6 7.3z" fill="currentColor" /></symbol>
        <symbol id="i-rss" viewBox="0 0 16 16"><path d="M3.5 7.2a5.3 5.3 0 0 1 5.3 5.3M3.5 3.5a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="4.2" cy="11.8" r="1.3" fill="currentColor" /></symbol>
        <symbol id="i-link" viewBox="0 0 16 16"><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.6-.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></symbol>
      </defs>
    </svg>
  );
}

export type IconName = 'plus' | 'check' | 'x' | 'search' | 'out' | 'chev' | 'back' | 'link' | 'sliders' | 'sort' | 'heart' | 'rss';

export const Icon = ({ name, className }: { name: IconName; className?: string }) => (
  <svg className={className} aria-hidden="true" focusable="false">
    <use href={`#i-${name}`} />
  </svg>
);

export const RarityIcon = ({ rarity }: { rarity: Rarity }) => (
  <svg className={`rs rs-${rarity}`} role="img" aria-label={RARITY_LABEL[rarity]}>
    <use href={`#r-${rarity}`} />
  </svg>
);

export function Energies({ list }: { list: Modality[] }) {
  if (!list.length) return <span className="en en-none" aria-label="None">–</span>;
  return (
    <>
      {list.map((m) => (
        <span key={m} className={`en en-${m}`} title={MODALITY_LABEL[m]}>
          <svg aria-hidden="true">
            <use href={`#e-${m}`} />
          </svg>
          <span className="sr-only">{MODALITY_LABEL[m]}</span>
        </span>
      ))}
    </>
  );
}

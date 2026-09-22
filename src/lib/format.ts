import type { Access, Modality, Model, ModelType, Rarity, Status } from './types';

const trim = (x: string) => String(parseFloat(x));

export function formatTokens(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${trim((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

export const formatTokensLong = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('en-US')} tokens`);

/** Price per 1M tokens, for tables: $4.00, $0.098, Free. */
export function formatPrice(v: number | null): string {
  if (v == null) return '—';
  if (v === 0) return 'Free';
  if (v < 0.1) return `$${trim(v.toPrecision(2))}`;
  if (v >= 100) return `$${Math.round(v)}`;
  return `$${v.toFixed(2)}`;
}

/** Compact price for cards: $4, $2.50, $0.15. */
export function formatPriceShort(v: number | null): string {
  if (v == null) return '—';
  if (v === 0) return 'Free';
  if (v < 0.1) return `$${trim(v.toPrecision(2))}`;
  return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(`${s.length === 7 ? `${s}-01` : s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(s: string | null): string {
  const d = toDate(s);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export function formatMonth(s: string | null): string {
  const d = toDate(s);
  return d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export const daysBetween = (from: string, to: string) => {
  const a = toDate(from), b = toDate(to);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 864e5) : Infinity;
};

/** "New" is measured against the data's own date, so server and browser always agree. */
export const isNew = (m: Pick<Model, 'releaseDate'>, refDate: string) => daysBetween(m.releaseDate, refDate.slice(0, 10)) <= 14;

export const padSet = (n: number) => String(n).padStart(3, '0');

export const MODALITY_LABEL: Record<Modality, string> = { text: 'Text', image: 'Image', audio: 'Audio', video: 'Video', pdf: 'PDF' };
export const ACCESS_LABEL: Record<Access, string> = { free: 'Free', open: 'Open weights', paid: 'Paid' };
export const RARITY_LABEL: Record<Rarity, string> = { promo: 'Promo', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', holo: 'Holo rare' };
export const RARITY_RANK: Record<Rarity, number> = { promo: 0, common: 1, uncommon: 2, rare: 3, holo: 4 };
export const STATUS_LABEL: Record<Status, string> = { preview: 'Preview', beta: 'Beta', deprecated: 'Retired' };
export const TYPE_LABEL: Record<ModelType, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  voice: 'Voice',
  transcription: 'Transcription',
  embedding: 'Embedding',
  rerank: 'Rerank',
  safety: 'Safety',
};
/** What the type means, for the legend and chip tooltips. */
export const TYPE_HINT: Record<ModelType, string> = {
  text: 'chat, reasoning, and code models',
  image: 'generate or edit images',
  video: 'generate video',
  audio: 'text to speech and music',
  voice: 'real-time spoken conversation',
  transcription: 'speech to text',
  embedding: 'turn text into vectors for search',
  rerank: 'reorder search results by relevance',
  safety: 'moderation and content filters',
};
/** Types where only the input side is billed, so a zero output price means "not applicable", not "free". */
export const INPUT_ONLY: ReadonlySet<ModelType> = new Set(['embedding', 'rerank', 'safety']);

export const modalityList = (list: Modality[]) => (list.length ? list.map((m) => MODALITY_LABEL[m]).join(', ') : '—');

/** The three-word type line on a card. */
export function typeLine(m: Pick<Model, 'type' | 'reasoning' | 'toolCall' | 'input' | 'output'>): string {
  if (m.type !== 'text') {
    const lead: Record<Exclude<ModelType, 'text'>, string> = {
      image: 'Image generation',
      video: 'Video generation',
      audio: 'Text to speech',
      voice: 'Real-time voice',
      transcription: 'Speech to text',
      embedding: 'Embedding',
      rerank: 'Rerank',
      safety: 'Safety',
    };
    return [lead[m.type], m.input.includes('image') && m.type !== 'image' ? 'Vision' : null].filter(Boolean).join(' · ');
  }
  const parts: string[] = [];
  if (m.reasoning) parts.push('Reasoning');
  if (m.input.includes('image')) parts.push('Vision');
  if (m.toolCall) parts.push('Tools');
  if (m.input.includes('audio')) parts.push('Audio');
  if (m.output.includes('image')) parts.push('Image out');
  if (m.output.includes('audio')) parts.push('Voice');
  if (m.output.includes('video')) parts.push('Video out');
  return (parts.length ? parts.slice(0, 3) : ['Text']).join(' · ');
}

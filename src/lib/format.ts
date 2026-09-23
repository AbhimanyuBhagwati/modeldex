import type { Access, Modality, Model, ModelType, Rarity, Status } from './types';

const trim = (x: string) => String(parseFloat(x));

export function formatTokens(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${trim((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

export const formatTokensLong = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('en-US')} tokens`);

/** 6.1M, 250K, 1.2B: one decimal below ten, none above. */
function compact(n: number, units: [number, string][]): string {
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size;
      return `${v < 10 ? trim(v.toFixed(1)) : Math.round(v)}${unit}`;
    }
  }
  return String(Math.round(n));
}

/** Parameter count: 8B, 1.5B, 596M. */
export const formatParams = (n: number | null | undefined) => (n == null ? '—' : compact(n, [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]));

/** Download and like counts: 6.1M, 250K. */
export const formatCount = (n: number | null | undefined) => (n == null ? '—' : compact(n, [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]));

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
  '3d': '3D',
  vision: 'Vision',
  encoder: 'Encoder',
  forecast: 'Forecasting',
};
/** What the type means, for the legend and chip tooltips. */
export const TYPE_HINT: Record<ModelType, string> = {
  text: 'chat, reasoning, and code models',
  image: 'generate or edit images',
  video: 'generate video',
  audio: 'text to speech and music',
  voice: 'real-time spoken conversation',
  transcription: 'speech to text',
  embedding: 'turn text or images into vectors for search',
  rerank: 'reorder search results by relevance',
  safety: 'moderation and content filters',
  '3d': 'turn images or text into 3D objects',
  vision: 'classify, detect, and segment what’s in images',
  encoder: 'BERT-style models for classifying and tagging',
  forecast: 'predict what comes next in a time series',
};
/** Types where only the input side is billed, so a zero output price means "not applicable", not "free". */
export const INPUT_ONLY: ReadonlySet<ModelType> = new Set(['embedding', 'rerank', 'safety']);

export const modalityList = (list: Modality[]) => (list.length ? list.map((m) => MODALITY_LABEL[m]).join(', ') : '—');

export interface CardMove {
  name: string;
  list: Modality[];
  value: string;
  unit: string;
}

/**
 * The card's corner stat and its two moves. Models you call show context and price;
 * open models without a price show size and Hugging Face downloads instead.
 */
export function cardFace(m: Pick<Model, 'type' | 'context' | 'price' | 'input' | 'output' | 'hub'>): {
  /** Null for open models that publish neither a context window nor a parameter count: better blank than a dash. */
  corner: { label: string; value: string; title: string } | null;
  moves: [CardMove, CardMove];
} {
  const hub = m.price == null ? m.hub : null;
  const corner =
    m.context != null || !hub
      ? { label: 'CTX', value: formatTokens(m.context), title: 'Context window' }
      : hub.params
        ? { label: 'SIZE', value: formatParams(hub.params), title: 'Parameters' }
        : null;
  if (hub) {
    return {
      corner,
      moves: [
        { name: 'Downloads', list: m.input, value: formatCount(hub.downloads), unit: '/mo' },
        { name: 'Likes', list: m.output, value: formatCount(hub.likes), unit: '' },
      ],
    };
  }
  const input = m.price?.input ?? null;
  const output = INPUT_ONLY.has(m.type) && !m.price?.output ? null : (m.price?.output ?? null);
  return {
    corner,
    moves: [
      { name: 'Input', list: m.input, value: formatPriceShort(input), unit: input ? '/M' : '' },
      { name: 'Output', list: m.output, value: formatPriceShort(output), unit: output ? '/M' : '' },
    ],
  };
}

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
      '3d': '3D generation',
      vision: 'Computer vision',
      encoder: 'Encoder',
      forecast: 'Forecasting',
    };
    const sees = m.input.includes('image') && m.type !== 'image' && m.type !== 'vision' && m.type !== '3d';
    return [lead[m.type], sees ? 'Vision' : null].filter(Boolean).join(' · ');
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

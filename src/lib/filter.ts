import { RARITY_RANK } from './format';
import { MODEL_TYPES, type Access, type Model, type ModelType } from './types';

export const CAPS = ['reasoning', 'vision', 'tools'] as const;
export type Cap = (typeof CAPS)[number];
export const SORTS = ['newest', 'rarest', 'cheapest', 'context', 'set'] as const;
export type SortKey = (typeof SORTS)[number];

export interface Filters {
  q: string;
  type: 'all' | ModelType;
  lab: string;
  access: 'all' | Access;
  caps: Cap[];
  sort: SortKey;
  retired: boolean;
}

export const DEFAULT_FILTERS: Filters = { q: '', type: 'all', lab: 'all', access: 'all', caps: [], sort: 'newest', retired: false };

const HAS: Record<Cap, (m: Model) => boolean> = {
  reasoning: (m) => m.reasoning,
  vision: (m) => m.input.includes('image'),
  tools: (m) => m.toolCall,
};

const big = (v: number | null | undefined) => v ?? Number.POSITIVE_INFINITY;

const COMPARE: Record<SortKey, (a: Model, b: Model) => number> = {
  newest: (a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.set - a.set,
  set: (a, b) => a.set - b.set,
  cheapest: (a, b) => big(a.price?.output) - big(b.price?.output) || big(a.price?.input) - big(b.price?.input) || a.set - b.set,
  context: (a, b) => (b.context ?? 0) - (a.context ?? 0) || b.releaseDate.localeCompare(a.releaseDate),
  rarest: (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (b.price?.output ?? 0) - (a.price?.output ?? 0) || b.set - a.set,
};

export function applyFilters(models: Model[], f: Filters, labNames: Record<string, string>): Model[] {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return models
    .filter((m) => {
      if (!f.retired && m.status === 'deprecated') return false;
      if (f.type !== 'all' && m.type !== f.type) return false;
      if (f.lab !== 'all' && m.lab !== f.lab) return false;
      if (f.access !== 'all' && m.access !== f.access) return false;
      if (!f.caps.every((c) => HAS[c](m))) return false;
      if (terms.length) {
        const hay = `${m.name} ${m.id} ${labNames[m.lab] ?? ''} ${m.family ?? ''}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    })
    .sort(COMPARE[f.sort]);
}

export const isFiltered = (f: Filters) =>
  f.q.trim() !== '' || f.type !== 'all' || f.lab !== 'all' || f.access !== 'all' || f.caps.length > 0 || f.retired;

const ACCESS_VALUES = ['all', 'free', 'open', 'paid'] as const;

export function filtersFromParams(p: URLSearchParams, labs: string[]): Filters {
  const access = p.get('access');
  const sort = p.get('sort');
  const lab = p.get('lab');
  const type = p.get('type');
  return {
    q: (p.get('q') ?? '').slice(0, 80),
    type: MODEL_TYPES.includes(type as ModelType) ? (type as ModelType) : 'all',
    lab: lab && labs.includes(lab) ? lab : 'all',
    access: ACCESS_VALUES.includes(access as never) ? (access as Filters['access']) : 'all',
    caps: (p.get('caps') ?? '').split(',').filter((c): c is Cap => CAPS.includes(c as Cap)),
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : 'newest',
    retired: p.get('retired') === '1',
  };
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  // Untrimmed, because the search box reads straight from the URL and must keep a typed space.
  if (f.q) p.set('q', f.q);
  if (f.type !== 'all') p.set('type', f.type);
  if (f.lab !== 'all') p.set('lab', f.lab);
  if (f.access !== 'all') p.set('access', f.access);
  if (f.caps.length) p.set('caps', f.caps.join(','));
  if (f.sort !== 'newest') p.set('sort', f.sort);
  if (f.retired) p.set('retired', '1');
  return p;
}

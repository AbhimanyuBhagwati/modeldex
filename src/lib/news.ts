import { daysBetween, formatPrice } from './format';
import type { ChangeEvent, ChangeKind, Model } from './types';

export type NewsKind = 'released' | ChangeKind;

export interface NewsItem {
  /** YYYY-MM-DD */
  date: string;
  kind: NewsKind;
  key: string;
  name: string;
  lab: string;
  before?: ChangeEvent['before'];
  after?: ChangeEvent['after'];
}

const ORDER: Record<NewsKind, number> = { released: 0, added: 1, price: 2, retired: 3, removed: 4 };

/**
 * What happened within `days` of `ref`: cards released in the window, plus what the daily sync logged.
 * A card that was released and added in the same window is listed once, as released.
 */
export function newsItems(models: Model[], events: ChangeEvent[], ref: string, days: number): NewsItem[] {
  const inWindow = (date: string) => {
    const age = daysBetween(date, ref.slice(0, 10));
    return age >= 0 && age < days;
  };
  const released: NewsItem[] = models
    .filter((m) => inWindow(m.releaseDate))
    .map((m) => ({ date: m.releaseDate, kind: 'released', key: m.key, name: m.name, lab: m.lab }));
  const seen = new Set(released.map((r) => r.key));
  const logged: NewsItem[] = events
    .filter((e) => inWindow(e.date) && !(e.kind === 'added' && seen.has(e.key)))
    .map((e) => ({ date: e.date, kind: e.kind, key: e.key, name: e.name, lab: e.lab, before: e.before, after: e.after }));
  return [...released, ...logged].sort((a, b) => b.date.localeCompare(a.date) || ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name, 'en'));
}

/** "−35%" or "+12%": how much the billed price moved. Uses output price, or input for input-only models. */
export function priceMove(item: Pick<NewsItem, 'before' | 'after'>): { from: string; to: string; change: number | null; side: 'input' | 'output' } {
  const side = item.before?.output != null || item.after?.output != null ? 'output' : 'input';
  const a = item.before?.[side] ?? null;
  const b = item.after?.[side] ?? null;
  return { from: formatPrice(a), to: formatPrice(b), change: a && b != null ? Math.round(((b - a) / a) * 100) : null, side };
}

import { describe, expect, it } from 'vitest';
import { newsItems, priceMove } from './news';
import type { ChangeEvent, Model } from './types';

const model = (key: string, releaseDate: string) => ({ key, name: key.split('/')[1], lab: key.split('/')[0], releaseDate }) as Model;

describe('newsItems', () => {
  const models = [model('a/new', '2026-09-20'), model('a/old', '2026-01-01'), model('b/fresh', '2026-09-23')];
  const events: ChangeEvent[] = [
    { date: '2026-09-21', kind: 'added', key: 'a/new', name: 'new', lab: 'a' },
    { date: '2026-09-22', kind: 'added', key: 'a/old', name: 'old', lab: 'a' },
    { date: '2026-09-22', kind: 'price', key: 'a/old', name: 'old', lab: 'a', before: { input: 1, output: 4 }, after: { input: 1, output: 2 } },
    { date: '2026-09-01', kind: 'retired', key: 'c/gone', name: 'gone', lab: 'c' },
  ];

  it('lists releases and logged changes in the window, newest first, each card once', () => {
    const items = newsItems(models, events, '2026-09-23T06:17:00.000Z', 7);
    expect(items.map((i) => `${i.date} ${i.kind} ${i.key}`)).toEqual([
      '2026-09-23 released b/fresh',
      '2026-09-22 added a/old',
      '2026-09-22 price a/old',
      '2026-09-20 released a/new',
    ]);
  });

  it('reaches back further when asked', () => {
    expect(newsItems(models, events, '2026-09-23', 30).some((i) => i.kind === 'retired')).toBe(true);
  });
});

describe('priceMove', () => {
  it('reports the output price change as a percentage', () => {
    expect(priceMove({ before: { input: 1, output: 4 }, after: { input: 1, output: 3 } })).toEqual({ from: '$4.00', to: '$3.00', change: -25, side: 'output' });
  });
  it('falls back to input price for input-only models and handles a new price', () => {
    expect(priceMove({ before: { input: null, output: null }, after: { input: 0.02, output: null } })).toMatchObject({ from: '—', change: null, side: 'input' });
  });
});

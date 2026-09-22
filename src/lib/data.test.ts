import { describe, expect, it } from 'vitest';
import raw from '../../data/models.json';
import { LABS } from '@/config/labs';
import { applyFilters, DEFAULT_FILTERS, filtersFromParams, filtersToParams } from './filter';
import { datasetSchema } from './pipeline/schema';
import type { Dataset } from './types';

/** Guards the committed data file, which the site trusts without re-checking. */
describe('committed dataset', () => {
  const parsed = datasetSchema.safeParse(raw);

  it('matches the schema', () => {
    expect(parsed.error?.issues.slice(0, 5) ?? []).toEqual([]);
  });

  it('has a realistic number of models and only configured labs', () => {
    const d = raw as unknown as Dataset;
    expect(d.models.length).toBeGreaterThanOrEqual(100);
    const configured = new Set(LABS.map((l) => l.key));
    expect(d.labs.every((l) => configured.has(l.key))).toBe(true);
  });

  it('filters and sorts the real data', () => {
    const d = raw as unknown as Dataset;
    const names = Object.fromEntries(d.labs.map((l) => [l.key, l.name]));
    const all = applyFilters(d.models, DEFAULT_FILTERS, names);
    expect(all.every((m) => m.status !== 'deprecated')).toBe(true);
    expect(all[0].releaseDate >= all[all.length - 1].releaseDate).toBe(true);
    const open = applyFilters(d.models, { ...DEFAULT_FILTERS, access: 'open' }, names);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((m) => m.access === 'open')).toBe(true);
  });
});

describe('filter URLs', () => {
  it('round-trips through the query string and ignores junk', () => {
    const f = { ...DEFAULT_FILTERS, q: 'opus', lab: 'anthropic', access: 'paid' as const, caps: ['vision' as const], sort: 'cheapest' as const, retired: true };
    const p = filtersToParams(f);
    expect(filtersFromParams(p, ['anthropic'])).toEqual(f);
    expect(filtersFromParams(new URLSearchParams('lab=nope&access=x&sort=y&caps=vision,zzz'), ['anthropic'])).toEqual({ ...DEFAULT_FILTERS, caps: ['vision'] });
  });
});

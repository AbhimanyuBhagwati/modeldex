import { describe, expect, it } from 'vitest';
import changes from '../../data/changes.json';
import raw from '../../data/models.json';
import offers from '../../data/offers.json';
import newcomers from '../../data/newcomers.json';
import scores from '../../data/scores.json';
import { LABS } from '@/config/labs';
import { applyFilters, DEFAULT_FILTERS, filtersFromParams, filtersToParams } from './filter';
import { changeLogSchema, datasetSchema, newcomersFileSchema, offersFileSchema, scoresFileSchema } from './pipeline/schema';
import type { NewcomersFile } from './pipeline/radar';
import type { Dataset } from './types';

/** Guards the committed data file, which the site trusts without re-checking. */
describe('committed dataset', () => {
  const parsed = datasetSchema.safeParse(raw);

  it('matches the schema', () => {
    expect(parsed.error?.issues.slice(0, 5) ?? []).toEqual([]);
  });

  it('has a realistic number of models and only configured labs or radar newcomers', () => {
    const d = raw as unknown as Dataset;
    expect(d.models.length).toBeGreaterThanOrEqual(100);
    expect(newcomersFileSchema.safeParse(newcomers).error?.issues.slice(0, 5) ?? []).toEqual([]);
    const configured = new Set([...LABS.map((l) => l.key), ...(newcomers as unknown as NewcomersFile).labs.map((n) => n.key)]);
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

describe('committed offers and change log', () => {
  it('match their schemas', () => {
    expect(offersFileSchema.safeParse(offers).error?.issues.slice(0, 5) ?? []).toEqual([]);
    expect(changeLogSchema.safeParse(changes).error?.issues.slice(0, 5) ?? []).toEqual([]);
  });

  it('only list cards and providers that exist', () => {
    const keys = new Set((raw as unknown as Dataset).models.map((m) => m.key));
    const file = offers as unknown as { providers: Record<string, unknown>; models: Record<string, { offers: { provider: string }[] }> };
    for (const [key, entry] of Object.entries(file.models)) {
      expect(keys.has(key)).toBe(true);
      for (const o of entry.offers) expect(file.providers[o.provider]).toBeDefined();
    }
  });
});

describe('committed benchmark scores', () => {
  it('match their schema and only score cards that exist', () => {
    expect(scoresFileSchema.safeParse(scores).error?.issues.slice(0, 5) ?? []).toEqual([]);
    const keys = new Set((raw as unknown as Dataset).models.map((m) => m.key));
    const missing = Object.keys(scores.models).filter((k) => !keys.has(k));
    // The bot updates both files together; a card retired between syncs may linger for a day.
    expect(missing.length).toBeLessThan(10);
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

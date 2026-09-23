import { describe, expect, it } from 'vitest';
import type { EvolutionLine } from './evolution';
import { adopt, buildCreatures, layoutWorld, measuredSpeeds, moodOf, paceOf, petNews, sizeOf } from './terrarium';
import type { Model, OffersFile } from './types';

let set = 0;
function model(lab: string, slug: string, extra: Partial<Model> = {}): Model {
  return {
    key: `${lab}/${slug}`,
    id: slug,
    slug,
    lab,
    type: 'text',
    name: slug,
    description: '',
    family: null,
    releaseDate: '2025-01-01',
    lastUpdated: null,
    knowledge: null,
    context: 128_000,
    maxOutput: null,
    price: { input: 1, output: 4, cacheRead: null, cacheWrite: null },
    input: ['text'],
    output: ['text'],
    reasoning: false,
    toolCall: false,
    structuredOutput: false,
    attachment: false,
    openWeights: false,
    status: null,
    access: 'paid',
    rarity: 'common',
    set: ++set,
    license: { name: 'Proprietary', source: 'proprietary' },
    origin: 'models.dev',
    hub: null,
    ...extra,
  };
}

const today = '2026-09-23';
const models = [
  model('acme', 'one', { releaseDate: '2024-01-01' }),
  model('acme', 'two', { releaseDate: '2026-09-20', reasoning: true, input: ['text', 'image'], quality: { value: 95, basis: 'eci', rank: 3, of: 200 } }),
  model('acme', 'old', { status: 'deprecated', releaseDate: '2023-03-01' }),
  model('beta', 'caps', { type: 'embedding', context: null, hub: { repo: 'beta/caps', downloads: 1e6, likes: 1, params: 1e8, gated: false } }),
];
const lines: EvolutionLine[] = [
  {
    slug: 'acme',
    lab: 'acme',
    name: 'Acme',
    type: 'text',
    stages: [
      { version: '1', key: 'acme/one', variants: [], releaseDate: '2024-01-01' },
      { version: '2', key: 'acme/two', variants: [], releaseDate: '2026-09-20' },
    ],
  },
];
const creatures = buildCreatures(models, lines, { 'acme/one': { speed: 120 } }, today);
const get = (k: string) => creatures.find((c) => c.key === k)!;

describe('buildCreatures', () => {
  it('turns stats into a body', () => {
    expect(get('acme/two')).toMatchObject({ egg: true, reasoning: true, eyes: true, wit: 95 });
    expect(get('acme/old').fossil).toBe(true);
    expect(get('acme/one').speed).toBe(120);
    expect(get('acme/one').family).toMatchObject({ stage: 0, stages: 2, lead: 'acme/two' });
  });
  it('sizes by context, or by parameters for open models', () => {
    expect(sizeOf({ context: 4096, hub: null })).toBe(0);
    expect(sizeOf({ context: 2_000_000, hub: null })).toBe(1);
    expect(sizeOf({ context: null, hub: { repo: 'a/b', downloads: 0, likes: 0, params: 1e12, gated: false } })).toBe(1);
  });
  it('paces measured creatures by speed', () => {
    expect(paceOf(1000, 0.5)).toBeGreaterThan(paceOf(20, 0.5));
    expect(paceOf(null, 0)).toBeGreaterThan(paceOf(null, 1));
  });
});

describe('layoutWorld', () => {
  it('gives each lab its own land, biggest first, with every creature at home inside it', () => {
    const w = layoutWorld(creatures, [
      { key: 'acme', name: 'Acme', color: '#112233' },
      { key: 'beta', name: 'Beta', color: '#445566' },
    ]);
    expect(w.biomes.map((b) => b.lab)).toEqual(['acme', 'beta']);
    for (const c of creatures) {
      const b = w.biomes.find((x) => x.lab === c.lab)!;
      expect(w.home[c.key]).toBeGreaterThan(b.x0);
      expect(w.home[c.key]).toBeLessThan(b.x1);
    }
  });
});

describe('moods and pets', () => {
  it('have a real reason', () => {
    expect(moodOf(get('acme/old'), today).mood).toBe('fossil');
    expect(moodOf(get('acme/one'), today)).toMatchObject({ mood: 'elder', why: expect.stringContaining('two') });
  });
  it('report what changed since adoption', () => {
    const then = adopt({ ...get('acme/one'), wit: 60, price: 8 }, '2026-09-01');
    const news = petNews({ ...get('acme/one'), wit: 70, price: 4 }, then, []);
    expect(news.join(' ')).toMatch(/up from 60 to 70/);
    expect(news.join(' ')).toMatch(/50% cheaper/);
    expect(petNews(undefined, then, [])[0]).toMatch(/left the binder/);
  });
});

describe('measuredSpeeds', () => {
  it('keeps each card’s fastest timed host', () => {
    const offers = {
      version: 1,
      updatedAt: '',
      providers: {},
      models: {
        'acme/one': {
          offers: [],
          hf: [
            { provider: 'slow', name: 'Slow', url: 'https://huggingface.co/a', input: 1, output: 1, context: null, throughput: 20, latencyMs: 900, tools: false },
            { provider: 'fast', name: 'Fast', url: 'https://huggingface.co/a', input: 1, output: 1, context: null, throughput: 300, latencyMs: 200, tools: false },
          ],
        },
      },
    } as OffersFile;
    expect(measuredSpeeds(offers)['acme/one']).toMatchObject({ speed: 300, latencyMs: 200, name: 'Fast' });
  });
});

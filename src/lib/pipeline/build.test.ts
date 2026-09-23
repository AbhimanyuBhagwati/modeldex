import { describe, expect, it } from 'vitest';
import type { LabConfig } from '@/config/labs';
import { accessFor, buildDataset, rarityFor, slugify, typeOf } from './build';
import { datasetSchema } from './schema';

const LABS: LabConfig[] = [
  { key: 'acme', name: 'Acme', color: '#112233', art: 'orbit', providers: ['acme', 'acme-alt'], match: /^(acme|rocket)/i, skip: /^partner-/i, defaultLicense: 'MIT' },
  { key: 'globex', name: 'Globex', color: '#445566', art: 'orbit', providers: ['globex'], match: /^globex/i, defaultLicense: null },
];

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: `${id} model`,
  release_date: '2026-01-01',
  last_updated: '2026-01-01',
  modalities: { input: ['text', 'image'], output: ['text'] },
  limit: { context: 128000, output: 8000 },
  cost: { input: 1, output: 4 },
  open_weights: false,
  ...extra,
});

const raw = {
  acme: {
    name: 'Acme',
    doc: 'https://acme.test/docs',
    models: {
      a: model('acme-1'),
      b: model('acme-1-latest', { name: 'Acme 1 (latest)' }),
      c: model('globex-copy'),
      d: model('partner-acme-1'),
      e: model('acme-2-preview', { release_date: '2026-03-01' }),
      f: model('acme-old', { status: 'deprecated', release_date: '2024-05-01' }),
      g: { id: 'broken' },
      h: model(':::', { name: 'Acme Unaddressable' }),
      i: model('acme-org/acme-9', { name: 'Acme 9', release_date: '2026-02-01' }),
    },
  },
  'acme-alt': { name: 'Acme Alt', models: { a: model('rocket-7', { open_weights: true, cost: { input: 0, output: 0 } }) } },
  globex: { name: 'Globex', doc: 'https://globex.test', models: { a: model('globex-pro', { cost: { input: 5, output: 25 } }) } },
  reseller: { name: 'Reseller', models: { x: model('acme-1'), y: model('acme-1') } },
};

const build = () => buildDataset(raw, LABS, { sourceUrl: 'https://models.dev/api.json', updatedAt: '2026-09-22T00:00:00.000Z' });

describe('buildDataset', () => {
  it('keeps each lab’s own models and drops aliases, resold copies, and other labs’ models', () => {
    const keys = build().dataset.models.map((m) => m.key).sort();
    expect(keys).toEqual(['acme/acme-1', 'acme/acme-2-preview', 'acme/acme-9', 'acme/acme-old', 'acme/rocket-7', 'globex/globex-pro']);
  });

  it('keeps the api id but uses a URL-safe slug in the key', () => {
    const m = build().dataset.models.find((x) => x.id === 'acme-org/acme-9');
    expect(m).toMatchObject({ slug: 'acme-9', key: 'acme/acme-9' });
  });

  it('reads every provider a lab lists', () => {
    expect(build().dataset.models.find((m) => m.id === 'rocket-7')?.lab).toBe('acme');
  });

  it('marks previews and retired models', () => {
    const { models } = build().dataset;
    expect(models.find((m) => m.id === 'acme-2-preview')?.status).toBe('preview');
    expect(models.find((m) => m.id === 'acme-old')?.status).toBe('deprecated');
    expect(models.find((m) => m.id === 'acme-1')?.status).toBeNull();
  });

  it('numbers the set by release date with no gaps', () => {
    const { models } = build().dataset;
    expect(models.map((m) => [m.id, m.set])).toEqual([
      ['acme-old', 1],
      ['acme-1', 2],
      ['globex-pro', 3],
      ['rocket-7', 4],
      ['acme-org/acme-9', 5],
      ['acme-2-preview', 6],
    ]);
  });

  it('counts listings across every provider, including resellers', () => {
    expect(build().dataset.source).toEqual({ url: 'https://models.dev/api.json', providers: 4, listings: 13, hub: { orgs: 0, repos: 0 } });
  });

  it('reports skipped entries instead of failing', () => {
    const { issues } = build();
    expect(issues.some((i) => i.includes('acme/g'))).toBe(true);
    expect(issues.some((i) => i.includes(':::'))).toBe(true);
  });

  it('produces data that passes the published schema', () => {
    expect(datasetSchema.safeParse(build().dataset).success).toBe(true);
  });

  it('takes docs links from the first provider and skips non-https ones', () => {
    const labs = build().dataset.labs;
    expect(labs.find((l) => l.key === 'acme')?.docUrl).toBe('https://acme.test/docs');
  });

  it('keeps the newer entry when a lab lists the same model twice', () => {
    const dupes = {
      acme: { name: 'Acme', models: { a: model('acme-x', { name: 'Acme X', release_date: '2025-01-01' }), b: model('acme-x-2', { name: 'Acme X', release_date: '2025-06-01' }) } },
    };
    const { dataset } = buildDataset(dupes, LABS, { sourceUrl: 'https://models.dev/api.json', updatedAt: '2026-09-22T00:00:00.000Z' });
    expect(dataset.models.map((m) => m.id)).toEqual(['acme-x-2']);
  });

  it('keeps a plus model apart from its base model', () => {
    const pair = { acme: { name: 'Acme', models: { a: model('acme-r', { name: 'Acme R' }), b: model('acme-r-plus', { name: 'Acme R+' }) } } };
    const { dataset } = buildDataset(pair, LABS, { sourceUrl: 'https://models.dev/api.json', updatedAt: '2026-09-22T00:00:00.000Z' });
    expect(dataset.models.map((m) => m.id).sort()).toEqual(['acme-r', 'acme-r-plus']);
  });

  it('breaks full ties the same way whatever order the feed lists them in', () => {
    const a = model('acme-y', { name: 'Acme Y' });
    const b = model('acme-y-20260101', { name: 'Acme Y' });
    const pick = (models: Record<string, unknown>) =>
      buildDataset({ acme: { name: 'Acme', models } }, LABS, { sourceUrl: 'https://models.dev/api.json', updatedAt: '2026-09-22T00:00:00.000Z' }).dataset.models.map((m) => m.id);
    expect(pick({ a, b })).toEqual(['acme-y']);
    expect(pick({ b, a })).toEqual(['acme-y']);
  });
});

describe('rarity and access', () => {
  const price = (output: number | null, input: number | null = 1) => ({ input, output, cacheRead: null, cacheWrite: null });

  it('tiers by output price', () => {
    expect(rarityFor(null)).toBe('promo');
    expect(rarityFor(price(null))).toBe('promo');
    expect(rarityFor(price(0))).toBe('common');
    expect(rarityFor(price(1.99))).toBe('common');
    expect(rarityFor(price(2))).toBe('uncommon');
    expect(rarityFor(price(8))).toBe('rare');
    expect(rarityFor(price(20))).toBe('holo');
  });

  it('calls zero-cost models free, ahead of open weights', () => {
    expect(accessFor(price(0, 0), true)).toBe('free');
    expect(accessFor(price(1), true)).toBe('open');
    expect(accessFor(price(1), false)).toBe('paid');
    expect(accessFor(null, false)).toBe('paid');
  });
});

describe('typeOf', () => {
  const t = (id: string, input: string[], output: string[], name = id) => typeOf({ id, name }, input as never, output as never);
  it('reads embeddings, rerankers, and safety models from names', () => {
    expect(t('text-embedding-3-large', ['text'], ['text'])).toBe('embedding');
    expect(t('rerank-v3.5', ['text'], ['text'])).toBe('rerank');
    expect(t('llama-guard-4', ['text'], ['text'])).toBe('safety');
    expect(t('omni-moderation-latest', ['text', 'image'], ['text'])).toBe('safety');
  });
  it('reads media models from modalities', () => {
    expect(t('veo-3', ['text', 'image'], ['video'])).toBe('video');
    expect(t('gpt-image-2', ['text', 'image'], ['image'])).toBe('image');
    expect(t('nano-banana', ['text', 'image'], ['text', 'image'], 'Nano Banana')).toBe('image');
    expect(t('deep-research', ['text'], ['text', 'image'], 'Deep Research')).toBe('text');
    expect(t('gemini-tts', ['text'], ['audio'])).toBe('audio');
    expect(t('gpt-realtime', ['text', 'audio'], ['text', 'audio'])).toBe('voice');
    expect(t('whisper-1', ['audio'], ['text'])).toBe('transcription');
    expect(t('voxtral-small', ['text', 'audio'], ['text'])).toBe('text');
  });
});

describe('slugify', () => {
  it('keeps simple ids and turns dots, colons, and slashes into clean slugs', () => {
    expect(slugify('gpt-5-mini')).toBe('gpt-5-mini');
    expect(slugify('gpt-5.6')).toBe('gpt-5-6');
    expect(slugify('amazon.nova-pro-v1:0')).toBe('amazon-nova-pro-v1-0');
    expect(slugify('nvidia/nemotron-3-super')).toBe('nemotron-3-super');
  });
});

import { describe, expect, it } from 'vitest';
import type { LabConfig } from '@/config/labs';
import type { Dataset } from '@/lib/types';
import { buildDataset } from './build';
import { addHubModels, hubTask, matchRepo, mergeHub } from './hub';
import { datasetSchema, type RawHubRepo } from './schema';

const LABS: LabConfig[] = [
  { key: 'acme', name: 'Acme', color: '#112233', art: 'orbit', providers: ['acme'], match: /^acme/i, defaultLicense: 'MIT', hub: ['acme-ai'] },
  { key: 'vecco', name: 'Vecco', color: '#445566', art: 'orbit', providers: [], match: /(?!)/, defaultLicense: null, hub: ['vecco'] },
];

const devModel = (id: string, name: string) => ({
  id,
  name,
  release_date: '2026-01-01',
  modalities: { input: ['text'], output: ['text'] },
  limit: { context: 128000, output: 8000 },
  cost: { input: 1, output: 4 },
  open_weights: true,
});
const base = buildDataset({ acme: { name: 'Acme', doc: 'https://acme.test/docs', models: { a: devModel('acme-7b', 'Acme 7B') } } }, LABS, {
  sourceUrl: 'https://models.dev/api.json',
  updatedAt: '2026-09-22T00:00:00.000Z',
}).dataset;

const repo = (id: string, extra: Partial<RawHubRepo> = {}): RawHubRepo => ({
  id,
  downloads: 250_000,
  likes: 1234,
  pipeline_tag: 'text-generation',
  createdAt: '2025-05-01T10:00:00.000Z',
  lastModified: '2025-06-01T10:00:00.000Z',
  tags: ['license:apache-2.0'],
  safetensors: { total: 7_240_000_000 },
  ...extra,
});

const listings = (acme: RawHubRepo[] | null, vecco: RawHubRepo[] | null) =>
  new Map<string, RawHubRepo[] | null>([
    ['acme-ai', acme],
    ['vecco', vecco],
  ]);

describe('hubTask', () => {
  it('maps declared tasks onto the binder’s types', () => {
    expect(hubTask(repo('x/a', { pipeline_tag: 'sentence-similarity' }))?.type).toBe('embedding');
    expect(hubTask(repo('x/a', { pipeline_tag: 'image-text-to-text' }))).toMatchObject({ type: 'text', input: ['text', 'image'] });
    expect(hubTask(repo('x/a', { pipeline_tag: 'time-series-forecasting' }))?.type).toBe('forecast');
    expect(hubTask(repo('x/a', { pipeline_tag: 'robotics' }))).toBeNull();
  });
  it('reads well-known architectures from the name when no task is declared', () => {
    expect(hubTask(repo('x/flan-t5-base', { pipeline_tag: undefined }))?.type).toBe('text');
    expect(hubTask(repo('x/bert-base-uncased', { pipeline_tag: undefined }))?.type).toBe('encoder');
    expect(hubTask(repo('x/Mistral-7B', { pipeline_tag: undefined, library_name: 'vllm' }))?.type).toBe('text');
    expect(hubTask(repo('x/mystery', { pipeline_tag: undefined }))).toBeNull();
  });
  it('lets rerankers and guard models override the declared task', () => {
    expect(hubTask(repo('x/bge-reranker-v2-m3', { pipeline_tag: 'text-classification' }))?.type).toBe('rerank');
    expect(hubTask(repo('x/Prompt-Guard-86M', { pipeline_tag: 'text-classification' }))?.type).toBe('safety');
  });
});

describe('matchRepo', () => {
  it('finds a card’s repo, allowing an instruct suffix, and prefers the most downloaded', () => {
    const repos = [repo('acme-ai/Acme-7B-Instruct', { downloads: 10 }), repo('acme-ai/Acme-7B', { downloads: 500 }), repo('acme-ai/Acme-70B')];
    expect(matchRepo({ id: 'acme-7b', name: 'Acme 7B', slug: 'acme-7b' }, repos)?.id).toBe('acme-ai/Acme-7B');
    expect(matchRepo({ id: 'acme-70b', name: 'Acme 70B', slug: 'acme-70b' }, [repo('acme-ai/Acme-70B-Instruct')])?.id).toBe('acme-ai/Acme-70B-Instruct');
    expect(matchRepo({ id: 'acme-7', name: 'Acme 7', slug: 'acme-7' }, repos)).toBeUndefined();
  });
});

describe('mergeHub', () => {
  const run = (acme: RawHubRepo[] | null, vecco: RawHubRepo[] | null, previous?: Dataset) =>
    mergeHub(base, LABS, listings(acme, vecco), { previous, minDownloads: 100_000 });

  it('gives a models.dev card its repo’s stats instead of a second card', () => {
    const { dataset } = run([repo('acme-ai/Acme-7B', { downloads: 6_107_231 })], []);
    expect(dataset.models).toHaveLength(1);
    expect(dataset.models[0]).toMatchObject({ key: 'acme/acme-7b', origin: 'models.dev', hub: { repo: 'acme-ai/Acme-7B', downloads: 6_100_000, params: 7_240_000_000 } });
  });

  it('adds popular repos as cards, under the lab that owns the org', () => {
    const { dataset, stats } = run([], [repo('vecco/Vec-Embed-v2', { pipeline_tag: 'feature-extraction', downloads: 2_000_000 }), repo('vecco/Vec-Small', { downloads: 5_000 })]);
    // Set order is release order, and the repo is older than the models.dev card.
    expect(dataset.models.map((m) => m.key)).toEqual(['vecco/vec-embed-v2', 'acme/acme-7b']);
    const card = dataset.models[0];
    expect(card).toMatchObject({ type: 'embedding', origin: 'huggingface', access: 'open', rarity: 'promo', price: null, releaseDate: '2025-05-01' });
    expect(card.license).toEqual({ name: 'Apache 2.0', source: 'huggingface', url: 'https://huggingface.co/vecco/Vec-Embed-v2' });
    expect(card.description).toBe('Embedding model from Vecco, 7.2B parameters.');
    expect(dataset.labs.find((l) => l.key === 'vecco')).toMatchObject({ count: 1, docUrl: 'https://huggingface.co/vecco' });
    expect(stats).toMatchObject({ orgs: 2, repos: 2, cards: 1, matched: 0 });
  });

  it('skips quantized copies, adapters, and a second file layout of the same weights', () => {
    const { dataset } = run(
      [],
      [
        repo('vecco/Vec-9B', { downloads: 900_000 }),
        repo('vecco/Vec-9B-hf', { downloads: 300_000 }),
        repo('vecco/Vec-9B-GGUF', { downloads: 800_000 }),
        repo('vecco/Vec-9B-FP8', { downloads: 700_000 }),
        repo('vecco/Vec-9B-lora', { downloads: 700_000, tags: ['lora'] }),
      ],
    );
    expect(dataset.models.filter((m) => m.lab === 'vecco').map((m) => m.id)).toEqual(['vecco/Vec-9B']);
  });

  it('keeps a card once it’s in, even after downloads drop below the cutoff', () => {
    const first = run([], [repo('vecco/Vec-1', { downloads: 200_000 })]).dataset;
    const next = run([], [repo('vecco/Vec-1', { downloads: 40_000 })], first).dataset;
    expect(next.models.find((m) => m.id === 'vecco/Vec-1')?.hub?.downloads).toBe(40_000);
    expect(run([], [], first).dataset.models.some((m) => m.id === 'vecco/Vec-1')).toBe(false);
  });

  it('carries cards and stats over from the last sync when an org can’t be fetched', () => {
    const first = run([repo('acme-ai/Acme-7B')], [repo('vecco/Vec-1')]).dataset;
    const { dataset, stats } = run(null, null, first);
    expect(dataset.models.map((m) => [m.key, m.hub?.repo])).toEqual([
      ['vecco/vec-1', 'vecco/Vec-1'],
      ['acme/acme-7b', 'acme-ai/Acme-7B'],
    ]);
    expect(stats.failedOrgs).toEqual(['acme-ai', 'vecco']);
  });

  it('never makes a card whose key clashes with a models.dev card, even by case', () => {
    const { dataset } = run([repo('acme-ai/ACME-7B-Turbo'), repo('acme-ai/acme-7B', { pipeline_tag: 'fill-mask', downloads: 1 })], []);
    expect(dataset.models.map((m) => m.key).sort()).toEqual(['acme/acme-7b', 'acme/acme-7b-turbo']);
  });

  it('produces data that passes the published schema', () => {
    const { dataset } = run([repo('acme-ai/Acme-7B'), repo('acme-ai/Acme-Rerank', { pipeline_tag: 'text-ranking' })], [repo('vecco/Vec-1', { gated: 'manual' })]);
    expect(datasetSchema.safeParse(dataset).success).toBe(true);
    expect(dataset.models.map((m) => m.set)).toEqual([1, 2, 3]);
  });
});

describe('addHubModels', () => {
  it('reads custom license names from the model card, keeping yesterday’s if the lookup fails', async () => {
    let cardUp = true;
    const fetchJson = async (url: string) => {
      if (url.includes('author=vecco')) return [repo('vecco/Vec-1', { tags: ['license:other'] })];
      if (url.includes('author=')) return [];
      if (!cardUp) throw new Error('503');
      return { cardData: { license_name: 'vecco-community' } };
    };
    const first = await addHubModels(base, LABS, { fetchJson, minDownloads: 100_000 });
    expect(first.dataset.models.find((m) => m.id === 'vecco/Vec-1')?.license.name).toBe('Vecco Community license');

    cardUp = false;
    const second = await addHubModels(base, LABS, { fetchJson, minDownloads: 100_000, previous: first.dataset });
    expect(second.dataset.models.find((m) => m.id === 'vecco/Vec-1')?.license.name).toBe('Vecco Community license');
  });

  it('treats a failed listing as missing, not as an error', async () => {
    const fetchJson = async () => {
      throw new Error('429 Too Many Requests');
    };
    const { dataset, stats } = await addHubModels(base, LABS, { fetchJson });
    expect(dataset.models).toHaveLength(1);
    expect(stats.failedOrgs).toEqual(['acme-ai', 'vecco']);
  });
});

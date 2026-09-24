import { describe, expect, it } from 'vitest';
import type { LabConfig } from '@/config/labs';
import { buildDataset } from './build';
import { mergeHub } from './hub';
import { RADAR_NEW_LABS_PER_DAY, borrowed, clashingLab, newcomer, newcomerLab, radar } from './radar';
import { newcomersFileSchema, type RawHubRepo } from './schema';

const today = '2026-09-24';
const LABS: LabConfig[] = [
  { key: 'qwen', name: 'Qwen', color: '#615CED', art: 'lowpoly', providers: [], match: /(?!)/, defaultLicense: null, hub: ['Qwen'] },
  { key: 'meta', name: 'Meta', color: '#0668E1', art: 'network', providers: [], match: /(?!)/, defaultLicense: null, hub: ['meta-llama'] },
];

const repo = (id: string, likes: number, extra: Partial<RawHubRepo> = {}): RawHubRepo => ({
  id,
  likes,
  downloads: 0,
  pipeline_tag: 'text-generation',
  createdAt: '2026-09-18T00:00:00.000Z',
  tags: [],
  ...extra,
});

const trending = [
  repo('convaiinnovations/laya', 3272, { pipeline_tag: 'text-classification' }),
  repo('Qwen/Qwen-Image-2.1', 2126, { pipeline_tag: 'text-to-image' }),
  repo('Qwen/Qwen-Small-Thing', 150),
  repo('someone/Qwen-Image-2.1-Uncensored-GGUF', 1545, { tags: ['gguf', 'base_model:quantized:Qwen/Qwen-Image-2.1'] }),
  repo('fan/open-jev', 1200, { tags: ['base_model:finetune:google/gemma-4-12B-it'] }),
  repo('SparkLab/Spark-4B', 1318, { tags: ['base_model:finetune:SparkLab/Spark-4B-Base'] }),
  repo('oldlab/classic', 5000, { createdAt: '2025-01-01T00:00:00.000Z' }),
  repo('tinylab/new-thing', 400),
  repo('coder/some-repo', 2000, { pipeline_tag: undefined, library_name: undefined }),
];

describe('radar', () => {
  const r = radar(trending, LABS, [], today);

  it('lets in popular originals from labs we cover, before their downloads catch up', () => {
    expect(r.known.map((p) => p.repo.id)).toEqual(['Qwen/Qwen-Image-2.1']);
  });
  it('brings in new labs only for originals with a thousand likes or more', () => {
    expect(r.newLabs.map((n) => n.author)).toEqual(['convaiinnovations', 'SparkLab']);
  });
  it('skips copies, other people’s fine-tunes, old repos, and repos with no known task', () => {
    const all = [...r.known, ...r.newLabs.map((n) => n.pick)].map((p) => p.repo.id);
    for (const id of ['someone/Qwen-Image-2.1-Uncensored-GGUF', 'fan/open-jev', 'oldlab/classic', 'tinylab/new-thing', 'coder/some-repo']) expect(all).not.toContain(id);
  });
  it('treats a lab building on its own base as original', () => {
    expect(borrowed(repo('SparkLab/Spark-4B', 1, { tags: ['base_model:finetune:SparkLab/Spark-4B-Base'] }))).toBe(false);
    expect(borrowed(repo('fan/open-jev', 1, { tags: ['base_model:finetune:google/gemma'] }))).toBe(true);
  });
  it('caps new labs per morning', () => {
    const flood = Array.from({ length: 8 }, (_, i) => repo(`spam${i}/model`, 5000 - i));
    expect(radar(flood, LABS, [], today).newLabs).toHaveLength(RADAR_NEW_LABS_PER_DAY);
  });
  it('treats labs it already added as known', () => {
    const n = newcomer('convaiinnovations', 'Convai Innovations', 'convaiinnovations/laya', '2026-09-24', new Set());
    const again = radar([repo('convaiinnovations/laya-multilingual', 235, { pipeline_tag: 'text-classification' })], LABS, [n], today);
    expect(again.known.map((p) => p.lab)).toEqual(['convai-innovations']);
    expect(again.newLabs).toEqual([]);
  });
});

describe('newcomers', () => {
  it('get a key from their display name that never clashes', () => {
    const n = newcomer('convaiinnovations', 'Convai Innovations', 'convaiinnovations/laya', today, new Set(['convai-innovations']));
    expect(n).toMatchObject({ key: 'convai-innovations-2', name: 'Convai Innovations', author: 'convaiinnovations', since: today });
    expect(n.color).toMatch(/^#[0-9A-F]{6}$/);
    expect(newcomersFileSchema.safeParse({ version: 1, labs: [n] }).success).toBe(true);
  });
  it('are held back when they claim to be a lab we have', () => {
    expect(clashingLab('Meta Inc.', LABS)).toBe('Meta');
    expect(clashingLab('Qwen AI Official', LABS)).toBe('Qwen');
    expect(clashingLab('Convai Innovations', LABS)).toBeNull();
  });
  it('become cards through the Hugging Face intake, even with no downloads yet', () => {
    const n = newcomer('convaiinnovations', 'Convai Innovations', 'convaiinnovations/laya', today, new Set());
    const labs = [...LABS, newcomerLab(n)];
    const { dataset } = buildDataset({}, [], { sourceUrl: 'https://models.dev/api.json', updatedAt: `${today}T00:00:00.000Z` });
    const laya = trending[0];
    const listings = new Map<string, RawHubRepo[] | null>([
      ['Qwen', []],
      ['meta-llama', []],
      ['convaiinnovations', [laya]],
    ]);
    const merged = mergeHub(dataset, labs, listings, { boost: new Set([laya.id]) });
    expect(merged.dataset.models.map((m) => m.key)).toEqual(['convai-innovations/laya']);
    expect(merged.dataset.labs.map((l) => l.name)).toEqual(['Convai Innovations']);
    expect(mergeHub(dataset, labs, listings).dataset.models).toEqual([]);
  });
});

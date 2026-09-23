import { describe, expect, it } from 'vitest';
import raw from '../../data/models.json';
import { buildLines, parseName } from './evolution';
import type { Dataset, Model } from './types';

const data = raw as unknown as Dataset;
const p = (name: string) => {
  const r = parseName(name);
  return r && `${r.display} @ ${r.version}`;
};

describe('parseName', () => {
  it('splits a name into a series and a version', () => {
    expect(p('Claude Opus 4.5')).toBe('Claude Opus @ 4.5');
    expect(p('Qwen3-235B-A22B-Instruct-2507')).toBe('Qwen @ 3');
    expect(p('Meta-Llama-3-8B-Instruct')).toBe('Llama @ 3');
    expect(p('Llama-4-Scout-17B-16E-Instruct')).toBe('Llama @ 4');
    expect(p('GPT-4o mini')).toBe('GPT Mini @ 4o');
    expect(p('o3-mini')).toBe('o Mini @ 3');
    expect(p('Kimi-K2.5')).toBe('Kimi K @ 2.5');
    expect(p('dinov2-base')).toBe('DINO @ 2');
    expect(p('gemma-3n-E2B-it')).toBe('Gemma @ 3n');
  });
  it('treats sizes, dates, and vision suffixes as what they are', () => {
    expect(p('Command R7B')).toBe('Command R @ 1');
    // b0–b3 are sizes, and 512 is an image size, so SegFormer is no line at all.
    expect(p('segformer-b2-finetuned-ade-512-512')).toBeNull();
    expect(p('GLM-4.5V')).toBe('GLM V @ 4.5');
    expect(p('c4ai-command-r-v01')).toBe('Command R @ 1');
    expect(p('Gemini Embedding 001')).toBe('Gemini Embedding @ 1');
  });
  it('reads 4.20 as coming before 4.3', () => {
    expect(parseName('Grok 4.20')!.order[0]).toBeLessThan(parseName('Grok 4.3')!.order[0]);
  });
});

describe('buildLines', () => {
  const at = (lines: ReturnType<typeof buildLines>, lab: string, name: string) => lines.find((l) => l.lab === lab && l.name === name);
  const model = (key: string, name: string, releaseDate: string, over: Partial<Model> = {}) =>
    ({ key, name, lab: key.split('/')[0], type: 'text', releaseDate, rarity: 'common', price: null, hub: null, context: null, status: null, ...over }) as Model;

  it('orders stages by version and shows each by its strongest model', () => {
    const lines = buildLines([
      model('acme/x-2-small', 'X-2-7B', '2024-01-01', { hub: { repo: 'a/b', downloads: 9, likes: 0, params: 7e9, gated: false } }),
      model('acme/x-2-big', 'X-2-70B', '2024-01-02', { hub: { repo: 'a/c', downloads: 1, likes: 0, params: 70e9, gated: false } }),
      model('acme/x-3', 'X 3', '2025-01-01'),
      model('acme/x-2-5', 'X 2.5', '2024-06-01'),
      model('acme/solo', 'Solo 1', '2024-01-01'),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].stages.map((s) => [s.version, s.key, s.variants])).toEqual([
      ['2', 'acme/x-2-big', ['acme/x-2-small']],
      ['2.5', 'acme/x-2-5', []],
      ['3', 'acme/x-3', []],
    ]);
  });

  it('finds the famous lines in the real data', () => {
    const lines = buildLines(data.models);
    expect(at(lines, 'openai', 'GPT')!.stages.map((s) => s.version).slice(0, 5)).toEqual(['1', '2', '3.5', '4', '4o']);
    expect(at(lines, 'anthropic', 'Claude Opus')!.stages.length).toBeGreaterThanOrEqual(4);
    expect(at(lines, 'meta', 'Llama')!.stages.map((s) => s.version)).toContain('3.1');
    expect(at(lines, 'xai', 'Grok')!.stages[0].version).toBe('4.20');
  });

  it('gives every line a unique slug within its lab and at least two stages', () => {
    const lines = buildLines(data.models);
    const slugs = lines.map((l) => `${l.lab}/${l.slug}`);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(lines.every((l) => l.stages.length >= 2 && /^[a-z0-9-]+$/.test(l.slug))).toBe(true);
  });
});

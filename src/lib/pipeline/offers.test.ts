import { describe, expect, it } from 'vitest';
import type { LabConfig } from '@/config/labs';
import { buildDataset } from './build';
import { buildHostOffers, buildOffers, idCore, joinOffers, nameCore } from './offers';
import { offersFileSchema } from './schema';

const LABS: LabConfig[] = [{ key: 'acme', name: 'Acme', color: '#112233', art: 'orbit', providers: ['acme'], match: /^acme/i, defaultLicense: 'MIT' }];
const listing = (id: string, name: string, input: number | undefined, output: number | undefined) => ({
  id,
  name,
  release_date: '2026-01-01',
  modalities: { input: ['text'], output: ['text'] },
  limit: { context: 200000, output: 8000 },
  cost: input == null ? undefined : { input, output },
});
const raw = {
  acme: { name: 'Acme', doc: 'https://acme.test/docs', models: { a: listing('acme-pro-2', 'Acme Pro 2', 3, 15), b: listing('acme-pro-2-mini', 'Acme Pro 2 Mini', 1, 4) } },
  bedrock: {
    name: 'Bedrock',
    doc: 'https://bedrock.test',
    models: { a: listing('acme.acme-pro-2-20260101-v1:0', 'Acme Pro 2', 3, 15), b: listing('us.acme.acme-pro-2-20260101-v1:0', 'Acme Pro 2 (US)', 3.3, 16.5) },
  },
  router: { name: 'Router', doc: 'http://not-https.test', models: { a: listing('acme/acme-pro-2', 'Acme: Acme Pro 2 (latest)', 2.5, 12), b: listing('fans/acme-pro-2-roleplay', 'Acme Pro 2 Roleplay', 0.5, 0.5) } },
  freebie: { name: 'Freebie', models: { a: listing('acme-pro-2', 'Acme Pro 2', 0, 0), b: listing('acme-pro-2-unpriced', 'acme pro 2', undefined, undefined) } },
};
const { dataset } = buildDataset(raw, LABS, { sourceUrl: 'https://models.dev/api.json', updatedAt: '2026-09-22T00:00:00.000Z' });

describe('cores', () => {
  it('reduce resellers’ names and ids to the same model', () => {
    expect(nameCore('Claude Opus 4.1 (latest)')).toBe('claudeopus41');
    expect(nameCore('Anthropic: Claude Opus 4.1')).toBe('claudeopus41');
    expect(idCore('us.anthropic.claude-opus-4-1-20250805-v1:0')).toBe('claudeopus41');
    expect(idCore('claude-opus-4-1@20250805')).toBe('claudeopus41');
    expect(idCore('meta/llama-3.3-70b-instruct-maas')).toBe('llama3370binstruct');
  });
  it('keep dotted versions intact', () => {
    expect(idCore('gpt-4.1')).toBe('gpt41');
  });
});

describe('buildOffers', () => {
  const { offers, providers } = buildOffers(raw, dataset, LABS);
  const pro = offers['acme/acme-pro-2'];

  it('finds every provider selling a card, one offer each, cheapest first', () => {
    expect(pro.map((o) => [o.provider, o.model, o.output])).toEqual([
      ['freebie', 'acme-pro-2', 0],
      ['router', 'acme/acme-pro-2', 12],
      ['acme', 'acme-pro-2', 15],
      ['bedrock', 'acme.acme-pro-2-20260101-v1:0', 15],
    ]);
  });
  it('marks the lab’s own listing and leaves fine-tunes and other sizes out', () => {
    expect(pro.filter((o) => o.official).map((o) => o.provider)).toEqual(['acme']);
    expect(pro.some((o) => o.model.includes('roleplay') || o.model.includes('mini'))).toBe(false);
    expect(offers['acme/acme-pro-2-mini'].map((o) => o.provider)).toEqual(['acme']);
  });
  it('keeps provider names once, with https docs only', () => {
    expect(providers.bedrock).toEqual({ name: 'Bedrock', url: 'https://bedrock.test' });
    expect(providers.router.url).toBeNull();
  });
});

describe('buildHostOffers and joinOffers', () => {
  const withRepo = { ...dataset, models: dataset.models.map((m) => (m.key === 'acme/acme-pro-2' ? { ...m, hub: { repo: 'acme/Acme-Pro-2', downloads: 1, likes: 1, params: null, gated: false } } : m)) };
  const router = {
    data: [
      {
        id: 'acme/Acme-Pro-2',
        providers: [
          { provider: 'novita', status: 'live', pricing: { input: 0.2, output: 0.8 }, context_length: 131072, throughput: 88.4, first_token_latency_ms: 512.2, supports_tools: true },
          { provider: 'fireworks-ai', status: 'live', pricing: { input: 0.1, output: 0.5 } },
          { provider: 'retired-host', status: 'error', pricing: { input: 0.01, output: 0.01 } },
        ],
      },
    ],
  };
  const hosts = buildHostOffers(router, withRepo);

  it('lists live Hugging Face hosts for cards with a repo, cheapest first', () => {
    expect(hosts['acme/acme-pro-2'].map((h) => [h.name, h.output, h.throughput])).toEqual([
      ['Fireworks', 0.5, null],
      ['Novita', 0.8, 88],
    ]);
    expect(hosts['acme/acme-pro-2'][1].url).toBe('https://huggingface.co/acme/Acme-Pro-2?inference_provider=novita');
  });

  it('joins both sources into a file that passes its schema', () => {
    const file = joinOffers(buildOffers(raw, dataset, LABS), hosts, '2026-09-22T00:00:00.000Z');
    expect(offersFileSchema.safeParse(file).success).toBe(true);
    expect(file.models['acme/acme-pro-2'].hf).toHaveLength(2);
  });

  it('refuses a router response that isn’t a model list', () => {
    expect(() => buildHostOffers({ error: 'rate limited' }, withRepo)).toThrow();
  });
});

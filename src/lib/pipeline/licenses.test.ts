import { describe, expect, it } from 'vitest';
import type { LabConfig } from '@/config/labs';
import type { Dataset, Model } from '@/lib/types';
import { findRepo, licenseTag, prettyLicense, resolveLicenses } from './licenses';

describe('prettyLicense', () => {
  it('names common licenses', () => {
    expect(prettyLicense('mit')).toBe('MIT');
    expect(prettyLicense('apache-2.0')).toBe('Apache 2.0');
    expect(prettyLicense('cc-by-nc-4.0')).toBe('CC BY-NC 4.0');
    expect(prettyLicense('llama4')).toBe('Llama 4 license');
  });
  it('turns custom license slugs into readable names', () => {
    expect(prettyLicense('minimax-community')).toBe('MiniMax Community license');
    expect(prettyLicense('glm-5.3')).toBe('GLM 5.3 license');
    expect(prettyLicense('tongyi-qianwen-license')).toBe('Tongyi Qianwen license');
  });
});

describe('licenseTag', () => {
  it('reads the license tag', () => {
    expect(licenseTag(['transformers', 'license:apache-2.0', 'region:us'])).toBe('apache-2.0');
    expect(licenseTag(['transformers'])).toBeNull();
    expect(licenseTag(undefined)).toBeNull();
  });
});

describe('findRepo', () => {
  const repos = [
    { id: 'acme/Acme-7B', license: 'mit' },
    { id: 'acme/Acme-7B-Instruct', license: 'mit' },
    { id: 'acme/Acme-70B-Instruct', license: 'apache-2.0' },
    { id: 'acme/Acme-70B-Instruct-FP8', license: 'apache-2.0' },
  ];
  it('prefers an exact match', () => {
    expect(findRepo({ id: 'acme-7b', name: 'Acme 7B' }, repos)?.id).toBe('acme/Acme-7B');
  });
  it('accepts an instruct suffix', () => {
    expect(findRepo({ id: 'acme-70b', name: 'Acme 70B' }, repos)?.id).toBe('acme/Acme-70B-Instruct');
  });
  it('does not guess at loose matches', () => {
    expect(findRepo({ id: 'acme-7', name: 'Acme 7' }, repos)).toBeUndefined();
  });
});

describe('resolveLicenses', () => {
  const lab: LabConfig = { key: 'acme', name: 'Acme', color: '#112233', art: 'orbit', providers: ['acme'], match: /^acme/, defaultLicense: 'MIT', huggingFace: [{ org: 'acme' }] };
  const base = (id: string, openWeights: boolean): Model => ({
    key: `acme/${id}`, id, slug: id, lab: 'acme', type: 'text', name: id, description: '', family: null, releaseDate: '2026-01-01', lastUpdated: null, knowledge: null,
    context: 1000, maxOutput: 100, price: null, input: ['text'], output: ['text'], reasoning: false, toolCall: false, structuredOutput: false,
    attachment: false, openWeights, status: null, access: openWeights ? 'open' : 'paid', rarity: 'promo', set: 1,
    license: openWeights ? { name: 'MIT', source: 'lab-default' } : { name: 'Proprietary', source: 'proprietary' },
  });
  const dataset = (models: Model[]): Dataset => ({
    version: 1, updatedAt: '2026-09-22T00:00:00.000Z', source: { url: 'https://models.dev/api.json', providers: 1, listings: 1 },
    labs: [{ key: 'acme', name: 'Acme', color: '#112233', docUrl: null, count: models.length }], models,
  });

  it('uses Hugging Face when a repo matches and the lab default otherwise', async () => {
    const fetchJson = async (url: string) => {
      if (url.includes('/api/models?')) return [{ id: 'acme/acme-open', tags: ['license:apache-2.0'] }, { id: 'acme/acme-custom', tags: ['license:other'] }];
      if (url.endsWith('/acme/acme-custom')) return { cardData: { license_name: 'acme-community' } };
      throw new Error(url);
    };
    const { dataset: out, stats } = await resolveLicenses(
      dataset([base('acme-open', true), base('acme-custom', true), base('acme-mystery', true), base('acme-closed', false)]),
      [lab],
      { fetchJson },
    );
    const byId = Object.fromEntries(out.models.map((m) => [m.id, m.license]));
    expect(byId['acme-open']).toEqual({ name: 'Apache 2.0', source: 'huggingface', url: 'https://huggingface.co/acme/acme-open' });
    expect(byId['acme-custom'].name).toBe('Acme Community license');
    expect(byId['acme-mystery']).toEqual({ name: 'MIT', source: 'lab-default' });
    expect(byId['acme-closed']).toEqual({ name: 'Proprietary', source: 'proprietary' });
    expect(stats).toMatchObject({ huggingface: 2, labDefault: 1, proprietary: 1, failedOrgs: [] });
  });

  it('keeps the previous answer when Hugging Face is down', async () => {
    const previous = dataset([{ ...base('acme-open', true), license: { name: 'Apache 2.0', source: 'huggingface', url: 'https://huggingface.co/acme/acme-open' } }]);
    const { dataset: out, stats } = await resolveLicenses(dataset([base('acme-open', true)]), [lab], {
      fetchJson: async () => {
        throw new Error('offline');
      },
      previous,
    });
    expect(out.models[0].license.source).toBe('huggingface');
    expect(stats.failedOrgs).toEqual(['acme']);
  });

  it('lets overrides win', async () => {
    const { dataset: out } = await resolveLicenses(dataset([base('acme-open', true)]), [lab], {
      fetchJson: async () => [],
      overrides: { 'acme/acme-open': { name: 'Acme Research license' } },
    });
    expect(out.models[0].license).toEqual({ name: 'Acme Research license', source: 'override' });
  });
});

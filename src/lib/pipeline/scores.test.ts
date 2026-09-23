import { describe, expect, it } from 'vitest';
import type { Dataset, Model } from '@/lib/types';
import { scoresFileSchema } from './schema';
import { percentile } from '@/lib/quality';
import { buildScores, parseCsv, rowCores, type ArenaRow } from './scores';

let set = 0;
function card(lab: string, id: string, name: string, extra: Partial<Model> = {}): Model {
  const slug = extra.slug ?? id.replace(/[^A-Za-z0-9_-]/g, '-');
  return {
    key: `${lab}/${slug}`,
    id,
    slug,
    lab,
    type: 'text',
    name,
    description: '',
    family: null,
    releaseDate: '2026-01-01',
    lastUpdated: null,
    knowledge: null,
    context: 200000,
    maxOutput: null,
    price: null,
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

const hub = (repo: string) => ({ origin: 'huggingface' as const, hub: { repo, downloads: 1e6, likes: 10, params: null, gated: false }, openWeights: true, access: 'open' as const });

const models = [
  card('acme', 'acme-pro-4-6', 'Acme Pro 4.6'),
  card('acme', 'acme-pro-4-6-thinking', 'Acme Pro 4.6 Thinking'),
  card('acme', 'acme-lite-2', 'Acme Lite 2'),
  card('open', 'open-4o', 'Open 4o'),
  card('open', 'open-4o-2024-08-06', 'Open 4o (2024-08-06)'),
  card('gem', 'gem/gem-4-31B', 'gem-4-31B', { slug: 'gem-4-31b', ...hub('gem/gem-4-31B') }),
  card('gem', 'gem/gem-4-31B-it', 'gem-4-31B-it', { slug: 'gem-4-31b-it', ...hub('gem/gem-4-31B-it') }),
  card('pix', 'pix-image-2', 'Pix Image 2', { type: 'image', input: ['text'], output: ['image'] }),
  card('pix', 'pix-image-2-preview', 'Pix Image 2 Preview', { type: 'image', input: ['text'], output: ['image'] }),
];
const dataset = { version: 1, updatedAt: '2026-09-23T00:00:00.000Z', source: { url: '', providers: 0, listings: 0, hub: { orgs: 0, repos: 0 } }, labs: [], models } as Dataset;

const eci = [
  'Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization',
  'Acme Pro 4.6,Acme Pro 4.6,150.5,148,152,2026-02-01,Acme',
  '"Open 4o (May 2024)","Open 4o (May 2024)",120,118,122,2024-05-13,Open',
  'Gem 4 31B,Gem 4 31B,130,128,132,2026-03-01,Gem',
  'Chat Alias,Chat Alias,90,88,92,2025-01-01,Other',
  'Tiny,Tiny,80,78,82,2023-01-01,Other',
].join('\n');
const metadata = [
  'model_version,model_group,date',
  'acme-pro-4-6_high,Acme Pro 4.6,2026-02-01',
  'gem-4-31b-it,Gem 4 31B,2026-03-01',
  'acme-lite,Chat Alias,2025-01-01',
  'gem-4-vl-31b,Gem 4 31B,2026-03-01',
].join('\n');
const gpqa = ['Model version,mean_score,Best score (across scorers)', 'acme-pro-4-6_high,0.8,0.82', 'acme-pro-4-6_low,0.7,0.71', 'gem-4-31b-it,0.6,0.6'].join('\n');

const row = (model_name: string, rating: number, category = 'overall'): ArenaRow => ({ model_name, rating, category, leaderboard_publish_date: '2026-09-13' });
const arena = {
  text: [
    row('acme-pro-4-6', 1400),
    row('acme-pro-4-6-high', 1450),
    row('acme-pro-4-6-thinking', 1480),
    row('gem-4-31b', 1300),
    row('open-4o-2024-05-13', 1250),
    row('someone-else', 1200),
    row('acme-pro-4-6-high', 1500, 'coding'),
  ],
  text_to_image: [row('pix-image-2 (medium)', 1300), row('pix-image-1', 1100)],
};

const out = buildScores(dataset, { epoch: { eci, metadata, bench: { gpqa } }, arena }, dataset.updatedAt);
const s = (key: string) => out.models[key];

describe('parseCsv', () => {
  it('reads quoted fields, CRLF, and a byte-order mark', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, ""y""",2\r\n\r\n')).toEqual([{ a: 'x, "y"', b: '2' }]);
  });
});

describe('rowCores', () => {
  it('peels settings, then snapshots, one level at a time', () => {
    expect(rowCores('claude-opus-4-6-high')).toEqual([['claudeopus46high'], ['claudeopus46'], ['claudeopus46high', 'claudeopus46']]);
    expect(rowCores('GPT-4o (May 2024)')[1]).toEqual(['gpt4omay2024']);
    expect(rowCores('GPT-4o (May 2024)')[2]).toContain('gpt4o');
    expect(rowCores('gpt-image-2 (medium)')[1]).toEqual(['gptimage2']);
    expect(rowCores('o3')[0]).toEqual(['o3']);
  });
  it('keeps tier names that are the whole name', () => {
    expect(rowCores('mistral-medium')[1]).toEqual(['mistralmedium']);
  });
});

describe('buildScores', () => {
  it('scores a card at its best setting and says what it was scored as', () => {
    expect(s('acme/acme-pro-4-6').boards.text).toEqual({ score: 1450, rank: 2, as: 'acme-pro-4-6-high' });
    expect(s('acme/acme-pro-4-6').boards.coding).toEqual({ score: 1500, rank: 1, as: 'acme-pro-4-6-high' });
  });
  it('keeps a thinking model’s score off the plain card', () => {
    expect(s('acme/acme-pro-4-6-thinking').boards.text?.score).toBe(1480);
    expect(s('acme/acme-pro-4-6').boards.text?.score).not.toBe(1480);
  });
  it('matches snapshots only when nothing closer exists, and never across dated names', () => {
    expect(s('open/open-4o').boards.eci?.as).toBe('Open 4o (May 2024)');
    expect(s('open/open-4o').boards.text?.as).toBe('open-4o-2024-05-13');
    expect(out.models['open/open-4o-2024-08-06']).toBeUndefined();
    expect(s('pix/pix-image-2').boards.image?.as).toBe('pix-image-2 (medium)');
    expect(out.models['pix/pix-image-2-preview']).toBeUndefined();
  });
  it('gives base weights nothing and their chat sibling the score', () => {
    expect(out.models['gem/gem-4-31b']).toBeUndefined();
    expect(s('gem/gem-4-31b-it').boards.text?.score).toBe(1300);
    expect(s('gem/gem-4-31b-it').boards.eci?.score).toBe(130);
    expect(s('gem/gem-4-31b-it').bench.gpqa).toBe(0.6);
  });
  it('ignores Epoch versions that are moving aliases or a different variant', () => {
    expect(out.models['acme/acme-lite-2']).toBeUndefined();
  });
  it('takes the best Epoch run per benchmark', () => {
    expect(s('acme/acme-pro-4-6').bench.gpqa).toBe(0.82);
  });
  it('rates text cards on the Capabilities Index first, image cards on the image arena', () => {
    expect(s('acme/acme-pro-4-6')).toMatchObject({ basis: 'eci', quality: 100 });
    expect(s('acme/acme-pro-4-6-thinking')).toMatchObject({ basis: 'text', quality: 100 });
    expect(s('pix/pix-image-2')).toMatchObject({ basis: 'image', quality: 100 });
    expect(out.boards.eci).toEqual({ count: 5, published: '2026-03-01' });
  });
  it('keeps earlier scores for a source that failed', () => {
    const again = buildScores(dataset, { epoch: null, arena: { text: arena.text } }, dataset.updatedAt, out);
    expect(again.models['acme/acme-pro-4-6'].boards.eci).toEqual(out.models['acme/acme-pro-4-6'].boards.eci);
    expect(again.models['acme/acme-pro-4-6'].bench).toEqual(out.models['acme/acme-pro-4-6'].bench);
    expect(again.models['pix/pix-image-2'].boards.image).toEqual(out.models['pix/pix-image-2'].boards.image);
  });
  it('writes a file the schema accepts', () => {
    expect(scoresFileSchema.safeParse(out).success).toBe(true);
  });
});

describe('percentile', () => {
  it('is the share of the rest a place beats', () => {
    expect(percentile(1, 268)).toBe(100);
    expect(percentile(268, 268)).toBe(0);
    expect(percentile(1, 1)).toBe(100);
  });
});

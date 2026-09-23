import { describe, expect, it } from 'vitest';
import { answersFromParams, answersToParams, deal, fitFor, needsFor, type Answers, type Signals } from './match';
import type { Model } from './types';

let set = 0;
function card(lab: string, name: string, extra: Partial<Model> = {}): Model {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    key: `${lab}/${slug}`,
    id: slug,
    slug,
    lab,
    type: 'text',
    name,
    description: '',
    family: null,
    releaseDate: '2026-01-01',
    lastUpdated: null,
    knowledge: null,
    context: 128000,
    maxOutput: null,
    price: { input: 1, output: 5, cacheRead: null, cacheWrite: null },
    input: ['text'],
    output: ['text'],
    reasoning: false,
    toolCall: true,
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

const flagship = card('acme', 'Acme Ultra', { price: { input: 5, output: 40, cacheRead: null, cacheWrite: null }, context: 1_000_000, input: ['text', 'image'] });
const sibling = card('acme', 'Acme Mini', { price: { input: 0.1, output: 0.8, cacheRead: null, cacheWrite: null } });
const rival = card('beta', 'Beta Pro', { price: { input: 1, output: 4, cacheRead: null, cacheWrite: null } });
const open = card('gamma', 'Gamma 70B', { openWeights: true, access: 'open', price: null, toolCall: false, releaseDate: '2026-06-01' });
const unrated = card('delta', 'Delta Chat', { price: { input: 0.1, output: 0.3, cacheRead: null, cacheWrite: null } });
const retired = card('beta', 'Beta Old', { status: 'deprecated' });
const painter = card('pix', 'Pix Paint', { type: 'image', output: ['image'], price: { input: 5, output: 30, cacheRead: null, cacheWrite: null } });
const pool = [flagship, sibling, rival, open, unrated, retired, painter];

const sig = (price: number | null, boards: Signals['boards'] = {}, bench: Signals['bench'] = {}): Signals => ({ price, boards, bench });
const signals: Record<string, Signals> = {
  [flagship.key]: sig(40, { coding: { p: 99, rank: 3 }, eci: { p: 98, rank: 5 }, text: { p: 97, rank: 12 } }, { swe: 0.8 }),
  [sibling.key]: sig(0.8, { coding: { p: 80, rank: 70 }, text: { p: 75, rank: 90 } }),
  [rival.key]: sig(4, { coding: { p: 95, rank: 20 }, eci: { p: 90, rank: 27 } }),
  [open.key]: sig(0.9, { coding: { p: 85, rank: 50 } }),
  [unrated.key]: sig(0.3),
  [retired.key]: sig(5, { coding: { p: 100, rank: 1 } }),
  [painter.key]: sig(30, { image: { p: 90, rank: 8 } }),
};
const counts = { coding: 397, eci: 268, text: 402, image: 79 };
const ask = (a: Partial<Answers>) => deal(pool, signals, counts, { task: 'code', budget: 'any', needs: [], access: 'either', ...a });

describe('fitFor', () => {
  it('weights the task’s boards and quotes the strongest one about the task', () => {
    const fit = fitFor('code', signals[flagship.key], counts);
    expect(fit.value).toBeGreaterThan(90);
    expect(fit.best?.text).toBe('#3 of 397 on LMArena Text · Coding');
  });
  it('counts thin evidence for a little less', () => {
    const one = fitFor('code', sig(1, { coding: { p: 90, rank: 1 } }), counts).value!;
    const all = fitFor('code', sig(1, { coding: { p: 90, rank: 1 }, eci: { p: 90, rank: 1 }, webdev: { p: 90, rank: 1 } }, { swe: 0.9 }), counts).value!;
    expect(one).toBeLessThan(all);
  });
  it('has nothing to say about tasks no board covers', () => {
    expect(fitFor('voice', signals[flagship.key], counts).value).toBeNull();
  });
});

describe('deal', () => {
  it('deals the best fits first, one per lab, never a retired card', () => {
    const r = ask({});
    expect(r.picks.map((p) => p.model.key)).toEqual([flagship.key, rival.key, open.key]);
    expect(r.picks[0].badge).toBe('Top pick');
    expect(r.picks[0].reason).toContain('#3 of 397 on LMArena Text · Coding');
    expect(r.picks.some((p) => p.model.key === retired.key)).toBe(false);
  });
  it('explains a cheaper runner-up by how much less it costs', () => {
    expect(ask({}).picks[1]).toMatchObject({ badge: 'Best value', reason: expect.stringContaining('10× less') });
  });
  it('holds paid cards to the budget, and lets open weights in when you’ll run them', () => {
    const low = ask({ budget: 'low' });
    expect(low.picks.map((p) => p.model.key)).toEqual([open.key, sibling.key, unrated.key]);
    expect(ask({ budget: 'low', access: 'api' }).picks.map((p) => p.model.key)).toEqual([open.key, sibling.key, unrated.key]);
    expect(ask({ budget: 'free' }).picks.map((p) => p.model.key)).toEqual([open.key]);
  });
  it('keeps to open weights or paid APIs when asked', () => {
    expect(ask({ access: 'open' }).picks.map((p) => p.model.key)).toEqual([open.key]);
    expect(ask({ access: 'open' }).picks[0].reason).toContain('open weights');
  });
  it('applies must-haves', () => {
    expect(ask({ needs: ['images'] }).picks.map((p) => p.model.key)).toEqual([flagship.key]);
    expect(ask({ needs: ['long'] }).picks.map((p) => p.model.key)).toEqual([flagship.key]);
  });
  it('fills with unrated cards and says so', () => {
    const r = ask({ budget: 'low', access: 'api' });
    expect(r.picks[2]).toMatchObject({ badge: 'Also fits', reason: expect.stringContaining('Not on a leaderboard yet') });
  });
  it('deals the next three on request', () => {
    const first = ask({}).picks.map((p) => p.model.key);
    const next = deal(pool, signals, counts, { task: 'code', budget: 'any', needs: [], access: 'either' }, first);
    expect(next.picks.some((p) => first.includes(p.model.key))).toBe(false);
    expect(next.picks[0].badge).toBe('Next best');
  });
  it('matches the card type to the task', () => {
    expect(ask({ task: 'image' }).picks.map((p) => p.model.key)).toEqual([painter.key]);
  });
});

describe('answers in the URL', () => {
  it('round-trip and drop needs that don’t belong to the task', () => {
    const a: Answers = { task: 'code', budget: 'mid', needs: ['tools', 'long'], access: 'api' };
    expect(answersFromParams(answersToParams(a))).toEqual(a);
    expect(answersFromParams(new URLSearchParams('task=image&budget=any&access=open&needs=tools,edit'))).toEqual({ task: 'image', budget: 'any', access: 'open', needs: ['edit'] });
    expect(answersFromParams(new URLSearchParams('task=code&budget=cheap&access=api'))).toBeNull();
  });
  it('offers must-haves that fit the task', () => {
    expect(needsFor('code')).toEqual(['images', 'tools', 'long']);
    expect(needsFor('search')).toEqual(['rerank']);
  });
});

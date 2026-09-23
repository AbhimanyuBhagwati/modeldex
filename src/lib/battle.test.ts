import { describe, expect, it } from 'vitest';
import raw from '../../data/models.json';
import { MAX_HP, battle, pickOpponent, randomMatchup } from './battle';
import type { Dataset, Model } from './types';

const data = raw as unknown as Dataset;

const card = (over: Partial<Model>): Model => ({
  key: 'acme/x', id: 'x', slug: 'x', lab: 'acme', type: 'text', name: 'X', description: '', family: null,
  releaseDate: '2026-01-01', lastUpdated: null, knowledge: '2025-06', context: 128_000, maxOutput: 8_000,
  price: { input: 1, output: 4, cacheRead: null, cacheWrite: null }, input: ['text'], output: ['text'],
  reasoning: false, toolCall: false, structuredOutput: false, attachment: false, openWeights: false,
  status: null, access: 'paid', rarity: 'uncommon', set: 1, license: { name: 'Proprietary', source: 'proprietary' },
  origin: 'models.dev', hub: null, ...over,
});

describe('battle', () => {
  const strong = card({ key: 'a/strong', context: 1_000_000, maxOutput: 128_000, price: { input: 0.1, output: 0.4, cacheRead: null, cacheWrite: null }, releaseDate: '2026-09-01', knowledge: '2026-06', reasoning: true, toolCall: true });
  const weak = card({ key: 'b/weak', lab: 'b', context: 8_000, maxOutput: 2_000, price: { input: 10, output: 60, cacheRead: null, cacheWrite: null }, releaseDate: '2023-01-01', knowledge: '2022-01' });

  it('lets the better card win, and stops at a knockout', () => {
    const r = battle(strong, weak);
    expect(r.winner).toBe(0);
    expect(r.ko).toBe(true);
    expect(r.hp[1]).toBe(0);
    expect(r.rounds.every((x) => x.winner === 0)).toBe(true);
    expect(r.rounds.length).toBeLessThan(6);
  });

  it('is the same fight from either side', () => {
    const one = battle(strong, weak);
    const two = battle(weak, strong);
    expect(two.winner).toBe(1);
    expect(two.rounds.map((x) => x.damage)).toEqual(one.rounds.map((x) => x.damage));
    expect(two.hp).toEqual([one.hp[1], one.hp[0]]);
  });

  it('skips rounds a card has no stat for, and calls identical stats a stalemate', () => {
    const open = card({ key: 'c/open', price: null, context: null, maxOutput: null, knowledge: null, hub: { repo: 'c/open', downloads: 5_000_000, likes: 10, params: 7e9, gated: false } });
    const r = battle(open, card({ key: 'd/api' }));
    expect(r.rounds.map((x) => x.stat)).toEqual(['fresh', 'skills']);
    expect(r.rounds.every((x) => x.winner === null && x.damage === 0)).toBe(true);
    expect(r).toMatchObject({ winner: null, ko: false, hp: [MAX_HP, MAX_HP] });
  });

  it('fights open models on size and downloads', () => {
    const big = card({ key: 'e/big', price: null, hub: { repo: 'e/big', downloads: 9_000_000, likes: 1, params: 70e9, gated: false } });
    const small = card({ key: 'f/small', price: null, hub: { repo: 'f/small', downloads: 90_000, likes: 1, params: 1e9, gated: false } });
    const r = battle(big, small);
    expect(r.rounds.map((x) => x.stat)).toContain('crowd');
    expect(r.rounds.find((x) => x.stat === 'size')).toMatchObject({ winner: 0, values: ['70B', '1B'] });
    expect(r.winner).toBe(0);
  });

  it('never deals more than a round’s worth or leaves HP out of range, across the real set', () => {
    const models = data.models.slice(0, 120);
    for (let i = 0; i + 1 < models.length; i += 2) {
      const r = battle(models[i], models[i + 1]);
      for (const round of r.rounds) {
        expect(round.damage === 0 || (round.damage >= 12 && round.damage <= 36)).toBe(true);
        expect(round.hp.every((h) => h >= 0 && h <= MAX_HP)).toBe(true);
      }
    }
  });
});

describe('matchmaking', () => {
  it('pairs a card with a live model of the same type from another lab', () => {
    const m = data.models.find((x) => x.type === 'embedding')!;
    const rand = () => 0.5;
    const o = pickOpponent(m, data.models, rand)!;
    expect(o.type).toBe('embedding');
    expect(o.lab).not.toBe(m.lab);
    expect(o.status).not.toBe('deprecated');
  });

  it('deals two different cards', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 25; i++) {
      const pair = randomMatchup(data.models, rand)!;
      expect(pair[0].key).not.toBe(pair[1].key);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { cardFace, formatCount, formatDate, formatMonth, formatParams, formatPrice, formatPriceShort, formatTokens, isNew, typeLine } from './format';

describe('format', () => {
  it('formats token counts', () => {
    expect(formatTokens(null)).toBe('—');
    expect(formatTokens(1_000_000)).toBe('1M');
    expect(formatTokens(1_048_576)).toBe('1.05M');
    expect(formatTokens(128_000)).toBe('128K');
    expect(formatTokens(512)).toBe('512');
  });

  it('formats prices', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(0.098)).toBe('$0.098');
    expect(formatPrice(2.5)).toBe('$2.50');
    expect(formatPrice(600)).toBe('$600');
    expect(formatPriceShort(4)).toBe('$4');
    expect(formatPriceShort(2.5)).toBe('$2.50');
  });

  it('formats dates in UTC', () => {
    expect(formatDate('2026-09-22')).toBe('Sep 22, 2026');
    expect(formatMonth('2025-05')).toBe('May 2025');
    expect(formatDate(null)).toBe('—');
  });

  it('flags cards released within two weeks of the data date', () => {
    expect(isNew({ releaseDate: '2026-09-10' }, '2026-09-22T06:00:00.000Z')).toBe(true);
    expect(isNew({ releaseDate: '2026-09-01' }, '2026-09-22T06:00:00.000Z')).toBe(false);
  });

  it('builds the type line from capabilities', () => {
    expect(typeLine({ type: 'text', reasoning: true, toolCall: true, input: ['text', 'image'], output: ['text'] })).toBe('Reasoning · Vision · Tools');
    expect(typeLine({ type: 'text', reasoning: false, toolCall: false, input: ['text'], output: ['text'] })).toBe('Text');
    expect(typeLine({ type: 'embedding', reasoning: false, toolCall: false, input: ['text'], output: ['text'] })).toBe('Embedding');
    expect(typeLine({ type: 'image', reasoning: false, toolCall: false, input: ['text', 'image'], output: ['image'] })).toBe('Image generation');
  });
});

describe('open-model stats', () => {
  it('formats parameter and download counts', () => {
    expect(formatParams(8_030_261_248)).toBe('8B');
    expect(formatParams(1_543_490_560)).toBe('1.5B');
    expect(formatParams(22_713_728)).toBe('23M');
    expect(formatCount(6_100_000)).toBe('6.1M');
    expect(formatCount(250_000)).toBe('250K');
    expect(formatCount(null)).toBe('—');
  });

  it('shows size and downloads on open models without a price, and prices otherwise', () => {
    const hub = { repo: 'acme/a', downloads: 6_100_000, likes: 7_800, params: 8e9, gated: false };
    const open = cardFace({ type: 'text', context: null, price: null, input: ['text'], output: ['text'], hub });
    expect(open.corner).toEqual({ label: 'SIZE', value: '8B', title: 'Parameters' });
    expect(open.moves.map((m) => `${m.name} ${m.value}${m.unit}`)).toEqual(['Downloads 6.1M/mo', 'Likes 7.8K']);
    expect(cardFace({ type: 'text', context: null, price: null, input: [], output: [], hub: { ...hub, params: null } }).corner).toBeNull();
    const priced = cardFace({ type: 'text', context: 200_000, price: { input: 3, output: 15, cacheRead: null, cacheWrite: null }, input: ['text'], output: ['text'], hub });
    expect(priced.corner?.value).toBe('200K');
    expect(priced.moves.map((m) => `${m.name} ${m.value}${m.unit}`)).toEqual(['Input $3/M', 'Output $15/M']);
  });
});

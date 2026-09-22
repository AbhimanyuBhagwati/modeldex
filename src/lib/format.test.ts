import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, formatPrice, formatPriceShort, formatTokens, isNew, typeLine } from './format';

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

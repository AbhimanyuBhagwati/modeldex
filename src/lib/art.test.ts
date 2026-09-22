import { describe, expect, it } from 'vitest';
import raw from '../../data/models.json';
import { LABS } from '@/config/labs';
import { artToSvg, cardArt, type ArtInput } from './art';
import type { Dataset } from './types';

const data = raw as unknown as Dataset;
const color = (lab: string) => data.labs.find((l) => l.key === lab)!.color;

describe('cardArt', () => {
  it('is deterministic, so server and browser draw the same card', () => {
    const m = data.models[0];
    expect(cardArt(m, color(m.lab))).toEqual(cardArt(m, color(m.lab)));
  });

  it('uses each lab’s own style and falls back for unknown labs', () => {
    for (const lab of LABS) {
      const m = data.models.find((x) => x.lab === lab.key);
      if (m) expect(cardArt(m, lab.color).style).toBe(lab.art);
    }
    const stray: ArtInput = { ...data.models[0], key: 'newlab/x', lab: 'newlab' };
    expect(cardArt(stray, '#336699').style).toBe('emblem');
  });

  it('gives every model in the set a different picture', () => {
    const seen = new Set(data.models.map((m) => artToSvg(cardArt(m, color(m.lab)))));
    expect(seen.size).toBe(data.models.length);
  });

  it('produces clean, finite SVG for every model', () => {
    for (const m of data.models) {
      const svg = artToSvg(cardArt(m, color(m.lab)));
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg.length).toBeLessThan(20_000);
    }
  });
});

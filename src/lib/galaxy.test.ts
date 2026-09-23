import { describe, expect, it } from 'vitest';
import raw from '../../data/models.json';
import { buildLines } from './evolution';
import { GALAXY_START, R, galaxyData, layoutGalaxy } from './galaxy';
import type { Dataset } from './types';

const data = raw as unknown as Dataset;
const g = galaxyData(data.models, data.labs, buildLines(data.models), data.updatedAt);
const layout = layoutGalaxy(g);
const radius = (i: number) => Math.hypot(layout.positions[i * 3], layout.positions[i * 3 + 2]);

describe('galaxyData', () => {
  it('has a star for every card, with classics born on day 0', () => {
    expect(g.stars).toHaveLength(data.models.length);
    const classics = g.stars.filter((s) => s.classic);
    expect(classics.length).toBeGreaterThan(50);
    expect(classics.every((s) => s.day === 0)).toBe(true);
    expect(g.stars.every((s) => s.day >= 0 && s.day <= g.days && s.magnitude > 0 && s.magnitude <= 1)).toBe(true);
    expect(g.stars.find((s) => !s.classic)!.date >= GALAXY_START).toBe(true);
  });

  it('lists constellations from the evolution lines', () => {
    const gpt = g.lines.find((l) => l.id === 'openai/gpt')!;
    expect(gpt.keys.length).toBeGreaterThanOrEqual(8);
    expect(g.stars.find((s) => s.key === gpt.keys[0])!.line).toBe('openai/gpt');
  });
});

describe('layoutGalaxy', () => {
  it('is deterministic and keeps every star inside the disk', () => {
    expect(layoutGalaxy(g).positions).toEqual(layout.positions);
    for (let i = 0; i < g.stars.length; i++) {
      expect(radius(i)).toBeLessThanOrEqual(R + 1e-3);
      expect(Number.isFinite(layout.positions[i * 3 + 1])).toBe(true);
    }
  });

  it('puts older stars nearer the core, so the galaxy grows outward with time', () => {
    const byDay = g.stars.map((s, i) => ({ day: s.day, r: radius(i) })).sort((a, b) => a.day - b.day);
    const firstQuarter = byDay.slice(0, byDay.length / 4).reduce((a, x) => a + x.r, 0);
    const lastQuarter = byDay.slice(-byDay.length / 4).reduce((a, x) => a + x.r, 0);
    expect(lastQuarter).toBeGreaterThan(firstQuarter * 1.8);
    expect(layout.radiusAt(0)).toBeLessThan(layout.radiusAt(g.days / 2));
    expect(layout.radiusAt(g.days)).toBeCloseTo(R, 0);
  });

  it('gives every lab its own slice of the disk and draws a ring for each new year', () => {
    const arms = Object.values(layout.arms);
    expect(arms).toHaveLength(g.labs.length);
    expect(arms.reduce((a, x) => a + x.width, 0)).toBeCloseTo(Math.PI * 2, 5);
    expect(layout.years.map((y) => y.year)).toEqual([2023, 2024, 2025, 2026]);
    expect(layout.years.every((y, i, all) => i === 0 || y.radius > all[i - 1].radius)).toBe(true);
  });
});

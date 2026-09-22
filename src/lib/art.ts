import { GLYPHS, LABS, LAYOUTS, type ArtStyle, type EmblemRecipe } from '@/config/labs';
import { hexToHsl, hslHex } from './color';
import type { Model } from './types';

export const ART_W = 160;
export const ART_H = 96;

interface Paint {
  fill?: string;
  stroke?: string;
  sw?: number;
  fo?: number;
  so?: number;
  dash?: string;
}
export type Shape =
  | ({ k: 'c'; x: number; y: number; r: number } & Paint)
  | ({ k: 'e'; x: number; y: number; rx: number; ry: number; rot?: number } & Paint)
  | ({ k: 'p'; d: string } & Paint);

/** A repeating tile laid over the whole art, for grids too dense to draw cell by cell. */
export interface ArtPattern {
  w: number;
  h: number;
  d: string;
  mode: 'stroke' | 'fill';
  o: number;
}

export interface Art {
  /** Prefix for gradient and pattern ids; the same model always gets the same one. */
  id: string;
  style: ArtStyle;
  angle: number;
  from: string;
  to: string;
  glow: string;
  gx: number;
  gy: number;
  pattern: ArtPattern | null;
  shapes: Shape[];
}

export type ArtInput = Pick<Model, 'key' | 'lab' | 'context' | 'reasoning' | 'toolCall' | 'input' | 'attachment' | 'structuredOutput' | 'rarity'>;

type Rand = () => number;
interface Palette {
  hue: number;
  from: string;
  to: string;
  glow: string;
  light: string;
  accent: string;
  mid: string;
  deep: string;
}
interface Drawn {
  shapes: Shape[];
  focus: [number, number];
  pattern?: ArtPattern;
  dark?: boolean;
}
type Motif = (r: Rand, p: Palette, density: number, complexity: number) => Drawn;

const STYLE_BY_LAB: Record<string, ArtStyle> = Object.fromEntries(LABS.map((l) => [l.key, l.art]));
const TAU = Math.PI * 2;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): Rand {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const between = (r: Rand, a: number, b: number) => a + (b - a) * r();
const int = (r: Rand, a: number, b: number) => Math.floor(between(r, a, b + 1));
const pick = <T,>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');
const box = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
const dot = (x: number, y: number, r: number) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
/** Four-point sparkle with slightly full sides. */
function star(x: number, y: number, R: number): string {
  const k = R * 0.14;
  return (
    `M${f(x)} ${f(y - R)}Q${f(x + k)} ${f(y - k)} ${f(x + R)} ${f(y)}` +
    `Q${f(x + k)} ${f(y + k)} ${f(x)} ${f(y + R)}Q${f(x - k)} ${f(y + k)} ${f(x - R)} ${f(y)}Q${f(x - k)} ${f(y - k)} ${f(x)} ${f(y - R)}Z`
  );
}
function hexagon(x: number, y: number, s: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) pts.push([x + s * Math.cos((i * TAU) / 6), y + s * Math.sin((i * TAU) / 6)]);
  return `${line(pts)}Z`;
}
function dust(r: Rand, n: number, fo: number): Shape {
  let d = '';
  for (let i = 0; i < n; i++) d += dot(between(r, 0, ART_W), between(r, 0, ART_H), between(r, 0.3, 0.8));
  return { k: 'p', d, fill: '#fff', fo };
}
function wave(r: Rand, base: number, amp: number, freq: number): string {
  const ph = between(r, 0, TAU);
  const pts: [number, number][] = [];
  for (let x = -4; x <= ART_W + 4; x += 8) pts.push([x, base + amp * Math.sin(x * freq + ph) + amp * 0.35 * Math.sin(x * freq * 2.7 + ph * 1.7)]);
  return `${line(pts)}L${ART_W + 4} ${ART_H + 4}L-4 ${ART_H + 4}Z`;
}

/** OpenAI: spirograph rosettes of rotated ellipses; single, twin, or ringed with beads. */
const rosette: Motif = (r, p, d, c) => {
  const variant = int(r, 0, 4);
  if (variant === 3) return spirograph(r, p, d, c);
  const macro = variant === 4;
  const x = macro ? pick(r, [between(r, 10, 40), between(r, 120, 150)]) : between(r, 44, 116);
  const y = macro ? between(r, 30, 66) : between(r, 34, 62);
  const n = int(r, 4, 6) + Math.round(d * 3) + (c >= 3 ? 1 : 0);
  const R = macro ? between(r, 58, 76) : between(r, 20, 30) + d * 7;
  const sq = between(r, 0.22, 0.44);
  const phase = between(r, 0, 180);
  const s: Shape[] = [dust(r, 14, 0.5), { k: 'c', x, y, r: R * 1.14, stroke: '#fff', sw: 0.5, so: 0.22 }];
  const flower = (fx: number, fy: number, fr: number, sw: number, so: number, color = '#fff', turn = 0) => {
    for (let i = 0; i < n; i++) s.push({ k: 'e', x: fx, y: fy, rx: fr, ry: fr * sq, rot: phase + turn + (i * 180) / n, stroke: color, sw, so });
  };
  flower(x, y, R, 0.9, 0.66);
  if (c >= 2) flower(x, y, R * 0.52, 0.6, 0.55, p.light, 90 / n);
  if (variant === 1) {
    const a = between(r, 0, TAU);
    const dist = R * between(r, 1.25, 1.7);
    const x2 = x + Math.cos(a) * dist * 1.3;
    const y2 = y + Math.sin(a) * dist * 0.7;
    flower(x2, y2, R * 0.5, 0.7, 0.55, p.light, 45 / n);
    s.push({ k: 'c', x: x2, y: y2, r: 2, fill: '#fff' });
  } else if (variant === 2) {
    let beads = '';
    for (let i = 0; i < n * 2; i++) beads += dot(x + Math.cos((i * TAU) / (n * 2)) * R * 1.4, y + Math.sin((i * TAU) / (n * 2)) * R * 1.4, 1.3);
    s.push({ k: 'p', d: beads, fill: p.light, fo: 0.85 }, { k: 'c', x, y, r: R * 1.85, stroke: '#fff', sw: 0.5, so: 0.14 });
  }
  s.push({ k: 'c', x, y, r: macro ? 6 : 3.4, fill: '#fff' });
  return { shapes: s, focus: [x, y] };
};

/** A closed hypotrochoid, the curve a spirograph pen draws. */
function spirograph(r: Rand, p: Palette, d: number, c: number): Drawn {
  const [big, small] = pick(r, [[5, 3], [7, 3], [8, 5], [7, 4], [9, 4], [11, 4], [6, 5]] as const);
  const pen = between(r, 0.6, 1.1) * small;
  const turns = small / gcd(big, small);
  const x = between(r, 50, 110);
  const y = between(r, 36, 60);
  const R = between(r, 30, 38) + d * 6;
  const scale = R / (big - small + pen);
  const curve = (k: number) => {
    const pts: [number, number][] = [];
    const steps = 60 * turns;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU * turns;
      const q = ((big - small) / small) * t;
      pts.push([x + k * scale * ((big - small) * Math.cos(t) + pen * Math.cos(q)), y + k * scale * 0.62 * ((big - small) * Math.sin(t) - pen * Math.sin(q))]);
    }
    return line(pts);
  };
  const s: Shape[] = [dust(r, 14, 0.5), { k: 'e', x, y, rx: R * 1.1, ry: R * 0.7, fill: p.glow, fo: 0.16 }, { k: 'p', d: curve(1), stroke: '#fff', sw: 0.8, so: 0.8 }];
  if (c >= 2) s.push({ k: 'p', d: curve(0.55), stroke: p.light, sw: 0.6, so: 0.5 });
  s.push({ k: 'c', x, y, r: 2.6, fill: '#fff' });
  return { shapes: s, focus: [x, y] };
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Jagged ridgeline, closed to the bottom edge. */
function ridge(r: Rand, base: number, height: number): string {
  const pts: [number, number][] = [];
  for (let x = -4; x <= ART_W + 4; x += between(r, 9, 17)) pts.push([x, base - between(r, 0, height)]);
  pts.push([ART_W + 4, base - between(r, 0, height)]);
  return `${line(pts)}L${ART_W + 4} ${ART_H + 4}L-4 ${ART_H + 4}Z`;
}

/** Anthropic: a sun over layered strata; rolling hills, sharp ridges, or a low sun setting. */
const strata: Motif = (r, p, d, c) => {
  const variant = int(r, 0, 2);
  const sunset = variant === 2;
  const sx = between(r, 28, 132);
  const sy = sunset ? between(r, 46, 58) : between(r, 15, 32);
  const sr = sunset ? between(r, 13, 19) : between(r, 8, 13);
  const s: Shape[] = [];
  if (sunset) {
    let rays = '';
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + (i / 13) * Math.PI;
      rays += line([[sx + Math.cos(a) * (sr + 3), sy + Math.sin(a) * (sr + 3)], [sx + Math.cos(a) * (sr + 16 + d * 8), sy + Math.sin(a) * (sr + 16 + d * 8)]]);
    }
    s.push({ k: 'p', d: rays, stroke: p.light, sw: 0.8, so: 0.45 });
  }
  s.push({ k: 'c', x: sx, y: sy, r: sr * 2.4, fill: p.glow, fo: 0.22 }, { k: 'c', x: sx, y: sy, r: sr, fill: p.light, fo: 0.96 });
  const n = 5 + Math.round(d * 4) + c;
  const amp = between(r, 2.5, 6);
  const freq = between(r, 0.025, 0.06);
  const top = sunset ? sy + between(r, 0, 6) : between(r, 34, 46);
  for (let i = 0; i < n; i++) {
    const base = top + (i * (ART_H - top)) / n;
    const d0 = variant === 1 ? ridge(r, base + 6, 10 - i * 0.6) : wave(r, base, amp * (1 - i * 0.04), freq * (1 + i * 0.03));
    s.push({ k: 'p', d: d0, fill: p.deep, fo: 0.17, stroke: '#fff', sw: 0.7, so: 0.34 });
  }
  return { shapes: s, focus: [sx, sy] };
};

/** Google: one large sparkle with satellites and a field of small ones. */
const sparkle: Motif = (r, p, d, c) => {
  const twins = r() < 0.4;
  const x = twins ? between(r, 42, 70) : between(r, 34, 126);
  const y = between(r, 32, 62);
  const R = between(r, 12, 17) + d * 9;
  const s: Shape[] = [
    { k: 'c', x, y, r: 30 + d * 10, stroke: '#fff', sw: 0.5, so: 0.18 },
    { k: 'c', x, y, r: 46 + d * 12, stroke: '#fff', sw: 0.5, so: 0.1 },
    { k: 'c', x, y, r: R * 0.9, fill: p.glow, fo: 0.3 },
    { k: 'p', d: star(x, y, R), fill: '#fff', fo: 0.97 },
  ];
  if (twins) {
    const x2 = x + between(r, 34, 52);
    const y2 = y + between(r, -16, 16);
    s.push({ k: 'c', x: x2, y: y2, r: R * 0.7, fill: p.glow, fo: 0.25 }, { k: 'p', d: star(x2, y2, R * 0.72), fill: p.light, fo: 0.95 });
  }
  const satellites = 2 + (c >= 3 ? 1 : 0) + (d > 0.6 ? 1 : 0);
  let mid = '';
  for (let i = 0; i < satellites; i++) {
    const a = between(r, 0, TAU);
    const dist = between(r, R + 12, R + 30);
    mid += star(x + Math.cos(a) * dist * 1.5, y + Math.sin(a) * dist * 0.8, between(r, 4, 8));
  }
  let small = '';
  const field: [number, number][] = [];
  for (let i = 0; i < 12 + Math.round(d * 14); i++) {
    const pt: [number, number] = [between(r, 4, 156), between(r, 4, 92)];
    field.push(pt);
    small += star(pt[0], pt[1], between(r, 1, 2.6));
  }
  if (r() < 0.5) {
    const chain = field.slice(0, 5 + c).sort((a, b) => a[0] - b[0]);
    s.push({ k: 'p', d: line(chain), stroke: '#fff', sw: 0.5, so: 0.35 });
  }
  s.push({ k: 'p', d: mid, fill: p.light, fo: 0.92 }, { k: 'p', d: small, fill: '#fff', fo: 0.65 });
  return { shapes: s, focus: [x, y] };
};

/** xAI: a black hole with an accretion disk and light-speed streaks. */
const singularity: Motif = (r, p, d) => {
  const x = between(r, 40, 120);
  const y = between(r, 32, 64);
  const rh = between(r, 8, 11) + d * 5;
  const ang = (between(r, -40, -26) * Math.PI) / 180;
  const streaks: string[] = [];
  const n = 12 + Math.round(d * 12);
  for (let i = 0; i < n; i++) {
    const sx = between(r, -20, 170);
    const sy = between(r, -10, 106);
    const len = between(r, 14, 60);
    streaks.push(line([[sx, sy], [sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]]));
  }
  const tilt = between(r, -35, 35);
  const flat = between(r, 0.16, 0.34);
  const t = (tilt * Math.PI) / 180;
  const front: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    const ex = rh * 3.6 * Math.cos(a);
    const ey = rh * 3.6 * flat * Math.sin(a);
    front.push([x + ex * Math.cos(t) - ey * Math.sin(t), y + ex * Math.sin(t) + ey * Math.cos(t)]);
  }
  const s: Shape[] = [
    { k: 'p', d: streaks.slice(0, n / 2).join(''), stroke: '#fff', sw: 0.6, so: 0.24 },
    { k: 'p', d: streaks.slice(n / 2).join(''), stroke: p.light, sw: 1.1, so: 0.13 },
    { k: 'c', x, y, r: rh * 2.2, fill: p.glow, fo: 0.16 },
  ];
  if (r() < 0.45) {
    const ja = t + Math.PI / 2;
    const len = between(r, 38, 60);
    const jet = line([[x - Math.cos(ja) * len, y - Math.sin(ja) * len], [x + Math.cos(ja) * len, y + Math.sin(ja) * len]]);
    s.push({ k: 'p', d: jet, stroke: p.light, sw: 3.2, so: 0.14 }, { k: 'p', d: jet, stroke: '#fff', sw: 0.9, so: 0.6 });
  }
  s.push(
    { k: 'e', x, y, rx: rh * 3.6, ry: rh * 3.6 * flat, rot: tilt, stroke: p.accent, sw: 1.6, so: 0.6 },
    { k: 'e', x, y, rx: rh * 2.8, ry: rh * 2.8 * flat, rot: tilt, stroke: '#fff', sw: 1, so: 0.4 },
    { k: 'c', x, y, r: rh + 1.4, stroke: '#fff', sw: 1.6, so: 0.9 },
    { k: 'c', x, y, r: rh, fill: '#040406' },
    { k: 'p', d: line(front), stroke: '#fff', sw: 1.5, so: 0.85 },
  );
  return { shapes: s, focus: [x, y], dark: true };
};

/** Meta: interwoven Lissajous loops, often a figure eight. */
const lissajous: Motif = (r, p, d, c) => {
  const pairs = [[1, 2], [1, 2], [2, 3], [3, 4], [1, 3], [3, 2], [2, 5], [4, 5], [3, 5]] as const;
  const [a, b] = pick(r, pairs);
  const cx = between(r, 72, 88);
  const A = 50 + d * 12;
  const B = 26 + d * 8;
  const delta = between(r, 0, Math.PI);
  const curve = (scale: number, dl: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * TAU;
      pts.push([cx + A * scale * Math.sin(a * t + dl), 48 + B * scale * Math.sin(b * t)]);
    }
    return line(pts);
  };
  const s: Shape[] = [
    dust(r, 12, 0.45),
    { k: 'e', x: cx, y: 48, rx: A * 0.8, ry: B * 0.8, fill: p.glow, fo: 0.14 },
    { k: 'p', d: curve(0.82, delta + 0.35), stroke: p.light, sw: 0.8, so: 0.45 },
    { k: 'p', d: curve(1, delta), stroke: '#fff', sw: 1.3, so: 0.92 },
  ];
  if (c >= 2) s.push({ k: 'p', d: curve(0.64, delta + 0.7), stroke: p.accent, sw: 0.8, so: 0.5 });
  for (let i = 0; i < 4; i++) {
    const t = between(r, 0, TAU);
    s.push({ k: 'c', x: cx + A * Math.sin(a * t + delta), y: 48 + B * Math.sin(b * t), r: 1.8, fill: '#fff' });
  }
  return { shapes: s, focus: [cx, 48] };
};

/** Mistral: a diagonal band of pixels that fades through four tones. */
const pixels: Motif = (r, p, d, c) => {
  const m = between(r, -0.75, -0.3);
  const b0 = between(r, 80, 112);
  const w = 16 + d * 14 + c * 2;
  const tones = [p.light, p.accent, p.mid, p.deep];
  const paths = ['', '', '', ''];
  const norm = Math.sqrt(1 + m * m);
  for (let col = 0; col < 20; col++) {
    for (let row = 0; row < 12; row++) {
      const px = col * 8 + 4;
      const py = row * 8 + 4;
      const dist = (py - (m * px + b0)) / norm;
      const a = Math.abs(dist);
      if (a < w && r() < (1 - a / w) * 0.95 + 0.05) {
        paths[clamp(Math.floor(((dist + w) / (2 * w)) * 4), 0, 3)] += box(col * 8 + 0.5, row * 8 + 0.5, 7, 7);
      } else if (r() < 0.03) {
        paths[0] += box(col * 8 + 0.5, row * 8 + 0.5, 7, 7);
      }
    }
  }
  const s: Shape[] = paths.flatMap((dd, i) => (dd ? [{ k: 'p' as const, d: dd, fill: tones[i], fo: [0.95, 0.85, 0.78, 0.7][i] }] : []));
  return { shapes: s, focus: [80, clamp(m * 80 + b0, 10, 86)] };
};

/** DeepSeek: a light in deep water, rising bubbles, sonar rings and swells. */
const abyss: Motif = (r, p, d, c) => {
  const lx = between(r, 26, 134);
  const ly = between(r, 14, 30);
  const sx = between(r, 30, 130);
  const bx = between(r, 24, 136);
  const s: Shape[] = [
    { k: 'c', x: lx, y: ly, r: 18, fill: p.glow, fo: 0.24 },
    { k: 'c', x: lx, y: ly, r: 3.2, fill: '#fff' },
  ];
  let sonar = '';
  for (let i = 1; i <= 4; i++) {
    const rad = 20 + i * 13 + d * 8;
    sonar += `M${f(sx - rad)} ${ART_H + 8}A${f(rad)} ${f(rad)} 0 0 1 ${f(sx + rad)} ${ART_H + 8}`;
  }
  s.push({ k: 'p', d: sonar, stroke: '#fff', sw: 0.6, so: 0.18 });
  for (let i = 0; i < 6 + Math.round(d * 8) + c; i++) {
    s.push({ k: 'c', x: bx + between(r, -14, 14), y: between(r, 16, 74), r: between(r, 0.9, 3.2), stroke: '#fff', sw: 0.6, so: 0.6 });
  }
  for (let i = 0; i < 4; i++) {
    s.push({ k: 'p', d: wave(r, 60 + i * 9, between(r, 2, 4.5), 0.05), fill: p.deep, fo: 0.3, stroke: p.light, sw: 0.6, so: 0.28 });
  }
  return { shapes: s, focus: [lx, ly] };
};

/** Qwen: a honeycomb with a cluster of lit cells. */
const honeycomb: Motif = (r, p, d, c) => {
  const s0 = f(between(r, 5.5, 8.5));
  const hh = Math.sqrt(3) * s0;
  const tile = [[0, 0], [0, hh], [1.5 * s0, hh / 2], [3 * s0, 0], [3 * s0, hh]].map(([x, y]) => hexagon(x, y, s0)).join('');
  const maxCol = Math.floor(ART_W / (1.5 * s0));
  const maxRow = Math.floor(ART_H / hh);
  const center = (col: number, row: number): [number, number] => [1.5 * s0 * col, hh * row + (col % 2 ? hh / 2 : 0)];
  const grow = (start: string, target: number) => {
    const cells = [start];
    for (let guard = 0; cells.length < target && guard < 200; guard++) {
      const [col, row] = pick(r, cells).split(',').map(Number);
      const odd = col % 2;
      const n = pick(r, [[0, -1], [0, 1], [-1, odd ? 0 : -1], [-1, odd ? 1 : 0], [1, odd ? 0 : -1], [1, odd ? 1 : 0]]);
      const [nc, nr] = [col + n[0], row + n[1]];
      const next = `${nc},${nr}`;
      if (nc >= 0 && nc <= maxCol && nr >= 0 && nr <= maxRow && !cells.includes(next)) cells.push(next);
    }
    return cells;
  };
  const clusters = c >= 3 || r() < 0.3 ? 2 : 1;
  const starts = Array.from({ length: clusters }, () => `${int(r, 2, maxCol - 2)},${int(r, 1, maxRow - 1)}`);
  const bright: string[] = [];
  const soft: string[] = [];
  starts.forEach((start, k) => {
    grow(start, Math.round((5 + d * 8 + c * 2) / (k ? 2 : 1))).forEach((key, i) => {
      const [x, y] = center(...(key.split(',').map(Number) as [number, number]));
      (i < 2 + c / 2 ? bright : soft).push(hexagon(x, y, s0 * 0.84));
    });
  });
  const [fx, fy] = center(...(starts[0].split(',').map(Number) as [number, number]));
  return {
    shapes: [
      { k: 'c', x: fx, y: fy, r: 30, fill: p.glow, fo: 0.2 },
      { k: 'p', d: soft.join(''), fill: p.accent, fo: 0.55, stroke: '#fff', sw: 0.6, so: 0.5 },
      { k: 'p', d: bright.join(''), fill: p.light, fo: 0.92 },
    ],
    focus: [fx, fy],
    pattern: { w: f(3 * s0), h: f(hh), d: tile, mode: 'stroke', o: 0.3 },
  };
};

/** Moonshot: a moon in a random phase, craters, a dashed orbit and stars. */
const moon: Motif = (r, p, d) => {
  const mx = between(r, 48, 112);
  const my = between(r, 34, 58);
  const R = 17 + d * 8;
  let stars = '';
  for (let i = 0; i < 18 + Math.round(d * 22); i++) stars += dot(between(r, 0, ART_W), between(r, 0, ART_H), between(r, 0.3, 0.9));
  const off = R * between(r, 0.45, 1.5) * (r() < 0.5 ? -1 : 1);
  const hgt = Math.sqrt(R * R - (off / 2) ** 2);
  const tx = mx + off / 2;
  const [big, small] = off > 0 ? [0, 1] : [1, 0];
  const lit = `M${f(tx)} ${f(my - hgt)}A${f(R)} ${f(R)} 0 1 ${big} ${f(tx)} ${f(my + hgt)}A${f(R)} ${f(R)} 0 0 ${small} ${f(tx)} ${f(my - hgt)}Z`;
  const s: Shape[] = [
    { k: 'p', d: stars, fill: '#fff', fo: 0.7 },
    { k: 'c', x: mx, y: my, r: R * 1.7, fill: p.glow, fo: 0.16 },
    { k: 'e', x: mx, y: my, rx: R * 2.3, ry: R * 0.55, rot: between(r, -20, 20), stroke: '#fff', sw: 0.6, so: 0.3, dash: '2 3' },
    { k: 'c', x: mx, y: my, r: R, fill: p.deep, fo: 0.8 },
    { k: 'p', d: lit, fill: p.light, fo: 0.97 },
  ];
  let craters = '';
  for (let i = 0; i < int(r, 4, 7); i++) {
    const a = between(r, 0, TAU);
    const dist = between(r, 0, R * 0.7);
    craters += dot(mx + Math.cos(a) * dist, my + Math.sin(a) * dist, between(r, 1.2, 4.2));
  }
  s.push({ k: 'p', d: craters, fill: p.mid, fo: 0.24 });
  return { shapes: s, focus: [mx, my] };
};

/** Z.ai: a chip with traces routed out at 45 and 90 degrees. */
const circuit: Motif = (r, p, d, c) => {
  let traces = '';
  let nodes = '';
  let pins = '';
  let bodies = '';
  let dies = '';
  const chip = (cx: number, cy: number, cw: number, ch: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const side = i % 4;
      const t = between(r, 0.15, 0.85);
      let x = side === 1 ? cx + cw / 2 : side === 3 ? cx - cw / 2 : cx - cw / 2 + t * cw;
      let y = side === 0 ? cy - ch / 2 : side === 2 ? cy + ch / 2 : cy - ch / 2 + t * ch;
      let [hx, hy] = side === 0 ? [0, -1] : side === 1 ? [1, 0] : side === 2 ? [0, 1] : [-1, 0];
      pins += line([[x, y], [x + hx * 3, y + hy * 3]]);
      const pts: [number, number][] = [[x, y]];
      for (let seg = 0; seg < int(r, 2, 3); seg++) {
        const len = between(r, 7, 22);
        x = clamp(x + hx * len, 4, ART_W - 4);
        y = clamp(y + hy * len, 4, ART_H - 4);
        pts.push([x, y]);
        const turn = pick(r, [-1, 1]) * (Math.PI / 4);
        const nhx = hx * Math.cos(turn) - hy * Math.sin(turn);
        const nhy = hx * Math.sin(turn) + hy * Math.cos(turn);
        const len2 = Math.hypot(nhx, nhy);
        [hx, hy] = [nhx / len2, nhy / len2];
      }
      traces += line(pts);
      nodes += dot(x, y, 1.8);
    }
    bodies += box(cx - cw / 2, cy - ch / 2, cw, ch);
    dies += box(cx - cw / 5, cy - ch / 5, (2 * cw) / 5, (2 * ch) / 5);
  };
  const cx = between(r, 40, 120);
  const cy = between(r, 32, 64);
  const cw = between(r, 20, 28) + d * 8;
  const ch = between(r, 14, 18) + d * 6;
  let bus = '';
  if (r() < 0.4) {
    const cx2 = cx < 80 ? between(r, 112, 140) : between(r, 20, 48);
    const cy2 = between(r, 20, 76);
    const mx = (cx + cx2) / 2;
    for (let k = -1; k <= 1; k++) bus += line([[cx, cy + k * 3], [mx + k * 3, cy + k * 3], [mx + k * 3, cy2 + k * 3], [cx2, cy2 + k * 3]]);
    chip(cx2, cy2, cw * 0.6, ch * 0.6, 3 + c);
  }
  chip(cx, cy, cw, ch, 6 + Math.round(d * 5) + c);
  return {
    shapes: [
      { k: 'c', x: cx, y: cy, r: 34, fill: p.glow, fo: 0.18 },
      { k: 'p', d: bus, stroke: p.light, sw: 0.8, so: 0.55 },
      { k: 'p', d: traces, stroke: '#fff', sw: 0.9, so: 0.7 },
      { k: 'p', d: nodes, fill: p.light, fo: 0.95 },
      { k: 'p', d: bodies, fill: p.deep, fo: 0.75, stroke: '#fff', sw: 1, so: 0.85 },
      { k: 'p', d: pins, stroke: '#fff', sw: 0.8, so: 0.8 },
      { k: 'p', d: dies, fill: p.accent, fo: 0.85 },
    ],
    focus: [cx, cy],
    pattern: { w: 10, h: 10, d: dot(5, 5, 0.5), mode: 'fill', o: 0.22 },
  };
};

/** Cohere: halftone dots swelling around two or three focal points. */
const halftone: Motif = (r, p, d, c) => {
  const focals = Array.from({ length: 2 + (c >= 3 ? 1 : 0) }, () => ({ x: between(r, 20, 140), y: between(r, 16, 80), infl: between(r, 30, 50) + d * 12 }));
  const layer = (offset: number, max: number, pts: typeof focals) => {
    let out = '';
    for (let gx = 0; gx < 20; gx++) {
      for (let gy = 0; gy < 12; gy++) {
        const x = 4 + gx * 8 + offset;
        const y = 4 + gy * 8 + offset;
        const v = Math.max(...pts.map((q) => 1 - Math.hypot(x - q.x, y - q.y) / q.infl));
        const rad = max * Math.max(0, v) ** 0.9;
        if (rad > 0.35) out += dot(x, y, rad);
      }
    }
    return out;
  };
  const second = { x: between(r, 20, 140), y: between(r, 16, 80), infl: between(r, 26, 40) };
  return {
    shapes: [
      { k: 'p', d: layer(4, 2.3, [second]), fill: p.accent, fo: 0.65 },
      { k: 'p', d: layer(0, 3.4, focals), fill: '#fff', fo: 0.85 },
    ],
    focus: [focals[0].x, focals[0].y],
  };
};

/** MiniMax: an equalizer waveform with a carrier line. */
const waveform: Motif = (r, p, d) => {
  const n = 28 + Math.round(d * 14);
  const step = ART_W / n;
  const bw = step * 0.56;
  const mid = between(r, 42, 54);
  const fs = [between(r, 0.6, 1.4), between(r, 1.8, 3.2), between(r, 4, 6.5)];
  const ph = [between(r, 0, TAU), between(r, 0, TAU), between(r, 0, TAU)];
  let bars = '';
  let caps = '';
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * step;
    const t = i / n;
    const v = (Math.sin(t * fs[0] * TAU + ph[0]) + 0.6 * Math.sin(t * fs[1] * TAU + ph[1]) + 0.3 * Math.sin(t * fs[2] * TAU + ph[2]) + 1.9) / 3.8;
    const h = 4 + v * (34 + d * 10);
    bars += box(x - bw / 2, mid - h / 2, bw, h);
    if (v > 0.7) caps += dot(x, mid - h / 2 - 3, 0.9);
  }
  const carrier: [number, number][] = [];
  for (let x = -4; x <= ART_W + 4; x += 4) carrier.push([x, mid + (16 + d * 6) * Math.sin((x / ART_W) * TAU * fs[0] + ph[1])]);
  return {
    shapes: [
      { k: 'e', x: 80, y: mid, rx: 70, ry: 22, fill: p.glow, fo: 0.16 },
      { k: 'p', d: line([[0, mid], [ART_W, mid]]), stroke: '#fff', sw: 0.5, so: 0.3 },
      { k: 'p', d: bars, fill: '#fff', fo: 0.85 },
      { k: 'p', d: caps, fill: p.light, fo: 0.9 },
      { k: 'p', d: line(carrier), stroke: p.accent, sw: 1, so: 0.7 },
    ],
    focus: [80, mid],
  };
};

/** Perplexity: a radar sweep with contacts on the scope. */
const radar: Motif = (r, p, d, c) => {
  const x = between(r, 50, 110);
  const y = between(r, 36, 60);
  const R = 40 + d * 12;
  const s: Shape[] = [{ k: 'c', x, y, r: R * 1.1, fill: p.glow, fo: 0.12 }];
  for (let i = 1; i <= 4; i++) s.push({ k: 'c', x, y, r: (R * i) / 4, stroke: '#fff', sw: 0.6, so: 0.3 - i * 0.03 });
  s.push({ k: 'p', d: line([[x - R, y], [x + R, y]]) + line([[x, y - R], [x, y + R]]), stroke: '#fff', sw: 0.5, so: 0.2 });
  const a0 = between(r, 0, TAU);
  const pt = (a: number, rad = R): [number, number] => [x + Math.cos(a) * rad, y + Math.sin(a) * rad];
  for (let k = 1; k <= 4; k++) {
    const [ax, ay] = pt(a0 - 0.22 * k);
    const [bx, by] = pt(a0);
    s.push({ k: 'p', d: `M${f(x)} ${f(y)}L${f(ax)} ${f(ay)}A${f(R)} ${f(R)} 0 0 1 ${f(bx)} ${f(by)}Z`, fill: p.light, fo: 0.11 });
  }
  s.push({ k: 'p', d: line([[x, y], pt(a0)]), stroke: '#fff', sw: 1.1, so: 0.85 });
  let blips = '';
  let halos = '';
  for (let i = 0; i < 3 + c + Math.round(d * 3); i++) {
    const [bx, by] = pt(between(r, 0, TAU), between(r, R * 0.2, R * 0.92));
    blips += dot(bx, by, 1.6);
    halos += dot(bx, by, 4);
  }
  s.push({ k: 'p', d: halos, fill: p.light, fo: 0.25 }, { k: 'p', d: blips, fill: '#fff', fo: 0.95 }, { k: 'c', x, y, r: 2.2, fill: '#fff' });
  return { shapes: s, focus: [x, y] };
};

/** NVIDIA: a faceted low-poly surface lit from one side. */
const lowpoly: Motif = (r, p, d) => {
  const cols = 6 + Math.round(d * 3);
  const rows = 4 + Math.round(d * 2);
  const cw = ART_W / (cols - 1);
  const rh = ART_H / (rows - 1);
  const grid: [number, number][][] = [];
  for (let i = 0; i < cols; i++) {
    grid.push([]);
    for (let j = 0; j < rows; j++) {
      const edgeX = i === 0 || i === cols - 1;
      const edgeY = j === 0 || j === rows - 1;
      grid[i].push([i * cw + (edgeX ? 0 : between(r, -0.35, 0.35) * cw), j * rh + (edgeY ? 0 : between(r, -0.35, 0.35) * rh)]);
    }
  }
  const lx = between(r, 10, 150);
  const ly = between(r, 0, 50);
  const tones = [p.light, p.accent, p.mid, p.deep];
  const fills = ['', '', '', ''];
  let edges = '';
  let gems = '';
  const tri = (a: [number, number], b: [number, number], q: [number, number]) => {
    const d0 = `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}L${f(q[0])} ${f(q[1])}Z`;
    const cx = (a[0] + b[0] + q[0]) / 3;
    const cy = (a[1] + b[1] + q[1]) / 3;
    const v = clamp(1 - Math.hypot(cx - lx, cy - ly) / 170 + between(r, -0.14, 0.14), 0, 0.999);
    fills[3 - Math.floor(v * 4)] += d0;
    edges += d0;
    if (v > 0.86 && r() < 0.5) gems += d0;
  };
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const [a, b, q, e] = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
      if (r() < 0.5) {
        tri(a, b, q);
        tri(a, q, e);
      } else {
        tri(a, b, e);
        tri(b, q, e);
      }
    }
  }
  return {
    shapes: [
      ...fills.flatMap((dd, i) => (dd ? [{ k: 'p' as const, d: dd, fill: tones[i], fo: [0.55, 0.45, 0.38, 0.5][i] }] : [])),
      { k: 'p', d: edges, stroke: '#fff', sw: 0.4, so: 0.18 },
      { k: 'p', d: gems, fill: '#fff', fo: 0.35 },
    ],
    focus: [lx, ly],
  };
};

/** Amazon: a prism splitting a beam into a spectrum. */
const prism: Motif = (r, p, d, c) => {
  const dir = r() < 0.5 ? 1 : -1;
  const x = between(r, 64, 96);
  const y = between(r, 42, 58);
  const size = 22 + d * 10;
  const top: [number, number] = [x, y - size];
  const left: [number, number] = [x - size * 0.9, y + size * 0.6];
  const right: [number, number] = [x + size * 0.9, y + size * 0.6];
  const mid = (a: [number, number], b: [number, number], t = 0.5): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const entry = dir > 0 ? mid(top, left, between(r, 0.4, 0.6)) : mid(top, right, between(r, 0.4, 0.6));
  const exit = dir > 0 ? mid(top, right, between(r, 0.45, 0.65)) : mid(top, left, between(r, 0.45, 0.65));
  const s: Shape[] = [dust(r, 12, 0.45), { k: 'p', d: line([[dir > 0 ? -4 : ART_W + 4, entry[1] + between(r, -18, 14)], entry]), stroke: '#fff', sw: 2, so: 0.92 }];
  const n = 5 + c;
  const spread = between(r, 44, 70);
  for (let k = 0; k < n; k++) {
    const endY = exit[1] - spread / 2 + (k * spread) / (n - 1) + between(r, -2, 2);
    s.push({ k: 'p', d: line([exit, [dir > 0 ? ART_W + 4 : -4, endY]]), stroke: hslHex(p.hue + (k * 300) / n, 0.8, 0.7), sw: 1.8, so: 0.85 });
  }
  s.push(
    { k: 'c', x: exit[0], y: exit[1], r: 7, fill: p.glow, fo: 0.35 },
    { k: 'p', d: `${line([top, left, right])}Z`, fill: p.deep, fo: 0.4, stroke: '#fff', sw: 1.2, so: 0.92 },
    { k: 'p', d: line([mid(top, left, 0.2), mid(top, right, 0.2)]), stroke: '#fff', sw: 0.6, so: 0.4 },
  );
  return { shapes: s, focus: exit };
};

/** Microsoft: a node network with hubs and one lit route. */
const network: Motif = (r, p, d, c) => {
  const target = 12 + Math.round(d * 10) + c * 2;
  const nodes: [number, number][] = [];
  for (let tries = 0; nodes.length < target && tries < 400; tries++) {
    const q: [number, number] = [between(r, 6, 154), between(r, 6, 90)];
    if (nodes.every((n) => Math.hypot(n[0] - q[0], n[1] - q[1]) > 13)) nodes.push(q);
  }
  const near = (i: number) =>
    nodes
      .map((n, j) => [j, Math.hypot(n[0] - nodes[i][0], n[1] - nodes[i][1])] as const)
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1])
      .map(([j]) => j);
  const seen = new Set<string>();
  let edges = '';
  nodes.forEach((n, i) => {
    for (const j of near(i).slice(0, 2)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges += line([n, nodes[j]]);
      }
    }
  });
  const hubs = [0, 1, 2].map(() => Math.floor(r() * nodes.length));
  const route: [number, number][] = [nodes[hubs[0]]];
  let at = hubs[0];
  const visited = new Set([at]);
  for (let step = 0; step < 4; step++) {
    const next = near(at).find((j) => !visited.has(j));
    if (next == null) break;
    visited.add(next);
    route.push(nodes[next]);
    at = next;
  }
  let small = '';
  nodes.forEach((n, i) => {
    if (!hubs.includes(i)) small += dot(n[0], n[1], 1.4);
  });
  const s: Shape[] = [
    { k: 'p', d: edges, stroke: '#fff', sw: 0.6, so: 0.34 },
    { k: 'p', d: line(route), stroke: p.accent, sw: 1.4, so: 0.9 },
    { k: 'p', d: small, fill: p.light, fo: 0.9 },
  ];
  for (const h of hubs) s.push({ k: 'c', x: nodes[h][0], y: nodes[h][1], r: 6, fill: p.glow, fo: 0.3 }, { k: 'c', x: nodes[h][0], y: nodes[h][1], r: 2.8, fill: '#fff' });
  return { shapes: s, focus: nodes[hubs[0]] };
};

/** ByteDance: streamlines following a smooth flow field. */
const flow: Motif = (r, p, d, c) => {
  const fx = between(r, 0.02, 0.05);
  const fy = between(r, 0.03, 0.06);
  const ph = between(r, 0, TAU);
  const ph2 = between(r, 0, TAU);
  const twist = between(r, 1.2, 2.2);
  const base = between(r, -0.4, 0.4);
  const angle = (x: number, y: number) => Math.sin(x * fx + ph) * Math.cos(y * fy + ph2) * twist + base;
  let bright = '';
  let faint = '';
  const n = 16 + Math.round(d * 10) + c * 2;
  for (let i = 0; i < n; i++) {
    let x = between(r, -10, 150);
    let y = between(r, 0, ART_H);
    const pts: [number, number][] = [[x, y]];
    for (let step = 0; step < 22; step++) {
      const a = angle(x, y);
      x += Math.cos(a) * 4;
      y += Math.sin(a) * 4;
      pts.push([x, y]);
    }
    if (i % 3 === 0) bright += line(pts);
    else faint += line(pts);
  }
  return {
    shapes: [
      { k: 'e', x: 80, y: 48, rx: 70, ry: 34, fill: p.glow, fo: 0.14 },
      { k: 'p', d: faint, stroke: '#fff', sw: 0.7, so: 0.3 },
      { k: 'p', d: bright, stroke: p.light, sw: 1.1, so: 0.8 },
    ],
    focus: [80, 48],
  };
};

function polygon(x: number, y: number, radii: number[], start: number): string {
  const pts: [number, number][] = radii.map((rad, i) => {
    const a = start + (i * TAU) / radii.length;
    return [x + Math.cos(a) * rad, y + Math.sin(a) * rad];
  });
  return `${line(pts)}Z`;
}

/** One glyph as a closed path. Rings are circles drawn as outlines by the caller. */
function glyph(kind: EmblemRecipe['glyph'], x: number, y: number, s: number, rot: number): string {
  const a = (rot * Math.PI) / 180;
  switch (kind) {
    case 'triangle':
      return polygon(x, y, [s, s, s], a - Math.PI / 2);
    case 'square':
      return polygon(x, y, [s * 1.2, s * 1.2, s * 1.2, s * 1.2], a + Math.PI / 4);
    case 'diamond':
      return polygon(x, y, [s * 0.75, s * 1.15, s * 0.75, s * 1.15], a);
    case 'hexagon':
      return polygon(x, y, Array(6).fill(s), a);
    case 'star':
      return polygon(x, y, Array.from({ length: 10 }, (_, i) => (i % 2 ? s * 0.45 : s)), a - Math.PI / 2);
    case 'plus': {
      const w = s * 0.38;
      return `${line([[x - w, y - s], [x + w, y - s], [x + w, y - w], [x + s, y - w], [x + s, y + w], [x + w, y + w], [x + w, y + s], [x - w, y + s], [x - w, y + w], [x - s, y + w], [x - s, y - w], [x - w, y - w]])}Z`;
    }
    default:
      return dot(x, y, s);
  }
}

interface Mark {
  x: number;
  y: number;
  s: number;
  rot: number;
  tone: 0 | 1 | 2;
}

/**
 * The generated style: one glyph repeated in one layout. The recipe gives each lab its identity;
 * the model's seed, context size, and capabilities vary the composition.
 */
function emblem(recipe: EmblemRecipe): Motif {
  return (r, p, d, c) => {
    const marks: Mark[] = [];
    const cx = between(r, 48, 112);
    const cy = between(r, 34, 62);
    const spin = r() < 0.5 ? between(r, 0, 360) : 0;
    const outlines: string[] = [];
    switch (recipe.layout) {
      case 'grid': {
        const g = between(r, 13, 18) - d * 2;
        const fx = between(r, 0.03, 0.07);
        const fy = between(r, 0.04, 0.09);
        const ph = between(r, 0, TAU);
        for (let x = g / 2; x < ART_W; x += g) {
          for (let y = g / 2; y < ART_H; y += g) {
            const v = (Math.sin(x * fx + ph) + Math.cos(y * fy + ph * 1.3) + 2) / 4;
            if (g * 0.42 * v < 1) continue;
            marks.push({ x, y, s: g * 0.42 * v, rot: spin * v, tone: v > 0.72 ? 0 : v > 0.45 ? 1 : 2 });
          }
        }
        break;
      }
      case 'radial': {
        const K = 3 + Math.round(d * 2);
        const step = between(r, 11, 14);
        const offset = between(r, 0, TAU);
        marks.push({ x: cx, y: cy, s: 6, rot: spin, tone: 0 });
        for (let k = 1; k <= K; k++) {
          const count = 6 * k;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * TAU + k * offset;
            marks.push({ x: cx + Math.cos(a) * k * step, y: cy + Math.sin(a) * k * step, s: 1.2 + 4 * (1 - k / (K + 2)), rot: (a * 180) / Math.PI + spin, tone: (k % 3) as Mark['tone'] });
          }
        }
        break;
      }
      case 'spiral': {
        const n = 50 + Math.round(d * 50) + c * 6;
        const spread = between(r, 3.8, 4.8);
        for (let i = 1; i <= n; i++) {
          const rad = spread * Math.sqrt(i);
          const a = i * 2.39996;
          const x = cx + Math.cos(a) * rad;
          const y = cy + Math.sin(a) * rad;
          if (x < -6 || x > ART_W + 6 || y < -6 || y > ART_H + 6) continue;
          marks.push({ x, y, s: 1 + 3.4 * (i / n), rot: (a * 180) / Math.PI, tone: (i % 3) as Mark['tone'] });
        }
        break;
      }
      case 'scatter': {
        const n = 22 + Math.round(d * 18) + c * 2;
        for (let i = 0; i < n; i++) {
          const big = i < 3;
          marks.push({ x: between(r, 4, 156), y: between(r, 4, 92), s: big ? between(r, 8, 12) : between(r, 1.5, 5.5), rot: between(r, 0, 360), tone: big ? 0 : (int(r, 0, 2) as Mark['tone']) });
        }
        break;
      }
      case 'wave': {
        const f0 = between(r, 0.03, 0.06);
        const ph = between(r, 0, TAU);
        const amp = between(r, 8, 16);
        for (let row = 0; row < 3; row++) {
          const base = 26 + row * 22 + between(r, -4, 4);
          const stepX = between(r, 9, 12) - d * 2;
          for (let x = 4; x < ART_W; x += stepX) {
            const w = Math.sin(x * f0 + ph + row * 0.8);
            marks.push({ x, y: base + amp * w, s: 2 + 2.6 * (w + 1) * (0.6 + row * 0.2), rot: spin + w * 25, tone: row as Mark['tone'] });
          }
        }
        break;
      }
      case 'concentric': {
        const R = 26 + d * 10;
        for (let i = 0; i < 4 + (c >= 3 ? 1 : 0); i++) outlines.push(glyph(recipe.glyph === 'ring' ? 'circle' : recipe.glyph, cx, cy, R * (1 - i * 0.2), spin + i * 8));
        marks.push({ x: cx, y: cy, s: R * 0.16, rot: spin, tone: 0 });
        const sat = 6 + c;
        for (let i = 0; i < sat; i++) {
          const a = (i / sat) * TAU + between(r, -0.1, 0.1);
          marks.push({ x: cx + Math.cos(a) * R * 1.4, y: cy + Math.sin(a) * R * 1.4 * 0.8, s: between(r, 2, 3.6), rot: (a * 180) / Math.PI, tone: 1 });
        }
        break;
      }
    }
    const tones = ['', '', ''];
    const ring = recipe.glyph === 'ring';
    for (const m of marks) tones[m.tone] += glyph(ring ? 'circle' : recipe.glyph, m.x, m.y, m.s, m.rot);
    const paint = (i: number): Shape => {
      const color = ['#fff', p.light, p.accent][i];
      const o = [0.92, 0.7, 0.62][i];
      return ring ? { k: 'p', d: tones[i], stroke: color, sw: 0.9, so: o } : { k: 'p', d: tones[i], fill: color, fo: o };
    };
    const s: Shape[] = [{ k: 'c', x: cx, y: cy, r: 34, fill: p.glow, fo: 0.18 }];
    if (outlines.length) s.push({ k: 'p', d: outlines.join(''), stroke: '#fff', sw: 0.9, so: 0.6 });
    s.push(...[2, 1, 0].filter((i) => tones[i]).map(paint));
    return { shapes: s, focus: [cx, cy] };
  };
}

/** Fallback for labs without a style: concentric orbits with capability moons. */
const orbit: Motif = (r, p, d, c) => {
  const x = between(r, 50, 110);
  const y = between(r, 36, 60);
  const sq = between(r, 0.46, 0.68);
  const tilt = between(r, -26, 26);
  const rings = Math.max(1, Math.round(d * 8));
  const s: Shape[] = [dust(r, 16, 0.55)];
  for (let i = 1; i <= rings; i++) s.push({ k: 'e', x, y, rx: 9 + i * 9.5, ry: (9 + i * 9.5) * sq, rot: tilt, stroke: '#fff', sw: i === rings ? 1.2 : 0.75, so: Math.max(0.14, 0.6 - i * 0.05) });
  s.push({ k: 'c', x, y, r: 11, fill: '#fff', fo: 0.16 }, { k: 'c', x, y, r: 6.5, fill: '#fff', fo: 0.95 });
  for (let i = 0; i < c; i++) {
    const a = between(r, 0, TAU);
    const ring = 9 + int(r, 1, rings) * 9.5;
    s.push({ k: 'c', x: x + Math.cos(a) * ring, y: y + Math.sin(a) * ring * sq, r: 3, fill: p.light });
  }
  return { shapes: s, focus: [x, y] };
};

const MOTIFS: Record<Exclude<ArtStyle, 'emblem'>, Motif> = {
  rosette,
  strata,
  sparkle,
  singularity,
  lissajous,
  pixels,
  abyss,
  honeycomb,
  moon,
  circuit,
  halftone,
  waveform,
  radar,
  lowpoly,
  prism,
  network,
  flow,
  orbit,
};

/** Labs without a hand-picked recipe, including ones added later, still get a stable look of their own. */
function recipeFor(labKey: string): EmblemRecipe {
  const configured = LABS.find((l) => l.key === labKey)?.emblem;
  if (configured) return configured;
  const h = hash(`lab:${labKey}`);
  return { glyph: GLYPHS[h % GLYPHS.length], layout: LAYOUTS[Math.floor(h / GLYPHS.length) % LAYOUTS.length] };
}

function palette(hex: string, r: Rand): Palette {
  const [h0, s0, l0] = hexToHsl(hex);
  const h = h0 + between(r, -14, 14);
  const s = Math.max(0.14, s0);
  const l = l0 + between(r, -0.05, 0.05);
  return {
    hue: h,
    from: hslHex(h - 6, s * 0.95, clamp(l + 0.16, 0.3, 0.78)),
    to: hslHex(h + 10, Math.min(1, s * 1.05), clamp(l - 0.24, 0.08, 0.4)),
    glow: hslHex(h - 18, s, 0.84),
    light: hslHex(h, s * 0.6, 0.93),
    accent: hslHex(h + 28, Math.min(1, s * 1.1), 0.72),
    mid: hslHex(h, s, clamp(l, 0.3, 0.6)),
    deep: hslHex(h + 6, s, clamp(l - 0.36, 0.05, 0.22)),
  };
}

/** Holo rares get a burst of rays behind the art; rares and holos get a few extra glints on top. */
function rarityLayers(rarity: Model['rarity'], r: Rand, [fx, fy]: [number, number]): { behind: Shape[]; front: Shape[] } {
  const behind: Shape[] = [];
  const front: Shape[] = [];
  if (rarity === 'holo') {
    let rays = '';
    const rot = between(r, 0, TAU);
    for (let i = 0; i < 18; i++) {
      const a = rot + (i * TAU) / 18;
      rays += line([[fx, fy], [fx + Math.cos(a - 0.05) * 140, fy + Math.sin(a - 0.05) * 140], [fx + Math.cos(a + 0.05) * 140, fy + Math.sin(a + 0.05) * 140]]) + 'Z';
    }
    behind.push({ k: 'p', d: rays, fill: '#fff', fo: 0.08 });
  }
  if (rarity === 'holo' || rarity === 'rare') {
    let glints = '';
    for (let i = 0; i < 3; i++) glints += star(between(r, 8, 152), between(r, 8, 88), between(r, 2, 3.4));
    front.push({ k: 'p', d: glints, fill: '#fff', fo: 0.9 });
  }
  return { behind, front };
}

/**
 * Card art generated from the model: the lab picks the style, context size sets the density,
 * capability count sets the intricacy, and the model key seeds the layout and color shift.
 */
export function cardArt(m: ArtInput, color: string): Art {
  const seed = hash(m.key);
  const r = rng(seed);
  const style = STYLE_BY_LAB[m.lab] ?? 'emblem';
  const density = clamp(Math.log2((m.context ?? 4096) / 4096) / 8, 0, 1);
  const complexity = [m.reasoning, m.toolCall, m.input.includes('image') || m.attachment, m.structuredOutput].filter(Boolean).length;
  const p = palette(color, r);
  const angle = f(between(r, 110, 200));
  const drawn = (style === 'emblem' ? emblem(recipeFor(m.lab)) : MOTIFS[style])(r, p, density, complexity);
  const [h, s] = hexToHsl(color);
  const extra = rarityLayers(m.rarity, r, drawn.focus);
  return {
    id: `a${seed.toString(36)}`,
    style,
    angle,
    from: drawn.dark ? hslHex(h, s * 0.5, 0.22) : p.from,
    to: drawn.dark ? hslHex(h, s * 0.5, 0.05) : p.to,
    glow: p.glow,
    gx: f((drawn.focus[0] / ART_W) * 100),
    gy: f((drawn.focus[1] / ART_H) * 100),
    pattern: drawn.pattern ?? null,
    shapes: [...extra.behind, ...drawn.shapes, ...extra.front].map(roundShape),
  };
}

function roundShape(s: Shape): Shape {
  if (s.k === 'c') return { ...s, x: f(s.x), y: f(s.y), r: f(s.r) };
  if (s.k === 'e') return { ...s, x: f(s.x), y: f(s.y), rx: f(s.rx), ry: f(s.ry), rot: s.rot == null ? undefined : f(s.rot) };
  return s;
}

const paintAttrs = (s: Paint) =>
  [
    `fill="${s.fill ?? 'none'}"`,
    s.fo != null && `fill-opacity="${s.fo}"`,
    s.stroke && `stroke="${s.stroke}"`,
    s.sw != null && `stroke-width="${s.sw}"`,
    s.so != null && `stroke-opacity="${s.so}"`,
    s.dash && `stroke-dasharray="${s.dash}"`,
  ]
    .filter(Boolean)
    .join(' ');

/** Standalone SVG markup, for share images that can't run React components. */
export function artToSvg(a: Art, width = ART_W * 4, height = ART_H * 4): string {
  const body = a.shapes
    .map((s) => {
      if (s.k === 'c') return `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" ${paintAttrs(s)}/>`;
      if (s.k === 'e') return `<ellipse cx="${s.x}" cy="${s.y}" rx="${s.rx}" ry="${s.ry}"${s.rot ? ` transform="rotate(${s.rot} ${s.x} ${s.y})"` : ''} ${paintAttrs(s)}/>`;
      return `<path d="${s.d}" ${paintAttrs(s)}/>`;
    })
    .join('');
  const pattern = a.pattern
    ? `<pattern id="${a.id}-t" patternUnits="userSpaceOnUse" width="${f(a.pattern.w)}" height="${f(a.pattern.h)}"><path d="${a.pattern.d}" ${a.pattern.mode === 'fill' ? 'fill="#fff"' : 'fill="none" stroke="#fff" stroke-width="0.6"'}/></pattern>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ART_W} ${ART_H}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="${a.id}-bg" gradientTransform="rotate(${a.angle} .5 .5)"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient>` +
    `<radialGradient id="${a.id}-glow" cx="${a.gx}%" cy="${a.gy}%" r="70%"><stop offset="0" stop-color="${a.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${a.glow}" stop-opacity="0"/></radialGradient>${pattern}</defs>` +
    `<rect width="${ART_W}" height="${ART_H}" fill="url(#${a.id}-bg)"/><rect width="${ART_W}" height="${ART_H}" fill="url(#${a.id}-glow)"/>` +
    (a.pattern ? `<rect width="${ART_W}" height="${ART_H}" fill="url(#${a.id}-t)" opacity="${a.pattern.o}"/>` : '') +
    body +
    `</svg>`
  );
}

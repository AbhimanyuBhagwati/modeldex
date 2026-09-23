import { hexToHsl, hslHex } from '@/lib/color';
import { SPECIES, seedOf, type BodyPlan, type Creature } from '@/lib/terrarium';

/**
 * Every creature is drawn in code, at any size, on a 2D canvas. The origin is where a ground creature's feet
 * touch the ground, or a flyer's middle. `r` is the body radius in whatever units the caller has scaled to.
 */

export type Drawable = Pick<Creature, 'key' | 'type' | 'reasoning' | 'tools' | 'eyes' | 'ears' | 'voice' | 'wit' | 'holo' | 'family' | 'seed' | 'size'>;

export interface Look {
  body: string;
  light: string;
  dark: string;
  belly: string;
  accent: string;
  wing: string;
  pattern: 'spots' | 'stripes' | 'speckles' | 'plain';
  legs: 2 | 4 | 6;
}

export interface Pose {
  /** Seconds since the world started. */
  t: number;
  dir: 1 | -1;
  /** Walk cycle, radians. */
  phase: number;
  moving: boolean;
  asleep: boolean;
  /** For birds and bats: in the air rather than perched or hanging. */
  flying: boolean;
  /** An older generation: grey brows, slower step. */
  elder: boolean;
  /** No motion at all (reduced motion). */
  still?: boolean;
}

const TAU = Math.PI * 2;
const PATTERNS: Look['pattern'][] = ['spots', 'stripes', 'speckles', 'plain'];

/** A lab's colors, shifted a little per family so relatives look alike and strangers don't. */
export function lookFor(c: Pick<Creature, 'key' | 'lab' | 'seed' | 'family'>, labColor: string): Look {
  const [h0, s0, l0] = hexToHsl(labColor);
  const kin = c.family ? seedOf(c.family.line) : c.seed;
  const h = h0 + (kin - 0.5) * 26;
  const s = Math.max(0.42, Math.min(0.85, s0 || 0.5));
  const l = Math.min(0.6, Math.max(0.42, l0));
  const legs = ([2, 4, 6] as const)[Math.floor(seedOf(`${c.key}:legs`) * 3)];
  return {
    body: hslHex(h, s, l),
    light: hslHex(h, s * 0.85, Math.min(0.86, l + 0.24)),
    dark: hslHex(h, s * 0.9, Math.max(0.12, l - 0.28)),
    belly: hslHex(h + 10, s * 0.45, 0.88),
    accent: hslHex(h + 140 + kin * 60, 0.78, 0.62),
    wing: hslHex(h + 32, Math.min(0.9, s + 0.1), Math.min(0.72, l + 0.14)),
    pattern: PATTERNS[Math.floor(seedOf(c.lab) * PATTERNS.length)],
    legs,
  };
}

/** Body radius in world units: bigger context, bigger creature. */
export const radiusOf = (c: Pick<Creature, 'type' | 'size'>) => {
  const base = { mushroom: 7, ant: 3.6, butterfly: 7, dragonfly: 6.5, bird: 6.5, bat: 6, owl: 8, beetle: 6, snail: 6.5, hedgehog: 7, golem: 9, walker: 7.5 }[SPECIES[c.type].plan];
  return base * (0.75 + c.size * 0.9);
};

/** Where to hit-test a creature, relative to its origin. */
export function hitCircle(c: Drawable, r: number, pose: Pick<Pose, 'flying'>): { x: number; y: number; r: number } {
  const plan = SPECIES[c.type].plan;
  if (plan === 'butterfly' || plan === 'dragonfly' || ((plan === 'bird' || plan === 'bat') && pose.flying)) return { x: 0, y: 0, r: r * 1.5 };
  if (plan === 'bat') return { x: 0, y: r * 1.1, r: r * 1.4 };
  return { x: 0, y: -r * 1.2, r: r * 1.5 };
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, look: Look) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15);
  g.addColorStop(0, look.light);
  g.addColorStop(0.55, look.body);
  g.addColorStop(1, look.dark);
  return g;
}

function shadow(ctx: CanvasRenderingContext2D, w: number, alpha = 0.2) {
  ctx.fillStyle = `rgba(20, 18, 12, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, w, w * 0.26, 0, 0, TAU);
  ctx.fill();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, look: 1 | -1, blink: boolean, asleep: boolean) {
  if (asleep || blink) {
    ctx.strokeStyle = '#1b1712';
    ctx.lineWidth = R * 0.35;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y - R * 0.2, R * 0.8, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#fffdf6';
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#17130e';
  ctx.beginPath();
  ctx.arc(x + look * R * 0.28, y + R * 0.08, R * 0.58, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + look * R * 0.1, y - R * 0.22, R * 0.2, 0, TAU);
  ctx.fill();
}

function pattern(ctx: CanvasRenderingContext2D, look: Look, cx: number, cy: number, rx: number, ry: number, seed: number) {
  if (look.pattern === 'plain') return;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = look.dark;
  ctx.strokeStyle = look.dark;
  ctx.globalAlpha = 0.22;
  if (look.pattern === 'spots') {
    for (let i = 0; i < 5; i++) {
      const a = seed * 40 + i * 1.9;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rx * 0.55, cy - ry * 0.25 + Math.sin(a) * ry * 0.4, rx * (0.13 + 0.06 * ((i * 7) % 3)), 0, TAU);
      ctx.fill();
    }
  } else if (look.pattern === 'stripes') {
    ctx.lineWidth = rx * 0.14;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * rx * 0.38 - rx * 0.1, cy - ry);
      ctx.quadraticCurveTo(cx + i * rx * 0.38 + rx * 0.12, cy, cx + i * rx * 0.38 - rx * 0.05, cy + ry);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 14; i++) {
      const a = seed * 90 + i * 2.39996;
      const d = Math.sqrt((i + 0.5) / 14);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rx * d * 0.85, cy + Math.sin(a) * ry * d * 0.85, rx * 0.05, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** An iridescent sheen for holo rares, drifting with time. */
function sheen(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, t: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.clip();
  const shift = (t * 0.25) % 1;
  const g = ctx.createLinearGradient(cx - rx * 2 + shift * rx * 4, cy - ry, cx + shift * rx * 4, cy + ry);
  ['rgba(255,90,170,0)', 'rgba(255,214,90,.45)', 'rgba(90,255,200,.4)', 'rgba(90,170,255,.45)', 'rgba(210,110,255,0)'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = g;
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
  ctx.restore();
}

/** Crown for the top 10% on its leaderboard, a silver halo for the top 25%. */
function honors(ctx: CanvasRenderingContext2D, wit: number | null, x: number, y: number, r: number, t: number) {
  if (wit == null || wit < 75) return;
  if (wit >= 90) {
    const w = r * 0.62;
    const h = r * 0.46;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 1.3) * 0.05);
    ctx.shadowColor = 'rgba(255, 210, 90, 0.9)';
    ctx.shadowBlur = r * 0.6;
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(1, '#d99a12');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w, -h * 0.55);
    ctx.lineTo(-w * 0.5, -h * 0.2);
    ctx.lineTo(0, -h);
    ctx.lineTo(w * 0.5, -h * 0.2);
    ctx.lineTo(w, -h * 0.55);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8384f';
    ctx.beginPath();
    ctx.arc(0, -h * 0.35, r * 0.09, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(225, 232, 245, 0.9)';
  ctx.shadowColor = 'rgba(210, 225, 255, 0.9)';
  ctx.shadowBlur = r * 0.4;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.15, r * 0.55, r * 0.16, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

const blinking = (t: number, seed: number) => (t + seed * 7) % 4.3 < 0.13;

function walker(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  const legLen = R * 0.6;
  const bob = p.moving && !p.still ? -Math.abs(Math.sin(p.phase)) * R * 0.1 : 0;
  const breathe = p.still ? 0 : Math.sin(p.t * (p.asleep ? 1.2 : 2.4) + c.seed * 9) * R * 0.03;
  const by = -legLen - R * 0.88 + bob;
  shadow(ctx, R * 1.05);
  // Legs, in pairs, swinging opposite each other.
  const pairs = look.legs / 2;
  ctx.strokeStyle = look.dark;
  ctx.lineCap = 'round';
  ctx.lineWidth = R * 0.24;
  for (let i = 0; i < pairs; i++) {
    for (const side of [0, 1]) {
      const lx = (pairs === 1 ? (side ? 0.4 : -0.4) : -0.62 + (1.24 * (i * 2 + side)) / (look.legs - 1)) * R;
      const swing = p.moving && !p.still ? Math.sin(p.phase + (i + side) * Math.PI) * R * 0.3 : 0;
      ctx.globalAlpha = side ? 1 : 0.75;
      ctx.beginPath();
      ctx.moveTo(lx, by + R * 0.6);
      ctx.lineTo(lx + swing, -R * 0.06);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // Ears for audio in, antenna for tools, a glowing horn for reasoning.
  if (c.ears) {
    ctx.fillStyle = look.dark;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * R * 0.62, by - R * 0.72, R * 0.2, R * 0.34, s * 0.5, 0, TAU);
      ctx.fill();
    }
  }
  if (c.tools) {
    const sway = p.still ? 0 : Math.sin(p.t * 3 + c.seed * 5) * R * 0.12;
    ctx.strokeStyle = look.dark;
    ctx.lineWidth = R * 0.1;
    ctx.beginPath();
    ctx.moveTo(-p.dir * R * 0.25, by - R * 0.9);
    ctx.quadraticCurveTo(-p.dir * R * 0.35, by - R * 1.5, -p.dir * R * 0.1 + sway, by - R * 1.75);
    ctx.stroke();
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.arc(-p.dir * R * 0.1 + sway, by - R * 1.75, R * 0.16, 0, TAU);
    ctx.fill();
  }
  if (c.reasoning) {
    const glow = p.still ? 0.6 : 0.45 + 0.35 * Math.sin(p.t * 2 + c.seed * 4);
    ctx.save();
    ctx.shadowColor = look.accent;
    ctx.shadowBlur = R * 0.9 * glow;
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.moveTo(p.dir * R * 0.05 - R * 0.2, by - R * 0.88);
    ctx.quadraticCurveTo(p.dir * R * 0.25, by - R * 1.3, p.dir * R * 0.3, by - R * 1.55);
    ctx.quadraticCurveTo(p.dir * R * 0.35, by - R * 1.15, p.dir * R * 0.05 + R * 0.25, by - R * 0.86);
    ctx.fill();
    ctx.restore();
  }
  // Generations grow spikes along the back.
  const spikes = Math.min(4, c.family?.stage ?? 0);
  if (spikes) {
    ctx.fillStyle = look.dark;
    for (let i = 0; i < spikes; i++) {
      const a = -Math.PI / 2 - (Math.PI / 2) * (0.2 + (0.6 * (i + 1)) / (spikes + 1));
      const [nx, ny] = [p.dir * Math.cos(a), Math.sin(a)];
      const x = nx * R * 1.05;
      const y = by + ny * R;
      ctx.beginPath();
      ctx.moveTo(x - ny * R * 0.16, y + nx * R * 0.16);
      ctx.lineTo(x + nx * R * 0.38, y + ny * R * 0.38);
      ctx.lineTo(x + ny * R * 0.16, y - nx * R * 0.16);
      ctx.fill();
    }
  }
  const rx = R * 1.1;
  const ry = R + breathe;
  ctx.fillStyle = radial(ctx, 0, by, R, look);
  ctx.beginPath();
  ctx.ellipse(0, by, rx, ry, 0, 0, TAU);
  ctx.fill();
  pattern(ctx, look, 0, by, rx, ry, c.seed);
  ctx.fillStyle = look.belly;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.ellipse(p.dir * R * 0.18, by + R * 0.38, R * 0.62, R * 0.46, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (c.holo) sheen(ctx, 0, by, rx, ry, p.t);
  const er = R * (c.eyes ? 0.34 : 0.25);
  const blink = !p.still && blinking(p.t, c.seed);
  eye(ctx, p.dir * R * 0.12, by - R * 0.2, er, p.dir, blink, p.asleep);
  eye(ctx, p.dir * R * 0.62, by - R * 0.22, er * 0.9, p.dir, blink, p.asleep);
  if (p.elder) {
    ctx.strokeStyle = '#eceae3';
    ctx.lineWidth = R * 0.12;
    ctx.lineCap = 'round';
    for (const ex of [0.12, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(p.dir * R * (ex - 0.2), by - R * 0.52);
      ctx.lineTo(p.dir * R * (ex + 0.18), by - R * 0.47);
      ctx.stroke();
    }
  }
  // Mouth: a smile, or an open "o" when it's singing.
  ctx.strokeStyle = '#2a1f14';
  ctx.lineWidth = R * 0.09;
  ctx.beginPath();
  if (c.voice && !p.asleep && !p.still && (p.t + c.seed * 5) % 3 < 1) {
    ctx.fillStyle = '#2a1f14';
    ctx.ellipse(p.dir * R * 0.45, by + R * 0.22, R * 0.1, R * 0.13, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.arc(p.dir * R * 0.42, by + R * 0.12, R * 0.16, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
  honors(ctx, c.wit, p.dir * R * 0.1, by - R * 0.92, R, p.t);
}

function butterfly(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  const flap = p.still ? 0.8 : p.asleep ? 0.12 : 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(p.t * 11 + c.seed * 20));
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s * flap, 1);
    const g = ctx.createLinearGradient(0, -R, R * 1.4, R);
    g.addColorStop(0, look.wing);
    g.addColorStop(1, look.accent);
    ctx.fillStyle = g;
    ctx.strokeStyle = look.dark;
    ctx.lineWidth = R * 0.08;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.1);
    ctx.bezierCurveTo(R * 0.6, -R * 1.5, R * 1.7, -R * 1.2, R * 1.35, -R * 0.1);
    ctx.bezierCurveTo(R * 1.1, R * 0.35, R * 0.4, R * 0.2, 0, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, R * 0.05);
    ctx.bezierCurveTo(R * 0.9, R * 0.1, R * 1.1, R * 1.1, R * 0.45, R * 1.05);
    ctx.bezierCurveTo(R * 0.2, R * 1, R * 0.05, R * 0.5, 0, R * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffaf0';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(R * 0.92, -R * 0.55, R * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = look.dark;
    ctx.beginPath();
    ctx.arc(R * 0.92, -R * 0.55, R * 0.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = look.dark;
  ctx.beginPath();
  ctx.ellipse(0, R * 0.1, R * 0.16, R * 0.75, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = R * 0.07;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.55);
    ctx.quadraticCurveTo(s * R * 0.25, -R * 1.2, s * R * 0.5, -R * 1.25);
    ctx.stroke();
  }
  if (c.holo) sheen(ctx, 0, 0, R * 1.4, R * 1.2, p.t);
  honors(ctx, c.wit, 0, -R * 0.95, R * 0.9, p.t);
}

function dragonfly(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  const buzz = p.still ? 0 : Math.sin(p.t * 60 + c.seed * 9);
  ctx.save();
  ctx.scale(p.dir, 1);
  ctx.fillStyle = 'rgba(225, 245, 255, 0.42)';
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = R * 0.05;
  for (const [x, a] of [
    [R * 0.25, -0.35],
    [-R * 0.15, -0.2],
  ] as const) {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(x, -R * 0.1);
      ctx.rotate(s * (a + buzz * 0.18) - (s < 0 ? Math.PI : 0));
      ctx.beginPath();
      ctx.ellipse(R * 0.9, 0, R * 0.95, R * 0.24, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  const g = ctx.createLinearGradient(-R * 2, 0, R, 0);
  g.addColorStop(0, look.dark);
  g.addColorStop(1, look.body);
  ctx.fillStyle = g;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(-R * 0.35 * i, 0, R * 0.22 - i * R * 0.015, R * 0.14, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = radial(ctx, R * 0.45, 0, R * 0.35, look);
  ctx.beginPath();
  ctx.ellipse(R * 0.4, 0, R * 0.36, R * 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.accent;
  ctx.beginPath();
  ctx.arc(R * 0.82, -R * 0.08, R * 0.24, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(R * 0.88, -R * 0.16, R * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();
  honors(ctx, c.wit, p.dir * R * 0.8, -R * 0.4, R * 0.8, p.t);
}

function bird(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  const cy = p.flying ? 0 : -R * 1.05;
  if (!p.flying) shadow(ctx, R * 0.8, 0.14);
  ctx.save();
  ctx.translate(0, cy);
  ctx.scale(p.dir, 1);
  // Tail.
  ctx.fillStyle = look.dark;
  ctx.beginPath();
  ctx.moveTo(-R * 0.7, -R * 0.1);
  ctx.lineTo(-R * 1.55, -R * 0.45);
  ctx.lineTo(-R * 1.45, R * 0.2);
  ctx.closePath();
  ctx.fill();
  if (!p.flying) {
    ctx.strokeStyle = '#6b4a24';
    ctx.lineWidth = R * 0.1;
    for (const x of [-0.15, 0.2]) {
      ctx.beginPath();
      ctx.moveTo(x * R, R * 0.7);
      ctx.lineTo(x * R, R * 1.05);
      ctx.stroke();
    }
  }
  ctx.fillStyle = radial(ctx, 0, 0, R, look);
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 1.05, R * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.belly;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(R * 0.25, R * 0.28, R * 0.55, R * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Wing: folded when perched, beating in flight.
  const beat = p.flying && !p.still ? Math.sin(p.t * 14 + c.seed * 10) : 0.2;
  ctx.fillStyle = look.dark;
  ctx.save();
  ctx.translate(-R * 0.1, -R * 0.1);
  ctx.rotate(p.flying ? -0.4 - beat * 0.7 : 0.25);
  ctx.beginPath();
  ctx.ellipse(-R * 0.35, 0, R * (p.flying ? 0.95 : 0.7), R * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f2a33a';
  ctx.beginPath();
  ctx.moveTo(R * 0.95, -R * 0.2);
  ctx.lineTo(R * 1.45, -R * 0.05);
  ctx.lineTo(R * 0.95, R * 0.1);
  ctx.closePath();
  ctx.fill();
  if (c.holo) sheen(ctx, 0, 0, R * 1.05, R * 0.82, p.t);
  eye(ctx, R * 0.58, -R * 0.28, R * 0.2, 1, !p.still && blinking(p.t, c.seed), p.asleep);
  ctx.restore();
  honors(ctx, c.wit, p.dir * R * 0.2, cy - R * 0.8, R * 0.85, p.t);
}

function bat(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  if (!p.flying) {
    // Hanging upside down from a branch: origin is the branch.
    const swing = p.still ? 0 : Math.sin(p.t * 1.1 + c.seed * 6) * 0.08;
    ctx.save();
    ctx.rotate(swing);
    ctx.strokeStyle = look.dark;
    ctx.lineWidth = R * 0.12;
    ctx.beginPath();
    ctx.moveTo(-R * 0.2, 0);
    ctx.lineTo(-R * 0.2, R * 0.35);
    ctx.moveTo(R * 0.2, 0);
    ctx.lineTo(R * 0.2, R * 0.35);
    ctx.stroke();
    ctx.fillStyle = radial(ctx, 0, R * 1.1, R * 0.8, look);
    ctx.beginPath();
    ctx.moveTo(0, R * 0.3);
    ctx.bezierCurveTo(R * 0.95, R * 0.35, R * 0.8, R * 1.7, 0, R * 1.9);
    ctx.bezierCurveTo(-R * 0.8, R * 1.7, -R * 0.95, R * 0.35, 0, R * 0.3);
    ctx.fill();
    ctx.fillStyle = look.dark;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * R * 0.2, R * 1.75);
      ctx.lineTo(s * R * 0.45, R * 2.3);
      ctx.lineTo(s * R * 0.55, R * 1.6);
      ctx.fill();
    }
    eye(ctx, -R * 0.22, R * 1.55, R * 0.13, 1, true, true);
    eye(ctx, R * 0.22, R * 1.55, R * 0.13, 1, true, true);
    ctx.restore();
    return;
  }
  const beat = p.still ? 0.5 : Math.sin(p.t * 12 + c.seed * 8);
  ctx.fillStyle = look.dark;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    ctx.rotate(-beat * 0.45);
    ctx.beginPath();
    ctx.moveTo(R * 0.3, -R * 0.2);
    ctx.quadraticCurveTo(R * 1.2, -R * 0.9, R * 2.1, -R * 0.35);
    ctx.quadraticCurveTo(R * 1.8, -R * 0.05, R * 1.65, R * 0.25);
    ctx.quadraticCurveTo(R * 1.35, 0, R * 1.15, R * 0.3);
    ctx.quadraticCurveTo(R * 0.9, R * 0.05, R * 0.3, R * 0.25);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = radial(ctx, 0, 0, R * 0.6, look);
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.55, R * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * R * 0.15, -R * 0.5);
    ctx.lineTo(s * R * 0.42, -R * 1.05);
    ctx.lineTo(s * R * 0.5, -R * 0.35);
    ctx.fill();
  }
  eye(ctx, -R * 0.2, -R * 0.12, R * 0.14, 1, false, false);
  eye(ctx, R * 0.2, -R * 0.12, R * 0.14, 1, false, false);
  honors(ctx, c.wit, 0, -R * 0.75, R * 0.7, p.t);
}

function mushroom(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number, glow: number) {
  const sway = p.still ? 0 : Math.sin(p.t * 0.9 + c.seed * 12) * 0.05;
  shadow(ctx, R * 0.9, 0.16);
  ctx.save();
  ctx.rotate(sway);
  const h = R * (1.4 + c.seed * 0.8);
  const stem = ctx.createLinearGradient(-R * 0.3, 0, R * 0.3, 0);
  stem.addColorStop(0, '#e9dfc9');
  stem.addColorStop(1, '#fbf6ea');
  ctx.fillStyle = stem;
  ctx.beginPath();
  ctx.moveTo(-R * 0.34, 0);
  ctx.quadraticCurveTo(-R * 0.22, -h * 0.6, -R * 0.26, -h);
  ctx.lineTo(R * 0.26, -h);
  ctx.quadraticCurveTo(R * 0.22, -h * 0.6, R * 0.34, 0);
  ctx.closePath();
  ctx.fill();
  if (glow > 0) {
    ctx.shadowColor = look.light;
    ctx.shadowBlur = R * 2.2 * glow;
  }
  ctx.fillStyle = radial(ctx, 0, -h, R * 1.1, look);
  ctx.beginPath();
  ctx.moveTo(-R * 1.25, -h + R * 0.12);
  ctx.bezierCurveTo(-R * 1.2, -h - R * 1.25, R * 1.2, -h - R * 1.25, R * 1.25, -h + R * 0.12);
  ctx.quadraticCurveTo(0, -h - R * 0.12, -R * 1.25, -h + R * 0.12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 252, 240, 0.9)';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (1.15 + 0.7 * ((i + c.seed * 3) % 4) / 4);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * 0.8, -h + Math.sin(a) * R * 0.75, R * (0.12 + 0.06 * (i % 2)), 0, TAU);
    ctx.fill();
  }
  if (c.holo) sheen(ctx, 0, -h - R * 0.4, R * 1.25, R * 0.8, p.t);
  ctx.restore();
  honors(ctx, c.wit, 0, -h - R * 0.95, R * 0.8, p.t);
}

function ant(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  shadow(ctx, R * 1.8, 0.14);
  ctx.save();
  ctx.scale(p.dir, 1);
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = R * 0.18;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    for (const side of [0, 1]) {
      const swing = p.moving && !p.still ? Math.sin(p.phase * 1.4 + i + side * Math.PI) * R * 0.35 : 0;
      ctx.beginPath();
      ctx.moveTo(-R * 0.1 + i * R * 0.25, -R * 0.9);
      ctx.lineTo(-R * 0.55 + i * R * 0.55 + swing, 0);
      ctx.stroke();
    }
  }
  ctx.fillStyle = radial(ctx, 0, -R, R, look);
  for (const [x, rr] of [
    [-R * 0.95, R * 0.62],
    [0, R * 0.38],
    [R * 0.72, R * 0.46],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, -R * 1.05, rr, rr * 0.85, 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineWidth = R * 0.1;
  ctx.beginPath();
  ctx.moveTo(R * 0.9, -R * 1.4);
  ctx.quadraticCurveTo(R * 1.2, -R * 2.1, R * 1.6, -R * 2);
  ctx.stroke();
  eye(ctx, R * 0.92, -R * 1.15, R * 0.14, 1, false, p.asleep);
  ctx.restore();
  honors(ctx, c.wit, p.dir * R * 0.7, -R * 1.55, R * 0.8, p.t);
}

function owl(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  const hop = p.moving && !p.still ? -Math.abs(Math.sin(p.phase * 0.7)) * R * 0.45 : 0;
  shadow(ctx, R * 0.9);
  ctx.save();
  ctx.translate(0, hop);
  const cy = -R * 1.15;
  ctx.fillStyle = '#e8a63c';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * R * 0.35, -R * 0.08, R * 0.22, R * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = look.dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * R * 0.35, cy - R * 0.75);
    ctx.lineTo(s * R * 0.72, cy - R * 1.35);
    ctx.lineTo(s * R * 0.85, cy - R * 0.55);
    ctx.fill();
  }
  ctx.fillStyle = radial(ctx, 0, cy, R, look);
  ctx.beginPath();
  ctx.ellipse(0, cy, R * 0.95, R * 1.1, 0, 0, TAU);
  ctx.fill();
  pattern(ctx, look, 0, cy + R * 0.35, R * 0.6, R * 0.6, c.seed);
  if (c.holo) sheen(ctx, 0, cy, R * 0.95, R * 1.1, p.t);
  for (const s of [-1, 1]) {
    ctx.fillStyle = look.light;
    ctx.beginPath();
    ctx.arc(s * R * 0.4, cy - R * 0.2, R * 0.42, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = R * 0.08;
    ctx.stroke();
    eye(ctx, s * R * 0.4, cy - R * 0.2, R * 0.3, p.dir, !p.still && blinking(p.t, c.seed + 0.5), p.asleep);
  }
  ctx.fillStyle = '#e8a63c';
  ctx.beginPath();
  ctx.moveTo(-R * 0.12, cy + R * 0.12);
  ctx.lineTo(R * 0.12, cy + R * 0.12);
  ctx.lineTo(0, cy + R * 0.38);
  ctx.fill();
  ctx.restore();
  honors(ctx, c.wit, 0, cy - R * 1.05 + hop, R, p.t);
}

function beetle(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  shadow(ctx, R * 1.2);
  ctx.save();
  ctx.scale(p.dir, 1);
  ctx.strokeStyle = '#1d1a14';
  ctx.lineWidth = R * 0.14;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    for (const side of [0, 1]) {
      const swing = p.moving && !p.still ? Math.sin(p.phase * 1.3 + i * 2 + side * Math.PI) * R * 0.3 : 0;
      ctx.beginPath();
      ctx.moveTo(-R * 0.5 + i * R * 0.5, -R * 0.6);
      ctx.lineTo(-R * 0.8 + i * R * 0.7 + swing, 0);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#1f1b16';
  ctx.beginPath();
  ctx.arc(R * 1.05, -R * 0.7, R * 0.38, 0, TAU);
  ctx.fill();
  ctx.fillStyle = radial(ctx, 0, -R * 0.85, R * 1.1, look);
  ctx.beginPath();
  ctx.ellipse(0, -R * 0.85, R * 1.15, R * 0.78, 0, Math.PI, TAU);
  ctx.lineTo(R * 1.15, -R * 0.62);
  ctx.quadraticCurveTo(0, -R * 0.3, -R * 1.15, -R * 0.62);
  ctx.fill();
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = R * 0.07;
  ctx.beginPath();
  ctx.moveTo(R * 0.9, -R * 1.2);
  ctx.quadraticCurveTo(0, -R * 1.05, -R * 1.05, -R * 0.75);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.25, -R * 1.3, R * 0.42, R * 0.12, -0.15, 0, TAU);
  ctx.fill();
  if (c.holo) sheen(ctx, 0, -R * 0.85, R * 1.15, R * 0.78, p.t);
  ctx.restore();
  honors(ctx, c.wit, 0, -R * 1.65, R * 0.85, p.t);
}

function snail(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  shadow(ctx, R * 1.3, 0.15);
  ctx.save();
  ctx.scale(p.dir, 1);
  const stretch = p.moving && !p.still ? Math.sin(p.phase * 0.5) * R * 0.12 : 0;
  ctx.fillStyle = look.belly;
  ctx.beginPath();
  ctx.moveTo(-R * 1.3, 0);
  ctx.quadraticCurveTo(-R * 1.2, -R * 0.55, 0, -R * 0.5);
  ctx.lineTo(R * 1.1 + stretch, -R * 0.75);
  ctx.quadraticCurveTo(R * 1.55 + stretch, -R * 0.5, R * 1.35 + stretch, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = look.belly;
  ctx.lineWidth = R * 0.1;
  const bob = p.still ? 0 : Math.sin(p.t * 2 + c.seed * 3) * R * 0.08;
  for (const dx of [0.95, 1.2]) {
    ctx.beginPath();
    ctx.moveTo(R * dx + stretch, -R * 0.7);
    ctx.lineTo(R * (dx + 0.12) + stretch, -R * 1.3 + bob);
    ctx.stroke();
    ctx.fillStyle = '#231d15';
    ctx.beginPath();
    ctx.arc(R * (dx + 0.12) + stretch, -R * 1.3 + bob, R * 0.1, 0, TAU);
    ctx.fill();
  }
  // Shell: a spiral, like time winding round.
  const cx = -R * 0.2;
  const cy = -R * 1.15;
  ctx.fillStyle = radial(ctx, cx, cy, R, look);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.95, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = R * 0.09;
  ctx.beginPath();
  for (let a = 0; a < TAU * 2.6; a += 0.15) {
    const rr = R * 0.9 * Math.exp(-a * 0.17);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (a === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (c.holo) sheen(ctx, cx, cy, R * 0.95, R * 0.95, p.t);
  ctx.restore();
  honors(ctx, c.wit, -p.dir * R * 0.2, -R * 2.1, R * 0.8, p.t);
}

function hedgehog(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  shadow(ctx, R * 1.1);
  ctx.save();
  ctx.scale(p.dir, 1);
  const cy = -R * 0.75;
  ctx.fillStyle = look.dark;
  const n = 11;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (Math.PI * i) / n;
    const rr = i % 2 ? R * 1.35 : R * 1.02;
    ctx.lineTo(Math.cos(a) * rr * 1.05 - R * 0.1, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = radial(ctx, 0, cy, R, look);
  ctx.beginPath();
  ctx.ellipse(-R * 0.05, cy, R * 1.05, R * 0.78, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.belly;
  ctx.beginPath();
  ctx.moveTo(R * 0.55, cy - R * 0.3);
  ctx.quadraticCurveTo(R * 1.5, cy, R * 1.3, cy + R * 0.3);
  ctx.quadraticCurveTo(R * 0.7, cy + R * 0.6, R * 0.4, cy + R * 0.4);
  ctx.fill();
  ctx.fillStyle = '#231d15';
  ctx.beginPath();
  ctx.arc(R * 1.33, cy + R * 0.18, R * 0.12, 0, TAU);
  ctx.fill();
  eye(ctx, R * 0.85, cy - R * 0.05, R * 0.14, 1, !p.still && blinking(p.t, c.seed), p.asleep);
  ctx.strokeStyle = look.dark;
  ctx.lineWidth = R * 0.18;
  ctx.lineCap = 'round';
  for (const x of [-0.5, 0.5]) {
    const swing = p.moving && !p.still ? Math.sin(p.phase + x * 3) * R * 0.2 : 0;
    ctx.beginPath();
    ctx.moveTo(x * R, cy + R * 0.6);
    ctx.lineTo(x * R + swing, 0);
    ctx.stroke();
  }
  ctx.restore();
  honors(ctx, c.wit, p.dir * R * 0.4, -R * 1.9, R * 0.85, p.t);
}

function golem(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number) {
  const stomp = p.moving && !p.still ? -Math.abs(Math.sin(p.phase * 0.6)) * R * 0.12 : 0;
  shadow(ctx, R * 1.1);
  ctx.save();
  ctx.translate(0, stomp);
  ctx.fillStyle = look.dark;
  for (const x of [-0.45, 0.45]) ctx.fillRect(x * R - R * 0.2, -R * 0.55, R * 0.4, R * 0.55);
  const cy = -R * 1.35;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    return [Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.9] as const;
  });
  const shades = [look.light, look.body, look.dark, look.body, look.light, look.wing];
  pts.forEach(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % 6];
    ctx.fillStyle = shades[i];
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = look.accent;
  ctx.beginPath();
  ctx.moveTo(p.dir * R * 0.15, cy - R * 1.3);
  ctx.lineTo(p.dir * R * 0.45, cy - R * 0.85);
  ctx.lineTo(p.dir * R * 0.15, cy - R * 0.6);
  ctx.lineTo(-p.dir * R * 0.15, cy - R * 0.85);
  ctx.fill();
  const glow = p.still ? 0.8 : 0.6 + 0.4 * Math.sin(p.t * 2 + c.seed * 7);
  ctx.fillStyle = `rgba(255, 250, 220, ${glow})`;
  for (const x of [0.05, 0.4]) {
    ctx.beginPath();
    ctx.arc(p.dir * R * x, cy - R * 0.1, R * 0.11, 0, TAU);
    ctx.fill();
  }
  if (c.holo) sheen(ctx, 0, cy, R * 0.95, R * 0.9, p.t);
  ctx.restore();
  honors(ctx, c.wit, 0, cy - R * 1.35 + stomp, R * 0.85, p.t);
}

/** Draws a creature at the origin. `glow` lights up night creatures, 0–1. */
export function drawCreature(ctx: CanvasRenderingContext2D, c: Drawable, look: Look, p: Pose, R: number, glow = 0) {
  ctx.save();
  switch (SPECIES[c.type].plan) {
    case 'walker':
      walker(ctx, c, look, p, R);
      break;
    case 'butterfly':
      butterfly(ctx, c, look, p, R);
      break;
    case 'dragonfly':
      dragonfly(ctx, c, look, p, R);
      break;
    case 'bird':
      bird(ctx, c, look, p, R);
      break;
    case 'bat':
      bat(ctx, c, look, p, R);
      break;
    case 'mushroom':
      mushroom(ctx, c, look, p, R, glow);
      break;
    case 'ant':
      ant(ctx, c, look, p, R);
      break;
    case 'owl':
      owl(ctx, c, look, p, R);
      break;
    case 'beetle':
      beetle(ctx, c, look, p, R);
      break;
    case 'snail':
      snail(ctx, c, look, p, R);
      break;
    case 'hedgehog':
      hedgehog(ctx, c, look, p, R);
      break;
    case 'golem':
      golem(ctx, c, look, p, R);
      break;
  }
  ctx.restore();
}

/** An egg in a twig nest, wobbling. `crack` runs 0–1 while it hatches. */
export function drawEgg(ctx: CanvasRenderingContext2D, look: Look, t: number, R: number, crack = 0, still = false) {
  shadow(ctx, R * 1.3, 0.2);
  // Nest.
  ctx.strokeStyle = '#8a5f33';
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = R * (0.12 + (i % 3) * 0.03);
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.2, R * (1.2 - (i % 3) * 0.08), R * 0.38, (i - 4) * 0.05, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
  }
  const wobble = still ? 0 : ((t % 3.2) < 0.8 ? Math.sin(t * 22) * 0.16 * Math.sin(((t % 3.2) / 0.8) * Math.PI) : 0) + crack * Math.sin(t * 40) * 0.2;
  ctx.save();
  ctx.translate(0, -R * 0.35);
  ctx.rotate(wobble);
  const g = ctx.createRadialGradient(-R * 0.3, -R * 1.4, R * 0.1, 0, -R * 0.9, R * 1.3);
  g.addColorStop(0, '#fffdf6');
  g.addColorStop(1, '#eadcc0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -R * 0.95, R * 0.78, R * 1.02, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = look.body;
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * 0.45, -R * 0.95 + Math.sin(a * 1.3) * R * 0.6, R * (0.07 + (i % 3) * 0.04), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (crack > 0) {
    ctx.strokeStyle = '#5a4128';
    ctx.lineWidth = R * 0.08;
    ctx.beginPath();
    const steps = Math.ceil(crack * 6);
    ctx.moveTo(-R * 0.7, -R * 1.05);
    for (let i = 1; i <= steps; i++) ctx.lineTo(-R * 0.7 + i * R * 0.24, -R * 1.05 + (i % 2 ? -R * 0.2 : R * 0.12));
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 244, 200, ${crack * 0.7})`;
    ctx.beginPath();
    ctx.arc(0, -R * 0.95, R * 1.4 * crack, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Retired models rest as fossils: skeletons, ammonites, trilobites, wing prints. */
export function drawFossil(ctx: CanvasRenderingContext2D, plan: BodyPlan, R: number, seed: number) {
  ctx.save();
  ctx.rotate((seed - 0.5) * 0.8);
  ctx.strokeStyle = 'rgba(246, 236, 214, 0.85)';
  ctx.fillStyle = 'rgba(246, 236, 214, 0.18)';
  ctx.lineWidth = R * 0.14;
  ctx.lineCap = 'round';
  if (plan === 'snail' || plan === 'mushroom') {
    ctx.beginPath();
    for (let a = 0; a < TAU * 3; a += 0.12) {
      const rr = R * 1.2 * Math.exp(-a * 0.14);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let a = 0.4; a < TAU * 2; a += 0.45) {
      const rr = R * 1.2 * Math.exp(-a * 0.14);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a) * rr * 0.72, Math.sin(a) * rr * 0.72);
      ctx.stroke();
    }
  } else if (plan === 'ant' || plan === 'beetle') {
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.8, R * 1.2, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.75, i * R * 0.3);
      ctx.lineTo(R * 0.75, i * R * 0.3);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -R * 1.2);
    ctx.lineTo(0, R * 1.2);
    ctx.stroke();
  } else if (plan === 'butterfly' || plan === 'dragonfly') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * R * 0.8, 0, R * 0.85, R * 0.4, s * 0.3, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * R * 0.45 * i, (i - 2) * R * 0.2);
        ctx.stroke();
      }
    }
  } else {
    // A skeleton: skull, spine, ribs.
    ctx.beginPath();
    ctx.arc(R * 1.1, -R * 0.1, R * 0.45, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.65, 0);
    ctx.quadraticCurveTo(0, -R * 0.4, -R * 1.2, 0);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const x = R * 0.45 - i * R * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, -R * 0.2);
      ctx.quadraticCurveTo(x + R * 0.25, R * 0.25, x - R * 0.05, R * 0.55);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40, 30, 20, 0.6)';
    ctx.beginPath();
    ctx.arc(R * 1.2, -R * 0.15, R * 0.12, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

import { drawCreature, drawEgg, drawFossil, hitCircle, lookFor, radiusOf, type Look, type Pose } from '@/components/creatures/draw';
import { mix } from '@/lib/color';
import { SPECIES, layoutWorld, type BodyPlan, type Biome, type Creature, type TerrariumData, type WorldLayout } from '@/lib/terrarium';

/**
 * The Terrarium's world: scenery, a small simulation, a camera, and picking. Canvas 2D, world units.
 * The sky is 0 to GROUND, the meadow a strip below it where walkers stand at different depths,
 * and the soil below that holds a layer of rock for each year, with fossils in the year they were born.
 */

export const WORLD_H = 640;
export const GROUND = 400;
const MEADOW = 40;
const SOIL = GROUND + MEADOW;
const TAU = Math.PI * 2;

export type Clock = 'live' | 'day' | 'night';

/** Rock layers, newest on top. Anything older than the last one sits in it. */
const YEARS = [2026, 2025, 2024, 2023, 2022];
const LAYER = (WORLD_H - SOIL) / YEARS.length;
const layerOf = (year: number) => {
  const i = YEARS.findIndex((y) => year >= y);
  return i === -1 ? YEARS.length - 1 : i;
};
/** How fast each kind of ground creature walks, before its own pace. */
const FAMILY_LINE = 8;
const STRIDE: Partial<Record<BodyPlan, number>> = { snail: 3.5, golem: 8, ant: 20, owl: 12, hedgehog: 11, beetle: 13, walker: 14 };

interface Agent {
  c: Creature;
  look: Look;
  r: number;
  plan: BodyPlan;
  x: number;
  y: number;
  home: number;
  min: number;
  max: number;
  dir: 1 | -1;
  phase: number;
  moving: boolean;
  timer: number;
  depth: number;
  flying: boolean;
  elder: boolean;
  egg: boolean;
  /** 0–1 while an egg cracks open. */
  hatch: number;
  /** Who it walks behind: the one ahead in its family's line, or in its ant column. */
  leader: Agent | null;
  /** The family's newest generation, which the line follows. */
  head: Agent | null;
  slot: number;
  tree: { x: number; y: number } | null;
  asleep: boolean;
}

interface Particle {
  kind: 'note' | 'zzz' | 'sparkle' | 'heart' | 'confetti' | 'firefly';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

interface Tree {
  x: number;
  h: number;
  r: number;
  tint: string;
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Sky colors through a day: hour, top, horizon. */
const SKY: [number, string, string][] = [
  [0, '#0a0f24', '#1a2346'],
  [5, '#161d48', '#3f3565'],
  [6.5, '#6687cc', '#f5b58c'],
  [9, '#4f9fe6', '#cbe7f7'],
  [16, '#4a95e0', '#d4ebf8'],
  [18.6, '#39579f', '#f19e68'],
  [20.2, '#1b2150', '#5c416f'],
  [22, '#0a0f24', '#1a2346'],
  [24, '#0a0f24', '#1a2346'],
];

function skyAt(hour: number): [string, string] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i];
    const [h1, t1, b1] = SKY[i + 1];
    if (hour >= h0 && hour <= h1) {
      const k = (hour - h0) / (h1 - h0);
      return [mix(t0, t1, k), mix(b0, b1, k)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

/** 0 at night, 1 in full day. */
const daylight = (hour: number) => smooth(5.4, 8, hour) * (1 - smooth(18, 20.6, hour));

export interface WorldOptions {
  still: boolean;
  hatched: Set<string>;
  pet: string | null;
  onHatch: (key: string) => void;
}

export class TerrariumWorld {
  readonly layout: WorldLayout;
  readonly agents: Agent[];
  private byKey = new Map<string, Agent>();
  private trees = new Map<string, Tree[]>();
  private flowers: { x: number; color: string; h: number }[] = [];
  private particles: Particle[] = [];
  /** Each lab's mushrooms, left to right, for the threads between them. */
  private mycelium: Agent[][] = [];
  private labColor: Record<string, string>;
  private w = 800;
  private h = 600;
  private dpr = 1;
  cam = { x: 0, y: 0, zoom: 1.5 };
  private target: { x: number; y: number; zoom: number } | null = null;
  private t = 0;
  private last = 0;
  hovered: string | null = null;
  selected: string | null = null;
  pet: string | null;
  clock: Clock = 'live';
  private still: boolean;
  private onHatch: (key: string) => void;
  private rain: boolean;

  constructor(private data: TerrariumData, opts: WorldOptions) {
    this.still = opts.still;
    this.pet = opts.pet;
    this.onHatch = opts.onHatch;
    this.rain = data.hatchedToday >= 8;
    this.labColor = Object.fromEntries(data.labs.map((l) => [l.key, l.color]));
    this.layout = layoutWorld(data.creatures, data.labs);
    const biomeOf = new Map(this.layout.biomes.map((b) => [b.lab, b]));
    for (const b of this.layout.biomes) this.trees.set(b.lab, this.plantTrees(b));
    for (const b of this.layout.biomes) {
      for (let x = b.x0 + 20; x < b.x1 - 20; x += 26 + hash(x) * 40) {
        this.flowers.push({ x, color: mix(b.color, '#ffffff', 0.25 + hash(x + 1) * 0.4), h: 8 + hash(x + 2) * 10 });
      }
    }

    this.agents = data.creatures.map((c) => {
      const b = biomeOf.get(c.lab)!;
      const home = this.layout.home[c.key];
      const plan = SPECIES[c.type].plan;
      const a: Agent = {
        c,
        look: lookFor(c, this.labColor[c.lab] ?? '#888888'),
        r: radiusOf(c),
        plan,
        x: home,
        y: GROUND,
        home,
        min: b.x0 + 24,
        max: b.x1 - 24,
        dir: c.seed > 0.5 ? 1 : -1,
        phase: c.seed * TAU,
        moving: false,
        timer: c.seed * 3,
        // Eggs sit at the front of the meadow so the family gathered round them doesn't hide them.
        depth: c.egg ? 0.97 : hash(c.seed * 1000),
        flying: false,
        elder: !!c.family && c.family.lead !== c.key && c.family.stage < c.family.stages - 1,
        egg: c.egg && !opts.hatched.has(c.key),
        hatch: 0,
        leader: null,
        head: null,
        slot: 0,
        tree: null,
        asleep: false,
      };
      if (c.fossil) {
        const layer = layerOf(Number(c.born.slice(0, 4)));
        a.y = SOIL + layer * LAYER + LAYER * (0.3 + c.seed * 0.45);
      } else if (SPECIES[c.type].habitat === 'ground' || SPECIES[c.type].habitat === 'rooted') {
        a.y = GROUND + 4 + a.depth * (MEADOW - 10);
      }
      if (plan === 'bat' || plan === 'bird') {
        const trees = this.trees.get(c.lab)!;
        const tree = trees[Math.floor(c.seed * trees.length)];
        a.tree = { x: tree.x + (hash(c.seed * 77) - 0.5) * tree.r * 1.2, y: GROUND - tree.h + tree.r * (plan === 'bat' ? 0.55 : -0.7) };
        a.x = a.tree.x;
        a.y = a.tree.y;
      }
      if (plan === 'butterfly' || plan === 'dragonfly') a.y = GROUND - 60 - hash(c.seed * 31) * 110;
      this.byKey.set(c.key, a);
      return a;
    });

    // Families walk single file behind their newest generation, newest first; ants march the same way.
    const followers = new Map<Agent, Agent[]>();
    for (const a of this.agents) {
      if (a.c.fossil || a.plan !== 'walker' || !a.c.family || a.c.family.lead === a.c.key) continue;
      const lead = this.byKey.get(a.c.family.lead);
      if (!lead || lead.c.fossil || lead.c.lab !== a.c.lab) continue;
      followers.set(lead, [...(followers.get(lead) ?? []), a]);
    }
    for (const [head, list] of followers) {
      list.sort((x, y) => (y.c.family?.stage ?? 0) - (x.c.family?.stage ?? 0) || x.c.key.localeCompare(y.c.key));
      // A line longer than this would trail into the next lab's land; the rest roam near home.
      list.slice(0, FAMILY_LINE).forEach((a, i, line) => {
        a.head = head;
        a.leader = i ? line[i - 1] : head;
        a.slot = i + 1;
      });
    }
    const caps = new Map<string, Agent[]>();
    for (const a of this.agents) if (a.plan === 'mushroom' && !a.c.fossil) caps.set(a.c.lab, [...(caps.get(a.c.lab) ?? []), a]);
    this.mycelium = [...caps.values()].map((list) => list.sort((x, y) => x.x - y.x));
    const columns = new Map<string, Agent[]>();
    for (const a of this.agents) if (a.plan === 'ant' && !a.c.fossil) columns.set(a.c.lab, [...(columns.get(a.c.lab) ?? []), a]);
    for (const col of columns.values()) {
      col.sort((x, y) => x.c.key.localeCompare(y.c.key));
      col.forEach((a, i) => {
        if (i) a.leader = col[i - 1];
        a.x = col[0].home - i * 12;
      });
    }
  }

  private plantTrees(b: Biome): Tree[] {
    const width = b.x1 - b.x0;
    const n = Math.max(2, Math.round(width / 420));
    return Array.from({ length: n }, (_, i) => {
      const x = b.x0 + ((i + 0.5) / n) * width + (hash(b.x0 + i) - 0.5) * 80;
      return { x, h: 150 + hash(x) * 70, r: 52 + hash(x + 3) * 26, tint: mix('#3f8f4a', b.color, 0.18) };
    });
  }

  // Camera ------------------------------------------------------------------

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.clampCam();
  }

  get scale() {
    return (this.h / WORLD_H) * this.cam.zoom;
  }
  get viewW() {
    return this.w / this.scale;
  }
  get viewH() {
    return this.h / this.scale;
  }

  private clampCam() {
    this.cam.zoom = Math.min(3.2, Math.max(1, this.cam.zoom));
    this.cam.x = Math.min(Math.max(0, this.layout.width - this.viewW), Math.max(0, this.cam.x));
    this.cam.y = Math.min(Math.max(0, WORLD_H - this.viewH), Math.max(0, this.cam.y));
  }

  /** Frames the meadow on first load. */
  start(x: number) {
    this.cam.zoom = this.w < 700 ? 2.4 : 2.1;
    this.cam.x = x - this.viewW / 2;
    this.cam.y = GROUND + MEADOW * 0.5 - this.viewH * 0.68;
    this.clampCam();
  }

  panBy(dx: number, dy: number) {
    this.target = null;
    this.cam.x -= dx / this.scale;
    this.cam.y -= dy / this.scale;
    this.clampCam();
  }

  zoomAt(factor: number, sx: number, sy: number) {
    this.target = null;
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom *= factor;
    this.clampCam();
    this.cam.x = wx - sx / this.scale;
    this.cam.y = wy - sy / this.scale;
    this.clampCam();
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [this.cam.x + sx / this.scale, this.cam.y + sy / this.scale];
  }

  /** Glides the camera to a creature, keeping it clear of the info panel (on the right, or along the bottom on phones). */
  focus(key: string) {
    const a = this.byKey.get(key);
    if (!a) return;
    const zoom = Math.max(this.cam.zoom, 2.1);
    const s = (this.h / WORLD_H) * zoom;
    const phone = this.w < 640;
    const across = phone ? 0.5 : Math.max(0.3, (this.w - 390) / 2 / this.w);
    this.target = { x: a.x - (this.w / s) * across, y: a.y - (this.h / s) * (phone ? 0.34 : 0.6), zoom };
    if (this.still) {
      this.cam = { ...this.target };
      this.target = null;
      this.clampCam();
    }
  }

  jumpTo(fraction: number) {
    this.target = { x: fraction * this.layout.width - this.viewW / 2, y: this.cam.y, zoom: this.cam.zoom };
  }

  get center() {
    return this.cam.x + this.viewW / 2;
  }

  biomeAt(x: number): Biome | undefined {
    return this.layout.biomes.find((b) => x >= b.x0 && x < b.x1);
  }

  agent(key: string) {
    return this.byKey.get(key);
  }

  // Time --------------------------------------------------------------------

  hour(): number {
    if (this.clock === 'day') return 13;
    if (this.clock === 'night') return 23.5;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  // Interaction ---------------------------------------------------------------

  /** The creature under a screen point, front-most first. */
  pick(sx: number, sy: number): string | null {
    const [wx, wy] = this.toWorld(sx, sy);
    let best: { key: string; d: number } | null = null;
    for (const a of this.agents) {
      if (a.x < this.cam.x - 60 || a.x > this.cam.x + this.viewW + 60) continue;
      const hc = a.egg ? { x: 0, y: -a.r * 1.3, r: a.r * 1.6 } : a.c.fossil ? { x: 0, y: 0, r: a.r * 1.6 } : hitCircle(a.c, a.r, a);
      const d = Math.hypot(wx - (a.x + hc.x), wy - (a.y + hc.y));
      const reach = Math.max(hc.r, 9 / this.scale);
      if (d < reach && (!best || d < best.d)) best = { key: a.c.key, d };
    }
    return best?.key ?? null;
  }

  isEgg(key: string) {
    return !!this.byKey.get(key)?.egg;
  }

  hatch(key: string) {
    const a = this.byKey.get(key);
    if (!a || !a.egg || a.hatch > 0) return;
    a.hatch = this.still ? 1 : 0.001;
  }

  // Simulation --------------------------------------------------------------

  private update(dt: number, night: number) {
    if (this.target) {
      const k = 1 - Math.pow(0.001, dt);
      this.cam.x += (this.target.x - this.cam.x) * k;
      this.cam.y += (this.target.y - this.cam.y) * k;
      this.cam.zoom += (this.target.zoom - this.cam.zoom) * k;
      this.clampCam();
      if (Math.abs(this.target.x - this.cam.x) < 0.5 && Math.abs(this.target.zoom - this.cam.zoom) < 0.005) this.target = null;
    }
    const x0 = this.cam.x - 400;
    const x1 = this.cam.x + this.viewW + 400;
    const sleepy = night > 0.6;
    for (const a of this.agents) {
      if (a.c.fossil) continue;
      if (a.egg) {
        if (a.hatch > 0) {
          a.hatch += dt / 1.8;
          if (a.hatch >= 1) this.finishHatch(a);
        }
        continue;
      }
      // Far-off creatures still live, just at a coarser step.
      if ((a.x < x0 || a.x > x1) && Math.floor(this.t * 4) % 4 !== Math.floor(a.c.seed * 4)) continue;
      const step = a.x < x0 || a.x > x1 ? dt * 4 : dt;
      if (this.still) {
        a.asleep = sleepy && a.plan !== 'owl' && a.plan !== 'bat';
        a.flying = a.plan === 'bat' ? !a.asleep && sleepy : false;
        continue;
      }
      switch (a.plan) {
        case 'mushroom':
          break;
        case 'butterfly':
        case 'dragonfly':
          this.flutter(a, step, sleepy);
          break;
        case 'bird':
          this.birdLife(a, step, sleepy);
          break;
        case 'bat':
          this.batLife(a, step, sleepy);
          break;
        default:
          this.walk(a, step, sleepy && a.plan !== 'owl');
      }
      this.emit(a, step, night);
    }
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'confetti') p.vy += 60 * dt;
      if (p.kind === 'firefly') {
        p.vx += (hash(p.x + this.t) - 0.5) * 20 * dt;
        p.vy += (hash(p.y - this.t) - 0.5) * 20 * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    if (night > 0.5 && !this.still && this.particles.length < 260 && Math.random() < dt * 8) {
      this.particles.push({ kind: 'firefly', x: this.cam.x + Math.random() * this.viewW, y: GROUND - 10 - Math.random() * 90, vx: 0, vy: 0, life: 0, max: 5 + Math.random() * 4, color: '#f7f39a' });
    }
  }

  private finishHatch(a: Agent) {
    a.egg = false;
    a.hatch = 0;
    a.timer = 1.5;
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * TAU;
      this.particles.push({
        kind: 'confetti',
        x: a.x,
        y: a.y - a.r * 1.4,
        vx: Math.cos(ang) * (30 + Math.random() * 50),
        vy: Math.sin(ang) * (30 + Math.random() * 40) - 60,
        life: 0,
        max: 1.4 + Math.random() * 0.6,
        color: [a.look.body, a.look.accent, '#ffd46b', '#ffffff'][i % 4],
      });
    }
    this.onHatch(a.c.key);
  }

  private walk(a: Agent, dt: number, asleep: boolean) {
    a.asleep = asleep;
    let speed = (STRIDE[a.plan] ?? 12) * a.c.pace * (a.elder ? 0.8 : 1);
    if (asleep) {
      a.moving = false;
      return;
    }
    const lead = a.leader;
    if (lead) {
      // Gather round an unhatched egg; otherwise walk in line behind the one ahead.
      const egg = a.head?.egg ? a.head : null;
      const target = egg
        ? egg.x + (a.slot % 2 ? 1 : -1) * (egg.r * 2.2 + Math.ceil(a.slot / 2) * a.r * 2.4)
        : lead.x - lead.dir * (a.plan === 'ant' ? 11 : (lead.r + a.r) * 1.35);
      const dx = target - a.x;
      if (Math.abs(dx) > (egg ? 4 : 6)) {
        a.dir = dx > 0 ? 1 : -1;
        a.moving = true;
        speed = Math.max(speed, Math.abs(dx) > 60 ? speed * 2.2 : speed * 1.15);
        a.x += a.dir * Math.min(Math.abs(dx), speed * dt);
      } else {
        a.moving = false;
        a.dir = egg ? (egg.x > a.x ? 1 : -1) : lead.dir;
      }
      a.phase += dt * speed * 0.55;
      return;
    }
    a.timer -= dt;
    if (a.timer <= 0) {
      const far = Math.abs(a.x - a.home) > 110 + a.c.seed * 90;
      a.moving = Math.random() < 0.68;
      if (a.moving) a.dir = far ? (a.home > a.x ? 1 : -1) : Math.random() < 0.5 ? 1 : -1;
      a.timer = a.moving ? 2 + Math.random() * 4 : 1 + Math.random() * 3.5;
    }
    if (a.moving) {
      a.x += a.dir * speed * dt;
      if (a.x < a.min || a.x > a.max) {
        a.x = Math.min(a.max, Math.max(a.min, a.x));
        a.dir = a.dir === 1 ? -1 : 1;
      }
      a.phase += dt * speed * 0.55;
    }
  }

  private flutter(a: Agent, dt: number, asleep: boolean) {
    const flower = this.nearestFlower(a.home);
    if (asleep && a.plan === 'butterfly') {
      a.asleep = true;
      a.flying = false;
      a.x += (flower.x - a.x) * Math.min(1, dt * 2);
      a.y += (GROUND - flower.h - 4 - a.y) * Math.min(1, dt * 2);
      return;
    }
    a.asleep = false;
    a.flying = true;
    const dart = a.plan === 'dragonfly' ? 2.2 : 1;
    const vx = Math.cos(this.t * 0.35 * dart + a.c.seed * 40) * 26 * a.c.pace * dart;
    a.x = Math.min(a.max, Math.max(a.min, a.x + vx * dt + (a.home - a.x) * 0.02 * dt));
    a.dir = vx >= 0 ? 1 : -1;
    const baseY = GROUND - 50 - hash(a.c.seed * 31) * (a.plan === 'dragonfly' ? 60 : 130);
    a.y = baseY + Math.sin(this.t * 0.9 + a.c.seed * 20) * 14;
  }

  private birdLife(a: Agent, dt: number, asleep: boolean) {
    const tree = a.tree!;
    const flying = !asleep && Math.sin(this.t * 0.07 + a.c.seed * 30) > 0.1;
    a.asleep = asleep;
    a.flying = flying;
    if (!flying) {
      a.x += (tree.x - a.x) * Math.min(1, dt * 1.5);
      a.y += (tree.y - a.y) * Math.min(1, dt * 1.5);
      return;
    }
    const ox = Math.sin(this.t * 0.45 + a.c.seed * 11) * 140;
    const nx = tree.x + ox;
    a.dir = nx >= a.x ? 1 : -1;
    a.x += (nx - a.x) * Math.min(1, dt * 1.2);
    a.y += (tree.y - 40 + Math.sin(this.t * 1.3 + a.c.seed * 7) * 30 - a.y) * Math.min(1, dt * 1.2);
  }

  private batLife(a: Agent, dt: number, night: boolean) {
    const tree = a.tree!;
    a.flying = night;
    a.asleep = !night;
    if (!night) {
      a.x += (tree.x - a.x) * Math.min(1, dt * 2);
      a.y += (tree.y - a.y) * Math.min(1, dt * 2);
      return;
    }
    const nx = tree.x + Math.sin(this.t * 0.7 + a.c.seed * 9) * 120;
    const ny = tree.y - 30 + Math.sin(this.t * 1.4 + a.c.seed * 5) * 40;
    a.dir = nx >= a.x ? 1 : -1;
    a.x += (nx - a.x) * Math.min(1, dt * 2);
    a.y += (ny - a.y) * Math.min(1, dt * 2);
  }

  private nearestFlower(x: number) {
    let best = this.flowers[0];
    for (const f of this.flowers) if (Math.abs(f.x - x) < Math.abs(best.x - x)) best = f;
    return best;
  }

  /** Notes from singers, Zzz from sleepers, sparkles round the crowned, hearts over your pet. */
  private emit(a: Agent, dt: number, night: number) {
    if (a.x < this.cam.x - 40 || a.x > this.cam.x + this.viewW + 40 || this.particles.length > 240) return;
    const top = a.y - a.r * 2.6;
    const roll = Math.random();
    if (a.asleep && roll < dt * 0.35) this.particles.push({ kind: 'zzz', x: a.x + a.r * 0.6, y: top, vx: 6, vy: -9, life: 0, max: 2.4, color: '#ffffff' });
    else if ((a.c.voice || a.c.type === 'audio') && !a.asleep && night < 0.5 && roll < dt * 0.5) {
      this.particles.push({ kind: 'note', x: a.x + a.dir * a.r, y: top, vx: a.dir * 8, vy: -14, life: 0, max: 2.2, color: a.look.accent });
    } else if (a.c.wit != null && a.c.wit >= 90 && roll < dt * 0.6) {
      this.particles.push({ kind: 'sparkle', x: a.x + (Math.random() - 0.5) * a.r * 2.4, y: top + Math.random() * a.r, vx: 0, vy: -4, life: 0, max: 1.1, color: '#ffe38a' });
    }
    if (a.c.key === this.pet && Math.random() < dt * 0.9) this.particles.push({ kind: 'heart', x: a.x, y: top - 4, vx: (Math.random() - 0.5) * 6, vy: -12, life: 0, max: 2, color: '#ff5d7a' });
  }

  // Drawing -----------------------------------------------------------------

  frame(ctx: CanvasRenderingContext2D, now: number) {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.t += dt;
    const hour = this.hour();
    const light = daylight(hour);
    const night = 1 - light;
    this.update(dt, night);

    const { dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSky(ctx, hour, night);
    this.drawHills(ctx, night);

    const s = this.scale;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, -this.cam.x * s * dpr, -this.cam.y * s * dpr);
    const vx0 = this.cam.x;
    const vx1 = this.cam.x + this.viewW;
    this.drawSoil(ctx, vx0, vx1, night);
    this.drawMycelium(ctx, vx0, vx1, night);
    for (const a of this.agents) if (a.c.fossil && a.x > vx0 - 40 && a.x < vx1 + 40) this.drawFossilAgent(ctx, a);
    this.drawMeadow(ctx, vx0, vx1, night);
    this.drawTrees(ctx, vx0, vx1, night);
    this.drawSigns(ctx, vx0, vx1);
    this.drawFlowers(ctx, vx0, vx1);

    const visible = this.agents.filter((a) => !a.c.fossil && a.x > vx0 - 60 && a.x < vx1 + 60);
    const hanging = visible.filter((a) => a.plan === 'bat' && !a.flying);
    const onGround = (a: Agent) => SPECIES[a.c.type].habitat === 'ground' || SPECIES[a.c.type].habitat === 'rooted' || (a.plan === 'butterfly' && !a.flying);
    const ground = visible.filter(onGround).sort((x, y) => x.y - y.y);
    const air = visible.filter((a) => !onGround(a) && !(a.plan === 'bat' && !a.flying));
    for (const a of hanging) this.drawAgent(ctx, a, night);
    for (const a of ground) this.drawAgent(ctx, a, night);
    this.drawGrassFront(ctx, vx0, vx1, night);
    for (const a of air) this.drawAgent(ctx, a, night);

    // Night falls over everything but what glows.
    if (night > 0.02) {
      ctx.fillStyle = `rgba(12, 16, 44, ${night * 0.42})`;
      ctx.fillRect(vx0, this.cam.y, this.viewW, this.viewH);
      this.drawGlows(ctx, visible, night);
    }
    this.drawParticles(ctx, vx0, vx1);
    if (this.rain && !this.still) this.drawRain(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTags(ctx);
  }

  private drawSky(ctx: CanvasRenderingContext2D, hour: number, night: number) {
    const { w, h } = this;
    const [top, bottom] = skyAt(hour);
    const horizon = (GROUND - this.cam.y) * this.scale;
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, 1));
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (night > 0.05) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 140; i++) {
        const x = (hash(i) * 3000 - this.cam.x * 0.04 * this.scale) % 3000;
        const sx = ((x % w) + w) % w;
        const sy = hash(i + 500) * horizon * 0.85;
        const tw = this.still ? 1 : 0.6 + 0.4 * Math.sin(this.t * (1 + hash(i + 9) * 2) + i);
        ctx.globalAlpha = night * tw * (0.35 + hash(i + 7) * 0.65);
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }
    // Sun and moon ride an arc across the sky.
    const sunUp = (hour - 6) / 13;
    const body = sunUp >= 0 && sunUp <= 1 ? { k: sunUp, sun: true } : { k: (((hour + 24 - 19) % 24) / 11), sun: false };
    if (body.k >= 0 && body.k <= 1) {
      const x = w * (0.1 + body.k * 0.8);
      const y = horizon - Math.sin(body.k * Math.PI) * horizon * 0.75;
      const r = Math.min(w, h) * (body.sun ? 0.045 : 0.035);
      const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 4);
      glow.addColorStop(0, body.sun ? 'rgba(255, 244, 200, 0.9)' : 'rgba(220, 230, 255, 0.5)');
      glow.addColorStop(1, 'rgba(255, 244, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.fillStyle = body.sun ? '#fff6d6' : '#eef1ff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (!body.sun) {
        ctx.fillStyle = mix(top, '#000000', 0.1);
        ctx.beginPath();
        ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.9, 0, TAU);
        ctx.fill();
      }
    }
    // Clouds drift, slower than the ground.
    ctx.fillStyle = night > 0.5 ? 'rgba(160, 170, 210, 0.12)' : 'rgba(255, 255, 255, 0.75)';
    for (let i = 0; i < 7; i++) {
      const span = w + 400;
      const x = ((hash(i + 40) * span - this.cam.x * 0.12 * this.scale + (this.still ? 0 : this.t * (6 + i * 2))) % span + span) % span - 200;
      const y = horizon * (0.12 + hash(i + 41) * 0.45);
      const r = 26 + hash(i + 42) * 30;
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.ellipse(x + j * r * 0.7, y + (j % 2) * r * 0.2, r * (0.8 + (j % 2) * 0.3), r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  private drawHills(ctx: CanvasRenderingContext2D, night: number) {
    const { w } = this;
    const horizon = (GROUND - this.cam.y) * this.scale;
    const layers: [number, number, string, string, number][] = [
      [0.15, 0.34, '#a9c7dd', '#1d2745', 60],
      [0.35, 0.2, '#8fbf95', '#1a2a33', 90],
      [0.6, 0.1, '#77b06e', '#16261f', 130],
    ];
    for (const [par, lift, day, dark, amp] of layers) {
      ctx.fillStyle = mix(day, dark, night * 0.85);
      ctx.beginPath();
      ctx.moveTo(0, horizon + 2);
      for (let sx = 0; sx <= w + 8; sx += 8) {
        const x = (this.cam.x * par * this.scale + sx) / (amp * 2);
        const y = horizon - horizon * lift - (Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1) * 0.3 + Math.sin(x * 0.37) * 0.6) * amp * 0.35 * (this.scale / 1.2);
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(w, horizon + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSoil(ctx: CanvasRenderingContext2D, x0: number, x1: number, night: number) {
    const g = ctx.createLinearGradient(0, SOIL, 0, WORLD_H);
    g.addColorStop(0, mix('#8b6443', '#3a2a20', night * 0.5));
    g.addColorStop(1, mix('#4a3222', '#1f1712', night * 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(x0, SOIL - 2, x1 - x0, WORLD_H - SOIL + 4);
    YEARS.forEach((year, i) => {
      const y = SOIL + i * LAYER;
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(x0, y, x1 - x0, LAYER);
      ctx.strokeStyle = 'rgba(30, 18, 10, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = Math.floor(x0 / 20) * 20; x <= x1 + 20; x += 20) {
        const yy = y + Math.sin(x * 0.013 + i) * 3;
        if (x === Math.floor(x0 / 20) * 20) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 240, 215, 0.45)';
      ctx.font = '600 9px ui-monospace, monospace';
      for (let x = Math.ceil(x0 / 900) * 900; x < x1; x += 900) ctx.fillText(i === YEARS.length - 1 ? `${year} and before` : String(year), x + 8, y + 12);
    });
    // Pebbles.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let x = Math.floor(x0 / 37) * 37; x < x1; x += 37) {
      ctx.beginPath();
      ctx.ellipse(x + hash(x) * 20, SOIL + 10 + hash(x + 1) * (WORLD_H - SOIL - 20), 2 + hash(x + 2) * 3, 1.5 + hash(x + 3) * 2, 0, 0, TAU);
      ctx.fill();
    }
  }

  /** Embedding models share memory: glowing threads link a lab's mushrooms underground. */
  private drawMycelium(ctx: CanvasRenderingContext2D, x0: number, x1: number, night: number) {
    for (const list of this.mycelium) {
      for (let i = 1; i < list.length; i++) {
        const [a, b] = [list[i - 1], list[i]];
        if (b.x < x0 - 50 || a.x > x1 + 50) continue;
        const dip = SOIL + 14 + hash(a.x) * 26;
        ctx.strokeStyle = mix(a.look.light, '#fff6d8', 0.5);
        ctx.globalAlpha = 0.25 + night * 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(a.x, dip, b.x, dip, b.x, b.y);
        ctx.stroke();
        if (!this.still) {
          const k = (this.t * 0.4 + hash(a.x + b.x)) % 1;
          const px = (1 - k) ** 3 * a.x + 3 * (1 - k) ** 2 * k * a.x + 3 * (1 - k) * k * k * b.x + k ** 3 * b.x;
          const py = (1 - k) ** 3 * a.y + 3 * (1 - k) ** 2 * k * dip + 3 * (1 - k) * k * k * dip + k ** 3 * b.y;
          ctx.fillStyle = '#fff6c8';
          ctx.globalAlpha = 0.5 + night * 0.5;
          ctx.beginPath();
          ctx.arc(px, py, 1.6, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawMeadow(ctx: CanvasRenderingContext2D, x0: number, x1: number, night: number) {
    const g = ctx.createLinearGradient(0, GROUND - 4, 0, SOIL);
    g.addColorStop(0, mix('#9fd67a', '#2c4a33', night * 0.7));
    g.addColorStop(1, mix('#5f9a45', '#1c3322', night * 0.7));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - 10, SOIL);
    for (let x = Math.floor(x0 / 10) * 10 - 10; x <= x1 + 10; x += 10) ctx.lineTo(x, GROUND - 2 + Math.sin(x * 0.02) * 1.5);
    ctx.lineTo(x1 + 10, SOIL);
    ctx.closePath();
    ctx.fill();
    // Each lab's land carries a hint of its color.
    for (const b of this.layout.biomes) {
      if (b.x1 < x0 || b.x0 > x1) continue;
      const tint = ctx.createLinearGradient(b.x0, 0, b.x1, 0);
      tint.addColorStop(0, `${b.color}00`);
      tint.addColorStop(0.1, `${b.color}26`);
      tint.addColorStop(0.9, `${b.color}26`);
      tint.addColorStop(1, `${b.color}00`);
      ctx.fillStyle = tint;
      ctx.fillRect(b.x0, GROUND, b.x1 - b.x0, MEADOW);
    }
    this.grassRow(ctx, x0, x1, GROUND + 1, 7, night, 0);
  }

  private drawGrassFront(ctx: CanvasRenderingContext2D, x0: number, x1: number, night: number) {
    this.grassRow(ctx, x0, x1, SOIL + 1, 11, night, 5);
  }

  private grassRow(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, h: number, night: number, seed: number) {
    ctx.strokeStyle = mix(seed ? '#4f8d3a' : '#7cbc5c', '#15261a', night * 0.7);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = Math.floor(x0 / 6) * 6; x < x1; x += 6) {
      const hh = h * (0.5 + hash(x + seed) * 0.8);
      const sway = this.still ? 0 : Math.sin(this.t * 1.6 + x * 0.05) * 1.6;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway * 0.4, y - hh * 0.6, x + sway + (hash(x + 9) - 0.5) * 3, y - hh);
    }
    ctx.stroke();
  }

  private drawTrees(ctx: CanvasRenderingContext2D, x0: number, x1: number, night: number) {
    for (const list of this.trees.values()) {
      for (const tr of list) {
        if (tr.x + tr.r * 1.5 < x0 || tr.x - tr.r * 1.5 > x1) continue;
        const top = GROUND - tr.h;
        ctx.fillStyle = mix('#6d4b2e', '#1d1611', night * 0.6);
        ctx.beginPath();
        ctx.moveTo(tr.x - 8, GROUND + 4);
        ctx.quadraticCurveTo(tr.x - 4, top + tr.r * 0.6, tr.x - 3, top + tr.r * 0.3);
        ctx.lineTo(tr.x + 3, top + tr.r * 0.3);
        ctx.quadraticCurveTo(tr.x + 4, top + tr.r * 0.6, tr.x + 8, GROUND + 4);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tr.x, top + tr.r * 0.9);
        ctx.lineTo(tr.x + tr.r * 0.7, top + tr.r * 0.5);
        ctx.moveTo(tr.x, top + tr.r * 0.8);
        ctx.lineTo(tr.x - tr.r * 0.65, top + tr.r * 0.45);
        ctx.stroke();
        const sway = this.still ? 0 : Math.sin(this.t * 0.6 + tr.x) * 2;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          const cx = tr.x + Math.cos(a) * tr.r * 0.55 + sway;
          const cy = top + Math.sin(a) * tr.r * 0.35 - tr.r * 0.1;
          const g = ctx.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, tr.r * 0.62);
          g.addColorStop(0, mix(mix(tr.tint, '#d8f5a8', 0.4), '#1a2c22', night * 0.7));
          g.addColorStop(1, mix(tr.tint, '#0f1d17', night * 0.7));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, tr.r * 0.58, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  private drawSigns(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
    for (const b of this.layout.biomes) {
      const x = b.x0 + 36;
      if (x < x0 - 80 || x > x1 + 80) continue;
      ctx.fillStyle = '#7a5332';
      ctx.fillRect(x - 1.5, GROUND - 30, 3, 34);
      ctx.font = '700 8px system-ui, sans-serif';
      const tw = ctx.measureText(b.name).width;
      const bw = tw + 14;
      ctx.fillStyle = '#f3e3c3';
      ctx.strokeStyle = '#6b4526';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, GROUND - 44, bw, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.fillRect(x - bw / 2 + 2.5, GROUND - 41.5, 3, 11);
      ctx.fillStyle = '#3a2512';
      ctx.fillText(b.name, x - bw / 2 + 8.5, GROUND - 33);
    }
  }

  private drawFlowers(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
    for (const f of this.flowers) {
      if (f.x < x0 - 10 || f.x > x1 + 10) continue;
      const sway = this.still ? 0 : Math.sin(this.t * 1.4 + f.x) * 1.2;
      ctx.strokeStyle = '#4c8a3b';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(f.x, GROUND + 2);
      ctx.quadraticCurveTo(f.x + sway * 0.5, GROUND - f.h / 2, f.x + sway, GROUND - f.h);
      ctx.stroke();
      ctx.fillStyle = f.color;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.arc(f.x + sway + Math.cos(a) * 2.4, GROUND - f.h + Math.sin(a) * 2.4, 1.9, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd95e';
      ctx.beginPath();
      ctx.arc(f.x + sway, GROUND - f.h, 1.4, 0, TAU);
      ctx.fill();
    }
  }

  private drawFossilAgent(ctx: CanvasRenderingContext2D, a: Agent) {
    ctx.save();
    ctx.translate(a.x, a.y);
    const on = a.c.key === this.hovered || a.c.key === this.selected;
    if (on) {
      ctx.fillStyle = 'rgba(255, 236, 190, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, a.r * 2.2, 0, TAU);
      ctx.fill();
    }
    drawFossil(ctx, a.plan, a.r, a.c.seed);
    ctx.restore();
  }

  private drawAgent(ctx: CanvasRenderingContext2D, a: Agent, night: number) {
    const depthScale = SPECIES[a.c.type].habitat === 'ground' || SPECIES[a.c.type].habitat === 'rooted' ? 0.85 + a.depth * 0.3 : 1;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale(depthScale, depthScale);
    const focus = a.c.key === this.selected || a.c.key === this.hovered;
    if (focus) {
      const hc = a.egg ? { x: 0, y: -a.r * 1.3, r: a.r * 1.6 } : hitCircle(a.c, a.r, a);
      ctx.strokeStyle = a.c.key === this.selected ? '#ffd46b' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = this.still ? 0 : -this.t * 8;
      ctx.beginPath();
      ctx.arc(hc.x, hc.y, hc.r + 3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (a.egg) {
      drawEgg(ctx, a.look, this.t + a.c.seed * 3, a.r * 0.9, a.hatch, this.still);
    } else {
      const pose: Pose = { t: this.t, dir: a.dir, phase: a.phase, moving: a.moving, asleep: a.asleep, flying: a.flying, elder: a.elder, still: this.still };
      drawCreature(ctx, a.c, a.look, pose, a.r, a.plan === 'mushroom' ? night : 0);
    }
    ctx.restore();
  }

  /** Mushrooms glow at night; eyes of the night creatures shine. */
  private drawGlows(ctx: CanvasRenderingContext2D, visible: Agent[], night: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of visible) {
      if (a.plan !== 'mushroom') continue;
      const y = a.y - a.r * 2.2;
      const g = ctx.createRadialGradient(a.x, y, 1, a.x, y, a.r * 3.2);
      g.addColorStop(0, `${a.look.light}${Math.round(night * 110).toString(16).padStart(2, '0')}`);
      g.addColorStop(1, `${a.look.light}00`);
      ctx.fillStyle = g;
      ctx.fillRect(a.x - a.r * 3.2, y - a.r * 3.2, a.r * 6.4, a.r * 6.4);
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
    for (const p of this.particles) {
      if (p.x < x0 - 10 || p.x > x1 + 10) continue;
      const k = p.life / p.max;
      const alpha = p.kind === 'firefly' ? Math.sin(k * Math.PI) * (0.6 + 0.4 * Math.sin(this.t * 6 + p.x)) : 1 - k;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      if (p.kind === 'note') {
        ctx.font = '700 9px system-ui, sans-serif';
        ctx.fillText('♪', p.x, p.y);
      } else if (p.kind === 'zzz') {
        ctx.font = `700 ${6 + k * 4}px system-ui, sans-serif`;
        ctx.fillText('z', p.x, p.y);
      } else if (p.kind === 'heart') {
        ctx.font = '700 8px system-ui, sans-serif';
        ctx.fillText('♥', p.x - 3, p.y);
      } else if (p.kind === 'sparkle') {
        const r = 2.2 * (1 - k);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 2);
        ctx.lineTo(p.x + r * 0.5, p.y);
        ctx.lineTo(p.x, p.y + r * 2);
        ctx.lineTo(p.x - r * 0.5, p.y);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 8);
        ctx.fillRect(-1.5, -1, 3, 2);
        ctx.restore();
      } else {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.3, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawRain(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 160; i++) {
      const x = this.cam.x + ((hash(i) * this.viewW + this.t * 30) % this.viewW);
      const y = this.cam.y + ((hash(i + 99) * this.viewH + this.t * 260 * (0.8 + hash(i + 3) * 0.4)) % this.viewH);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 8);
    }
    ctx.stroke();
  }

  /** Name tags for the creature under the pointer, the selected one, your pet, and eggs close to the camera. */
  private drawTags(ctx: CanvasRenderingContext2D) {
    const keys = new Set([this.hovered, this.selected, this.pet].filter(Boolean) as string[]);
    for (const a of this.agents) if (a.egg && a.x > this.cam.x && a.x < this.cam.x + this.viewW) keys.add(a.c.key);
    for (const key of keys) {
      const a = this.byKey.get(key);
      if (!a || a.x < this.cam.x - 20 || a.x > this.cam.x + this.viewW + 20) continue;
      const hc = a.egg ? { x: 0, y: -a.r * 1.3, r: a.r * 1.6 } : a.c.fossil ? { x: 0, y: 0, r: a.r * 1.6 } : hitCircle(a.c, a.r, a);
      const sx = (a.x + hc.x - this.cam.x) * this.scale;
      const sy = (a.y + hc.y - hc.r - this.cam.y) * this.scale - 10;
      const text = a.egg ? `Egg · ${a.c.name}` : key === this.pet ? `♥ ${a.c.name}` : a.c.fossil ? `Fossil · ${a.c.name}` : a.c.name;
      ctx.font = '600 12px system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = a.egg ? 'rgba(255, 231, 160, 0.95)' : 'rgba(18, 20, 28, 0.82)';
      ctx.beginPath();
      ctx.roundRect(sx - tw / 2 - 8, sy - 16, tw + 16, 22, 11);
      ctx.fill();
      ctx.fillStyle = a.egg ? '#3a2800' : '#ffffff';
      ctx.fillText(text, sx - tw / 2, sy);
    }
  }

  /** The strip at the bottom: each lab's land in its color and the part you're looking at. */
  drawMinimap(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const k = w / this.layout.width;
    for (const b of this.layout.biomes) {
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(b.x0 * k, h * 0.3, Math.max(1, (b.x1 - b.x0) * k - 1), h * 0.4);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd46b';
    for (const a of this.agents) if (a.egg) ctx.fillRect(a.x * k - 1, h * 0.12, 2, h * 0.16);
    if (this.pet) {
      const a = this.byKey.get(this.pet);
      if (a) {
        ctx.fillStyle = '#ff5d7a';
        ctx.fillRect(a.x * k - 1, h * 0.72, 3, h * 0.2);
      }
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.cam.x * k, 1, Math.max(3, this.viewW * k), h - 2);
  }
}

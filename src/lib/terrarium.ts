import type { EvolutionLine } from './evolution';
import { daysBetween } from './format';
import type { ChangeEvent, LabSummary, Model, ModelType, OffersFile } from './types';

/**
 * The AI Terrarium: every card is a creature. What it is decides its species, its stats decide its body,
 * and the daily data decides its life: new releases hatch from eggs, retired models lie as fossils,
 * and a newer version leads its family. Pure and deterministic; the canvas lives in components/terrarium.
 */

export type BodyPlan = 'walker' | 'butterfly' | 'dragonfly' | 'bird' | 'bat' | 'mushroom' | 'ant' | 'owl' | 'beetle' | 'golem' | 'snail' | 'hedgehog';
/** Where a species spends its day. */
export type Habitat = 'ground' | 'air' | 'canopy' | 'rooted';

export interface Species {
  plan: BodyPlan;
  name: string;
  habitat: Habitat;
  /** One line for the field guide. */
  about: string;
}

export const SPECIES: Record<ModelType, Species> = {
  text: { plan: 'walker', name: 'Walker', habitat: 'ground', about: 'Talks, writes, and reasons. Roams the meadow in families.' },
  image: { plan: 'butterfly', name: 'Paintwing', habitat: 'air', about: 'Paints pictures from words. Flutters over the flowers.' },
  video: { plan: 'dragonfly', name: 'Reelfly', habitat: 'air', about: 'Films moving pictures. Darts about too fast to follow.' },
  audio: { plan: 'bird', name: 'Songbird', habitat: 'air', about: 'Reads text aloud. Sings from the treetops.' },
  voice: { plan: 'bird', name: 'Chatterbird', habitat: 'air', about: 'Holds a live conversation. Never stops chattering.' },
  transcription: { plan: 'bat', name: 'Echobat', habitat: 'canopy', about: 'Writes down what it hears. Hangs by day, hunts sounds by night.' },
  embedding: { plan: 'mushroom', name: 'Memorycap', habitat: 'rooted', about: 'Turns text into coordinates. Its threads link the whole lab underground.' },
  rerank: { plan: 'ant', name: 'Sorter ant', habitat: 'ground', about: 'Puts results in order. Marches in single file.' },
  vision: { plan: 'owl', name: 'Watcher', habitat: 'ground', about: 'Sees and labels what’s in a picture. Never blinks first.' },
  encoder: { plan: 'beetle', name: 'Meaning beetle', habitat: 'ground', about: 'Reads text into meaning. Scuttles under the leaves.' },
  forecast: { plan: 'snail', name: 'Timesnail', habitat: 'ground', about: 'Predicts what comes next in a series. Slow, patient, usually right.' },
  safety: { plan: 'hedgehog', name: 'Guardhog', habitat: 'ground', about: 'Screens for harm. Spikes up at the first sign of trouble.' },
  '3d': { plan: 'golem', name: 'Crystal golem', habitat: 'ground', about: 'Builds 3D objects. Made of the shapes it makes.' },
};

export interface Family {
  /** `lab/slug` of the evolution line. */
  line: string;
  name: string;
  /** 0 is the first generation. */
  stage: number;
  stages: number;
  /** The newest generation's key: the one the family follows. */
  lead: string;
  leadName: string;
}

export interface Creature {
  key: string;
  slug: string;
  name: string;
  lab: string;
  type: ModelType;
  /** 0–1: context window for models you call, parameters for open ones. */
  size: number;
  context: number | null;
  params: number | null;
  /** Tokens a second, as Hugging Face measured its fastest host; null when never measured. */
  speed: number | null;
  /** How fast it moves around, 0.4–2. */
  pace: number;
  /** Quality, 0–100, or null when no leaderboard lists it. */
  wit: number | null;
  holo: boolean;
  reasoning: boolean;
  tools: boolean;
  /** Takes images in: big eyes. */
  eyes: boolean;
  /** Takes audio in: ears. */
  ears: boolean;
  /** Puts audio out: it sings. */
  voice: boolean;
  family: Family | null;
  born: string;
  /** Released in the last week, so it arrives as an egg. */
  egg: boolean;
  fossil: boolean;
  /** Output price per 1M tokens, so an adopted creature can tell you when it changes. */
  price: number | null;
  /** Deterministic 0–1, for everything that should differ between creatures but never between visits. */
  seed: number;
}

export interface TerrariumData {
  creatures: Creature[];
  labs: Pick<LabSummary, 'key' | 'name' | 'color'>[];
  /** The data's own date, YYYY-MM-DD. */
  today: string;
  /** New cards the last sync found: tonight's weather. */
  hatchedToday: number;
  events: ChangeEvent[];
}

/** Eggs are the last week's releases. */
export const EGG_DAYS = 7;

const fnv = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const seedOf = (s: string) => fnv(s) / 4294967296;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Context from 4K (0) to 2M (1), or parameters from 100M (0) to 1T (1), on a log scale. */
export function sizeOf(m: Pick<Model, 'context' | 'hub'>): number {
  if (m.context) return clamp01(Math.log2(m.context / 4096) / Math.log2(2_000_000 / 4096));
  if (m.hub?.params) return clamp01(Math.log10(m.hub.params / 1e8) / 4);
  return 0.35;
}

/** Measured speed maps to pace; unmeasured creatures amble at a pace set by their bulk. */
export function paceOf(speed: number | null, size: number): number {
  if (speed) return Math.min(2, Math.max(0.4, 0.4 + Math.log10(speed / 10) * 0.8));
  return 0.7 + (1 - size) * 0.5;
}

/** Fastest measured host for each card. */
export function measuredSpeeds(offers: OffersFile): Record<string, { speed: number; latencyMs: number | null; provider: string; name: string; url: string }> {
  const out: ReturnType<typeof measuredSpeeds> = {};
  for (const [key, v] of Object.entries(offers.models)) {
    const best = v.hf.filter((h) => h.throughput).sort((a, b) => b.throughput! - a.throughput! || a.provider.localeCompare(b.provider))[0];
    if (best) out[key] = { speed: best.throughput!, latencyMs: best.latencyMs, provider: best.provider, name: best.name, url: best.url };
  }
  return out;
}

export function buildCreatures(models: Model[], lines: EvolutionLine[], speeds: Record<string, { speed: number }>, today: string): Creature[] {
  const byKey = new Map(models.map((m) => [m.key, m]));
  const family = new Map<string, Family>();
  for (const l of lines) {
    const lead = l.stages[l.stages.length - 1].key;
    l.stages.forEach((s, i) => {
      const f: Family = { line: `${l.lab}/${l.slug}`, name: l.name, stage: i, stages: l.stages.length, lead, leadName: byKey.get(lead)?.name ?? lead };
      for (const k of [s.key, ...s.variants]) if (!family.has(k)) family.set(k, f);
    });
  }
  return models.map((m) => {
    const size = sizeOf(m);
    const speed = speeds[m.key]?.speed ?? null;
    const age = daysBetween(m.releaseDate, today);
    return {
      key: m.key,
      slug: m.slug,
      name: m.name,
      lab: m.lab,
      type: m.type,
      size: Math.round(size * 100) / 100,
      context: m.context,
      params: m.hub?.params ?? null,
      speed,
      pace: Math.round(paceOf(speed, size) * 100) / 100,
      wit: m.quality?.value ?? null,
      holo: m.rarity === 'holo',
      reasoning: m.reasoning,
      tools: m.toolCall,
      eyes: m.input.includes('image') && m.type !== 'image' && m.type !== 'vision',
      ears: m.input.includes('audio'),
      voice: m.output.includes('audio'),
      family: family.get(m.key) ?? null,
      born: m.releaseDate,
      egg: m.status !== 'deprecated' && age >= 0 && age < EGG_DAYS,
      fossil: m.status === 'deprecated',
      price: m.price?.output ?? null,
      seed: seedOf(m.key),
    };
  });
}

export interface Biome {
  lab: string;
  name: string;
  color: string;
  x0: number;
  x1: number;
}

export interface WorldLayout {
  width: number;
  biomes: Biome[];
  /** Where each creature starts, along the ground. */
  home: Record<string, number>;
}

/** Room each living creature needs, in world units. */
const ROOM = 24;
const MIN_BIOME = 460;

/** Labs side by side, biggest first, each wide enough for its living creatures. Deterministic. */
export function layoutWorld(creatures: Creature[], labs: TerrariumData['labs']): WorldLayout {
  const living = new Map<string, Creature[]>();
  for (const c of creatures) if (!c.fossil) living.set(c.lab, [...(living.get(c.lab) ?? []), c]);
  const order = [...labs].filter((l) => living.has(l.key) || creatures.some((c) => c.lab === l.key)).sort((a, b) => (living.get(b.key)?.length ?? 0) - (living.get(a.key)?.length ?? 0) || a.key.localeCompare(b.key));
  const biomes: Biome[] = [];
  const home: Record<string, number> = {};
  let x = 0;
  for (const l of order) {
    const mine = creatures.filter((c) => c.lab === l.key);
    const width = Math.max(MIN_BIOME, 160 + (living.get(l.key)?.length ?? 0) * ROOM);
    biomes.push({ lab: l.key, name: l.name, color: l.color, x0: x, x1: x + width });
    for (const c of mine) home[c.key] = x + 90 + c.seed * (width - 180);
    x += width;
  }
  return { width: x, biomes, home };
}

export type Mood = 'egg' | 'fossil' | 'proud' | 'elder' | 'playful' | 'content';

export const MOOD_LABEL: Record<Mood, string> = {
  egg: 'Waiting to hatch',
  fossil: 'Fossilized',
  proud: 'Proud',
  elder: 'Wise elder',
  playful: 'Playful',
  content: 'Content',
};

/** A creature's mood and the real reason for it. */
export function moodOf(c: Creature, today: string): { mood: Mood; why: string } {
  if (c.fossil) return { mood: 'fossil', why: 'Its lab retired it, so it rests in the rock with the others from its year.' };
  if (c.egg) return { mood: 'egg', why: `Released ${c.born}. Tap the egg to hatch it.` };
  if (c.wit != null && c.wit >= 90) return { mood: 'proud', why: `It beats ${c.wit}% of the models on its leaderboard, and it knows it.` };
  if (c.family && c.family.lead !== c.key && c.family.stage < c.family.stages - 1) {
    return { mood: 'elder', why: `A newer generation, ${c.family.leadName}, leads the ${c.family.name} family now.` };
  }
  if (daysBetween(c.born, today) < 60) return { mood: 'playful', why: 'Still young: released in the last two months.' };
  return { mood: 'content', why: 'Nothing new to report. It likes it that way.' };
}

/** What an adopted creature remembers from the day you adopted it. */
export interface Adoption {
  key: string;
  at: string;
  wit: number | null;
  price: number | null;
  lead: string | null;
}

export const adopt = (c: Creature, today: string): Adoption => ({ key: c.key, at: today, wit: c.wit, price: c.price, lead: c.family?.lead ?? null });

/** News since you adopted it, straight from the data. */
export function petNews(c: Creature | undefined, a: Adoption, events: ChangeEvent[]): string[] {
  if (!c) return ['It left the binder: the lab took the model down. It lives on in your memory.'];
  const news: string[] = [];
  if (c.fossil) news.push('It retired and became a fossil. You can still visit it in the rock.');
  if (a.wit != null && c.wit != null && c.wit !== a.wit) news.push(`Its quality went ${c.wit > a.wit ? 'up' : 'down'} from ${a.wit} to ${c.wit}.`);
  if (a.wit == null && c.wit != null) news.push(`A leaderboard rated it for the first time: quality ${c.wit}.`);
  if (a.price != null && c.price != null && c.price !== a.price) {
    const pct = Math.round((Math.abs(c.price - a.price) / a.price) * 100);
    news.push(c.price < a.price ? `It got ${pct}% cheaper to run. It’s thrilled.` : `It got ${pct}% pricier. It’s a little embarrassed.`);
  }
  if (c.family && a.lead && c.family.lead !== a.lead && c.family.lead !== c.key) news.push(`A new generation hatched: ${c.family.leadName} now leads its family.`);
  for (const e of events) {
    if (e.key !== c.key || e.date < a.at) continue;
    if (e.kind === 'price' && e.before?.output != null && e.after?.output != null && !news.some((n) => n.includes('cheaper') || n.includes('pricier'))) {
      news.push(`${e.date}: its price moved from $${e.before.output} to $${e.after.output} per 1M tokens.`);
    }
  }
  return news.length ? news : ['All quiet since you adopted it. It’s happy you visit.'];
}

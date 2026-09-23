import type { ArtInput } from './art';
import type { EvolutionLine } from './evolution';
import { RARITY_RANK, TYPE_LABEL, daysBetween, formatCount, formatPrice, formatTokens } from './format';
import type { LabSummary, Model, ModelType } from './types';

/**
 * The AI Galaxy: every card is a star. Time is the radius, so the oldest models glow in the core
 * and each year is a wider ring; each lab is a spiral arm; each evolution line is a constellation.
 */

/** Hugging Face records this date for every repo it moved into its current database, not when the model came out. */
export const MIGRATION_DAY = '2022-03-02';
/** Day 0 of the timeline. Nothing in the data is dated earlier; older classics sit in the core from the start. */
export const GALAXY_START = '2022-01-01';

/** What the side panel needs to draw the card's own art. */
type StarArt = Omit<ArtInput, 'key' | 'lab'>;

export interface GalaxyStar extends StarArt {
  key: string;
  slug: string;
  name: string;
  lab: string;
  type: ModelType;
  /** Days after GALAXY_START when the star is born. Classics are 0. */
  day: number;
  /** Released before Hugging Face recorded dates, so the exact day isn't known. */
  classic: boolean;
  date: string;
  /** 0–1: how bright and large the star is. */
  magnitude: number;
  /** One short fact for the hover card: "1M context", "6.1M downloads". */
  stat: string;
  typeLabel: string;
  /** The evolution line this card leads a stage of, as `lab/slug`. */
  line: string | null;
  retired: boolean;
}

export interface GalaxyLine {
  id: string;
  lab: string;
  name: string;
  /** Stage leaders in order: the constellation's stars. */
  keys: string[];
}

export interface GalaxyData {
  stars: GalaxyStar[];
  labs: Pick<LabSummary, 'key' | 'name' | 'color' | 'count'>[];
  lines: GalaxyLine[];
  /** Days from GALAXY_START to the data's own date. */
  days: number;
  end: string;
}

const fnv = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** Deterministic 0–1 from a string, so the galaxy looks the same on every visit. */
export const hash01 = (s: string) => fnv(s) / 4294967296;

function statOf(m: Model): string {
  if (m.price?.output != null && m.price.output > 0) return `${formatPrice(m.price.output)} per 1M out`;
  if (m.context) return `${formatTokens(m.context)} context`;
  if (m.hub) return `${formatCount(m.hub.downloads)} downloads a month`;
  return TYPE_LABEL[m.type];
}

/** Slim star list for the browser: only what the galaxy draws and the hover card says. */
export function galaxyData(models: Model[], labs: LabSummary[], lines: EvolutionLine[], end: string): GalaxyData {
  const leadOf = new Map<string, string>();
  for (const l of lines) for (const s of l.stages) leadOf.set(s.key, `${l.lab}/${l.slug}`);
  const stars = models.map((m): GalaxyStar => {
    const classic = m.releaseDate <= MIGRATION_DAY;
    const brightness =
      0.22 +
      0.13 * RARITY_RANK[m.rarity] +
      (m.hub ? 0.07 * Math.log10(Math.max(1, m.hub.downloads / 1e5) + 1) * 3 : 0) +
      (leadOf.has(m.key) ? 0.12 : 0) -
      (m.status === 'deprecated' ? 0.1 : 0);
    return {
      key: m.key,
      slug: m.slug,
      name: m.name,
      lab: m.lab,
      type: m.type,
      day: classic ? 0 : Math.max(0, daysBetween(GALAXY_START, m.releaseDate)),
      classic,
      date: m.releaseDate,
      magnitude: Math.min(1, Math.max(0.15, brightness)),
      stat: statOf(m),
      typeLabel: TYPE_LABEL[m.type],
      line: leadOf.get(m.key) ?? null,
      retired: m.status === 'deprecated',
      context: m.context,
      reasoning: m.reasoning,
      toolCall: m.toolCall,
      input: m.input,
      attachment: m.attachment,
      structuredOutput: m.structuredOutput,
      rarity: m.rarity,
    };
  });
  return {
    stars,
    labs: labs.map(({ key, name, color, count }) => ({ key, name, color, count })),
    lines: lines.map((l) => ({ id: `${l.lab}/${l.slug}`, lab: l.lab, name: l.name, keys: l.stages.map((s) => s.key) })),
    days: Math.max(1, daysBetween(GALAXY_START, end.slice(0, 10))),
    end: end.slice(0, 10),
  };
}

/** The galaxy's radius in world units. */
export const R = 100;
/** How far each arm winds from core to rim, in radians. */
export const TWIST = 2.4;

export interface GalaxyLayout {
  /** x, y, z per star, same order as `data.stars`. */
  positions: Float32Array;
  /** Each lab's arm: its angle at the core and how wide it is. */
  arms: Record<string, { angle: number; width: number }>;
  /** Radius the galaxy has grown to by a given day. */
  radiusAt: (day: number) => number;
  /** Where a point sits for a given lab, radius, and offset within the arm (−0.5 to 0.5). */
  place: (lab: string, radius: number, offset: number, lift?: number) => [number, number, number];
  /** Rings for each new year, with the radius the galaxy had reached. */
  years: { year: number; radius: number }[];
}

/** Lays out every star. Pure and deterministic: same data, same galaxy. */
export function layoutGalaxy(data: GalaxyData): GalaxyLayout {
  const n = data.stars.length;
  // Arms: sized by the square root of each lab's count so small labs still show; big labs dealt apart.
  const sorted = [...data.labs].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const order = [...sorted.filter((_, i) => i % 2 === 0), ...sorted.filter((_, i) => i % 2 === 1)];
  const weights = order.map((l) => Math.sqrt(l.count));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const arms: GalaxyLayout['arms'] = {};
  let at = 0;
  order.forEach((l, i) => {
    const width = (weights[i] / total) * Math.PI * 2;
    arms[l.key] = { angle: at + width / 2, width };
    at += width;
  });

  // Radius from release order: classics first, then by day. Square root keeps the disk evenly filled.
  const ranked = data.stars
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.day - b.s.day || hash01(a.s.key) - hash01(b.s.key));
  const radius = new Float32Array(n);
  ranked.forEach(({ i }, rank) => (radius[i] = R * Math.sqrt((rank + 0.5) / n)));
  const days = ranked.map(({ s }) => s.day);
  const radiusAt = (day: number) => {
    let born = 0;
    // Stars born on or before `day`; `days` is sorted.
    let lo = 0;
    let hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= day) lo = mid + 1;
      else hi = mid;
    }
    born = lo;
    return R * Math.sqrt(Math.max(born, 0.5) / n);
  };

  const place = (lab: string, r: number, offset: number, lift = 0): [number, number, number] => {
    const arm = arms[lab] ?? { angle: 0, width: 0.3 };
    const angle = arm.angle + offset * arm.width * 0.86 + TWIST * (r / R);
    const thickness = R * 0.05 * (1 - 0.75 * (r / R)) + R * 0.006;
    return [Math.cos(angle) * r, lift * thickness, Math.sin(angle) * r];
  };

  // Lines run in their own lanes of the arm, so a constellation reads as a chain reaching outward.
  const lanes = new Map<string, number>();
  for (const lab of data.labs) {
    const own = data.lines.filter((l) => l.lab === lab.key);
    own.forEach((l, i) => lanes.set(l.id, own.length === 1 ? 0 : -0.38 + (0.76 * i) / (own.length - 1)));
  }

  const positions = new Float32Array(n * 3);
  data.stars.forEach((s, i) => {
    const seed = hash01(s.key);
    const lane = s.line ? lanes.get(s.line) : undefined;
    // Stars off any line spread across the arm, thicker toward its middle.
    const offset = lane != null ? lane + (hash01(`${s.key}:j`) - 0.5) * 0.08 : (seed + hash01(`${s.key}:b`) - 1) * 0.5;
    const [x, y, z] = place(s.lab, radius[i], offset, hash01(`${s.key}:y`) * 2 - 1);
    positions.set([x, y, z], i * 3);
  });

  const endYear = Number(data.end.slice(0, 4));
  const years: GalaxyLayout['years'] = [];
  for (let year = Number(GALAXY_START.slice(0, 4)) + 1; year <= endYear; year++) {
    years.push({ year, radius: radiusAt(daysBetween(GALAXY_START, `${year}-01-01`) - 1) });
  }
  return { positions, arms, radiusAt, place, years };
}

/** "Mar 2024" for a timeline day. */
export function dayLabel(day: number): { year: string; month: string } {
  const d = new Date(Date.parse(`${GALAXY_START}T00:00:00Z`) + Math.round(day) * 864e5);
  return { year: String(d.getUTCFullYear()), month: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) };
}

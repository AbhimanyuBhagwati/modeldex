import changesRaw from '../../data/changes.json';
import raw from '../../data/models.json';
import offersRaw from '../../data/offers.json';
import scoresRaw from '../../data/scores.json';
import { buildLines, type EvolutionLine } from './evolution';
import { INPUT_ONLY } from './format';
import type { Signals } from './match';
import { percentile } from './quality';
import type { Racer } from './race';
import { buildCreatures, measuredSpeeds, type TerrariumData } from './terrarium';
import type { CardScores, ChangeEvent, Dataset, LabSummary, Model, OffersFile, Quality, ScoresFile } from './types';

/** Validated by the sync job before it is ever committed, and again in the test suite. Server-only: pages pass slices to the browser. */
const offers = offersRaw as unknown as OffersFile;
const scores = scoresRaw as unknown as ScoresFile;
const changes = (changesRaw as unknown as { events: ChangeEvent[] }).events;

function qualityOf(key: string): Quality | null {
  const s = scores.models[key];
  const count = s?.basis ? scores.boards[s.basis]?.count : undefined;
  if (s?.quality == null || !s.basis || !count) return null;
  return { value: s.quality, basis: s.basis, rank: s.boards[s.basis]!.rank, of: count };
}

/** Every card carries its headline quality, so the binder, compare, and battle can all show it. */
const loaded = raw as unknown as Dataset;
const dataset: Dataset = { ...loaded, models: loaded.models.map((m) => ({ ...m, quality: qualityOf(m.key) })) };

const byKey = new Map(dataset.models.map((m) => [m.key, m]));
const labsByKey = new Map(dataset.labs.map((l) => [l.key, l]));

export const getDataset = () => dataset;
export const getModel = (lab: string, slug: string) => byKey.get(`${lab}/${slug}`);
export const getModelByKey = (key: string) => byKey.get(key);
export const getLab = (key: string) => labsByKey.get(key) as LabSummary;

const live = (m: Model) => m.status !== 'deprecated';
const newestFirst = (a: Model, b: Model) => b.releaseDate.localeCompare(a.releaseDate) || b.set - a.set;

export const newestModels = (n: number) => dataset.models.filter(live).sort(newestFirst).slice(0, n);

export const moreFromLab = (m: Model, n: number) =>
  dataset.models.filter((x) => x.lab === m.lab && x.key !== m.key && live(x)).sort(newestFirst).slice(0, n);

/** Current models from other labs priced closest to this one, for "face off" suggestions. */
export function rivalsOf(m: Model, n: number): Model[] {
  const out = m.price?.output;
  if (out == null) return [];
  const seen = new Set<string>();
  return dataset.models
    .filter((x) => x.lab !== m.lab && live(x) && x.status !== 'preview' && x.price?.output != null && x.type === m.type)
    .sort((a, b) => Math.abs(Math.log((a.price!.output! + 0.01) / (out + 0.01))) - Math.abs(Math.log((b.price!.output! + 0.01) / (out + 0.01))) || newestFirst(a, b))
    .filter((x) => (seen.has(x.lab) ? false : (seen.add(x.lab), true)))
    .slice(0, n);
}

/** A fair fight for battle mode: the closest rival by price, else the nearest in downloads, else the newest of the same type. */
export function opponentFor(m: Model): Model | undefined {
  const rival = rivalsOf(m, 1)[0];
  if (rival) return rival;
  const pool = dataset.models.filter((x) => x.lab !== m.lab && live(x) && x.type === m.type);
  const own = m.hub?.downloads;
  const popular = pool.filter((x) => x.hub);
  if (own != null && popular.length) {
    const distance = (x: Model) => Math.abs(Math.log((x.hub!.downloads + 1) / (own + 1)));
    return popular.sort((a, b) => distance(a) - distance(b) || newestFirst(a, b))[0];
  }
  return pool.sort(newestFirst)[0];
}

/** Showcase fights for the battle lobby: the newest flagships, the most downloaded open models, and the top image models. */
export function featuredBattles(): { title: string; keys: [string, string] }[] {
  const ms = dataset.models.filter((m) => live(m) && m.status !== 'preview');
  const twoLabs = (list: Model[]): [string, string] | null => {
    const first = list[0];
    const second = first && list.find((m) => m.lab !== first.lab);
    return first && second ? [first.key, second.key] : null;
  };
  const downloads = (a: Model, b: Model) => (b.hub?.downloads ?? 0) - (a.hub?.downloads ?? 0);
  const picks = [
    { title: 'Flagship clash', keys: twoLabs(ms.filter((m) => m.type === 'text' && m.rarity === 'holo').sort(newestFirst)) },
    { title: 'Crowd favorites', keys: twoLabs(ms.filter((m) => m.type === 'text' && m.hub).sort(downloads)) },
    { title: 'Embedding duel', keys: twoLabs(ms.filter((m) => m.type === 'embedding' && m.hub).sort(downloads)) },
    { title: 'Image showdown', keys: twoLabs(ms.filter((m) => m.type === 'image').sort((a, b) => downloads(a, b) || newestFirst(a, b))) },
  ];
  return picks.filter((p): p is { title: string; keys: [string, string] } => p.keys != null);
}

/** Where to run a card: every provider selling it, and Hugging Face's hosts for open models. */
export const whereToRun = (key: string) => offers.models[key] ?? null;
export const providerInfo = (id: string) => offers.providers[id];

export const labModels = (lab: string) => dataset.models.filter((m) => m.lab === lab).sort(newestFirst);

/** A card's public benchmark scores, with the size and date of each board. */
export const scoresOf = (key: string): CardScores | null => scores.models[key] ?? null;
export const scoreBoards = () => scores.boards;
export const scoresUpdatedAt = () => scores.updatedAt;

/**
 * What the matchmaker needs beyond the card: a price to hold against the budget and the card's leaderboard places.
 * The price is the lab's own when it lists one; otherwise the cheapest paid host, since free reseller tiers come and go.
 */
export function matchSignals(models: Model[]): Record<string, Signals> {
  const out: Record<string, Signals> = {};
  for (const m of models) {
    const inputOnly = INPUT_ONLY.has(m.type);
    const own = inputOnly ? m.price?.input : m.price?.output;
    const run = offers.models[m.key];
    const hosted = [...(run?.offers ?? []), ...(run?.hf ?? [])].map((o) => (inputOnly ? o.input : o.output)).filter((v): v is number => v != null && v > 0);
    const s = scores.models[m.key];
    out[m.key] = {
      price: own ?? (hosted.length ? Math.min(...hosted) : null),
      boards: Object.fromEntries(
        Object.entries(s?.boards ?? {}).flatMap(([b, v]) => {
          const count = scores.boards[b as keyof typeof scores.boards]?.count;
          return v && count ? [[b, { p: percentile(v.rank, count), rank: v.rank }]] : [];
        }),
      ),
      bench: s?.bench ?? {},
    };
  }
  return out;
}

let speeds: ReturnType<typeof measuredSpeeds> | null = null;
/** Each card's fastest measured host on Hugging Face: tokens a second and first-token delay. */
export const speedsOf = () => (speeds ??= measuredSpeeds(offers));

/** Every live model Hugging Face has timed, for Race the machine. */
export function racers(): Racer[] {
  const speeds = speedsOf();
  return dataset.models
    .filter((m) => m.status !== 'deprecated' && speeds[m.key]?.latencyMs != null)
    .map((m) => {
      const s = speeds[m.key];
      return { key: m.key, name: m.name, lab: m.lab, speed: s.speed, latencyMs: s.latencyMs!, host: s.name, url: s.url };
    });
}

/** Every card as a creature, for the Terrarium. */
export function terrariumData(): TerrariumData {
  const today = dataset.updatedAt.slice(0, 10);
  const newest = changes[0]?.date;
  return {
    creatures: buildCreatures(dataset.models, evolutionLines(), speedsOf(), today),
    labs: dataset.labs.map(({ key, name, color }) => ({ key, name, color })),
    today,
    hatchedToday: newest ? changes.filter((e) => e.date === newest && e.kind === 'added').length : 0,
    events: changes.filter((e) => e.kind === 'price' || e.kind === 'retired'),
  };
}

/** Everything the daily sync logged in the last 90 days, newest first. */
export const changeLog = (): ChangeEvent[] => changes;

let lines: EvolutionLine[] | null = null;
/** Every evolution line: a series with two or more versions, like GPT 3.5 → 4 → 4o → 5. */
export const evolutionLines = () => (lines ??= buildLines(dataset.models));
export const linesForLab = (lab: string) => evolutionLines().filter((l) => l.lab === lab);
export const getLine = (lab: string, slug: string) => evolutionLines().find((l) => l.lab === lab && l.slug === slug);

/** The line a card belongs to and its stage, whether it leads that stage or is one of its variants. */
export function lineOf(key: string): { line: EvolutionLine; stage: number } | null {
  for (const line of evolutionLines()) {
    const stage = line.stages.findIndex((s) => s.key === key || s.variants.includes(key));
    if (stage >= 0) return { line, stage };
  }
  return null;
}

export function stats() {
  const ms = dataset.models.filter(live);
  return {
    cards: dataset.models.length,
    types: new Set(ms.map((m) => m.type)).size,
    labs: dataset.labs.length,
    openWeights: ms.filter((m) => m.openWeights).length,
    free: ms.filter((m) => m.access === 'free').length,
    holo: ms.filter((m) => m.rarity === 'holo').length,
    rated: ms.filter((m) => m.quality).length,
  };
}

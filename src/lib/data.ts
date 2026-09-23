import raw from '../../data/models.json';
import type { Dataset, LabSummary, Model } from './types';

/** Validated by the sync job before it is ever committed, and again in the test suite. */
const dataset = raw as unknown as Dataset;

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

export function stats() {
  const ms = dataset.models.filter(live);
  return {
    cards: dataset.models.length,
    types: new Set(ms.map((m) => m.type)).size,
    labs: dataset.labs.length,
    openWeights: ms.filter((m) => m.openWeights).length,
    free: ms.filter((m) => m.access === 'free').length,
    holo: ms.filter((m) => m.rarity === 'holo').length,
  };
}

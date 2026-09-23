import type { Bench, Board, CardScores, Dataset, Model, ModelType, ScoresFile } from '@/lib/types';
import { percentile } from '@/lib/quality';
import { normalizeName } from './build';
import { idCore } from './offers';

/**
 * Public benchmark scores, matched to cards. Two sources, both CC BY 4.0:
 * Epoch AI's Benchmarking Hub (its Capabilities Index and the benchmarks it runs itself) and
 * LMArena's leaderboard dataset. Epoch's copies of other groups' leaderboards carry those groups' own
 * terms, so they're left out. Pure: CSV text and arena rows in, `data/scores.json` out.
 */

/** RFC 4180 CSV: quoted fields may hold commas, quotes, and newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  if (field || row.length) endRow();
  const [head, ...body] = rows;
  if (!head) return [];
  return body.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^\uFEFF/, ''), r[i] ?? ''])));
}

/** Epoch's CSVs, from its benchmark_data.zip. */
export interface EpochInput {
  /** `epoch_capabilities_index/eci_scores.csv` */
  eci: string;
  /** `model_metadata.csv`: which API model versions belong to each model. */
  metadata: string;
  bench: Partial<Record<Bench, string>>;
}

/** The files, inside benchmark_data.zip, for the benchmarks Epoch runs itself. */
export const BENCH_FILES: Record<Bench, string> = {
  gpqa: 'gpqa_diamond.csv',
  swe: 'swe_bench_verified.csv',
  frontiermath: 'frontiermath_tiers_1_3_v2.csv',
  aime: 'otis_mock_aime_2024_2025.csv',
  simpleqa: 'simpleqa_verified.csv',
};

export interface ArenaRow {
  model_name: string;
  rating: number;
  category: string;
  leaderboard_publish_date?: string | null;
}

/** LMArena's dataset has a config per arena; boards are one config and category each. */
export const ARENA_BOARDS: Record<Exclude<Board, 'eci'>, { config: string; category: string }> = {
  text: { config: 'text', category: 'overall' },
  coding: { config: 'text', category: 'coding' },
  math: { config: 'text', category: 'math' },
  creative: { config: 'text', category: 'creative_writing' },
  webdev: { config: 'webdev', category: 'overall' },
  vision: { config: 'vision', category: 'overall' },
  image: { config: 'text_to_image', category: 'overall' },
  'image-edit': { config: 'image_edit', category: 'overall' },
  video: { config: 'text_to_video', category: 'overall' },
  'image-video': { config: 'image_to_video', category: 'overall' },
};
export const ARENA_CONFIGS = [...new Set(Object.values(ARENA_BOARDS).map((b) => b.config))];

/** Which board the card's headline number comes from, first one that has the card. */
const BASIS: Partial<Record<ModelType, Board[]>> = {
  text: ['eci', 'text', 'webdev', 'vision'],
  image: ['image', 'image-edit'],
  video: ['video', 'image-video'],
};

/** Reasoning effort, thinking budgets, and output sizes: the same model at a different setting. */
const SETTING = /[-_ ](none|minimal|low|medium|high|xhigh|max|thinking(-\d+k)?|\d{3,4}p|[24]k|audio)$/;
/** Snapshots and previews: close to the model, but not quite it. Only used when nothing closer matches. */
const SNAPSHOT = /[-_ ](\d{8}|\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|preview|latest|exp(erimental)?|generate(-\d{3})?|\d{3})$/;
/** A bracket naming a date or preview marks a snapshot, "GPT-4o (May 2024)"; any other names a setting, "gpt-image-2 (medium)". */
/** What a card's name can drop and still be the model a board lists: "Gemini 3 Pro Preview" is `gemini-3-pro`. Dates stay. */
const UNRELEASED = /[-_ ](preview|latest|exp(erimental)?|generate(-\d{3})?|\d{3})$/;
const DATED = /\d{4}|^\d+$|preview|beta|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/;
const BRACKET = /\s*[([]([^)\]]*)[)\]]/g;

/** Removes a suffix pattern until none is left: "gpt-4.1-mini-2025-04-14-preview" loses both. */
const strip = (s: string, re: RegExp) => {
  let out = s;
  for (let next = out.replace(re, ''); next !== out; next = out.replace(re, '')) out = next;
  return out;
};
/** "mistral-medium" is a name, not Mistral at medium effort: only strip settings when a version number is left. */
const calm = (s: string) => {
  const out = strip(s, SETTING);
  return /\d/.test(out) ? out : s;
};
/** "o3" is a real name; "ai" is not. */
const usable = (c: string) => c.length >= 3 || (c.length === 2 && /\d/.test(c));

/** A leaderboard name's cores, from most to least specific: exact, another setting, a snapshot. */
export function rowCores(name: string): [string[], string[], string[]] {
  const tail = name.trim().toLowerCase().split('/').pop() ?? '';
  const settings = tail.replace(BRACKET, (all, inner: string) => (DATED.test(inner) ? all : '')).trim();
  const undated = tail.replace(BRACKET, '').trim();
  const levels = [[tail], [calm(settings)], [strip(undated, SNAPSHOT), calm(strip(calm(undated), SNAPSHOT))]];
  return levels.map((l) => [...new Set(l.map(normalizeName))].filter(usable)) as [string[], string[], string[]];
}

const SUFFIXES = ['instruct', 'it', 'chat'];

/** The same core with and without the usual instruct suffixes: Gemma 3 27B is listed as `gemma-3-27b-it`. */
function suffixed(cores: string[]): string[] {
  const out = new Set<string>();
  for (const c of cores) {
    for (const s of SUFFIXES) {
      out.add(c + s);
      if (c.endsWith(s) && usable(c.slice(0, -s.length))) out.add(c.slice(0, -s.length));
    }
  }
  return [...out].filter((c) => !cores.includes(c));
}

/**
 * Every core a card answers to. Unlike reseller matching, the card's name keeps its brackets:
 * "GPT-4o (2024-08-06)" and "Qwen3-Next 80B-A3B (Thinking)" are not GPT-4o and Qwen3-Next.
 * Loose cores drop preview marks, so "gemini-3-pro" can still find the Gemini 3 Pro Preview card,
 * but keep dates, brackets, and tiers: "flux-2-max" is not FLUX.2 [dev].
 */
function scoreCores(m: Model): { own: string[]; suffixed: string[]; loose: string[] } {
  const names = [m.name, m.id, m.slug, ...(m.hub ? [m.hub.repo.split('/')[1]] : [])];
  const own = [...new Set([normalizeName(m.name), idCore(m.id), ...names.slice(2).map(normalizeName)])].filter(usable);
  const loose = [...new Set(names.map((n) => normalizeName(strip(n.toLowerCase().split('/').pop() ?? '', UNRELEASED))))].filter(usable);
  return { own, suffixed: suffixed(own), loose: [...loose, ...suffixed(loose)] };
}

interface Entry {
  names: string[];
  score: number;
}

interface Match {
  score: number;
  as: string;
  /** 0: the model at some setting. 1: a snapshot or preview of it. */
  tier: number;
}

type CardIndex = Record<'exact' | 'loose', Map<string, string[]>>;

/**
 * Card-core index; the same core may belong to several cards (an API card and its open-weights repo).
 * Base models are left out: leaderboards rank the chat model, and `gemma-4-31b` on LMArena is Gemma 4 31B IT, not the
 * pretrained weights beside it.
 */
function indexCards(models: Model[]): CardIndex {
  const cores = new Map(models.map((m) => [m.key, scoreCores(m)]));
  const everyOwn = new Set([...cores.values()].flatMap((c) => c.own));
  const isBase = (m: Model) =>
    /\bbase\b/i.test(m.name) || cores.get(m.key)!.own.some((c) => !SUFFIXES.some((s) => c.endsWith(s)) && SUFFIXES.some((s) => everyOwn.has(c + s)));
  const index: CardIndex = { exact: new Map(), loose: new Map() };
  const add = (map: Map<string, string[]>, core: string, key: string) => map.set(core, [...new Set([...(map.get(core) ?? []), key])]);
  for (const m of models) {
    if (isBase(m)) continue;
    const c = cores.get(m.key)!;
    for (const core of [...c.own, ...c.suffixed]) add(index.exact, core, m.key);
    for (const core of c.loose) add(index.loose, core, m.key);
  }
  return index;
}

/**
 * Finds each card's entries. An entry goes to the cards its most specific core names, and a card keeps its closest
 * entries, best score first. So `claude-opus-4-6-high` counts for Claude Opus 4.6, but `kimi-k2-thinking` never
 * counts for Kimi K2 when a Kimi K2 Thinking card exists.
 */
function matchEntries(entries: Entry[], index: CardIndex): Map<string, Match> {
  const best = new Map<string, Match>();
  const find = (map: Map<string, string[]>, cores: string[]) => new Set(cores.flatMap((c) => map.get(c) ?? []));
  for (const e of entries) {
    const levels = e.names.map(rowCores);
    const at = (i: number) => levels.flatMap((l) => l[i]);
    const tries: [Set<string>, number][] = [
      [find(index.exact, at(0)), 0],
      [find(index.exact, at(1)), 0],
      [find(index.exact, at(2)), 1],
      [find(index.loose, [...at(0), ...at(1), ...at(2)]), 1],
    ];
    const hit = tries.find(([keys]) => keys.size);
    if (!hit) continue;
    const [keys, tier] = hit;
    for (const key of keys) {
      const had = best.get(key);
      if (!had || tier < had.tier || (tier === had.tier && e.score > had.score)) best.set(key, { score: e.score, as: e.names[0], tier });
    }
  }
  return best;
}

const VARIANT_MARKS = new Set(['vl', 'vision', 'audio', 'omni', 'coder', 'math']);

/**
 * Epoch files some versions under a model that aren't quite it: aliases like `deepseek-chat`, whose target moves,
 * and variants like Qwen2.5-VL under Qwen2.5. Those would lend a score to the wrong card.
 */
function usableVersion(version: string, group: string): boolean {
  if (!version || !/\d/.test(version)) return false;
  const marks = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => VARIANT_MARKS.has(t));
  const own = new Set(marks(group));
  return marks(version).every((t) => own.has(t));
}

const num = (s: string | undefined) => (s != null && s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null);

/** Places by score, ties sharing the better place. */
function ranks(entries: Entry[]): Map<Entry, number> {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const out = new Map<Entry, number>();
  sorted.forEach((e, i) => out.set(e, i > 0 && sorted[i - 1].score === e.score ? out.get(sorted[i - 1])! : i + 1));
  return out;
}


export interface ScoresInput {
  /** Null when the download failed; the previous file's Epoch scores are kept. */
  epoch: EpochInput | null;
  /** Rows per LMArena config; a missing config keeps the previous file's scores for its boards. */
  arena: Partial<Record<string, ArenaRow[]>>;
}

export function buildScores(dataset: Dataset, input: ScoresInput, updatedAt: string, previous: ScoresFile | null = null): ScoresFile {
  const index = indexCards(dataset.models);
  const boards: ScoresFile['boards'] = {};
  const bench: ScoresFile['bench'] = {};
  const perCard = new Map<string, { boards: CardScores['boards']; bench: CardScores['bench'] }>();
  const slot = (key: string) => perCard.get(key) ?? perCard.set(key, { boards: {}, bench: {} }).get(key)!;
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

  const addBoard = (board: Board, entries: Entry[], published: string | null) => {
    if (!entries.length) return;
    const place = ranks(entries);
    boards[board] = { count: entries.length, published };
    const rankOf = new Map(entries.map((e) => [e.names[0], place.get(e)!]));
    for (const [key, m] of matchEntries(entries, index)) {
      slot(key).boards[board] = { score: round(m.score, board === 'eci' ? 1 : 0), rank: rankOf.get(m.as)!, as: m.as };
    }
  };
  const carry = (board: Board) => {
    if (!previous?.boards[board]) return;
    boards[board] = previous.boards[board];
    for (const [key, s] of Object.entries(previous.models)) if (s.boards[board] && dataset.models.some((m) => m.key === key)) slot(key).boards[board] = s.boards[board];
  };

  if (input.epoch) {
    // Epoch lists API versions (`claude-opus-4-7_high`) under each model; they help match cards named by id.
    const versions = new Map<string, string[]>();
    for (const r of parseCsv(input.epoch.metadata)) {
      if (r.model_group && usableVersion(r.model_version, r.model_group)) versions.set(r.model_group, [...(versions.get(r.model_group) ?? []), r.model_version]);
    }
    const eci: Entry[] = [];
    let published: string | null = null;
    for (const r of parseCsv(input.epoch.eci)) {
      const score = num(r.eci);
      if (score == null || !r.Model) continue;
      eci.push({ names: [...new Set([r['Display name'] || r.Model, r.Model, ...(versions.get(r.Model) ?? [])])], score });
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.date) && (!published || r.date > published)) published = r.date;
    }
    addBoard('eci', eci, published);

    for (const [id, csv] of Object.entries(input.epoch.bench) as [Bench, string][]) {
      const runs: Entry[] = [];
      for (const r of parseCsv(csv)) {
        const score = num(r['Best score (across scorers)']) ?? num(r.mean_score);
        if (score != null && r['Model version'] && score >= 0 && score <= 1) runs.push({ names: [r['Model version']], score });
      }
      if (!runs.length) continue;
      bench[id] = { count: runs.length };
      for (const [key, m] of matchEntries(runs, index)) slot(key).bench[id] = round(m.score, 3);
    }
  } else {
    carry('eci');
    if (previous) {
      Object.assign(bench, previous.bench);
      for (const [key, s] of Object.entries(previous.models)) if (Object.keys(s.bench).length && dataset.models.some((m) => m.key === key)) slot(key).bench = s.bench;
    }
  }

  for (const [board, { config, category }] of Object.entries(ARENA_BOARDS) as [Exclude<Board, 'eci'>, { config: string; category: string }][]) {
    const rows = input.arena[config];
    if (!rows) {
      carry(board);
      continue;
    }
    const mine = rows.filter((r) => r.category === category && r.model_name && Number.isFinite(r.rating));
    const published = mine.map((r) => r.leaderboard_publish_date ?? '').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1) ?? null;
    addBoard(board, mine.map((r) => ({ names: [r.model_name], score: r.rating })), published);
  }

  const types = new Map(dataset.models.map((m) => [m.key, m.type]));
  const models: ScoresFile['models'] = {};
  for (const key of [...perCard.keys()].sort()) {
    const s = perCard.get(key)!;
    const basis = (BASIS[types.get(key)!] ?? []).find((b) => s.boards[b]) ?? null;
    models[key] = { quality: basis ? percentile(s.boards[basis]!.rank, boards[basis]!.count) : null, basis, boards: s.boards, bench: s.bench };
  }
  return { version: 1, updatedAt, boards, bench, models };
}

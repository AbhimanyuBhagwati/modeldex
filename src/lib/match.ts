import { INPUT_ONLY, formatCount, formatMonth, formatPrice, formatTokens } from './format';
import { BENCH_INFO, BOARD_INFO } from './quality';
import type { Bench, Board, Model, ModelType } from './types';

/**
 * The Model Matchmaker: four answers in, the three best cards out, each with a one-line reason.
 * Pure and deterministic, on data the site already has: no model is called and nothing leaves the browser.
 */

export const TASKS = {
  chat: { label: 'Chat and writing', blurb: 'Answers, emails, stories, summaries', noun: 'writing', types: ['text'] },
  code: { label: 'Coding', blurb: 'Write, fix, and review code; build apps', noun: 'coding', types: ['text'] },
  reason: { label: 'Math and hard problems', blurb: 'Science, analysis, research, proofs', noun: 'reasoning', types: ['text'] },
  image: { label: 'Make images', blurb: 'Pictures from a prompt, or edits', noun: 'image', types: ['image'] },
  video: { label: 'Make video', blurb: 'Clips from a prompt or a photo', noun: 'video', types: ['video'] },
  voice: { label: 'Voice and audio', blurb: 'Transcribe, speak, or talk live', noun: 'voice', types: ['audio', 'voice', 'transcription'] },
  search: { label: 'Search and RAG', blurb: 'Embeddings that find the right passage', noun: 'retrieval', types: ['embedding'] },
} satisfies Record<string, { label: string; blurb: string; noun: string; types: ModelType[] }>;
export type Task = keyof typeof TASKS;

export const BUDGETS = {
  free: { label: 'Free', blurb: 'Free to call, or free to download', max: 0 },
  low: { label: 'Under $1', blurb: 'Per million output tokens', max: 1 },
  mid: { label: 'Under $10', blurb: 'Per million output tokens', max: 10 },
  any: { label: 'Whatever it takes', blurb: 'Just the best', max: Number.POSITIVE_INFINITY },
} as const;
export type Budget = keyof typeof BUDGETS;

export const ACCESS = {
  either: { label: 'Either is fine', blurb: 'Show me the best of both' },
  open: { label: 'Open weights', blurb: 'I want to run it myself' },
  api: { label: 'Paid API', blurb: 'Someone else runs it' },
} as const;
export type AccessPref = keyof typeof ACCESS;

interface NeedDef {
  label: string;
  blurb: string;
  tasks: Task[];
  test: (m: Model) => boolean;
}

const TEXT_TASKS: Task[] = ['chat', 'code', 'reason'];

export const NEEDS = {
  images: { label: 'Reads images', blurb: 'Screenshots, charts, photos', tasks: TEXT_TASKS, test: (m) => m.input.includes('image') },
  tools: { label: 'Calls tools', blurb: 'Function calling, for agents', tasks: TEXT_TASKS, test: (m) => m.toolCall },
  long: { label: 'Long documents', blurb: '200K tokens or more at once', tasks: TEXT_TASKS, test: (m) => (m.context ?? 0) >= 200_000 },
  edit: { label: 'Edits my images', blurb: 'Takes a picture in, too', tasks: ['image'], test: (m) => m.input.includes('image') },
  animate: { label: 'Starts from a photo', blurb: 'Image to video', tasks: ['video'], test: (m) => m.input.includes('image') },
  listen: { label: 'Transcribes speech', blurb: 'Audio in, text out', tasks: ['voice'], test: (m) => m.type === 'transcription' || (m.type === 'voice' && m.input.includes('audio')) },
  speak: { label: 'Speaks text aloud', blurb: 'Text in, audio out', tasks: ['voice'], test: (m) => m.type === 'audio' || (m.type === 'voice' && m.output.includes('audio')) },
  live: { label: 'Live conversation', blurb: 'Real-time voice', tasks: ['voice'], test: (m) => m.type === 'voice' },
  rerank: { label: 'A reranker instead', blurb: 'Reorders results you already found', tasks: ['search'], test: (m) => m.type === 'rerank' },
} satisfies Record<string, NeedDef>;
export type Need = keyof typeof NEEDS;

export const needsFor = (task: Task) => (Object.keys(NEEDS) as Need[]).filter((n) => (NEEDS[n].tasks as Task[]).includes(task));

export interface Answers {
  task: Task;
  budget: Budget;
  needs: Need[];
  access: AccessPref;
}

/** What the matchmaker knows about a card beyond the card itself. */
export interface Signals {
  /** Cheapest known price per 1M tokens, anywhere it's sold: output tokens, or input for embedders and rerankers. */
  price: number | null;
  /** Share of each board this card beats, 0–100, and its place. */
  boards: Partial<Record<Board, { p: number; rank: number }>>;
  /** Epoch's own benchmark runs, 0–1. */
  bench: Partial<Record<Bench, number>>;
}

/** How much each leaderboard counts toward a task. Benchmarks count their share solved, 0–100. */
export const WEIGHTS: Partial<Record<Task, Partial<Record<Board | Bench, number>>>> = {
  chat: { text: 0.45, creative: 0.35, eci: 0.2 },
  code: { coding: 0.35, eci: 0.25, webdev: 0.2, swe: 0.2 },
  reason: { eci: 0.4, math: 0.3, gpqa: 0.15, frontiermath: 0.15 },
  image: { image: 0.7, 'image-edit': 0.3 },
  video: { video: 0.7, 'image-video': 0.3 },
};

const isBench = (k: string): k is Bench => k in BENCH_INFO;

/** A fact a reason can quote: "#6 of 397 on LMArena Text · Coding" or "84% on SWE-bench Verified". */
export interface Fact {
  text: string;
  /** 0–100, for picking the strongest fact. */
  strength: number;
}

export interface Fit {
  /** 0–100; null when no leaderboard rates the card for this task. */
  value: number | null;
  best: Fact | null;
}

/** The general index loses a near tie to a board about the task itself: "#6 on Coding" says more than "#2 overall". */
const GENERAL_PENALTY = 5;

export function fitFor(task: Task, s: Signals | undefined, counts: Partial<Record<Board, number>>): Fit {
  const weights = WEIGHTS[task];
  if (!weights || !s) return { value: null, best: null };
  let sum = 0;
  let have = 0;
  let total = 0;
  let best: Fact | null = null;
  for (const [key, w] of Object.entries(weights) as [Board | Bench, number][]) {
    total += w;
    let v: number | undefined;
    let fact: Fact | undefined;
    if (isBench(key)) {
      const share = s.bench[key];
      if (share == null) continue;
      v = share * 100;
      fact = { text: `${Math.round(v)}% on ${BENCH_INFO[key].label}`, strength: v };
    } else {
      const b = s.boards[key];
      if (!b) continue;
      v = b.p;
      fact = { text: `#${b.rank} of ${counts[key] ?? '?'} on ${BOARD_INFO[key].label}`, strength: key === 'eci' && task !== 'reason' ? v - GENERAL_PENALTY : v };
    }
    sum += w * v;
    have += w;
    if (!best || fact.strength > best.strength) best = fact;
  }
  if (!have) return { value: null, best: null };
  // Thin evidence counts for a little less: one board is weaker proof than four.
  return { value: (sum / have) * (0.85 + 0.15 * (have / total)), best };
}

/** Cards that could do the job at all, before budget and access. */
export function typesFor(a: Pick<Answers, 'task' | 'needs'>): ModelType[] {
  if (a.task === 'search' && a.needs.includes('rerank')) return ['rerank'];
  return TASKS[a.task].types;
}

function fits(m: Model, s: Signals | undefined, a: Answers): boolean {
  if (m.status === 'deprecated' || !typesFor(a).includes(m.type)) return false;
  if (TEXT_TASKS.includes(a.task) && !m.output.includes('text')) return false;
  if (!a.needs.every((n) => NEEDS[n].test(m))) return false;
  const price = s?.price ?? null;
  // Open weights are free to download, so they fit a free budget, or any budget when you've said you'll run them.
  const selfHost = m.openWeights && a.access !== 'api' && (a.access === 'open' || a.budget === 'free');
  if (a.access === 'open' && !m.openWeights) return false;
  if (a.access === 'api' && price == null) return false;
  const max = BUDGETS[a.budget].max;
  if (max === Number.POSITIVE_INFINITY) return true;
  return selfHost || (price != null && price <= max);
}

export interface DealtCard {
  model: Model;
  /** Short badge: "Top pick", "Best value", "Open weights". */
  badge: string;
  reason: string;
  score: number;
}

export interface Deal {
  picks: DealtCard[];
  /** Cards that fit every answer. */
  considered: number;
}

/** A paid price that fits the budget; open models outside it still fit when you'd run them yourself. */
const paidFits = (s: Signals | undefined, a: Answers) => s?.price != null && s.price <= BUDGETS[a.budget].max;

function priceText(m: Model, s: Signals | undefined, a: Answers): string {
  const price = s?.price ?? null;
  const unit = INPUT_ONLY.has(m.type) ? 'in' : 'out';
  if (price === 0) return 'free to call';
  if (m.openWeights && a.access !== 'api') {
    return price != null && a.task !== 'voice' ? `open weights, or hosted from ${formatPrice(price)} per 1M ${unit}` : 'open weights you can run yourself';
  }
  if (price == null) return 'price not listed';
  return a.task === 'voice' ? 'sold by API' : `${formatPrice(price)} per 1M ${unit}`;
}

const times = (k: number) => (k >= 1.95 ? `${Math.round(k)}× ` : '');

interface Scored {
  m: Model;
  s: Signals | undefined;
  fit: Fit;
  score: number;
  lead: string;
}

/** What each pick is quoted on when no leaderboard rates the task: downloads for open models, else how recent it is. */
function popularity(m: Model): Fact {
  if (m.hub) return { text: `${formatCount(m.hub.downloads)} downloads a month`, strength: Math.log10(m.hub.downloads + 1) };
  return { text: `released ${formatMonth(m.releaseDate)}`, strength: 0 };
}

function reasonFor(p: Scored, i: number, top: Scored | undefined, a: Answers, rated: boolean, next: boolean): { badge: string; reason: string } {
  const { m, s } = p;
  const noun = TASKS[a.task].noun;
  const price = priceText(m, s, a);
  if (i === 0 || !top) {
    const badge = next ? 'Next best' : 'Top pick';
    const best = next ? 'next-best' : 'best';
    return rated
      ? { badge, reason: `The ${best} ${noun} score that fits: ${p.lead}, ${price}.` }
      : { badge, reason: `The ${next ? 'next ' : ''}${m.hub ? 'most downloaded' : 'newest'} ${noun} model that fits: ${p.lead}, ${price}.` };
  }
  if (!p.fit.value && top.fit.value != null) return { badge: 'Also fits', reason: `Not on a leaderboard yet, but ${p.lead}, ${price}.` };
  const pt = top.s?.price ?? null;
  const pp = s?.price ?? null;
  const comparable = a.access !== 'open' && paidFits(top.s, a) && paidFits(s, a);
  if (comparable && pt != null && pt > 0 && pp != null && pp < pt / 2) {
    const k = pt / Math.max(pp, 1e-9);
    const close = rated && top.fit.value && p.fit.value && p.fit.value >= top.fit.value * 0.9;
    return {
      badge: 'Best value',
      reason: pp === 0 ? `${close ? 'Nearly as good' : 'Solid'} and free to call: ${p.lead}.` : `${close ? 'Nearly as good' : 'Strong'} for ${times(k) || 'far '}less: ${p.lead}, ${price}.`,
    };
  }
  if (m.openWeights && !top.m.openWeights) return { badge: 'Open weights', reason: `Open weights, so you can run it yourself: ${p.lead}.` };
  if (m.context && top.m.context && m.context >= top.m.context * 2) {
    return { badge: 'Longest memory', reason: `Holds ${formatTokens(m.context)} tokens at once, ${times(m.context / top.m.context)}the top pick: ${p.lead}.` };
  }
  if (m.releaseDate > top.m.releaseDate) return { badge: 'Newest', reason: `Newer, from ${formatMonth(m.releaseDate)}: ${p.lead}, ${price}.` };
  return rated ? { badge: 'Runner-up', reason: `Close behind: ${p.lead}, ${price}.` } : { badge: 'Also popular', reason: `Also widely used: ${p.lead}, ${price}.` };
}

/**
 * Deals up to three cards for the answers, one per lab when it can, skipping cards already dealt.
 * Rated cards come first, best fit on top; unrated ones fill in by downloads, then by how recent they are.
 */
export function deal(pool: Model[], signals: Record<string, Signals>, counts: Partial<Record<Board, number>>, a: Answers, skip: string[] = []): Deal {
  const skipped = new Set(skip);
  const eligible = pool.filter((m) => fits(m, signals[m.key], a));
  const scored: Scored[] = eligible
    .filter((m) => !skipped.has(m.key))
    .map((m) => {
      const s = signals[m.key];
      const fit = fitFor(a.task, s, counts);
      const pop = popularity(m);
      // Unrated cards sit below every rated one, ordered by downloads.
      return { m, s, fit, score: fit.value ?? (pop.strength - 100), lead: (fit.best ?? pop).text };
    })
    .sort(
      (x, y) =>
        y.score - x.score ||
        (x.s?.price ?? Number.POSITIVE_INFINITY) - (y.s?.price ?? Number.POSITIVE_INFINITY) ||
        y.m.releaseDate.localeCompare(x.m.releaseDate) ||
        x.m.key.localeCompare(y.m.key),
    );
  const chosen: Scored[] = [];
  const labs = new Set<string>();
  for (const x of scored) {
    if (chosen.length === 3) break;
    if (labs.has(x.m.lab)) continue;
    chosen.push(x);
    labs.add(x.m.lab);
  }
  for (const x of scored) {
    if (chosen.length === 3) break;
    if (!chosen.includes(x)) chosen.push(x);
  }
  chosen.sort((x, y) => y.score - x.score);
  const rated = chosen[0]?.fit.value != null;
  return {
    considered: eligible.length,
    picks: chosen.map((p, i) => ({ model: p.m, score: Math.round(p.fit.value ?? 0), ...reasonFor(p, i, chosen[0], a, rated && p.fit.value != null, skipped.size > 0) })),
  };
}

const TASK_KEYS = Object.keys(TASKS) as Task[];
const BUDGET_KEYS = Object.keys(BUDGETS) as Budget[];
const ACCESS_KEYS = Object.keys(ACCESS) as AccessPref[];

/** Answers from a shared link; null unless all four are there. */
export function answersFromParams(p: URLSearchParams): Answers | null {
  const task = p.get('task') as Task;
  const budget = p.get('budget') as Budget;
  const access = p.get('access') as AccessPref;
  if (!TASK_KEYS.includes(task) || !BUDGET_KEYS.includes(budget) || !ACCESS_KEYS.includes(access)) return null;
  const allowed = needsFor(task);
  const needs = [...new Set((p.get('needs') ?? '').split(',').filter((n): n is Need => allowed.includes(n as Need)))];
  return { task, budget, needs, access };
}

export function answersToParams(a: Answers): URLSearchParams {
  const p = new URLSearchParams({ task: a.task, budget: a.budget, access: a.access });
  if (a.needs.length) p.set('needs', a.needs.join(','));
  return p;
}

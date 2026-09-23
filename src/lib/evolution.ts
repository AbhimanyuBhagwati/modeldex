import { INPUT_ONLY, RARITY_RANK, daysBetween, formatCount, formatMonth, formatParams, formatPrice, formatTokens } from './format';
import type { Model, ModelType } from './types';

/**
 * Evolution lines: every model's name is read as a series plus a version, "Claude Opus 4.5" is
 * Claude Opus at 4.5, "Qwen3-235B-A22B" is Qwen at 3, "dinov2-base" is DINO at 2. Each version is
 * one stage, shown by its strongest model; a series with two or more versions is a line.
 */

/** Words after the version that name a separate product line, not a variant: Gemini Pro and Gemini Flash evolve apart. */
const TIERS = new Set([
  'pro', 'max', 'plus', 'flash', 'mini', 'nano', 'lite', 'turbo-lite', 'small', 'medium', 'large', 'ultra', 'air', 'sol', 'luna', 'astra', 'terra',
  'coder', 'codex', 'vl', 'omni', 'embedding', 'embed', 'reranker', 'rerank', 'guard', 'tts', 'asr', 'image', 'audio', 'video', 'math', 'ocr',
  'vision', 'realtime', 'oss', 'haiku', 'sonnet', 'opus', 'fable', 'nemo', 'edge', 'instant', 'nemotron',
]);
/** Words that say nothing about which model this is. */
const NOISE = new Set([
  'instruct', 'it', 'chat', 'base', 'hf', 'preview', 'exp', 'experimental', 'latest', 'thinking', 'non', 'reasoning', 'fp8', 'bf16', 'turbo', 'pt',
  'diffusers', 'the', 'en', 'zh', 'multilingual', 'cased', 'uncased',
]);
/** Brand spellings the names themselves don't always get right. */
const CASE: Record<string, string> = {
  deepseek: 'DeepSeek', minimax: 'MiniMax', smollm: 'SmolLM', smolvlm: 'SmolVLM', deberta: 'DeBERTa', layoutlm: 'LayoutLM', medgemma: 'MedGemma',
  timesfm: 'TimesFM', minicpm: 'MiniCPM', olmo: 'OLMo', llada: 'LLaDA', mimo: 'MiMo', segformer: 'SegFormer', glm: 'GLM', gpt: 'GPT', ltx: 'LTX',
  sam: 'SAM', dino: 'DINO', bge: 'BGE', gte: 'GTE', clip: 'CLIP', o: 'o', vl: 'VL', oss: 'OSS', tts: 'TTS', v: 'V', ocr: 'OCR',
};
/** Company names some repos put in front of the model name. */
const PREFIXES = new Set(['meta', 'nvidia', 'google', 'microsoft', 'openai', 'amazon', 'ibm', 'facebook']);
/** Sizes, dates, and shapes: 7b, a22b, 8x7b, e4b, 16e, l6, patch32, 2507, 20250805, 128k. */
const SIZE = /^(\d+(\.\d+)?[bmkt]|a\d+(\.\d+)?b|\d+x\d+(\.\d+)?b|e\d+b|\d+e|[lh]\d+|patch\d+|\d{4}|\d{6,8}|\d+k|\d+hz)$/;
const VERSION = /^v?(\d+(?:\.\d+)*)([a-z]?)$/;
const GLUED = /^([a-z]+?)v?(\d+(?:\.\d+)*)([a-z]?)$/;
/** Letters after a number that mean a size, not a generation: 7b, 500m. */
const SIZE_LETTER = /^[bmkt]$/;

export interface ParsedName {
  /** Lowercase words that identify the line, like ["claude", "opus"]. */
  series: string[];
  /** Those words as the model's own name spells them: "Claude Opus". */
  display: string;
  /** "4.5", "3n", "2", or "1" when the name has none. */
  version: string;
  /** For ordering: 4.5 -> [4.5], 4.20 -> [4.2] (Grok 4.20 came before 4.3), "4o" sorts just after 4. */
  order: number[];
  /** No number in the name: "Qwen Max", "Nova Pro". */
  implicit: boolean;
}

const pretty = (word: string, original: string) => {
  if (CASE[word]) return CASE[word];
  if (/^(llm|asr|vit|t5|bert)$/.test(word)) return word.toUpperCase();
  return original !== original.toLowerCase() ? original : word[0].toUpperCase() + word.slice(1);
};

type Version = { text: string; parts: number[]; suffix: string };
/** "01" -> "1", "4.1v" keeps its letter; the letter itself is read by the caller. */
const readVersion = (digits: string, suffix: string): Version => {
  const parts = digits.split('.').map(Number);
  return { text: digits.split('.').map((d, i) => (i === 0 ? String(Number(d)) : d)).join('.') + suffix, parts, suffix };
};

export function parseName(name: string): ParsedName | null {
  const raw = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s_/-]+/)
    .filter(Boolean);
  const series: { word: string; original: string }[] = [];
  let version: Version | null = null;
  const take = (v: Version) => {
    // "GLM-4.5V" is the vision line of GLM 4.5, not a generation of its own.
    if (v.suffix === 'v') {
      version = { ...v, text: v.text.slice(0, -1), suffix: '' };
      series.push({ word: 'v', original: 'V' });
    } else version = v;
  };

  raw.forEach((original, i) => {
    const word = original.toLowerCase();
    if (i === 0 && PREFIXES.has(word) && raw.length > 1) return;
    if (NOISE.has(word) || SIZE.test(word)) return;
    const pure = VERSION.exec(word);
    if (pure && !version && !SIZE_LETTER.test(pure[2])) {
      take(readVersion(pure[1], pure[2]));
      return;
    }
    // "Qwen3.5", "SmolLM2", "dinov2", "o3", "k2.5": a version glued to the series word, near the head of the name.
    // Not "b0" (a size, as in SegFormer-b0) or "R7B" (a 7B model).
    const glued = series.length <= 1 && !version ? GLUED.exec(word) : null;
    if (glued && (glued[1] === 'b' || SIZE_LETTER.test(glued[3]))) {
      // A size glued on: keep the word ("R" of "R7B"), drop the size.
      if (glued[1] !== 'b') series.push({ word: glued[1], original: original.slice(0, glued[1].length) });
      return;
    }
    if (glued) {
      series.push({ word: glued[1], original: original.slice(0, glued[1].length) });
      take(readVersion(glued[2], glued[3]));
      return;
    }
    if (/\d/.test(word)) return;
    // Before the version every word is the series; after it, only tiers are.
    if (!version || TIERS.has(word)) series.push({ word, original });
  });

  if (!series.length) return null;
  const v = version as Version | null;
  if (v && (v.parts[0] > 20 || v.parts.some((p) => !Number.isFinite(p)))) return null;
  const decimal = v ? Number(`${v.parts[0]}.${v.parts[1] ?? 0}`) : 1;
  return {
    series: series.map((s) => s.word),
    display: series.map((s) => pretty(s.word, s.original)).join(' '),
    version: v?.text ?? '1',
    order: v ? [decimal, ...v.parts.slice(2), v.suffix ? 0.5 : 0] : [1, 0],
    implicit: !v,
  };
}

export interface Stage {
  version: string;
  /** The generation's strongest model. */
  key: string;
  /** The rest of the generation: other sizes and variants. */
  variants: string[];
  releaseDate: string;
}

export interface EvolutionLine {
  /** Unique within the lab, used in URLs. */
  slug: string;
  lab: string;
  name: string;
  type: ModelType;
  stages: Stage[];
}

const compareOrder = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

/** Dated snapshots like "GPT-4o (2024-05-13)" stand in for a generation only when nothing plainer exists. */
const dated = (m: Model) => (/\(|\d{4}-\d{2}/.test(m.name) ? 1 : 0);

/** Strongest first: flagship pricing, then size, context, and popularity; the plainest name breaks ties. */
function strength(a: Model, b: Model) {
  return (
    dated(a) - dated(b) ||
    RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] ||
    (b.price?.output ?? 0) - (a.price?.output ?? 0) ||
    (b.hub?.params ?? 0) - (a.hub?.params ?? 0) ||
    (b.context ?? 0) - (a.context ?? 0) ||
    (b.hub?.downloads ?? 0) - (a.hub?.downloads ?? 0) ||
    (a.status === 'preview' ? 1 : 0) - (b.status === 'preview' ? 1 : 0) ||
    a.name.length - b.name.length ||
    a.releaseDate.localeCompare(b.releaseDate)
  );
}

const slugOf = (words: string[]) => words.join('-').replace(/[^a-z0-9-]/g, '');

/** Every line with at least two stages, by lab. Pure: same models in, same lines out. */
export function buildLines(models: Model[]): EvolutionLine[] {
  const groups = new Map<string, { lab: string; type: ModelType; series: string[]; display: string; byVersion: Map<string, { order: number[]; implicit: boolean; models: Model[] }> }>();
  for (const m of models) {
    const parsed = parseName(m.name);
    if (!parsed) continue;
    const id = `${m.lab}|${m.type}|${parsed.series.join(' ')}`;
    const group = groups.get(id) ?? { lab: m.lab, type: m.type, series: parsed.series, display: parsed.display, byVersion: new Map() };
    const stage = group.byVersion.get(parsed.version) ?? { order: parsed.order, implicit: parsed.implicit, models: [] };
    // An unnumbered name joins version "1" only as a first stage; it keeps an explicit v1 if there is one.
    stage.implicit &&= parsed.implicit;
    stage.models.push(m);
    group.byVersion.set(parsed.version, stage);
    // The newest release decides how the line's name is spelled.
    const newest = [...group.byVersion.values()].flatMap((s) => s.models).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0];
    if (newest === m) group.display = parsed.display;
    groups.set(id, group);
  }

  const lines: EvolutionLine[] = [];
  const taken = new Set<string>();
  for (const g of [...groups.values()].sort((a, b) => a.lab.localeCompare(b.lab) || (a.type === 'text' ? -1 : 0) - (b.type === 'text' ? -1 : 0))) {
    // "Mistral 7B" next to v0.1–v0.3 has no place in the order, so it sits out.
    const explicitBelowOne = [...g.byVersion.values()].some((s) => !s.implicit && s.order[0] < 1);
    const entries = [...g.byVersion.entries()].filter(([, s]) => !(s.implicit && explicitBelowOne));
    if (entries.length < 2) continue;
    const stages: Stage[] = entries
      .sort(([, a], [, b]) => compareOrder(a.order, b.order))
      .map(([version, s]) => {
        // An unnumbered first stage is the original, so the earliest model stands for it.
        const [best, ...rest] = [...s.models].sort(s.implicit ? (a, b) => a.releaseDate.localeCompare(b.releaseDate) : strength);
        return { version, key: best.key, variants: rest.map((m) => m.key), releaseDate: [...s.models].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))[0].releaseDate };
      });
    let slug = slugOf(g.series);
    if (taken.has(`${g.lab}/${slug}`)) slug = `${slug}-${g.type}`;
    taken.add(`${g.lab}/${slug}`);
    lines.push({ slug, lab: g.lab, name: g.display, type: g.type, stages });
  }
  return lines;
}

export interface Delta {
  label: string;
  from: string;
  to: string;
  /** "×8", "+40%", "−75%" */
  change: string;
  /** Whether the change is an improvement: more context, a lower price. */
  better: boolean;
}

export interface EvolutionReport {
  deltas: Delta[];
  /** Abilities the new stage has and the old one didn't, like moves a Pokémon learns. */
  learned: string[];
  /** Months between the two releases. */
  months: number;
}

function ratioChange(a: number, b: number): string {
  const r = b / a;
  if (r >= 2) return `×${r >= 10 ? Math.round(r) : Math.round(r * 10) / 10}`;
  const pct = Math.round((r - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

const monthIndex = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));

/** What changed from one stage to the next. */
export function evolutionReport(a: Model, b: Model): EvolutionReport {
  const deltas: Delta[] = [];
  const add = (label: string, x: number | null | undefined, y: number | null | undefined, format: (v: number) => string, higherIsBetter: boolean) => {
    if (x == null || y == null || x === y || x <= 0 || y <= 0) return;
    deltas.push({ label, from: format(x), to: format(y), change: ratioChange(x, y), better: higherIsBetter ? y > x : y < x });
  };
  add('Context', a.context, b.context, formatTokens, true);
  add('Max output', a.maxOutput, b.maxOutput, formatTokens, true);
  const side = INPUT_ONLY.has(b.type) ? 'input' : 'output';
  add(side === 'input' ? 'Price' : 'Output price', a.price?.[side], b.price?.[side], (v) => formatPrice(v), false);
  add('Size', a.hub?.params, b.hub?.params, (v) => formatParams(v), true);
  add('Downloads', a.hub?.downloads, b.hub?.downloads, (v) => `${formatCount(v)}/mo`, true);
  if (a.knowledge && b.knowledge && b.knowledge > a.knowledge) {
    const gain = monthIndex(b.knowledge) - monthIndex(a.knowledge);
    deltas.push({ label: 'Knowledge', from: formatMonth(a.knowledge), to: formatMonth(b.knowledge), change: `+${gain} mo`, better: true });
  }

  const learned: string[] = [];
  const gained = (has: (m: Model) => boolean, name: string) => has(b) && !has(a) && learned.push(name);
  gained((m) => m.reasoning, 'Reasoning');
  gained((m) => m.toolCall, 'Tool use');
  gained((m) => m.structuredOutput, 'Structured output');
  gained((m) => m.input.includes('image'), 'Vision');
  gained((m) => m.input.includes('audio'), 'Hearing');
  gained((m) => m.input.includes('video'), 'Video input');
  gained((m) => m.input.includes('pdf'), 'Reads PDFs');
  gained((m) => m.output.includes('image'), 'Draws images');
  gained((m) => m.output.includes('audio'), 'Speech');

  return { deltas, learned, months: Math.max(0, Math.round(daysBetween(a.releaseDate, b.releaseDate) / 30.44)) };
}

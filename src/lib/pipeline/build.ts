import type { LabConfig } from '@/config/labs';
import {
  MODALITIES,
  type Access,
  type Dataset,
  type LabSummary,
  type License,
  type Modality,
  type Model,
  type ModelType,
  type Price,
  type Rarity,
  type Status,
} from '@/lib/types';
import { rawModelSchema, rawProviderSchema, type RawModel } from './schema';

/** Output price per 1M tokens where each rarity tier starts. */
export const RARITY_FLOORS = { uncommon: 2, rare: 8, holo: 20 } as const;

const ALIAS = /(^|[-_ (])latest([-_ )]|$)/i;
export const PREVIEW = /(^|[-_ ])(preview|exp|experimental)([-_ ]|$)/i;
/** Name used to spot the same model listed twice. `+` is spelled out: Command R+ is not Command R. */
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

/**
 * URL slug: the last path segment of the id with everything but letters, digits, `_` and `-` turned into dashes.
 * Dots go too: static hosts and routers read `gpt-5.6` as a file with a `.6` extension.
 */
export function slugify(id: string): string {
  const tail = id.split('/').filter(Boolean).pop() ?? id;
  return tail.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * What kind of model this is. models.dev lists embeddings and rerankers as "text out",
 * so names and families decide those; modalities decide the rest.
 */
export function typeOf(m: { id: string; name: string; family?: string | null }, input: Modality[], output: Modality[]): ModelType {
  const s = `${m.id} ${m.name} ${m.family ?? ''}`.toLowerCase();
  if (/rerank/.test(s)) return 'rerank';
  if (/embed/.test(s)) return 'embedding';
  if (/moderation|guard\b|guard-|safety/.test(s)) return 'safety';
  if (output.includes('video')) return 'video';
  // Agents and chat models can return images alongside text; only count dedicated image models.
  if (output.includes('image') && (!output.includes('text') || /image|imagen|banana|dall|flux|canvas|seedream|kolors/.test(s))) return 'image';
  if (output.includes('audio')) return input.includes('audio') || /realtime|live|voicechat|native-audio|sonic/.test(s) ? 'voice' : 'audio';
  if (/whisper|transcri|\basr\b|-asr|speech-to-text|\bstt\b/.test(s) && input.includes('audio')) return 'transcription';
  return 'text';
}

export function rarityFor(price: Price | null): Rarity {
  const out = price?.output;
  if (out == null) return 'promo';
  if (out < RARITY_FLOORS.uncommon) return 'common';
  if (out < RARITY_FLOORS.rare) return 'uncommon';
  if (out < RARITY_FLOORS.holo) return 'rare';
  return 'holo';
}

export function accessFor(price: Price | null, openWeights: boolean): Access {
  if (price && price.input === 0 && price.output === 0) return 'free';
  return openWeights ? 'open' : 'paid';
}

export function defaultLicense(lab: LabConfig, openWeights: boolean): License {
  if (!openWeights) return { name: 'Proprietary', source: 'proprietary' };
  return { name: lab.defaultLicense ?? 'Open license', source: 'lab-default' };
}

const matches = (lab: LabConfig, m: { id: string; name: string }) => lab.match.test(m.id) || lab.match.test(m.name);

/** YYYY-MM-DD from a date or timestamp, or null when it isn't a real date. */
export function day(s: string | undefined): string | null {
  if (!s) return null;
  const v = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return null;
  return v;
}

const month = (s: string | undefined) => (s && /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null);
const usd = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 1e6) / 1e6 : null);
const count = (v: number | undefined) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
const modalities = (list: string[] | undefined): Modality[] =>
  MODALITIES.filter((m) => list?.includes(m));

function statusOf(m: RawModel): Status | null {
  if (m.status === 'deprecated') return 'deprecated';
  if (m.status === 'beta' || m.status === 'alpha') return 'beta';
  if (PREVIEW.test(m.id) || PREVIEW.test(m.name)) return 'preview';
  return null;
}

function toModel(m: RawModel, lab: LabConfig, releaseDate: string): Model {
  const c = m.cost;
  const priced = c ? { input: usd(c.input), output: usd(c.output), cacheRead: usd(c.cache_read), cacheWrite: usd(c.cache_write) } : null;
  const price = priced && Object.values(priced).some((v) => v != null) ? priced : null;
  const openWeights = m.open_weights ?? false;
  const input = modalities(m.modalities?.input);
  const output = modalities(m.modalities?.output);
  const slug = slugify(m.id);
  return {
    key: `${lab.key}/${slug}`,
    id: m.id,
    slug,
    lab: lab.key,
    type: typeOf(m, input, output),
    name: m.name.trim(),
    description: (m.description ?? '').trim(),
    family: m.family ?? null,
    releaseDate,
    lastUpdated: day(m.last_updated),
    knowledge: month(m.knowledge),
    context: count(m.limit?.context),
    maxOutput: count(m.limit?.output),
    price,
    input,
    output,
    reasoning: m.reasoning ?? false,
    toolCall: m.tool_call ?? false,
    structuredOutput: m.structured_output ?? false,
    attachment: m.attachment ?? false,
    openWeights,
    status: statusOf(m),
    access: accessFor(price, openWeights),
    rarity: rarityFor(price),
    set: 0,
    license: defaultLicense(lab, openWeights),
    origin: 'models.dev',
    hub: null,
  };
}

/** Which of two listings to keep. Full ties go to the smaller key, so the pick never depends on feed order. */
const isNewer = (a: Model, b: Model) =>
  a.releaseDate !== b.releaseDate
    ? a.releaseDate > b.releaseDate
    : (a.lastUpdated ?? '') !== (b.lastUpdated ?? '')
      ? (a.lastUpdated ?? '') > (b.lastUpdated ?? '')
      : a.key < b.key;

export interface BuildResult {
  dataset: Dataset;
  issues: string[];
}

/**
 * Turns the raw models.dev dump into the site's dataset.
 * Pure: no network, no clock. Licenses are lab defaults here; `resolveLicenses` refines them.
 */
export function buildDataset(raw: unknown, labs: LabConfig[], opts: { sourceUrl: string; updatedAt: string }): BuildResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('models.dev returned something other than an object of providers');
  const root = raw as Record<string, unknown>;
  const issues: string[] = [];

  let listings = 0;
  for (const p of Object.values(root)) {
    const models = (p as { models?: unknown } | null)?.models;
    if (models && typeof models === 'object') listings += Object.keys(models).length;
  }

  const byName = new Map<string, Model>();
  const docs = new Map<string, string | null>();

  for (const lab of labs) {
    for (const providerId of lab.providers) {
      const provider = rawProviderSchema.safeParse(root[providerId]);
      if (!provider.success) {
        issues.push(`models.dev has no usable provider "${providerId}" for ${lab.name}`);
        continue;
      }
      if (!docs.get(lab.key)) {
        const doc = provider.data.doc;
        docs.set(lab.key, doc && /^https:\/\//.test(doc) ? doc : null);
      }
      for (const [entry, value] of Object.entries(provider.data.models)) {
        const parsed = rawModelSchema.safeParse(value);
        if (!parsed.success) {
          issues.push(`Skipped ${providerId}/${entry}: ${parsed.error.issues[0]?.message ?? 'invalid entry'}`);
          continue;
        }
        const m = parsed.data;
        if (lab.skip?.test(m.id) || ALIAS.test(m.id) || ALIAS.test(m.name)) continue;
        const own = matches(lab, m);
        if (!own && (lab.strict || labs.some((other) => other !== lab && matches(other, m)))) continue;
        if (!slugify(m.id)) {
          issues.push(`Skipped ${providerId}/${m.id}: nothing usable for a URL in the id`);
          continue;
        }
        const releaseDate = day(m.release_date);
        if (!releaseDate) {
          issues.push(`Skipped ${providerId}/${m.id}: no usable release date`);
          continue;
        }
        const model = toModel(m, lab, releaseDate);
        const dedupe = `${lab.key}|${normalizeName(model.name)}`;
        const held = byName.get(dedupe);
        if (!held || isNewer(model, held)) byName.set(dedupe, model);
      }
    }
  }

  const byKey = new Map<string, Model>();
  for (const m of byName.values()) {
    const held = byKey.get(m.key);
    if (!held || isNewer(m, held)) byKey.set(m.key, m);
  }

  const models = numberSet([...byKey.values()]);
  for (const lab of labs) {
    if (lab.providers.length && !models.some((m) => m.lab === lab.key)) issues.push(`${lab.name} has no models in this sync`);
  }

  return {
    dataset: {
      version: 1,
      updatedAt: opts.updatedAt,
      source: { url: opts.sourceUrl, providers: Object.keys(root).length, listings, hub: { orgs: 0, repos: 0 } },
      labs: summarizeLabs(models, labs, (lab) => docs.get(lab.key) ?? null),
      models,
    },
    issues,
  };
}

/** Orders the set by release date and numbers it from 1. */
export function numberSet(models: Model[]): Model[] {
  return [...models]
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.name.localeCompare(b.name, 'en') || a.key.localeCompare(b.key))
    .map((m, i) => ({ ...m, set: i + 1 }));
}

/** One summary per lab that has cards, in config order. */
export function summarizeLabs(models: Model[], labs: LabConfig[], docUrl: (lab: LabConfig) => string | null): LabSummary[] {
  const counts = new Map<string, number>();
  for (const m of models) counts.set(m.lab, (counts.get(m.lab) ?? 0) + 1);
  return labs
    .filter((lab) => counts.has(lab.key))
    .map((lab) => ({ key: lab.key, name: lab.name, color: lab.color, docUrl: docUrl(lab), count: counts.get(lab.key)! }));
}

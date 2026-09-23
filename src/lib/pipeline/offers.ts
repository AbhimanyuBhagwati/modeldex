import type { LabConfig } from '@/config/labs';
import type { Dataset, HostOffer, Model, Offer, OffersFile } from '@/lib/types';
import { normalizeName } from './build';
import { rawModelSchema, rawProviderSchema } from './schema';

/**
 * Resellers name the same model many ways: "Claude Opus 4.1 (latest)", "Anthropic: Claude Opus 4.1",
 * `anthropic.claude-opus-4-1-20250805-v1:0`, `claude-opus-4-1@20250805`. These reduce each to one core.
 */
export function nameCore(name: string): string {
  const s = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^[^:]{1,30}:\s+/, '');
  return normalizeName(s);
}

const VENDOR = /^(anthropic|meta|amazon|mistral|cohere|ai21|deepseek|qwen|openai|writer|minimax|moonshotai|google)\./;
const REGION = /^(us|eu|apac|jp|au|ca|global|us-gov)\./;

export function idCore(id: string): string {
  const tail = (id.toLowerCase().split('/').pop() ?? '')
    .replace(/@.*$/, '')
    .replace(/:.*$/, '')
    .replace(REGION, '')
    .replace(VENDOR, '')
    .replace(/-v\d+$/, '')
    .replace(/-maas$/, '')
    .replace(/-\d{8}$/, '');
  return normalizeName(tail);
}

const SUFFIXES = ['instruct', 'it', 'chat'];

/** Every core a card answers to, with and without the usual instruct suffixes. */
function cardCores(m: Model): string[] {
  const base = new Set([nameCore(m.name), idCore(m.id), normalizeName(m.slug)]);
  if (m.hub) base.add(normalizeName(m.hub.repo.split('/')[1]));
  const out = new Set<string>();
  for (const c of base) {
    if (c.length < 3) continue;
    out.add(c);
    for (const s of SUFFIXES) {
      out.add(c + s);
      if (c.endsWith(s) && c.length - s.length >= 3) out.add(c.slice(0, -s.length));
    }
  }
  return [...out];
}

const price = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 1e6) / 1e6 : null);
const tokens = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
const https = (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);

/** Cheapest first; for embeddings and rerankers, which bill input only, by input price. Unpriced offers go last. */
function byPrice(inputOnly: boolean) {
  const big = (v: number | null) => v ?? Number.POSITIVE_INFINITY;
  return (a: { input: number | null; output: number | null; name?: string }, b: typeof a) =>
    (inputOnly ? big(a.input) - big(b.input) : big(a.output) - big(b.output) || big(a.input) - big(b.input)) || (a.name ?? '').localeCompare(b.name ?? '', 'en');
}

const INPUT_ONLY = new Set(['embedding', 'rerank', 'safety']);

/**
 * Every provider on models.dev that sells each card's model, one offer per provider, cheapest first.
 * Pure: the raw models.dev dump in, offers keyed by card out.
 */
export function buildOffers(raw: unknown, dataset: Dataset, labs: LabConfig[]): { offers: Record<string, Offer[]>; providers: OffersFile['providers'] } {
  const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const byCore = new Map<string, string[]>();
  for (const m of dataset.models) {
    for (const c of cardCores(m)) byCore.set(c, [...(byCore.get(c) ?? []), m.key]);
  }
  const official = new Map(labs.map((l) => [l.key, new Set(l.providers)]));
  const models = new Map(dataset.models.map((m) => [m.key, m]));

  const found = new Map<string, Map<string, Offer>>();
  const providers: OffersFile['providers'] = {};
  for (const [providerId, value] of Object.entries(root)) {
    const provider = rawProviderSchema.safeParse(value);
    if (!provider.success) continue;
    for (const entry of Object.values(provider.data.models)) {
      const parsed = rawModelSchema.safeParse(entry);
      if (!parsed.success) continue;
      const l = parsed.data;
      const keys = new Set([...(byCore.get(nameCore(l.name)) ?? []), ...(byCore.get(idCore(l.id)) ?? [])]);
      for (const key of keys) {
        const card = models.get(key)!;
        providers[providerId] ??= { name: provider.data.name, url: https(provider.data.doc) };
        const offer: Offer = {
          provider: providerId,
          model: l.id,
          input: price(l.cost?.input),
          output: price(l.cost?.output),
          context: tokens(l.limit?.context),
          official: official.get(card.lab)?.has(providerId) ?? false,
        };
        const perProvider = found.get(key) ?? new Map<string, Offer>();
        const held = perProvider.get(providerId);
        // One offer per provider: the cheapest, then the shortest id (regional copies have longer ones).
        const order = held ? byPrice(INPUT_ONLY.has(card.type))(offer, held) : -1;
        if (order < 0 || (order === 0 && offer.model.length < held!.model.length)) {
          perProvider.set(providerId, offer);
        }
        found.set(key, perProvider);
      }
    }
  }

  const offers: Record<string, Offer[]> = {};
  for (const [key, perProvider] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const order = byPrice(INPUT_ONLY.has(models.get(key)!.type));
    const named = (o: Offer) => ({ ...o, name: providers[o.provider].name });
    offers[key] = [...perProvider.values()].sort((a, b) => order(named(a), named(b)));
  }
  const used = new Set(Object.values(offers).flatMap((list) => list.map((o) => o.provider)));
  return { offers, providers: Object.fromEntries(Object.entries(providers).filter(([id]) => used.has(id)).sort(([a], [b]) => a.localeCompare(b))) };
}

const HOST_NAMES: Record<string, string> = {
  novita: 'Novita',
  'fireworks-ai': 'Fireworks',
  'featherless-ai': 'Featherless',
  baseten: 'Baseten',
  deepinfra: 'DeepInfra',
  cerebras: 'Cerebras',
  ovhcloud: 'OVHcloud',
  together: 'Together AI',
  nscale: 'Nscale',
  'zai-org': 'Z.ai',
  scaleway: 'Scaleway',
  groq: 'Groq',
  publicai: 'Public AI',
  cohere: 'Cohere',
  sambanova: 'SambaNova',
  nebius: 'Nebius',
  hyperbolic: 'Hyperbolic',
  'hf-inference': 'HF Inference',
};
export const hostName = (id: string) => HOST_NAMES[id] ?? id.replace(/(^|-)([a-z])/g, (_, dash: string, c: string) => (dash ? ' ' : '') + c.toUpperCase());

/**
 * Hugging Face Inference Providers from the router's model list, for cards with a repo.
 * Live hosts only, one row per host, cheapest first.
 */
export function buildHostOffers(router: unknown, dataset: Dataset): Record<string, HostOffer[]> {
  const list = (router as { data?: unknown } | null)?.data;
  if (!Array.isArray(list)) throw new Error('Hugging Face router returned something other than a model list');
  const byRepo = new Map<string, { providers?: unknown }>();
  for (const item of list) if (typeof item?.id === 'string') byRepo.set(item.id.toLowerCase(), item);

  const out: Record<string, HostOffer[]> = {};
  for (const m of dataset.models) {
    const item = m.hub && byRepo.get(m.hub.repo.toLowerCase());
    if (!item || !Array.isArray(item.providers)) continue;
    const hosts = new Map<string, HostOffer>();
    for (const p of item.providers as Record<string, unknown>[]) {
      if (typeof p?.provider !== 'string' || p.status !== 'live' || hosts.has(p.provider)) continue;
      const pricing = (p.pricing ?? {}) as Record<string, unknown>;
      hosts.set(p.provider, {
        provider: p.provider,
        name: hostName(p.provider),
        url: `https://huggingface.co/${m.hub!.repo}?inference_provider=${encodeURIComponent(p.provider)}`,
        input: price(pricing.input),
        output: price(pricing.output),
        context: tokens(p.context_length),
        throughput: typeof p.throughput === 'number' && p.throughput > 0 ? Math.round(p.throughput) : null,
        latencyMs: typeof p.first_token_latency_ms === 'number' && p.first_token_latency_ms > 0 ? Math.round(p.first_token_latency_ms) : null,
        tools: p.supports_tools === true,
      });
    }
    if (hosts.size) out[m.key] = [...hosts.values()].sort(byPrice(INPUT_ONLY.has(m.type)));
  }
  return out;
}

/** Joins both sources per card. models.dev's single "Hugging Face" listing is dropped where the per-host breakdown exists. */
export function joinOffers(
  direct: { offers: Record<string, Offer[]>; providers: OffersFile['providers'] },
  hosts: Record<string, HostOffer[]>,
  updatedAt: string,
): OffersFile {
  const keys = [...new Set([...Object.keys(direct.offers), ...Object.keys(hosts)])].sort();
  const models: OffersFile['models'] = {};
  for (const key of keys) {
    const hf = hosts[key] ?? [];
    const offers = (direct.offers[key] ?? []).filter((o) => !(hf.length && o.provider === 'huggingface'));
    if (offers.length || hf.length) models[key] = { offers, hf };
  }
  return { version: 1, updatedAt, providers: direct.providers, models };
}

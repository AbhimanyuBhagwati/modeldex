import type { LabConfig } from '@/config/labs';
import { formatParams } from '@/lib/format';
import type { Dataset, HubStats, License, Modality, Model, ModelType } from '@/lib/types';
import { PREVIEW, day, defaultLicense, normalizeName, numberSet, slugify, summarizeLabs } from './build';
import { customLicenseName, licenseTag, prettyLicense, type FetchJson } from './licenses';
import { rawHubRepoSchema, type RawHubRepo } from './schema';

/** Downloads in the last 30 days a repo needs to become a card. Once in, a card stays while its repo exists. */
export const HUB_MIN_DOWNLOADS = 100_000;

const EXPAND = ['downloads', 'likes', 'pipeline_tag', 'library_name', 'createdAt', 'lastModified', 'tags', 'gated', 'safetensors'];

/** An org's repos, most downloaded first. The API caps a page at 1,000, far below where the cutoff bites. */
export const hubListUrl = (org: string) =>
  `https://huggingface.co/api/models?${new URLSearchParams([['author', org], ['sort', 'downloads'], ['limit', '1000'], ...EXPAND.map((f) => ['expand[]', f])])}`;

interface Task {
  type: ModelType;
  input: Modality[];
  output: Modality[];
  /** Opens the card's description: "Sentence embedding model from BAAI". */
  label: string;
}

const task = (type: ModelType, input: Modality[], output: Modality[], label: string): Task => ({ type, input, output, label });

/** Hugging Face's `pipeline_tag` values, mapped onto the binder's types. Tasks not listed here don't become cards. */
const TASKS: Record<string, Task> = {
  'text-generation': task('text', ['text'], ['text'], 'Language model'),
  'text2text-generation': task('text', ['text'], ['text'], 'Text-to-text model'),
  'image-text-to-text': task('text', ['text', 'image'], ['text'], 'Vision-language model'),
  'video-text-to-text': task('text', ['text', 'image', 'video'], ['text'], 'Video-language model'),
  'audio-text-to-text': task('text', ['text', 'audio'], ['text'], 'Audio-language model'),
  'any-to-any': task('text', ['text', 'image', 'audio'], ['text'], 'Any-to-any model'),
  translation: task('text', ['text'], ['text'], 'Translation model'),
  summarization: task('text', ['text'], ['text'], 'Summarization model'),
  'text-to-image': task('image', ['text'], ['image'], 'Text-to-image model'),
  'image-to-image': task('image', ['text', 'image'], ['image'], 'Image editing model'),
  'image-text-to-image': task('image', ['text', 'image'], ['image'], 'Image generation model'),
  'unconditional-image-generation': task('image', [], ['image'], 'Image generation model'),
  'text-to-video': task('video', ['text'], ['video'], 'Text-to-video model'),
  'image-to-video': task('video', ['text', 'image'], ['video'], 'Image-to-video model'),
  'image-text-to-video': task('video', ['text', 'image'], ['video'], 'Video generation model'),
  'video-to-video': task('video', ['video'], ['video'], 'Video-to-video model'),
  'image-to-3d': task('3d', ['image'], [], 'Image-to-3D model'),
  'text-to-3d': task('3d', ['text'], [], 'Text-to-3D model'),
  'text-to-speech': task('audio', ['text'], ['audio'], 'Text-to-speech model'),
  'text-to-audio': task('audio', ['text'], ['audio'], 'Text-to-audio model'),
  'audio-to-audio': task('audio', ['audio'], ['audio'], 'Audio-to-audio model'),
  'automatic-speech-recognition': task('transcription', ['audio'], ['text'], 'Speech recognition model'),
  'feature-extraction': task('embedding', ['text'], [], 'Embedding model'),
  'sentence-similarity': task('embedding', ['text'], [], 'Sentence embedding model'),
  'image-feature-extraction': task('embedding', ['image'], [], 'Image embedding model'),
  'zero-shot-image-classification': task('embedding', ['text', 'image'], [], 'Image-text embedding model'),
  'visual-document-retrieval': task('embedding', ['text', 'image'], [], 'Document retrieval model'),
  'text-ranking': task('rerank', ['text'], [], 'Reranker'),
  'fill-mask': task('encoder', ['text'], [], 'Masked language model'),
  'token-classification': task('encoder', ['text'], [], 'Token classifier'),
  'text-classification': task('encoder', ['text'], [], 'Text classifier'),
  'zero-shot-classification': task('encoder', ['text'], [], 'Zero-shot classifier'),
  'question-answering': task('encoder', ['text'], ['text'], 'Question answering model'),
  'table-question-answering': task('encoder', ['text'], ['text'], 'Table question answering model'),
  'audio-classification': task('encoder', ['audio'], [], 'Audio classifier'),
  'image-classification': task('vision', ['image'], [], 'Image classifier'),
  'object-detection': task('vision', ['image'], [], 'Object detector'),
  'zero-shot-object-detection': task('vision', ['text', 'image'], [], 'Open-vocabulary object detector'),
  'image-segmentation': task('vision', ['image'], [], 'Segmentation model'),
  'mask-generation': task('vision', ['image'], [], 'Segmentation model'),
  'depth-estimation': task('vision', ['image'], [], 'Depth estimation model'),
  'keypoint-detection': task('vision', ['image'], [], 'Keypoint detector'),
  'video-classification': task('vision', ['video'], [], 'Video classifier'),
  'image-to-text': task('vision', ['image'], ['text'], 'Image-to-text model'),
  'visual-question-answering': task('vision', ['text', 'image'], ['text'], 'Visual question answering model'),
  'document-question-answering': task('vision', ['text', 'image'], ['text'], 'Document question answering model'),
  'time-series-forecasting': task('forecast', [], [], 'Time-series forecasting model'),
};

/** For repos that don't declare a task: well-known architectures, read from the name. */
const GUESSES: [RegExp, string][] = [
  [/tts/i, 'text-to-speech'],
  [/whisper|voxtral|(^|[-_])asr([-_]|$)|wav2vec2|wavlm|hubert/i, 'automatic-speech-recognition'],
  [/clip/i, 'zero-shot-image-classification'],
  [/contriever|(^|[-_])dpr[-_]|embed|(^|[-_])(bge|gte|e5)[-_]/i, 'feature-extraction'],
  [/time-?series|chronos|timesfm|moirai|tspulse/i, 'time-series-forecasting'],
  [/(^|[-_])(m?t5|byt5|umt5|bart|mbart|m2m100|blenderbot|prophetnet|pegasus)([-_]|$)/i, 'text2text-generation'],
  [/bert|electra|longformer|layoutlm|layoutxlm|funnel|fnet|bigbird|xlnet/i, 'fill-mask'],
];

/** Quantized or converted copies of a model that's already on the list. */
const COPY = /(^|[-_.])(gguf|awq|gptq|(mx|nv)?fp[468]|int[348]|bnb|mlx|exl2|onnx|[48]bit|w4a16|w8a8|w4a8|qat|quantized)([-_.]|$)/i;
/** Repos that hold code or one component of a model rather than a model. */
const NOT_A_MODEL = /implementation|tokenizer|(^|[-_])(code|vae|decoder)$/i;
/** The same weights in another file layout. */
const FORMAT = /[-_](hf|diffusers|transformers)$/i;
const REASONING = /(^|[-_])(r1|thinking|reasoning|reasoner)([-_]|$)/i;

export const repoName = (id: string) => id.slice(id.indexOf('/') + 1);
export const orgOf = (id: string) => id.slice(0, id.indexOf('/'));

/** A repo that holds a model of its own: not a quantized copy, a second file layout's twin, an adapter, or code. */
export function isModelRepo(r: Pick<RawHubRepo, 'id' | 'tags' | 'library_name'>): boolean {
  const name = repoName(r.id);
  if (COPY.test(name) || NOT_A_MODEL.test(name)) return false;
  return !(r.tags?.includes('gguf') || r.tags?.includes('lora') || r.library_name === 'peft');
}

/** What a repo is for, from its declared task or, failing that, its name and library. */
export function hubTask(r: Pick<RawHubRepo, 'id' | 'pipeline_tag' | 'library_name' | 'tags'>): Task | null {
  const name = repoName(r.id);
  let spec = r.pipeline_tag ? TASKS[r.pipeline_tag] : undefined;
  if (!spec && !r.pipeline_tag) {
    const guess = GUESSES.find(([re]) => re.test(name))?.[1];
    const chat = r.library_name === 'vllm' || r.library_name === 'mistral-common' || r.tags?.includes('text-generation');
    spec = TASKS[guess ?? (chat ? 'text-generation' : '')];
  }
  if (!spec) return null;
  if (/rerank/i.test(name)) return { ...spec, type: 'rerank' };
  if (/guard|safety|moderation|shield/i.test(name)) return { ...spec, type: 'safety' };
  return spec;
}

/** Two significant digits: 6,107,231 downloads is stored as 6,100,000. */
const round2 = (n: number | undefined) => {
  const v = Math.max(0, Math.round(n ?? 0));
  return v < 100 ? v : Number(v.toPrecision(2));
};

export function hubStats(r: RawHubRepo): HubStats {
  const params = r.safetensors?.total;
  return {
    repo: r.id,
    downloads: round2(r.downloads),
    likes: round2(r.likes),
    params: typeof params === 'number' && params >= 1 ? Math.round(params) : null,
    gated: r.gated === true || (typeof r.gated === 'string' && r.gated !== 'false'),
  };
}

const CUSTOM = 'Custom license';

function hubLicense(r: RawHubRepo, lab: LabConfig): License {
  const tag = licenseTag(r.tags);
  if (!tag) return defaultLicense(lab, true);
  return { name: tag === 'other' ? CUSTOM : prettyLicense(tag), source: 'huggingface', url: `https://huggingface.co/${r.id}` };
}

function toHubModel(r: RawHubRepo, spec: Task, lab: LabConfig, releaseDate: string): Model {
  const name = repoName(r.id);
  const slug = slugify(name).toLowerCase();
  const stats = hubStats(r);
  const size = stats.params ? `, ${formatParams(stats.params)} parameters` : '';
  return {
    key: `${lab.key}/${slug}`,
    id: r.id,
    slug,
    lab: lab.key,
    type: spec.type,
    name,
    description: `${spec.label} from ${lab.name}${size}.`,
    family: null,
    releaseDate,
    lastUpdated: day(r.lastModified),
    knowledge: null,
    context: null,
    maxOutput: null,
    price: null,
    input: spec.input,
    output: spec.output,
    reasoning: spec.type === 'text' && REASONING.test(name),
    toolCall: false,
    structuredOutput: false,
    attachment: false,
    openWeights: true,
    status: PREVIEW.test(name) ? 'preview' : null,
    access: 'open',
    rarity: 'promo',
    set: 0,
    license: hubLicense(r, lab),
    origin: 'huggingface',
    hub: stats,
  };
}

const SUFFIXES = ['', 'instruct', 'it', 'chat'];
const byDownloads = (a: RawHubRepo, b: RawHubRepo) => (b.downloads ?? 0) - (a.downloads ?? 0) || a.id.localeCompare(b.id);

/** The repo behind a models.dev card: same normalized name, allowing the usual instruct suffixes. Most downloaded wins. */
export function matchRepo(m: Pick<Model, 'id' | 'name' | 'slug'>, repos: RawHubRepo[]): RawHubRepo | undefined {
  const targets = [m.name, m.id, m.slug].map((x) => normalizeName(x.split('/').pop() ?? x));
  return repos
    .filter((r) => {
      const n = normalizeName(repoName(r.id));
      return SUFFIXES.some((s) => targets.some((t) => t && n === t + s));
    })
    .sort(byDownloads)[0];
}

export function parseListing(body: unknown): RawHubRepo[] {
  if (!Array.isArray(body)) throw new Error('Hugging Face returned something other than a list of models');
  return body.flatMap((r) => {
    const parsed = rawHubRepoSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

export interface HubStatsSummary {
  orgs: number;
  repos: number;
  /** models.dev cards that found their repo. */
  matched: number;
  /** Cards that exist only because of Hugging Face. */
  cards: number;
  failedOrgs: string[];
}

/**
 * Adds Hugging Face to a models.dev dataset. Pure: listings in, dataset out.
 * A `null` listing means that org couldn't be fetched, so its cards and stats carry over from `previous`.
 */
export function mergeHub(
  dataset: Dataset,
  labs: LabConfig[],
  listings: Map<string, RawHubRepo[] | null>,
  opts: { previous?: Dataset | null; minDownloads?: number; boost?: Set<string> } = {},
): { dataset: Dataset; stats: HubStatsSummary } {
  const min = opts.minDownloads ?? HUB_MIN_DOWNLOADS;
  // Repos the trending radar vouched for: popular right now, even before their downloads catch up.
  const boost = opts.boost ?? new Set<string>();
  const previous = opts.previous?.models ?? [];
  const before = new Map(previous.map((m) => [m.key, m]));
  const carded = new Set(previous.flatMap((m) => (m.origin === 'huggingface' && m.hub ? [m.hub.repo] : [])));
  const taken = new Set(dataset.models.map((m) => m.key.toLowerCase()));
  const stats: HubStatsSummary = { orgs: 0, repos: 0, matched: 0, cards: 0, failedOrgs: [] };

  const models: Model[] = [];
  for (const lab of labs) {
    const repos: RawHubRepo[] = [];
    const failed = new Set<string>();
    for (const org of lab.hub ?? []) {
      const list = listings.get(org);
      if (!list) {
        failed.add(org);
        stats.failedOrgs.push(org);
        continue;
      }
      stats.orgs++;
      stats.repos += list.length;
      repos.push(...list);
    }
    const stale = (hub: HubStats | null | undefined) => Boolean(hub && failed.has(orgOf(hub.repo)));

    // models.dev cards keep their data and gain their repo's stats.
    const claimed = new Set<string>();
    for (const m of dataset.models.filter((x) => x.lab === lab.key)) {
      const repo = matchRepo(m, repos);
      const old = before.get(m.key)?.hub;
      if (repo) claimed.add(repo.id);
      if (repo) stats.matched++;
      models.push({ ...m, hub: repo ? hubStats(repo) : stale(old) ? old! : null });
    }

    // Everything else popular enough, one card per model: no quantized copies, no second file layout.
    const picks = new Map<string, RawHubRepo>();
    for (const r of [...repos].sort(byDownloads)) {
      const name = repoName(r.id);
      if (claimed.has(r.id) || !isModelRepo(r)) continue;
      if ((r.downloads ?? 0) < min && !carded.has(r.id) && !boost.has(r.id)) continue;
      if (!hubTask(r)) continue;
      const same = normalizeName(name.replace(FORMAT, ''));
      if (!picks.has(same)) picks.set(same, r);
    }
    const cards = new Map<string, Model>();
    for (const r of picks.values()) {
      const released = day(r.createdAt);
      if (!released || !slugify(repoName(r.id))) continue;
      const m = toHubModel(r, hubTask(r)!, lab, released);
      const folded = m.key.toLowerCase();
      if (taken.has(folded) || cards.has(folded)) continue;
      cards.set(folded, m);
    }
    for (const old of previous) {
      const folded = old.key.toLowerCase();
      if (old.lab === lab.key && old.origin === 'huggingface' && stale(old.hub) && !taken.has(folded) && !cards.has(folded)) cards.set(folded, old);
    }
    stats.cards += cards.size;
    models.push(...cards.values());
  }

  const docs = new Map(dataset.labs.map((l) => [l.key, l.docUrl]));
  const all = numberSet(models);
  return {
    dataset: {
      ...dataset,
      source: { ...dataset.source, hub: { orgs: stats.orgs, repos: stats.repos } },
      labs: summarizeLabs(all, labs, (lab) => docs.get(lab.key) ?? (lab.hub?.length ? `https://huggingface.co/${lab.hub[0]}` : null)),
      models: all,
    },
    stats,
  };
}

/**
 * Fetches every lab's Hugging Face orgs and merges them in. Never throws for network trouble:
 * an org that fails keeps yesterday's cards, and the sync's guardrails catch anything bigger.
 */
export async function addHubModels(
  dataset: Dataset,
  labs: LabConfig[],
  opts: { fetchJson: FetchJson; previous?: Dataset | null; minDownloads?: number; trending?: RawHubRepo[] },
): Promise<{ dataset: Dataset; stats: HubStatsSummary }> {
  const listings = new Map<string, RawHubRepo[] | null>();
  for (const org of new Set(labs.flatMap((l) => l.hub ?? []))) {
    listings.set(org, await opts.fetchJson(hubListUrl(org)).then(parseListing, () => null));
  }
  // The radar's picks join their org's listing even if a big org's top 1,000 by downloads left them out.
  const trending = opts.trending ?? [];
  for (const r of trending) {
    const org = [...listings.keys()].find((o) => o.toLowerCase() === orgOf(r.id).toLowerCase());
    const list = org ? listings.get(org) : null;
    if (list && !list.some((x) => x.id === r.id)) list.push(r);
  }
  const merged = mergeHub(dataset, labs, listings, { ...opts, boost: new Set(trending.map((r) => r.id)) });

  // `license:other` keeps the real name in the model card, one request per repo. If that fails, keep yesterday's name.
  const earlier = new Map((opts.previous?.models ?? []).map((m) => [m.key, m.license]));
  const models: Model[] = [];
  for (const m of merged.dataset.models) {
    if (m.origin !== 'huggingface' || m.license.name !== CUSTOM || !m.hub) {
      models.push(m);
      continue;
    }
    const old = earlier.get(m.key);
    const fallback = old?.source === 'huggingface' ? old.name : null;
    const name = (await customLicenseName(m.hub.repo, opts.fetchJson).catch(() => null)) ?? fallback;
    models.push(name ? { ...m, license: { ...m.license, name } } : m);
  }
  return { dataset: { ...merged.dataset, models }, stats: merged.stats };
}

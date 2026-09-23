export const MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'] as const;
export type Modality = (typeof MODALITIES)[number];

export const MODEL_TYPES = [
  'text',
  'image',
  'video',
  '3d',
  'audio',
  'voice',
  'transcription',
  'embedding',
  'rerank',
  'vision',
  'encoder',
  'forecast',
  'safety',
] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

export type Access = 'free' | 'open' | 'paid';
export type Rarity = 'promo' | 'common' | 'uncommon' | 'rare' | 'holo';
export type Status = 'preview' | 'beta' | 'deprecated';
export type LicenseSource = 'proprietary' | 'huggingface' | 'lab-default' | 'override';
/** models.dev lists models you can call; Hugging Face adds open models you download. */
export type Origin = 'models.dev' | 'huggingface';

/** From the model's Hugging Face repo. Counts are rounded to two significant digits so the data doesn't churn daily. */
export interface HubStats {
  /** `org/name` on huggingface.co */
  repo: string;
  /** Downloads in the last 30 days. */
  downloads: number;
  likes: number;
  params: number | null;
  /** The weights sit behind a license agreement on Hugging Face. */
  gated: boolean;
}

export interface License {
  name: string;
  source: LicenseSource;
  url?: string;
}

/** USD per million tokens. */
export interface Price {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
}

export interface Model {
  /** `${lab}/${slug}`, unique across the dataset and used in URLs. */
  key: string;
  /** The id the lab's API expects. May contain characters that can't go in a URL. */
  id: string;
  /** URL-safe form of the id. */
  slug: string;
  lab: string;
  type: ModelType;
  name: string;
  description: string;
  family: string | null;
  /** YYYY-MM-DD */
  releaseDate: string;
  lastUpdated: string | null;
  /** YYYY-MM or YYYY-MM-DD */
  knowledge: string | null;
  context: number | null;
  maxOutput: number | null;
  price: Price | null;
  input: Modality[];
  output: Modality[];
  reasoning: boolean;
  toolCall: boolean;
  structuredOutput: boolean;
  attachment: boolean;
  openWeights: boolean;
  status: Status | null;
  access: Access;
  rarity: Rarity;
  /** Release order across the whole set, starting at 1. */
  set: number;
  license: License;
  origin: Origin;
  hub: HubStats | null;
  /** Joined from `data/scores.json` when the site loads; the sync never writes it into models.json. */
  quality?: Quality | null;
}

/** The number on the card: the share of a public leaderboard's models this one beats. */
export interface Quality {
  value: number;
  basis: Board;
  rank: number;
  /** How many models the board ranks. */
  of: number;
}

export interface LabSummary {
  key: string;
  name: string;
  color: string;
  docUrl: string | null;
  count: number;
}

export interface Dataset {
  version: 1;
  /** ISO timestamp of the last sync that changed the data. */
  updatedAt: string;
  source: {
    url: string;
    providers: number;
    listings: number;
    /** Hugging Face accounts and repos scanned for open models. */
    hub: { orgs: number; repos: number };
  };
  labs: LabSummary[];
  models: Model[];
}

/** One provider selling a model through its API, from models.dev. Prices are USD per million tokens. */
export interface Offer {
  /** models.dev provider id; its name and docs link are in `OffersFile.providers`. */
  provider: string;
  /** The model's id at that provider. */
  model: string;
  input: number | null;
  output: number | null;
  context: number | null;
  /** Sold by the lab that made the model. */
  official: boolean;
}

/** One Hugging Face Inference Provider serving an open model, from the Hugging Face router. */
export interface HostOffer {
  provider: string;
  name: string;
  /** The model's Hugging Face page with this provider selected. */
  url: string;
  input: number | null;
  output: number | null;
  context: number | null;
  /** Tokens per second, measured by Hugging Face. */
  throughput: number | null;
  latencyMs: number | null;
  tools: boolean;
}

/** `data/offers.json`: where to run each card. Kept out of `models.json` so the binder stays light. */
export interface OffersFile {
  version: 1;
  updatedAt: string;
  /** Every models.dev provider that sells at least one card. */
  providers: Record<string, { name: string; url: string | null }>;
  models: Record<string, { offers: Offer[]; hf: HostOffer[] }>;
}

export type ChangeKind = 'added' | 'removed' | 'price' | 'retired';

/** One thing the daily sync noticed. `data/changes.json` keeps the last 90 days, newest first. */
export interface ChangeEvent {
  /** YYYY-MM-DD, the sync's day. */
  date: string;
  kind: ChangeKind;
  key: string;
  name: string;
  lab: string;
  /** For price changes: per million tokens, before and after. */
  before?: { input: number | null; output: number | null };
  after?: { input: number | null; output: number | null };
}

export interface ChangeLog {
  version: 1;
  events: ChangeEvent[];
}

/**
 * Public leaderboards a card can be scored on. `eci` is Epoch AI's Capabilities Index, built from dozens of benchmarks;
 * the rest are LMArena boards, where people vote between two anonymous answers.
 */
export const BOARDS = ['eci', 'text', 'coding', 'math', 'creative', 'webdev', 'vision', 'image', 'image-edit', 'video', 'image-video'] as const;
export type Board = (typeof BOARDS)[number];

/** Benchmarks Epoch AI runs itself. Scores are the share of questions solved, 0–1. */
export const BENCHES = ['gpqa', 'swe', 'frontiermath', 'aime', 'simpleqa'] as const;
export type Bench = (typeof BENCHES)[number];

export interface BoardScore {
  /** The board's own number: capability index or arena rating. */
  score: number;
  /** Place on the board, 1 is best. */
  rank: number;
  /** The name the board lists, so a close match is never passed off as exact. */
  as: string;
}

export interface CardScores {
  /** 0–100: the share of the models on `basis` that this one beats. The number on the card; null when no board fits the card's type. */
  quality: number | null;
  basis: Board | null;
  boards: Partial<Record<Board, BoardScore>>;
  bench: Partial<Record<Bench, number>>;
}

/** `data/scores.json`: public benchmark scores for the cards they could be matched to. */
export interface ScoresFile {
  version: 1;
  updatedAt: string;
  /** How many models each board ranks and the day it was published. */
  boards: Partial<Record<Board, { count: number; published: string | null }>>;
  bench: Partial<Record<Bench, { count: number }>>;
  models: Record<string, CardScores>;
}

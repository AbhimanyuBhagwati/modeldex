import type { LabConfig } from '@/config/labs';
import { hslHex } from '@/lib/color';
import { daysBetween } from '@/lib/format';
import { slugify } from './build';
import { hubTask, isModelRepo, orgOf } from './hub';
import type { RawHubRepo } from './schema';

/**
 * The trending radar. Downloads lag: a model everyone is talking about can show zero for days, and the binder
 * waits for 100,000 a month. So once a day it also reads Hugging Face's trending list, where likes move fast,
 * and lets through original models that people clearly want: sooner for labs the binder already covers, and with
 * a much higher bar for newcomers, whose lab it then adds by itself. Pure: listings in, decisions out.
 */

/** Likes an original model from a lab we already cover needs to skip the download threshold. */
export const RADAR_KNOWN_LIKES = 200;
/** Likes a model from a lab we don't cover needs to bring its lab in. High, because anyone can upload. */
export const RADAR_NEW_LAB_LIKES = 1000;
/** Only recent releases: an old repo trending again isn't news. */
export const RADAR_MAX_AGE_DAYS = 90;
/** New labs a single morning may add, so a spam wave can't flood the binder. */
export const RADAR_NEW_LABS_PER_DAY = 3;

const EXPAND = ['downloads', 'likes', 'pipeline_tag', 'library_name', 'createdAt', 'lastModified', 'tags', 'gated', 'safetensors', 'trendingScore'];

/** Hugging Face's trending models, hottest first. */
export const trendingUrl = (limit = 300) =>
  `https://huggingface.co/api/models?${new URLSearchParams([['sort', 'trendingScore'], ['direction', '-1'], ['limit', String(limit)], ...EXPAND.map((f) => ['expand[]', f])])}`;

/** Display name for a Hugging Face account, from the org or user profile. */
export const orgProfileUrl = (author: string) => `https://huggingface.co/api/organizations/${encodeURIComponent(author)}/overview`;
export const userProfileUrl = (author: string) => `https://huggingface.co/api/users/${encodeURIComponent(author)}/overview`;

/** A lab the radar brought in. Stored in `data/newcomers.json` so it stays, and its models keep syncing. */
export interface Newcomer {
  key: string;
  name: string;
  /** Its Hugging Face account. */
  author: string;
  color: string;
  /** YYYY-MM-DD: the morning the radar spotted it. */
  since: string;
  /** The repo that brought it in. */
  repo: string;
}

export interface NewcomersFile {
  version: 1;
  labs: Newcomer[];
}

/** Hugging Face tags a fine-tune, merge, adapter, or quantization with `base_model:...:<org>/<repo>`. */
export function derivedFrom(r: Pick<RawHubRepo, 'tags'>): string[] {
  return (r.tags ?? []).flatMap((t) => {
    if (!t.startsWith('base_model:')) return [];
    const id = t.split(':').pop() ?? '';
    return id.includes('/') ? [id] : [];
  });
}

/** Built on someone else's model: a fine-tune or copy, however popular. A lab building on its own base is fine. */
export const borrowed = (r: Pick<RawHubRepo, 'id' | 'tags'>) => derivedFrom(r).some((base) => orgOf(base).toLowerCase() !== orgOf(r.id).toLowerCase());

export interface RadarPick {
  repo: RawHubRepo;
  /** The lab it joins; for a newcomer, the key it will get. */
  lab: string;
  likes: number;
}

export interface RadarResult {
  /** Models from labs we cover, let in early. */
  known: RadarPick[];
  /** Hugging Face accounts to bring in as new labs, with the model that earned it. */
  newLabs: { author: string; pick: RadarPick }[];
}

export function radar(trending: RawHubRepo[], labs: LabConfig[], newcomers: Newcomer[], today: string): RadarResult {
  const labOf = new Map<string, string>();
  for (const l of labs) for (const org of l.hub ?? []) labOf.set(org.toLowerCase(), l.key);
  for (const n of newcomers) labOf.set(n.author.toLowerCase(), n.key);
  const known: RadarPick[] = [];
  const fresh = new Map<string, RadarPick>();
  for (const r of trending) {
    const likes = r.likes ?? 0;
    const age = r.createdAt ? daysBetween(r.createdAt.slice(0, 10), today) : Number.POSITIVE_INFINITY;
    if (age > RADAR_MAX_AGE_DAYS || !isModelRepo(r) || borrowed(r) || !hubTask(r)) continue;
    const author = orgOf(r.id);
    const lab = labOf.get(author.toLowerCase());
    if (lab) {
      if (likes >= RADAR_KNOWN_LIKES) known.push({ repo: r, lab, likes });
    } else if (likes >= RADAR_NEW_LAB_LIKES) {
      const had = fresh.get(author.toLowerCase());
      if (!had || likes > had.likes) fresh.set(author.toLowerCase(), { repo: r, lab: '', likes });
    }
  }
  const newLabs = [...fresh.values()]
    .sort((a, b) => b.likes - a.likes || a.repo.id.localeCompare(b.repo.id))
    .slice(0, RADAR_NEW_LABS_PER_DAY)
    .map((pick) => ({ author: orgOf(pick.repo.id), pick }));
  return { known, newLabs };
}

/** Words that don't make a lab name different: "Meta Inc." is still Meta. */
const SUFFIX_WORDS = /\b(inc|llc|ltd|corp|corporation|co|ai|labs?|research|official|org|team|hq|models?)\b/g;
const core = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(SUFFIX_WORDS, ' ').replace(/\s+/g, '');

/**
 * The lab a newcomer's display name claims to be, if any. Such an account is either a lab's new official
 * account or an impersonator, and neither should become a second lab by itself, so the sync reports it instead.
 */
export function clashingLab(fullname: string | null, labs: Pick<LabConfig, 'name'>[]): string | null {
  const c = core(fullname ?? '');
  if (!c) return null;
  return labs.find((l) => core(l.name) === c)?.name ?? null;
}

/** A stable, distinct card color from the lab's key. */
export function newcomerColor(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const hue = (h >>> 0) % 360;
  return hslHex(hue, 0.55, 0.46).toUpperCase();
}

/** A newcomer's entry: key from its display name, never clashing with a lab we already have. */
export function newcomer(author: string, fullname: string | null, repo: string, today: string, taken: Set<string>): Newcomer {
  const name = (fullname ?? '').trim() || author;
  let key = slugify(name).toLowerCase().replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || slugify(author).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(key)) key = `lab-${newcomerColor(author).slice(1).toLowerCase()}`;
  let unique = key;
  for (let i = 2; taken.has(unique); i++) unique = `${key}-${i}`;
  return { key: unique, name, author, color: newcomerColor(unique), since: today, repo };
}

/** Never matches a models.dev listing: newcomers only come from Hugging Face. */
const NOTHING = /(?!)/;

/** A newcomer as a lab the pipeline understands. Its art is generated from its key. */
export const newcomerLab = (n: Newcomer): LabConfig => ({
  key: n.key,
  name: n.name,
  color: n.color,
  art: 'emblem',
  providers: [],
  match: NOTHING,
  defaultLicense: null,
  hub: [n.author],
});

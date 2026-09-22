import type { LabConfig } from '@/config/labs';
import type { Dataset, License, Model } from '@/lib/types';
import { defaultLicense, normalizeName } from './build';

export interface HfRepo {
  id: string;
  /** Value of the `license:` tag, e.g. `mit` or `apache-2.0`. */
  license: string | null;
}

const NAMES: Record<string, string> = {
  mit: 'MIT',
  'apache-2.0': 'Apache 2.0',
  gemma: 'Gemma license',
  llama2: 'Llama 2 license',
  llama3: 'Llama 3 license',
  'llama3.1': 'Llama 3.1 license',
  'llama3.2': 'Llama 3.2 license',
  'llama3.3': 'Llama 3.3 license',
  llama4: 'Llama 4 license',
  'modified-mit': 'Modified MIT',
  'cc-by-4.0': 'CC BY 4.0',
  'cc-by-sa-4.0': 'CC BY-SA 4.0',
  'cc-by-nc-4.0': 'CC BY-NC 4.0',
  'cc-by-nc-sa-4.0': 'CC BY-NC-SA 4.0',
  'bsd-3-clause': 'BSD 3-Clause',
  openrail: 'OpenRAIL',
  'openrail++': 'OpenRAIL++',
  qwen: 'Qwen license',
  other: 'Custom license',
};
const UPPER = new Set(['mit', 'bsd', 'gpl', 'lgpl', 'agpl', 'cc', 'by', 'nc', 'sa', 'nd', 'ai', 'mrl', 'rail', 'glm']);
const CASED: Record<string, string> = { minimax: 'MiniMax', deepseek: 'DeepSeek', openai: 'OpenAI', license: 'license', licence: 'license' };

export function prettyLicense(tag: string): string {
  const t = tag.trim().toLowerCase();
  if (NAMES[t]) return NAMES[t];
  const words = t
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => CASED[w] ?? (UPPER.has(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)));
  const name = words.join(' ');
  return /\blicen[cs]e\b/i.test(name) ? name : `${name} license`;
}

export const licenseTag = (tags: unknown): string | null => {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((t): t is string => typeof t === 'string' && t.startsWith('license:'));
  return tag ? tag.slice('license:'.length) : null;
};

const SUFFIXES = ['', 'instruct', 'it', 'chat'];

/** Finds the Hugging Face repo for a model by exact normalized name, allowing common instruct suffixes. */
export function findRepo(model: Pick<Model, 'id' | 'name'>, repos: HfRepo[]): HfRepo | undefined {
  const targets = [normalizeName(model.name), normalizeName(model.id)];
  const sorted = [...repos].sort((a, b) => a.id.localeCompare(b.id));
  for (const suffix of SUFFIXES) {
    const hit = sorted.find((r) => {
      const n = normalizeName(r.id.split('/').pop() ?? '');
      return targets.some((t) => n === t + suffix);
    });
    if (hit) return hit;
  }
  return undefined;
}

type FetchJson = (url: string) => Promise<unknown>;

async function listRepos(src: { org: string; search?: string }, fetchJson: FetchJson): Promise<HfRepo[]> {
  const q = new URLSearchParams({ author: src.org, limit: '1000' });
  if (src.search) q.set('search', src.search);
  const body = await fetchJson(`https://huggingface.co/api/models?${q}`);
  if (!Array.isArray(body)) throw new Error(`Unexpected Hugging Face response for ${src.org}`);
  return body
    .filter((r): r is { id: string; tags?: unknown } => typeof r?.id === 'string')
    .map((r) => ({ id: r.id, license: licenseTag(r.tags) }));
}

/** `license:other` repos keep the real name in the model card. */
async function customLicenseName(repo: string, fetchJson: FetchJson): Promise<string | null> {
  const body = (await fetchJson(`https://huggingface.co/api/models/${repo}`)) as { cardData?: { license_name?: unknown } };
  const name = body?.cardData?.license_name;
  return typeof name === 'string' && name.trim() ? prettyLicense(name) : null;
}

export interface LicenseStats {
  huggingface: number;
  labDefault: number;
  override: number;
  proprietary: number;
  failedOrgs: string[];
}

/**
 * Refines open-weight licenses using Hugging Face. Never throws for network trouble:
 * on failure it falls back to the previous sync's answer, then to the lab default.
 */
export async function resolveLicenses(
  dataset: Dataset,
  labs: LabConfig[],
  opts: {
    fetchJson: FetchJson;
    previous?: Dataset | null;
    overrides?: Record<string, { name: string; url?: string }>;
  },
): Promise<{ dataset: Dataset; stats: LicenseStats }> {
  const stats: LicenseStats = { huggingface: 0, labDefault: 0, override: 0, proprietary: 0, failedOrgs: [] };
  const prior = new Map((opts.previous?.models ?? []).map((m) => [m.key, m.license]));
  const repos = new Map<string, HfRepo[] | null>();
  const custom = new Map<string, string | null>();

  for (const lab of labs) {
    if (!dataset.models.some((m) => m.lab === lab.key && m.openWeights)) continue;
    const all: HfRepo[] = [];
    let ok = true;
    for (const src of lab.huggingFace ?? []) {
      try {
        all.push(...(await listRepos(src, opts.fetchJson)));
      } catch {
        ok = false;
        stats.failedOrgs.push(src.org);
      }
    }
    repos.set(lab.key, ok ? all : null);
  }

  const models: Model[] = [];
  for (const m of dataset.models) {
    const lab = labs.find((l) => l.key === m.lab)!;
    let license: License;
    const override = opts.overrides?.[m.key];
    if (override) {
      license = { name: override.name, source: 'override', ...(override.url ? { url: override.url } : {}) };
    } else if (!m.openWeights) {
      license = { name: 'Proprietary', source: 'proprietary' };
    } else {
      const list = repos.get(m.lab);
      const repo = list ? findRepo(m, list) : undefined;
      license = defaultLicense(lab, true);
      if (list === null) {
        const before = prior.get(m.key);
        if (before?.source === 'huggingface') license = before;
      } else if (repo?.license) {
        let name: string | null = repo.license === 'other' ? null : prettyLicense(repo.license);
        if (!name) {
          if (!custom.has(repo.id)) custom.set(repo.id, await customLicenseName(repo.id, opts.fetchJson).catch(() => null));
          name = custom.get(repo.id) ?? 'Custom license';
        }
        license = { name, source: 'huggingface', url: `https://huggingface.co/${repo.id}` };
      }
    }
    if (license.source === 'huggingface') stats.huggingface++;
    else if (license.source === 'lab-default') stats.labDefault++;
    else if (license.source === 'override') stats.override++;
    else stats.proprietary++;
    models.push({ ...m, license });
  }

  return { dataset: { ...dataset, models }, stats };
}

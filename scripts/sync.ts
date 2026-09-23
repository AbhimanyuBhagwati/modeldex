import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ZodType } from 'zod';
import { LABS, LICENSE_OVERRIDES } from '@/config/labs';
import { buildDataset } from '@/lib/pipeline/build';
import { changeEvents, diffDatasets, markdownReport, mergeChangeLog, sameContent, summarize } from '@/lib/pipeline/diff';
import { HUB_MIN_DOWNLOADS, addHubModels } from '@/lib/pipeline/hub';
import { resolveLicenses } from '@/lib/pipeline/licenses';
import { buildHostOffers, buildOffers, joinOffers } from '@/lib/pipeline/offers';
import { changeLogSchema, datasetSchema, offersFileSchema } from '@/lib/pipeline/schema';
import type { ChangeLog, Dataset, HostOffer, OffersFile } from '@/lib/types';

const SOURCE_URL = 'https://models.dev/api.json';
const OUT_FILE = path.join(process.cwd(), 'data', 'models.json');
const OFFERS_FILE = path.join(process.cwd(), 'data', 'offers.json');
const CHANGES_FILE = path.join(process.cwd(), 'data', 'changes.json');
/** Hugging Face's list of models its Inference Providers serve, with each host's price and speed. */
const ROUTER_URL = 'https://router.huggingface.co/v1/models';
/** A sync that produces fewer models than this is treated as a broken upstream, not real news. */
const MIN_MODELS = 100;
const MAX_DROP = 0.25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Optional. Hugging Face rate-limits anonymous calls per IP, and CI runners share IPs; a free read token gets its own limit. */
const HF_TOKEN = process.env.HF_TOKEN?.trim();

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'modeldex-sync' };
  if (HF_TOKEN && new URL(url).hostname === 'huggingface.co') headers.authorization = `Bearer ${HF_TOKEN}`;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
      return await res.json();
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(1500 * i);
    }
  }
}

/** Data written before Hugging Face cards existed lacks their fields; fill them so diffs and guardrails still work. */
function upgrade(data: { source?: object; models?: object[] }) {
  if (data.source && !('hub' in data.source)) data.source = { ...data.source, hub: { orgs: 0, repos: 0 } };
  data.models = data.models?.map((m) => ({ origin: 'models.dev', hub: null, ...m }));
  return data;
}

async function readPrevious(): Promise<Dataset | null> {
  try {
    const parsed = datasetSchema.safeParse(upgrade(JSON.parse(await readFile(OUT_FILE, 'utf8'))));
    return parsed.success ? (parsed.data as Dataset) : null;
  } catch {
    return null;
  }
}

async function readData<T>(file: string, schema: ZodType): Promise<T | null> {
  try {
    const parsed = schema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    return parsed.success ? (parsed.data as T) : null;
  } catch {
    return null;
  }
}

const writeData = (file: string, data: unknown) => writeFile(file, JSON.stringify(data, null, 2) + '\n');

async function ghOutput(values: Record<string, string>) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const body = Object.entries(values)
    .map(([k, v]) => `${k}=${v.replace(/[\r\n]+/g, ' ')}`)
    .join('\n');
  await appendFile(file, body + '\n');
}

async function ghSummary(markdown: string) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) await appendFile(file, markdown + '\n');
}

function fail(message: string): never {
  console.error(`\nSync stopped: ${message}\nThe site keeps serving the last good data.`);
  process.exit(1);
}

async function main() {
  const started = Date.now();
  console.log(`Fetching ${SOURCE_URL}`);
  const raw = await fetchJson(SOURCE_URL).catch((e) => fail(`couldn't download models.dev (${e.message})`));
  const previous = await readPrevious();

  const built = buildDataset(raw, LABS, { sourceUrl: SOURCE_URL, updatedAt: new Date().toISOString() });
  const licensed = await resolveLicenses(built.dataset, LABS, {
    fetchJson: (u) => fetchJson(u, 2),
    previous,
    overrides: LICENSE_OVERRIDES,
  });
  const stats = licensed.stats;
  console.log(`Fetching Hugging Face orgs (cards need ${HUB_MIN_DOWNLOADS.toLocaleString('en-US')} downloads a month)`);
  const { dataset, stats: hub } = await addHubModels(licensed.dataset, LABS, { fetchJson: (u) => fetchJson(u, 2), previous });

  const check = datasetSchema.safeParse(dataset);
  if (!check.success) fail(`the new data failed validation:\n${check.error.issues.slice(0, 10).map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  if (dataset.models.length < MIN_MODELS) fail(`only ${dataset.models.length} models came through (minimum is ${MIN_MODELS})`);
  if (previous && dataset.models.length < previous.models.length * (1 - MAX_DROP)) {
    fail(`model count fell from ${previous.models.length} to ${dataset.models.length}, more than ${MAX_DROP * 100}% in one day`);
  }

  const notes = [...built.issues];
  if (stats.failedOrgs.length) notes.push(`Hugging Face lookup failed for ${stats.failedOrgs.join(', ')}; kept earlier licenses`);
  if (hub.failedOrgs.length) notes.push(`Hugging Face listing failed for ${hub.failedOrgs.join(', ')}; kept earlier cards`);

  // Where to run each card: every models.dev provider that sells it, plus Hugging Face's hosts for open models.
  const previousOffers = await readData<OffersFile>(OFFERS_FILE, offersFileSchema);
  let hosts: Record<string, HostOffer[]>;
  try {
    hosts = buildHostOffers(await fetchJson(ROUTER_URL, 2), dataset);
  } catch (e) {
    notes.push(`Hugging Face router failed (${e instanceof Error ? e.message : e}); kept earlier host prices`);
    hosts = Object.fromEntries(Object.entries(previousOffers?.models ?? {}).flatMap(([k, v]) => (v.hf.length ? [[k, v.hf]] : [])));
  }
  const offers = joinOffers(buildOffers(raw, dataset, LABS), hosts, dataset.updatedAt);
  const offersCheck = offersFileSchema.safeParse(offers);
  if (!offersCheck.success) fail(`the provider offers failed validation: ${offersCheck.error.issues[0]?.path.join('.')}: ${offersCheck.error.issues[0]?.message}`);
  for (const n of notes) console.warn(`  note: ${n}`);
  console.log(
    `Built ${dataset.models.length} models from ${dataset.labs.length} labs ` +
      `(licenses: ${stats.huggingface} from Hugging Face, ${stats.labDefault} lab default, ${stats.override} override)`,
  );
  console.log(`Hugging Face: ${hub.repos.toLocaleString('en-US')} repos across ${hub.orgs} orgs, ${hub.cards} open-model cards, ${hub.matched} models.dev cards with stats`);
  const offerCount = Object.values(offers.models).reduce((n, m) => n + m.offers.length + m.hf.length, 0);
  console.log(`Where to run it: ${offerCount.toLocaleString('en-US')} offers for ${Object.keys(offers.models).length} cards from ${Object.keys(offers.providers).length} providers`);

  const modelsChanged = !previous || !sameContent(previous, dataset);
  const offersChanged = !previousOffers || !sameContent(previousOffers, offers);
  if (!modelsChanged && !offersChanged) {
    console.log(`No changes since ${previous!.updatedAt}. Nothing written. (${Date.now() - started} ms)`);
    await ghOutput({ changed: 'false' });
    await ghSummary('## Model sync: no changes');
    return;
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const written: string[] = [];
  let title = 'provider prices';
  const diff = diffDatasets(previous, dataset);
  if (modelsChanged) {
    await writeData(OUT_FILE, dataset);
    title = summarize(diff);
    written.push(path.relative(process.cwd(), OUT_FILE));
    // The log behind "New this week" and the RSS feed.
    const previousLog = await readData<ChangeLog>(CHANGES_FILE, changeLogSchema);
    const log = mergeChangeLog(previousLog, changeEvents(previous, diff, dataset.updatedAt.slice(0, 10)), dataset.updatedAt.slice(0, 10));
    if (!previousLog || JSON.stringify(previousLog) !== JSON.stringify(log)) {
      await writeData(CHANGES_FILE, log);
      written.push(path.relative(process.cwd(), CHANGES_FILE));
    }
  }
  if (offersChanged) {
    await writeData(OFFERS_FILE, offers);
    written.push(path.relative(process.cwd(), OFFERS_FILE));
  }
  console.log(`Wrote ${written.join(', ')}: ${title} (${Date.now() - started} ms)`);
  await ghOutput({ changed: 'true', title });
  await ghSummary(modelsChanged ? markdownReport(diff, dataset, notes) : `## Model sync: provider prices changed\n\n${notes.map((n) => `- ${n}`).join('\n')}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

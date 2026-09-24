import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { parquetReadObjects } from 'hyparquet';
import type { ZodType } from 'zod';
import { LABS, LICENSE_OVERRIDES } from '@/config/labs';
import { buildDataset } from '@/lib/pipeline/build';
import { changeEvents, diffDatasets, markdownReport, mergeChangeLog, sameContent, summarize } from '@/lib/pipeline/diff';
import { HUB_MIN_DOWNLOADS, addHubModels, parseListing } from '@/lib/pipeline/hub';
import { resolveLicenses } from '@/lib/pipeline/licenses';
import { buildHostOffers, buildOffers, joinOffers } from '@/lib/pipeline/offers';
import { RADAR_NEW_LAB_LIKES, clashingLab, newcomer, newcomerLab, orgProfileUrl, radar, trendingUrl, userProfileUrl, type Newcomer, type NewcomersFile } from '@/lib/pipeline/radar';
import { changeLogSchema, datasetSchema, newcomersFileSchema, offersFileSchema, scoresFileSchema, type RawHubRepo } from '@/lib/pipeline/schema';
import { ARENA_CONFIGS, BENCH_FILES, buildScores, type ArenaRow, type EpochInput } from '@/lib/pipeline/scores';
import type { ChangeLog, Dataset, HostOffer, OffersFile, ScoresFile } from '@/lib/types';

const SOURCE_URL = 'https://models.dev/api.json';
const OUT_FILE = path.join(process.cwd(), 'data', 'models.json');
const OFFERS_FILE = path.join(process.cwd(), 'data', 'offers.json');
const CHANGES_FILE = path.join(process.cwd(), 'data', 'changes.json');
const SCORES_FILE = path.join(process.cwd(), 'data', 'scores.json');
const NEWCOMERS_FILE = path.join(process.cwd(), 'data', 'newcomers.json');
/** Hugging Face's list of models its Inference Providers serve, with each host's price and speed. */
const ROUTER_URL = 'https://router.huggingface.co/v1/models';
/** Epoch AI's Benchmarking Hub, CC BY 4.0: its Capabilities Index and the benchmarks it runs itself. */
const EPOCH_URL = 'https://epoch.ai/data/benchmark_data.zip';
/** LMArena's published leaderboards, CC BY 4.0. */
const ARENA_DATASET = 'lmarena-ai/leaderboard-dataset';
/** Fewer scored cards than this means a source changed shape; keep the last good scores. */
const MIN_SCORED = 50;
/** A sync that produces fewer models than this is treated as a broken upstream, not real news. */
const MIN_MODELS = 100;
const MAX_DROP = 0.25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Optional. Hugging Face rate-limits anonymous calls per IP, and CI runners share IPs; a free read token gets its own limit. */
const HF_TOKEN = process.env.HF_TOKEN?.trim();

async function download<T>(url: string, attempts: number, read: (res: Response) => Promise<T>, accept = 'application/json'): Promise<T> {
  const headers: Record<string, string> = { accept, 'user-agent': 'modeldex-sync' };
  if (HF_TOKEN && new URL(url).hostname === 'huggingface.co') headers.authorization = `Bearer ${HF_TOKEN}`;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
      return await read(res);
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(1500 * i);
    }
  }
}

const fetchJson = (url: string, attempts = 3): Promise<unknown> => download(url, attempts, (res) => res.json());
const fetchBytes = (url: string, attempts = 3) => download(url, attempts, (res) => res.arrayBuffer(), '*/*');

/** The Capabilities Index, the version list that ties it to API ids, and Epoch's own benchmark runs. */
async function fetchEpoch(): Promise<EpochInput> {
  const wanted = new Set(['eci_scores.csv', 'model_metadata.csv', ...Object.values(BENCH_FILES)]);
  const base = (name: string) => name.split('/').pop() ?? name;
  const files = unzipSync(new Uint8Array(await fetchBytes(EPOCH_URL)), { filter: (f) => wanted.has(base(f.name)) });
  const text = new Map(Object.entries(files).map(([name, bytes]) => [base(name), strFromU8(bytes)]));
  const eci = text.get('eci_scores.csv');
  const metadata = text.get('model_metadata.csv');
  if (!eci || !metadata) throw new Error('benchmark_data.zip no longer has eci_scores.csv and model_metadata.csv');
  const bench = Object.fromEntries(Object.entries(BENCH_FILES).flatMap(([id, file]) => (text.has(file) ? [[id, text.get(file)!]] : [])));
  return { eci, metadata, bench };
}

const isoDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));

/** The latest published board for each arena. A config that fails is left out, so its earlier scores are kept. */
async function fetchArena(notes: string[]): Promise<Record<string, ArenaRow[]>> {
  const info = (await fetchJson(`https://huggingface.co/api/datasets/${ARENA_DATASET}`, 2)) as { siblings?: { rfilename: string }[] };
  const files = info.siblings?.map((s) => s.rfilename) ?? [];
  const out: Record<string, ArenaRow[]> = {};
  for (const config of ARENA_CONFIGS) {
    try {
      const parts = files.filter((f) => f.startsWith(`${config}/latest-`) && f.endsWith('.parquet'));
      if (!parts.length) throw new Error('no latest split');
      const rows: ArenaRow[] = [];
      for (const part of parts) {
        const file = await fetchBytes(`https://huggingface.co/datasets/${ARENA_DATASET}/resolve/main/${part}`, 2);
        const read = await parquetReadObjects({ file, columns: ['model_name', 'rating', 'category', 'leaderboard_publish_date'] });
        for (const r of read) {
          rows.push({ model_name: String(r.model_name ?? ''), rating: Number(r.rating), category: String(r.category ?? ''), leaderboard_publish_date: isoDate(r.leaderboard_publish_date) });
        }
      }
      out[config] = rows;
    } catch (e) {
      notes.push(`LMArena ${config} failed (${e instanceof Error ? e.message : e}); kept earlier scores`);
    }
  }
  return out;
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

/** A Hugging Face account's display name, "Convai Innovations" for convaiinnovations. Orgs and users live at different addresses. */
async function profileName(author: string): Promise<string | null> {
  for (const url of [orgProfileUrl(author), userProfileUrl(author)]) {
    const body = (await fetchJson(url, 1).catch(() => null)) as { fullname?: unknown } | null;
    if (body && typeof body.fullname === 'string' && body.fullname.trim()) return body.fullname.trim();
  }
  return null;
}

/**
 * The trending radar: reads Hugging Face's trending list and returns the repos to let in early, plus any new labs.
 * Never throws; a failed fetch just means no early arrivals today.
 */
async function runRadar(newcomers: Newcomer[], today: string, notes: string[]): Promise<{ picks: RawHubRepo[]; newcomers: Newcomer[]; found: Map<string, string> }> {
  let trending: RawHubRepo[];
  try {
    trending = parseListing(await fetchJson(trendingUrl(), 2));
  } catch (e) {
    notes.push(`Trending radar couldn't read Hugging Face (${e instanceof Error ? e.message : e}); no early arrivals today`);
    return { picks: [], newcomers, found: new Map() };
  }
  const result = radar(trending, LABS, newcomers, today);
  const taken = new Set([...LABS.map((l) => l.key), ...newcomers.map((n) => n.key)]);
  const added: Newcomer[] = [];
  const found = new Map<string, string>();
  for (const { author, pick } of result.newLabs) {
    const fullname = await profileName(author);
    const clash = clashingLab(fullname, [...LABS, ...newcomers]);
    if (clash) {
      notes.push(`Trending radar: ${author} calls itself "${fullname}", like our ${clash} lab. If it's theirs, add it to that lab's hub accounts in src/config/labs.ts`);
      continue;
    }
    const n = newcomer(author, fullname, pick.repo.id, today, taken);
    taken.add(n.key);
    added.push(n);
    found.set(n.key, `new lab ${n.name}, for ${pick.repo.id} (${pick.likes.toLocaleString('en-US')} likes)`);
  }
  console.log(`Trending radar: ${trending.length} trending repos, ${result.known.length} early arrivals from labs we cover, ${added.length} new labs (${RADAR_NEW_LAB_LIKES.toLocaleString('en-US')}+ likes)`);
  const welcomed = new Set(added.map((n) => n.author.toLowerCase()));
  return {
    picks: [...result.known.map((p) => p.repo), ...result.newLabs.filter((x) => welcomed.has(x.author.toLowerCase())).map((x) => x.pick.repo)],
    newcomers: [...newcomers, ...added],
    found,
  };
}

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
  const radarNotes: string[] = [];
  const previousNewcomers = await readData<NewcomersFile>(NEWCOMERS_FILE, newcomersFileSchema);
  const today = built.dataset.updatedAt.slice(0, 10);
  const scan = await runRadar(previousNewcomers?.labs ?? [], today, radarNotes);
  console.log(`Fetching Hugging Face orgs (cards need ${HUB_MIN_DOWNLOADS.toLocaleString('en-US')} downloads a month, or a place on the trending radar)`);
  const { dataset, stats: hub } = await addHubModels(licensed.dataset, [...LABS, ...scan.newcomers.map(newcomerLab)], {
    fetchJson: (u) => fetchJson(u, 2),
    previous,
    trending: scan.picks,
  });
  // A newcomer stays only while it has a card: a pick can still fall through, for example a name already taken.
  const withCards = new Set(dataset.models.map((m) => m.lab));
  const newcomers: NewcomersFile = { version: 1, labs: scan.newcomers.filter((n) => withCards.has(n.key)) };
  const before = new Set((previous?.models ?? []).map((m) => m.key));
  const early = dataset.models.filter((m) => !before.has(m.key) && m.hub && scan.picks.some((r) => r.id === m.hub!.repo));
  if (early.length) radarNotes.push(`Trending radar let in ${early.map((m) => m.hub!.repo).join(', ')}`);
  for (const n of newcomers.labs) if (scan.found.has(n.key)) radarNotes.push(`Trending radar: ${scan.found.get(n.key)}`);

  const check = datasetSchema.safeParse(dataset);
  if (!check.success) fail(`the new data failed validation:\n${check.error.issues.slice(0, 10).map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  if (dataset.models.length < MIN_MODELS) fail(`only ${dataset.models.length} models came through (minimum is ${MIN_MODELS})`);
  if (previous && dataset.models.length < previous.models.length * (1 - MAX_DROP)) {
    fail(`model count fell from ${previous.models.length} to ${dataset.models.length}, more than ${MAX_DROP * 100}% in one day`);
  }

  const notes = [...built.issues, ...radarNotes];
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

  // Public benchmark scores. A failed source keeps its earlier scores; a broken result keeps the whole earlier file.
  console.log('Fetching benchmark scores from Epoch AI and LMArena');
  const previousScores = await readData<ScoresFile>(SCORES_FILE, scoresFileSchema);
  const epoch = await fetchEpoch().catch((e) => {
    notes.push(`Epoch AI download failed (${e instanceof Error ? e.message : e}); kept earlier scores`);
    return null;
  });
  const arena = await fetchArena(notes).catch((e) => {
    notes.push(`LMArena listing failed (${e instanceof Error ? e.message : e}); kept earlier scores`);
    return {};
  });
  let scores: ScoresFile | null = buildScores(dataset, { epoch, arena }, dataset.updatedAt, previousScores);
  const scoresCheck = scoresFileSchema.safeParse(scores);
  const scored = Object.values(scores.models).filter((s) => s.quality != null).length;
  if (!scoresCheck.success || scored < MIN_SCORED) {
    const why = scoresCheck.success ? `only ${scored} cards scored` : `${scoresCheck.error.issues[0]?.path.join('.')}: ${scoresCheck.error.issues[0]?.message}`;
    notes.push(`benchmark scores looked wrong (${why}); kept earlier scores`);
    scores = previousScores;
  }
  for (const n of notes) console.warn(`  note: ${n}`);
  console.log(
    `Built ${dataset.models.length} models from ${dataset.labs.length} labs ` +
      `(licenses: ${stats.huggingface} from Hugging Face, ${stats.labDefault} lab default, ${stats.override} override)`,
  );
  console.log(`Hugging Face: ${hub.repos.toLocaleString('en-US')} repos across ${hub.orgs} orgs, ${hub.cards} open-model cards, ${hub.matched} models.dev cards with stats`);
  const offerCount = Object.values(offers.models).reduce((n, m) => n + m.offers.length + m.hf.length, 0);
  console.log(`Where to run it: ${offerCount.toLocaleString('en-US')} offers for ${Object.keys(offers.models).length} cards from ${Object.keys(offers.providers).length} providers`);
  if (scores) {
    const boards = Object.entries(scores.boards).map(([b, v]) => `${b} ${v!.count}`).join(', ');
    console.log(`Benchmark scores: ${Object.values(scores.models).filter((s) => s.quality != null).length} cards rated (boards: ${boards})`);
  }

  const modelsChanged = !previous || !sameContent(previous, dataset);
  const offersChanged = !previousOffers || !sameContent(previousOffers, offers);
  const scoresChanged = scores != null && (!previousScores || !sameContent(previousScores, scores));
  const newcomersChanged = JSON.stringify(previousNewcomers ?? { version: 1, labs: [] }) !== JSON.stringify(newcomers);
  if (!modelsChanged && !offersChanged && !scoresChanged && !newcomersChanged) {
    console.log(`No changes since ${previous!.updatedAt}. Nothing written. (${Date.now() - started} ms)`);
    await ghOutput({ changed: 'false' });
    await ghSummary('## Model sync: no changes');
    return;
  }

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const written: string[] = [];
  let title = [offersChanged && 'provider prices', scoresChanged && 'benchmark scores'].filter(Boolean).join(' and ');
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
  if (scoresChanged) {
    await writeData(SCORES_FILE, scores);
    written.push(path.relative(process.cwd(), SCORES_FILE));
  }
  if (newcomersChanged) {
    await writeData(NEWCOMERS_FILE, newcomers);
    written.push(path.relative(process.cwd(), NEWCOMERS_FILE));
  }
  console.log(`Wrote ${written.join(', ')}: ${title} (${Date.now() - started} ms)`);
  await ghOutput({ changed: 'true', title });
  await ghSummary(modelsChanged ? markdownReport(diff, dataset, notes) : `## Model sync: ${title} changed\n\n${notes.map((n) => `- ${n}`).join('\n')}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

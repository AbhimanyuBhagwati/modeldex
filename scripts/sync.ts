import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LABS, LICENSE_OVERRIDES } from '@/config/labs';
import { buildDataset } from '@/lib/pipeline/build';
import { diffDatasets, markdownReport, sameContent, summarize } from '@/lib/pipeline/diff';
import { resolveLicenses } from '@/lib/pipeline/licenses';
import { datasetSchema } from '@/lib/pipeline/schema';
import type { Dataset } from '@/lib/types';

const SOURCE_URL = 'https://models.dev/api.json';
const OUT_FILE = path.join(process.cwd(), 'data', 'models.json');
/** A sync that produces fewer models than this is treated as a broken upstream, not real news. */
const MIN_MODELS = 100;
const MAX_DROP = 0.25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, attempts = 3): Promise<unknown> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'modeldex-sync' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
      return await res.json();
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(1500 * i);
    }
  }
}

async function readPrevious(): Promise<Dataset | null> {
  try {
    const parsed = datasetSchema.safeParse(JSON.parse(await readFile(OUT_FILE, 'utf8')));
    return parsed.success ? (parsed.data as Dataset) : null;
  } catch {
    return null;
  }
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
  const { dataset, stats } = await resolveLicenses(built.dataset, LABS, {
    fetchJson: (u) => fetchJson(u, 2),
    previous,
    overrides: LICENSE_OVERRIDES,
  });

  const check = datasetSchema.safeParse(dataset);
  if (!check.success) fail(`the new data failed validation:\n${check.error.issues.slice(0, 10).map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  if (dataset.models.length < MIN_MODELS) fail(`only ${dataset.models.length} models came through (minimum is ${MIN_MODELS})`);
  if (previous && dataset.models.length < previous.models.length * (1 - MAX_DROP)) {
    fail(`model count fell from ${previous.models.length} to ${dataset.models.length}, more than ${MAX_DROP * 100}% in one day`);
  }

  const notes = [...built.issues];
  if (stats.failedOrgs.length) notes.push(`Hugging Face lookup failed for ${stats.failedOrgs.join(', ')}; kept earlier licenses`);
  for (const n of notes) console.warn(`  note: ${n}`);
  console.log(
    `Built ${dataset.models.length} models from ${dataset.labs.length} labs ` +
      `(licenses: ${stats.huggingface} from Hugging Face, ${stats.labDefault} lab default, ${stats.override} override)`,
  );

  if (previous && sameContent(previous, dataset)) {
    console.log(`No changes since ${previous.updatedAt}. Nothing written. (${Date.now() - started} ms)`);
    await ghOutput({ changed: 'false' });
    await ghSummary('## Model sync: no changes');
    return;
  }

  const diff = diffDatasets(previous, dataset);
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(dataset, null, 2) + '\n');
  const title = summarize(diff);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}: ${title} (${Date.now() - started} ms)`);
  await ghOutput({ changed: 'true', title });
  await ghSummary(markdownReport(diff, dataset, notes));
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

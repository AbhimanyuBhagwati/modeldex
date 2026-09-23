import { z } from 'zod';
import { MODALITIES, MODEL_TYPES } from '@/lib/types';

/** Input side: lenient, because models.dev adds fields often and we only read a few. */
export const rawModelSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  family: z.string().optional(),
  attachment: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  structured_output: z.boolean().optional(),
  release_date: z.string().optional(),
  last_updated: z.string().optional(),
  knowledge: z.string().optional(),
  modalities: z.object({ input: z.array(z.string()), output: z.array(z.string()) }).optional(),
  open_weights: z.boolean().optional(),
  limit: z.looseObject({ context: z.number().optional(), output: z.number().optional() }).optional(),
  cost: z
    .looseObject({
      input: z.number().optional(),
      output: z.number().optional(),
      cache_read: z.number().optional(),
      cache_write: z.number().optional(),
    })
    .optional(),
  status: z.string().optional(),
});
export type RawModel = z.infer<typeof rawModelSchema>;

/** One repo from the Hugging Face models API, with the fields we expand. Lenient for the same reason. */
export const rawHubRepoSchema = z.looseObject({
  id: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  downloads: z.number().optional(),
  likes: z.number().optional(),
  pipeline_tag: z.string().optional(),
  library_name: z.string().optional(),
  createdAt: z.string().optional(),
  lastModified: z.string().optional(),
  tags: z.array(z.string()).optional(),
  gated: z.union([z.boolean(), z.string()]).optional(),
  safetensors: z.looseObject({ total: z.number().optional() }).optional(),
});
export type RawHubRepo = z.infer<typeof rawHubRepoSchema>;

export const rawProviderSchema = z.looseObject({
  name: z.string(),
  doc: z.string().optional(),
  models: z.record(z.string(), z.unknown()),
});

/** Output side: strict, because the site trusts this file completely. */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const usd = z.number().nonnegative().nullable();
const tokens = z.number().int().positive().nullable();

export const modelSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9_-]+$/),
  id: z.string().min(1),
  slug: z.string().regex(/^[A-Za-z0-9_-]+$/),
  lab: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum(MODEL_TYPES),
  name: z.string().min(1),
  description: z.string(),
  family: z.string().nullable(),
  releaseDate: isoDay,
  lastUpdated: isoDay.nullable(),
  knowledge: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  context: tokens,
  maxOutput: tokens,
  price: z.object({ input: usd, output: usd, cacheRead: usd, cacheWrite: usd }).nullable(),
  input: z.array(z.enum(MODALITIES)),
  output: z.array(z.enum(MODALITIES)),
  reasoning: z.boolean(),
  toolCall: z.boolean(),
  structuredOutput: z.boolean(),
  attachment: z.boolean(),
  openWeights: z.boolean(),
  status: z.enum(['preview', 'beta', 'deprecated']).nullable(),
  access: z.enum(['free', 'open', 'paid']),
  rarity: z.enum(['promo', 'common', 'uncommon', 'rare', 'holo']),
  set: z.number().int().positive(),
  license: z.object({
    name: z.string().min(1),
    source: z.enum(['proprietary', 'huggingface', 'lab-default', 'override']),
    url: z.url({ protocol: /^https$/ }).optional(),
  }),
  origin: z.enum(['models.dev', 'huggingface']),
  hub: z
    .object({
      repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      downloads: z.number().int().nonnegative(),
      likes: z.number().int().nonnegative(),
      params: z.number().int().positive().nullable(),
      gated: z.boolean(),
    })
    .nullable(),
});

export const datasetSchema = z
  .object({
    version: z.literal(1),
    updatedAt: z.iso.datetime(),
    source: z.object({
      url: z.url(),
      providers: z.number().int().nonnegative(),
      listings: z.number().int().nonnegative(),
      hub: z.object({ orgs: z.number().int().nonnegative(), repos: z.number().int().nonnegative() }),
    }),
    labs: z.array(
      z.object({
        key: z.string().regex(/^[a-z0-9-]+$/),
        name: z.string().min(1),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        docUrl: z.url({ protocol: /^https$/ }).nullable(),
        count: z.number().int().positive(),
      }),
    ),
    models: z.array(modelSchema),
  })
  .superRefine((d, ctx) => {
    const keys = new Set<string>();
    const labs = new Set(d.labs.map((l) => l.key));
    d.models.forEach((m, i) => {
      if (keys.has(m.key)) ctx.addIssue({ code: 'custom', message: `Duplicate model key ${m.key}`, path: ['models', i, 'key'] });
      keys.add(m.key);
      if (!labs.has(m.lab)) ctx.addIssue({ code: 'custom', message: `Unknown lab ${m.lab}`, path: ['models', i, 'lab'] });
      if (m.key !== `${m.lab}/${m.slug}`) ctx.addIssue({ code: 'custom', message: `Key ${m.key} doesn't match lab and slug`, path: ['models', i, 'key'] });
      if (m.origin === 'huggingface' && !m.hub) ctx.addIssue({ code: 'custom', message: `${m.key} came from Hugging Face but has no repo`, path: ['models', i, 'hub'] });
    });
    const folded = new Set<string>();
    d.models.forEach((m, i) => {
      const k = m.key.toLowerCase();
      if (folded.has(k)) ctx.addIssue({ code: 'custom', message: `Key ${m.key} differs from another only by case`, path: ['models', i, 'key'] });
      folded.add(k);
    });
    const sets = d.models.map((m) => m.set).sort((a, b) => a - b);
    if (sets.some((s, i) => s !== i + 1)) ctx.addIssue({ code: 'custom', message: 'Set numbers must run 1..N with no gaps' });
  });

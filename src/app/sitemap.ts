import type { MetadataRoute } from 'next';
import { evolutionLines, getDataset } from '@/lib/data';
import { SITE, VOTES_API, modelHref } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const data = getDataset();
  const updated = new Date(data.updatedAt);
  return [
    { url: `${SITE.url}/`, lastModified: updated, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE.url}/battle/`, lastModified: updated, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE.url}/new/`, lastModified: updated, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE.url}/labs/`, lastModified: updated, changeFrequency: 'weekly', priority: 0.6 },
    ...(VOTES_API ? [{ url: `${SITE.url}/favorites/`, lastModified: updated, changeFrequency: 'daily' as const, priority: 0.6 }] : []),
    ...data.labs.map((l) => ({ url: `${SITE.url}/labs/${l.key}/`, lastModified: updated, changeFrequency: 'weekly' as const, priority: 0.6 })),
    { url: `${SITE.url}/evolution/`, lastModified: updated, changeFrequency: 'weekly', priority: 0.7 },
    ...[...new Set(evolutionLines().map((l) => l.lab))].map((lab) => ({ url: `${SITE.url}/evolution/${lab}/`, lastModified: updated, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...evolutionLines().map((l) => ({ url: `${SITE.url}/evolution/${l.lab}/${l.slug}/`, lastModified: updated, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...data.models.map((m) => ({
      url: `${SITE.url}${modelHref(m)}`,
      lastModified: new Date(`${m.lastUpdated ?? m.releaseDate}T00:00:00Z`),
      changeFrequency: 'weekly' as const,
      priority: m.status === 'deprecated' ? 0.3 : 0.7,
    })),
  ];
}

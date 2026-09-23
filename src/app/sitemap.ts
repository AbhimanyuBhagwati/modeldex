import type { MetadataRoute } from 'next';
import { getDataset } from '@/lib/data';
import { SITE, modelHref } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const data = getDataset();
  const updated = new Date(data.updatedAt);
  return [
    { url: `${SITE.url}/`, lastModified: updated, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE.url}/battle/`, lastModified: updated, changeFrequency: 'daily', priority: 0.6 },
    ...data.models.map((m) => ({
      url: `${SITE.url}${modelHref(m)}`,
      lastModified: new Date(`${m.lastUpdated ?? m.releaseDate}T00:00:00Z`),
      changeFrequency: 'weekly' as const,
      priority: m.status === 'deprecated' ? 0.3 : 0.7,
    })),
  ];
}

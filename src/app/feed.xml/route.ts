import { changeLog, getDataset, getLab, getModelByKey } from '@/lib/data';
import { newsItems, priceMove, type NewsItem } from '@/lib/news';
import { SITE, modelHref } from '@/lib/site';

export const dynamic = 'force-static';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function describe(item: NewsItem): { title: string; text: string } {
  const lab = getLab(item.lab)?.name ?? item.lab;
  const m = getModelByKey(item.key);
  switch (item.kind) {
    case 'released':
      return { title: `New: ${item.name} by ${lab}`, text: m?.description || `${item.name} is a new ${lab} model.` };
    case 'added':
      return { title: `Added: ${item.name} by ${lab}`, text: m?.description || `${item.name} joined the binder.` };
    case 'price': {
      const move = priceMove(item);
      const change = move.change == null ? '' : ` (${move.change > 0 ? '+' : ''}${move.change}%)`;
      return { title: `Price change: ${item.name}`, text: `${lab} ${item.name}: ${move.side} price ${move.from} → ${move.to} per million tokens${change}.` };
    }
    case 'retired':
      return { title: `Retired: ${item.name}`, text: `${lab} no longer offers ${item.name}.` };
    default:
      return { title: `Removed: ${item.name}`, text: `${item.name} by ${lab} left the binder.` };
  }
}

/** The last 30 days of releases and changes. Static: rebuilt each time the daily sync publishes. */
export function GET() {
  const data = getDataset();
  const items = newsItems(data.models, changeLog(), data.updatedAt, 30).slice(0, 80);
  const entries = items.map((item) => {
    const m = getModelByKey(item.key);
    const link = m ? `${SITE.url}${modelHref(m)}` : `${SITE.url}/new/`;
    const { title, text } = describe(item);
    return [
      '<item>',
      `<title>${escape(title)}</title>`,
      `<link>${escape(link)}</link>`,
      `<guid isPermaLink="false">${escape(`${item.kind}:${item.key}:${item.date}`)}</guid>`,
      `<pubDate>${new Date(`${item.date}T12:00:00Z`).toUTCString()}</pubDate>`,
      `<category>${escape(getLab(item.lab)?.name ?? item.lab)}</category>`,
      `<description>${escape(text)}</description>`,
      '</item>',
    ].join('');
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>',
    '<title>Modeldex: new AI models</title>',
    `<link>${escape(`${SITE.url}/new/`)}</link>`,
    `<atom:link href="${escape(`${SITE.url}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    '<description>New AI models, price changes, and retirements, from the daily Modeldex sync.</description>',
    '<language>en</language>',
    `<lastBuildDate>${new Date(data.updatedAt).toUTCString()}</lastBuildDate>`,
    ...entries,
    '</channel></rss>',
  ].join('\n');
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}

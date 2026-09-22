import { getDataset, getLab, getModel } from '@/lib/data';
import { renderModelOg } from '@/lib/og';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getDataset().models.map((m) => ({ lab: m.lab, id: m.slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lab: string; id: string }> }) {
  const { lab, id } = await params;
  const m = getModel(lab, id);
  if (!m) return new Response('Not found', { status: 404 });
  return renderModelOg(m, getLab(m.lab));
}

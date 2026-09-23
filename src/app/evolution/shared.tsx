import { cardArt, artToSvg } from '@/lib/art';
import type { EvolutionLine } from '@/lib/evolution';
import type { Model } from '@/lib/types';

/** A card's generated art as a small image, for tiles that show a line at a glance. */
export function ArtThumb({ model, color, className }: { model: Model; color: string; className?: string }) {
  const svg = artToSvg(cardArt(model, color), 160, 112);
  return <img className={className} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="" width={160} height={112} />;
}

/** "v1 → v2 → … → v5.6": the first two, the last, and a count of the rest. */
export function chainLabel(line: EvolutionLine): string {
  const v = line.stages.map((s) => `v${s.version}`);
  return v.length <= 4 ? v.join(' → ') : `${v[0]} → ${v[1]} → … → ${v[v.length - 1]}`;
}

export const lineHref = (line: Pick<EvolutionLine, 'lab' | 'slug'>) => `/evolution/${line.lab}/${line.slug}/`;

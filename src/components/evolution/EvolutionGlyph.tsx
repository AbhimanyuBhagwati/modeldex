import { memo, useMemo } from 'react';
import { ART_H, ART_W, cardArt, type Shape } from '@/lib/art';
import type { Model } from '@/lib/types';

function GlyphShape({ shape: s }: { shape: Shape }) {
  const paint = { fill: s.fill ?? 'none', fillOpacity: s.fo, stroke: s.stroke, strokeWidth: s.sw, strokeOpacity: s.so, strokeDasharray: s.dash };
  if (s.k === 'c') return <circle cx={s.x} cy={s.y} r={s.r} {...paint} />;
  if (s.k === 'e') return <ellipse cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} transform={s.rot ? `rotate(${s.rot} ${s.x} ${s.y})` : undefined} {...paint} />;
  return <path d={s.d} {...paint} />;
}

/** The model's own artwork, freed from the card frame during its transformation. */
export const EvolutionGlyph = memo(function EvolutionGlyph({ model, color }: { model: Model; color: string }) {
  const art = useMemo(() => cardArt(model, color), [model, color]);
  return (
    <svg viewBox="-30 -30 220 156" aria-hidden="true" focusable="false">
      <g transform={`translate(${ART_W / 2 - art.gx * ART_W / 100} ${ART_H / 2 - art.gy * ART_H / 100})`}>
        {art.shapes.map((shape, i) => <GlyphShape key={i} shape={shape} />)}
      </g>
    </svg>
  );
});

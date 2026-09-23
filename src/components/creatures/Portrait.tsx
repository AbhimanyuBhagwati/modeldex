'use client';

import { useEffect, useRef } from 'react';
import { SPECIES } from '@/lib/terrarium';
import { drawCreature, lookFor, radiusOf, type Drawable } from './draw';

interface Props {
  creature: Drawable & { lab: string };
  color: string;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Legs going as if running. */
  running?: boolean;
  className?: string;
  label?: string;
  /** How much of the frame the creature fills; 1 leaves room for crowns and wings. */
  fill?: number;
}

/** One creature on its own small canvas, alive unless the viewer prefers less motion. */
export function Portrait({ creature, color, width, height, running = false, className, label, fill = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const look = lookFor(creature, color);
    const r = radiusOf(creature);
    const habitat = SPECIES[creature.type].habitat;
    const plan = SPECIES[creature.type].plan;
    const flying = habitat === 'air' || plan === 'bat';
    const scale = (Math.min(width, height) / (r * 5.2)) * fill;
    const oy = flying ? height * 0.52 : height * 0.84;
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.translate(width / 2, oy);
      ctx.scale(scale, scale);
      drawCreature(ctx, creature, look, { t, dir: 1, phase: t * (running ? 14 : 5), moving: running, asleep: false, flying, elder: false, still }, r);
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [creature, color, width, height, running, fill]);
  return <canvas ref={ref} className={className} style={{ width, height }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

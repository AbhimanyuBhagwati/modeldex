'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Pointer-follow tilt with eased settling. Writes CSS variables straight to the element,
 * so hovering never re-renders React. Mouse and pen only; touch scrolls normally.
 */
export function useTilt(ref: RefObject<HTMLElement | null>, max: number, cls: { hot: string; tilting: string }) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const cur = { x: 0.5, y: 0.5 };
    const tgt = { x: 0.5, y: 0.5 };
    let raf = 0;
    let hot = false;

    const paint = () => {
      const s = el.style;
      s.setProperty('--ry', `${((cur.x - 0.5) * max).toFixed(2)}deg`);
      s.setProperty('--rx', `${(-(cur.y - 0.5) * max).toFixed(2)}deg`);
      s.setProperty('--gx', `${(cur.x * 100).toFixed(1)}%`);
      s.setProperty('--gy', `${(cur.y * 100).toFixed(1)}%`);
      s.setProperty('--px', `${(15 + cur.x * 70).toFixed(1)}%`);
      s.setProperty('--py', `${(15 + cur.y * 70).toFixed(1)}%`);
    };
    const step = () => {
      raf = 0;
      cur.x += (tgt.x - cur.x) * 0.14;
      cur.y += (tgt.y - cur.y) * 0.14;
      paint();
      if (Math.abs(tgt.x - cur.x) + Math.abs(tgt.y - cur.y) > 0.002) raf = requestAnimationFrame(step);
      else if (!hot) el.classList.remove(cls.tilting);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !fine.matches) return;
      hot = true;
      el.classList.add(cls.hot);
      if (!reduce.matches) el.classList.add(cls.tilting);
    };
    const move = (e: PointerEvent) => {
      if (!hot || reduce.matches) return;
      const r = el.getBoundingClientRect();
      tgt.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      tgt.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      kick();
    };
    const leave = () => {
      if (!hot) return;
      hot = false;
      el.classList.remove(cls.hot);
      tgt.x = tgt.y = 0.5;
      kick();
    };

    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref, max, cls.hot, cls.tilting]);
}

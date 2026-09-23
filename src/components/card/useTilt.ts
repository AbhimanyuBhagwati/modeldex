'use client';

import { useEffect, type RefObject } from 'react';

/** Track a stationary hit area; only its frame moves. No React renders on pointer movement. */
export function useTilt(ref: RefObject<HTMLElement | null>, max: number, cls: { hot: string; tilting: string }) {
  useEffect(() => {
    const el = ref.current;
    if (!el || max <= 0) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const cur = { x: 0.5, y: 0.5 };
    const tgt = { x: 0.5, y: 0.5 };
    let raf = 0;
    let lastTime = 0;
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
    const step = (now: number) => {
      raf = 0;
      const elapsed = lastTime ? Math.min(32, now - lastTime) : 16.667;
      lastTime = now;
      const smoothing = 1 - Math.exp(-elapsed / 65);
      cur.x += (tgt.x - cur.x) * smoothing;
      cur.y += (tgt.y - cur.y) * smoothing;
      paint();
      if (Math.abs(tgt.x - cur.x) + Math.abs(tgt.y - cur.y) > 0.002) {
        raf = requestAnimationFrame(step);
      } else {
        lastTime = 0;
        if (!hot) el.classList.remove(cls.tilting);
      }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    const move = (e: PointerEvent) => {
      if (!hot || reduce.matches) return;
      const r = el.getBoundingClientRect();
      tgt.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      tgt.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      kick();
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !fine.matches) return;
      hot = true;
      el.classList.add(cls.hot);
      if (!reduce.matches) el.classList.add(cls.tilting);
      move(e);
    };
    const leave = () => {
      hot = false;
      el.classList.remove(cls.hot);
      tgt.x = tgt.y = 0.5;
      if (!reduce.matches) kick();
    };
    const reset = () => {
      cancelAnimationFrame(raf);
      raf = lastTime = 0;
      hot = false;
      cur.x = cur.y = tgt.x = tgt.y = 0.5;
      el.classList.remove(cls.hot, cls.tilting);
      paint();
    };

    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointercancel', reset);
    fine.addEventListener('change', reset);
    reduce.addEventListener('change', reset);
    return () => {
      reset();
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointercancel', reset);
      fine.removeEventListener('change', reset);
      reduce.removeEventListener('change', reset);
    };
  }, [ref, max, cls.hot, cls.tilting]);
}

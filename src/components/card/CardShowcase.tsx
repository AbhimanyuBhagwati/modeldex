'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, type CardProps } from './Card';
import { CardBack } from './CardBack';
import styles from './CardShowcase.module.css';

interface Motion {
  angle: number;
  vel: number;
  target: number | null;
  dragging: boolean;
  lastX: number;
  moved: number;
  raf: number;
}

const DRAG = 0.55;
const nearestFace = (a: number) => Math.round(a / 180) * 180;
const facing = (a: number): 'front' | 'back' => {
  const n = ((a % 360) + 360) % 360;
  return n > 90 && n < 270 ? 'back' : 'front';
};

/**
 * A card you can hold: it spins in once when the page opens, then drag to spin it,
 * tap to flip it, and it settles on whichever face is nearer.
 */
export function CardShowcase(props: CardProps) {
  const spinner = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const motion = useRef<Motion>({ angle: 0, vel: 0, target: null, dragging: false, lastX: 0, moved: 0, raf: 0 });
  const [face, setFace] = useState<'front' | 'back'>('front');

  const paint = () => {
    const m = motion.current;
    if (spinner.current) {
      spinner.current.style.transform = `rotateY(${m.angle.toFixed(2)}deg)`;
      spinner.current.style.setProperty('--sheen', `${(((m.angle % 360) + 360) % 360) / 3.6}%`);
    }
    if (shadow.current) shadow.current.style.transform = `scaleX(${(0.45 + 0.55 * Math.abs(Math.cos((m.angle * Math.PI) / 180))).toFixed(3)})`;
    setFace(facing(m.angle));
  };

  /** Coast on the release speed, then spring onto the nearest face (or an explicit target). */
  const settle = () => {
    const m = motion.current;
    cancelAnimationFrame(m.raf);
    const step = () => {
      if (m.dragging) return;
      if (m.target == null && Math.abs(m.vel) > 1.2) {
        m.angle += m.vel;
        m.vel *= 0.95;
      } else {
        if (m.target == null) m.target = nearestFace(m.angle + m.vel * 6);
        m.vel = (m.vel + (m.target - m.angle) * 0.07) * 0.8;
        m.angle += m.vel;
        if (Math.abs(m.target - m.angle) < 0.05 && Math.abs(m.vel) < 0.05) {
          m.angle = m.target % 360;
          m.target = null;
          m.vel = 0;
          paint();
          return;
        }
      }
      paint();
      m.raf = requestAnimationFrame(step);
    };
    m.raf = requestAnimationFrame(step);
  };

  const flip = () => {
    const m = motion.current;
    const to = nearestFace(m.target ?? m.angle) + 180;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      m.angle = to % 360;
      m.target = null;
      paint();
      return;
    }
    m.target = to;
    settle();
  };

  // The reveal: one full turn when the card first appears, passing its back on the way.
  useEffect(() => {
    const m = motion.current;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const duration = 1500;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      m.angle = -360 * (1 - eased);
      paint();
      if (t < 1 && !m.dragging) m.raf = requestAnimationFrame(tick);
    };
    m.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(m.raf);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = motion.current;
    cancelAnimationFrame(m.raf);
    e.currentTarget.setPointerCapture(e.pointerId);
    Object.assign(m, { dragging: true, lastX: e.clientX, moved: 0, vel: 0, target: null });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = motion.current;
    if (!m.dragging) return;
    const dx = e.clientX - m.lastX;
    m.lastX = e.clientX;
    m.moved += Math.abs(dx);
    m.angle += dx * DRAG;
    m.vel = dx * DRAG;
    paint();
  };
  const release = (tapFlips: boolean) => {
    const m = motion.current;
    if (!m.dragging) return;
    m.dragging = false;
    if (tapFlips && m.moved < 5) flip();
    else settle();
  };

  return (
    <div className={styles.wrap}>
      <div
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => release(true)}
        onPointerCancel={() => release(false)}
      >
        <div ref={spinner} className={styles.spinner}>
          <div className={styles.face} aria-hidden={face === 'back'}>
            <Card {...props} link={false} addable={false} tilt={0} />
          </div>
          <div className={`${styles.face} ${styles.back}`} aria-hidden="true">
            <CardBack />
            <div className={styles.sheen} />
          </div>
        </div>
        <div ref={shadow} className={styles.shadow} aria-hidden="true" />
      </div>
      <div className={styles.controls}>
        <button type="button" className="btn btn-tiny" onClick={flip} aria-pressed={face === 'back'}>
          {face === 'back' ? 'Show front' : 'Flip card'}
        </button>
        <span className={styles.hint}>Drag to spin</span>
      </div>
    </div>
  );
}

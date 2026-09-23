'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, type CardProps } from './Card';
import { CardBack } from './CardBack';
import styles from './CardShowcase.module.css';

const nearestFace = (angle: number) => Math.round(angle / 180) * 180;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const facing = (angle: number): 'front' | 'back' => {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized > 90 && normalized < 270 ? 'back' : 'front';
};

/** One full turn when the page opens, then direct manipulation while held, with a short, interruptible settle onto either face. */
export function CardShowcase(props: CardProps) {
  const spinner = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const motion = useRef({ angle: 0, target: null as number | null, raf: 0, pointer: null as number | null, lastX: 0, lastTime: 0, velocity: 0, moved: 0, distance: 0, startAngle: 0 });
  const visibleFace = useRef<'front' | 'back'>('front');
  const [face, setFace] = useState<'front' | 'back'>('front');

  const paint = useCallback(() => {
    const { angle } = motion.current;
    if (spinner.current) {
      spinner.current.style.transform = `rotateY(${angle.toFixed(2)}deg)`;
      spinner.current.style.setProperty('--sheen', `${(((angle % 360) + 360) % 360) / 3.6}%`);
    }
    if (shadow.current) shadow.current.style.transform = `scaleX(${(0.6 + 0.4 * Math.abs(Math.cos(angle * Math.PI / 180))).toFixed(3)})`;
    const next = facing(angle);
    if (next !== visibleFace.current) {
      visibleFace.current = next;
      setFace(next);
    }
  }, []);

  const animateTo = useCallback((target: number, duration = 280, ease = easeOutCubic) => {
    const m = motion.current;
    cancelAnimationFrame(m.raf);
    m.target = target;
    const finish = () => {
      m.angle = target % 360;
      m.target = null;
      m.raf = 0;
      spinner.current?.removeAttribute('data-moving');
      paint();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    const from = m.angle;
    const start = performance.now();
    spinner.current?.setAttribute('data-moving', 'true');
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      m.angle = from + (target - from) * ease(progress);
      paint();
      if (progress < 1) m.raf = requestAnimationFrame(tick);
      else finish();
    };
    m.raf = requestAnimationFrame(tick);
  }, [paint]);

  const flip = () => {
    const m = motion.current;
    animateTo(nearestFace(m.target ?? m.angle) + 180);
  };

  useEffect(() => {
    const m = motion.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    // The reveal: a full turn that shows the card back on the way. Grabbing the card stops it.
    if (!reduce.matches) {
      m.angle = -360;
      paint();
      animateTo(0, 1500, easeOutQuart);
    }
    const onPreference = () => {
      if (reduce.matches) animateTo(m.target ?? nearestFace(m.angle));
    };
    reduce.addEventListener('change', onPreference);
    return () => {
      cancelAnimationFrame(m.raf);
      reduce.removeEventListener('change', onPreference);
    };
  }, [animateTo, paint]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const m = motion.current;
    if (m.pointer != null) return;
    cancelAnimationFrame(m.raf);
    e.currentTarget.setPointerCapture(e.pointerId);
    Object.assign(m, { pointer: e.pointerId, lastX: e.clientX, lastTime: e.timeStamp, moved: 0, distance: 0, velocity: 0, target: null, startAngle: m.angle });
    spinner.current?.setAttribute('data-moving', 'true');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = motion.current;
    if (m.pointer !== e.pointerId) return;
    const dx = e.clientX - m.lastX;
    const elapsed = Math.max(8, e.timeStamp - m.lastTime);
    m.lastX = e.clientX;
    m.lastTime = e.timeStamp;
    m.moved += Math.abs(dx);
    m.distance += dx;
    m.velocity = Math.max(-0.6, Math.min(0.6, dx * 0.55 / elapsed));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    m.angle += dx * 0.55;
    paint();
  };
  const release = (pointer: number, tapFlips: boolean) => {
    const m = motion.current;
    if (m.pointer !== pointer) return;
    m.pointer = null;
    if (tapFlips && m.moved < 5) flip();
    else if (matchMedia('(prefers-reduced-motion: reduce)').matches) animateTo(nearestFace(m.startAngle + (tapFlips ? m.distance * 0.55 : 0)));
    else animateTo(nearestFace(m.angle + (tapFlips ? m.velocity * 70 : 0)));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(e) => release(e.pointerId, true)} onPointerCancel={(e) => release(e.pointerId, false)} onLostPointerCapture={(e) => release(e.pointerId, false)}>
        <div ref={spinner} className={styles.spinner}>
          <div className={styles.face} aria-hidden={face === 'back'}><Card {...props} link={false} addable={false} tilt={0} /></div>
          <div className={`${styles.face} ${styles.back}`} aria-hidden="true"><CardBack /><div className={styles.sheen} /></div>
        </div>
        <div ref={shadow} className={styles.shadow} aria-hidden="true" />
      </div>
      <div className={styles.controls}>
        <button type="button" className="btn btn-tiny" onClick={flip} aria-pressed={face === 'back'}>{face === 'back' ? 'Show front' : 'Flip card'}</button>
        <span className={styles.hint}>Drag to turn</span>
        <span className="sr-only" role="status">{face === 'back' ? 'Card back showing' : 'Card front showing'}</span>
      </div>
    </div>
  );
}

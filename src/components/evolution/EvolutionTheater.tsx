'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import type { EvolutionReport } from '@/lib/evolution';
import { formatMonth } from '@/lib/format';
import { modelHref } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import { startParticles, type Particles } from './particles';
import styles from './EvolutionTheater.module.css';

export interface TheaterStage {
  version: string;
  model: Model;
  /** Keys of the other models in this generation, to find `?at=` targets. */
  variants: string[];
  /** How this stage differs from the one before; null for the first. */
  report: EvolutionReport | null;
}

type Phase = 'idle' | 'charge' | 'flash' | 'reveal';

/** Gaps between silhouette swaps while charging, in ms: slow, then frantic, like the games. */
const FLICKER = [460, 400, 350, 300, 260, 220, 190, 160, 135, 115, 98, 84, 72, 62, 54, 48, 42, 38, 34, 32, 30, 28];

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const noop = () => () => {};
const readAt = () => new URLSearchParams(window.location.search).get('at');

export function EvolutionTheater({ stages, lab, setSize, refDate }: { stages: TheaterStage[]; lab: LabSummary; setSize: number; refDate: string }) {
  // `?at=` opens on a given card's stage; after that, the viewer drives.
  const at = useSyncExternalStore(noop, readAt, () => null);
  const linked = Math.max(0, stages.findIndex((s) => s.model.key === at || s.variants.includes(at ?? '')));
  const [picked, setPicked] = useState<number | null>(null);
  const index = picked ?? linked;
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<number | null>(null);
  const [report, setReport] = useState<number | null>(null);
  const [auto, setAuto] = useState(false);

  const slot = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particles | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const autoRef = useRef(false);
  /** The latest `evolve`, so autoplay can chain into the next stage from a timer. */
  const evolveNext = useRef<(from: number) => void>(() => {});

  useEffect(() => {
    if (!canvas.current || reducedMotion()) return;
    const p = startParticles(canvas.current, lab.color);
    particles.current = p;
    return () => p.destroy();
  }, [lab.color]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);
  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  const settle = useCallback((i: number) => {
    clearTimers();
    setPicked(i);
    setTarget(null);
    setPhase('idle');
    setReport(i > 0 ? i : null);
    particles.current?.setMode('idle');
    slot.current?.removeAttribute('data-show');
  }, []);

  const evolve = useCallback(
    (from: number) => {
      const to = from + 1;
      if (to >= stages.length) return;
      clearTimers();
      const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
      if (reducedMotion()) {
        settle(to);
        return;
      }
      setPicked(from);
      setReport(null);
      setTarget(to);
      setPhase('charge');
      particles.current?.setMode('charge');

      let t = 0;
      let show: 'from' | 'to' = 'from';
      for (const gap of FLICKER) {
        t += gap;
        later(t, () => {
          show = show === 'from' ? 'to' : 'from';
          slot.current?.setAttribute('data-show', show);
        });
      }
      const flashAt = t + 160;
      later(flashAt, () => {
        // The new form takes over as the only card, so neither form is hidden any more.
        slot.current?.removeAttribute('data-show');
        setPhase('flash');
        particles.current?.burst();
        flash.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
        ring.current?.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
            { transform: 'translate(-50%, -50%) scale(4.5)', opacity: 0 },
          ],
          { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' },
        );
        setPicked(to);
        setTarget(null);
      });
      later(flashAt + 240, () => {
        setPhase('reveal');
        setReport(to);
        slot.current?.removeAttribute('data-show');
      });
      later(flashAt + 1900, () => {
        setPhase('idle');
        if (autoRef.current && to + 1 < stages.length) later(1500, () => evolveNext.current(to));
        else setAuto(false);
      });
    },
    [settle, stages.length],
  );
  useEffect(() => {
    evolveNext.current = evolve;
  }, [evolve]);

  const busy = phase !== 'idle';
  const current = stages[index];
  const next = stages[index + 1];
  const shown = target != null ? [index, target] : [index];
  const shownReport = report != null ? stages[report]?.report : null;
  const first = stages[0];
  const last = stages[stages.length - 1];

  return (
    <div className={styles.wrap} style={{ '--t': lab.color } as CSSProperties}>
      <div className={styles.theater} data-phase={phase}>
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div className={styles.rays} aria-hidden="true" />
        <div className={`${styles.rays} ${styles.raysFast}`} aria-hidden="true" />

        <div className={styles.stageInfo}>
          <span className={styles.stageCount}>
            Stage {index + 1} of {stages.length}
          </span>
          <span key={current.version} className={styles.version}>
            v{current.version}
          </span>
          <span className={styles.stageDate}>{formatMonth(current.model.releaseDate)}</span>
        </div>

        <div ref={slot} className={styles.slot} data-phase={phase}>
          {shown.map((i) => (
            <div key={stages[i].model.key} className={styles.form} data-role={i === index ? 'from' : 'to'}>
              <Card model={stages[i].model} lab={lab} setSize={setSize} refDate={refDate} link={false} addable={false} tilt={phase === 'idle' ? 10 : 0} headingLevel="h2" />
            </div>
          ))}
        </div>

        <div ref={ring} className={styles.ring} aria-hidden="true" />
        <div ref={flash} className={styles.flash} aria-hidden="true" />

        <div className={styles.controls}>
          {busy ? (
            <button type="button" className="btn" onClick={() => settle(target ?? index)}>
              Skip
            </button>
          ) : next ? (
            <>
              <button type="button" className={`btn btn-gold ${styles.evolve}`} onClick={() => evolve(index)}>
                Evolve into v{next.version}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setAuto(true);
                  autoRef.current = true;
                  evolve(index);
                }}
              >
                Play the whole line
              </button>
            </>
          ) : (
            <>
              <span className={styles.complete}>Fully evolved</span>
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  setAuto(true);
                  autoRef.current = true;
                  settle(0);
                  timers.current.push(setTimeout(() => evolve(0), 700));
                }}
              >
                Watch it again
              </button>
            </>
          )}
          <Link className={`btn btn-ghost ${styles.open}`} href={modelHref(current.model)}>
            Open {current.model.name}
          </Link>
        </div>
      </div>

      <div className={styles.report} aria-live="polite">
        {shownReport && report != null ? (
          <>
            <p className={styles.reportTitle}>
              <b>{stages[report - 1].model.name}</b> evolved into <b>{stages[report].model.name}</b>
              {shownReport.months > 0 && <span>{shownReport.months} {shownReport.months === 1 ? 'month' : 'months'} later</span>}
            </p>
            {shownReport.deltas.length > 0 && (
              <ul className={styles.deltas}>
                {shownReport.deltas.map((d, i) => (
                  <li key={d.label} data-better={d.better} style={{ '--i': i } as CSSProperties}>
                    <small>{d.label}</small>
                    <span>
                      {d.from} → <b>{d.to}</b>
                    </span>
                    <em>{d.change}</em>
                  </li>
                ))}
              </ul>
            )}
            {shownReport.learned.length > 0 && (
              <p className={styles.learned}>
                Learned{' '}
                {shownReport.learned.map((l, i) => (
                  <span key={l} style={{ '--i': i + shownReport.deltas.length } as CSSProperties}>
                    {l}
                  </span>
                ))}
              </p>
            )}
            {!shownReport.deltas.length && !shownReport.learned.length && <p className={styles.quiet}>Same specs on paper; the gains are in quality.</p>}
          </>
        ) : (
          <p className={styles.quiet}>
            {stages.length} stages, from {first.model.name} ({formatMonth(first.model.releaseDate)}) to {last.model.name} ({formatMonth(last.model.releaseDate)}). Press Evolve to watch each step.
          </p>
        )}
      </div>

      <ol className={styles.chain} aria-label="Stages">
        {stages.map((s, i) => (
          <li key={s.model.key}>
            <button type="button" className={styles.link} aria-current={i === index ? 'step' : undefined} data-seen={i <= index || undefined} disabled={busy} onClick={() => settle(i)}>
              <span className={styles.linkVersion}>v{s.version}</span>
              <span className={styles.linkName}>{s.model.name}</span>
              <small>{formatMonth(s.model.releaseDate)}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

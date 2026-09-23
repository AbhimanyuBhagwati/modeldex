'use client';

import Link from 'next/link';
import { useEffect, useReducer, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import type { EvolutionReport } from '@/lib/evolution';
import { formatMonth } from '@/lib/format';
import { modelHref } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import { EvolutionGlyph } from './EvolutionGlyph';
import { startParticles, type Particles } from './particles';
import { EVOLUTION_TIMING, initialPlayback, playbackReducer } from './playback';
import styles from './EvolutionTheater.module.css';

export interface TheaterStage {
  version: string;
  model: Model;
  /** Keys of the other models in this generation, to find `?at=` targets. */
  variants: string[];
  report: EvolutionReport | null;
}

const noop = () => () => {};
const readAt = () => new URLSearchParams(window.location.search).get('at');
const readMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeMotion = (update: () => void) => {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
};
const noMotionOnServer = () => true;

export function EvolutionTheater({ stages, lab, setSize, refDate }: { stages: TheaterStage[]; lab: LabSummary; setSize: number; refDate: string }) {
  const at = useSyncExternalStore(noop, readAt, () => null);
  const reduced = useSyncExternalStore(subscribeMotion, readMotion, noMotionOnServer);
  const linked = Math.max(0, stages.findIndex((s) => s.model.key === at || s.variants.includes(at ?? '')));
  const [state, dispatch] = useReducer(playbackReducer, initialPlayback);
  const { phase, journey, auto, report } = state;
  const index = state.picked ?? linked;
  const busy = phase !== 'idle';
  const theater = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const primaryAction = useRef<HTMLButtonElement>(null);
  const particles = useRef<Particles | null>(null);
  const chain = useRef<HTMLOListElement>(null);
  const current = stages[index];
  const next = stages[index + 1];
  const origin = stages[journey?.from ?? index];
  const destination = stages[journey?.to ?? Math.min(index + 1, stages.length - 1)];
  const shownReport = report != null ? stages[report]?.report : null;
  const first = stages[0];
  const last = stages[stages.length - 1];

  useEffect(() => {
    if (!canvas.current || reduced) return;
    const p = startParticles(canvas.current, lab.color);
    particles.current = p;
    return () => { p.destroy(); particles.current = null; };
  }, [lab.color, reduced]);

  useEffect(() => {
    particles.current?.setMode(phase);
    if (phase === 'reveal') particles.current?.burst();
  }, [phase, reduced]);

  // Every callback carries its run id. Skip, navigation, or replay invalidates stale callbacks.
  useEffect(() => {
    if (!journey) return;
    const id = journey.id;
    if (reduced) {
      const timer = setTimeout(() => dispatch({ type: 'finish', id }), 0);
      return () => clearTimeout(timer);
    }
    const timers = [
      setTimeout(() => dispatch({ type: 'phase', phase: 'transform', id }), EVOLUTION_TIMING.transform),
      setTimeout(() => dispatch({ type: 'phase', phase: 'collapse', id }), EVOLUTION_TIMING.collapse),
      setTimeout(() => dispatch({ type: 'phase', phase: 'reveal', id }), EVOLUTION_TIMING.reveal),
      setTimeout(() => dispatch({ type: 'finish', id }), EVOLUTION_TIMING.finish),
    ];
    return () => timers.forEach(clearTimeout);
  }, [journey, reduced]);

  useEffect(() => {
    if (!auto || busy) return;
    const timer = setTimeout(() => {
      if (index + 1 < stages.length) dispatch({ type: 'start', from: index, total: stages.length, auto: true });
      else dispatch({ type: 'stopAuto' });
    }, EVOLUTION_TIMING.intermission);
    return () => clearTimeout(timer);
  }, [auto, busy, index, stages.length]);

  // Keep the selected generation in the horizontal strip without scrolling the page.
  useEffect(() => {
    const list = chain.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !selected) return;
    const bounds = list.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.left < bounds.left || item.right > bounds.right) {
      list.scrollTo({ left: list.scrollLeft + item.left - bounds.left - (bounds.width - item.width) / 2, behavior: reduced ? 'instant' : 'smooth' });
    }
  }, [index, reduced]);

  const settle = (i: number) => dispatch({ type: 'settle', index: i });
  const play = (from: number, wholeLine = false) => {
    dispatch({ type: 'start', from, total: stages.length, auto: wholeLine });
    // The secondary Play button disappears during playback; keep keyboard focus in the controls.
    if (wholeLine) primaryAction.current?.focus({ preventScroll: true });
    const bounds = theater.current?.getBoundingClientRect();
    if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
      theater.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
    }
  };

  const status = phase === 'charge' ? 'Something is happening…'
    : phase === 'transform' ? `${origin.model.name} is evolving!`
    : phase === 'collapse' ? 'A new form is emerging.'
    : phase === 'reveal' || report === index ? `Meet ${current.model.name}.`
    : next ? 'Every generation. A new possibility.' : 'The latest evolution.';
  const chapter = phase === 'idle' ? (report === index ? 'Evolution complete' : 'Ready to evolve')
    : phase === 'charge' ? '01 / Awakening' : phase === 'transform' ? '02 / Transformation'
    : phase === 'collapse' ? '03 / A moment of possibility' : '04 / Evolution complete';

  return (
    <div className={styles.wrap} style={{ '--t': lab.color } as CSSProperties}>
      <div ref={theater} className={styles.theater} data-phase={phase} data-playing={busy || undefined} data-reduced={reduced || undefined}>
        <div className={styles.theaterHead}>
          <span className={styles.chamber}><span aria-hidden="true">✧</span> Evolution chamber</span>
          <span className={styles.stageCount}>{String(index + 1).padStart(2, '0')} <span>/ {String(stages.length).padStart(2, '0')}</span></span>
        </div>

        <div className={styles.arena}>
          <div className={styles.nebula} aria-hidden="true" />
          <div className={styles.grid} aria-hidden="true" />
          <div className={styles.orbits} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.halo} aria-hidden="true" />
          <div className={styles.pedestal} aria-hidden="true" />
          <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />

          <div className={`${styles.side} ${styles.sideFrom}`} aria-hidden="true">
            <span>{phase === 'reveal' ? 'Previous form' : 'Current form'}</span>
            <b>v{origin.version}</b>
            <p>{origin.model.name}</p>
            <small>{formatMonth(origin.model.releaseDate)}</small>
          </div>
          <div className={`${styles.side} ${styles.sideTo}`} aria-hidden="true">
            <span>{phase === 'reveal' ? 'New form unlocked' : next || busy ? 'Next evolution' : 'Final form'}</span>
            <b>v{destination.version}</b>
            <p>{destination.model.name}</p>
            <small>{formatMonth(destination.model.releaseDate)}</small>
          </div>

          <div className={styles.slot}>
            <div key={current.model.key} className={styles.cardForm} aria-hidden={busy && phase !== 'reveal' || undefined}>
              <Card model={current.model} lab={lab} setSize={setSize} refDate={refDate} link={false} addable={false} tilt={busy ? 0 : 8} headingLevel="h2" />
            </div>
          </div>
          {journey && (
            <div key={journey.id} className={styles.energyForms} aria-hidden="true">
              <div className={styles.glyphFrom}><EvolutionGlyph model={origin.model} color={lab.color} /></div>
              <div className={styles.glyphTo}><EvolutionGlyph model={destination.model} color={lab.color} /></div>
            </div>
          )}
          <div className={styles.core} aria-hidden="true" />
          <div className={styles.shockwave} aria-hidden="true" />
          <div className={styles.shockwaveSecond} aria-hidden="true" />
          <div className={styles.bloom} aria-hidden="true" />
          <div className={styles.sparkle} aria-hidden="true">✦</div>
        </div>

        <div className={styles.dialogue} role="status" aria-live="polite" aria-atomic="true">
          <span className={styles.chapter}>{chapter}</span>
          <p key={status}>{status}</p>
          <span className={styles.subtitle}>
            {busy ? `v${origin.version} → v${destination.version} · ${lab.name}` : `${current.model.name} · ${formatMonth(current.model.releaseDate)}`}
          </span>
        </div>

        <div className={styles.controls}>
          <button
            ref={primaryAction}
            type="button"
            className={`btn ${busy || auto ? styles.secondary : `btn-gold ${styles.evolve}`}`}
            onClick={() => busy ? settle(journey?.to ?? index) : auto ? dispatch({ type: 'stopAuto' }) : play(next ? index : 0, !next)}
          >
            <span aria-hidden="true">{busy ? '↗' : auto ? '□' : next ? '✧' : '↺'}</span>
            {busy ? (auto ? 'Stop playback' : 'Skip to reveal') : auto ? 'Stop playback' : next ? `Evolve into v${next.version}` : 'Watch it again'}
            {!busy && !auto && next && <span aria-hidden="true">→</span>}
          </button>
          {busy || auto ? (
            <span className={styles.evolving}><span />{busy ? (auto ? 'Playing the whole line' : 'Evolution in progress') : next ? 'Next evolution coming up…' : 'Every stage. Fully evolved.'}</span>
          ) : next ? (
            <button type="button" className={`btn ${styles.secondary}`} onClick={() => play(index, true)}><span aria-hidden="true">▷</span> Play the whole line</button>
          ) : (
            <span className={styles.complete}>✦ Fully evolved</span>
          )}
          {!busy && !auto && <Link className={styles.open} href={modelHref(current.model)}>View model <span aria-hidden="true">↗</span><span className="sr-only">: {current.model.name}</span></Link>}
        </div>
        <div key={journey?.id ?? 'rest'} className={styles.progress} aria-hidden="true"><span /></div>
      </div>

      <div className={styles.report} aria-live="polite">
        <div key={report ?? 'intro'}>
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
      </div>

      <ol ref={chain} className={styles.chain} aria-label="Stages">
        {stages.map((s, i) => (
          <li key={s.model.key}>
            <button type="button" className={styles.link} aria-current={i === index ? 'step' : undefined} data-seen={i <= index || undefined} onClick={() => settle(i)}>
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

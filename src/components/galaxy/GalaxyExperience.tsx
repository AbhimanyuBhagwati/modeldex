'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { artToSvg, cardArt } from '@/lib/art';
import { GALAXY_START, R, dayLabel, layoutGalaxy, type GalaxyData, type GalaxyStar } from '@/lib/galaxy';
import { formatDate } from '@/lib/format';
import { modelHref, withBase } from '@/lib/site';
import type { Focus, GalaxyScene, Label } from './scene';
import styles from './Galaxy.module.css';

/** Seconds to play the whole history, from the classics to today. */
const PLAY_SECONDS = 18;

const reduceQuery = '(prefers-reduced-motion: reduce)';

/** Index of the first value greater than `x` in a sorted list: how many are at or below it. */
const countAtOrBelow = (sorted: number[], x: number) => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const whenLabel = (s: GalaxyStar) => (s.classic ? 'Before March 2022' : formatDate(s.date));

export function GalaxyExperience({ data }: { data: GalaxyData }) {
  const layout = useMemo(() => layoutGalaxy(data), [data]);
  const labs = useMemo(() => Object.fromEntries(data.labs.map((l) => [l.key, l])), [data.labs]);
  const byKey = useMemo(() => new Map(data.stars.map((s) => [s.key, s])), [data.stars]);
  const lines = useMemo(() => new Map(data.lines.map((l) => [l.id, l])), [data.lines]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<GalaxyScene | null>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  const dayRef = useRef(0);
  const down = useRef<{ x: number; y: number } | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'nowebgl'>('loading');
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState<{ key: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusLab, setFocusLab] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [labsOpen, setLabsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [touched, setTouched] = useState(false);
  /** The opening: a singularity, the bang, the galaxy forming, then history plays. */
  const [intro, setIntro] = useState<'none' | 'singularity' | 'bang' | 'formed'>('none');
  const runBang = useRef<(s: GalaxyScene) => void>(() => {});

  // Sorted birth days, for "how many stars exist by now" without scanning every star.
  const sortedDays = useMemo(() => data.stars.map((s) => s.day).sort((a, b) => a - b), [data.stars]);
  const labDays = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of data.stars) m.set(s.lab, [...(m.get(s.lab) ?? []), s.day]);
    for (const v of m.values()) v.sort((a, b) => a - b);
    return m;
  }, [data.stars]);
  const born = countAtOrBelow(sortedDays, day);
  const labsBorn = [...labDays.values()].filter((d) => d[0] <= day).length;

  // Labels: the biggest labs at the rim of their arm, each year on its ring, the classics at the core.
  const labelSpecs = useMemo(() => {
    const big = [...data.labs].sort((a, b) => b.count - a.count).slice(0, 18);
    return [
      ...big.map((l) => ({ id: `lab:${l.key}`, text: l.name, kind: 'lab' as const, lab: l.key, color: l.color, position: layout.place(l.key, R * 1.05, 0, 0), minDay: labDays.get(l.key)?.[0] ?? 0 })),
      // Year labels fan out along the front of their rings so they don't stack in one line.
      ...layout.years.map((y, i, all) => {
        const angle = Math.PI / 2 + (i - (all.length - 1) / 2) * 0.34;
        const position: [number, number, number] = [Math.cos(angle) * y.radius, 0, Math.sin(angle) * y.radius];
        return { id: `year:${y.year}`, text: String(y.year), kind: 'year' as const, lab: undefined, color: undefined, position, minDay: (Date.parse(`${y.year}-01-01T00:00:00Z`) - Date.parse(`${GALAXY_START}T00:00:00Z`)) / 864e5 };
      }),
      { id: 'core', text: 'The classics', kind: 'year' as const, lab: undefined, color: undefined, position: [0, R * 0.15, 0] as [number, number, number], minDay: 0 },
    ];
  }, [data.labs, layout, labDays]);

  // Build the scene once; three.js loads only on this page.
  useEffect(() => {
    let cancelled = false;
    let built: GalaxyScene | null = null;
    let cleanup = () => {};
    import('./scene').then(({ createGalaxyScene }) => {
      if (cancelled || !canvas.current) return;
      const lite = window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4;
      const still = matchMedia(reduceQuery).matches;
      built = createGalaxyScene(canvas.current, data, layout, { reduced: still, lite });
      if (!built) {
        setStatus('nowebgl');
        return;
      }
      scene.current = built;
      const labels: Label[] = labelSpecs.flatMap((l) => {
        const el = labelEls.current.get(l.id);
        return el ? [{ el, position: l.position, minDay: l.minDay, lab: l.lab, rim: l.kind === 'lab' }] : [];
      });
      built.setLabels(labels);
      built.onUserMove(() => setTouched(true));
      setStatus('ready');
      let settle: ReturnType<typeof setTimeout> | undefined;
      // In the beginning there is one point of light; the blast makes the galaxy, then history plays.
      runBang.current = (s) => {
        clearTimeout(settle);
        setPlaying(false);
        setSelected(null);
        dayRef.current = 0;
        setDay(0);
        setIntro('singularity');
        s.bigBang({
          bang: () => setIntro('bang'),
          formed: () => {
            if (cancelled) return;
            setIntro('formed');
            setPlaying(true);
            settle = setTimeout(() => !cancelled && setIntro('none'), 3200);
          },
        });
      };
      if (still) {
        dayRef.current = data.days;
        setDay(data.days);
        built.flyTo({ home: true }, 0);
      } else {
        runBang.current(built);
      }
      cleanup = () => clearTimeout(settle);
    });
    return () => {
      cancelled = true;
      cleanup();
      built?.destroy();
      scene.current = null;
    };
  }, [data, layout, labelSpecs]);

  // Playback: the whole history in PLAY_SECONDS.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const perSecond = data.days / PLAY_SECONDS;
    const tick = (now: number) => {
      const next = Math.min(data.days, dayRef.current + ((now - last) / 1000) * perSecond);
      last = now;
      dayRef.current = next;
      setDay(next);
      if (next >= data.days) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, data.days]);

  useEffect(() => {
    scene.current?.setDay(day);
  }, [day, status]);
  useEffect(() => {
    const focus: Focus = { lab: focusLab, type, selected, hovered: hovered?.key ?? null };
    scene.current?.setFocus(focus);
  }, [focusLab, type, selected, hovered?.key, day, status]);

  const scrub = (d: number) => {
    setPlaying(false);
    dayRef.current = d;
    setDay(d);
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (dayRef.current >= data.days - 1) {
      dayRef.current = 0;
      setDay(0);
    }
    setPlaying(true);
  };
  const select = useCallback(
    (key: string | null) => {
      setSelected(key);
      if (!key) return;
      const star = byKey.get(key);
      // Jumping to a star not born yet moves time forward to its birth.
      if (star && star.day > dayRef.current) {
        setPlaying(false);
        dayRef.current = star.day;
        setDay(star.day);
      }
      scene.current?.flyTo({ key });
    },
    [byKey],
  );
  const skipIntro = () => {
    scene.current?.skipBang();
    setIntro('none');
    setPlaying(false);
    dayRef.current = data.days;
    setDay(data.days);
  };
  const focusOn = (lab: string | null) => {
    setFocusLab(lab);
    setLabsOpen(false);
    scene.current?.flyTo(lab ? { lab } : { home: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setLabsOpen(false);
      }
      if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // During playback, name the brightest star born in the last few weeks of timeline.
  const caption = useMemo(() => {
    if (!playing || day < 20 || intro !== 'none') return null;
    let best: GalaxyStar | null = null;
    for (const s of data.stars) {
      if (!s.classic && s.day <= day && s.day > day - 40 && s.magnitude >= 0.55 && (!best || s.magnitude > best.magnitude)) best = s;
    }
    return best;
  }, [playing, day, data.stars, intro]);

  const months = useMemo(() => {
    const bins = new Map<number, number>();
    for (const s of data.stars) {
      if (s.classic) continue;
      const m = Math.floor(s.day / 30.44);
      bins.set(m, (bins.get(m) ?? 0) + 1);
    }
    const count = Math.ceil(data.days / 30.44);
    const max = Math.max(1, ...bins.values());
    return Array.from({ length: count }, (_, i) => ({ i, n: bins.get(i) ?? 0, h: (bins.get(i) ?? 0) / max }));
  }, [data.stars, data.days]);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? data.stars
        .filter((s) => terms.every((t) => `${s.name} ${labs[s.lab]?.name}`.toLowerCase().includes(t)))
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, 8)
    : [];
  const types = useMemo(() => [...new Set(data.stars.map((s) => s.type))].map((t) => ({ t, label: data.stars.find((s) => s.type === t)!.typeLabel })), [data.stars]);
  const hoverStar = hovered ? byKey.get(hovered.key) : null;
  const pick = selected ? byKey.get(selected) : null;
  const pickLine = pick?.line ? lines.get(pick.line) : null;
  const now = dayLabel(day);
  const labsSorted = useMemo(() => [...data.labs].sort((a, b) => b.count - a.count), [data.labs]);

  return (
    <div className={styles.root} data-status={status} data-intro={intro}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        aria-label={`The AI Galaxy: ${born} models as stars, arranged by lab and release date`}
        role="img"
        data-hover={hoverStar ? 'true' : undefined}
        onPointerMove={(e) => {
          if (e.buttons || status !== 'ready') return;
          const key = scene.current?.pick(e.clientX, e.clientY) ?? null;
          setHovered(key ? { key, x: e.clientX, y: e.clientY } : null);
        }}
        onPointerLeave={() => setHovered(null)}
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
          setTouched(true);
        }}
        onPointerUp={(e) => {
          const start = down.current;
          down.current = null;
          if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
          select(scene.current?.pick(e.clientX, e.clientY) ?? null);
        }}
      />

      <div className={styles.labels} aria-hidden="true">
        {labelSpecs.map((l) => (
          <span
            key={l.id}
            ref={(el) => {
              if (el) labelEls.current.set(l.id, el);
              else labelEls.current.delete(l.id);
            }}
            className={l.kind === 'lab' ? styles.labLabel : styles.yearLabel}
            style={l.color ? ({ '--t': l.color } as CSSProperties) : undefined}
          >
            {l.text}
          </span>
        ))}
      </div>

      {intro === 'bang' && <div className={styles.flash} aria-hidden="true" />}
      {(intro === 'singularity' || intro === 'formed') && (
        <p key={intro} className={styles.story} role="status">
          {intro === 'singularity' ? 'In the beginning, there was attention.' : 'Then everything happened at once.'}
        </p>
      )}
      {(intro === 'singularity' || intro === 'bang') && (
        <button type="button" className={styles.skip} onClick={skipIntro}>
          Skip intro
        </button>
      )}

      {status === 'loading' && (
        <div className={styles.loading}>
          <span className={styles.loadingOrb} />
          Assembling {data.stars.length} stars…
        </div>
      )}
      {status === 'nowebgl' && (
        <div className={styles.loading}>
          <p>This galaxy needs WebGL, which this browser has turned off.</p>
          <Link className="btn" href="/#binder">
            Browse the binder instead
          </Link>
        </div>
      )}

      <header className={styles.brand}>
        <Link href="/" className={styles.wordmark}>
          <span className={styles.mark} aria-hidden="true" />
          Modeldex
        </Link>
        <h1 className={styles.title}>
          The AI Galaxy
          <small>
            Every model is a star. Each lab is an arm. The further out, the newer.
          </small>
        </h1>
      </header>

      <div className={styles.tools}>
        <div className={styles.search}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7.2" cy="7.2" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.4 10.4l3.1 3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a star" aria-label="Find a model" autoComplete="off" spellCheck={false} />
          {results.length > 0 && (
            <ul className={styles.results} role="listbox" aria-label="Matching models">
              {results.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      select(s.key);
                    }}
                  >
                    <span className={styles.dot} style={{ '--t': labs[s.lab]?.color } as CSSProperties} />
                    <b>{s.name}</b>
                    <small>{labs[s.lab]?.name}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <select className={styles.select} value={type ?? ''} onChange={(e) => setType(e.target.value || null)} aria-label="Show one type">
          <option value="">All types</option>
          {types.map(({ t, label }) => (
            <option key={t} value={t}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className={styles.chip} aria-expanded={labsOpen} onClick={() => setLabsOpen((o) => !o)}>
          {focusLab ? labs[focusLab]?.name : 'Constellations'}
        </button>
        <button
          type="button"
          className={styles.chip}
          onClick={() => {
            setFocusLab(null);
            setType(null);
            setSelected(null);
            scene.current?.flyTo({ home: true });
          }}
          aria-label="Reset the view"
        >
          Reset
        </button>
        <button
          type="button"
          className={`${styles.chip} ${styles.bangChip}`}
          onClick={() => {
            setFocusLab(null);
            setLabsOpen(false);
            if (scene.current) runBang.current(scene.current);
          }}
          aria-label="Replay the Big Bang"
        >
          <span aria-hidden="true">✺</span> Big Bang
        </button>
      </div>

      {labsOpen && (
        <nav className={styles.labs} aria-label="Labs">
          <button type="button" className={styles.labRow} aria-pressed={!focusLab} onClick={() => focusOn(null)}>
            <span className={styles.dot} style={{ '--t': '#f4cb68' } as CSSProperties} />
            Every lab
            <small>
              {born}/{data.stars.length}
            </small>
          </button>
          {labsSorted.map((l) => (
            <button key={l.key} type="button" className={styles.labRow} aria-pressed={focusLab === l.key} onClick={() => focusOn(l.key)}>
              <span className={styles.dot} style={{ '--t': l.color } as CSSProperties} />
              {l.name}
              <small>
                {countAtOrBelow(labDays.get(l.key) ?? [], day)}/{l.count}
              </small>
            </button>
          ))}
        </nav>
      )}

      {hoverStar && hovered && hovered.key !== selected && (
        <div className={styles.tip} data-flip={hovered.x > window.innerWidth - 330 || undefined} style={{ left: hovered.x, top: hovered.y, '--t': labs[hoverStar.lab]?.color } as CSSProperties} role="tooltip">
          <small>
            <span className={styles.dot} /> {labs[hoverStar.lab]?.name} · {hoverStar.typeLabel}
          </small>
          <b>{hoverStar.name}</b>
          <span>
            {whenLabel(hoverStar)} · {hoverStar.stat}
          </span>
          <em>Click to open</em>
        </div>
      )}

      {pick && (
        <aside className={styles.panel} style={{ '--t': labs[pick.lab]?.color } as CSSProperties} aria-label={`${pick.name} details`}>
          <button type="button" className={styles.close} onClick={() => setSelected(null)} aria-label="Close">
            ×
          </button>
          <img
            className={styles.art}
            alt=""
            width={320}
            height={200}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artToSvg(cardArt({ ...pick, key: pick.key, lab: pick.lab }, labs[pick.lab]?.color ?? '#888'), 320, 200))}`}
          />
          <p className={styles.panelLab}>
            <span className={styles.dot} /> {labs[pick.lab]?.name} · {pick.typeLabel}
            {pick.retired && <span className={styles.retired}>Retired</span>}
          </p>
          <h2 className={styles.panelName}>{pick.name}</h2>
          <p className={styles.panelFacts}>
            {whenLabel(pick)} · {pick.stat}
          </p>
          {pickLine && (
            <div className={styles.constellation}>
              <p>
                Constellation <b>{pickLine.name}</b>
              </p>
              <ol>
                {pickLine.keys.map((k) => {
                  const s = byKey.get(k);
                  return s ? (
                    <li key={k}>
                      <button type="button" aria-current={k === pick.key ? 'true' : undefined} onClick={() => select(k)}>
                        {s.name}
                      </button>
                    </li>
                  ) : null;
                })}
              </ol>
            </div>
          )}
          <div className={styles.panelActions}>
            <Link className="btn btn-gold" href={modelHref(pick)}>
              Open the card
            </Link>
            {pickLine && (
              <Link className="btn" href={`/evolution/${pickLine.id}/?at=${pick.key}`}>
                Watch it evolve
              </Link>
            )}
            <Link className="btn btn-ghost" href={`${modelHref(pick)}#run`}>
              Where to run it
            </Link>
          </div>
        </aside>
      )}

      {caption && (
        <p key={caption.key} className={styles.caption} style={{ '--t': labs[caption.lab]?.color } as CSSProperties}>
          <span className={styles.dot} />
          <b>{caption.name}</b> {labs[caption.lab]?.name} · {formatDate(caption.date)}
        </p>
      )}

      <div className={styles.timeline}>
        <button type="button" className={styles.play} onClick={play} aria-label={playing ? 'Pause' : 'Play history'}>
          {playing ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5 3l8 5-8 5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className={styles.when}>
          <b>{day < 1 ? 'Before' : now.month}</b>
          <span>{day < 1 ? '2022' : now.year}</span>
        </div>
        <div className={styles.track}>
          <svg className={styles.histogram} viewBox={`0 0 ${months.length} 40`} preserveAspectRatio="none" aria-hidden="true">
            {months.map((m) => (
              <rect key={m.i} x={m.i + 0.12} y={40 - Math.max(1.5, m.h * 38)} width={0.76} height={Math.max(1.5, m.h * 38)} data-past={m.i * 30.44 <= day || undefined} />
            ))}
          </svg>
          <input
            type="range"
            min={0}
            max={data.days}
            step={1}
            value={Math.round(day)}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Timeline"
            aria-valuetext={`${day < 1 ? 'Before 2022' : `${now.month} ${now.year}`}: ${born} models`}
            style={{ '--p': `${(day / data.days) * 100}%` } as CSSProperties}
          />
          <div className={styles.ticks} aria-hidden="true">
            <span>Classics</span>
            {layout.years.map((y) => (
              <span key={y.year} style={{ left: `${((Date.parse(`${y.year}-01-01`) - Date.parse(GALAXY_START)) / 864e5 / data.days) * 100}%` }}>
                {y.year}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.count}>
          <b>{born.toLocaleString('en-US')}</b> stars
          <span>{labsBorn} labs</span>
        </div>
      </div>

      {!touched && status === 'ready' && <p className={styles.hint}>Drag to orbit · Scroll to zoom · Click any star</p>}

      <a className={styles.credits} href={withBase('/credits/')} target="_blank" rel="noopener" aria-label="Credits and sources (opens in a new tab)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5l2.3 6.1 6.2.4-4.8 4 1.6 6.3L12 15.8l-5.3 3.5 1.6-6.3-4.8-4 6.2-.4z" fill="currentColor" />
        </svg>
        Credits
      </a>
    </div>
  );
}

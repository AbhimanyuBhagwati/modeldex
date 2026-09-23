'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Portrait } from '@/components/creatures/Portrait';
import { Icon } from '@/components/icons';
import { formatDate, formatParams, formatTokens } from '@/lib/format';
import { modelHref } from '@/lib/site';
import { MOOD_LABEL, SPECIES, adopt, moodOf, petNews, type Creature, type TerrariumData } from '@/lib/terrarium';
import { currentSave, markHatched, setPet, useTerrariumSave } from './save';
import styles from './Terrarium.module.css';
import { TerrariumWorld, type Clock } from './world';

const CLOCK_LABEL: Record<Clock, string> = { live: 'Your time', day: 'Daytime', night: 'Night' };
const NEXT_CLOCK: Record<Clock, Clock> = { live: 'day', day: 'night', night: 'live' };

function sizeText(c: Creature) {
  if (c.context) return `${formatTokens(c.context)} tokens of context`;
  if (c.params) return `${formatParams(c.params)} parameters`;
  return 'Size not published';
}

function traits(c: Creature): string[] {
  const out: string[] = [];
  if (c.reasoning) out.push('Glowing horn: it reasons before answering');
  if (c.tools) out.push('Antenna: it calls tools');
  if (c.eyes) out.push('Big eyes: it reads images');
  if (c.ears) out.push('Ears: it hears audio');
  if (c.voice) out.push('It sings: it speaks out loud');
  if (c.holo) out.push('Iridescent: a holo rare card');
  if (c.family && c.family.stage > 0) out.push(`${Math.min(4, c.family.stage)} spike${c.family.stage > 1 ? 's' : ''}: generation ${c.family.stage + 1} of its family`);
  return out;
}

export function Terrarium({ data }: { data: TerrariumData }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<TerrariumWorld | null>(null);
  const save = useTerrariumSave();
  const [selected, setSelected] = useState<string | null>(null);
  const [clock, setClock] = useState<Clock>('live');
  const [query, setQuery] = useState('');
  const [eggCursor, setEggCursor] = useState(0);
  const [lab, setLab] = useState('');

  const byKey = useMemo(() => new Map(data.creatures.map((c) => [c.key, c])), [data.creatures]);
  const labColor = useMemo(() => Object.fromEntries(data.labs.map((l) => [l.key, l.color])), [data.labs]);
  const labName = useMemo(() => Object.fromEntries(data.labs.map((l) => [l.key, l.name])), [data.labs]);
  const hatched = useMemo(() => new Set(save.hatched), [save.hatched]);
  const eggs = data.creatures.filter((c) => c.egg && !hatched.has(c.key));
  const living = data.creatures.filter((c) => !c.fossil).length;
  const fossils = data.creatures.length - living;
  const pet = save.pet ? byKey.get(save.pet.key) : undefined;
  const results = query.trim().length > 1 ? data.creatures.filter((c) => `${c.name} ${labName[c.lab] ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];

  const select = (key: string | null) => {
    setSelected(key);
    if (worldRef.current) worldRef.current.selected = key;
  };
  const visit = (key: string) => {
    worldRef.current?.focus(key);
    select(key);
  };

  // The world lives outside React: one canvas, one animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !wrap || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const initial = currentSave();
    const world = new TerrariumWorld(data, { still, hatched: new Set(initial.hatched), pet: initial.pet?.key ?? null, onHatch: markHatched });
    worldRef.current = world;
    const size = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      world.resize(r.width, r.height, dpr);
      const mini = miniRef.current;
      if (mini) {
        const m = mini.getBoundingClientRect();
        mini.width = Math.round(m.width * dpr);
        mini.height = Math.round(m.height * dpr);
      }
    };
    size();
    // Open on the creature a link asked for, else your own, else the first egg, else OpenAI's meadow.
    const see = new URLSearchParams(window.location.search).get('see');
    const seen = see ? world.agent(see) : undefined;
    const firstEgg = data.creatures.find((c) => c.egg && !initial.hatched.includes(c.key));
    const startKey = seen ? see : (initial.pet?.key ?? firstEgg?.key);
    const startAgent = startKey ? world.agent(startKey) : undefined;
    const openai = world.layout.biomes.find((b) => b.lab === 'openai') ?? world.layout.biomes[0];
    world.start(startAgent ? startAgent.x : (openai.x0 + openai.x1) / 2);
    const opening = seen && see ? requestAnimationFrame(() => {
      world.selected = see;
      world.focus(see);
      setSelected(see);
    }) : 0;
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    let raf = 0;
    const loop = (now: number) => {
      world.frame(ctx, now);
      const mini = miniRef.current;
      const mctx = mini?.getContext('2d');
      if (mini && mctx) world.drawMinimap(mctx, mini.width / Math.min(2, window.devicePixelRatio || 1), mini.height / Math.min(2, window.devicePixelRatio || 1), Math.min(2, window.devicePixelRatio || 1));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) world.zoomAt(Math.exp(-e.deltaY * 0.01), e.offsetX, e.offsetY);
      else world.panBy(-(e.deltaX + e.deltaY), 0);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(opening);
      ro.disconnect();
      canvas.removeEventListener('wheel', wheel);
      worldRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (worldRef.current) worldRef.current.pet = save.pet?.key ?? null;
  }, [save.pet]);

  // Pointer: drag to pan, pinch to zoom, tap to pick.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: 0, pinch: 0 });
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    drag.current.moved = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const world = worldRef.current;
    if (!world) return;
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      const key = world.pick(x, y);
      world.hovered = key;
      e.currentTarget.style.cursor = key ? 'pointer' : 'grab';
      return;
    }
    pointers.current.set(e.pointerId, { x, y });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.current.pinch) world.zoomAt(d / drag.current.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      drag.current.pinch = d;
      drag.current.moved = 99;
      return;
    }
    drag.current.moved += Math.abs(x - prev.x) + Math.abs(y - prev.y);
    if (drag.current.moved > 4) {
      world.panBy(x - prev.x, y - prev.y);
      e.currentTarget.style.cursor = 'grabbing';
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const world = worldRef.current;
    const wasTap = pointers.current.size === 1 && drag.current.moved <= 4;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) drag.current.pinch = 0;
    if (!world || !wasTap) return;
    const key = world.pick(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    if (key && world.isEgg(key)) world.hatch(key);
    select(key);
  };
  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const world = worldRef.current;
    if (!world) return;
    const step = e.shiftKey ? 400 : 120;
    if (e.key === 'ArrowLeft') world.panBy(step, 0);
    else if (e.key === 'ArrowRight') world.panBy(-step, 0);
    else if (e.key === 'ArrowUp') world.panBy(0, step / 2);
    else if (e.key === 'ArrowDown') world.panBy(0, -step / 2);
    else if (e.key === '+' || e.key === '=') world.zoomAt(1.2, canvasRef.current!.clientWidth / 2, canvasRef.current!.clientHeight / 2);
    else if (e.key === '-') world.zoomAt(1 / 1.2, canvasRef.current!.clientWidth / 2, canvasRef.current!.clientHeight / 2);
    else if (e.key === 'Escape') select(null);
    else return;
    e.preventDefault();
  };
  const zoom = (f: number) => {
    const c = canvasRef.current;
    if (c) worldRef.current?.zoomAt(f, c.clientWidth / 2, c.clientHeight / 2);
  };
  const cycleClock = () => {
    const next = NEXT_CLOCK[clock];
    setClock(next);
    if (worldRef.current) worldRef.current.clock = next;
  };
  const nextEgg = () => {
    if (!eggs.length) return;
    const egg = eggs[eggCursor % eggs.length];
    setEggCursor((i) => i + 1);
    visit(egg.key);
  };

  const c = selected ? byKey.get(selected) : undefined;
  const mood = c ? moodOf(c, data.today) : null;
  const isEgg = c ? c.egg && !hatched.has(c.key) : false;
  const isPet = !!c && save.pet?.key === c.key;

  return (
    <section className={styles.shell} aria-label="The AI Terrarium">
      <div className={styles.stage} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          tabIndex={0}
          role="img"
          aria-label={`A living terrarium of ${living} AI models as creatures, with ${eggs.length} eggs and ${fossils} fossils. Use the search box to find one, or arrow keys to look around.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            if (worldRef.current) worldRef.current.hovered = null;
          }}
          onKeyDown={onKey}
        />
        <div className={styles.glass} aria-hidden="true" />

        <div className={styles.top}>
          <div className={styles.brand}>
            <b>The AI Terrarium</b>
            <span>
              {living} creatures · {eggs.length} {eggs.length === 1 ? 'egg' : 'eggs'} · {fossils} fossils
            </span>
          </div>
          <div className={styles.tools}>
            <div className={styles.search}>
              <Icon name="search" />
              <input type="search" placeholder="Find a creature" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a creature by model name" />
              {results.length > 0 && (
                <ul className={styles.results}>
                  {results.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        onClick={() => {
                          visit(r.key);
                          setQuery('');
                        }}
                      >
                        <span className={styles.dot} style={{ '--t': labColor[r.lab] } as CSSProperties} />
                        {r.name}
                        <small>{r.fossil ? 'Fossil' : r.egg && !hatched.has(r.key) ? 'Egg' : SPECIES[r.type].name}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className={styles.tool} onClick={cycleClock} aria-label={`Time of day: ${CLOCK_LABEL[clock]}. Change it`}>
              {clock === 'night' ? '☾' : clock === 'day' ? '☀' : '◐'}
              <span>{CLOCK_LABEL[clock]}</span>
            </button>
            <button type="button" className={styles.tool} onClick={() => zoom(1.25)} aria-label="Zoom in">
              +
            </button>
            <button type="button" className={styles.tool} onClick={() => zoom(0.8)} aria-label="Zoom out">
              −
            </button>
          </div>
        </div>

        <div className={styles.bottom}>
          <div className={styles.chips}>
            {eggs.length > 0 && (
              <button type="button" className={styles.eggChip} onClick={nextEgg}>
                <span aria-hidden="true">🥚</span> {eggs.length} {eggs.length === 1 ? 'egg' : 'eggs'} to hatch
              </button>
            )}
            {save.pet && (
              <button type="button" className={styles.petChip} onClick={() => save.pet && visit(save.pet.key)}>
                <span aria-hidden="true">♥</span> {pet?.name ?? 'Your creature'}
              </button>
            )}
          </div>
          <canvas
            ref={miniRef}
            className={styles.mini}
            aria-label="Map of the labs. Click to travel."
            role="img"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              worldRef.current?.jumpTo((e.clientX - r.left) / r.width);
            }}
          />
          <select
            className={styles.labs}
            value={lab}
            aria-label="Travel to a lab"
            onChange={(e) => {
              setLab(e.target.value);
              const b = worldRef.current?.layout.biomes.find((x) => x.lab === e.target.value);
              if (b && worldRef.current) worldRef.current.jumpTo((b.x0 + b.x1) / 2 / worldRef.current.layout.width);
            }}
          >
            <option value="">Travel to a lab…</option>
            {[...data.labs].sort((a, b) => a.name.localeCompare(b.name)).map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {c && mood && (
          <aside className={styles.panel} aria-label={`${c.name}, a ${SPECIES[c.type].name}`}>
            <button type="button" className={styles.close} onClick={() => select(null)} aria-label="Close">
              <Icon name="x" />
            </button>
            <div className={styles.head}>
              <div className={styles.portrait} style={{ '--t': labColor[c.lab] } as CSSProperties}>
                {!c.fossil && !isEgg ? <Portrait creature={c} color={labColor[c.lab]} width={112} height={96} /> : <span className={styles.big}>{c.fossil ? '🦴' : '🥚'}</span>}
              </div>
              <div>
                <p className={styles.species}>
                  {labName[c.lab]} · {SPECIES[c.type].name}
                </p>
                <h2 className={styles.name}>{c.name}</h2>
                <span className={styles.mood} data-mood={isEgg ? 'egg' : mood.mood}>
                  {isEgg ? MOOD_LABEL.egg : mood.mood === 'egg' ? 'Just hatched' : MOOD_LABEL[mood.mood]}
                </span>
              </div>
            </div>
            <p className={styles.why}>{isEgg ? `Released ${formatDate(c.born)}. Tap the egg to hatch it.` : mood.mood === 'egg' ? `Released ${formatDate(c.born)}, and you just hatched it.` : mood.why}</p>
            {isPet && save.pet && (
              <div className={styles.news}>
                <b>Since you adopted it on {formatDate(save.pet.at)}</b>
                <ul>
                  {petNews(c, save.pet, data.events).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <dl className={styles.facts}>
              <div>
                <dt>Size</dt>
                <dd>{sizeText(c)}</dd>
              </div>
              <div>
                <dt>Speed</dt>
                <dd>{c.speed ? `${c.speed} tokens a second, measured` : 'Never timed'}</dd>
              </div>
              <div>
                <dt>Wit</dt>
                <dd>{c.wit != null ? `Quality ${c.wit}${c.wit >= 90 ? ', crowned' : c.wit >= 75 ? ', haloed' : ''}` : 'No leaderboard yet'}</dd>
              </div>
              <div>
                <dt>{c.fossil ? 'Lived from' : 'Born'}</dt>
                <dd>{formatDate(c.born)}</dd>
              </div>
            </dl>
            {c.family && (
              <p className={styles.family}>
                {c.family.name} family, generation {c.family.stage + 1} of {c.family.stages}.{' '}
                {c.family.lead === c.key ? 'It leads the family.' : `${c.family.leadName} leads the family now.`}
              </p>
            )}
            {!c.fossil && traits(c).length > 0 && (
              <ul className={styles.traits}>
                {traits(c).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <div className={styles.actions}>
              {isEgg ? (
                <button type="button" className="btn btn-gold btn-tiny" onClick={() => worldRef.current?.hatch(c.key)}>
                  Hatch it
                </button>
              ) : (
                !c.fossil && (
                  <button type="button" className={`btn btn-tiny ${isPet ? '' : 'btn-gold'}`} onClick={() => setPet(isPet ? null : adopt(c, data.today))} aria-pressed={isPet}>
                    {isPet ? '♥ Adopted · let go' : '♥ Adopt'}
                  </button>
                )
              )}
              <Link className="btn btn-tiny" href={modelHref(c)}>
                Card
              </Link>
              {c.speed && (
                <Link className="btn btn-tiny" href={`/race/?r=${c.key}`}>
                  Race it
                </Link>
              )}
              {c.family && (
                <Link className="btn btn-tiny" href={`/evolution/${c.family.line}/?at=${c.key}`}>
                  Family
                </Link>
              )}
            </div>
          </aside>
        )}
        <p className={styles.hint}>Drag to explore · pinch or ⌘-scroll to zoom · tap a creature · tap an egg to hatch it</p>
      </div>
    </section>
  );
}

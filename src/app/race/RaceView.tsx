'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CopyButton } from '@/components/client-bits';
import { Portrait } from '@/components/creatures/Portrait';
import type { Drawable } from '@/components/creatures/draw';
import { Icon } from '@/components/icons';
import { CHARS_PER_TOKEN, MAX_RACERS, PASSAGES, charsAt, finishMs, lineupFrom, results, tokensPerSecond, wordsIn, type Racer } from '@/lib/race';
import { modelHref } from '@/lib/site';
import styles from './page.module.css';

type Creature = Drawable & { lab: string };

interface Props {
  racers: Racer[];
  creatures: Record<string, Creature>;
  colors: Record<string, string>;
  labNames: Record<string, string>;
}

type Phase = 'ready' | 'countdown' | 'racing' | 'done';

/** You race as a creature too: a golden walker that thinks before it types. */
const YOU: Creature = { key: 'you', lab: 'you', type: 'text', reasoning: true, tools: false, eyes: true, ears: false, voice: false, wit: null, holo: false, family: null, seed: 0.42, size: 0.5 };
const GOLD = '#e8b33c';

const seconds = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(2)}s` : `${(ms / 1000).toFixed(1)}s`);
const rate = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));

export function RaceView({ racers, creatures, colors, labNames }: Props) {
  const params = useSearchParams();
  const [lineup, setLineup] = useState<Racer[]>(() => lineupFrom(params.get('r'), racers));
  const [passage, setPassage] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(3);
  const [typed, setTyped] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [firstMs, setFirstMs] = useState<number | null>(null);
  const [endMs, setEndMs] = useState(0);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState('');
  const start = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const text = PASSAGES[passage % PASSAGES.length];

  // Correct characters so far: the part of what you typed that matches the passage.
  let good = 0;
  while (good < typed.length && typed[good] === text[good]) good++;
  const wrong = typed.length > good;

  const share = (list: Racer[]) => window.history.replaceState(null, '', `${window.location.pathname}?r=${list.map((r) => r.key).join(',')}`);

  const begin = () => {
    setTyped('');
    setFirstMs(null);
    setElapsed(0);
    setCount(3);
    setPhase('countdown');
    input.current?.focus();
  };

  // Countdown, then the clock.
  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setTimeout(() => {
      if (count > 1) setCount(count - 1);
      else {
        start.current = performance.now();
        setPhase('racing');
      }
    }, 700);
    return () => clearTimeout(id);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== 'racing') return;
    let raf = 0;
    const tick = (now: number) => {
      setElapsed(now - start.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const finish = (ms: number) => {
    setEndMs(ms);
    setElapsed(ms);
    setPhase('done');
  };

  const onType = (value: string) => {
    if (phase !== 'racing') return;
    const now = performance.now() - start.current;
    setTyped(value);
    if (firstMs == null && value[0] === text[0]) setFirstMs(now);
    if (value === text) finish(now);
  };

  const again = () => {
    setPassage((p) => p + 1);
    setPhase('ready');
    setTyped('');
  };

  const toggle = (r: Racer) => {
    const next = lineup.some((x) => x.key === r.key) ? lineup.filter((x) => x.key !== r.key) : lineup.length >= MAX_RACERS ? [...lineup.slice(1), r] : [...lineup, r];
    const sorted = next.sort((a, b) => b.speed - a.speed);
    setLineup(sorted);
    share(sorted);
  };

  const done = phase === 'done';
  const clock = done ? endMs : phase === 'racing' ? elapsed : 0;
  const board = useMemo(() => (done ? results(lineup, text.length, { ms: endMs, firstMs, chars: good }) : []), [done, lineup, text.length, endMs, firstMs, good]);
  const yours = tokensPerSecond(good, clock);
  const fastest = board[0];
  const shareText = fastest
    ? `I typed at ${rate(yours)} tokens a second. ${fastest.racer.name} did ${rate(fastest.racer.speed)}, ${Math.round(fastest.times).toLocaleString('en-US')}× faster. Race the machine:`
    : '';
  const pool = [...racers].sort((a, b) => b.speed - a.speed).filter((r) => `${r.name} ${labNames[r.lab] ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const max = Math.max(...racers.map((r) => r.speed));

  const lanes = [
    { key: 'you', name: 'You', sub: phase === 'racing' || done ? `${rate(yours)} tokens/s` : 'Type the passage below', chars: good, finished: done && good === text.length ? endMs : null, creature: YOU, color: GOLD },
    ...lineup.map((r) => {
      const chars = phase === 'ready' || phase === 'countdown' ? 0 : charsAt(r, clock, text.length);
      const f = finishMs(r, text.length);
      return { key: r.key, name: r.name, sub: `${rate(r.speed)} tokens/s via ${r.host}`, chars, finished: clock >= f ? f : null, creature: creatures[r.key], color: colors[r.lab] ?? '#888888', racer: r };
    }),
  ];

  return (
    <div className={styles.arena}>
      <div className={styles.track} aria-label="Race track">
        {lanes.map((lane) => {
          const p = lane.chars / text.length;
          return (
            <div key={lane.key} className={styles.lane} data-you={lane.key === 'you' || undefined} style={{ '--t': lane.color } as CSSProperties}>
              <div className={styles.who}>
                <b>{lane.name}</b>
                <small>{lane.sub}</small>
              </div>
              <div className={styles.road}>
                <div className={styles.dust} style={{ width: `${p * 100}%` }} />
                <div className={styles.runner} style={{ left: `calc(${p} * (100% - 64px))` }}>
                  {lane.creature && <Portrait creature={lane.creature} color={lane.color} width={64} height={60} fill={1.45} running={phase === 'racing' && !lane.finished} />}
                </div>
                <div className={styles.flag} aria-hidden="true" />
                {lane.finished != null && <span className={styles.time}>{seconds(lane.finished)}</span>}
              </div>
              {lane.key !== 'you' && (phase === 'racing' || done) && (
                <p className={styles.stream} aria-hidden="true">
                  <span>{text.slice(Math.max(0, lane.chars - 90), lane.chars)}</span>
                  {lane.chars < text.length && lane.chars > 0 && <span className={styles.caret} />}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.console}>
        <div className={styles.passage} aria-hidden="true">
          <span className={styles.ok}>{text.slice(0, good)}</span>
          {wrong && <span className={styles.bad}>{text.slice(good, typed.length)}</span>}
          <span className={styles.next}>{text.slice(Math.max(good, typed.length), Math.max(good, typed.length) + 1)}</span>
          <span>{text.slice(Math.max(good, typed.length) + 1)}</span>
        </div>
        <label className="sr-only" htmlFor="race-input">
          Type this passage: {text}
        </label>
        <textarea
          id="race-input"
          ref={input}
          className={styles.input}
          value={typed}
          onChange={(e) => onType(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (phase === 'ready' || phase === 'done') begin();
            }
          }}
          placeholder={phase === 'racing' ? 'Go! Type the passage…' : phase === 'countdown' ? 'Get ready…' : 'Press Start, then type the passage above'}
          readOnly={phase !== 'racing'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={2}
        />
        <div className={styles.controls}>
          {phase === 'ready' && (
            <button type="button" className="btn btn-gold" onClick={begin}>
              Start the race
            </button>
          )}
          {phase === 'racing' && (
            <button type="button" className="btn" onClick={() => finish(performance.now() - start.current)}>
              I give up
            </button>
          )}
          {done && (
            <button type="button" className="btn btn-gold" onClick={again}>
              Race again
            </button>
          )}
          {(phase === 'ready' || done) && (
            <button type="button" className="btn" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
              Change racers
            </button>
          )}
          {phase === 'ready' && (
            <button type="button" className="btn btn-ghost" onClick={() => setPassage((p) => p + 1)}>
              New passage
            </button>
          )}
          <span className={styles.clock} aria-live="off">
            {seconds(clock)}
          </span>
        </div>
        {phase === 'countdown' && (
          <div className={styles.countdown} aria-live="assertive">
            {count}
          </div>
        )}
      </div>

      {done && fastest && (
        <section className={styles.results} aria-live="polite" aria-labelledby="race-result">
          <h2 id="race-result">
            You typed at <em>{rate(yours)} tokens a second.</em>
          </h2>
          <p className={styles.verdict}>
            {fastest.racer.name} finished in {seconds(fastest.finish)}, {Math.round(fastest.times).toLocaleString('en-US')}× faster than you.
            {good < text.length ? ' (You gave up, so this counts what you finished.)' : ''} While you typed, it could have written about{' '}
            {wordsIn(fastest.racer, endMs).toLocaleString('en-US')} words.
          </p>
          <ol className={styles.board}>
            {board.map((b, i) => (
              <li key={b.racer.key} style={{ '--t': colors[b.racer.lab] } as CSSProperties}>
                <span className={styles.place}>{i + 1}</span>
                <span className={styles.boardName}>
                  <Link href={modelHref({ lab: b.racer.lab, slug: b.racer.key.split('/')[1] })}>{b.racer.name}</Link>
                  <small>
                    first word after {seconds(b.racer.latencyMs)} · {rate(b.racer.speed)} tokens/s
                  </small>
                </span>
                <span className={styles.boardTime}>{seconds(b.finish)}</span>
                <span className={styles.boardX}>{b.times === Number.POSITIVE_INFINITY ? '∞' : `${Math.round(b.times).toLocaleString('en-US')}×`}</span>
                {b.beatToFirst && <span className={styles.beat}>You beat it to the first letter</span>}
              </li>
            ))}
            <li data-you>
              <span className={styles.place}>{board.length + 1}</span>
              <span className={styles.boardName}>
                You
                <small>{firstMs != null ? `first letter after ${seconds(firstMs)}` : 'no letters yet'}</small>
              </span>
              <span className={styles.boardTime}>{seconds(endMs)}</span>
              <span className={styles.boardX}>1×</span>
            </li>
          </ol>
          <div className={styles.controls}>
            <CopyButton label="Copy my result" text={`${shareText} ${typeof window === 'undefined' ? '' : window.location.href}`} className="btn" />
          </div>
        </section>
      )}

      {picking && (
        <section className={styles.picker} aria-labelledby="pick-title">
          <div className={styles.pickerHead}>
            <h2 id="pick-title">Pick up to {MAX_RACERS} racers</h2>
            <div className={styles.filter}>
              <Icon name="search" />
              <input type="search" placeholder="Filter models" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter racers" />
            </div>
            <button type="button" className="btn btn-gold btn-tiny" onClick={() => setPicking(false)}>
              Done
            </button>
          </div>
          <p className={styles.pickerNote}>
            Every model Hugging Face has timed: {racers.length} of them, fastest first. Speeds are its fastest host’s output rate, measured by Hugging Face.
          </p>
          <ul className={styles.pool}>
            {pool.map((r) => {
              const on = lineup.some((x) => x.key === r.key);
              return (
                <li key={r.key}>
                  <button type="button" aria-pressed={on} onClick={() => toggle(r)} style={{ '--t': colors[r.lab] } as CSSProperties}>
                    <span className={styles.poolName}>
                      <b>{r.name}</b>
                      <small>
                        {labNames[r.lab]} · via {r.host}
                      </small>
                    </span>
                    <span className={styles.poolBar}>
                      <i style={{ width: `${(Math.log10(r.speed) / Math.log10(max)) * 100}%` }} />
                    </span>
                    <span className={styles.poolSpeed}>{rate(r.speed)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className={styles.note}>
        Speeds come from Hugging Face’s own measurements of each model’s fastest host: time to the first token, then tokens a second. A token is about{' '}
        {CHARS_PER_TOKEN} characters of English, so a racer writes its tokens a second times {CHARS_PER_TOKEN} characters a second. Real speeds change with load
        and prompt length.
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { Menu, Option } from '@/components/binder/Menu';
import binder from '@/components/binder/Binder.module.css';
import { CopyButton } from '@/components/client-bits';
import { useDeck } from '@/components/deck/DeckProvider';
import { Icon } from '@/components/icons';
import { MAX_HP, STATS, battle, randomMatchup, type Round, type Side } from '@/lib/battle';
import { TYPE_LABEL } from '@/lib/format';
import { battleHref, compareHref } from '@/lib/site';
import type { LabSummary, Model } from '@/lib/types';
import styles from './page.module.css';

interface Props {
  models: Model[];
  labs: LabSummary[];
  setSize: number;
  refDate: string;
  featured: { title: string; keys: [string, string] }[];
}

type Labs = Record<string, LabSummary>;

/** Reads `?a=` and `?b=` in the browser, since a static host can't build a page per matchup. */
export function BattleView({ models, labs: labList, setSize, refDate, featured }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const byKey = useMemo(() => new Map(models.map((m) => [m.key, m])), [models]);
  const labs = useMemo<Labs>(() => Object.fromEntries(labList.map((l) => [l.key, l])), [labList]);
  const a = byKey.get(params.get('a') ?? '');
  const b = byKey.get(params.get('b') ?? '');
  const ready = a && b && a.key !== b.key;
  const title = ready ? `${a.name} vs ${b.name}` : 'Battle mode';

  useEffect(() => {
    document.title = `${title} · Modeldex`;
  }, [title]);

  const go = (x: string, y: string) => router.push(battleHref(x, y), { scroll: false });
  const random = () => {
    const pair = randomMatchup(models, Math.random);
    if (pair) go(pair[0].key, pair[1].key);
  };

  if (!ready) return <Lobby byKey={byKey} labs={labs} featured={featured} onRandom={random} />;
  return (
    <Arena
      key={`${a.key}|${b.key}`}
      fighters={[a, b]}
      models={models}
      labs={labs}
      setSize={setSize}
      refDate={refDate}
      onPick={(side, key) => (side === 0 ? go(key, b.key) : go(a.key, key))}
      onRandom={random}
    />
  );
}

function Lobby({ byKey, labs, featured, onRandom }: { byKey: Map<string, Model>; labs: Labs; featured: Props['featured']; onRandom: () => void }) {
  const deck = useDeck();
  return (
    <div className={styles.lobby}>
      <p className="eyebrow">Battle mode</p>
      <h1 className={styles.title}>Pick two cards. Let them fight.</h1>
      <p className={styles.lede}>
        Each round pits one stat against another: context, price, freshness, skills, size, and downloads. The better card hits, and a wider gap hits harder. It’s all decided by
        the data, so a shared link replays the same fight.
      </p>
      <div className={styles.lobbyActions}>
        <button type="button" className="btn btn-gold" onClick={onRandom}>
          Random battle
        </button>
        {deck.length >= 2 && (
          <Link className="btn" href={battleHref(deck[0].key, deck[1].key)}>
            Battle your deck: {deck[0].name} vs {deck[1].name}
          </Link>
        )}
      </div>
      {featured.length > 0 && (
        <section aria-labelledby="featured-title">
          <h2 id="featured-title" className={styles.featuredTitle}>
            Featured matchups
          </h2>
          <ul className={styles.featured}>
            {featured.map(({ title, keys }) => {
              const [x, y] = keys.map((k) => byKey.get(k)!);
              return (
                <li key={title}>
                  <Link className={styles.matchup} href={battleHref(x.key, y.key)}>
                    <span className={styles.matchDots} aria-hidden="true">
                      <span style={{ '--t': labs[x.lab].color } as CSSProperties} />
                      <span style={{ '--t': labs[y.lab].color } as CSSProperties} />
                    </span>
                    <span className={styles.matchText}>
                      <small>{title}</small>
                      <b>
                        {x.name} <em>vs</em> {y.name}
                      </b>
                    </span>
                    <Icon name="chev" className={styles.matchChev} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

type Phase = 'ready' | 'fighting' | 'done';

function Arena({
  fighters,
  models,
  labs,
  setSize,
  refDate,
  onPick,
  onRandom,
}: {
  fighters: [Model, Model];
  models: Model[];
  labs: Labs;
  setSize: number;
  refDate: string;
  onPick: (side: Side, key: string) => void;
  onRandom: () => void;
}) {
  const [first, second] = fighters;
  const result = useMemo(() => battle(first, second), [first, second]);
  const total = result.rounds.length;
  const [phase, setPhase] = useState<Phase>('ready');
  const [step, setStep] = useState(0);
  const [pace, setPace] = useState(1100);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const names = [fighters[0].name, fighters[1].name] as const;

  // One round per beat, then a pause before the result.
  useEffect(() => {
    if (phase !== 'fighting') return;
    const wait = step === 0 ? 300 : step < total ? pace : Math.min(pace, 700);
    const t = setTimeout(() => (step < total ? setStep(step + 1) : setPhase('done')), wait);
    return () => clearTimeout(t);
  }, [phase, step, total, pace]);

  // The round's winner lunges and the other card takes the hit.
  useEffect(() => {
    const r = result.rounds[step - 1];
    if (phase !== 'fighting' || !r || r.winner == null || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const [attacker, defender] = r.winner === 0 ? [left.current, right.current] : [right.current, left.current];
    const dir = r.winner === 0 ? 1 : -1;
    const heavy = r.effect === 'super' ? 1.6 : 1;
    const lunge = attacker?.animate(
      [{ transform: 'none' }, { transform: `translateX(${dir * 34}px) rotate(${dir * 4}deg) scale(1.04)`, offset: 0.35 }, { transform: 'none' }],
      { duration: 420, easing: 'cubic-bezier(.3,.7,.4,1)' },
    );
    const hit = defender?.animate(
      [
        { transform: 'none', filter: 'none' },
        { transform: `translateX(${dir * 12 * heavy}px) rotate(${dir * -3 * heavy}deg)`, filter: 'brightness(1.5) saturate(.5)', offset: 0.2 },
        { transform: `translateX(${dir * -8 * heavy}px)`, offset: 0.45 },
        { transform: `translateX(${dir * 4}px)`, offset: 0.7 },
        { transform: 'none', filter: 'none' },
      ],
      { duration: 480, delay: 150, easing: 'ease-out' },
    );
    return () => {
      lunge?.cancel();
      hit?.cancel();
    };
  }, [phase, step, result]);

  const start = () => {
    setPace(matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : 1100);
    setStep(0);
    setPhase('fighting');
  };
  const skip = () => {
    setStep(total);
    setPhase('done');
  };

  const shown = result.rounds.slice(0, step);
  const hp: [number, number] = step === 0 ? [MAX_HP, MAX_HP] : result.rounds[step - 1].hp;
  const done = phase === 'done';
  const upcoming = STATS.filter((s) => result.rounds.some((r) => r.stat === s.key));
  const stateOf = (side: Side) => (!done || result.winner == null ? undefined : result.winner === side ? 'winner' : result.ko ? 'fainted' : 'loser');

  return (
    <div className={styles.arenaWrap}>
      <div className={styles.head}>
        <p className="eyebrow">Battle mode</p>
        <h1 className={styles.title}>
          {names[0]} <em>vs</em> {names[1]}
        </h1>
      </div>

      <div className={styles.arena}>
        {([0, 1] as const).map((side) => {
          const m = fighters[side];
          return (
            <div key={m.key} className={styles.corner} data-side={side} data-state={stateOf(side)} style={{ '--t': labs[m.lab].color } as CSSProperties}>
              <HpBar hp={hp[side]} name={m.name} />
              <div ref={side === 0 ? left : right} className={styles.fighter}>
                <Card model={m} lab={labs[m.lab]} setSize={setSize} refDate={refDate} addable={false} headingLevel="h2" />
                {stateOf(side) === 'winner' && <span className={styles.badge}>Winner</span>}
                {stateOf(side) === 'fainted' && <span className={`${styles.badge} ${styles.badgeOut}`}>Fainted</span>}
              </div>
              <Menu label="Change fighter" width={320} align={side === 0 ? 'start' : 'end'}>
                {(close) => (
                  <Picker
                    models={models}
                    labs={labs}
                    other={fighters[side === 0 ? 1 : 0]}
                    onPick={(key) => {
                      close();
                      onPick(side, key);
                    }}
                  />
                )}
              </Menu>
            </div>
          );
        })}

        <div className={styles.center}>
          <span className={styles.vs} aria-hidden="true">
            VS
          </span>
          {phase === 'ready' && (
            <button type="button" className={`btn btn-gold ${styles.fight}`} onClick={start}>
              Battle!
            </button>
          )}
          {phase === 'fighting' && (
            <button type="button" className="btn" onClick={skip}>
              Skip to result
            </button>
          )}
          {done && (
            <button type="button" className={`btn btn-gold ${styles.fight}`} onClick={start}>
              Rematch
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-tiny" onClick={onRandom}>
            New random battle
          </button>
        </div>
      </div>

      {phase === 'ready' ? (
        <p className={styles.tape}>
          <span>{total} rounds:</span> {upcoming.map((s) => s.label).join(' · ')}
          {fighters[0].type !== fighters[1].type && (
            <em>
              {' '}
              {kind(fighters[0], true)} against {kind(fighters[1])}. Anything goes.
            </em>
          )}
        </p>
      ) : (
        <ol className={styles.log} aria-label="Rounds">
          {shown.map((r, i) => (
            <RoundLine key={r.stat} r={r} n={i + 1} names={names} latest={i === shown.length - 1 && !done} />
          ))}
        </ol>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {phase === 'fighting' && shown.length ? describe(shown[shown.length - 1], names) : ''}
        {done ? verdict(result, names) : ''}
      </p>

      {done && (
        <div className={styles.result}>
          <p className={styles.resultKicker}>{result.ko ? 'Knockout' : result.winner == null ? 'Even match' : 'Won on HP'}</p>
          <p className={styles.resultTitle}>{result.winner == null ? 'It’s a draw!' : `${names[result.winner]} wins!`}</p>
          <p className={styles.resultNote}>{verdict(result, names)}</p>
          <div className={styles.resultActions}>
            <Link className="btn" href={compareHref([fighters[0].key, fighters[1].key])}>
              Compare every stat
            </Link>
            <CopyButton label="Copy battle link" className="btn" />
          </div>
        </div>
      )}
    </div>
  );
}

function HpBar({ hp, name }: { hp: number; name: string }) {
  const level = hp <= 20 ? 'low' : hp <= 50 ? 'mid' : 'high';
  return (
    <div className={styles.hp} data-level={level} role="meter" aria-label={`${name} HP`} aria-valuemin={0} aria-valuemax={MAX_HP} aria-valuenow={hp}>
      <span className={styles.hpLabel}>HP</span>
      <span className={styles.hpTrack}>
        <span className={styles.hpFill} style={{ width: `${(hp / MAX_HP) * 100}%` }} />
      </span>
      <b className={styles.hpValue}>{hp}</b>
    </div>
  );
}

/** "an image model", "a 3D model". */
function kind(m: Model, capital = false) {
  const type = TYPE_LABEL[m.type];
  const word = type === '3D' ? type : type.toLowerCase();
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a';
  return `${capital ? article[0].toUpperCase() + article.slice(1) : article} ${word} model`;
}

const EFFECT = { super: 'It’s super effective!', weak: 'It’s not very effective…' } as const;

function describe(r: Round, names: readonly [string, string]) {
  if (r.winner == null) return `${r.label}: ${r.values[0]} vs ${r.values[1]}. A stalemate, no damage.`;
  return `${names[r.winner]} used ${r.move}! ${r.effect ? EFFECT[r.effect] : ''} ${r.damage} damage.`;
}

function verdict(result: ReturnType<typeof battle>, names: readonly [string, string]) {
  const n = result.rounds.length;
  if (result.winner == null) return `Both cards end on ${result.hp[0]} HP after ${n} rounds.`;
  const loser = names[result.winner === 0 ? 1 : 0];
  if (result.ko) return `${loser} fainted in round ${n}.`;
  return `${result.hp[result.winner]} to ${result.hp[result.winner === 0 ? 1 : 0]} HP after ${n} rounds.`;
}

function RoundLine({ r, n, names, latest }: { r: Round; n: number; names: readonly [string, string]; latest: boolean }) {
  return (
    <li className={styles.round} data-latest={latest || undefined} data-winner={r.winner ?? 'none'}>
      <span className={styles.roundNo}>Round {n}</span>
      <span className={styles.roundStat}>{r.label}</span>
      <span className={styles.roundVals}>
        <b data-win={r.winner === 0 || undefined}>{r.values[0]}</b>
        <span aria-hidden="true">vs</span>
        <b data-win={r.winner === 1 || undefined}>{r.values[1]}</b>
      </span>
      <span className={styles.roundText}>
        {r.winner == null ? (
          'Stalemate. No damage.'
        ) : (
          <>
            <b>{names[r.winner]}</b> used {r.move}! {r.effect && <em data-effect={r.effect}>{EFFECT[r.effect]}</em>}
          </>
        )}
      </span>
      {r.damage > 0 && <span className={styles.roundDamage}>−{r.damage}</span>}
    </li>
  );
}

/** Search every card; with no query, suggest same-type cards from other labs. */
function Picker({ models, labs, other, onPick }: { models: Model[]; labs: Labs; other: Model; onPick: (key: string) => void }) {
  const [q, setQ] = useState('');
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = models
    .filter((m) => m.key !== other.key && m.status !== 'deprecated')
    .filter((m) => (terms.length ? terms.every((t) => `${m.name} ${labs[m.lab].name}`.toLowerCase().includes(t)) : m.type === other.type && m.lab !== other.lab))
    .slice(0, 40);
  return (
    <div className={binder.labPicker}>
      <label className={binder.labFind}>
        <Icon name="search" />
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card" aria-label="Find a card" autoComplete="off" spellCheck={false} />
      </label>
      {!terms.length && <p className={styles.pickerHint}>{TYPE_LABEL[other.type]} models from other labs</p>}
      <div className={`${binder.list} ${styles.pickerList}`}>
        {list.map((m) => (
          <Option key={m.key} selected={false} label={m.name} hint={`${labs[m.lab].name} · ${TYPE_LABEL[m.type]}`} dot={labs[m.lab].color} onClick={() => onPick(m.key)} />
        ))}
      </div>
      {list.length === 0 && <p className={binder.none}>No card called “{q}”.</p>}
    </div>
  );
}

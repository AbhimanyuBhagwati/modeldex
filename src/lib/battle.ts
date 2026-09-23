import { INPUT_ONLY, formatCount, formatDate, formatMonth, formatParams, formatPrice, formatTokens } from './format';
import type { Model } from './types';

export const MAX_HP = 100;

interface Stat {
  key: string;
  /** What the round compares. */
  label: string;
  /** The attack the round's winner uses. */
  move: string;
  better: 'high' | 'low';
  value: (m: Model) => number | null;
  format: (m: Model) => string;
  /** How far apart two values are, from 0 (a hair) to 1 (a rout). */
  gap: (a: number, b: number) => number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Ratio-based gap: `span` times bigger is a rout. */
const ratio = (span: number, floor = 0) => (a: number, b: number) => clamp(Math.abs(Math.log((a + floor) / (b + floor))) / Math.log(span));
const linear = (span: number) => (a: number, b: number) => clamp(Math.abs(a - b) / span);
const days = (s: string | null) => (s ? Date.parse(`${s.length === 7 ? `${s}-01` : s}T00:00:00Z`) / 864e5 : null);
const outputPrice = (m: Model) => (INPUT_ONLY.has(m.type) && !m.price?.output ? null : (m.price?.output ?? null));
const skills = (m: Model) => [m.reasoning, m.toolCall, m.structuredOutput, m.attachment].filter(Boolean).length + m.input.length + m.output.length;

/** Every round a battle can have, in the order they're fought. A round is skipped when either card lacks the stat. */
export const STATS: Stat[] = [
  { key: 'context', label: 'Context window', move: 'Memory Slam', better: 'high', value: (m) => m.context, format: (m) => formatTokens(m.context), gap: ratio(16) },
  { key: 'output', label: 'Max output', move: 'Word Flood', better: 'high', value: (m) => m.maxOutput, format: (m) => formatTokens(m.maxOutput), gap: ratio(16) },
  { key: 'price', label: 'Output price', move: 'Bargain Blast', better: 'low', value: outputPrice, format: (m) => formatPrice(outputPrice(m)), gap: ratio(40, 0.05) },
  { key: 'fresh', label: 'Release date', move: 'Fresh Strike', better: 'high', value: (m) => days(m.releaseDate), format: (m) => formatDate(m.releaseDate), gap: linear(730) },
  { key: 'knowledge', label: 'Knowledge cutoff', move: 'Total Recall', better: 'high', value: (m) => days(m.knowledge), format: (m) => formatMonth(m.knowledge), gap: linear(540) },
  { key: 'skills', label: 'Skills', move: 'Skill Combo', better: 'high', value: skills, format: (m) => `${skills(m)} skills`, gap: linear(5) },
  { key: 'size', label: 'Parameters', move: 'Heavy Hitter', better: 'high', value: (m) => m.hub?.params ?? null, format: (m) => formatParams(m.hub?.params), gap: ratio(100) },
  { key: 'crowd', label: 'Downloads', move: 'Crowd Surge', better: 'high', value: (m) => m.hub?.downloads ?? null, format: (m) => `${formatCount(m.hub?.downloads)}/mo`, gap: ratio(100, 1) },
];

export type Side = 0 | 1;

export interface Round {
  stat: string;
  label: string;
  move: string;
  values: [string, string];
  /** Who won the round, or null for a stalemate. */
  winner: Side | null;
  damage: number;
  effect: 'super' | 'weak' | null;
  /** HP after this round. */
  hp: [number, number];
}

export interface BattleResult {
  rounds: Round[];
  winner: Side | null;
  /** The loser ran out of HP before the rounds did. */
  ko: boolean;
  hp: [number, number];
}

/**
 * Two cards trade blows stat by stat. The better card in each round hits for 12 to 36,
 * more the wider the gap. Deterministic, so a shared link replays the same fight.
 */
export function battle(a: Model, b: Model): BattleResult {
  const hp: [number, number] = [MAX_HP, MAX_HP];
  const rounds: Round[] = [];
  let ko = false;
  for (const s of STATS) {
    const va = s.value(a);
    const vb = s.value(b);
    if (va == null || vb == null) continue;
    const gap = va === vb ? 0 : s.gap(va, vb);
    const winner: Side | null = gap < 0.02 ? null : (s.better === 'high' ? va > vb : va < vb) ? 0 : 1;
    const damage = winner == null ? 0 : Math.round(12 + 24 * gap);
    if (winner != null) hp[winner === 0 ? 1 : 0] = Math.max(0, hp[winner === 0 ? 1 : 0] - damage);
    rounds.push({
      stat: s.key,
      label: s.label,
      move: s.move,
      values: [s.format(a), s.format(b)],
      winner,
      damage,
      effect: winner == null ? null : gap >= 0.66 ? 'super' : gap <= 0.15 ? 'weak' : null,
      hp: [hp[0], hp[1]],
    });
    if (hp[0] === 0 || hp[1] === 0) {
      ko = true;
      break;
    }
  }
  const winner: Side | null = hp[0] === hp[1] ? null : hp[0] > hp[1] ? 0 : 1;
  return { rounds, winner, ko, hp };
}

/** A fair opponent for `m`: same type, another lab, still offered. `rand` picks among the candidates. */
export function pickOpponent(m: Model, pool: Model[], rand: () => number): Model | undefined {
  const same = pool.filter((x) => x.type === m.type && x.lab !== m.lab && x.status !== 'deprecated');
  const list = same.length ? same : pool.filter((x) => x.key !== m.key && x.status !== 'deprecated');
  return list[Math.floor(rand() * list.length)];
}

/** Two random cards that make sense together. */
export function randomMatchup(pool: Model[], rand: () => number): [Model, Model] | null {
  const live = pool.filter((m) => m.status !== 'deprecated');
  for (let tries = 0; tries < 20; tries++) {
    const a = live[Math.floor(rand() * live.length)];
    const b = a && pickOpponent(a, live, rand);
    if (a && b && b.key !== a.key) return [a, b];
  }
  return null;
}

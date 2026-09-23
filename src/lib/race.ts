/**
 * Race the machine: you type a passage while models "type" it at the speed Hugging Face measured.
 * A model starts after its first-token delay, then writes at its measured tokens a second.
 * One token is about four characters of English, so that's the conversion used throughout.
 */

export const CHARS_PER_TOKEN = 4;
export const MAX_RACERS = 3;

export interface Racer {
  key: string;
  name: string;
  lab: string;
  /** Tokens a second on its fastest Hugging Face host. */
  speed: number;
  /** Time to first token on that host, in milliseconds. */
  latencyMs: number;
  /** The host it was timed on. */
  host: string;
  url: string;
}

/** Characters written by `ms` after the start. */
export function charsAt(r: Pick<Racer, 'speed' | 'latencyMs'>, ms: number, length: number): number {
  if (ms <= r.latencyMs) return 0;
  return Math.min(length, Math.floor(((ms - r.latencyMs) / 1000) * r.speed * CHARS_PER_TOKEN));
}

/** When it finishes the passage, in milliseconds. */
export const finishMs = (r: Pick<Racer, 'speed' | 'latencyMs'>, length: number) => r.latencyMs + (length / (r.speed * CHARS_PER_TOKEN)) * 1000;

/** Your speed in tokens a second, from correct characters and elapsed time. */
export const tokensPerSecond = (chars: number, ms: number) => (ms > 0 ? chars / CHARS_PER_TOKEN / (ms / 1000) : 0);

/** The fastest, the middle, and the slowest, from three different labs where possible: a real race. */
export function defaultLineup(racers: Racer[]): Racer[] {
  const bySpeed = [...racers].sort((a, b) => b.speed - a.speed || a.key.localeCompare(b.key));
  if (bySpeed.length <= MAX_RACERS) return bySpeed;
  const picks: Racer[] = [];
  const tryAdd = (list: Racer[]) => {
    const r = list.find((x) => !picks.includes(x) && !picks.some((p) => p.lab === x.lab));
    if (r) picks.push(r);
  };
  tryAdd(bySpeed);
  const mid = Math.floor(bySpeed.length / 2);
  tryAdd([...bySpeed.slice(mid), ...bySpeed.slice(0, mid).reverse()]);
  tryAdd([...bySpeed].reverse());
  return picks.sort((a, b) => b.speed - a.speed);
}

/** Racers named in `?r=`, topped up with the fastest and then the slowest from other labs, for the most dramatic race. */
export function lineupFrom(param: string | null, racers: Racer[]): Racer[] {
  const byKey = new Map(racers.map((r) => [r.key, r]));
  const chosen = [...new Set((param ?? '').split(',').filter((k) => byKey.has(k)))].slice(0, MAX_RACERS).map((k) => byKey.get(k)!);
  const fill = defaultLineup(racers.filter((x) => !chosen.includes(x) && !chosen.some((c) => c.lab === x.lab)));
  for (const r of [fill[0], fill[fill.length - 1], ...fill.slice(1, -1)].filter(Boolean)) {
    if (chosen.length >= MAX_RACERS) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  return chosen.sort((a, b) => b.speed - a.speed);
}

/** Short, original passages: plain words and straight punctuation anyone can type, about forty words each. */
export const PASSAGES = [
  'A small robot found a map in the attic. It showed a river, a bridge, and a door with no handle. The robot packed a flashlight and a sandwich it could not eat, and set off to find the door.',
  'Every morning the baker counts the loaves twice. The first count is for the shop and the second is for luck. Nobody knows what happens on the day the two numbers do not match.',
  'The lighthouse keeper taught her cat to read the tides. Low water meant a walk on the rocks and high water meant a nap by the lamp. The cat preferred high water, and said so loudly.',
  'Our team built a kite from old maps and fishing line. It flew higher than the church and lower than the geese. When the wind dropped, it landed gently in the tomato garden behind the town hall.',
  'On the last train home a stranger offered me half an orange. We talked about rivers, rainy summers, and the best way to fold a map. I never learned her name, but I still fold maps her way.',
];

export interface Result {
  racer: Racer;
  finish: number;
  /** How many times faster than you. */
  times: number;
  /** You pressed your first correct key before it wrote a character. */
  beatToFirst: boolean;
}

export function results(racers: Racer[], length: number, you: { ms: number; firstMs: number | null; chars: number }): Result[] {
  const yours = tokensPerSecond(you.chars, you.ms);
  return racers
    .map((racer) => ({
      racer,
      finish: finishMs(racer, length),
      times: yours > 0 ? racer.speed / yours : Number.POSITIVE_INFINITY,
      beatToFirst: you.firstMs != null && you.firstMs < racer.latencyMs,
    }))
    .sort((a, b) => a.finish - b.finish);
}

/** "While you typed that, X could have written about 12,000 words." Words are three quarters of a token. */
export const wordsIn = (racer: Pick<Racer, 'speed' | 'latencyMs'>, ms: number) => Math.max(0, Math.round(((ms - racer.latencyMs) / 1000) * racer.speed * 0.75));

import { describe, expect, it } from 'vitest';
import { CHARS_PER_TOKEN, charsAt, defaultLineup, finishMs, lineupFrom, results, tokensPerSecond, wordsIn, type Racer } from './race';

const racer = (key: string, lab: string, speed: number, latencyMs = 500): Racer => ({ key, name: key, lab, speed, latencyMs, host: 'Host', url: 'https://huggingface.co/x' });
const pool = [racer('a/fast', 'a', 1000, 150), racer('a/fast2', 'a', 900), racer('b/mid', 'b', 100), racer('c/mid2', 'c', 80), racer('d/slow', 'd', 12, 700)];

describe('a racer types', () => {
  it('nothing until its first token, then four characters a token', () => {
    const r = racer('x/y', 'x', 10, 500);
    expect(charsAt(r, 400, 200)).toBe(0);
    expect(charsAt(r, 1500, 200)).toBe(10 * CHARS_PER_TOKEN);
    expect(charsAt(r, 99_000, 200)).toBe(200);
    expect(finishMs(r, 200)).toBe(5500);
  });
});

describe('lineups', () => {
  it('default to the fastest, the middle, and the slowest, from different labs', () => {
    expect(defaultLineup(pool).map((r) => r.key)).toEqual(['a/fast', 'b/mid', 'd/slow']);
  });
  it('take racers from the link first, then fill from other labs, ignoring junk', () => {
    expect(lineupFrom('c/mid2,nope/x', pool).map((r) => r.key)).toEqual(['a/fast', 'c/mid2', 'd/slow']);
    expect(lineupFrom(null, pool)).toHaveLength(3);
  });
});

describe('results', () => {
  it('rank by finish time and compare with you', () => {
    const board = results([pool[4], pool[0]], 200, { ms: 40_000, firstMs: 300, chars: 200 });
    expect(board.map((b) => b.racer.key)).toEqual(['a/fast', 'd/slow']);
    const yours = tokensPerSecond(200, 40_000);
    expect(yours).toBe(1.25);
    expect(board[0].times).toBe(800);
    expect(board[0].beatToFirst).toBe(false);
    expect(board[1].beatToFirst).toBe(true);
  });
  it('count the words a racer could have written meanwhile', () => {
    expect(wordsIn(racer('x/y', 'x', 100, 0), 10_000)).toBe(750);
  });
});

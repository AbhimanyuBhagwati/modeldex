import { describe, expect, it } from 'vitest';
import { initialPlayback, playbackReducer, type PlaybackState } from './playback';

const start = (state: PlaybackState = initialPlayback, from = 0, auto = false) => playbackReducer(state, { type: 'start', from, total: 5, auto });

describe('evolution playback', () => {
  it('keeps the old stage until reveal, then preserves the new stage and report after completion', () => {
    let state = start();
    const id = state.journey!.id;
    expect(state).toMatchObject({ picked: 0, report: null, phase: 'charge', journey: { from: 0, to: 1 } });
    for (const phase of ['transform', 'collapse'] as const) {
      state = playbackReducer(state, { type: 'phase', id, phase });
      expect(state.picked).toBe(0);
      expect(state.report).toBeNull();
    }
    state = playbackReducer(state, { type: 'phase', id, phase: 'reveal' });
    expect(state).toMatchObject({ picked: 1, report: 1, phase: 'reveal' });
    state = playbackReducer(state, { type: 'finish', id });
    expect(state).toMatchObject({ picked: 1, report: 1, phase: 'idle', journey: null, auto: false });
  });

  it('ignores cancelled callbacks even after another evolution has started', () => {
    const playing = start(initialPlayback, 0, true);
    const oldId = playing.journey!.id;
    const skipped = playbackReducer(playing, { type: 'settle', index: 1 });
    expect(skipped).toMatchObject({ picked: 1, phase: 'idle', journey: null, report: 1, auto: false });
    expect(playbackReducer(skipped, { type: 'phase', id: oldId, phase: 'reveal' })).toBe(skipped);
    expect(playbackReducer(skipped, { type: 'finish', id: oldId })).toBe(skipped);

    const restarted = start(skipped, 1);
    expect(restarted.journey!.id).toBeGreaterThan(oldId);
    expect(playbackReducer(restarted, { type: 'phase', id: oldId, phase: 'reveal' })).toBe(restarted);
    expect(playbackReducer(restarted, { type: 'finish', id: oldId })).toBe(restarted);
  });

  it('can immediately complete for reduced motion without losing autoplay intent', () => {
    const playing = start(initialPlayback, 1, true);
    const finished = playbackReducer(playing, { type: 'finish', id: playing.journey!.id });
    expect(finished).toMatchObject({ picked: 2, report: 2, phase: 'idle', journey: null, auto: true });
    expect(start(finished, 2, false).auto).toBe(false);
  });

  it('can stop autoplay while allowing the current transformation to finish', () => {
    const playing = start(initialPlayback, 0, true);
    const paused = playbackReducer(playing, { type: 'stopAuto' });
    expect(paused.journey).toBe(playing.journey);
    expect(paused.phase).toBe('charge');
    const finished = playbackReducer(paused, { type: 'finish', id: playing.journey!.id });
    expect(finished).toMatchObject({ picked: 1, auto: false, phase: 'idle' });
  });

  it('does not regress if an earlier phase arrives after the reveal', () => {
    const playing = start();
    const id = playing.journey!.id;
    const revealed = playbackReducer(playing, { type: 'phase', id, phase: 'reveal' });
    expect(playbackReducer(revealed, { type: 'phase', id, phase: 'collapse' })).toBe(revealed);
    expect(playbackReducer(revealed, { type: 'phase', id, phase: 'reveal' })).toBe(revealed);
  });

  it('resets the first stage without leaving an old evolution report or autoplay enabled', () => {
    const playing = start(initialPlayback, 2, true);
    expect(playbackReducer(playing, { type: 'settle', index: 0 })).toMatchObject({ picked: 0, report: null, auto: false, phase: 'idle', journey: null });
  });

  it.each([
    { from: -1, total: 5 },
    { from: 4, total: 5 },
    { from: 8, total: 5 },
    { from: 0, total: 1 },
    { from: 0, total: 0 },
    { from: 0.5, total: 5 },
    { from: 0, total: 5.5 },
    { from: Number.NaN, total: 5 },
    { from: 0, total: Number.POSITIVE_INFINITY },
  ])('ignores an invalid start: $from of $total', ({ from, total }) => {
    expect(playbackReducer(initialPlayback, { type: 'start', from, total, auto: true })).toBe(initialPlayback);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('ignores an invalid selected index: %s', (index) => {
    const playing = start();
    expect(playbackReducer(playing, { type: 'settle', index })).toBe(playing);
  });
});

import { describe, expect, it } from 'vitest';
import type { Dataset, Model } from '@/lib/types';
import { changeEvents, diffDatasets, mergeChangeLog } from './diff';
import { changeLogSchema } from './schema';

const model = (key: string, over: Partial<Model> = {}) =>
  ({ key, name: key, lab: key.split('/')[0], type: 'text', price: { input: 1, output: 4, cacheRead: null, cacheWrite: null }, context: 1000, maxOutput: 100, status: null, license: { name: 'MIT', source: 'lab-default' }, input: ['text'], output: ['text'], ...over }) as Model;
const data = (models: Model[]) => ({ models }) as Dataset;

describe('changeEvents', () => {
  const before = data([model('a/keep'), model('a/cheaper'), model('a/gone'), model('a/retiring')]);
  const after = data([
    model('a/keep'),
    model('a/cheaper', { price: { input: 0.5, output: 2, cacheRead: null, cacheWrite: null } }),
    model('a/retiring', { status: 'deprecated' }),
    model('b/new'),
  ]);

  it('turns a sync’s diff into dated events', () => {
    const events = changeEvents(before, diffDatasets(before, after), '2026-09-23');
    expect(events.map((e) => `${e.kind} ${e.key}`).sort()).toEqual(['added b/new', 'price a/cheaper', 'removed a/gone', 'retired a/retiring']);
    expect(events.find((e) => e.kind === 'price')).toMatchObject({ before: { input: 1, output: 4 }, after: { input: 0.5, output: 2 } });
  });

  it('logs nothing on the first sync, when everything would look new', () => {
    expect(changeEvents(null, diffDatasets(null, after), '2026-09-23')).toEqual([]);
  });
});

describe('mergeChangeLog', () => {
  it('puts the newest first and forgets events past the window', () => {
    const log = { version: 1 as const, events: [{ date: '2026-05-01', kind: 'added' as const, key: 'a/x', name: 'x', lab: 'a' }, { date: '2026-09-20', kind: 'added' as const, key: 'a/y', name: 'y', lab: 'a' }] };
    const merged = mergeChangeLog(log, [{ date: '2026-09-23', kind: 'removed', key: 'a/z', name: 'z', lab: 'a' }], '2026-09-23');
    expect(merged.events.map((e) => e.key)).toEqual(['a/z', 'a/y']);
    expect(changeLogSchema.safeParse(merged).success).toBe(true);
  });
});

import type { Dataset, Model } from '@/lib/types';

export interface Change {
  model: Model;
  fields: string[];
}

export interface DatasetDiff {
  added: Model[];
  removed: Model[];
  changed: Change[];
}

const WATCHED: [string, (m: Model) => unknown][] = [
  ['name', (m) => m.name],
  ['type', (m) => m.type],
  ['price', (m) => m.price],
  ['context', (m) => m.context],
  ['max output', (m) => m.maxOutput],
  ['status', (m) => m.status],
  ['license', (m) => m.license.name],
  ['modalities', (m) => [m.input, m.output]],
];

export function diffDatasets(prev: Dataset | null, next: Dataset): DatasetDiff {
  const before = new Map((prev?.models ?? []).map((m) => [m.key, m]));
  const after = new Map(next.models.map((m) => [m.key, m]));
  const added = next.models.filter((m) => !before.has(m.key));
  const removed = (prev?.models ?? []).filter((m) => !after.has(m.key));
  const changed: Change[] = [];
  for (const m of next.models) {
    const old = before.get(m.key);
    if (!old) continue;
    const fields = WATCHED.filter(([, get]) => JSON.stringify(get(old)) !== JSON.stringify(get(m))).map(([f]) => f);
    if (fields.length) changed.push({ model: m, fields });
  }
  return { added, removed, changed };
}

/** True when nothing but the timestamp differs. */
export const sameContent = (a: Dataset, b: Dataset) =>
  JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' });

export function summarize(d: DatasetDiff): string {
  const parts = [
    d.added.length && `${d.added.length} new`,
    d.removed.length && `${d.removed.length} removed`,
    d.changed.length && `${d.changed.length} updated`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'metadata refresh';
}

export function markdownReport(d: DatasetDiff, next: Dataset, notes: string[]): string {
  const lines = [`## Model sync: ${summarize(d)}`, '', `${next.models.length} models from ${next.labs.length} labs.`, ''];
  const list = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`### ${title}`, '', ...items.slice(0, 50).map((i) => `- ${i}`));
    if (items.length > 50) lines.push(`- …and ${items.length - 50} more`);
    lines.push('');
  };
  list('New', d.added.map((m) => `${m.name} (\`${m.key}\`)`));
  list('Removed', d.removed.map((m) => `${m.name} (\`${m.key}\`)`));
  list('Updated', d.changed.map((c) => `${c.model.name}: ${c.fields.join(', ')}`));
  list('Notes', notes);
  return lines.join('\n');
}

'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Card } from '@/components/card/Card';
import { Icon } from '@/components/icons';
import { CAPS, DEFAULT_FILTERS, applyFilters, filtersFromParams, filtersToParams, isFiltered, type Cap, type Filters, type SortKey } from '@/lib/filter';
import { ACCESS_LABEL, TYPE_HINT, TYPE_LABEL } from '@/lib/format';
import { MODEL_TYPES, type Access, type LabSummary, type Model } from '@/lib/types';
import styles from './Binder.module.css';
import { Menu, Option } from './Menu';

const ACCESS_OPTIONS: { value: 'all' | Access; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free' },
  { value: 'open', label: 'Open weights' },
  { value: 'paid', label: 'Paid' },
];
const SORT_OPTIONS: { value: SortKey; label: string; short: string }[] = [
  { value: 'newest', label: 'Newest first', short: 'Newest' },
  { value: 'quality', label: 'Best rated', short: 'Rated' },
  { value: 'popular', label: 'Most downloaded', short: 'Popular' },
  { value: 'rarest', label: 'Rarest first', short: 'Rarest' },
  { value: 'cheapest', label: 'Cheapest output', short: 'Cheapest' },
  { value: 'context', label: 'Most context', short: 'Context' },
  { value: 'set', label: 'Set number', short: 'Set no.' },
];
const CAP_LABEL: Record<Cap, string> = { reasoning: 'Reasoning', vision: 'Vision', tools: 'Tools' };
/** Cards rendered per step. The rest arrive as you scroll, so a thousand cards never render at once. */
const PAGE = 48;

interface Props {
  models: Model[];
  labs: LabSummary[];
  setSize: number;
  refDate: string;
}

/** The URL is the filter state, so a filtered binder is always a shareable link. */
const urlListeners = new Set<() => void>();
function subscribeUrl(listener: () => void) {
  urlListeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    urlListeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}
const readSearch = () => window.location.search;
const serverSearch = () => '';
function writeFilters(f: Filters) {
  const qs = filtersToParams(f).toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', next);
  urlListeners.forEach((l) => l());
}

export function Binder({ models, labs, setSize, refDate }: Props) {
  const labKeys = useMemo(() => labs.map((l) => l.key), [labs]);
  const search = useSyncExternalStore(subscribeUrl, readSearch, serverSearch);
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(search), labKeys), [search, labKeys]);
  const query = useDeferredValue(filters.q);
  const searchRef = useRef<HTMLInputElement>(null);

  const labByKey = useMemo(() => Object.fromEntries(labs.map((l) => [l.key, l])), [labs]);
  const labNames = useMemo(() => Object.fromEntries(labs.map((l) => [l.key, l.name])), [labs]);
  const retiredCount = useMemo(() => models.filter((m) => m.status === 'deprecated').length, [models]);
  const visible = useMemo(() => applyFilters(models, { ...filters, q: query }, labNames), [models, filters, query, labNames]);
  const liveTotal = models.length - retiredCount;
  const pool = filters.retired ? models.length : liveTotal;

  // How far you've scrolled belongs to one set of filters; change them and the binder starts from the top again.
  const view = filtersToParams({ ...filters, q: query }).toString();
  const [shown, setShown] = useState({ view: '', count: PAGE });
  const limit = shown.view === view ? shown.count : PAGE;
  const showMore = useCallback(() => setShown({ view, count: limit + PAGE }), [view, limit]);
  const sentinel = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && showMore(), { rootMargin: '900px 0px' });
      io.observe(el);
      return () => io.disconnect();
    },
    [showMore],
  );

  // Each menu counts within the other's choice: picking Image leaves only labs that make image models.
  const counts = useMemo(() => {
    const type: Record<string, number> = {};
    const lab: Record<string, number> = {};
    for (const m of models) {
      if (!filters.retired && m.status === 'deprecated') continue;
      if (filters.lab === 'all' || m.lab === filters.lab) type[m.type] = (type[m.type] ?? 0) + 1;
      if (filters.type === 'all' || m.type === filters.type) lab[m.lab] = (lab[m.lab] ?? 0) + 1;
    }
    return { type, lab, typeTotal: Object.values(type).reduce((a, b) => a + b, 0), labTotal: Object.values(lab).reduce((a, b) => a + b, 0) };
  }, [models, filters.retired, filters.lab, filters.type]);
  const labOrder = useMemo(() => [...labs].sort((a, b) => (counts.lab[b.key] ?? 0) - (counts.lab[a.key] ?? 0) || a.name.localeCompare(b.name)), [labs, counts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Read the live URL, not the render's copy, so back-to-back changes never overwrite each other.
  const current = () => filtersFromParams(new URLSearchParams(window.location.search), labKeys);
  const update = (patch: (f: Filters) => Partial<Filters>) => {
    const f = current();
    writeFilters({ ...f, ...patch(f) });
  };
  const toggleCap = (c: Cap) => update((f) => ({ caps: f.caps.includes(c) ? f.caps.filter((x) => x !== c) : [...f.caps, c] }));
  const reset = () => update((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }));

  const lab = filters.lab === 'all' ? null : labByKey[filters.lab];
  const extras = (filters.access !== 'all' ? 1 : 0) + filters.caps.length + (filters.retired ? 1 : 0);

  const tags: { key: string; label: string; dot?: string; remove: () => void }[] = [];
  if (filters.type !== 'all') tags.push({ key: 'type', label: TYPE_LABEL[filters.type], remove: () => update(() => ({ type: 'all' })) });
  if (lab) tags.push({ key: 'lab', label: lab.name, dot: lab.color, remove: () => update(() => ({ lab: 'all' })) });
  if (filters.access !== 'all') tags.push({ key: 'access', label: ACCESS_LABEL[filters.access], remove: () => update(() => ({ access: 'all' })) });
  for (const c of filters.caps) tags.push({ key: `cap-${c}`, label: CAP_LABEL[c], remove: () => toggleCap(c) });
  if (filters.retired) tags.push({ key: 'retired', label: 'Including retired', remove: () => update(() => ({ retired: false })) });

  const countLabel = visible.length === pool ? `${pool} cards` : `${visible.length} of ${pool} cards`;

  return (
    <section id="binder" className={styles.binder} aria-labelledby="binder-title">
      <div className={styles.rail} role="search">
        <label className={styles.search}>
          <Icon name="search" />
          <input
            ref={searchRef}
            id="binder-search"
            type="search"
            value={filters.q}
            onChange={(e) => {
              const q = e.target.value;
              update(() => ({ q }));
            }}
            placeholder={`Search ${models.length} models`}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search models or labs"
          />
          <kbd aria-hidden="true">/</kbd>
        </label>

        <div className={styles.controls}>
          <Menu label="Type" value={filters.type === 'all' ? null : TYPE_LABEL[filters.type]} active={filters.type !== 'all'} width={330}>
            {(close) => (
              <div className={styles.list}>
                <Option selected={filters.type === 'all'} label="All types" count={counts.typeTotal} onClick={() => {
                    update(() => ({ type: 'all' }));
                    close();
                  }} />
                {MODEL_TYPES.filter((t) => counts.type[t]).map((t) => (
                  <Option key={t} selected={filters.type === t} label={TYPE_LABEL[t]} hint={TYPE_HINT[t]} count={counts.type[t]} onClick={() => {
                    update(() => ({ type: t }));
                    close();
                  }} />
                ))}
              </div>
            )}
          </Menu>

          <Menu label="Lab" value={lab?.name ?? null} dot={lab?.color} active={!!lab} width={460}>
            {(close) => (
              <LabPicker
                labs={labOrder}
                counts={counts.lab}
                total={counts.labTotal}
                value={filters.lab}
                onPick={(key) => {
                  update(() => ({ lab: key }));
                  close();
                }}
              />
            )}
          </Menu>

          <Menu label="Filters" icon="sliders" badge={extras} active={extras > 0} width={330} align="end">
            {() => (
              <div className={styles.filterPanel}>
                <div>
                  <p className={styles.panelLabel}>Access</p>
                  <Segmented value={filters.access} onChange={(access) => update(() => ({ access }))} />
                </div>
                <div>
                  <p className={styles.panelLabel}>Can do</p>
                  <div className={styles.capChips}>
                    {CAPS.map((c) => (
                      <button key={c} type="button" className="chip" aria-pressed={filters.caps.includes(c)} onClick={() => toggleCap(c)}>
                        {CAP_LABEL[c]}
                      </button>
                    ))}
                  </div>
                </div>
                {retiredCount > 0 && (
                  <button type="button" role="switch" aria-checked={filters.retired} className={styles.switchRow} onClick={() => update((f) => ({ retired: !f.retired }))}>
                    <span>
                      Show retired models
                      <small>{retiredCount} no longer offered</small>
                    </span>
                    <span className={styles.switch} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Menu>

          <Menu label="Sort" icon="sort" value={SORT_OPTIONS.find((o) => o.value === filters.sort)!.short} width={220} align="end">
            {(close) => (
              <div className={styles.list}>
                {SORT_OPTIONS.map((o) => (
                  <Option key={o.value} selected={filters.sort === o.value} label={o.label} onClick={() => {
                    update(() => ({ sort: o.value }));
                    close();
                  }} />
                ))}
              </div>
            )}
          </Menu>
        </div>
      </div>

      <div className={styles.results}>
        <h2 id="binder-title" className={styles.heading}>The binder</h2>
        <p className={styles.count} aria-live="polite">
          {countLabel}
        </p>
        {tags.length > 0 && (
          <ul className={styles.tags} aria-label="Active filters">
            {tags.map((t) => (
              <li key={t.key}>
                <button type="button" className={styles.tag} onClick={t.remove} aria-label={`Remove filter: ${t.label}`}>
                  {t.dot && <span className={styles.tagDot} style={{ '--t': t.dot } as CSSProperties} />}
                  {t.label}
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {isFiltered(filters) && (
          <button type="button" className={styles.clear} onClick={reset}>
            Clear all
          </button>
        )}
      </div>

      {visible.length > 0 ? (
        <>
          <div className={styles.grid} aria-busy={query !== filters.q}>
            {visible.slice(0, limit).map((m) => (
              <Card key={m.key} model={m} lab={labByKey[m.lab]} setSize={setSize} refDate={refDate} />
            ))}
          </div>
          {visible.length > limit && (
            <div ref={sentinel} className={styles.more}>
              <button type="button" className="btn" onClick={showMore}>
                Show more cards
                <small>{visible.length - limit} left</small>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.empty}>
          <p>No cards match those filters.</p>
          <button type="button" className="btn" onClick={reset}>
            Clear all filters
          </button>
        </div>
      )}
    </section>
  );
}

function LabPicker({ labs, counts, total, value, onPick }: { labs: LabSummary[]; counts: Record<string, number>; total: number; value: string; onPick: (key: string) => void }) {
  const [find, setFind] = useState('');
  const shown = labs.filter((l) => (counts[l.key] ?? 0) > 0 && l.name.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <div className={styles.labPicker}>
      <label className={styles.labFind}>
        <Icon name="search" />
        <input type="text" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a lab" aria-label="Find a lab" autoComplete="off" spellCheck={false} />
      </label>
      {!find && <Option selected={value === 'all'} label="All labs" count={total} onClick={() => onPick('all')} />}
      <div className={styles.labGrid}>
        {shown.map((l) => (
          <Option key={l.key} selected={value === l.key} label={l.name} dot={l.color} count={counts[l.key]} onClick={() => onPick(l.key)} />
        ))}
      </div>
      {shown.length === 0 && <p className={styles.none}>No lab called “{find}”.</p>}
    </div>
  );
}

function Segmented({ value, onChange }: { value: Filters['access']; onChange: (v: Filters['access']) => void }) {
  const selected = ACCESS_OPTIONS.findIndex((option) => option.value === value);

  return (
    <div className={styles.seg} role="group" aria-label="Access" style={{ '--segment': selected } as CSSProperties}>
      <span className={styles.pill} aria-hidden="true" />
      {ACCESS_OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

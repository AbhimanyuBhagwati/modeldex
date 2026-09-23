'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import styles from './Binder.module.css';

interface MenuProps {
  label: string;
  /** Shown instead of the label once something is chosen. */
  value?: string | null;
  /** Highlights the trigger when this menu is narrowing the results. */
  active?: boolean;
  icon?: IconName;
  dot?: string;
  badge?: number;
  align?: 'start' | 'end';
  width?: number;
  /** Receives `close` so single-choice menus can shut on pick. */
  children: (close: () => void) => ReactNode;
}

/** A trigger button with a floating panel. Escape or a click outside closes it. */
export function Menu({ label, value, active = false, icon, dot, badge, align = 'start', width = 280, children }: MenuProps) {
  const [state, setState] = useState<'closed' | 'open' | 'closing' | 'returning'>('closed');
  const open = state === 'open';
  const [side, setSide] = useState(align);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const dismiss = useCallback((restoreFocus: boolean) => setState(restoreFocus ? 'returning' : 'closing'), []);
  const close = useCallback(() => setState('returning'), []);

  useEffect(() => {
    if (state !== 'closing' && state !== 'returning') return;
    if (state === 'returning') trigger.current?.focus({ preventScroll: true });
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120;
    const timer = setTimeout(() => setState('closed'), duration);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) dismiss(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss(true);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKey);
    const content = panel.current;
    const first = content?.querySelector<HTMLElement>('input')
      ?? content?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]')
      ?? content?.querySelector<HTMLElement>('button');
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, dismiss]);

  return (
    <div ref={wrap} className={styles.menu}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-label={value ? `${label}: ${value}` : label}
        data-active={active}
        onClick={(e) => {
          if (!open) {
            // Open toward whichever side has room, so a panel never runs off the screen.
            const r = e.currentTarget.getBoundingClientRect();
            const fitsStart = r.left + width <= window.innerWidth - 16;
            const fitsEnd = r.right - width >= 16;
            setSide(align === 'start' ? (fitsStart || !fitsEnd ? 'start' : 'end') : fitsEnd || !fitsStart ? 'end' : 'start');
          }
          if (open) dismiss(true);
          else {
            setState('open');
          }
        }}
      >
        {icon && <Icon name={icon} className={styles.triggerIcon} />}
        {dot && <span className={styles.triggerDot} style={{ '--t': dot } as CSSProperties} />}
        <span className={styles.triggerText}>{value ?? label}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
        <Icon name="chev" className={styles.chev} />
      </button>
      {state !== 'closed' && (
        <div ref={panel} id={id} className={styles.panel} data-state={open ? 'open' : 'closing'} inert={!open} aria-hidden={!open} data-align={side} style={{ width }} role="dialog" aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function Option({ selected, label, hint, count, dot, onClick }: { selected: boolean; label: string; hint?: string; count?: number; dot?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.option} aria-pressed={selected} onClick={onClick}>
      <Icon name="check" className={styles.optionCheck} />
      {dot && <span className={styles.optionDot} style={{ '--t': dot } as CSSProperties} />}
      <span className={styles.optionText}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      {count != null && <span className={styles.optionCount}>{count}</span>}
    </button>
  );
}

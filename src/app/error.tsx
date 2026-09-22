'use client';

import Link from 'next/link';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page" style={{ display: 'grid', justifyItems: 'start', gap: 16, paddingBlock: '80px 120px' }}>
      <p className="eyebrow">Something went wrong</p>
      <h1 style={{ margin: 0, fontWeight: 850, fontStretch: '112%', fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 1, letterSpacing: '-0.03em' }}>
        This page didn’t load.
      </h1>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>Try again, or head back to the binder.</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-gold" onClick={reset}>
          Try again
        </button>
        <Link className="btn" href="/">
          Back to the binder
        </Link>
      </div>
    </main>
  );
}

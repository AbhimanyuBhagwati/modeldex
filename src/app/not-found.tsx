import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset } from '@/lib/data';

export default function NotFound() {
  const { updatedAt } = getDataset();
  return (
    <>
      <SiteHeader updatedAt={updatedAt} />
      <main className="page" style={{ display: 'grid', justifyItems: 'start', gap: 16, paddingBlock: '80px 120px' }}>
        <p className="eyebrow">Error 404</p>
        <h1 style={{ margin: 0, fontWeight: 850, fontStretch: '112%', fontSize: 'clamp(34px, 5vw, 60px)', lineHeight: 1, letterSpacing: '-0.03em' }}>
          That card isn’t in the binder.
        </h1>
        <p style={{ margin: 0, color: 'var(--ink-2)', maxWidth: '48ch' }}>
          The link may point to a model that was renamed or retired upstream. Search the binder to find it.
        </p>
        <Link className="btn btn-gold" href="/#binder">
          Browse the binder
        </Link>
      </main>
      <SiteFooter updatedAt={updatedAt} />
    </>
  );
}

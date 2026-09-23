import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { CompareNavLink } from './client-bits';
import styles from './chrome.module.css';

export function SiteHeader({ updatedAt }: { updatedAt: string }) {
  return (
    <header className={styles.header}>
      <Link className={styles.wordmark} href="/">
        <span className={styles.mark} aria-hidden="true" />
        Modeldex
      </Link>
      <nav className={styles.nav} aria-label="Main">
        <Link href="/#binder">Binder</Link>
        <Link href="/battle/">Battle</Link>
        <CompareNavLink className={styles.navCompare} />
        <Link className={styles.sync} href="/#source">
          <span className={styles.live} aria-hidden="true" />
          Updated <time dateTime={updatedAt}>{formatDate(updatedAt.slice(0, 10))}</time>
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({ updatedAt }: { updatedAt: string }) {
  return (
    <footer className={styles.footer}>
      <p>
        Specs from{' '}
        <a href="https://models.dev" target="_blank" rel="noopener noreferrer">
          models.dev
        </a>{' '}
        (MIT) · open models, stats, and licenses from{' '}
        <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer">
          Hugging Face
        </a>{' '}
        · data updated {formatDate(updatedAt.slice(0, 10))}
      </p>
      <p>Not affiliated with any AI lab. Model names belong to their makers.</p>
    </footer>
  );
}

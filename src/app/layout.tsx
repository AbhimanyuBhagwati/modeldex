import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google';
import { DeckProvider } from '@/components/deck/DeckProvider';
import { IconSprite } from '@/components/icons';
import { SITE } from '@/lib/site';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-mono', display: 'swap' });
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: 'Modeldex · Every AI model, dealt as a card', template: '%s · Modeldex' },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: 'website', siteName: SITE.name, locale: 'en_US', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Modeldex: every AI model, dealt as a card' }] },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6e8ee' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0f15' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${archivo.variable} ${plexMono.variable} ${instrument.variable}`}>
      <body>
        <IconSprite />
        <DeckProvider>{children}</DeckProvider>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { getDataset } from '@/lib/data';
import { withBase } from '@/lib/site';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Credits',
  description: 'Every data source, library, font, and piece of art behind Modeldex, with its license.',
  alternates: { canonical: '/credits/' },
};

interface Credit {
  name: string;
  href: string;
  use: string;
  license: string;
}

const SECTIONS: { title: string; lede: string; items: Credit[] }[] = [
  {
    title: 'Data',
    lede: 'Where every card, price, and star comes from. The sync pulls these fresh every day.',
    items: [
      { name: 'models.dev', href: 'https://models.dev', use: 'Specs, prices, release dates, and the 200+ providers behind “Where to run it”.', license: 'MIT' },
      { name: 'Hugging Face Hub', href: 'https://huggingface.co/models', use: 'Open models, downloads, likes, parameter counts, and licenses from each lab’s official account, plus the trending list that brings in new labs.', license: 'Public API' },
      { name: 'Hugging Face Inference Providers', href: 'https://huggingface.co/docs/inference-providers', use: 'Host prices, speed, and first-token latency for open models; the speeds Race the machine and the Terrarium run on.', license: 'Public API' },
      {
        name: 'Epoch AI Benchmarking Hub',
        href: 'https://epoch.ai/benchmarks',
        use: 'The Capabilities Index behind most quality numbers, plus the GPQA Diamond, SWE-bench Verified, FrontierMath, OTIS Mock AIME, and SimpleQA Verified runs Epoch does itself. Cite as: Epoch AI, ‘Capabilities & Benchmarking’, epoch.ai.',
        license: 'CC BY 4.0',
      },
      {
        name: 'LMArena leaderboard dataset',
        href: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
        use: 'Ratings from Arena’s text, coding, math, writing, web dev, vision, image, and video leaderboards, where people vote between anonymous answers.',
        license: 'CC BY 4.0',
      },
      { name: 'The labs themselves', href: withBase('/labs/'), use: 'Every card links to its lab’s own docs or Hugging Face page, the original source.', license: 'Linked' },
    ],
  },
  {
    title: 'Art',
    lede: 'Nothing here is a photo or stock image. Every picture is drawn by code, on your screen.',
    items: [
      { name: 'Card art and card back', href: withBase('/'), use: 'Generated per model from its lab’s style and its stats, as SVG.', license: 'Original' },
      { name: 'The AI Galaxy', href: withBase('/galaxy/'), use: 'Stars, dust lanes, nebula, and glow are WebGL shaders and particles.', license: 'Original' },
      { name: 'The AI Terrarium', href: withBase('/terrarium/'), use: 'Every creature, egg, fossil, tree, and sky is drawn by code on a canvas from the model’s own stats.', license: 'Original' },
      { name: 'Evolution effects', href: withBase('/evolution/'), use: 'Silhouettes, flashes, and particles, drawn with SVG, CSS, and canvas.', license: 'Original' },
      { name: 'webgl-noise', href: 'https://github.com/stegu/webgl-noise', use: 'Simplex noise by Ian McEwan (Ashima Arts) and Stefan Gustavson, shaping the galaxy’s clouds and arms.', license: 'MIT' },
    ],
  },
  {
    title: 'Code',
    lede: 'Open-source libraries the site is built on.',
    items: [
      { name: 'Next.js', href: 'https://nextjs.org', use: 'The framework: every page is prerendered to static HTML.', license: 'MIT' },
      { name: 'React', href: 'https://react.dev', use: 'Everything interactive.', license: 'MIT' },
      { name: 'three.js', href: 'https://threejs.org', use: 'WebGL for the AI Galaxy: camera, controls, and bloom.', license: 'MIT' },
      { name: 'Zod', href: 'https://zod.dev', use: 'Checks every data file before the site trusts it.', license: 'MIT' },
      { name: 'hyparquet', href: 'https://github.com/hyparam/hyparquet', use: 'Reads LMArena’s Parquet files during the daily sync.', license: 'MIT' },
      { name: 'fflate', href: 'https://github.com/101arrowz/fflate', use: 'Unzips Epoch AI’s benchmark data during the daily sync.', license: 'MIT' },
    ],
  },
  {
    title: 'Type',
    lede: 'Served by Google Fonts.',
    items: [
      { name: 'Archivo', href: 'https://fonts.google.com/specimen/Archivo', use: 'Headlines and interface, by Omnibus-Type.', license: 'SIL OFL 1.1' },
      { name: 'Instrument Serif', href: 'https://fonts.google.com/specimen/Instrument+Serif', use: 'Italic display type, by Instrument.', license: 'SIL OFL 1.1' },
      { name: 'IBM Plex Mono', href: 'https://fonts.google.com/specimen/IBM+Plex+Mono', use: 'Numbers, labels, and small print, by IBM.', license: 'SIL OFL 1.1' },
    ],
  },
  {
    title: 'Hosting',
    lede: 'Free tiers, all of it.',
    items: [
      { name: 'GitHub Pages and Actions', href: 'https://pages.github.com', use: 'Hosts the site and runs the daily sync.', license: 'Service' },
      { name: 'Cloudflare Workers and D1', href: 'https://workers.cloudflare.com', use: 'Counts votes, storing only a salted hash of each voter.', license: 'Service' },
    ],
  },
];

export default function CreditsPage() {
  const data = getDataset();
  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <p className="eyebrow">Sources and thanks</p>
          <h1 className={styles.title}>Credits</h1>
          <p className={styles.lede}>Modeldex stands on open data and open source. Here is everything it uses, what for, and under which license.</p>
        </div>
        {SECTIONS.map((section) => (
          <section key={section.title} className={styles.section} aria-labelledby={`credits-${section.title}`}>
            <div className={styles.head}>
              <h2 id={`credits-${section.title}`}>{section.title}</h2>
              <p>{section.lede}</p>
            </div>
            <ul className={styles.items}>
              {section.items.map((c) => (
                <li key={c.name}>
                  <a href={c.href} target="_blank" rel="noopener noreferrer">
                    <span className={styles.name}>
                      {c.name}
                      <em>{c.license}</em>
                    </span>
                    <span className={styles.use}>{c.use}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className={styles.note}>
          Modeldex isn’t affiliated with any AI lab, or with the Pokémon Company; Pokémon is a trademark of Nintendo, Creatures, and Game Freak. Model and lab names belong to their makers.
        </p>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

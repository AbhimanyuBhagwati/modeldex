import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { SiteFooter, SiteHeader } from '@/components/chrome';
import { Portrait } from '@/components/creatures/Portrait';
import { Terrarium } from '@/components/terrarium/Terrarium';
import { getDataset, terrariumData } from '@/lib/data';
import { SPECIES, type Creature } from '@/lib/terrarium';
import { MODEL_TYPES } from '@/lib/types';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'The AI Terrarium',
  description: 'Every AI model as a living creature. New releases hatch from eggs, retired models lie as fossils, and families walk behind their newest generation. Adopt one and it tells you what changed.',
  alternates: { canonical: '/terrarium/' },
};

/** The field guide shows each species at its best: the highest rated, then the biggest. */
const specimen = (list: Creature[]) =>
  [...list].sort((a, b) => (b.wit ?? -1) - (a.wit ?? -1) || b.size - a.size || b.born.localeCompare(a.born))[0];

export default function TerrariumPage() {
  const data = getDataset();
  const t = terrariumData();
  const color = Object.fromEntries(t.labs.map((l) => [l.key, l.color]));
  const guide = MODEL_TYPES.map((type) => {
    const list = t.creatures.filter((c) => c.type === type && !c.fossil && !c.egg);
    return { type, count: t.creatures.filter((c) => c.type === type && !c.fossil).length, example: list.length ? specimen(list) : null };
  }).filter((g) => g.example);

  return (
    <>
      <SiteHeader updatedAt={data.updatedAt} />
      <main className="page">
        <div className={styles.top}>
          <p className="eyebrow">A living collection</p>
          <h1 className={styles.title}>
            The AI Terrarium. <em>Every model, alive.</em>
          </h1>
          <p className={styles.lede}>
            Each creature is a real model, grown from its card. New releases hatch from eggs, retired ones rest as fossils in the rock of their year, and families walk
            behind their newest generation. Adopt one and it will tell you what changed each time you visit.
          </p>
        </div>

        <Terrarium data={t} />

        <section className={styles.section} aria-labelledby="guide">
          <h2 id="guide">Field guide</h2>
          <p className={styles.sectionLede}>What a model does decides what it becomes. Shown here: the best-rated of each kind.</p>
          <ul className={styles.guide}>
            {guide.map(({ type, count, example }) => (
              <li key={type} style={{ '--t': color[example!.lab] } as CSSProperties}>
                <div className={styles.specimen}>
                  <Portrait creature={example!} color={color[example!.lab]} width={120} height={100} />
                </div>
                <div>
                  <h3>
                    {SPECIES[type].name} <small>{count}</small>
                  </h3>
                  <p>{SPECIES[type].about}</p>
                  <p className={styles.example}>Pictured: {example!.name}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="how">
          <h2 id="how">How a card becomes a creature</h2>
          <dl className={styles.how}>
            <div>
              <dt>Species</dt>
              <dd>The model’s type: chat models walk, image models fly on painted wings, embedding models grow as mushrooms whose threads link the lab underground.</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>Its context window, or its parameter count for open models. Bigger memory, bigger creature.</dd>
            </div>
            <div>
              <dt>Pace</dt>
              <dd>Measured speed where Hugging Face has timed it; otherwise its bulk. Snails are slow on purpose.</dd>
            </div>
            <div>
              <dt>Crown</dt>
              <dd>Quality from public leaderboards: a gold crown for the top 10%, a silver halo for the top 25%.</dd>
            </div>
            <div>
              <dt>Features</dt>
              <dd>A glowing horn for reasoning, an antenna for tool use, big eyes for image input, ears for audio, and a song for speech output. Holo rares shimmer.</dd>
            </div>
            <div>
              <dt>Life</dt>
              <dd>
                The daily sync decides it. Last week’s releases arrive as eggs, retired models fossilize in the layer for the year they came out, and each new generation
                takes the lead of its family. Day and night follow your own clock.
              </dd>
            </div>
          </dl>
        </section>
      </main>
      <SiteFooter updatedAt={data.updatedAt} />
    </>
  );
}

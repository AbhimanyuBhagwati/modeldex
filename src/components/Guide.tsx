import { Energies, RarityIcon } from '@/components/icons';
import { TYPE_HINT, TYPE_LABEL } from '@/lib/format';
import { RARITY_FLOORS } from '@/lib/pipeline/build';
import { MODALITIES, MODEL_TYPES } from '@/lib/types';
import styles from './Guide.module.css';

interface Props {
  listings: number;
  providers: number;
  updatedLabel: string;
  licensesFromHf: number;
  openWeights: number;
}

export function Guide({ listings, providers, updatedLabel, licensesFromHf, openWeights }: Props) {
  const { uncommon, rare, holo } = RARITY_FLOORS;
  return (
    <section className={styles.guide} aria-labelledby="guide-title">
      <div>
        <h2 id="guide-title">How to read a card</h2>
        <dl className={styles.legend}>
          <div>
            <dt>Type</dt>
            <dd>
              What the model is for, shown on the card’s type line.
              <span className={styles.types}>
                {MODEL_TYPES.map((t) => (
                  <span key={t}>
                    <b>{TYPE_LABEL[t]}</b> {TYPE_HINT[t]}
                  </span>
                ))}
              </span>
            </dd>
          </div>
          <div>
            <dt>CTX</dt>
            <dd>Context window, the card’s HP. It’s how many tokens the model can hold at once.</dd>
          </div>
          <div>
            <dt>Art</dt>
            <dd>Generated, never drawn by hand. Each lab has its own style, like a type in a card game: OpenAI rosettes, Anthropic landscapes, Google sparkles, xAI black holes and more. Within a lab, the model sets the details: more context makes denser art, more capabilities make it more intricate, and no two cards share a layout.</dd>
          </div>
          <div>
            <dt>Energy</dt>
            <dd>
              What goes in and what comes out.
              <span className={styles.row}>
                {MODALITIES.map((m) => (
                  <span key={m}>
                    <Energies list={[m]} />
                    <span aria-hidden="true">{m === 'pdf' ? 'PDF' : m[0].toUpperCase() + m.slice(1)}</span>
                  </span>
                ))}
              </span>
            </dd>
          </div>
          <div>
            <dt>Moves</dt>
            <dd>Input and output price per million tokens, from the lab’s own price list.</dd>
          </div>
          <div>
            <dt>Rarity</dt>
            <dd>
              Set by output price per million tokens.
              <span className={styles.row}>
                <span><RarityIcon rarity="common" />Common, under ${uncommon}</span>
                <span><RarityIcon rarity="uncommon" />Uncommon, ${uncommon} to ${rare}</span>
                <span><RarityIcon rarity="rare" />Rare, ${rare} to ${holo}</span>
                <span><RarityIcon rarity="holo" />Holo rare, ${holo} and up</span>
                <span><RarityIcon rarity="promo" />Promo, no public price</span>
              </span>
            </dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>
              <span className={styles.row} style={{ marginTop: 0 }}>
                <span><span className="acc acc-free">Free</span>$0 to call</span>
                <span><span className="acc acc-open">Open weights</span>download and run it yourself</span>
                <span><span className="acc acc-paid">Paid</span>API only</span>
              </span>
            </dd>
          </div>
          <div>
            <dt>Set no.</dt>
            <dd>Release order across the whole set. Card 001 is the oldest.</dd>
          </div>
        </dl>
      </div>
      <div className={styles.source} id="source">
        <h2>Where the cards come from</h2>
        <p>
          Every spec comes from{' '}
          <a href="https://models.dev" target="_blank" rel="noopener noreferrer">
            models.dev
          </a>
          , an open, MIT-licensed database of AI models. The latest pull held {listings.toLocaleString('en-US')} listings across {providers} providers. Resellers list the same model many times over, so each model appears once here, under the lab that made it.
        </p>
        <p>
          A scheduled job pulls the data every day, checks it, and republishes the site. New models show up as new cards without anyone editing this page. The data last changed on {updatedLabel}.
        </p>
        <p>
          Licenses for open-weight models come from each model’s{' '}
          <a href="https://huggingface.co" target="_blank" rel="noopener noreferrer">
            Hugging Face
          </a>{' '}
          card: {licensesFromHf} of {openWeights} matched directly. The rest show the lab’s usual license and say so on their page.
        </p>
        <p className={styles.note}>Modeldex isn’t affiliated with any AI lab. Model names belong to their makers, and every card links to the lab’s own docs.</p>
      </div>
    </section>
  );
}

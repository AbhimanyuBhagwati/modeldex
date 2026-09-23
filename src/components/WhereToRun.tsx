import { Icon } from '@/components/icons';
import { INPUT_ONLY, formatPrice, formatTokens } from '@/lib/format';
import type { HostOffer, Model, Offer, OffersFile } from '@/lib/types';
import styles from './WhereToRun.module.css';

/** Rows shown before "Show all": enough to compare the big clouds without a wall of resellers. */
const FIRST = 10;

interface Props {
  model: Pick<Model, 'name' | 'type'>;
  offers: Offer[];
  hf: HostOffer[];
  providers: OffersFile['providers'];
}

const priceOf = (o: { input: number | null; output: number | null }, inputOnly: boolean) => (inputOnly ? o.input : o.output);

/** Every provider selling the model through an API, and Hugging Face's hosts for open models. Rendered at build time. */
export function WhereToRun({ model, offers, hf, providers }: Props) {
  const inputOnly = INPUT_ONLY.has(model.type);
  // Free listings are often trials or rate-limited tiers, so "cheapest" means the lowest paid price.
  const priced = offers.filter((o) => (priceOf(o, inputOnly) ?? 0) > 0);
  const cheapest = priced[0];
  const free = offers.filter((o) => priceOf(o, inputOnly) === 0);
  const official = offers.find((o) => o.official);
  const fastest = [...hf].filter((h) => h.throughput).sort((a, b) => b.throughput! - a.throughput!)[0];
  const parts = [
    offers.length && `${offers.length} ${offers.length === 1 ? 'provider sells' : 'providers sell'} ${model.name} through an API`,
    hf.length && `${hf.length} Hugging Face ${hf.length === 1 ? 'host serves' : 'hosts serve'} it`,
  ].filter(Boolean);

  const offerRow = (o: Offer) => {
    const p = providers[o.provider];
    const best = o === cheapest && priced.length > 1;
    return (
      <tr key={o.provider} data-best={best || undefined}>
        <th scope="row">
          {p?.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer">
              {p.name}
              <Icon name="out" />
            </a>
          ) : (
            (p?.name ?? o.provider)
          )}
          {o.official && <span className={styles.official}>Official</span>}
          {best && <span className={styles.best}>Cheapest paid</span>}
          {priceOf(o, inputOnly) === 0 && <span className={styles.tag}>Free</span>}
          <code>{o.model}</code>
        </th>
        <td>{formatPrice(o.input)}</td>
        {!inputOnly && <td>{formatPrice(o.output)}</td>}
        <td>{formatTokens(o.context)}</td>
      </tr>
    );
  };
  const head = (
    <thead>
      <tr>
        <th scope="col">Provider</th>
        <th scope="col">{inputOnly ? 'Price' : 'Input'}</th>
        {!inputOnly && <th scope="col">Output</th>}
        <th scope="col">Context</th>
      </tr>
    </thead>
  );

  return (
    <section className={styles.section} id="run" aria-labelledby="run-title">
      <h2 id="run-title">Where to run it</h2>
      <p className={styles.lede}>{parts.join(', and ')}. Prices are per million tokens, cheapest first.</p>

      {(cheapest || free.length > 0 || official || fastest) && (
        <ul className={styles.facts}>
          {cheapest && (
            <li>
              <small>Cheapest</small>
              <b>{providers[cheapest.provider]?.name}</b>
              <span>
                {formatPrice(cheapest.input)}
                {!inputOnly && ` in · ${formatPrice(cheapest.output)} out`}
              </span>
            </li>
          )}
          {free.length > 0 && (
            <li>
              <small>Free to try</small>
              <b>
                {free.length} {free.length === 1 ? 'provider' : 'providers'}
              </b>
              <span>{free.slice(0, 3).map((o) => providers[o.provider]?.name).join(', ')}{free.length > 3 ? ', …' : ''}</span>
            </li>
          )}
          {official && (
            <li>
              <small>From the lab</small>
              <b>{providers[official.provider]?.name}</b>
              <span>
                {formatPrice(official.input)}
                {!inputOnly && ` in · ${formatPrice(official.output)} out`}
              </span>
            </li>
          )}
          {fastest && (
            <li>
              <small>Fastest on Hugging Face</small>
              <b>{fastest.name}</b>
              <span>{fastest.throughput} tokens/s</span>
            </li>
          )}
        </ul>
      )}

      {offers.length > 0 && (
        <>
          <h3 className={styles.subhead}>API providers</h3>
          <div className={styles.scroll}>
            <table className={styles.table}>
              {head}
              <tbody>{offers.slice(0, FIRST).map(offerRow)}</tbody>
            </table>
          </div>
          {offers.length > FIRST && (
            <details className={styles.more}>
              <summary>Show {offers.length - FIRST} more providers</summary>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  {head}
                  <tbody>{offers.slice(FIRST).map(offerRow)}</tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {hf.length > 0 && (
        <>
          <h3 className={styles.subhead}>Hugging Face Inference Providers</h3>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Host</th>
                  <th scope="col">Input</th>
                  <th scope="col">Output</th>
                  <th scope="col">Context</th>
                  <th scope="col">Speed</th>
                  <th scope="col">First token</th>
                </tr>
              </thead>
              <tbody>
                {hf.map((h) => (
                  <tr key={h.provider} data-best={(h === fastest && hf.length > 1) || undefined}>
                    <th scope="row">
                      <a href={h.url} target="_blank" rel="noopener noreferrer">
                        {h.name}
                        <Icon name="out" />
                      </a>
                      {h === fastest && hf.length > 1 && <span className={styles.best}>Fastest</span>}
                      {h.tools && <span className={styles.tag}>Tools</span>}
                    </th>
                    <td>{formatPrice(h.input)}</td>
                    <td>{formatPrice(h.output)}</td>
                    <td>{formatTokens(h.context)}</td>
                    <td>{h.throughput ? `${h.throughput} tok/s` : '—'}</td>
                    <td>{h.latencyMs ? `${(h.latencyMs / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className={styles.note}>
        From models.dev and Hugging Face, checked daily. Resellers’ listings can lag behind their price pages, so confirm with the provider before you commit.
      </p>
    </section>
  );
}

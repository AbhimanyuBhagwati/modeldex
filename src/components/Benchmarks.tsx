import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import { TYPE_LABEL } from '@/lib/format';
import { BENCH_INFO, BOARD_INFO, SCORE_SOURCES, formatBoardScore, formatShare, percentile, qualityTier, topShare } from '@/lib/quality';
import { BENCHES, BOARDS, type CardScores, type Model, type ScoresFile } from '@/lib/types';
import styles from './Benchmarks.module.css';

const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The name a board lists, when it isn't this card's own. */
function listedAs(m: Model, as: string): string | null {
  const a = plain(as);
  return a === plain(m.name) || a === plain(m.id) || a === plain(m.slug) ? null : as;
}

interface Props {
  model: Model;
  scores: CardScores | null;
  boards: ScoresFile['boards'];
}

/** "How good is it?": the card's quality, every leaderboard that lists it, and Epoch's own benchmark runs. */
export function Benchmarks({ model: m, scores, boards }: Props) {
  const q = m.quality;
  const listed = BOARDS.filter((b) => scores?.boards[b] && boards[b]);
  const runs = BENCHES.filter((b) => scores?.bench[b] != null);
  const sources = [...new Set([...listed.map((b) => BOARD_INFO[b].source), ...(runs.length ? (['epoch'] as const) : [])])];

  return (
    <section className={styles.section} id="quality" aria-labelledby="quality-title">
      <h2 id="quality-title">How good is it?</h2>
      <p className={styles.lede}>Public leaderboard scores for {m.name}, refreshed daily from Epoch AI and LMArena.</p>

      {q ? (
        <div className={styles.hero}>
          <div className={styles.medal} data-tier={qualityTier(q.value)} aria-hidden="true">
            <b>{q.value}</b>
            <span>Quality</span>
          </div>
          <div>
            <p className={styles.verdict}>
              {topShare(q.value)} of the {q.of} models on the {BOARD_INFO[q.basis].label}: #{q.rank}.
            </p>
            <p className={styles.explain}>
              Quality is the share of a leaderboard’s models this one beats, from 0 to 100. Chat models are rated on Epoch AI’s Capabilities Index when it lists
              them, otherwise on LMArena; image and video models on LMArena’s image and video arenas.
            </p>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>
          {listed.length
            ? `${m.name} is ranked below, but not on a board built for ${TYPE_LABEL[m.type].toLowerCase()} models, so it has no quality number.`
            : runs.length
              ? `No leaderboard ranks ${m.name} yet, so it has no quality number, but Epoch AI has run it on the benchmarks below.`
              : `No public leaderboard lists ${m.name} yet. Epoch AI and LMArena cover most chat, image, and video models from the big labs; embeddings, speech, and small open models mostly go unrated.`}
        </p>
      )}

      {listed.length > 0 && (
        <>
          <h3 className={styles.subhead}>Leaderboards</h3>
          <ul className={styles.boards}>
            {listed.map((b) => {
              const s = scores!.boards[b]!;
              const of = boards[b]!.count;
              const p = percentile(s.rank, of);
              const as = listedAs(m, s.as);
              return (
                <li key={b} className={styles.board} data-basis={q?.basis === b || undefined}>
                  <div className={styles.boardHead}>
                    <a href={BOARD_INFO[b].url} target="_blank" rel="noopener noreferrer">
                      {BOARD_INFO[b].label}
                      <Icon name="out" />
                    </a>
                    <span className={styles.rank}>
                      #{s.rank} <small>of {of}</small>
                    </span>
                  </div>
                  <div className={styles.bar} role="img" aria-label={`Beats ${p}% of the board`} style={{ '--p': `${p}%` } as CSSProperties}>
                    <i />
                  </div>
                  <div className={styles.boardFoot}>
                    <span>{BOARD_INFO[b].about}</span>
                    <b>
                      {formatBoardScore(b, s.score)} <small>{b === 'eci' ? 'index' : 'rating'}</small>
                    </b>
                  </div>
                  {as && (
                    <p className={styles.as}>
                      Listed as <code>{as}</code>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {runs.length > 0 && (
        <>
          <h3 className={styles.subhead}>Benchmarks Epoch AI runs</h3>
          <ul className={styles.runs}>
            {runs.map((b) => {
              const v = scores!.bench[b]!;
              return (
                <li key={b}>
                  <a className={styles.run} href={BENCH_INFO[b].url} target="_blank" rel="noopener noreferrer">
                    <b>{formatShare(v)}</b>
                    <span>{BENCH_INFO[b].label}</span>
                    <small>{BENCH_INFO[b].about}</small>
                    <span className={styles.bar} aria-hidden="true" style={{ '--p': `${v * 100}%` } as CSSProperties}>
                      <i />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sources.length > 0 && (
        <p className={styles.note}>
          Scores from{' '}
          {sources.map((src, i) => (
            <span key={src}>
              {i > 0 && ' and '}
              <a href={SCORE_SOURCES[src].url} target="_blank" rel="noopener noreferrer">
                {SCORE_SOURCES[src].name}
              </a>
            </span>
          ))}
          , licensed CC BY 4.0. Boards list models under their own names, so a close match is shown with the name it was scored under.{' '}
          <Link href="/credits/">Credits</Link>
        </p>
      )}
    </section>
  );
}

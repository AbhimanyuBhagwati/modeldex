'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Card } from '@/components/card/Card';
import { CardBack } from '@/components/card/CardBack';
import { CopyButton } from '@/components/client-bits';
import { Icon } from '@/components/icons';
import {
  ACCESS,
  BUDGETS,
  NEEDS,
  TASKS,
  WEIGHTS,
  answersFromParams,
  answersToParams,
  deal,
  needsFor,
  type AccessPref,
  type Answers,
  type Budget,
  type Need,
  type Signals,
  type Task,
} from '@/lib/match';
import { BENCH_INFO, BOARD_INFO } from '@/lib/quality';
import { battleHref, compareHref } from '@/lib/site';
import type { Bench, Board, LabSummary, Model } from '@/lib/types';
import styles from './page.module.css';

interface Props {
  pool: Model[];
  signals: Record<string, Signals>;
  counts: Partial<Record<Board, number>>;
  labs: LabSummary[];
  setSize: number;
  refDate: string;
}

type Step = 0 | 1 | 2 | 3;
interface Draft {
  task?: Task;
  budget?: Budget;
  needs: Need[];
  access?: AccessPref;
}

const QUESTIONS: Record<Step, string> = {
  0: 'What’s the job?',
  1: 'What’s the budget?',
  2: 'Any must-haves?',
  3: 'Open weights or a paid API?',
};

const GLYPH: Record<Task, string> = { chat: 'Aa', code: '</>', reason: 'π', image: '▲', video: '▶', voice: '♪', search: '⌕' };
const TASK_KEYS = Object.keys(TASKS) as Task[];
const BUDGET_KEYS = Object.keys(BUDGETS) as Budget[];
const ACCESS_KEYS = Object.keys(ACCESS) as AccessPref[];

function Tile({ selected, onClick, glyph, label, blurb }: { selected: boolean; onClick: () => void; glyph?: string; label: string; blurb: string }) {
  return (
    <button type="button" className={styles.tile} aria-pressed={selected} onClick={onClick}>
      {glyph && (
        <span className={styles.glyph} aria-hidden="true">
          {glyph}
        </span>
      )}
      <span className={styles.tileText}>
        <b>{label}</b>
        <small>{blurb}</small>
      </span>
      <span className={styles.tick} aria-hidden="true">
        <Icon name="check" />
      </span>
    </button>
  );
}

const budgetBlurb = (b: Budget, task: Task | undefined) =>
  b === 'low' || b === 'mid' ? (task === 'search' ? 'Per million input tokens' : 'Per million output tokens') : BUDGETS[b].blurb;

const HAND: Record<number, string> = { 1: 'Your card', 2: 'Your two cards', 3: 'Your three cards' };

const needsLabel = (needs: Need[]) => (needs.length ? needs.map((n) => NEEDS[n].label).join(', ') : 'No must-haves');

/** Which boards each task leans on, for "How it picks". */
function Weights({ task }: { task: Task }) {
  const w = WEIGHTS[task];
  if (!w) return <>No public leaderboard covers {TASKS[task].label.toLowerCase()} yet, so these go by Hugging Face downloads, then by how new they are.</>;
  const parts = (Object.entries(w) as [Board | Bench, number][]).map(([k, v]) => `${k in BENCH_INFO ? BENCH_INFO[k as Bench].label : BOARD_INFO[k as Board].label} ${Math.round(v * 100)}%`);
  return <>{parts.join(' · ')}</>;
}

export function MatchView({ pool, signals, counts, labs, setSize, refDate }: Props) {
  const params = useSearchParams();
  const [answers, setAnswers] = useState<Answers | null>(() => answersFromParams(new URLSearchParams(params.toString())));
  const [editing, setEditing] = useState<{ step: Step; draft: Draft } | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const labsByKey = useMemo(() => Object.fromEntries(labs.map((l) => [l.key, l])), [labs]);

  const result = useMemo(() => (answers ? deal(pool, signals, counts, answers, skip) : null), [answers, pool, signals, counts, skip]);

  const share = (a: Answers | null) => {
    const q = a ? `?${answersToParams(a)}` : '';
    window.history.replaceState(null, '', `${window.location.pathname}${q}`);
  };
  const finish = (a: Answers) => {
    setAnswers(a);
    setEditing(null);
    setSkip([]);
    setRound((r) => r + 1);
    share(a);
  };
  const startOver = () => {
    setAnswers(null);
    setEditing(null);
    setSkip([]);
    share(null);
  };

  const asking = !answers || editing != null;
  const step: Step = editing?.step ?? 0;
  const draft: Draft = editing?.draft ?? { needs: [] };
  const go = (next: Step, d: Draft) => setEditing({ step: next, draft: d });

  if (asking) {
    const task = draft.task;
    const needs = task ? needsFor(task) : [];
    const complete = (d: Draft): d is Required<Draft> => !!(d.task && d.budget && d.access);
    let body: ReactNode;
    if (step === 0) {
      body = (
        <div className={styles.tiles} data-count="7">
          {TASK_KEYS.map((t) => (
            <Tile
              key={t}
              glyph={GLYPH[t]}
              label={TASKS[t].label}
              blurb={TASKS[t].blurb}
              selected={draft.task === t}
              onClick={() => go(1, { ...draft, task: t, needs: draft.needs.filter((n) => needsFor(t).includes(n)) })}
            />
          ))}
        </div>
      );
    } else if (step === 1) {
      body = (
        <div className={styles.tiles}>
          {BUDGET_KEYS.map((b) => (
            <Tile key={b} label={BUDGETS[b].label} blurb={budgetBlurb(b, task)} selected={draft.budget === b} onClick={() => go(2, { ...draft, budget: b })} />
          ))}
        </div>
      );
    } else if (step === 2) {
      body = (
        <>
          <div className={styles.tiles}>
            {needs.map((n) => (
              <Tile
                key={n}
                label={NEEDS[n].label}
                blurb={NEEDS[n].blurb}
                selected={draft.needs.includes(n)}
                onClick={() => go(2, { ...draft, needs: draft.needs.includes(n) ? draft.needs.filter((x) => x !== n) : [...draft.needs, n] })}
              />
            ))}
            <Tile label="Nothing special" blurb="Any card that does the job" selected={draft.needs.length === 0} onClick={() => go(3, { ...draft, needs: [] })} />
          </div>
          <div className={styles.stepActions}>
            <button type="button" className="btn btn-gold" onClick={() => go(3, draft)}>
              {draft.needs.length ? `Next, with ${draft.needs.length === 1 ? 'that' : `those ${draft.needs.length}`}` : 'Next'}
            </button>
          </div>
        </>
      );
    } else {
      body = (
        <div className={styles.tiles}>
          {ACCESS_KEYS.map((a) => (
            <Tile
              key={a}
              label={ACCESS[a].label}
              blurb={ACCESS[a].blurb}
              selected={draft.access === a}
              onClick={() => {
                const d = { ...draft, access: a };
                if (complete(d)) finish(d);
              }}
            />
          ))}
        </div>
      );
    }

    return (
      <section className={styles.stage} aria-labelledby="match-q">
        <ol className={styles.pips} aria-label="Questions">
          {([0, 1, 2, 3] as Step[]).map((i) => {
            const done = i < step;
            return (
              <li key={i} data-state={i === step ? 'now' : done ? 'done' : 'todo'}>
                {done ? (
                  <button type="button" onClick={() => go(i, draft)} aria-label={`Back to question ${i + 1}: ${QUESTIONS[i]}`}>
                    {i + 1}
                  </button>
                ) : (
                  <span aria-current={i === step ? 'step' : undefined}>{i + 1}</span>
                )}
              </li>
            );
          })}
        </ol>
        <div className={styles.question} key={step}>
          <p className={styles.count}>Question {step + 1} of 4</p>
          <h2 id="match-q" className={styles.ask}>
            {QUESTIONS[step]}
          </h2>
          {body}
        </div>
        <div className={styles.nav}>
          {step > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => go((step - 1) as Step, draft)}>
              <Icon name="back" />
              Back
            </button>
          )}
          {answers && (
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Keep my last answers
            </button>
          )}
        </div>
      </section>
    );
  }

  const a = answers!;
  const picks = result?.picks ?? [];
  const keys = picks.map((p) => p.model.key);
  const more = (result?.considered ?? 0) > skip.length + picks.length;
  const edit = (i: Step) => go(i, { ...a });
  const relax: { label: string; next: Answers }[] = [];
  if (a.budget !== 'any') relax.push({ label: `Raise the budget to ${BUDGETS[BUDGET_KEYS[BUDGET_KEYS.indexOf(a.budget) + 1]].label.toLowerCase()}`, next: { ...a, budget: BUDGET_KEYS[BUDGET_KEYS.indexOf(a.budget) + 1] } });
  if (a.needs.length) relax.push({ label: 'Drop the must-haves', next: { ...a, needs: [] } });
  if (a.access !== 'either') relax.push({ label: 'Allow open weights or APIs', next: { ...a, access: 'either' } });

  return (
    <section className={styles.stage} aria-labelledby="match-result">
      <div className={styles.summary}>
        <h2 id="match-result" className={styles.resultTitle}>
          {picks.length ? (skip.length ? (picks.length === 3 ? 'Three more' : 'The last of them') : HAND[picks.length]) : 'Nothing fits yet'}
        </h2>
        <ul className={styles.chips} aria-label="Your answers">
          <li>
            <button type="button" onClick={() => edit(0)}>
              <span className={styles.chipGlyph} aria-hidden="true">
                {GLYPH[a.task]}
              </span>
              {TASKS[a.task].label}
            </button>
          </li>
          <li>
            <button type="button" onClick={() => edit(1)}>
              {BUDGETS[a.budget].label}
            </button>
          </li>
          <li>
            <button type="button" onClick={() => edit(2)}>
              {needsLabel(a.needs)}
            </button>
          </li>
          <li>
            <button type="button" onClick={() => edit(3)}>
              {ACCESS[a.access].label}
            </button>
          </li>
        </ul>
      </div>

      <p className="sr-only" aria-live="polite">
        {picks.length ? `Dealt ${picks.map((p) => p.model.name).join(', ')}.` : 'No cards fit these answers.'}
      </p>

      {picks.length ? (
        <ol className={styles.hand} key={`${round}-${skip.length}`}>
          {picks.map((p, i) => {
            const lab = labsByKey[p.model.lab];
            return (
              <li key={p.model.key} className={styles.slot} data-top={(i === 0 && skip.length === 0) || undefined} style={{ '--i': i } as CSSProperties}>
                <div className={styles.flip}>
                  <div className={styles.back} aria-hidden="true">
                    <CardBack />
                  </div>
                  <div className={styles.front}>
                    <Card model={p.model} lab={lab} setSize={setSize} refDate={refDate} />
                  </div>
                </div>
                <div className={styles.why}>
                  <span className={styles.badge} data-kind={p.badge === 'Top pick' ? 'top' : undefined}>
                    {p.badge}
                  </span>
                  <p>{p.reason}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.none}>
          <p>No card fits all four answers. Loosen one:</p>
          <div className={styles.actions}>
            {relax.map((r) => (
              <button key={r.label} type="button" className="btn" onClick={() => finish(r.next)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        {picks.length >= 2 && (
          <Link className="btn btn-gold" href={compareHref(keys)}>
            Compare {picks.length === 3 ? 'all three' : 'both'}
          </Link>
        )}
        {picks.length >= 2 && (
          <Link className="btn" href={battleHref(keys[0], keys[1])}>
            Battle the top two
          </Link>
        )}
        {picks.length > 0 && (
          <button
            type="button"
            className="btn"
            disabled={!more}
            onClick={() => {
              setSkip((s) => [...s, ...keys]);
              setRound((r) => r + 1);
            }}
          >
            {more ? 'Deal three more' : 'That’s every card that fits'}
          </button>
        )}
        <CopyButton label="Copy link" className="btn" />
        <button type="button" className="btn btn-ghost" onClick={startOver}>
          Start over
        </button>
      </div>

      <details className={styles.how}>
        <summary>How it picks</summary>
        <p>
          {result?.considered ?? 0} cards fit all four answers. It ranks them by the public leaderboards for the job, weighted:{' '}
          <Weights task={a.task} />. A card that only one board lists counts for a little less. Paid cards must fit the budget at their lab’s own price, or the
          cheapest paid host for open models; open weights fit a free budget, or any budget if you said you’d run them yourself. It deals one card per lab when it
          can, so you see three different takes.
        </p>
        <p>
          Scores come from Epoch AI and LMArena (CC BY 4.0) and refresh daily with the rest of the binder. Brand-new models may not be rated yet.{' '}
          <Link href="/credits/">Credits</Link>
        </p>
      </details>
    </section>
  );
}

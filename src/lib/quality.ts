import type { Bench, Board, Quality } from './types';

/** Where each score comes from. Both publish their data under CC BY 4.0, which asks for exactly this credit. */
export const SCORE_SOURCES = {
  epoch: {
    name: 'Epoch AI',
    title: 'Benchmarking Hub',
    url: 'https://epoch.ai/benchmarks',
    license: 'CC BY 4.0',
    citation: 'Epoch AI, ‘Capabilities & Benchmarking’. Published online at epoch.ai.',
  },
  arena: {
    name: 'LMArena',
    title: 'Leaderboard dataset',
    url: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
    license: 'CC BY 4.0',
    citation: 'LMArena (arena.ai), leaderboard-dataset on Hugging Face.',
  },
} as const;
export type ScoreSource = keyof typeof SCORE_SOURCES;

export interface BoardInfo {
  label: string;
  /** Two or three words for tight spots: compare rows, battle rounds. */
  short: string;
  source: ScoreSource;
  url: string;
  /** What the board measures, in a sentence. */
  about: string;
}

export const BOARD_INFO: Record<Board, BoardInfo> = {
  eci: {
    label: 'Epoch Capabilities Index',
    short: 'Capabilities',
    source: 'epoch',
    url: 'https://epoch.ai/benchmarks/eci',
    about: 'One number fitted from dozens of hard benchmarks, from science questions to agentic coding.',
  },
  text: { label: 'LMArena Text', short: 'Chat', source: 'arena', url: 'https://arena.ai/leaderboard/text', about: 'People compare two anonymous answers and vote for the better one.' },
  coding: { label: 'LMArena Text · Coding', short: 'Coding', source: 'arena', url: 'https://arena.ai/leaderboard/text', about: 'The text arena’s coding prompts only.' },
  math: { label: 'LMArena Text · Math', short: 'Math', source: 'arena', url: 'https://arena.ai/leaderboard/text', about: 'The text arena’s math prompts only.' },
  creative: { label: 'LMArena Text · Creative writing', short: 'Writing', source: 'arena', url: 'https://arena.ai/leaderboard/text', about: 'The text arena’s creative writing prompts only.' },
  webdev: { label: 'LMArena WebDev', short: 'Web apps', source: 'arena', url: 'https://arena.ai/leaderboard/webdev', about: 'Each model builds a web app from the same prompt; people pick the better one.' },
  vision: { label: 'LMArena Vision', short: 'Vision', source: 'arena', url: 'https://arena.ai/leaderboard/vision', about: 'Questions about images, voted by people.' },
  image: { label: 'LMArena Text to Image', short: 'Images', source: 'arena', url: 'https://arena.ai/leaderboard/text-to-image', about: 'Two images from the same prompt; people pick the better one.' },
  'image-edit': { label: 'LMArena Image Edit', short: 'Image edits', source: 'arena', url: 'https://arena.ai/leaderboard/image-edit', about: 'Two edits of the same image; people pick the better one.' },
  video: { label: 'LMArena Text to Video', short: 'Video', source: 'arena', url: 'https://arena.ai/leaderboard/text-to-video', about: 'Two clips from the same prompt; people pick the better one.' },
  'image-video': { label: 'LMArena Image to Video', short: 'Animate', source: 'arena', url: 'https://arena.ai/leaderboard/image-to-video', about: 'Two clips animating the same image; people pick the better one.' },
};

export const BENCH_INFO: Record<Bench, { label: string; about: string; url: string }> = {
  gpqa: { label: 'GPQA Diamond', about: 'PhD-level biology, chemistry, and physics questions', url: 'https://epoch.ai/benchmarks/gpqa-diamond' },
  swe: { label: 'SWE-bench Verified', about: 'Fixing real issues in open-source Python projects', url: 'https://epoch.ai/benchmarks/swe-bench-verified' },
  frontiermath: { label: 'FrontierMath', about: 'Unpublished research-level math problems, tiers 1–3', url: 'https://epoch.ai/frontiermath' },
  aime: { label: 'OTIS Mock AIME', about: 'Competition math from the 2024–2025 mock AIME', url: 'https://epoch.ai/benchmarks/otis-mock-aime-2024-2025' },
  simpleqa: { label: 'SimpleQA Verified', about: 'Short factual questions, where guessing is penalized', url: 'https://epoch.ai/benchmarks/simpleqa-verified' },
};

/** Share of a board's other entries a place beats, 0–100. */
export const percentile = (rank: number, count: number) => (count <= 1 ? 100 : Math.round((100 * (count - rank)) / (count - 1)));

export type QualityTier = 's' | 'a' | 'b' | 'c';

/** Gold, silver, bronze, and plain seals. */
export const qualityTier = (value: number): QualityTier => (value >= 90 ? 's' : value >= 75 ? 'a' : value >= 50 ? 'b' : 'c');

/** "Top 3%" for 97. Never "Top 0%". */
export const topShare = (value: number) => `Top ${Math.max(1, 100 - value)}%`;

/** One sentence for a seal's tooltip. */
export const qualityTitle = (q: Quality) => `Quality ${q.value}: #${q.rank} of ${q.of} on the ${BOARD_INFO[q.basis].label} (${topShare(q.value)}).`;

/** How a board writes its score: the index to a decimal, arena ratings as whole points. */
export const formatBoardScore = (board: Board, score: number) => (board === 'eci' ? score.toFixed(1) : Math.round(score).toLocaleString('en-US'));

export const formatShare = (v: number) => `${(v * 100).toFixed(v >= 0.995 || v < 0.1 ? 1 : 0)}%`;

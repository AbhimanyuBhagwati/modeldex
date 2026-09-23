/** The deploy workflow sets this from GitHub Pages, including the /<repo> path. */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export const SITE = {
  name: 'Modeldex',
  url: siteUrl(),
  description: 'Every model from the major AI labs as a collectible card. Compare specs and prices side by side, then go straight to the lab’s own docs.',
};

export const MAX_DECK = 4;

/** Model keys contain a slash, so compare links read `?m=anthropic/claude-opus-5-5,xai/grok-4.7`. */
export const modelHref = (m: { lab: string; slug: string }) => `/models/${m.lab}/${m.slug}/`;
export const compareHref = (keys: string[]) => (keys.length ? `/compare/?m=${keys.join(',')}` : '/compare/');
export const battleHref = (a?: string, b?: string) => (a && b ? `/battle/?a=${a}&b=${b}` : '/battle/');

export function parseCompareParam(v: string | string[] | undefined): string[] {
  const raw = (Array.isArray(v) ? v.join(',') : (v ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(raw)].slice(0, MAX_DECK);
}

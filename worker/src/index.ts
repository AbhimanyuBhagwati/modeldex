/**
 * Modeldex votes: anyone can vote for a favorite card without signing in.
 *
 *   GET  /counts          { all: { [model]: votes }, week: { [model]: votes } }
 *   POST /vote {model}    { model, counted, all, week }
 *
 * Each network gets one vote per card per day, and at most DAILY_LIMIT votes a day. Networks are
 * identified by a salted SHA-256 of the connecting IP; the IP itself is never stored.
 */

// Just the D1 surface this file uses, so it needs no type packages.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
}
interface Env {
  DB: D1Database;
  /** Secret: `wrangler secret put SALT`. */
  SALT: string;
  /** Comma-separated origins that may vote. */
  ALLOWED_ORIGINS: string;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const MODEL_KEY = /^[a-z0-9-]{1,40}\/[A-Za-z0-9_-]{1,120}$/;
const DAILY_LIMIT = 50;
/** Seconds the counts stay cached at the edge, so page views don't each hit the database. */
const COUNTS_TTL = 30;

const day = (offset = 0) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);

async function voterId(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** An allowed origin may use `*` for one run of letters, digits, and dashes, for preview deployments. */
function allows(pattern: string, origin: string): boolean {
  if (!pattern.includes('*')) return pattern === origin;
  const re = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')}$`);
  return re.test(origin);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.some((p) => allows(p, origin))) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

async function counts(env: Env) {
  const [all, week] = await Promise.all([
    env.DB.prepare('SELECT model, total AS n FROM tallies WHERE total > 0').all<{ model: string; n: number }>(),
    env.DB.prepare('SELECT model, COUNT(*) AS n FROM votes WHERE day >= ? GROUP BY model').bind(day(6)).all<{ model: string; n: number }>(),
  ]);
  const map = (rows: { model: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.model, r.n]));
  return { all: map(all.results), week: map(week.results) };
}

async function vote(req: Request, env: Env, cors: Record<string, string>) {
  if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Votes come from the Modeldex site only.' }, 403, cors);
  const body = (await req.json().catch(() => null)) as { model?: unknown } | null;
  const model = body?.model;
  if (typeof model !== 'string' || !MODEL_KEY.test(model)) return json({ error: 'Unknown card.' }, 400, cors);

  const voter = await voterId(req.headers.get('cf-connecting-ip') ?? 'unknown', env.SALT);
  const today = day();
  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter = ? AND day = ?').bind(voter, today).first<{ n: number }>();
  if ((used?.n ?? 0) >= DAILY_LIMIT) return json({ error: `That’s ${DAILY_LIMIT} votes today. Come back tomorrow.` }, 429, cors);

  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO votes (model, voter, day) VALUES (?, ?, ?)').bind(model, voter, today).run();
  const counted = inserted.meta.changes > 0;
  if (counted) {
    await env.DB.prepare('INSERT INTO tallies (model, total) VALUES (?, 1) ON CONFLICT (model) DO UPDATE SET total = total + 1').bind(model).run();
  }
  const [total, week] = await Promise.all([
    env.DB.prepare('SELECT total AS n FROM tallies WHERE model = ?').bind(model).first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE model = ? AND day >= ?').bind(model, day(6)).first<{ n: number }>(),
  ]);
  return json({ model, counted, all: total?.n ?? 0, week: week?.n ?? 0 }, 200, cors);
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req.headers.get('origin'), env);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (req.method === 'POST' && url.pathname === '/vote') return await vote(req, env, cors);
      if (req.method === 'GET' && url.pathname === '/counts') {
        // Cache the tally at the edge; CORS headers are added per request, since they depend on the caller.
        const cache = (caches as unknown as { default: Cache }).default;
        const key = new Request(`${url.origin}/counts`);
        let hit = await cache.match(key);
        if (!hit) {
          hit = new Response(JSON.stringify(await counts(env)), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${COUNTS_TTL}` } });
          ctx.waitUntil(cache.put(key, hit.clone()));
        }
        return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors } });
      }
      return json({ error: 'Not found.' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'Something went wrong. Try again in a moment.' }, 500, cors);
    }
  },

  /** Daily: forget vote rows older than a week. Totals stay in `tallies`. */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await env.DB.prepare('DELETE FROM votes WHERE day < ?').bind(day(8)).run();
  },
};

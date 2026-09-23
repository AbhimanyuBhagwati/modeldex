# Modeldex

Every AI model from the major labs as a collectible card: the models you call through an API, and the most downloaded open models on Hugging Face. Browse the binder, put up to four cards in your deck, compare them side by side, send two into battle, and vote for your favorites. Every card shows where to run it (every provider that sells it, with prices) and links to the lab's own docs or repo. There's a page per lab, a "New this week" page, an RSS feed, and Evolution: every model line (GPT 1 → 5.6, Llama 2 → 4, Claude Opus 4.5 → 5.5, and 90 more) played out stage by stage like a Pokémon evolving. And the AI Galaxy: every model as a star in a 3D spiral galaxy, labs as arms, evolution lines as constellations, and a timeline that plays the whole field's growth.

Live at **https://abhimanyubhagwati.github.io/modeldex/**.

The data updates itself. A GitHub Action pulls [models.dev](https://models.dev) and the labs' official [Hugging Face](https://huggingface.co) accounts every morning, checks the result, commits it, and republishes the site on GitHub Pages. Nobody has to touch the site for new models to appear.

## How the daily update works

```
06:17 UTC   GitHub Action "Sync and deploy" starts
            ├─ npm run sync
            │    ├─ download models.dev/api.json (8,000+ listings, 200+ providers)
            │    ├─ keep each lab's own listings, drop resold copies and aliases
            │    ├─ sort every model into a type: text, image, video, audio, voice,
            │    │  transcription, embedding, rerank, safety
            │    ├─ read open-weight licenses from Hugging Face
            │    ├─ scan each lab's official Hugging Face accounts (≈55 orgs):
            │    │    models with 100,000+ downloads last month become cards,
            │    │    cards stay once they're in, quantized copies are skipped,
            │    │    and models.dev cards gain downloads and parameter counts
            │    ├─ where to run it: match every card to the providers that sell it
            │    │    (models.dev's 200+ providers) and to Hugging Face's hosts
            │    ├─ validate: schema, at least 100 models, no drop over 25% in a day
            │    └─ write data/*.json only if something changed, and log what
            │       changed (new cards, price changes, retirements) for /new/ and the feed
            ├─ lint, typecheck, test
            ├─ commit "data: 3 new, 5 updated" and push      (only when the data changed)
            └─ build the static site and publish to GitHub Pages
```

A push to `main` also runs the checks and republishes. A morning with no new data skips the rebuild, though download counts move most days, so most mornings publish.

If models.dev is down or sends something broken, the job fails, GitHub emails you, and the site keeps serving yesterday's data. If Hugging Face is down or rate-limits the job, each org that fails keeps yesterday's cards, stats, and licenses.

## One-time setup

Already done for this repo; here for anyone forking it.

1. **Push the project to GitHub.**
   ```bash
   gh repo create modeldex --public --source . --push
   ```
   GitHub Pages is free for public repos. Private repos need a paid plan.
2. **Turn on Pages with GitHub Actions as the source:** *Settings → Pages → Build and deployment → Source: GitHub Actions*, or
   ```bash
   gh api -X POST repos/OWNER/modeldex/pages -f build_type=workflow
   ```
3. **Run the workflow once** to publish: *Actions → Sync and deploy → Run workflow*. The site appears at `https://OWNER.github.io/modeldex/`.
4. **If the default branch is protected,** allow `github-actions[bot]` to push to it, or the daily data commit will fail.
5. **Optional: add a Hugging Face token.** The sync makes about 100 anonymous calls a day, well under Hugging Face's limit, but GitHub's runners share IP addresses with other jobs. A free read token from *huggingface.co → Settings → Access Tokens*, saved as the repo secret `HF_TOKEN`, gives the job a limit of its own:
   ```bash
   gh secret set HF_TOKEN
   ```

The workflow reads the Pages address itself, so a custom domain (set under *Settings → Pages*) needs no code changes.

GitHub pauses scheduled workflows in public repos after 60 days with no commits. The daily data commits count as activity, so this only matters if models.dev stops changing for two months.

## Voting

Votes live in a small Cloudflare Worker with a D1 database (`worker/`), since GitHub Pages can't store anything. Anyone can vote without signing in: one vote per card per day and at most 50 a day per network. The Worker stores a salted hash of the address, never the address itself. Until `NEXT_PUBLIC_VOTES_API` points at a deployed Worker, the site hides every vote button.

To set it up on a free Cloudflare account:

```bash
cd worker && npm install
npx wrangler login                          # opens Cloudflare in the browser
npx wrangler d1 create modeldex-votes       # paste the database_id into wrangler.jsonc
npm run db:init                             # create the tables
openssl rand -hex 32 | npx wrangler secret put SALT
npm run deploy                              # prints https://modeldex-votes.<you>.workers.dev
```

Then set that URL as `VOTES_API` in `src/lib/site.ts` (or the `NEXT_PUBLIC_VOTES_API` build variable) and push. This repo's Worker runs at `https://modeldex-votes.modeldex-votes.workers.dev`. Add your own domain to `ALLOWED_ORIGINS` in `wrangler.jsonc` if you move the site.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run sync         # refresh data/models.json from models.dev and Hugging Face
npm run check        # lint + typecheck + tests
npm run build        # static export into out/ (every page prerendered)
```

Requires Node 20.9 or newer (`.nvmrc` pins 24).

## Common changes

| To… | Edit |
| --- | --- |
| Add or remove a lab | `src/config/labs.ts`, then `npm run sync`. Pick an `art` style, or use `emblem` with a glyph and layout; labs with neither get a generated look of their own |
| Change how model types are detected | `typeOf` in `src/lib/pipeline/build.ts`; for Hugging Face, `TASKS` in `src/lib/pipeline/hub.ts` |
| Add a Hugging Face account to a lab | `hub` on the lab in `src/config/labs.ts`, then `npm run sync` |
| Change the download cutoff for open-model cards | `HUB_MIN_DOWNLOADS` in `src/lib/pipeline/hub.ts` |
| Change battle rounds or damage | `STATS` and `battle` in `src/lib/battle.ts` |
| Fix a provider matched to the wrong model | `nameCore` and `idCore` in `src/lib/pipeline/offers.ts` |
| Fix an evolution line (a size read as a version, a tier split wrong) | `TIERS`, `NOISE`, and `SIZE` in `src/lib/evolution.ts` |
| Reshape the galaxy (arm twist, star brightness) | `TWIST`, `layoutGalaxy`, and `galaxyData` in `src/lib/galaxy.ts`; look and glow in `src/components/galaxy/` |
| Credit a new source, library, or font | `SECTIONS` in `src/app/credits/page.tsx` |
| Fix a wrong license | `LICENSE_OVERRIDES` in `src/config/labs.ts`, then `npm run sync` |
| Change rarity thresholds | `RARITY_FLOORS` in `src/lib/pipeline/build.ts` |
| Change the sync schedule | `cron` in `.github/workflows/site.yml` |

## Project layout

```
scripts/sync.ts            the daily job: fetch, build, validate, write
src/config/labs.ts         which labs appear, their colors, how to recognize their models
src/lib/pipeline/          pure data pipeline (tested): build, licenses, hub, schema, diff
src/lib/battle.ts          battle mode: rounds, damage, matchmaking (tested)
src/lib/news.ts            what "New this week" and the RSS feed list (tested)
src/lib/evolution.ts       evolution lines read from model names, and what changed per stage (tested)
src/components/evolution/  the evolution theater: silhouette flicker, flash, particles on canvas
src/lib/galaxy.ts          the AI Galaxy's data and layout: time as radius, labs as arms (tested)
src/components/galaxy/     the galaxy in WebGL (three.js, loaded only there): shaders, scene, controls
src/lib/data.ts            loads data/models.json for pages
src/components/card/       the card: foil, tilt, glare, generated art
src/components/binder/     search, filters (kept in the URL), grid
src/components/deck/       the compare deck, saved in localStorage
src/app/                   routes: /, /models/[lab]/[id], /labs, /evolution, /galaxy, /new, /favorites, /credits, /compare and /battle
                           (read the query in the browser), feed.xml, og.png images, sitemap
src/components/votes/      vote button and store; talks to the Worker
worker/                    the voting Worker and its D1 schema (own toolchain: Wrangler)
data/models.json           generated: every card
data/offers.json           generated: where to run each card
data/changes.json          generated: the last 90 days of changes
```

## Data and credits

- Specs and prices: [models.dev](https://models.dev), MIT licensed.
- Open models, downloads, parameter counts, and licenses: each lab's official [Hugging Face](https://huggingface.co) account and each model's card. When no repo matches, the page shows the lab's usual license and says so.
- Where to run it: provider listings from models.dev; Hugging Face Inference Providers' prices, speed, and latency from the Hugging Face router.
- Site size: every card gets a static page and a share image, about 0.4 MB each, so ~1,000 cards is ~400 MB, within GitHub Pages' 1 GB limit.
- Modeldex isn't affiliated with any AI lab. Model names belong to their makers.

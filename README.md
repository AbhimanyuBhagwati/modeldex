# Modeldex

Every AI model from the major labs as a collectible card: the models you call through an API, and the most downloaded open models on Hugging Face. Each card carries a quality medal from public benchmarks (Epoch AI and LMArena), and the Model Matchmaker deals you the three best cards for a job after four questions. The AI Terrarium turns every card into a living creature, and Race the machine lets you out-type (or not) models running at their measured speed. Browse the binder, put up to four cards in your deck, compare them side by side, send two into battle, and vote for your favorites. Every card shows where to run it (every provider that sells it, with prices) and links to the lab's own docs or repo. There's a page per lab, a "New this week" page, an RSS feed, and Evolution: every model line (GPT 1 → 5.6, Llama 2 → 4, Claude Opus 4.5 → 5.5, and 90 more) played out stage by stage like a Pokémon evolving. And the AI Galaxy: every model as a star in a 3D spiral galaxy, labs as arms, evolution lines as constellations, and a timeline that plays the whole field's growth.

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
            │    ├─ benchmark scores: Epoch AI's Capabilities Index and its own runs
            │    │    (GPQA Diamond, SWE-bench Verified, FrontierMath, ...) and LMArena's
            │    │    leaderboards, matched to cards by name; a source that fails keeps
            │    │    yesterday's scores
            │    ├─ validate: schema, at least 100 models, no drop over 25% in a day
            │    └─ write data/*.json only if something changed, and log what
            │       changed (new cards, price changes, retirements) for /new/ and the feed
            ├─ lint, typecheck, test
            ├─ commit "data: 3 new, 5 updated" and push      (only when the data changed)
            └─ build the static site and publish to GitHub Pages
```

A push to `main` also runs the checks and republishes. A morning with no new data skips the rebuild, though download counts move most days, so most mornings publish.

If models.dev is down or sends something broken, the job fails, GitHub emails you, and the site keeps serving yesterday's data. If Hugging Face is down or rate-limits the job, each org that fails keeps yesterday's cards, stats, and licenses. If Epoch AI or LMArena fails, or their data changes shape so fewer than 50 cards get rated, the scores from the last good run stay.

### Quality and the matchmaker

A card's quality is the share of a public leaderboard's models it beats, 0 to 100: Epoch AI's Capabilities Index for chat models (LMArena Text when Epoch hasn't scored one), LMArena's image and video arenas for those types. Gold is the top 10%, silver the top 25%, bronze the top half. Both sources are CC BY 4.0. Only their own data is used; Epoch's copies of other groups' leaderboards carry those groups' terms and are left out. Boards name models their own way (`claude-opus-4-7-high`, `GPT-4o (May 2024)`), so the matcher peels settings, then snapshot dates, and each model page shows the name a score was listed under. Base weights never inherit a chat model's score.

The Model Matchmaker (`/match/`) asks for the job, budget, must-haves, and open or paid, then ranks every card that fits by the leaderboards for that job. It runs in the browser on the same data; nothing is sent anywhere.

### The Terrarium and the race

The AI Terrarium (`/terrarium/`) draws every card as a creature on a 2D canvas, from its data: the type picks the species (walkers, butterflies, mushrooms, bats, ants, and more), context or parameters set the size, measured speed sets the pace, quality earns a crown or halo, and reasoning, tools, image input, and audio grow a horn, an antenna, big eyes, and ears. Each lab has its own land. The last week's releases arrive as eggs you tap to hatch, retired models lie as fossils in the rock layer of their year, and families walk single file behind their newest generation. Day and night follow the visitor's clock. Adopting a creature saves a snapshot in the browser, so it can tell you what changed since: quality, price, a new generation, retirement.

Race the machine (`/race/`) pits you against three models typing the same passage. Each starts after its measured first-token delay and writes at its measured tokens a second, from Hugging Face's own timings of its fastest host; a token counts as four characters. Only models Hugging Face has timed can race.

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
| Change how quality is matched or rated | `rowCores`, `scoreCores`, and `BASIS` in `src/lib/pipeline/scores.ts`; labels in `src/lib/quality.ts` |
| Change what the matchmaker weighs | `WEIGHTS`, `TASKS`, `NEEDS`, and `BUDGETS` in `src/lib/match.ts` |
| Change a creature's species or looks | `SPECIES` in `src/lib/terrarium.ts`; drawing in `src/components/creatures/draw.ts`; the world in `src/components/terrarium/world.ts` |
| Change the race passages or lineup | `PASSAGES` and `defaultLineup` in `src/lib/race.ts` |
| Credit a new source, library, or font | `SECTIONS` in `src/app/credits/page.tsx` |
| Fix a wrong license | `LICENSE_OVERRIDES` in `src/config/labs.ts`, then `npm run sync` |
| Change rarity thresholds | `RARITY_FLOORS` in `src/lib/pipeline/build.ts` |
| Change the sync schedule | `cron` in `.github/workflows/site.yml` |

## Project layout

```
scripts/sync.ts            the daily job: fetch, build, validate, write
src/config/labs.ts         which labs appear, their colors, how to recognize their models
src/lib/pipeline/          pure data pipeline (tested): build, licenses, hub, offers, scores, schema, diff
src/lib/quality.ts         quality tiers and what each leaderboard is
src/lib/match.ts           the Model Matchmaker: filters, ranking, one-line reasons (tested)
src/lib/terrarium.ts       cards as creatures: species, size, families, eggs, fossils, moods (tested)
src/lib/race.ts            Race the machine: who has typed what, when (tested)
src/components/creatures/  every species, egg, and fossil drawn on a canvas
src/components/terrarium/  the Terrarium's world: scenery, simulation, camera, and its React shell
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
src/app/                   routes: /, /models/[lab]/[id], /labs, /evolution, /galaxy, /new, /favorites, /credits, /compare, /battle
                           /match, /terrarium, and /race (read the query in the browser), feed.xml, og.png images, sitemap
src/components/votes/      vote button and store; talks to the Worker
worker/                    the voting Worker and its D1 schema (own toolchain: Wrangler)
data/models.json           generated: every card
data/offers.json           generated: where to run each card
data/changes.json          generated: the last 90 days of changes
data/scores.json           generated: public benchmark scores per card
```

## Data and credits

- Specs and prices: [models.dev](https://models.dev), MIT licensed.
- Open models, downloads, parameter counts, and licenses: each lab's official [Hugging Face](https://huggingface.co) account and each model's card. When no repo matches, the page shows the lab's usual license and says so.
- Where to run it: provider listings from models.dev; Hugging Face Inference Providers' prices, speed, and latency from the Hugging Face router.
- Quality: [Epoch AI's Benchmarking Hub](https://epoch.ai/benchmarks) (CC BY 4.0; Epoch AI, ‘Capabilities & Benchmarking’) and [LMArena's leaderboard dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) (CC BY 4.0).
- Site size: every card gets a static page and a share image, about 0.4 MB each, so ~1,000 cards is ~400 MB, within GitHub Pages' 1 GB limit.
- Modeldex isn't affiliated with any AI lab. Model names belong to their makers.

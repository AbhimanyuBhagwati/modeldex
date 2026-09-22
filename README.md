# Modeldex

Every AI model from the major labs as a collectible card. Browse the binder, put up to four cards in your deck, compare them side by side, and follow each card to the lab's own docs.

Live at **https://abhimanyubhagwati.github.io/modeldex/**.

The data updates itself. A GitHub Action pulls [models.dev](https://models.dev) every morning, checks it, commits the result, and republishes the site on GitHub Pages. Nobody has to touch the site for new models to appear.

## How the daily update works

```
06:17 UTC   GitHub Action "Sync and deploy" starts
            ├─ npm run sync
            │    ├─ download models.dev/api.json (8,000+ listings, 200+ providers)
            │    ├─ keep each lab's own listings, drop resold copies and aliases
            │    ├─ sort every model into a type: text, image, video, audio, voice,
            │    │  transcription, embedding, rerank, safety
            │    ├─ read open-weight licenses from Hugging Face
            │    ├─ validate: schema, at least 100 models, no drop over 25% in a day
            │    └─ write data/models.json only if something changed
            ├─ lint, typecheck, test
            ├─ commit "data: 3 new, 5 updated" and push      (only when the data changed)
            └─ build the static site and publish to GitHub Pages
```

A push to `main` also runs the checks and republishes. A morning with no new data skips the rebuild.

If models.dev is down or sends something broken, the job fails, GitHub emails you, and the site keeps serving yesterday's data. If Hugging Face is down, licenses from the previous sync are kept.

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

The workflow reads the Pages address itself, so a custom domain (set under *Settings → Pages*) needs no code changes.

GitHub pauses scheduled workflows in public repos after 60 days with no commits. The daily data commits count as activity, so this only matters if models.dev stops changing for two months.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run sync         # refresh data/models.json from models.dev
npm run check        # lint + typecheck + tests
npm run build        # static export into out/ (every page prerendered)
```

Requires Node 20.9 or newer (`.nvmrc` pins 24).

## Common changes

| To… | Edit |
| --- | --- |
| Add or remove a lab | `src/config/labs.ts`, then `npm run sync`. Pick an `art` style, or use `emblem` with a glyph and layout; labs with neither get a generated look of their own |
| Change how model types are detected | `typeOf` in `src/lib/pipeline/build.ts` |
| Fix a wrong license | `LICENSE_OVERRIDES` in `src/config/labs.ts`, then `npm run sync` |
| Change rarity thresholds | `RARITY_FLOORS` in `src/lib/pipeline/build.ts` |
| Change the sync schedule | `cron` in `.github/workflows/site.yml` |

## Project layout

```
scripts/sync.ts            the daily job: fetch, build, validate, write
src/config/labs.ts         which labs appear, their colors, how to recognize their models
src/lib/pipeline/          pure data pipeline (tested): build, licenses, schema, diff
src/lib/data.ts            loads data/models.json for pages
src/components/card/       the card: foil, tilt, glare, generated art
src/components/binder/     search, filters (kept in the URL), grid
src/components/deck/       the compare deck, saved in localStorage
src/app/                   routes: /, /models/[lab]/[id], /compare (reads ?m= in the browser), og.png images, sitemap
data/models.json           generated; committed by the sync job
```

## Data and credits

- Specs and prices: [models.dev](https://models.dev), MIT licensed.
- Open-weight licenses: each model's [Hugging Face](https://huggingface.co) card. When no repo matches, the page shows the lab's usual license and says so.
- Modeldex isn't affiliated with any AI lab. Model names belong to their makers.

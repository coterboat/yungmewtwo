# yungmewtwo

A Pokémon TCG radar for two hunters: card and sealed prices with history, release drops,
a shared board for deals and drawings, a restock log that learns your stores, a vault, and
phone alerts. Static site on GitHub Pages; GitHub Actions does the fetching.

Live: https://coterboat.github.io/yungmewtwo/

## How it works

- `scripts/pull-tcgcsv.ts` pulls TCGplayer catalog + prices (English and Japanese) nightly from
  [TCGCSV](https://tcgcsv.com) into `data/catalog/` and `data/snapshots/` (one file per day; that's the price history).
- `scripts/build-site-data.ts` turns `data/` into `public/data/` at build time (builders in `scripts/site/`).
- `data/user/*.json` is what you two write from the app (posts, sightings, watchlist, vaults). Each post is a commit.
- `data/seed/*.json` is hand-curated: release calendar, MSRPs, pull rates, retailer notes.
- `.github/workflows/site.yml` runs the pulls on a schedule and deploys.

## Develop

```
npm install
npm run data      # build public/data from data/
npm run dev
npm test
```

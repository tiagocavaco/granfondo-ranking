# Granfondo Ranking

Monorepo tracking the Portuguese granfondo cycling series. Four npm workspaces:

| Package | Purpose |
|---------|---------|
| `database` | Shared schema, types, normalisation, DB builder/client |
| `utils` | Scoring formulas (athlete points, team points, coefficients) |
| `scraper` | Node.js scraper — fetches results, builds encrypted SQLite DB |
| `frontend` | React + Vite SPA — decrypts DB in-browser, queries via sql.js |

## Root scripts

```bash
npm run scrape          # full scrape (uses cached results where available)
npm run scrape:force    # ignore cache, re-scrape everything
npm run dev             # start frontend dev server
npm run build           # production frontend build
```

## Data flow

```
StopAndGo API / apedalar.pt / other scrapers
  └─ scraper builds in-memory SQLite
  └─ AES-256-GCM encrypts → frontend/public/data/data.db.enc
  └─ scraper/scraped-events.json tracks which event IDs are stable (cached)

Browser
  └─ fetches data.db.enc
  └─ decrypts via Web Crypto (key from VITE_DATA_KEY env)
  └─ loads into sql.js in-memory DB
  └─ all data queries run as SQL against this DB
```

## Encryption

- Key is 64 hex chars (32 bytes). Same value used as `DATA_KEY` (scraper) and `VITE_DATA_KEY` (frontend build).
- Layout of `.enc` file: `[iv:12 bytes][auth tag:16 bytes][ciphertext]`.
- The key intentionally appears in the compiled JS bundle — the goal is "not plaintext in git", not cryptographic secrecy.

## Environment

- `scraper/.env` — `DATA_KEY=<64 hex>`
- `frontend/.env.local` — `VITE_DATA_KEY=<64 hex>`
- Both files are gitignored.

## Git workflow — data.db.enc conflicts

`data.db.enc` is a binary blob that stores all manual overrides (team aliases, athlete aliases, result assignments) in addition to the scraped data. **The local branch's copy always has more accumulated fixes than the remote base.**

When a `git rebase` hits a conflict on `data.db.enc`, always use `--theirs` (= the local commits being replayed), never `--ours` (= the upstream base):

```bash
git checkout --theirs frontend/public/data/data.db.enc
git add frontend/public/data/data.db.enc
git rebase --continue
```

`--ours` and `--theirs` are reversed from what you might expect during a rebase: `--ours` is the base you are rebasing onto, `--theirs` is your local commits. Using `--ours` loses all uncommitted DB fixes.

## CI

- `.github/workflows/scrape-results.yml` — scheduled scrape, commits updated `data.db.enc` + `scraped-events.json`
- `.github/workflows/scrape-participants.yml` — runs `npm run scrape:participants` to refresh participant lists for upcoming events
- `.github/workflows/deploy.yml` — builds and deploys frontend to GitHub Pages (injects `VITE_DATA_KEY` at build time)

## Where to look for things

| Question | Start here |
|----------|-----------|
| How events are scraped | `scraper/src/pipeline/events.ts` |
| How athlete identity is resolved | `scraper/src/pipeline/results/results.ts` (orchestrator) + `passes/` |
| How rankings are computed | `scraper/src/pipeline/ranking.ts` |
| How participant lists are refreshed | `scraper/src/pipeline/participants/participants-refresh.ts` |
| How the DB is built and encrypted | `scraper/src/db/write-db.ts` |
| How the frontend queries data | `frontend/src/api.ts` |
| Manual DB overrides (aliases, assignments) | `scraper/src/db/manage-db.ts` |

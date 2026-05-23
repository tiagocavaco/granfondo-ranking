# Granfondo Ranking

Monorepo tracking the Portuguese granfondo cycling series. Four npm workspaces:

| Package | Purpose |
|---------|---------|
| `database` | Shared schema, types, normalisation, DB builder/client |
| `utils` | Scoring formulas (athlete points, team points, coefficients) |
| `api` | All query logic — environment-agnostic, injectable getDb |
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

## Code style

Code is read by humans (and AI agents acting on their behalf). Optimise for the
next person needing to understand it cold — not for the original author who
already knows what `ca` and `tokB` mean.

### Naming

- **Identifier minimum length: 3 characters.** Enforced by ESLint `id-length`.
- **Allowlist of short names** (when used in their conventional sense):
  - Numeric loop indices: `i`, `j`, `k`
  - Coordinates: `x`, `y`
  - Intentional unused: `_`
  - Domain abbreviations: `db`, `id`, `ok`, `el`, `fn`, `cb`, `ev`, `e`, `r`
- **No single-letter parameters in exported functions.** `function f(a, b)` is
  not OK; `function teamKeySimilarity(keyA, keyB)` is.
- **Loop variables in nested scopes get real names.** Not
  `for (const r of …) for (const a of r.athletes)`. Write `result`/`athlete`.
- **Names describe meaning, not type or encoding.**
  - Bad: `ca`, `cb`, `kc`, `lc`, `sc`, `tokA`, `setB`
  - Good: `compactedKeyA`, `shorterCompacted`, `tokensA`, `tokenSetB`
- **No abbreviations unless they're domain-standard.** `pos`, `cat`, `cnt`, `tmp`,
  `cfg`, `res` (HTTP response is fine; "result" is not) all hurt readability for
  ~2 characters of typing. Spell them out.

### Comments

- Default to no comments. A well-named identifier already explains the *what*.
- Write a comment only when the *why* is non-obvious: a constraint that doesn't
  show up in the type, an invariant a future maintainer might accidentally
  violate, a workaround for a specific upstream bug.
- Tests document invariants in a one-line comment above the assertion. Future
  maintainers should be able to read the test and understand what would break
  if the assertion fired.

### Functions

- If a function is longer than ~50 lines, ask whether it's really one thing.
- Pure helpers go in their own file alongside the consumer if they're scoped to
  it, or under the workspace's existing `helpers.ts`/`utils.ts` if shared.
- Long pipelines (multiple stages of `useMemo`, `.reduce()`, or `for` loops
  producing intermediate maps) read better as named helpers than as a wall of
  inline transformations.

## Where to look for things

| Question | Start here |
|----------|-----------|
| How events are scraped | `scraper/src/pipeline/events.ts` |
| How athlete identity is resolved | `scraper/src/pipeline/results/results.ts` (orchestrator) + `passes/` |
| How rankings are computed | `scraper/src/pipeline/ranking.ts` |
| How participant lists are refreshed | `scraper/src/pipeline/participants/participants-refresh.ts` |
| How the DB is built and encrypted | `scraper/src/db/write-db.ts` |
| How the frontend queries data | `api/src/` (shared package) |
| Manual DB overrides (aliases, assignments) | `scraper/src/db/manage-db.ts` |

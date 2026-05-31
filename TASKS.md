# Tasks

Backlog of proposed features and refactors.

---

## Backoffice dashboard for manual DB overrides

Today, manual DB overrides (athlete aliases, result assignments, team aliases)
are managed via `npm run db:manage` shell commands in `scraper/src/db/manage-db.ts`.
The biggest pain is **lack of visibility**: there's no way to see what's
already in the override tables without decrypting the DB and querying it
directly. Adding a new alias means manually inspecting raw athlete rows
to find which name/team variants exist, then composing the right CLI
arguments. Easy to make typos and create duplicate or conflicting overrides.

A small backoffice UI would let us:

### Read surface (Phase 1 — solves the visibility pain alone)

- **List all athlete aliases** with canonical name/team and each alias name/team.
- **List all manual result assignments** (event, bib, target athlete ID,
  optional note).
- **List all team aliases** (alias key → canonical key).
- **Raw athlete page** — show the underlying rows from `athletes`,
  `athlete_teams`, `athlete_categories`, `athlete_results` for a given ID
  (not the "polished" public profile).
- **Raw team page** — same for `teams`, plus all `athlete_teams` rows
  pointing at it.
- **Search across raw names** — find variants of a name across all results
  to identify aliasing candidates.

### Write surface (Phase 2 — optional)

- Form to create an athlete alias (name + team for canonical + each alias).
- Form to create a result assignment (event + bib + athlete ID).
- Form to create a team alias (from-key + to-key).
- Validation feedback before submit (does the canonical exist? does the
  alias resolve to something different?).
- Each form produces a change-set that gets applied to `data.db.enc`.

### Architecture: separate `backoffice/` workspace, local-dev-only

The backoffice lives as a sibling workspace next to `frontend/`,
`scraper/`, etc. — its own `package.json`, Vite config, routes. It is
**not** embedded in the public frontend, so multiple public frontends
(future) can share the same operator tool without re-implementing it.

It is **never deployed publicly** — runs only via
`npm run dev --workspace=backoffice` on the operator's machine. No auth
needed (bound to localhost), no backend infrastructure, no remote write
path.

**Reuse:** consumes the existing shared packages — `@granfondo/api`
(query functions), `@granfondo/database` (schema + sql.js client),
`@granfondo/utils`. Decryption + sql.js wiring is identical to what the
public frontend already does. Read code is fully reused.

**Write mechanism:** a Vite dev-mode middleware exposes
`POST /api/admin/...` endpoints that call the existing `manage-db.ts`
functions directly. Modifications land in `data.db.enc` the same way the
CLI does today; the operator commits the result by hand. The middleware
is only registered in dev mode so a `npm run build` (if we ever do one)
produces a write-less static site.

**Read mechanism:** ordinary React routes (no admin prefix needed —
this *is* the admin app). Reads straight from the loaded sql.js DB.

**Tradeoffs accepted:**
- The dashboard is unusable from a phone, tablet, or someone else's
  laptop. That's fine for now — the override workflow is already
  single-operator.
- Slight duplication of Vite config / Tailwind setup with the public
  frontend. Cheaper than the embedding alternative.

### Suggested first cut

Phase 1 only. Stand up the `backoffice/` workspace skeleton, four read
views (aliases / assignments / raw athlete / raw team). Ship that and
use it for a few weeks before deciding whether Phase 2's write
convenience is worth building.

---

## Normalize category display in the frontend

The frontend displays raw category strings as stored in the DB (e.g. "MasterDM", "MasterA Masc", "MASTER 50"), which vary by event source. The pipeline already maps these to canonical forms via `canonicalizeCategory` in `@granfondo/utils/category` — apply it in the frontend so athlete profiles and results pages always show consistent labels like "Masters D Male" regardless of what the source data provided.

Pages affected: `AthleteProfile` (career results list), `ResultsTab` (results table category column), `ParticipantsTab` (category filter dropdown and table column).

---

## Scrape all missing historical events (2021–2024)

75 events from 2021–2024 are listed in `granfondo-list-historical.md` but absent from the scraper DB (which currently only covers 2024–2026).

### Inventory

| Year | Events | StopAndGo | External (needs work) |
|------|--------|-----------|----------------------|
| 2021 | 11 | 10 | 1 (Bragança — classificacoes.net) |
| 2022 | 18 | 16 | 2 (Porto Gaia — classificacoes.net; L'Étape — letapebytourdefrance.com) |
| 2023 | 21 | 20 | 1 (Porto Gaia — classificacoes.net) |
| 2024 | 23 | 21 | 2 (Porto Gaia — lap2go; L'Étape is on StopAndGo 1137) |

~67 events are on StopAndGo and need only ID registration. ~6 require new or extended scrapers.

### Steps

#### 1. Extract historical StopAndGo IDs

Parse `granfondo-list-historical.md` to extract all `results.stopandgo.pro/{id}` URLs under the 2021–2024 year sections. Add extracted IDs to `SUPPLEMENTAL_EVENT_IDS` in `config.ts`. First check whether `discoverGranfondos()` already returns older IDs — if so, only non-standard-name events need explicit entries.

#### 2. Build a parameterized classificacoes.net scraper

The existing `scrapers/classificacoes.ts` is hardcoded to Etapa da Volta. Refactor it to accept an event ID and use it for:
- Bragança Granfondo 2021
- Porto Gaia Granfondo 2022 and 2023

Note: the internal AJAX ID may differ from the URL slug — inspect the page HTML to find the mapping.

#### 3. Extend the lap2go scraper for Porto Gaia Granfondo 2024

`scrapers/lap2go.ts` already handles Figueira Champions Day. Check whether Porto Gaia 2024 uses the same structure and add it as an external event.

#### 4. Build a scraper for L'Étape Portugal 2022

`https://portugal.letapebytourdefrance.com/blog/race/resultados-2022` has no existing scraper platform. Inspect for a structured table or underlying API; implement `scrapers/letape.ts`.

#### 5. Wire everything into `external.ts` and `index.ts`

Assign 90xxx IDs to new external events (continuing from current max), add `StoredEvent` entries to `EXTERNAL_EVENTS`, call the appropriate scraper functions in `index.ts`.

#### 6. First-run scrape and validation

- Run `npm run scrape` — 2025/2026 events load from cache, only new historical IDs are fetched.
- Verify athlete ID stability: spot-check known athletes across years.
- Run `npm run db:find-team-aliases` — 4 extra years will surface many new team name variants.
- Review false-positive merge counts from the pipeline (more data = more fuzzy match risk).
- Check `data.db.enc` size stays within acceptable range (~60–70 MB expected).

### Performance notes

- Pipeline runtime will increase — ~3× more athletes and results. Passes 4–9 do pairwise comparisons; watch for minutes-long runs on first scrape.
- First run will make ~67 new StopAndGo API calls; subsequent runs load from cache.

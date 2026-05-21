# Tasks

Backlog of proposed features and refactors.

---

## Code modularity and deduplication

Several patterns are repeated across files that should be extracted into shared utilities.

### Known duplication

- **`decryptBuffer`** — the AES-256-GCM decrypt helper is copy-pasted into multiple debug/check scripts. It already lives in `scraper/src/db/encrypt.ts`; all scripts should import from there.
- **`buildCountryMap` / `buildMostFrequentCountryMap`** — currently in `frontend/src/utils/athlete.ts`. The scraper's `ranking.ts` does the same country-frequency logic inline. Consider moving the canonical version to `@granfondo/utils` so both sides share it.
- **Category sort key** — `categorySortKey` was recently moved to `@granfondo/utils/category`. Audit remaining files that still do ad-hoc category string comparisons and replace them.
- **Distance badge colours** — `distBadgeClass` is in `frontend/src/utils/distance.ts` but `ParticipantsTab` has its own inline `DIST_PILL` map with overlapping entries. Consolidate.

### Structural improvements

- **`results.ts` is ~1,500 lines** — each pass (`runPass1`…`runPass9`) could live in its own file under `pipeline/passes/`. The main `results.ts` would just orchestrate them.
- **`api.ts` is growing** — group functions by domain (`events`, `athletes`, `rankings`, `predictions`) into separate files under `src/api/`, re-exported from a single `src/api/index.ts`.

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

# Tasks

Backlog of proposed features and refactors.

---


## Scrape 2023 granfondo events

First year of the historical backfill (see "Scrape all missing historical events" below for the full 2021–2024 plan).

21 events in 2023: 20 on StopAndGo, 1 external (Porto Gaia — classificacoes.net).

### Steps

1. **Extend `YEARS` in `config.ts`** to include 2023 — `discoverGranfondos()` will then auto-discover most events from the StopAndGo API.
2. **Check which events are already returned** by running `npm run scrape` with `--dry-run` or inspecting what `discoverGranfondos()` finds for 2023 — standard "granfondo"-named events come through automatically.
3. **Add any non-standard-name 2023 event IDs** to `SUPPLEMENTAL_EVENT_IDS` in `config.ts` that aren't picked up by name matching.
4. **Porto Gaia Granfondo 2023** — on timerspeed.com (`https://timerspeed.com/live/g-live.html?f=events/2023/Porto_Gaia_Granfondo.clax`). There is an existing `scrapers/timerspeed.ts` — check if it handles this URL format and add Porto Gaia 2023 as an external event in `external.ts`.
5. **Run `npm run scrape`** — 2025/2026 events load from cache, only 2023 events are fetched.
6. **Validate**: spot-check athlete counts, run `npm run db:check`, run `npm run db:find-team-aliases` to catch new team name variants introduced by the extra year.

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

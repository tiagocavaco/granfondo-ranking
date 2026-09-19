# Tasks

Backlog of proposed features and refactors.

---

## Frontend polish — luxury UX (mobile-first)

The app works but doesn't feel premium. Bring it to a 10/10 level: visually stunning, silky to navigate, and excellent on mobile first — then equally great on desktop.

### Goals

- **Mobile-first**: the primary audience is on mobile (athletes checking results at the finish line or on the road). Every page must feel native on a phone — large tap targets, comfortable spacing, smooth scroll, no horizontal overflow, no tiny text. Desktop must be equally flawless — wider layouts, hover states, and richer data density where the screen allows
- **Visual quality**: consistent use of colour, hierarchy, and whitespace; cards and tables that look designed, not default
- **Interactions**: smooth transitions, loading states that don't feel abrupt, empty states that are friendly
- **Navigation**: fast to get anywhere — back buttons, breadcrumbs, or clear context so users never feel lost
- **Typography**: readable at every size; event/athlete names never truncate awkwardly

### Areas to audit

- Event list and event cards (`EventList`, `EventCard`)
- Event detail tabs — results table and participants table on mobile (`ResultsTab`, `ParticipantsTab`)
- Athlete profile hero, career table, performance chart (`AthleteProfile`, `PerformanceChart`, `CareerHighlights`)
- Ranking pages — infinite scroll feel, podium cards (`AggregateRankingPage`, `AggregateRankingPodium`)
- Team profile and member list (`TeamProfile`, `TeamMemberList`)
- Comparison page (`ComparisonPage`)
- Global: navigation bar, page transitions, Spinner, ErrorBanner

---

## Normalize category display in the frontend

The frontend displays raw category strings as stored in the DB (e.g. "MasterDM", "MasterA Masc", "MASTER 50"), which vary by event source. The pipeline already maps these to canonical forms via `canonicalizeCategory` in `@granfondo/utils/category` — apply it in the frontend so athlete profiles and results pages always show consistent labels like "Masters D Male" regardless of what the source data provided.

Pages affected: `AthleteProfile` (career results list), `ResultsTab` (results table category column), `ParticipantsTab` (category filter dropdown and table column).

---

## Scrape missing historical events (2021–2022)

29 events from 2021–2022 are listed in `granfondo-list-historical.md` but absent from the scraper DB.

### Inventory

| Year | Events | StopAndGo | External (needs work) |
|------|--------|-----------|----------------------|
| 2021 | 11 | 10 | 1 (Bragança — classificacoes.net) |
| 2022 | 18 | 16 | 2 (Porto Gaia — classificacoes.net; L'Étape — letapebytourdefrance.com) |

~26 events are on StopAndGo and need only ID registration. ~3 require new or extended scrapers.

### Steps

#### 1. Extract historical StopAndGo IDs

Parse `granfondo-list-historical.md` to extract all `results.stopandgo.pro/{id}` URLs under the 2021–2022 year sections. Add extracted IDs to `SUPPLEMENTAL_EVENT_IDS` in `config.ts`. First check whether `discoverGranfondos()` already returns older IDs — if so, only non-standard-name events need explicit entries.

#### 2. Build a parameterized classificacoes.net scraper

The existing `scrapers/classificacoes.ts` is hardcoded to Etapa da Volta. Refactor it to accept an event ID and use it for:
- Bragança Granfondo 2021
- Porto Gaia Granfondo 2022

Note: the internal AJAX ID may differ from the URL slug — inspect the page HTML to find the mapping.

#### 3. Build a scraper for L'Étape Portugal 2022

`https://portugal.letapebytourdefrance.com/blog/race/resultados-2022` has no existing scraper platform. Inspect for a structured table or underlying API; implement `scrapers/letape.ts`.

#### 4. Wire everything into `external.ts` and `index.ts`

Assign 90xxx IDs to new external events (continuing from current max), add `StoredEvent` entries to `EXTERNAL_EVENTS`, call the appropriate scraper functions in `index.ts`.

#### 5. First-run scrape and validation

- Run `npm run scrape` — 2023–2026 events load from cache, only new historical IDs are fetched.
- Verify athlete ID stability: spot-check known athletes across years.
- Run `npm run db:find-team-aliases` — extra years will surface new team name variants.
- Review false-positive merge counts from the pipeline (more data = more fuzzy match risk).

### Performance notes

- Pipeline runtime will increase moderately with 2 extra years of data.
- First run will make ~26 new StopAndGo API calls; subsequent runs load from cache.

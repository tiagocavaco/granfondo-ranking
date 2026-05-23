# Scraper

Node.js scraper that fetches granfondo results, runs the athlete identity pipeline, and writes the encrypted SQLite database consumed by the frontend.

## Scripts

```bash
npm run scrape                    # incremental scrape (skips events in scraped-events.json)
npm run scrape:force              # re-scrape everything, ignore cache
npm run scrape:participants       # refresh upcoming event participant lists only
npm run db:manage -- list         # list manual overrides (aliases, assignments, team aliases)
npm run db:manage -- add team-alias --from F --to T
npm run db:manage -- remove team-alias --from F
npm run db:manage -- add alias --name X --team Y --alias-name A --alias-team B [--note N]
npm run db:manage -- add assignment --event-id E --bib B --athlete-id A [--note N]
npm run db:manage -- remove alias --name X
npm run db:manage -- remove assignment --event-id E --bib B
npm run db:find-splits            # scan for same-name athlete pairs that may be fragmented profiles
npm run db:apply-splits           # apply reviewed split decisions (rejected/applied lists)
npm run db:compact-ids            # close ID gaps in athletes and teams tables (run after profile splits)
npm run db:check                  # validate DB integrity: no ID gaps, no stale FK references
npm run db:check-team-orphans     # report team rows no longer referenced by any athlete
npm run db:find-team-aliases      # generate fuzzy team alias suggestions
npm run db:apply-team-aliases     # write reviewed alias suggestions into data.db.enc
npm run db:find-unlinked          # report upcoming-event participants with no athlete match
npm run db:check-participant-links # check participant→athlete link quality
npm run test
npm run test:watch
```

## Source layout

```
src/
  index.ts              Entry point — orchestrates scrape + pipeline + DB write
  config.ts             Static event config: seasons, supplemental IDs, participant URLs
  external.ts           External (non-StopAndGo) event definitions and upcoming overrides
  paths.ts              Filesystem path constants (DB_ENC_PATH, DATA_DIR, etc.)
  types.ts              Scraper-specific types (ApiAthlete, etc.)
  normalize.ts          normalizeName, teamNormalKey (with alias resolution), isSoloTeam, etc.
  transform.ts          Converts raw scraped rows into StoredResult format
  inject.ts             Injects resolved athlete IDs into result rows in-place

  db/
    write-db.ts         Builds and encrypts the SQLite DB from all pipeline output
    db-loader.ts        Reads/decrypts the existing DB for incremental scrapes
    manage-db.ts        CLI for manual DB overrides (aliases, assignments, team aliases)
    decrypt-db.ts       Debug utility — dumps the decrypted DB to a temp file
    encrypt.ts          AES-256-GCM encrypt/decrypt (Node.js crypto)
    alias-utils.ts      Alias chain flattening and lookup-key rewriting

  pipeline/
    events.ts           Per-event scraping: participant fetch, distance resolution, result scraping
    ranking.ts          Aggregate athlete ranking and team ranking computation
    participants/
      participants.ts         Resolves participant names → athlete IDs using multi-pass matching
      participants-refresh.ts Lightweight scrape that refreshes participant lists without the full pipeline

    results/            Athlete identity pipeline — builds the master athlete index
      results.ts        Orchestrator — runs all passes in order, owns PipelineCtx
      helpers.ts        Shared utilities: makeIdManager, addResult, deriveCanonicalTeam, etc.
      types.ts          PipelineCtx interface, IdManager, SoloCollisionFlag, CrossPassFlag, etc.
      passes/
        build-licence-profiles.ts     Licence holders matched by name + licence; authoritative
        enrich-licence-profiles.ts    Unlicensed team results matched to existing profiles by name + team
        remaining-team-profiles.ts    Remaining team results become new profiles
        merge-team-name-variants.ts   Full legal name → short name; missing-space variants (within team)
        manual-athlete-aliases.ts     Alias rules from DB merge duplicate identities early
        solo-intra-year.ts            Solo results grouped by (name, category, year); collision resolution
        solo-cross-year.ts            Cross-year solo profile merge
        team-cross-year.ts            Cross-year team-change merge
        team-solo-merge.ts            Team ↔ solo cross-pass merge
        manual-result-assignments.ts  Manual result assignments from DB (runs last)
        category-sweep-eviction.ts    Post-pass category-consistency eviction

  scrapers/
    stopandgo.ts        StopAndGo API (primary source for most events)
    apedalar.ts         apedalar.pt (Livewire-based, event 90003)
    classificacoes.ts   classificacoes.pt
    lap2go.ts           lap2go.pt
    waitastart.ts       waitastart.com
    timerspeed.ts       timerspeed.pt
    shared.ts           fetchWithRetry, cleanTime, makeResult — shared scraper utilities

  scripts/
    find-split-candidates.ts        Scans for same-name athlete pairs that may be fragmented profiles
    apply-split-reviews.ts          Applies reviewed split decisions from the rejected/applied JSON files
    compact-athlete-ids.ts          Closes ID gaps in athletes and teams (negative-temp-ID trick, remaps all FKs)
    check-post-scrape.ts            Validates DB integrity: no ID gaps, no stale FK references
    check-team-orphans.ts           Reports team rows no longer referenced by any athlete
    find-team-alias-candidates.ts   Suggests team aliases based on fuzzy similarity
    apply-team-aliases.ts           Writes suggested aliases into the DB
    find-unlinked-participants.ts   Reports upcoming-event participants with no athlete match
    check-participant-links.ts      Checks participant→athlete link quality
```

## Overall scrape pipeline (index.ts)

1. Load `scraped-events.json` + decrypt existing DB → seed team aliases and athlete IDs.
2. Discover StopAndGo events via API (`discoverGranfondos()`).
3. For each StopAndGo event: load results from cache or fetch from API (`events.ts`).
4. Scrape external events (lap2go, waitastart, apedalar, classificacoes) defined in `external.ts`.
5. Run athlete identity pipeline (`buildAthletesIndex()` in `pipeline/results/results.ts`) across all results.
6. Inject resolved athlete IDs back into result rows (`inject.ts`).
7. Resolve participant → athlete links for upcoming events (`participants/participants.ts`).
8. Build aggregate ranking and team ranking (`ranking.ts`).
9. Write encrypted DB (`write-db.ts`), update `scraped-events.json`.

`--participants` mode runs `scrapeParticipants()` in `participants/participants-refresh.ts` — refreshes participant lists for upcoming events without running the full athlete pipeline or rebuilding the DB from scratch.

## Athlete identity pipeline

The pipeline lives in `pipeline/results/`. `results.ts` is the orchestrator; each pass is a focused file in `passes/`. Passes run in this order:

| Pass | File | What it does |
|------|------|-------------|
| 1 | `build-licence-profiles.ts` | Creates profiles for licensed athletes matched by name + licence. Authoritative — results here are never moved by later passes. |
| 2 | `enrich-licence-profiles.ts` | Matches unlicensed team results to existing licence profiles by name + team. |
| 3 | `remaining-team-profiles.ts` | Remaining team results that didn't match any existing profile become new profiles. |
| 4 | `merge-team-name-variants.ts` | Within the same team: folds full legal names into short names (Portuguese/Spanish convention); merges missing-space variants (e.g. `"PedroGalante"` → `"Pedro Galante"`). |
| 5 | `manual-athlete-aliases.ts` | Applies alias rules from the DB to merge duplicate identities. Runs early so passes 6–10 see already-merged profiles. |
| 6 | `solo-intra-year.ts` | Groups solo (unaffiliated) results by (name, category, year); resolves intra-event collisions. |
| 7 | `solo-cross-year.ts` | Merges solo profiles across years for the same athlete. |
| 8 | `team-cross-year.ts` | Merges team profiles where the athlete changed club between years. |
| 9 | `team-solo-merge.ts` | Merges team and solo profiles that belong to the same athlete. Depends on passes 6–7 having already built solo profiles. |
| 10 | `manual-result-assignments.ts` | Applies manual result assignments from the DB. Runs last so it can override any pipeline decision. |
| post | `category-sweep-eviction.ts` | Evicts results that are category outliers on a profile, guarding against misidentification. |

Shared infrastructure (`helpers.ts`, `types.ts`) lives alongside `results.ts`, one level above the pass files.

Athlete IDs are seeded from the existing DB at startup so they remain stable across scrapes.

### Ordering rationale

- **Pass 5 (manual aliases) runs before solo passes** so that passes 6–9 see merged profiles and don't create duplicate solo entries for already-aliased athletes.
- **Passes 8–9 (team/solo merge) run after pass 6–7** because pass 9 (`team-solo-merge`) has a hard dependency on solo profiles existing.
- **Pass 10 (manual assignments) runs last** so it can override any pipeline-matched result without interference.
- **Post-pass eviction runs after manual assignments** so manually pinned results are protected from eviction via `manualAssignments`.

### Manual assignment invariants — do not regress

`applyManualResultAssignments` in `manual-result-assignments.ts` has two non-obvious invariants:

1. **Already-on-target path must call `manualAssignments.add(...)`** — even when the assigned result is already on the correct athlete. Without this, the post-pass category-consistency sweep can evict it as an outlier.
2. **Evict before push** — when moving a result to the target athlete, first remove any existing result on that athlete for the same `(eventId, distance)`. Without this, both the pipeline-matched result and the manually assigned result land on the same athlete, causing `UNIQUE constraint failed` in the DB writer.

**Never add `onConflictDoNothing`** to the `athlete_results` insert in `write-db.ts` to silence that error — it masks pipeline bugs. The uniqueness invariant must hold before the DB write.

### Athlete ID stability and alias changes

The athlete lookup key is `normalizeName(name)|teamId` where `teamId` is the numeric ID from the `teams` table (0 for solo/unaffiliated athletes).

Adding a team alias rewrites `athlete_lookup` keys automatically (via `rewriteLookupKeysForAlias` in `alias-utils.ts`), so ID seeds remain stable across alias changes.

**Removing or changing a team alias changes which `teamId` maps to which athletes**, which can cause profile splits for athletes who raced under both the alias and canonical team name:

- Old `/athlete/:id` URLs break for affected athletes after the next scrape.
- Athletes who raced under both names may split into two entries.

This is expected behaviour — it is the cost of correcting a wrong alias merge. After fixing aliases, run a full scrape and update any known bookmarked URLs.

### ID compaction after profile splits

Any change that causes profile splits (adding a `SOLO_TEAM_KEYS` entry, correcting a team alias, running a split review) leaves gaps in `athletes.id`. Run:

```bash
npm run db:compact-ids   # close gaps: remaps all FK references, verifies correctness
npm run scrape           # reseed IDs from the compacted DB
npm run db:check         # confirm: zero gaps, zero stale FKs
```

Two compact+scrape cycles are sometimes needed if the first scrape itself introduces new splits.

### SOLO_TEAM_KEYS — "no team" values

`SOLO_TEAM_KEYS` in `database/src/normalize.ts` controls which team strings are treated as unaffiliated (no team profile, no team ranking contribution). The set includes `"n team"` which covers the Scandinavian placeholder `"Nøteam"` — the ø is stripped to a space by `normalizeTeam`, producing `"n team"`.

### Split candidate workflow

Fragmented athlete profiles (same person as two separate entries) are managed via two committed JSON files:

- `split-candidates-rejected.json` — pairs confirmed to be genuinely different athletes
- `split-candidates-applied.json` — pairs already merged via athlete aliases

```bash
npm run db:find-splits   # scans DB, writes split-candidates.json (gitignored), prints pending pairs
npm run db:apply-splits  # reads split-candidates-reviewed.json, updates rejected/applied lists
```

The skip-lists match on **stable `name|team||name|team` keys** (not IDs) so decisions survive ID compaction.

## Incremental scrape

`scraped-events.json` (committed, no PII) maps `eventId → scrapedAt`. Events present here are loaded from the existing `data.db.enc` instead of hitting the API. Remove an entry to force a re-scrape of that event.

## DB is rebuilt from scratch on every scrape

The scraper does not patch the existing DB — it builds a new in-memory SQLite from all results (cached or freshly fetched), runs the full pipeline, then encrypts and overwrites `data.db.enc`. The only state carried over from run to run is:
1. Athlete IDs (seeded from the previous DB's `athletes` table).
2. Manual overrides (read from the previous DB's override tables and re-applied).
3. `scraped-events.json` (controls which events are loaded from cache vs re-fetched).

## Manual overrides — only safe via `manage-db.ts`

`manage-db.ts` is the **only safe way** to make persistent manual changes to the DB. It reads `data.db.enc`, applies the change, and re-encrypts in place.

**Any other direct edits to `data.db.enc` will be overwritten on the next scrape** — the scraper always rebuilds the DB from scratch and re-applies the manual override tables stored inside the DB itself.

The three override types:
- **Athlete alias** — merges two name/team combinations into one athlete ID (e.g. athlete who raced under a different name at one event).
- **Result assignment** — forces a specific bib at a specific event to be linked to a specific athlete ID (e.g. category error where the event used the wrong category label).
- **Team alias** — merges team name variants into a canonical name.

## Team aliases

Team aliases merge different spellings of the same club. An alias maps `aliasKey → canonicalKey` (both are `normalizeTeam()` outputs). Chains are **flattened on write** — both `manage-db.ts` and `apply-team-aliases.ts` call `validateAndFlattenAlias()` which rewrites any intermediate hops so every alias points directly to the canonical.

`teamNormalKey(name)` in `normalize.ts` follows alias chains transitively (loop with cycle detection) as a safety net, but in practice all chains are already flat after being written.

### Team alias workflow

1. `npm run db:find-team-aliases` — generates `scraper/team-alias-candidates.json` (gitignored) with fuzzy-matched suggestions.
2. Review the file manually — remove false positives (clubs that look similar but are different).
3. `npm run db:apply-team-aliases` — writes the reviewed candidates into `data.db.enc`.
4. Commit `data.db.enc`.
5. Run `npm run scrape` — aliases are applied during the pipeline and the DB is rebuilt with merged teams.

For one-off aliases use `npm run db:manage -- add team-alias --from F --to T` directly.

## Adding a new event

### StopAndGo-hosted event
1. Add the event ID to `SUPPLEMENTAL_EVENT_IDS` in `config.ts` if StopAndGo doesn't name it with "granfondo".
2. Add participant list URL to `LISTA_URLS`, `APEDALAR_PARTICIPANT_URLS`, or `REGISTRATIONS_URLS` as appropriate.
3. Add `OFFICIAL_EVENT_URLS` entry if the organiser has a dedicated page.
4. Run `npm run scrape` — the event will be auto-discovered and scraped.

### Non-StopAndGo event (lap2go, waitastart, apedalar, classificacoes)

These events use IDs in the 90000+ range and are defined in `external.ts`, not discovered automatically.

1. Add a `StoredEvent` entry to `EXTERNAL_EVENTS` (past events) or `MANUAL_UPCOMING_EVENTS` (upcoming) in `external.ts` with a manually assigned ID (90001, 90002, …).
2. Wire up the matching scraper function from `scrapers/` — import it in `external.ts` and call it in `index.ts` in the external events scrape block.
3. If the event has a participant list, add the appropriate URL to `config.ts`.

## Scraper-specific quirks

### apedalar.pt (event 90003 and similar)

The results page uses Laravel Livewire. Key gotchas:
- **Gap times** are in a `hidden xl:table-cell` column, not `sm:table-cell` — use a separate regex for `xl:table-cell px-4 py-3 font-mono` to extract the gap.
- The winner's gap is `"-:--:--.---"` — treat this as 0 seconds.
- Category (escalao) requires separate Livewire requests per escalao option — only one property can be updated per request (Livewire ignores the second property if two are sent together).
- Fetching by gender (`sexo`) and by distance (`percurso`) are separate requests; combine male/female base HTML then overlay categories from per-escalao requests.

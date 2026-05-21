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
  config.ts             Static event config: seasons, supplemental IDs, URLs
  normalize.ts          teamNormalKey (with alias resolution), normalizeName, etc.
  transform.ts          Converts raw scraped rows into StoredResult format
  db/
    write-db.ts         Encrypts and writes data.db.enc
    db-loader.ts        Reads/decrypts the existing DB for incremental scrapes
    manage-db.ts        CLI for manual DB overrides
    decrypt-db.ts       Utility to dump the decrypted DB for debugging
    encrypt.ts          AES-256-GCM encrypt/decrypt (Node.js crypto)
  pipeline/
    pipeline.ts         Multi-pass athlete identity resolution (9 passes)
    ranking.ts          Athlete and team ranking computation
    event-pipeline.ts   Per-event result processing
    participants.ts     Participant list processing
    inject.ts           Injects athlete IDs into results
  scrapers/
    stopandgo.ts        StopAndGo API (primary source for most events)
    apedalar.ts         apedalar.pt (Livewire-based, event 90003)
    classificacoes.ts   classificacoes.pt
    lap2go.ts           lap2go.pt
    waitastart.ts       waitastart.com
    shared.ts           fetchWithRetry, cleanTime, makeResult
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

## Incremental scrape

`scraped-events.json` (committed, no PII) maps `eventId → scrapedAt`. Events present here are loaded from the existing `data.db.enc` instead of hitting the API. Remove an entry to force a re-scrape of that event.

## Athlete identity pipeline

Nine passes in `pipeline.ts`, roughly:
1. Exact name + team match
2. Name + fuzzy team match
3. Name-only match (within team group)
4. Cross-team name match with licence/result overlap
5–9. Progressive relaxation and ID assignment for new athletes

Athlete IDs are seeded from the existing DB so they remain stable across scrapes.

### Athlete ID stability and alias changes

The athlete lookup key is `normalizeName(name)|teamId` where `teamId` is the numeric ID from the `teams` table (0 for solo/unaffiliated athletes). This replaced an older string-based `name|canonicalTeamKey` format — if you encounter entries in that old format, run `npm run db:manage -- migrate-lookup-keys` once to convert them.

Adding a team alias now also rewrites `athlete_lookup` keys automatically (via `rewriteLookupKeysForAlias` in `alias-utils.ts`), so ID seeds remain stable across alias changes.

**Removing or changing a team alias still changes which `teamId` maps to which athletes**, which can cause profile splits for athletes who raced under both the alias and canonical team. This means:

- Old `/athlete/:id` URLs break for affected athletes after the next scrape.
- Athletes who raced under both the alias and canonical team names may be split into two entries.

This is expected behaviour — it is the cost of correcting wrong alias merges. After fixing aliases, run a full scrape and update any known bookmarked URLs.

### ID compaction after profile splits

Any pipeline change that causes profile splits (e.g. adding a `SOLO_TEAM_KEYS` entry, correcting a team alias, running a split review) will leave gaps in `athletes.id`. Run:

```bash
npm run db:compact-ids   # close gaps: remaps all FK references, verifies correctness
npm run scrape           # reseed IDs from the compacted DB
npm run db:check         # confirm: zero gaps, zero stale FKs
```

Two compact+scrape cycles are sometimes needed if the first scrape itself introduces new splits.

### SOLO_TEAM_KEYS — "no team" values

`SOLO_TEAM_KEYS` in `database/src/normalize.ts` controls which team strings are treated as unaffiliated (no team profile, no team ranking contribution). The set includes `"n team"` which covers the Scandinavian placeholder `"Nøteam"` — the ø is stripped to a space by the `[^a-z0-9 ]` replacement in `normalizeTeam`, producing `"n team"`.

### Split candidate workflow

Fragmented athlete profiles (same person appearing as two separate entries) are managed via two committed JSON files:

- `split-candidates-rejected.json` — pairs confirmed to be genuinely different athletes
- `split-candidates-applied.json` — pairs already merged via athlete aliases

```bash
npm run db:find-splits   # scans DB, writes split-candidates.json (gitignored), prints pending pairs
npm run db:apply-splits  # reads split-candidates-reviewed.json, updates rejected/applied lists
```

The skip-lists match on **stable `name|team||name|team` keys** (not IDs) so decisions survive ID compaction.

## Scraper-specific quirks

### apedalar.pt (event 90003 and similar)

The results page uses Laravel Livewire. Key gotchas:
- **Gap times** are in a `hidden xl:table-cell` column, not `sm:table-cell` — use a separate regex for `xl:table-cell px-4 py-3 font-mono` to extract the gap.
- The winner's gap is `"-:--:--.---"` — treat this as 0 seconds.
- Category (escalao) requires separate Livewire requests per escalao option — only one property can be updated per request (Livewire ignores the second property if two are sent together).
- Fetching by gender (`sexo`) and by distance (`percurso`) are separate requests; combine male/female base HTML then overlay categories from per-escalao requests.

## Overall scrape pipeline (index.ts)

1. Load `scraped-events.json` + decrypt existing DB → seed team aliases and athlete IDs.
2. Discover StopAndGo events via API (`discoverGranfondos()`).
3. For each StopAndGo event: load from cache or fetch from API (`event-pipeline.ts`).
4. Scrape external events (lap2go, waitastart, apedalar, classificacoes) defined in `external.ts`.
5. Run athlete identity pipeline (`buildAthletesIndex()` in `pipeline.ts`) across all results.
6. Resolve participant → athlete links for upcoming events.
7. Build aggregate ranking (`buildAggregateRanking()`).
8. Build team ranking (`buildTeamRanking()`).
9. Write encrypted DB (`writeEncryptedDatabase()`), update `scraped-events.json`.

`--participants` mode skips to a separate code path (`scrapeParticipants()` in `participants-update.ts`) that only refreshes participant lists for upcoming events — it does not run the full pipeline or rebuild the DB.

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
3. If the event has a participant list, add the appropriate URL to `config.ts` (`APEDALAR_PARTICIPANT_URLS` or equivalent).

## Team aliases

Team aliases merge different spellings of the same club. An alias maps `aliasKey → canonicalKey` (both are `normalizeTeam()` outputs). Chains are **flattened on write** — both `manage-db.ts` and `apply-team-aliases.ts` call `validateAndFlattenAlias()` which rewrites any intermediate hops so every alias points directly to the canonical. Use `npm run db:manage -- add team-alias` to add, and `find-team-alias-candidates.ts` to discover candidates.

`teamNormalKey(name)` in `normalize.ts` follows alias chains transitively (loop with cycle detection) as a safety net, but in practice all chains are already flat after being written.

### Team alias workflow

1. `npm run db:find-team-aliases` — generates `scraper/team-alias-candidates.json` (gitignored) with fuzzy-matched alias suggestions.
2. Review the file manually — remove false positives (clubs that look similar but are different).
3. `npm run db:apply-team-aliases` — writes the reviewed candidates into `data.db.enc` as team aliases.
4. Commit `data.db.enc`.
5. Run `npm run scrape` — aliases are applied during the pipeline and the DB is rebuilt with merged teams.

For one-off aliases use `npm run db:manage -- add team-alias --from F --to T` directly (skips the candidate file).

## Manual overrides — only safe via `manage-db.ts`

`manage-db.ts` is the **only safe way** to make persistent manual changes to the DB (athlete aliases, result assignments, team aliases). It reads `data.db.enc`, applies the change, and re-encrypts in place.

**Any other direct edits to `data.db.enc` will be overwritten on the next scrape** — the scraper always rebuilds the DB from scratch from the scraped results plus the manual override tables stored inside the DB itself.

The three override types:
- **Athlete alias** — merges two name/team combinations into one athlete ID (e.g. athlete who raced under a different name at one event).
- **Result assignment** — forces a specific bib at a specific event to be linked to a specific athlete ID (e.g. category error where the event used the wrong category label).
- **Team alias** — merges team name variants into a canonical name.

### Pass 9 invariants — do not regress

Pass 9 (`runPass9` in `pipeline.ts`) applies manual result assignments. Two non-obvious invariants:

1. **Already-on-target path must call `manualAssignments.add(...)`** — even when the assigned result is already on the correct athlete. Without this, the post-pass category-consistency sweep can evict the result as an outlier.
2. **Evict before push** — when moving a result to the target athlete, first remove any existing result on that athlete for the same `(eventId, distance)`. Without this, both the pipeline-matched result and the manually assigned result land on the same athlete, causing `UNIQUE constraint failed: athlete_results.athlete_id, athlete_results.event_id, athlete_results.distance` in the db-writer.

**Never add `onConflictDoNothing`** to the `athlete_results` insert in `db-writer.ts` to silence that error — it masks pipeline bugs. The uniqueness invariant must hold before the DB write.

## DB is rebuilt from scratch on every scrape

The scraper does not patch the existing DB — it builds a new in-memory SQLite from all results (cached or freshly fetched), runs the full pipeline, then encrypts and overwrites `data.db.enc`. The only state carried over from run to run is:
1. Athlete IDs (seeded from the previous DB's `athletes` table).
2. Manual overrides (read from the previous DB's override tables and re-applied).
3. `scraped-events.json` (controls which events are loaded from cache vs re-fetched).

# 04 — Handoff Guide for the Engine

Written for an agent or engineer arriving with no context. It does not
repeat `scraper/CLAUDE.md`; it adds what you need to act on the issues and
plan in this folder: vocabulary, key formats, exact pointers, how to verify a
fix, and how every number in these documents was produced.

---

## 1. Vocabulary

| Term | Meaning |
|------|---------|
| **Event** | One edition of a race, identified by a StopAndGo numeric ID (e.g. 1956) or a 9xxxx ID assigned by hand for external sources (`scraper/src/external.ts`). |
| **Distance** | A course within an event. Canonical names are exactly `Granfondo`, `Mediofondo`, `Minifondo`, `Time Trial` (`utils/src/distance.ts`). Raw names like "BIG DAY" or "Clássica Longa" are mapped by `DISTANCE_ALIASES` in `database/src/normalize.ts`. |
| **Result** | One row of a results list: bib, name, team, category, time. Lives in the `results` table with `athlete_id` filled in by `inject.ts`. |
| **Participant** | One row of a start list for an upcoming event. `participants.athlete_id` is 0 when not linked. |
| **Athlete / profile** | A person the pipeline believes exists, with a stable integer ID. Stored in `athletes`; their results denormalised into `athlete_results`. |
| **Solo** | A result whose team string means "no club": `SOLO_TEAM_KEYS` in `database/src/normalize.ts`. Solo results are grouped by name + category + year instead of name + team. |
| **Team key** | `normalizeTeam(rawTeam)` — lowercase, no accents, punctuation removed, 1–3 letter tokens merged. Then alias-resolved by `teamNormalKey` to a canonical key. Canonical keys map to `teams.id`. |
| **Licence** | Federation number from the StopAndGo API (`licenca1`, `licenca2`), normalised by `normalizeLicence` in `transform.ts`. Dummy values filtered by `isValidLicence`. Strongest identity signal. |
| **Canonical category** | Output of `canonicalizeCategory` in `utils/src/category.ts`: one of `Elite`, `Open 19-34`, `Masters A–F` with ` Male`/` Female`, or `E-Bike`, `Paracycling`, `Unknown`. Used for identity checks. Raw strings are kept for display. |
| **Category rank** | Age band ordinal, `SOLO_CAT_RANK` in `helpers.ts`. Riders can only move up over time; skipping a band needs ~10 years. |
| **Percentile** | `genderPos / finisherCount` for a result. Profiles are compared by median percentile to reject merges between a front-runner and a back-marker who share a name. |
| **Golden rule** | One profile can never hold two results from the same (event, distance). Enforced in code and by `uq_athlete_results_race`. |
| **Flag** | A case the pipeline refused to decide: `SoloCollisionFlag` (same name, same event, twice) or `CrossPassFlag` (solo profile matches several team profiles). Written to `scraper/solo-flags.json` and `scraper/cross-pass-flags.json`, both gitignored. |
| **Override** | A manual rule stored inside the DB: athlete alias, result assignment, block, or team alias. Only `scraper/src/db/manage-db.ts` or the backoffice should write these. |
| **Stable / cached event** | An event ID present in `scraper/scraped-events.json`. Its results are read from the previous DB instead of the network. Delete the entry to force a re-scrape. |

## 2. Key formats (you will see these in `athlete_lookup.key` and in flag files)

| Shape | Example | Meaning |
|-------|---------|---------|
| `name\|<teamId>` | `pedro merendeiro\|7` | Team athlete. `name` is `normalizeName(rawName)`. |
| `name\|0` | `ana silva\|0` | Licensed athlete with no team result. |
| `name\|0:<licence>` | `ana silva\|0:12345` | Two licences collided on the same solo key; disambiguated. |
| `name\|` | `rui costa\|` | Solo athlete without category (rare). |
| `name\|solo:<Canon Cat>:<year>` | `rui costa\|solo:Masters B Male:2026` | Solo group profile for one season. |
| `name\|solo:<Canon Cat>:<year>:<bib>` | `rui costa\|solo:Masters B Male:2026:812` | Collision routed to a bib-specific profile. |
| `BLOCK:<athleteId>` | `BLOCK:4211` | Destination profile for results evicted by a block rule. |

The `athlete_lookup` table written to the DB contains only canonical keys,
every team key the athlete raced under, and active alias keys. Stale keys are
deliberately excluded (see the long comment in `scraper/src/index.ts` around
`seedNameToId`).

## 3. Where each P0/P1 issue lives and how to verify the fix

| Issue | File and function | Verify |
|-------|-------------------|--------|
| A1 Sunday scrape window (latent) | `.github/workflows/scrape-results.yml`, step "Check event window", Python block: `if 0 <= diff <= 1` and cron `0 20 * * 0` | After change, run the Python block locally with `today` forced to Monday/Tuesday after a Sunday date in `scraper/event-schedule.json`; it must print `run=true`. |
| A2 Saturday participants window | `.github/workflows/scrape-participants.yml`, `if -3 <= diff <= -2`, cron `0 20 * * 5` | Same technique with a Saturday date; Friday must yield `run=true`. |
| A3 flags invisible | `scraper/src/index.ts#writeJson`, `.gitignore` | After Phase 2.1, the workflow run page shows a `scrape-summary` artefact. |
| A4 stale sanity minimums | `scraper/src/db/write-db.ts#MINIMUMS` | Unit test: buildDatabase with 80% of previous counts must throw. |
| B1 registrations parser | `scraper/src/scrapers/stopandgo.ts#parseRegistrationsPage`, branch `isNewLayout` | `node docs/engine/tools/db-metrics.mjs` → `suspicious_single_letter_participant_names` must be 0 for upcoming events after re-scraping 2115, 2114 and 1942 (historical lists for 1798 and 1700 can only be fixed by a forced re-scrape of those events, which is optional) (delete nothing; run `npm run scrape:participants`). Add a fixture test with the saved HTML of `https://stopandgo.net/events/granfondo-serra-d-ossa-2026/registrations`. |
| B10 raw participant distance | `database/src/db-writer.ts#insertParticipants` (no `normalizeDistance`); `api/src/predictions.ts#groupPredictions` + `computeWeightedScore`; `utils/src/distance.ts#predictionDistCoeff` returns 0 for unknown names | `select distinct distance from participants` returns only canonical names; `/event/1943/predictions` opens on Granfondo with ranked favourites. |
| B9 Caminhada/Kids participants | `scraper/src/pipeline/events.ts#apiAthleteToParticipant`; `scraper/src/scrapers/stopandgo.ts#scrapeListaParticipants`, `#parseRegistrationsPage`; `scraper/src/transform.ts#extractDistances` | After re-scraping participants: `select distinct distance from participants` contains only road distances; `/event/1943/predictions` shows three tabs. |
| B3 manual per-season config | `scraper/src/config.ts`: `SUPPLEMENTAL_EVENT_IDS`, `OFFICIAL_EVENT_URLS`, `DEFAULT_DISTANCES`, `LISTA_URLS`, `REGISTRATIONS_URLS`, `APEDALAR_PARTICIPANT_URLS`; `scraper/src/external.ts` | Phase 3 registry replaces all six. |
| C1 coefficient semantics | `scraper/src/pipeline/ranking.ts#finisherCoefficient(finishers.length)`; docs text in `frontend/src/components/athlete-ranking/AthleteRankingInfoPage.tsx` | `db-metrics.mjs` → `coefficient_sample` shows M and F coefficients for the latest event; they must either be equal (per-distance choice) or the info page must say "per gender field". |
| D1 review backlog | Flag files listed above; decisions in `scraper/split-candidates-{applied,rejected}.json`, `licence-split-candidates.json`, `team-alias-candidates.json`, `athlete-anchored-team-aliases.json` | Counts in `metrics.json → review_backlog`; recompute with the `node -e` snippet in section 6. |
| E1 browser payload | `database/src/db-writer.ts` `buildDatabase` (writes every table), `scraper/src/db/write-db.ts` (encrypts), `database/src/decrypt.ts` + `db-client.ts` (browser side) | Phase 4; acceptance is `core.db.enc` ≤ 3 MB. |
| F1 untested adapters | Coverage table in `metrics.json → tests.scraper_low_coverage_files` | `npm run test:coverage --workspace=scraper` |

## 4. Non-obvious behaviours to keep in mind before changing anything

- **The DB is rebuilt from scratch every run.** Editing `data.db.enc` any way other than `manage-db.ts`/backoffice is overwritten on the next scrape. Overrides live inside the DB and are re-read at startup.
- **`--ours` / `--theirs` are reversed during rebase** for `data.db.enc`; see root `CLAUDE.md`. Losing the local copy loses uncommitted overrides.
- **Athlete IDs are seeded from the previous DB.** A fresh clone without `data.db.enc` would mint all-new IDs and break every shared `/athlete/:id` link. Never run a full scrape without the current DB present and `DATA_KEY` set.
- **Removing or changing a team alias can split profiles** and leave ID gaps; the documented recovery is `db:compact-ids` → `scrape` → `db:check`, sometimes twice.
- **Manual assignments must call `manualAssignments.add`** even when the result is already on the target, and must evict the conflicting slot before pushing. Both invariants are explained in `scraper/CLAUDE.md`; tests exist in `manual-result-assignments.test.ts`.
- **`evict-blocked-results` runs between manual assignments and the category sweep** and is not in the CLAUDE.md pass table. Read `scraper/src/pipeline/results/results.ts#evictBlockedResults`.
- **Pass order matters** and is justified in `scraper/CLAUDE.md` → "Ordering rationale". Do not reorder without updating the golden test proposed in Phase 1.2.
- **Distance names are re-derived by winner time** when an event has more than one distance (`events.ts`), because organisers' distance IDs do not always match names. A wrong winner time (e.g. a DNF marked as position 1) would relabel distances.
- **`isPast` is evaluated in the runner's local timezone**; CI runs in UTC.
- **Participant refresh mode** (`--participants`) does not run the identity pipeline; it links names against the existing `athlete_lookup` only. New athletes cannot be created there.
- **Both scheduled workflows push directly to `main`** with a PAT and trigger the Pages deploy through the `frontend/**` path filter. There is no staging.

## 5. Commands cheat sheet

```bash
# Tests and quality
npm test                                   # all workspaces
npm run test:coverage --workspace=scraper  # coverage with thresholds (not run in CI today)
npm run typecheck && npm run lint && npm run format:check

# Scraping (needs scraper/.env with DATA_KEY and the current data.db.enc)
npm run scrape                 # incremental; cached events from previous DB
npm run scrape:force           # ignore cache
npm run scrape:participants    # start lists only, no pipeline
# force one event to re-scrape: remove its key from scraper/scraped-events.json

# Data operations (all in scraper/)
npm run db:check               # ID gaps, orphans, top-3 per slice
npm run db:manage -- list      # all overrides
npm run db:find-splits / db:find-licence-splits / db:apply-splits
npm run db:find-team-aliases / db:find-athlete-anchored-aliases / db:apply-team-aliases
npm run db:compact-ids         # after any split-causing change
npm run decrypt-db             # writes plaintext to /tmp/granfondo.db — delete it afterwards

# Inspect the DB without writing plaintext
cd frontend && node ../docs/engine/tools/db-metrics.mjs
```

## 6. How every number in these docs was produced

| Number | Method |
|--------|--------|
| DB metrics (`metrics.json → database`) | `docs/engine/tools/db-metrics.mjs` plus ad-hoc SQL of the same shape; decrypt in memory with `webcrypto`, load with `sql.js`. |
| Compressed size (12.8 MB brotli / 17.7 MB gzip) | Decrypt in memory, `zlib.brotliCompressSync(plain, {quality: 9})` / `zlib.gzipSync(plain, {level: 9})`. |
| Review backlog | `node -e 'const r=p=>JSON.parse(require("fs").readFileSync("scraper/"+p)); console.log(r("cross-pass-flags.json").length, r("solo-flags.json").length, r("split-candidates-rejected.json").length, r("split-candidates-applied.json").length)'` |
| Test counts and coverage | `npm run test:coverage --workspace=<ws>` for each of scraper, database, utils, api. |
| Git effort | `git log --format='%h %ad' --date=short -- scraper database utils api | wc -l` and `git log --shortstat --format='' -- scraper/src database/src utils/src api/src`. |
| Coefficient check | SQL joining `aggregate_results` to `aggregate_athletes` for event 2071, grouped by gender, compared to `results.finisher_count` and a per-gender count. |
| Parser bug evidence | `select name, team, category from participants where event_id=2115 and athlete_id=0 limit 12` shows single-letter names with the real name in `team`. |
| Scheduling gap | Read the two workflow files. Note: `gh run list --workflow=scrape-results.yml` shows the 13 Sep run succeeded and `origin/main` has 1956 cached; the local branch was behind. The gap is in the window arithmetic, not yet in observed behaviour. |

## 7. Things this analysis did not do

- Did not run `npm run scrape` (it hits the StopAndGo API and rewrites `data.db.enc`).
- Did not exercise the backoffice app or its Express admin middleware.
- Did not read the bodies of the fourteen maintenance scripts beyond their headers and the parts quoted in the issues; `compact-athlete-ids.ts` and `find-split-candidates.ts` deserve their own review before Phase 6.
- Did not review `database/migrations/*.sql` line by line; the schema was read from `schema.ts`.
- Did not measure scrape runtime.

## 8. If you only have an hour

1. Read `scraper/CLAUDE.md` (15 min).
2. Read `02-issues-found.md` sections A and B (10 min).
3. Fix A1, A2 and B1 per section 3 of this guide (30 min).
4. Run `npm run scrape:participants` locally, then `node docs/engine/tools/db-metrics.mjs`, and confirm `suspicious_single_letter_participant_names` is 0 (5 min).

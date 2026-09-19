# 01 — Engine Architecture Analysis

## 1. What the engine does

Every scrape rebuilds the whole world from scratch. There is no incremental
patching of the database. The only state that survives from run to run is:

1. The previous `data.db.enc`, from which cached event results, athlete IDs,
   team IDs and the four manual-override tables are read.
2. `scraped-events.json`, which says which event IDs are stable and may be
   served from cache instead of the network.
3. `event-schedule.json`, which the CI workflows read to decide whether to run.

```
discoverGranfondos()            StopAndGo xcrono + stopandgo.net (name filter + SUPPLEMENTAL_EVENT_IDS)
   │
   ├─ scrapeEvent() per event    cached from previous DB, or live: participants → distances → results per distance
   ├─ EXTERNAL_EVENTS            lap2go, waitastart, apedalar (Livewire), timerspeed (.clax), classificacoes
   └─ MANUAL_UPCOMING_EVENTS     start lists only
   │
   ▼
normalizeEventName, computeGaps, assignGenderPositions, assignCategoryPositions
   │
   ▼
buildAthletesIndex()            12 passes (below) → Map<key, AthleteEntry>, stable IDs, review flags
   │
   ├─ injectAthleteIds()         write athlete_id back onto each raw result row (by pos, name fallback for ties)
   ├─ resolveParticipantAthleteIds()   6 passes linking start-list names to profiles
   ├─ buildAggregateRanking()    per year/distance/gender, top-50 gender positions × √(finishers/300)
   └─ buildTeamRanking()         per year/distance, ≥3 finishers, top-3 overall positions, √(teams/25)
   │
   ▼
buildDatabase()                 Drizzle migrations → 21 tables → serialize → AES-256-GCM → data.db.enc
```

## 2. The identity pipeline, pass by pass

| # | Pass | Signal used | Guard rails |
|---|------|-------------|-------------|
| 1 | `build-licence-profiles` | Licence number (42% of results carry one) | Levenshtein ≤ 2 for name variants under one licence; majority vote for outliers; co-occurrence of two licences on one row proves same person; different bib in same slot proves different people |
| 2 | `enrich-licence-profiles` | Name + fuzzy team | Only when exactly one candidate |
| 3 | `remaining-team-profiles` | Name + team ID | Creates new profiles |
| 4a | `merge-team-name-variants` (legal) | First+last (PT) or first+second (ES) token match within team | Exactly one candidate in both directions; licence conflict blocks |
| 4b | `merge-team-name-variants` (space) | Same string ignoring spaces within team | Exactly two members; licence conflict blocks |
| 5 | `manual-athlete-aliases` | DB rule | Unconditional |
| 6 | `solo-intra-year` | Name + canonical category + year | Same-event collisions resolved by distance, then percentile vs. median, else flagged |
| 7 | `solo-cross-year` | Same name across years | Category transition must be physically possible (rank non-decreasing, ~10 years per skipped band) |
| 8 | `team-cross-year` | Same name, non-overlapping years | Category transition, shared distance, percentile within 0.25, same country; shared licence bypasses |
| 9 | `team-solo-merge` | Solo profile → team profile | Golden rule: no shared event, including via ID siblings; distance, percentile, country, category; exactly one candidate else flagged |
| 10 | `evict-blocked-results` | DB block rule | Moves results to `BLOCK:<id>` profile |
| 11 | `manual-result-assignments` | DB assignment | Evicts conflicting slot, re-homes evicted result, protects from sweep |
| 12 | `category-sweep-eviction` | Category progression over years | Evicts results whose category is impossible for the profile, re-homes them |

Design qualities worth naming:

- **Licence-first, then progressively weaker signals.** Every merge pass
  checks `licencesConflict` so a weaker signal can never override a stronger one.
- **The "golden rule".** Two results at the same event can never belong to
  one profile. It is enforced in passes 1, 8, 9, 11 and finally by a unique
  index in the DB, and the CLAUDE.md explicitly forbids silencing that index.
  On the current DB the violation count is zero.
- **Category physics.** `isValidCatTransition` encodes that riders age
  forward only and that skipping a masters band needs a decade. This is used
  both to merge and to evict, which is what makes cross-year merges safe.
- **Stability engineering.** IDs are seeded from the previous DB for the
  canonical key and for every team key the athlete has raced under, so a
  profile that the pipeline temporarily splits before the merge passes still
  lands on the same ID. `compact-athlete-ids` closes gaps with a
  snapshot-verify-vacuum cycle.
- **Human-in-the-loop by design.** Ambiguous cases are flagged, not guessed.
  Review decisions are keyed by stable `name|team` strings so they survive
  ID compaction.

## 3. Scoring

- Athlete: base points for gender position 1–50 (75 down to 1), multiplied by
  `√(n/300)` rounded to 2 dp. Ties broken by best position.
- Team: teams with ≥3 finishers in a distance are ranked by the sum of their
  top-3 overall positions; top 10 score 25 down to 1, multiplied by
  `√(eligibleTeams/25)`.
- Predictions: for each linked registrant, sum of aggregate points per
  (distance, year) × distance transfer coefficient (±0.2 per step) × year
  decay (−0.1 per year). Unlinked registrants count as "newcomers".

## 4. Data model

21 tables. Three groups:

- **Source of truth**: `events`, `event_distances`, `results`, `result_licences`, `participants`.
- **Derived**: `athletes`, `athlete_teams`, `athlete_categories`, `athlete_results`
  (a denormalised copy of `results` keyed by athlete), `athlete_lookup`,
  `teams`, `aggregate_athletes` + `aggregate_results`, `team_ranking` +
  `team_race_results` + `team_race_athletes`, `stats`.
- **Manual overrides**: `athlete_alias_rules`, `result_assignments`, `blocked_results`,
  plus `teams.alias_keys` (JSON array column).

Schema is Drizzle-managed with ten migrations; the same schema module is
imported by the browser client, so type drift between scraper and frontend is
impossible.

## 5. Measured quality of the output

| Metric | Value | Reading |
|--------|-------|---------|
| Finishing results without an athlete link | 113 / 74,663 (0.15%) | Excellent |
| Duplicate (athlete, event, distance) slots | 0 | Golden rule holds |
| Results carrying a licence | 42% | The strongest signal covers under half the data |
| Athletes with exactly one result | 11,638 / 23,766 (49%) | Expected for mass events, but also where fragmentation hides |
| Athletes sharing a normalised name with another profile | 12,020 in 3,388 groups | The ambiguity space the pipeline works in; 3,657 pairs already reviewed and rejected, 419 merged |
| Teams with a single athlete | 2,129 / 4,557 | Noise from sponsor-suffix variants; 1,207 teams already carry aliases |
| Distinct raw category strings | 182 | Mapped by a 180-entry table plus regex fallback |
| Participant link rate, typical past event | 70–80% | Good |
| Participant link rate, Serra d'Ossa 2026 | 16% | Parser bug, see issues B1 |
| Open review flags per run | 803 cross-pass + 59 solo | Written to gitignored files; invisible in CI |

## 6. What is genuinely strong (keep)

- The pass architecture with a shared `PipelineCtx`, one file per pass, and
  a fixture-based test per pass. `results.test.ts` alone has 94 tests.
- The ordering rationale and the two manual-assignment invariants are written
  down in CLAUDE.md with the reason each exists. That is rare and valuable.
- Normalisation is shared through `@granfondo/database/normalize`, so the
  browser and the scraper agree on keys by construction.
- `fetchWithRetry` with exponential backoff and jitter; polite delays; a
  regression warning when a re-scraped event loses more than half its finishers.
- The participant refresh mode fails the CI job when an event drops ≥10 and
  ≥20% of registrants, which prevents committing a broken start list.
- Alias chains are flattened on write and validated for cycles.
- `pruneGhostAthletes` and `check-post-scrape` give a real integrity story.
- The maintenance script suite (split finder, licence-split finder, alias
  finders, anchored-alias finder, compaction, force-id) is a proper data-ops
  toolkit, and each script explains its review format in its header.

## 7. Scorecard (out of 10)

| Area | Score | Why |
|------|-------|-----|
| Identity resolution algorithm | 9 | Multi-signal, guarded, explainable, measured 99.85% linkage |
| Correctness of scoring | 6 | Formula is consistent but disagrees with its own documentation; women's fields deflated |
| Scheduling and automation | 4 | Two window bugs; single attempt per Sunday race; no retry, no alerting |
| Scraper robustness | 5 | Retries and regression checks exist, but HTML parsing is regex-based and one layout change silently broke linking |
| Test coverage where it matters | 4 | Pipeline 97%, but events 3%, adapters 0–14%, DB I/O 8–12% |
| Observability | 2 | Console logs only; flags gitignored; no run summary, no metrics, no alerts |
| Maintainability of configuration | 4 | Five per-event maps in `config.ts` hand-edited every season |
| Data model | 7 | Relational, typed, migrated; but `athlete_results` duplicates `results` and browser-only concerns are mixed with scraper-only tables |
| Security and hygiene | 6 | Encryption fine for its stated goal; a third-party API key is committed; plaintext DBs land in `/tmp` |
| Documentation | 8 | CLAUDE.md files are excellent; missing: a runbook for "results didn't appear" |

**Overall: 6.5/10.** The algorithm is a 9. Everything around it is a 4.

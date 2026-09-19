# Test plans

Concrete cases for the areas the reviews found untested. Each case has a
name (use it as the test title), inputs or fixture, and the expected
outcome. Fixtures go under `scraper/fixtures/<source>/` unless stated.
Coverage today is in `engine/metrics.json → tests`.

---

## 1. Scraper adapters (`scraper/src/scrapers/`) — 0–14% covered

### 1.1 `stopandgo.ts` `parseRegistrationsPage`
Fixtures: `registrations-5col.html` (new layout with avatar initials),
`registrations-5col-with-photo.html` (rows without the initial),
`registrations-8col.html` (old layout).

| Case | Expected |
|------|----------|
| new layout, row with avatar initial | name = full name, team = team, category = category; single-letter part discarded |
| new layout, row without initial | same fields as above |
| old layout | 8-column mapping unchanged |
| status not "Confirmado" | row skipped, `rowCount` still increments |
| distance "Caminhada" / "KIDS" | row dropped (after B9 fix), counted in a `dropped` counter |
| distance "GranFondo" | `distance` = "Granfondo", `distanceId` = "1" (after B10 fix) |
| empty table | `{ athletes: [], rowCount: 0 }` |

### 1.2 `stopandgo.ts` `scrapeListaParticipants`
Fixture: `lista.html`. Cases: confirmed only; gender from "FEM"; distance
normalisation; entity decoding in names and teams (`&amp;`).

### 1.3 `stopandgo.ts` `scrapeRegistrationsParticipants` pagination
Use `nock`/`msw` to serve the initial page and two Livewire responses.
Cases: stops when a page returns `rowCount 0`; falls back to `?page=N`
when no `wire:snapshot`; cookies replayed on the second POST.

### 1.4 `stopandgo.ts` `discoverGranfondos`
Fixtures: `eventos.json`, `net-events-2026.json`. Cases: name filter,
supplemental id included, kids/caminhada event excluded, year outside
`YEARS` excluded, upcoming de-dup against past, `fetchNetEventById` for a
supplemental id not in search results.

### 1.5 `apedalar.ts`
Fixtures: `apedalar-results.html` (with `wire:snapshot`), `apedalar-livewire-escalao.json`.
Cases: winner gap `-:--:--.---` → 0 s; gap taken from the `xl:table-cell`
column; category overlay from per-escalão responses; one property per
Livewire request.

### 1.6 `timerspeed.ts`, `lap2go.ts`, `classificacoes.ts`
One fixture each of the real payload. Cases: row count, first and last
finisher, DNF handling, time format conversion (`04h02'47` → `04:02:47`),
title-casing of all-caps names with accents.

### 1.7 Layout drift (weekly workflow, allowed to fail)
For each live URL in the registry: fetch, run the parser, assert row count
≥ 90% of the value stored at the last successful run and that no name is a
single character. On failure open an issue.

---

## 2. Events pipeline (`scraper/src/pipeline/events.ts`) — 3% covered

Mock `fetchParticipants`/`fetchResults`/`loadResultsFromDb`.

| Case | Expected |
|------|----------|
| stable past event with cache | no network; `hasResults`, counts and distances from DB |
| stable event but `--force` | network path |
| upcoming event | participants stored, no results, distances from participants or defaults |
| one distance fails | `results` undefined, warning logged, event not marked stable |
| all distances return empty | "no results published yet", not stable |
| two distances with swapped ids | names reassigned by winner time |
| GF + Mini with no MF | positional canonical names (GF, MF) |
| finisher count < 50% of previous | warning (and after 1.3 of the engine plan: failure) |

---

## 3. DB loader and writer (`db-loader.ts` 8%, `write-db.ts` 12%, `db-writer.ts` 67%)

Build a small DB with `buildDatabase(minimalData(...))` from
`api/src/test-db.ts`, encrypt it into a temp path, point `DB_ENC_PATH` there.

| Case | Expected |
|------|----------|
| `loadResultsFromDb` round-trips results and licences for one event | equal to input |
| `loadIdStore`, `loadTeamIdStore`, `loadTeamAliases`, `loadAthleteAliases`, `loadResultAssignments`, `loadBlockedResults` | equal to inserted |
| `loadBlockedResults` on a DB without the table | `[]` |
| `writeParticipantsToDb` replaces an event's list and inserts a new event row | counts |
| `writeEncryptedDatabase` sanity minimum | throws below threshold; writes and updates `scraped-events.json` above |
| `pruneGhostAthletes` | athlete with no results removed; dangling `athlete_lookup` and `aggregate_athletes` rows removed; stale team-id lookup keys removed |
| unique `athlete_results` slot | inserting a duplicate throws (guards the golden rule) |

---

## 4. Identity pipeline golden test (`results.ts`)

Fixture: `pipeline/golden-input.json` (≈ 300 synthetic results across 6
events, 3 seasons, including: licence pairs, legal-name variants, missing
space, solo collisions resolved by distance and by percentile, a valid and
an invalid category transition, a team change, an alias rule, an
assignment, a block).
Expected: `pipeline/golden-output.json` (athlete index serialised sorted by
key). Test: byte-identical; and a second run seeded with the first run's
`updatedIdStore` yields identical ids. Regenerate the expected file only via
an explicit `--update-golden` flag with a reviewed diff.

---

## 5. Ranking and predictions

| Case | Expected |
|------|----------|
| coefficient uses the agreed population (per decision 0.9) | assert on a two-gender field |
| solo team strings never form a team | "Sem Equipa" riders excluded from `buildTeamRanking` |
| ties in `pos` | both riders get points for their `genderPos`; injection resolves by name |
| `predictionDistCoeff` for a non-canonical registered distance | after B10: input is always canonical; test that `getPredictions` on a `GranFondo`-spelled row equals `Granfondo` |
| `currentYear` = latest season with results | January run does not decay the last season |

---

## 6. Workflows (`.github/workflows/*.yml` window logic)

Extract the Python window check into `scraper/scripts/ci-window.py` with a
`--today` argument and test it: Sunday race → runs Sun/Mon/Tue; Saturday
race → participants refresh runs Thu/Fri; no event → `run=false`.

---

## 7. Backoffice (`backoffice/`, 0 tests)

Middleware with a temp encrypted DB:

| Case | Expected |
|------|----------|
| add alias / assignment / block / team alias | row present after; success message returned |
| remove alias by id (after fix 0.1) | only that row removed when two share a name |
| add assignment with unknown athlete id | 400 with message (after A3 fix) |
| duplicate `(event, bib)` assignment | 400 unless `replace` |
| candidates endpoint with missing file | `[]` |
| unknown route | 404 JSON |

Components (Vitest + Testing Library): `CandidatesPage` renders `from`/`to`
from a fixture with real keys; `DeleteButton` requires confirm; `Combobox`
debounces and selects with keyboard.

---

## 8. Frontend (extend the committed Playwright suite)

| Case | Expected |
|------|----------|
| home search with non-matching text | event list empty, "No events found" |
| filters survive back navigation (after URL state) | same filters after `goBack()` |
| unknown route | 404 page with links |
| every route sets a distinct `<title>` | |
| predictions page for an upcoming event | only road-distance tabs; opens on Granfondo |
| mobile: no element under 44 px in nav/footer (after tap-target pass) | |
| axe: no serious violations on `/`, `/event/:id`, `/ranking`, `/athlete/:id` | |
| payload budget on `/` | total transfer < 4 MB (after data artefacts v2) |

---

## 9. Data invariants (run against the built DB in CI, engine plan 1.3)

- linked finishing results ≥ 99.5%
- zero duplicate `(athlete, event, distance)` slots
- zero single-letter participant names
- every `participants.distance` ∈ `DISTANCES`
- athletes/results/teams counts ≥ 95% of previous manifest
- no event with `has_results = 0` older than 3 days that is not `status: postponed`

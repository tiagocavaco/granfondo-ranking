# 03 — Engine Improvement Plan

Sequenced so that correctness comes first, then the safety net that stops
regressions, then the structural work that the frontend plan depends on, and
only then changes to the identity algorithm itself. Effort: **S** ≤ 1 day,
**M** 2–4 days, **L** 1–2 weeks.

---

## Phase 0 — Correctness fixes (S)

| # | Change | Where |
|---|--------|-------|
| 0.1 | Run the results scrape nightly (`0 20 * * *`) and widen the window to `0 ≤ diff ≤ 3`; keep the event-window gate so idle nights cost nothing. Or keep Sunday but add Monday and Tuesday runs. | `scrape-results.yml` |
| 0.2 | Run the participants refresh nightly with window `−4 ≤ diff ≤ −1` so Saturday and Sunday races both get a refresh two nights before. | `scrape-participants.yml` |
| 0.3 | Fix the 5-column registrations parser: if the first text part is a single character, drop it; validate that `name` has ≥ 2 tokens; log and skip rows that still look wrong. Re-scrape Serra d'Ossa and Portimão. | `stopandgo.ts` `parseRegistrationsPage` |
| 0.4 | Decide the coefficient semantics and make code and info page agree. Recommended: keep per-gender fields (they are the population being ranked) and rename `distanceFinishers` → `genderFinishers`, fix the info page text. Alternative: per-distance coefficient, which raises women's points ~5×. | `ranking.ts`, `AthleteRankingInfoPage.tsx`, schema column |
| 0.5 | Replace `INDIVIDUAL_TEAM_KEYS` with `isSoloTeam` in `buildTeamRanking`. | `ranking.ts` |
| 0.6 | Make prediction `currentYear` the latest season with results, not the calendar. | `predictions.ts` |
| 0.7 | Log a warning and count when gender or country falls back to a default. | `transform.ts`, `normalize.ts` |
| 0.8 | Move the lap2go key to `LAP2GO_API_KEY` env with the current value as documented default. | `lap2go.ts`, `.env` |
| 0.9 | Add `evict-blocked-results` to the pass table and update the `helpers.ts` pass references. | `scraper/CLAUDE.md` |
| 0.10 | Use `fetchWithRetry` in `fetchNetEvents` / `fetchNetEventById`. | `stopandgo.ts` |
| 0.11 | At the three participant entry points: `distance = normalizeDistance(raw)`, derive `distanceId` from `distancePriority(distance) + 1`, drop rows whose canonical distance is not in `DISTANCES` (Caminhada, Kids, VIP), log the dropped count. Re-scrape participants for 1943; historical rows are fixed by the next full scrape only if `participants` are re-fetched, otherwise add a one-off migration that applies `normalizeDistance` to existing rows. | `events.ts` `apiAthleteToParticipant`, `stopandgo.ts` `scrapeListaParticipants` + `parseRegistrationsPage`, `transform.ts` `extractDistances` |

---

## Phase 1 — Safety net (M)

### 1.1 Recorded-fixture tests for every adapter
Save one real HTML/JSON response per source and layout into
`scraper/fixtures/` (lista page, both registrations layouts, xcrono results,
apedalar Livewire snapshot + per-escalão response, timerspeed `.clax`,
lap2go JSON, waitastart CSV). Test each parser against them. Add a
"layout drift" test that fails when a live page's column count changes,
run weekly in a separate workflow that is allowed to fail loudly.

### 1.2 Offline end-to-end scrape
A `SCRAPE_FIXTURES=1` mode where `fetchWithRetry` serves from the fixtures
directory. Then one test runs discovery → scrape → pipeline → DB write on
three synthetic events and asserts row counts, link rate, and that the
athlete index is byte-identical across two runs (golden output).

### 1.3 Relative sanity checks that fail the job
Replace absolute minimums with "not less than 95% of the previous DB" for
athletes, results and linked-result rate, and "no event lost results".
Turn the finisher-drop warning into a failure unless `--allow-regression`.

### 1.4 CI gates
- `test:coverage` in `ci.yml` so thresholds bind; raise the per-file floor for `events.ts`, `stopandgo.ts`, `db-loader.ts`, `write-db.ts` to 70% once 1.1 lands.
- Scrape workflow runs typecheck + tests before committing.
- Lint and cover `scripts/`, starting with `compact-athlete-ids.ts`.

---

## Phase 2 — Observability (M)

### 2.1 Run summary artefact
Every scrape writes `scrape-summary.json`: events discovered / cached /
fetched / failed, results count delta, link rate, pipeline pass counters,
flags by type, ranking slice sizes, duration, and warnings. Upload it as a
workflow artefact and post a one-line summary to the job summary (`$GITHUB_STEP_SUMMARY`).

### 2.2 Flags become visible
Commit a PII-free digest of the flags (counts and event IDs only) to
`scraper/flags-summary.json`, and add a **Review queue** page to the
backoffice that reads the full flag files from the latest workflow artefact
(or from a local run) and lets the reviewer resolve them into alias /
assignment / block rules with one click.

### 2.3 Alerting
A workflow step that opens or updates a GitHub issue when: a scheduled run
found an event in window but zero results; link rate for an upcoming event
< 50%; any sanity check fails; a layout-drift test fails. Optionally a
Telegram/Slack webhook.

### 2.4 Structured logging
Replace `console.log` prefixes with a tiny logger that emits JSON lines when
`LOG_FORMAT=json`, so the summary in 2.1 is derived from the log rather than
hand-maintained counters.

---

## Phase 3 — Declarative event registry (M)

Replace the five per-event maps in `config.ts` and the `EXTERNAL_EVENTS`
array with one `scraper/events.yaml`:

```yaml
- id: 1956
  name: Lousã Granfondo 2026
  date: 2026-09-13
  source: stopandgo            # stopandgo | lap2go | waitastart | apedalar | timerspeed | classificacoes
  participants: lista           # lista | registrations | apedalar | xcrono
  participantsUrl: https://stopandgo.net/lista/lousagf_26/
  officialUrl: https://cabreirasolutions.com/evento/lousa-granfondo/
  distances: [Granfondo, Mediofondo, Minifondo]
  series: lousa                 # links editions across years (frontend "event history")
  location: { name: Serra da Lousã, lat: 40.10, lng: -8.24 }
  route: { gpx: ..., km: 145, elevationM: 2900 }   # Phase 5
```

- Discovery still runs, but its job becomes "propose new entries" (open a PR
  with the diff) rather than silently deciding.
- `series` gives the frontend its event-history page and lets
  `CANONICAL_EVENT_NAMES` go away (name = `${seriesName} ${year}`).
- One adapter interface `scrape(event): Promise<StoredEventResults>` chosen
  by `source`, replacing the six hand-wired functions in `index.ts`.
- Validation on load: unique IDs, dates parse, URLs resolve (in the weekly drift job).

---

## Phase 4 — Data model and output (L)

This is the engine half of the frontend performance plan.

### 4.1 Tiered output
`buildDatabase` produces three artefacts:

| File | Tables | Consumer |
|------|--------|----------|
| `core.db` | events, event_distances, athletes (id, name, canonical_team, country), teams, team_aliases, aggregate_athletes, aggregate_results, team_ranking, team_race_results, team_race_athletes, stats | Every page |
| `results-<eventId>.db` | results rows for one event (+ licences stripped) | Event page, athlete profile on demand |
| `participants-<eventId>.db` | start list for upcoming events only | Event page, predictions |

The scraper keeps the full DB (with override tables, lookup, licences) as
`scraper/state.db.enc` in a separate committed path; the browser never sees
it. `athlete_results` becomes a view in the scraper and is not shipped.

### 4.2 Compress then encrypt
Brotli level 9 before AES-GCM (measured: 48.6 MB → 12.8 MB for the whole DB;
the core tier will be a few MB). `decrypt.ts` gains a `DecompressionStream`
step; the format gets a 4-byte magic + version header so old and new clients
can coexist during rollout.

### 4.3 Content-hashed manifest
`data/manifest.json` lists each artefact with its hash and size; the
scraper writes hashed filenames so GitHub Pages can cache them forever.

### 4.4 `team_aliases` table
Replace the JSON column; migrate `manage-db.ts`, `alias-utils.ts`,
`loadTeamAliases`, `getTeamByKey` and the backoffice.

### 4.5 Retention
Drop participants for events older than the season; keep a `dns_count` per
event computed at scrape time instead.

### 4.6 Never write plaintext to disk
Open the source DB from a buffer (`new BetterSqlite3(buffer)` works, as
`manage-db.ts` already does). Remove the verify-copy write, and make every
script that decrypts use a helper that never touches `/tmp`.

---

## Phase 5 — Richer event data (M, feeds the frontend "race guide")

Scraper additions driven by `events.yaml`:

- GPX download and parse → per-distance km and elevation gain, route polyline simplified to ~500 points, elevation profile sampled to 200 points. Stored in `event_routes`.
- Organiser page scrape for start time, registration URL and deadline, price, hero image URL (with a manual override in the registry).
- Weather is fetched by the frontend at view time (Open-Meteo), not by the scraper.
- `results_published_at` and a `provisional` flag on events, set when the first scrape finds results.
- Records computed at scrape time: fastest time per series and distance, largest field, most wins per athlete. One small `records` table.

---

## Phase 6 — Identity pipeline gains (L, only after Phases 1–2)

These change output, so they need the golden test and the flags dashboard
first.

### 6.1 Third-implementation cleanup
One category normaliser in `@granfondo/utils/category` used by every caller;
`categoryTier` derived from the canonical form. Property test: for all 182
raw strings in the DB, all three current functions agree with the new one.

### 6.2 Licence coverage
Licences appear on 42% of results. Two cheap wins: carry licences forward
from `participants` (registration lists often include them) and from the
previous season's profile when name + team + category match, so passes 2–9
have more hard evidence.

### 6.3 Flag resolution learning
Every reviewed split pair (4,076 so far) is labelled data. Fit a simple
logistic model on the existing signals (category compatibility, percentile
gap, year gap, distance overlap, country, team similarity) to rank the review
queue and to raise the auto-merge threshold where precision is measured ≥ 0.99.

### 6.4 Team clustering
2,129 single-athlete teams and 1,207 alias sets say the alias finder is
working but reactive. Run the anchored-alias finder inside the scrape and
auto-apply pairs with ≥ 3 shared athletes and similarity ≥ 0.8; queue the rest.

### 6.5 Display names
Apply the alias table to `athletes.canonical_team` at write time so the
frontend stops showing four spellings of one club.

### 6.6 Performance
Index the athlete map by `nameLower` once per pass instead of scanning; the
quadratic loops become linear. Needed before the 2021–2022 backlog.

---

### 6.7 Performance-trajectory anomalies as an identity signal
Detector and review-queue integration specified in
`docs/features/performance-anomalies.md`. Internal floor 4 finished results (22 improvements, 8 declines, 115
single-race outliers among 5,767 athletes today; most sampled improvers are
multi-category profiles, i.e. merges). Public form features need 10. Internal use first; public "form" features second.

## Phase 7 — Backlog already in `TASKS.md`

- Historical 2021–2022 events (26 StopAndGo IDs, parameterised
  `classificacoes` scraper, new L'Étape scraper) — do after Phase 3 so they
  are registry entries, not code.
- Category normalisation in the frontend — becomes trivial after 6.1.

---

## Suggested order

1. Phase 0 today. Items 0.3 and 0.11 fix the three confirmed data failures (single-letter names, non-race distances, un-normalised `GranFondo` predictions); 0.1 and 0.2 close the scheduling gaps before they bite.
2. Phase 1.1–1.3 before the next race weekend, so 0.3 cannot regress silently.
3. Phase 2.1–2.3 (one week) — after this the maintainer learns about failures from an issue, not from the site.
4. Phase 3 registry, then Phase 4 tiers and compression (this unblocks the frontend's biggest item).
5. Phase 5 and 6 in parallel; 6 gated on the golden test.

## What "done" looks like

- A Sunday race has results on the site by Tuesday morning without anyone touching a keyboard, and if it does not, an issue says why.
- Adding next season's events is a pull request editing one YAML file, proposed automatically by the discovery job.
- A layout change on any source fails a weekly test before it corrupts a start list.
- The browser downloads a few megabytes, not fifty, and the scraper's private state never leaves the scraper.
- Every ambiguous identity decision is visible in a queue, resolvable in one click, and the queue is shrinking.

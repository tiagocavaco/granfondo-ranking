# 02 — Issues Found (Engine)

Severity: **P0** wrong or missing data reaches users · **P1** will bite within a
season · **P2** quality / maintainability · **P3** hygiene.

---

## A. Scheduling and automation

### A1 · P1 — Sunday races get exactly one scrape attempt, on race night (latent, not yet triggered)
- `scrape-results.yml` runs only on Sundays (cron `0 20 * * 0`, actual start ~22:00 UTC in practice). The window check accepts `diff` of 0 or 1 days. For a Sunday race, `diff = 0` on race night and `diff = 7` the following Sunday, so the "next night as fallback" comment never applies to Sunday races. If an organiser publishes on Monday, the results wait a week and then are skipped forever unless someone triggers the workflow by hand.
- Correction (18 Sep 2026): an earlier draft of this issue cited Lousã 2026 as live evidence. That was wrong. The scheduled run on 13 Sep at 22:12 UTC succeeded and cached event 1956 on `main` (`7cb67dc`); the local branch was simply behind. So far every Sunday organiser has published by race night. The fix in the plan (0.1) stands because that luck is not guaranteed.

### A2 · P0 — Saturday races never get a participant refresh
- `scrape-participants.yml` runs Fridays and accepts `diff` of −3 or −2. A Saturday race has `diff = −1` on Friday, so it is skipped. Monção e Melgaço (Sat 19 Sep) is the current example.

### A3 · P1 — No retry, no alert, no artefact when a scheduled run does nothing useful
- A run that finds "no results published yet" for every distance exits 0 and commits nothing. Nobody is notified. The 59 solo flags and 803 cross-pass flags written by every run are gitignored and discarded with the runner.

### A4 · P1 — Sanity thresholds are stale and absolute
- `write-db.ts` refuses to write only if athletes < 9,000 or results < 25,000. Current values are 23,766 and 74,733. A bug that dropped 60% of the data would pass. The finisher-drop check in `events.ts` only warns.

### A5 · P2 — Coverage thresholds are not enforced in CI
- `vitest.config.ts` sets 65/60/65/65 thresholds, but `ci.yml` runs `npm test`, not `test:coverage`. Thresholds apply only when coverage is collected.

### A6 · P2 — Scheduled runs push straight to `main` with a PAT, bypassing CI
- The scrape workflow commits and pushes without running typecheck, lint or tests, and `ci.yml` runs on push to main afterwards. A bad data commit deploys before CI reports.

### A7 · P3 — `isPast` depends on the runner's timezone
- `new Date(isoDate + "T00:00:00") < new Date()` compares a local-midnight construction on a UTC runner against local now. Around midnight Lisbon time an event flips state an hour early or late relative to the schedule check, which uses `date.today()` in Python.

---

## B. Scrapers and parsing

### B1 · P0 — New stopandgo.net registrations layout is mis-parsed
- `stopandgo.ts` `parseRegistrationsPage`, 5-column branch: `td[1]` is split on newlines and the parts are assumed to be name, team, category. The live page puts an avatar initial first. Result in the DB for Serra d'Ossa 2026: `name = "J"`, `team = "<the rider's full name>"`, `category = "Individual"`.
- Impact: 1,478 of 1,770 Serra d'Ossa registrants and 1,037 of 1,556 Portimão registrants are unlinked. Participant lists show single letters as names, predictions for these events are nearly empty, and any real team data is lost. Both events use `REGISTRATIONS_URLS`.
- Rows where the first part is already a full name parse correctly, which suggests the initial appears only when no avatar image is present.
- Scope, measured across the whole DB: 3,471 single-letter participant names in four events, all of them the ones served from `REGISTRATIONS_URLS`: São Mamede 2026 (495 of 700), Serra da Estrela 2026 (759 of 1,113), Serra d'Ossa 2026 (1,376 of 1,770), Portimão 2026 (841 of 1,556). The two finished events already have results, so only their historical start lists are wrong; the two upcoming ones drive live predictions. Tavira 2026 also uses this source and will be affected on its next refresh.

### B2 · P1 — Regex-over-HTML parsers with no fixture tests for the live layouts
- `stopandgo.ts` (14% covered), `apedalar.ts` (12%), `timerspeed.ts` (2%), `lap2go.ts` (0%). The only well-tested adapter is `waitastart.ts`. B1 is the predictable outcome. No saved HTML fixtures exist for the lista, registrations or apedalar pages.

### B3 · P1 — Event discovery depends on the word "granfondo" plus a hand-maintained ID list
- `SUPPLEMENTAL_EVENT_IDS` has 30 entries, one per event per year that is named differently ("Clássica", "Classic", "L'Étape", "GF", "Grandfondo"). Every season someone must find and add the new IDs, official URLs (`OFFICIAL_EVENT_URLS`, 60 entries), default distances (14 entries), and participant list URLs (three maps). Missed entries mean missing events; `EXCLUDED_EVENT_IDS` exists because the name filter also over-matches.

### B4 · P2 — Third-party API key committed in source
- `scrapers/lap2go.ts` embeds `apik: "26m6E[AMYYuJ;,5"`. Even if it is a public web-client key, it belongs in configuration.

### B5 · P2 — Hard-coded, single-use scraper functions
- `scrapeEtapaDaVolta` hard-codes results ID 13745; `scrapeFigueiraChampionsDay` hard-codes the 2025 slug; `scrapePortoGaiaGranfondo2023/2024` and `scrapeApedalar5Quinas/2026` are copies with different URLs. `TASKS.md` already asks for a parameterised classificacoes scraper.

### B6 · P2 — Gender defaults to "M" when the source omits it
- `scraper/src/transform.ts` `gender: r.sexo || "M"`. A source that drops the field silently makes every rider male, which changes gender positions, points and predictions. There is no log line when this happens.

### B7 · P2 — Unknown country names silently become "PT"
- `normalizeCountry` maps ~37 English country names; anything else (Portuguese spellings, "Reino Unido", "Espanha") returns "PT". 10,883 results are non-PT, so the mapping works for the common cases, but misses are invisible.

### B8 · P3 — `fetchNetEvents` and `fetchNetEventById` bypass `fetchWithRetry`
- Plain `fetch` with no retry; a transient 503 during discovery drops upcoming events from that run.

### B9 · P1 — Non-race distances (Caminhada, Kids) are fetched as participants and shown as predictions tabs
- `isKidsCamVariant` in `transform.ts` filters event *names* only. Participant rows whose *distance* is a walk or kids ride pass straight through `apiAthleteToParticipant`, `scrapeListaParticipants` and `parseRegistrationsPage`, and `extractDistances` promotes them to event distances. Monção e Melgaço 2026 therefore carries "Caminhada" and "KIDS" distances; the frontend renders them as prediction tabs with empty favourites and as light-grey chips in the participants list (frontend B7, B9).
- Fix belongs in the scraper: drop participant rows whose `distance` matches `isKidsCamVariant` (or whose normalised distance is not in `DISTANCES`) before they reach the DB; keep a count in the run log. Re-scrape participants for 1943 afterwards.

### B10 · P0 — Participant distances are stored raw, so predictions score against the wrong distance
- `database/src/db-writer.ts` normalises `distance_name` for results and `event_distances` (`normalizeDistance`), but `insertParticipants` writes `participants.distance` exactly as scraped. `api/src/predictions.ts` groups by that raw string and passes it to `predictionDistCoeff(registeredDist, historicalDist)`.
- Monção e Melgaço 2026: 381 registrants are stored as `GranFondo` (capital F, from the lista page). `predictionDistCoeff("GranFondo", "Granfondo")` finds no rank for the registered string and returns 0, so every historical result contributes 0 points: the Granfondo favourites list is empty or ordered by nothing, and the tab is labelled "GranFondo" and sorted after the canonical distances (which is why Mediofondo appears first on `/event/1943/predictions`).
- Scope: 3,405 historical participant rows say `GranFondo`; others say `Clássica`, `Big Day - 88 km`, `HALF DAY 77,3KM`, `L´Étape 100`, `Contrarrelógio`. All of these would have been mapped by `normalizeDistance` (they are in `DISTANCE_ALIASES`) had it been applied.
- Second defect in the same path: `scrapeListaParticipants` and `parseRegistrationsPage` default any distance they do not recognise to `distanceId = "1"`, so Caminhada (19 rows) and KIDS (16 rows) at Monção share the Granfondo distance ID. `extractDistances` dedupes by ID, so the event still shows three distances, but the walk and kids rows are counted as Granfondo registrants in `participantCount` and could be matched to Granfondo athletes.
- Fix: normalise `distance` (and derive `distanceId` from the canonical name) at the three participant entry points, drop rows whose canonical distance is not in `DISTANCES` (see B9), and add a regression test that `getPredictions` for a `GranFondo`-spelled registrant yields the same score as `Granfondo`.

---

## C. Scoring and ranking logic

### C1 · P1 — Ranking coefficient is per gender field, the documentation says per distance
- `scraper/src/pipeline/ranking.ts` computes `finisherCoefficient(finishers.length)` where `finishers` is the gender group. The frontend info page says "scaled by a difficulty coefficient based on the number of finishers per distance", and the stored field is named `distanceFinishers`.
- Verified on Granfondo Paredes 2026: distance had 185 finishers; men got coefficient 0.77 (178 finishers), women got 0.15 (7 finishers). A female winner scores 11 points where a male winner scores 58. Within-gender rankings are self-consistent, but the published explanation is wrong and cross-gender comparisons (predictions overall favourite, athlete profile totals) are skewed.

### C2 · P2 — Team ranking uses a narrower "no team" set than the rest of the engine
- `scraper/src/pipeline/ranking.ts` `INDIVIDUAL_TEAM_KEYS = {"individual","independente",""}` versus `SOLO_TEAM_KEYS` which also has `individoal`, `no team`, `n team`, `sem equipa`. Today only one "Nøteam" row exists so no phantom team scores, but a future event using "Sem Equipa" would create an eligible "team" of unaffiliated riders.

### C3 · P2 — Team ranking sums overall positions, so mixed-gender teams are penalised
- `combinedScore` uses `pos` (overall), not `genderPos`. A team whose third finisher is the women's winner scores worse than one whose third is the 40th man. This is a design choice but is not documented on the team info page.

### C4 · P2 — Prediction `currentYear` is wall-clock
- `api/src/predictions.ts` uses `new Date().getFullYear()`. In January, every prior season decays by an extra 0.1 the moment the calendar flips, before any race has happened.

### C5 · P3 — Ties in `pos` are common and handled only by name fallback
- 1,694 (event, distance, pos) duplicates exist in results. `inject.ts` falls back to name for ties, which fails for same-name riders tied at the same position. Rare, but the fallback also masks source data where the organiser exported chip-time ties.

---

## D. Identity pipeline

### D1 · P1 — Review backlog is large and growing without a triage view
- 803 cross-pass flags, 59 unresolved solo collisions, 78 undecided licence-split candidates, 3,657 rejected and 419 applied split decisions. The flag files are gitignored, so the only way to see them is to run the scraper locally. There is no page in the backoffice that lists them, and no metric tracks whether the count is rising.

### D2 · P2 — Category normalisation is implemented three times and they disagree
- `utils/src/category.ts` `normalizeCategory` returns " Male"/" Female" suffixes; `scraper/src/normalize.ts` `normalizeCategory` returns "" / " F"; `scraper/src/normalize.ts` `categoryTier` is a third classifier for participant linking. `athleteKey` uses the scraper variant, `canonicalizeCategory` the utils variant. They agree today by inspection, not by test.

### D3 · P2 — Quadratic passes
- `team-solo-merge` iterates the full index for every solo key; `manual-result-assignments` does `[...index.values()].find` per assignment; `evict-blocked-results` scans `allResults` per block. Fine at 24k profiles, but the pipeline will double in size in two seasons and the 2021–2022 backlog in `TASKS.md` adds 29 events.

### D4 · P2 — `deriveCanonicalTeam` picks the most recent team; `canonicalTeam` in results stays raw
- Athlete profiles show whichever raw spelling the most recent event used, so the same club appears in four spellings on the ranking page (seen in the frontend review). The alias table exists; the display layer just does not apply it to `canonical_team`.

### D5 · P3 — Blocked-results pass is undocumented and untested
- `evict-blocked-results.ts` is absent from the pass table in `scraper/CLAUDE.md` and has 8% coverage. It runs between manual assignments and the sweep, which matters for the invariants documented there.

### D6 · P3 — `PLACEHOLDER_NAMES` is a three-entry hand list
- "novo dorsal", "novo inscrito", "atleta teste". Any new organiser placeholder becomes an athlete profile.

---

## E. Data model and storage

### E1 · P1 — Everything ships to the browser, including scraper-only tables
- `athlete_alias_rules`, `result_assignments`, `blocked_results`, `result_licences` (31k rows), `athlete_lookup` (26k rows), `__drizzle_migrations` and nine indexes are in the encrypted file every visitor downloads. `athlete_results` duplicates `results`. The frontend analysis covers the user impact (49 MB); the engine is where it is fixed.

### E2 · P2 — Participants are kept forever
- 91,902 participant rows across 82 finished events. Once results exist, the start list is only useful for "did not start" analysis, which nothing computes.

### E3 · P2 — `teams.alias_keys` is a JSON array column
- Alias lookup in SQL requires parsing JSON per row (`getTeamByKey`, `loadTeamAliases`). A `team_aliases(alias_key PK, team_id)` table would make the backoffice and the API simpler and indexable.

### E4 · P3 — Plaintext database files are written to disk during normal operation
- `openSourceDb` writes the decrypted DB to `os.tmpdir()` and deletes it on close; a crash leaves it. `write-db.ts` writes a verify copy. `check-participant-links.ts` writes `/tmp/granfondo_check.db` and never deletes it. `decrypt-db.ts` is meant to, but the others are not.

### E6 · P1 — Manual overrides have no human-readable backup
- 298 alias rules, 445 assignments, 3 blocks and 1,207 team alias sets exist only in `data.db.enc`. The owner keeps an out-of-repo copy of the repository folder (confirmed 19 Sep 2026), which covers file loss provided the copy includes `scraper/.env`. It does not cover a bad state being copied over a good one (a rebase resolved with `--ours`, or the backoffice delete-by-name cascade), because the blob cannot be diffed. Fix: `docs/features/project-level-additions.md` §1 (committed `overrides.json`, restore command, shared key custody). Found after the main review; added 19 Sep 2026.

### E5 · P3 — `stats` table stores a JSON blob
- `uniqueAthletes`, `uniqueByYear`, `scrapedAt` as one JSON string. Harmless, but it is the pattern the relational refactor removed elsewhere.

---

## F. Tests

### F1 · P1 — The untested code is the code that fails
- Coverage by file: `pipeline/events.ts` 3%, `db/db-loader.ts` 8%, `db/write-db.ts` 12%, `stopandgo.ts` 14%, `apedalar.ts` 12%, `timerspeed.ts` 2%, `lap2go.ts` 0%, `alias-utils.ts` 49%, `evict-blocked-results.ts` 8%. The pipeline passes are at 84–98%.

### F2 · P2 — No end-to-end test of a scrape against recorded HTTP
- There is no way to run `npm run scrape` offline. A recorded-fixture mode (or `nock`-style interception) would let CI exercise discovery, event scraping, the pipeline and the DB write together.

### F3 · P2 — No golden-output test for the pipeline
- Given a fixed set of results, the athlete index should be byte-identical run to run. Nothing asserts that; ID stability is tested only in units.

### F4 · P3 — Scripts are excluded from lint and coverage
- `eslint.config.mjs` ignores `scraper/src/scripts/**`; `vitest.config.ts` excludes them. `compact-athlete-ids.ts` (609 lines) rewrites every foreign key in the database and has no tests.

---

## G. Documentation and operations

### G1 · P2 — No runbook for the common failures
- "Results didn't appear after Sunday", "participants page shows single letters", "an athlete has two profiles", "a team is split in four" each have a fix somewhere in the toolkit, but there is no page that maps symptom to command.

### G2 · P2 — CLAUDE.md pass table is out of date
- Missing `evict-blocked-results`; numbering in the file header of `results.ts` uses old pass names (5c, 5e, 5f in `helpers.ts` comments).

### G3 · P3 — `TASKS.md` backlog items are still open
- Category normalisation in the frontend, 2021–2022 historical events (26 StopAndGo IDs + 3 new scrapers).

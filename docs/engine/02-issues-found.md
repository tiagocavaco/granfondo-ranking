# 02 — Issues Found (Engine)

Severity: **P0** wrong or missing data reaches users · **P1** will bite within a
season · **P2** quality / maintainability · **P3** hygiene.

---

## A. Scheduling and automation

### A1 · P1 — Sunday races get exactly one scrape attempt, on race night (latent, not yet triggered)
- `scrape-results.yml` runs only on Sundays (cron `0 20 * * 0`, actual start ~22:00 UTC in practice). The window check accepts `diff` of 0 or 1 days. For a Sunday race, `diff = 0` on race night and `diff = 7` the following Sunday, so the "next night as fallback" comment never applies to Sunday races. If an organiser publishes on Monday, the results wait a week and then are skipped forever unless someone triggers the workflow by hand.
- Correction (18 Sep 2026): an earlier draft of this issue cited Lousã 2026 as live evidence. That was wrong. The scheduled run on 13 Sep at 22:12 UTC succeeded and cached event 1956 on `main` (`7cb67dc`); the local branch was simply behind. So far every Sunday organiser has published by race night. The fix in the plan (0.1) stands because that luck is not guaranteed.

### A2 · P1 — Saturday races rarely get a participant refresh (accepted)
- `scrape-participants.yml` runs Fridays and accepts `diff` of −3 or −2. A Saturday race has `diff = −1` on Friday, so it is skipped. Saturday races are rare; Sunday is the norm. Accepted as a low-priority edge case — trigger manually if needed (`gh workflow run scrape-participants.yml`).

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

### B1 · P0 — ~~New stopandgo.net registrations layout is mis-parsed~~ ✓ fixed
- `stopandgo.ts` `parseRegistrationsPage`, 5-column branch now strips single-character avatar initials: `if (nameParts[0]?.length === 1) nameParts.shift()`. Participant lists for affected events (1700 Serra da Estrela, 1798 São Mamede, 2114 Portimão, 2115 Serra d'Ossa) were re-scraped and backfilled with correct full names.

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

### B9 · P1 — ~~Non-race distances (Caminhada, Kids) are fetched as participants and shown as predictions tabs~~ ✓ fixed
- `isKidsCamVariant` is now called on the `distance` field inside both `scrapeListaParticipants` and `parseRegistrationsPage` in `stopandgo.ts` (not only on event names), dropping walk and kids rows before they reach the DB. A re-scrape of participants for affected events will clear the stale rows.

### B10 · P0 — ~~Participant distances are stored raw, so predictions score against the wrong distance~~ ✓ fixed
- `scrapeListaParticipants` and `parseRegistrationsPage` in `stopandgo.ts` now call `normalizeDistance` on the raw distance string and derive `distanceId` from the canonical result. Rows whose distance is not in `DISTANCES` are dropped (covers walk, kids, and any unknown variants). `grandfondo` typo alias added to `DISTANCE_ALIASES`. Regression test updated: unknown distances produce an empty result, not a defaulted Granfondo row.

---

## C. Scoring and ranking logic

### C1 · P1 — ~~Ranking coefficient is per gender field, the documentation says per distance~~ ✓ fixed
- Field renamed `distanceFinishers` → `genderFinishers` throughout (schema, types, db-writer, ranking, API, frontend table). Info page copy updated: "finishers in your gender group", `coefficient = √(gender_finishers / 300)`, "300 finishers per gender group = 1.00". The per-gender formula is intentional and correct; only the documentation was wrong.

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

### D5 · P3 — ~~Blocked-results pass is undocumented and untested~~ ✓ fixed
- `evict-blocked-results.ts` is now in the pass table in `scraper/CLAUDE.md` as post-1 (before category sweep). Coverage still at 8%.

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

### G2 · P2 — ~~CLAUDE.md pass table is out of date~~ ✓ partially fixed
- `evict-blocked-results` added as post-1 in the pass table. Old pass-name references in `helpers.ts` comments (5c, 5e, 5f) still present.

### G3 · P3 — `TASKS.md` backlog items are still open
- Category normalisation in the frontend, 2021–2022 historical events (26 StopAndGo IDs + 3 new scrapers).

# Runbook — symptom to fix

For whoever is on duty when something looks wrong. Each entry: how you
notice, how to confirm, what to run, what to check afterwards. Commands run
from the repository root unless stated. All scraper commands need
`scraper/.env` with `DATA_KEY` and the current `frontend/public/data/data.db.enc`.

Background you need once: the database is rebuilt from scratch on every
scrape; the only state carried over is athlete/team IDs, the four override
tables inside the DB, and `scraper/scraped-events.json`. Manual changes to
the DB survive only if made through `manage-db.ts` or the backoffice, and
only take effect on the site after a scrape and a commit.

---

## 1. Results for last weekend's race have not appeared

**Notice:** event page says "Results pending" two days after the race.

**Confirm:**
```bash
gh run list --workflow=scrape-results.yml --limit 3      # did the scheduled run happen and succeed?
gh run view <id> --log | grep -E "no results published|✗|Regression|Sanity"
grep '"<eventId>"' scraper/scraped-events.json           # present = cached as done
git log origin/main --oneline -3 -- frontend/public/data/data.db.enc
```

**Causes and fixes:**
- Run happened, results were not published yet, no retry (the Sunday-only window, engine A1). Trigger by hand: `gh workflow run scrape-results.yml`. Long-term fix: roadmap 0.5.
- Run failed on a distance fetch: log shows `✗ <distance>` and "results will NOT be cached". Usually the timing API was down; re-run the workflow.
- Run succeeded but nothing committed because `hasResults` stayed false: the event's distances came back empty. Check `DEFAULT_DISTANCES` and the participant source for the event in `scraper/src/config.ts`.
- Your local branch is behind `main`. `git fetch && git log origin/main -1 -- frontend/public/data/data.db.enc`.

**After:** event page shows the finisher count; `scraper/scraped-events.json` has the ID.

---

## 2. Start list looks wrong (single-letter names, real names in the team column, walk/kids as distances)

**Notice:** participants page or predictions page for an upcoming event.

**Confirm:**
```bash
cd frontend && node ../docs/engine/tools/db-metrics.mjs | grep -A8 upcoming_participant_link_rate
```
Link rate under 40% for a `REGISTRATIONS_URLS` event means the layout parser (engine B1). Distances other than Granfondo/Mediofondo/Minifondo/Time Trial mean engine B9/B10.

**Fix:** code fixes are roadmap 0.2 and 0.3. Once landed, re-fetch only start lists:
```bash
npm run scrape:participants                # all upcoming events
npm run scrape:participants -- --skip-event 1942,1943   # to exclude some
```
The command refuses to write if an event loses ≥10 and ≥20% of registrants; read its output.

**After:** `suspicious_single_letter_participant_names` is 0 in the metrics; predictions open on Granfondo.

---

## 3. An athlete has two profiles (same person, split results)

**Notice:** two entries in athlete search with the same name; a ranking with points split.

**Confirm:** open both in the backoffice (`/athlete/<id>`) and compare team, category by year, licences, events. Rules of thumb from the pipeline: same licence = same person; same event in both = different people; category can only move up, ~10 years per skipped band.

**Fix, pick one:**
- Both have a real team: add an athlete alias rule (backoffice → Athlete Aliases → Add Rule, canonical = the profile to keep). Pipeline pass 5 merges them on the next scrape.
- One is solo (no team): alias rules skip solo entries. Add a result assignment per result of the profile to absorb (event id + bib → keep id). Or let the scripts do it:
  ```bash
  cd scraper && npm run db:find-splits       # writes split-candidates.json
  # set "approved": true on the pair, then
  npm run db:apply-splits
  ```
- Then: `npm run scrape`, `npm run db:check`, commit `data.db.enc` and `scraped-events.json`.

**After:** one profile; `db:check` reports zero orphans. If it reports ID gaps, see entry 7.

---

## 4. Two different people are merged into one profile

**Notice:** a profile with results from two categories in the same year, or two results at the same event, or impossible times.

**Fix:** a block rule: backoffice → Blocked Results → event id, bib, the athlete id it is wrongly on. The pipeline evicts those results into a `BLOCK:<id>` profile on the next scrape. For a whole season of wrong results, one block per (event, bib). Then scrape, check, commit.

---

## 5. A team appears under several spellings

**Notice:** ranking shows "Penacova First Bike Reconco" and "Penacova Firstbikereconco"; team page lists few members.

**Fix:**
```bash
cd scraper && npm run db:find-team-aliases            # fuzzy suggestions (athlete overlap + name similarity) → team-alias-candidates.json
# review, set approved: true to accept or false to skip (false entries go to rejected-team-aliases.json)
npm run db:apply-team-aliases
```
Or one at a time in the backoffice → Team Aliases → Add (From = variant key, To = canonical key; both are normalised keys, use the search). Then scrape, check, commit.

**Caution:** removing or changing an alias can split athlete profiles and leave ID gaps. Expect to run entry 7 afterwards.

---

## 6. Scrape ran, finisher count dropped, or "Sanity check failed"

**Notice:** workflow log shows `⚠️ Regression: … finishers dropped` or the job fails on `Sanity check failed: athletes has N rows`.

**Confirm:** compare with the previous DB:
```bash
git show origin/main:scraper/scraped-events.json | wc -l
cd frontend && node ../docs/engine/tools/db-metrics.mjs | head -12
```

**Fix:** a regression warning does not block the commit today (engine A4). If the numbers are wrong, do not merge the data commit; remove the event from `scraped-events.json` and re-run `npm run scrape` to re-fetch it. If the timing provider changed its API, the adapter in `scraper/src/scrapers/` needs a fix first.

---

## 7. `db:check` reports ID gaps or orphans

**Notice:** after alias changes, split reviews, or a `SOLO_TEAM_KEYS` edit.

**Fix (documented cycle):**
```bash
cd scraper
npm run db:compact-ids        # snapshot → remap → verify → VACUUM → write
npm run scrape                # reseed IDs from the compacted DB
npm run db:check              # expect zero gaps, zero stale FKs
```
Sometimes needed twice. Compaction changes athlete IDs, so shared `/athlete/:id` links for affected riders will break; this is expected.

---

## 8. Rebase or merge conflict on `data.db.enc`

**First:** if `scraper/overrides.json` exists (roadmap 0.11), compare its
row counts with `npm run db:manage -- list` after the rebase; a drop means
the wrong side was kept.

**Rule (root `CLAUDE.md`):** during a rebase, keep the local commits' copy, which is `--theirs`:
```bash
git checkout --theirs frontend/public/data/data.db.enc
git add frontend/public/data/data.db.enc
git rebase --continue
```
`--ours` is the upstream base and loses every override made locally. After the rebase, run `npm run scrape` once so the DB reflects both sides, then commit.

---

## 9. Site shows old data after a scrape commit

**Confirm:** `gh run list --workflow=deploy.yml --limit 3`. The deploy triggers on pushes to `main` touching `frontend/**` or `database/**`; a data commit touches `frontend/public/data/`, so it should run.

**Fix:** if the deploy did not run, `gh workflow run deploy.yml`. If it ran, the browser has the old file cached; the URL has no content hash today, so a hard reload is required. Long-term fix: roadmap 1.7.

---

## 10. Predictions page is empty or has odd tabs

**Causes:** start list not linked (entry 2); registered distance string not canonical so the coefficient is zero (engine B10); non-race distances present (engine B9); event has no start-list URL configured (`LISTA_URLS` / `REGISTRATIONS_URLS` / `APEDALAR_PARTICIPANT_URLS` in `scraper/src/config.ts`).

---

## 11. The backoffice write failed or did something unexpected

- "Delete" on an alias rule removed several rules: known (backoffice A1); they shared the athlete name. Re-add the ones you wanted to keep.
- Write returned a 500: the message is the CLI's stderr. Common: `DATA_KEY not set` (`scraper/.env` missing), or a cycle error on a team alias.
- Nothing changed on the site: writes only touch `data.db.enc`; run `npm run scrape` and commit.
- Candidates page shows no pending items: the JSON files are gitignored and only exist after running the finder scripts locally.
- Do not stop the dev server with `pkill -f vite`; it kills the frontend dev server too.

---

## 12. A new season's events are missing

**Notice:** discovery log says "Found N past + M upcoming" but a known race is absent.

**Fix:** if the StopAndGo name lacks "granfondo", add the ID to `SUPPLEMENTAL_EVENT_IDS`; add its official URL, default distances and start-list URL to the matching maps in `scraper/src/config.ts`; for non-StopAndGo events add a `StoredEvent` in `scraper/src/external.ts` with a 9xxxx ID and wire the scraper in `index.ts`. Then `npm run scrape`. Long-term fix: roadmap 2.3 (registry).

---

## 13. `DATA_KEY` problems

**Custody:** the key and the CI `PAT` must be in a shared password-manager
vault with one trusted second person. Rotation: generate a new 64-hex key;
decrypt with the old and re-encrypt with the new (`decrypt-db` then a
one-line encrypt script); update `scraper/.env`, `frontend/.env.local`,
`backoffice/.env.local` and the repository secrets; redeploy. Until the
override backup (roadmap 0.11) exists, losing the key loses every manual
override.

- Scraper: `⚠️ DATA_KEY not set — skipping data.db.enc` means `scraper/.env` is missing; nothing is written.
- Frontend/backoffice: "VITE_DATA_KEY is not set" or a decrypt error on load means `.env.local` is missing or holds a different key from the one that encrypted the file. Same 64-hex value everywhere.
- CI: `DATA_KEY` and `PAT` secrets in the repository settings; the deploy needs `DATA_KEY` too.

---

## 14. Nothing is wrong but you want to know the state

```bash
cd frontend && node ../docs/engine/tools/db-metrics.mjs     # counts, link rates, parser sentinel
cd scraper && npm run db:check                              # ID gaps, orphans, top-3 per slice
npm run db:manage -- list                                   # every override
gh run list --limit 5                                       # last workflow runs
```

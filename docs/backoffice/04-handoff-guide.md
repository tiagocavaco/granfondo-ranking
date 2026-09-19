# 04 — Handoff Guide for the Backoffice

For an agent or engineer arriving with no context.

## 1. Running it

```bash
# prerequisites: scraper/.env with DATA_KEY, backoffice/.env.local with VITE_DATA_KEY (same value),
# and frontend/public/data/data.db.enc present (backoffice/public/data/data.db.enc is a symlink to it)
npm run dev:backoffice          # from repo root; Vite picks the first free port from 5173 upward
```

The public frontend also uses Vite on 5173, so the backoffice usually lands on
5174 or higher. The sidebar says "local dev only" and means it: the admin API
exists only inside the dev server.

Every write changes `frontend/public/data/data.db.enc` on disk immediately. It
does not change what the pipeline produces until `npm run scrape` runs, and it
is not shared until that file is committed. Do not run `pkill -f vite` to stop
it; it will kill the frontend dev server too. Use the terminal it runs in, or
`kill <pid>` from `lsof -i :<port>`.

## 2. Files

| File | Role |
|------|------|
| `backoffice/vite.config.ts` | Registers the middleware for `/api/admin/*` and `/api/candidates/*` |
| `backoffice/server/admin-middleware.ts` | Validates request bodies, shells out to `npm run db:manage` in `scraper/`, serves candidate JSON |
| `backoffice/src/lib/admin-api.ts` | Typed client for the write endpoints (discards success message) |
| `backoffice/src/db/db-client.ts` | Browser-side decrypt + sql.js, identical to the frontend's |
| `backoffice/src/App.tsx` | Routes (no catch-all) |
| `backoffice/src/pages/*.tsx` | One file per route; see the page table in `01-architecture-analysis.md` |
| `api/src/admin.ts` | All read queries the backoffice uses (15 functions, exported through `@granfondo/api`) |
| `scraper/src/db/manage-db.ts` | The CLI that performs every write |
| `scraper/src/db/alias-utils.ts` | Alias flattening, cycle check, lookup-key rewrite used by team-alias writes |
| `scraper/*.json` | Candidate and flag files the Candidates page reads; all gitignored |

## 3. Where each P0/P1 issue lives and how to verify the fix

| Issue | Pointer | Verify |
|-------|---------|--------|
| A1 delete cascades by name | `backoffice/server/admin-middleware.ts#handleAdminRequest` (`route === "aliases" && method === "DELETE"`), `scraper/src/db/manage-db.ts#cmdRemove` alias branch, callers `backoffice/src/pages/AliasesPage.tsx#removeAlias`, `backoffice/src/pages/RawAthletePage.tsx#removeAlias` | Before fixing, run the SQL in section 5 to see the 31 multi-rule names. After fixing, add a middleware test: two rules with the same name, delete one by id, one remains. |
| A2 one rule per alias | `scraper/src/db/manage-db.ts#cmdAdd` alias branch | After fixing, adding a second alias for an existing canonical appends to `aliases_json` instead of inserting. |
| A3 no referential validation | `scraper/src/db/manage-db.ts#cmdAdd` assignment/block branches | Adding athlete ID 999999999 must fail with a message; adding a duplicate `(event, bib)` must fail without `--replace`. |
| B1 candidates key mismatch | `backoffice/src/pages/CandidatesPage.tsx#TeamAliasCandidate` and `#TeamAliasesTab` | Open `/candidates` → Team Aliases; From/To columns show keys; `approved` badge visible. |
| B2/B3 read-only candidates, missing files | `CandidatesPage.tsx`, `admin-middleware.ts` `CANDIDATE_FILES` | Phase 2.1–2.2 acceptance: every file in section 4 has a tab and approve/reject writes `approved`. |
| B4 no "scrape needed" state | none exists | Phase 2.4 health panel shows "N overrides since last scrape". |
| C1 shell-out writes | `backoffice/server/admin-middleware.ts#runManageDb` | After Phase 1.1, a write completes in < 1 s and no `npm` child process is spawned (`ps` during a write). |
| C2 dead production build | `backoffice/vite.config.ts#configureServer` only | After Phase 1.3, `npm run build && node server` serves a working app. |

## 4. Candidate and flag file contract (as of 18 Sep 2026)

| File | Producer | Top-level | Keys per entry |
|------|----------|-----------|----------------|
| `team-alias-candidates.json` | `db:find-team-aliases` | array (141) | `from, to, score, approved` |
| `athlete-anchored-team-aliases.json` | `db:find-athlete-anchored-aliases` | array (80) | `from, to, score, shared_athletes, athlete_names, approved` |
| `split-candidates.json` | `db:find-splits` | array (0 pending now) | `confidence, reason, bestPos, keep, absorb, approved, priority` |
| `split-candidates-applied.json` / `-rejected.json` | `db:apply-splits` | array (419 / 3,657) | same as above |
| `licence-split-candidates.json` | `db:find-licence-splits` | array (78) | `confidence, reason, bestPos, sharedLicence, licence, keep, absorb, approved` |
| `solo-flags.json` | `npm run scrape` | array (59) | `groupKey, eventId, eventName, resolution, results[]` |
| `cross-pass-flags.json` | `npm run scrape` | array (803) | `soloKey, soloAthleteId, soloName, teamCandidates[]` |

`keep` / `absorb` objects: `id, name, team, licences[], results, category, years, url`.
The `url` is an absolute `http://localhost:5174/...` link and should become relative (issue C7).

## 5. Reproduce the numbers

All SQL runs against the decrypted DB in memory; the helper in
`docs/engine/tools/db-metrics.mjs` shows how to open it without writing
plaintext. Queries used:

```sql
-- multi-rule names (A1)
select name, count(*) c from athlete_alias_rules group by name having c > 1;
-- duplicate assignments (A3)
select event_id, bib, count(*) c from result_assignments group by 1,2 having c > 1;
-- rules whose canonical name has no exact athlete match (A5)
select count(*) from athlete_alias_rules r
 where not exists (select 1 from athletes a where a.name = r.name);
-- empty notes
select count(*) from athlete_alias_rules where note is null or note = '';
select count(*) from result_assignments where note is null or note = '';
```

Screenshots were taken with Playwright against the dev server on port 5176
at 1440×900; the script pattern is the same as `docs/frontend/tools/audit.mjs`
with `BASE` pointed at the backoffice and no mobile project.

## 6. What this analysis did not do

- Did not call any write endpoint or the CLI; `data.db.enc` is unchanged.
- Did not test the Combobox keyboard flow or form submission beyond opening the form.
- Did not run `npm run build` for the backoffice (the dead-build finding is from reading `vite.config.ts` and `dist/`).
- Did not review the finder scripts' scoring beyond their headers (see the engine handoff guide).

## 7. If you only have an hour

1. Fix A1 (delete by id) and B1 (candidate keys). Both are under 30 lines.
2. Add `backoffice/CLAUDE.md` with the "scrape then commit" rule and the file contract from section 4.
3. Open `/candidates` → Team Aliases and confirm the keys render.

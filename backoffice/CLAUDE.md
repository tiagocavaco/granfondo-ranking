# Backoffice

Local-only admin app for the manual override tables and for inspecting raw
database rows. React + Vite + Tailwind, no tests, no production deployment.
Started with `npm run dev:backoffice` from the repo root. Analysis and plan:
`docs/backoffice/`.

## Scripts

```bash
npm run dev:backoffice     # from repo root; Vite picks the first free port ≥ 5173 (frontend usually holds 5173)
```

`npm run build` exists but the result does not work: the admin API is a Vite
dev-server middleware (see below). Do not deploy `dist/`.

## How it reads and writes

```
Browser                                  Vite dev server (vite.config.ts → server/admin-middleware.ts)
fetch /data/data.db.enc ───────────────► static file; public/data/data.db.enc is a symlink to frontend/public/data/data.db.enc
decrypt with VITE_DATA_KEY (.env.local)
sql.js + @granfondo/api (api/src/admin.ts)

fetch /api/candidates/* ───────────────► serveCandidateFile(): reads scraper/*.json (gitignored working files)
POST/DELETE /api/admin/* ──────────────► handleAdminRequest(): spawnSync("npm run db:manage -- add|remove …", cwd: scraper/)
window.location.reload()
```

- **Reads** are the same path as the public frontend: the whole encrypted DB
  is downloaded and decrypted in the browser. `src/db/db-client.ts` mirrors
  `frontend/src/db/db-client.ts`.
- **Writes** go through `scraper/src/db/manage-db.ts` and nothing else. That
  CLI owns alias flattening, cycle checks and `athlete_lookup` rewriting; the
  UI must never write to the DB directly.
- Every write changes `frontend/public/data/data.db.enc` on disk immediately.
  It changes nothing on the site until `npm run scrape` runs and the file is
  committed. The UI does not say this; tell the operator.

## Environment

- `backoffice/.env.local` — `VITE_DATA_KEY=<same 64-hex key as scraper/.env DATA_KEY>` (gitignored).
- The middleware inherits `process.env`, so `DATA_KEY` must be available to
  the shell that starts the dev server or present in `scraper/.env`.

## Pages

| Route | File | Purpose |
|-------|------|---------|
| `/aliases` | `pages/AliasesPage.tsx` | Athlete alias rules: list, filter, add (two athlete comboboxes), delete |
| `/assignments` | `pages/AssignmentsPage.tsx` | Result assignments: list, add (event combobox + bib + athlete id), delete |
| `/blocks` | `pages/BlocksPage.tsx` | Blocked results: same shape as assignments |
| `/team-aliases` | `pages/TeamAliasesPage.tsx` | Teams with alias keys; add (two team-key comboboxes), delete an alias key |
| `/candidates` | `pages/CandidatesPage.tsx` | Read-only view of `split-candidates*.json` and `team-alias-candidates.json` |
| `/athlete[/:id]` | `pages/RawAthletePage.tsx` | Search all athletes; raw rows for one athlete plus its overrides |
| `/team[/:key]` | `pages/RawTeamPage.tsx` | Search all teams; raw row, alias keys, members |
| `/event[/:id]` | `pages/RawEventPage.tsx` | Search events; raw row and per-distance result counts |

Shared: `components/Combobox.tsx` (debounced async search, keyboard nav),
`CollapsibleForm.tsx`, `DeleteButton.tsx` (two-step confirm),
`lib/use-paged-list.ts` (IntersectionObserver paging), `lib/admin-api.ts`
(typed write client).

All read queries live in `api/src/admin.ts` and are exported through
`@granfondo/api`. Add new queries there, not in the pages.

## Known behaviours to keep in mind (see `docs/backoffice/02-issues-found.md`)

- **Deleting an alias rule deletes every rule with the same athlete name**
  (server sends `--name` only; CLI deletes by name). 31 names have more than
  one rule. Fix is delete-by-id (`docs/backoffice/03-improvement-plan.md` 0.1).
- **Candidates → Team Aliases tab renders blank**: the page expects
  `fromKey`/`toKey`, the file has `from`/`to`.
- Adding an alias always inserts a new rule row rather than appending to an
  existing rule for the same canonical athlete.
- No validation that an athlete id or `(event, bib)` exists before insert.
- Success messages from the CLI are discarded; only errors are shown.

## Candidate and flag file contract

| File (in `scraper/`) | Producer | Keys per entry |
|------|----------|----------------|
| `team-alias-candidates.json` | `npm run db:find-team-aliases` | `from, to, score, approved` |
| `athlete-anchored-team-aliases.json` | `npm run db:find-athlete-anchored-aliases` | `from, to, score, shared_athletes, athlete_names, approved` |
| `split-candidates.json`, `-applied.json`, `-rejected.json` | `db:find-splits` / `db:apply-splits` | `confidence, reason, bestPos, keep, absorb, approved, priority` |
| `licence-split-candidates.json` | `npm run db:find-licence-splits` | `confidence, reason, bestPos, sharedLicence, licence, keep, absorb, approved` |
| `solo-flags.json`, `cross-pass-flags.json` | `npm run scrape` | see `scraper/src/pipeline/results/types.ts` |

All are gitignored; a fresh clone has none of them until the scripts run.

## Rules

- Never call `pkill -f vite` to stop this server; it also kills the frontend
  dev server. Kill the specific PID.
- Never edit `data.db.enc` by any path other than `manage-db.ts` / this UI;
  the next scrape rebuilds the DB and re-applies only the override tables.
- After any write: `npm run scrape`, `npm run db:check`, commit
  `frontend/public/data/data.db.enc` and `scraper/scraped-events.json`.
- Team keys in forms are normalised keys (`normalizeTeam` output), not display
  names. Use the combobox to pick existing keys.

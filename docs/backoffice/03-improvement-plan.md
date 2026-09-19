# 03 — Backoffice Improvement Plan

Sequenced so the two data-integrity bugs are fixed first, then the write path
is made fast and observable, then the app grows into the review queue that the
engine analysis identified as the largest gap. Effort: **S** ≤ 1 day, **M**
2–4 days, **L** 1–2 weeks.

---

## Phase 0 — Stop the bleeding (S, under an hour each)

| # | Change | Where |
|---|--------|-------|
| 0.1 | Delete alias rules by `id`: add `remove alias --id N` to `manage-db.ts`, pass `id` from both call sites, keep `--name` for the CLI with a confirmation prompt listing how many rows match. | `manage-db.ts` `cmdRemove`, `admin-middleware.ts` `aliases DELETE`, `admin-api.ts`, `AliasesPage.tsx`, `RawAthletePage.tsx` |
| 0.2 | Fix the candidates type: read `from`/`to`/`approved` and render `approved` as a status badge. | `CandidatesPage.tsx` `TeamAliasCandidate`, `TeamAliasesTab` |
| 0.3 | Validate before insert in `cmdAdd`: athlete ID exists; `(event, bib)` exists in `results`; refuse duplicate `(event, bib)` assignment unless `--replace`. | `manage-db.ts` |
| 0.4 | Show the CLI message on success (toast or inline), not only on failure. | `admin-api.ts`, `CollapsibleForm.tsx` |
| 0.5 | Replace `<a href>` with `<Link>`; add a catch-all route. | `AssignmentsPage`, `BlocksPage`, `CandidatesPage`, `App.tsx` |
| 0.6 | Pin the port (`server.port: 5174, strictPort: true`) and store relative paths, not `localhost` URLs, in candidate files. | `vite.config.ts`, `find-split-candidates.ts` |
| 0.7 | Add `backoffice/CLAUDE.md` describing the write path, the "scrape then commit" rule, and the candidate-file contract. | new file |

---

## Phase 1 — A real write path (M)

### 1.1 In-process admin service
Extract the bodies of `cmdAdd` / `cmdRemove` into `scraper/src/db/overrides.ts`
functions that take an open `better-sqlite3` handle. `manage-db.ts` and the
middleware both call them. The middleware keeps one decrypted DB in memory
(opened from a buffer, never written to disk), applies the change, and
re-encrypts to `data.db.enc` in one step. Writes drop from seconds to
milliseconds and the child-process environment leak goes away.

### 1.2 Reads from the server
Expose `GET /api/admin/*` read endpoints backed by the same in-memory DB
(`@granfondo/api` already accepts an injectable `getDb`, so `admin.ts` works
unchanged with a `better-sqlite3` Drizzle instance). The browser stops
downloading 49 MB; pages load in under 200 ms; after a write the page
re-queries instead of reloading.

### 1.3 Standalone server
Move the middleware into `backoffice/server/index.ts` (Node `http` or a
60-line Express app) that serves `dist/` in production and is used by Vite's
`server.proxy` in dev. `npm run build` then produces something that runs.

### 1.4 Audit columns
Migration adding `created_at`, `created_by` (from `git config user.name` or an
env var) and `source` (`backoffice` | `cli` | `apply-splits`) to the four
override tables, plus an `override_log` table that records deletions. The
Raw Athlete page shows the history.

### 1.5 Tests
- Middleware tests with a temporary encrypted DB fixture: each add/remove
  round-trips, delete-by-id removes one row, validation rejects bad IDs.
- Component tests for the three forms and the candidates parsing, using the
  real JSON shapes as fixtures.
- Add the workspace to the root `npm test`.

---

## Phase 2 — The review queue (L)

This is where the backoffice becomes the tool the pipeline needs. Every item
reads a file the scraper already writes; the first three also need the
"summary artefact" from the engine plan (Phase 2 there) so CI runs feed it.

### 2.1 Unified queue page
One list with type filter: **solo collision** (59), **cross-pass merge** (803),
**split candidate**, **licence split** (78), **team-alias candidate** (141),
**anchored team alias** (80). Each row shows the two (or more) profiles side by
side with the evidence the pipeline used: category per year, median
percentile, distances, country, licences, shared events. Sort by confidence
and by "involves a top-10 finish".

### 2.2 Decisions that write back
Approve / reject / skip buttons that (a) write `approved` into the candidate
file and (b) for approvals, immediately create the corresponding override
(alias rule, team alias, or result assignment) through Phase 1.1. The
`apply-splits` and `apply-team-aliases` scripts keep working on the same files.

### 2.3 Merge preview
"What happens if I merge these" runs the relevant checks from
`pipeline/results/helpers.ts` (`isValidCatTransition`, percentile gap,
`licencesConflict`, golden-rule overlap) in the server and shows pass/fail per
check before the operator commits.

### 2.4 Health panel
Home page with: `db:check` output (ID gaps, orphans), link rate per upcoming
event, single-letter participant names, events without results past their
date, last scrape time, count of overrides since last scrape, and the queue
sizes above. Green/amber/red per item.

### 2.5 Actions
Buttons for `scrape:participants`, `scrape`, `db:check`, `db:compact-ids`,
streamed log output, and a "commit data.db.enc" step that runs `git add` +
`git commit` with a generated message listing the overrides applied. Guarded
by a confirmation and disabled while another action runs.

---

## Phase 3 — Operator workflow (M)

### 3.1 Results-row finder
Search by event + bib, or event + name, returning the raw result row and the
athlete it is currently attached to. Prefills the assignment and block forms.
Removes the "type an athlete ID" problem.

### 3.2 Event participants view
Raw participants table per event with link status, filterable by unlinked.
Would have surfaced the single-letter-name parser bug in the first minute.

### 3.3 Athlete compare
Open two raw athletes side by side (the same evidence layout as 2.1) from any
search result; one-click "create alias rule from these two".

### 3.4 Consolidate the pages
`OverrideTable` and `OverrideForm` generics replacing the three copies; a
shared `useQuery`-style hook with cache invalidation after writes.

### 3.5 Keyboard-first review
`j`/`k` to move, `a`/`r`/`s` to approve/reject/skip, `enter` to open raw
rows. Reviewing 800 cross-pass flags is a keyboard job.

---

## Suggested order

1. Phase 0 today: 0.1 and 0.2 are the two bugs; 0.3–0.7 are an afternoon.
2. Phase 1.1–1.2 next, because everything in Phase 2 depends on fast reads and writes.
3. Phase 2.1, 2.2, 2.4 as one milestone: the queue with decisions and the health panel.
4. Phase 1.4–1.5 before opening the queue to a second reviewer.
5. Phase 3 as time allows; 3.1 and 3.2 are the highest value per hour.

## What "done" looks like

- A reviewer opens one page, sees every open pipeline question ranked by
  confidence, resolves it with one keystroke, and the override is written
  with an audit row.
- Nothing the UI can do deletes more than the row it shows.
- A write takes under a second and the page updates without reloading.
- The health panel says whether the last scrape ran, whether results for last
  Sunday's race arrived, and whether the working copy of `data.db.enc` has
  uncommitted overrides.
- `npm run build` produces an app that works.

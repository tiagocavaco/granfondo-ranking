# 01 — Backoffice Architecture Analysis

## 1. What it is

A second Vite + React + Tailwind app in the monorepo (`backoffice/`), started
with `npm run dev:backoffice`. It has no backend of its own. Two mechanisms
give it read and write access to the data:

```
Browser (React, sql.js)                     Vite dev server (Node)
────────────────────────                    ──────────────────────────────────────────
fetch /data/data.db.enc  ──────────────►    static file (symlink → frontend/public/data)
decrypt with VITE_DATA_KEY (.env.local)
load into sql.js, query via @granfondo/api
   (admin.ts: 15 read-only query functions)

fetch /api/candidates/*  ──────────────►    serveCandidateFile(): reads scraper/*.json

POST/DELETE /api/admin/* ──────────────►    handleAdminRequest(): validates body,
                                            spawnSync("npm run db:manage -- add|remove …", cwd: scraper/)
                                            manage-db.ts: decrypt → migrate → edit → encrypt → write
window.location.reload() ◄─────────────     JSON { message } (discarded by the client)
```

- **Reads** are the same path the public frontend uses: full DB in the browser.
  The admin query module `api/src/admin.ts` adds raw-row lookups and search.
- **Writes** are delegated to the existing CLI so there is exactly one code
  path that mutates `data.db.enc`. This is a deliberate and sound choice: the
  CLI owns alias flattening, cycle checks and `athlete_lookup` rewriting.
- After every write the page does a full reload, which re-downloads and
  re-decrypts the database.

## 2. Pages

| Route | Page | Reads | Writes |
|-------|------|-------|--------|
| `/aliases` | Athlete alias rules (298 rows) | `getAthleteAliasRules` | add rule (two athlete comboboxes), delete by name |
| `/assignments` | Result assignments (445) | `getResultAssignments` | add (event combobox, bib, athlete ID typed), delete by event+bib |
| `/blocks` | Blocked results (3) | `getBlockedResults` | add (event combobox, bib, athlete ID typed), delete by event+bib |
| `/team-aliases` | Teams with aliases (1,207) | `getTeamAliases` | add (two team-key comboboxes), delete alias key |
| `/candidates` | Split/merge candidates and team-alias candidates from JSON files | `/api/candidates/*` | none (read-only) |
| `/athlete`, `/athlete/:id` | Athlete search (loads all 23,766) and raw rows: athletes, athlete_teams, athlete_categories, athlete_results, licences, plus this athlete's overrides | `listRawAthletes`, `getRawAthlete`, `getAthleteAliasRulesForAthlete`, `getResultAssignmentsForAthlete` | delete override inline |
| `/team`, `/team/:key` | Team search (4,557) and raw rows with alias keys and members | `listRawTeams`, `getRawTeam` | delete alias key |
| `/event`, `/event/:id` | Event search (88) and raw row with per-distance result counts | `listRawEvents`, `getRawEvent` | none |

Shared components: `Combobox` (debounced async search with keyboard
navigation), `CollapsibleForm` (open/submit/error state), `DeleteButton`
(two-step confirm), `usePagedList` (IntersectionObserver paging, 50 per page),
`PageHeader`, `Badge`, `LoadingState`.

## 3. Measured behaviour

| Metric | Value |
|--------|-------|
| Time to first page (localhost, warm) | ~3.0 s (dominated by the 49 MB fetch + decrypt) |
| JS heap after load | 125 MB |
| Console errors across all routes | 0 |
| Cost of one write | `npm` start + `tsx` compile + decrypt + Drizzle migrate + write + encrypt of 49 MB, then a full browser reload of the same 49 MB; measured on the CLI side elsewhere at several seconds |
| Alias-rule names with more than one rule | 31 (max 6 for one name) |
| Duplicate `(event, bib)` assignments | 3 |
| Alias rules whose canonical name has no exact `athletes.name` match | 5 (link falls back to search) |
| Notes left empty | 6 alias rules, 22 assignments |
| Tests | 0 |
| Lint / typecheck | Included in root `npm run lint` and `npm run typecheck` |

## 4. What is genuinely strong (keep)

- **Single write path.** Every mutation goes through `manage-db.ts`, so the
  invariants documented in `scraper/CLAUDE.md` (alias flattening, cycle
  detection, lookup-key rewriting) cannot be bypassed by the UI.
- **Raw-row pages are the right abstraction.** They show table names and
  column names as-is (`athletes row`, `athlete_teams (1)`), which is what a
  reviewer needs to reason about a pipeline decision. The per-athlete
  overrides section on `/athlete/:id` closes the loop between "why does this
  profile look wrong" and "what rule caused it".
- **Comboboxes that search the real data** for athletes, events and team keys,
  with debounce and keyboard support, instead of free-text IDs everywhere.
- **Two-step delete confirmation** and per-row error display.
- **Read-only candidates view with confidence bars and status filters**, using
  the same JSON the scripts produce, so reviewers and scripts see one truth.
- The `data.db.enc` symlink keeps a single source file; `.env.local` is
  gitignored; the sidebar honestly says "local dev only".
- Small, consistent components; every page is ~200–500 lines with the same
  load/error/empty/list shape.

## 5. Scorecard (out of 10)

| Area | Score | Why |
|------|-------|-----|
| Correctness of writes | 4 | Delete-by-name cascades; team+name sent by client is ignored by server; candidates tab key mismatch |
| Coverage of the operator's job | 5 | Four override tables and raw rows are covered; pipeline flags, licence splits, anchored aliases, approve/reject and "run scrape" are not |
| Feedback and safety | 3 | No success message, no diff preview, no dry-run, no undo, no "scrape needed" or "commit needed" indicator |
| Performance | 4 | 49 MB per page load, full reload after each write, full-table client-side search |
| Code quality | 7 | Clean components and hooks, typed API, consistent pages; some duplication between the three add-forms |
| Tests | 0 | None |
| Deployability | 2 | Only works under `vite dev`; `dist/` is dead weight |
| Security posture for its scope | 6 | No auth, no origin check, but bound to localhost and args are passed to `spawnSync` as an array (no shell). Adequate for "local dev only", not for anything else |
| Documentation | 3 | No `backoffice/CLAUDE.md`; not mentioned in root or scraper docs beyond one line |

**Overall: 4.5/10** as a product, with a solid foundation to build the review
queue on.

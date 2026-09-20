# 02 — Issues Found (Backoffice)

Severity: **P0** can corrupt or lose override data, or a core page is broken ·
**P1** blocks the operator's job · **P2** quality · **P3** hygiene.

---

## A. Data integrity

### A1 · P0 — Deleting one alias rule deletes every rule with the same athlete name — FIXED in commit `12f43ba`
- `manage-db.ts` now accepts `--id N` for exact-row deletion. `admin-middleware.ts` passes `id` instead of `name`. `AliasesPage` and `RawAthletePage` pass `rule.id` to `removeAlias`.

### A2 · P1 — Adding an alias rule creates a new row even when one exists for the same canonical athlete
- `cmdAdd` always inserts a fresh `athlete_alias_rules` row with a one-element `aliases_json`. The schema supports many aliases per rule; the UI creates one rule per alias. This is why A1 has 31 multi-rule names, and it makes the pipeline apply the same canonical merge repeatedly. Not harmful to output, but it multiplies the blast radius of A1.

### A3 · P1 — No validation that referenced rows exist before writing
- Assignment and block forms accept any positive integer athlete ID and any bib string. `manage-db.ts` inserts without checking that the athlete exists or that the `(event, bib)` exists in `results`. Today all 445 assignments and 3 blocks resolve, but three `(event, bib)` pairs have duplicate assignments to different athletes; the pipeline applies them in insertion order, so the later one wins silently.

### A4 · P2 — Team alias "To" field accepts a key that does not exist
- `manage-db.ts` does `INSERT OR IGNORE INTO teams` for the canonical key, so a typo creates a phantom team row that the next scrape prunes, and the alias with it. The form text says "type a new one", which invites this.

### A5 · P2 — Alias rule canonical lookup is by exact display name
- `api/src/admin.ts` `(SELECT id FROM athletes WHERE name = athlete_alias_rules.name)` is case- and accent-sensitive. Five rules have no match, so their link falls back to a search page instead of the athlete.

---

## B. Broken or misleading UI

### B1 · P0 — Team Aliases candidates tab renders 141 blank rows — FIXED in commit `12f43ba`
- `CandidatesPage` type updated from `{ fromKey, toKey, reason }` to `{ from, to, approved }`. Status now renders correctly as approved/rejected/pending.

### B2 · P1 — Split candidates ignore the `approved` field and the licence/anchored files
- `SplitsTab` derives status from which file a pair sits in. The pending file also carries `approved: true|false|null` set by the reviewer; the page does not show or edit it. `licence-split-candidates.json` (78 undecided) and `athlete-anchored-team-aliases.json` (80) are not surfaced at all.

### B3 · P1 — The Candidates page cannot record a decision
- No approve/reject buttons. The documented workflow is still "open the JSON, set `approved`, run `db:apply-splits`". The page therefore duplicates a text editor with fewer capabilities.

### B4 · P1 — No indication that a scrape and a commit are required after edits
- Every override only takes effect after `npm run scrape`, and `data.db.enc` must be committed. Nothing in the UI says so; there is no "pending changes since last scrape" state, no run button, no link to the workflow.

### B5 · P2 — Success output is discarded; only failures are shown
- `admin-api.ts` `request()` returns `void` and ignores the `{ message }` body. The CLI prints useful lines such as "rewrote 12 athlete_lookup key(s)"; the operator never sees them.

### B6 · P2 — Full page reload after every write
- Eleven `window.location.reload()` calls. Each one re-fetches and re-decrypts the 49 MB database (~3 s) and loses scroll position, filter text and open forms.

### B7 · P2 — Plain `<a href>` navigation inside the SPA
- `backoffice/src/pages/AssignmentsPage.tsx`, `backoffice/src/pages/BlocksPage.tsx`, `backoffice/src/pages/CandidatesPage.tsx` use `<a href="/athlete/…">` instead of `<Link>`, causing a full reload (and the 49 MB cost) on every click to an athlete.

### B8 · P2 — Unknown routes render an empty main pane
- `/does-not-exist` shows the sidebar and nothing else (`screenshots/13-404.jpg`). No catch-all route.

### B9 · P3 — Assignment and block forms ask for a raw athlete ID
- The alias form has an athlete combobox; the other two forms make the operator find the ID elsewhere and type it. The most common workflow (open a raw athlete, spot a wrong result, reassign it) requires copying IDs between tabs.

### B10 · P3 — Team alias delete on the Raw Team page removes the alias from whichever canonical owns it
- `remove team-alias --from` scans all teams for the key and removes the first match. Correct today because aliases are flattened, but the page gives no confirmation of which canonical it was removed from.

---

## C. Architecture and performance

### C1 · P1 — Writes shell out to `npm run db:manage`
- `backoffice/server/admin-middleware.ts` `spawnSync("npm", ["run", "db:manage", "--", ...])`. Each call starts npm, compiles `manage-db.ts` with tsx, decrypts 49 MB, runs Drizzle migrations, edits, re-encrypts and writes. Serial, several seconds, and it inherits the whole server environment (including `DATA_KEY`) into a child process. The same functions could be imported and called in-process.

### C2 · P1 — The production build has no API
- The admin routes and candidate files exist only in `configureServer` (dev). `npm run build` produces `dist/` (present in the tree, dated 1 Aug) whose every write returns the SPA's `index.html` and whose candidates fetch returns HTML. The `build` script should either be removed or the middleware moved to a tiny standalone server.

### C3 · P2 — Full database in the browser for an admin tool
- Same 49 MB / 125 MB heap cost as the public site, but here the server already has Node and `better-sqlite3`. Reads could be served by the same middleware from the decrypted DB kept in memory, which would also make writes reflect instantly without reload.

### C4 · P2 — Search pages load entire tables client-side
- `listRawAthletes` returns 23,766 rows plus a `GROUP BY` over 74k `athlete_results`, `listRawTeams` 4,557, on every visit to the search pages. `searchRawNames` exists and is used by the combobox; the search pages could use it.

### C5 · P2 — Candidate files are served from gitignored working files
- `CANDIDATE_FILES` points at `scraper/*.json`, which are gitignored and only exist after running the finder scripts locally. A fresh clone shows "No pending candidates" and cannot tell whether that means "reviewed" or "never generated".

### C6 · P3 — No CSRF/origin check on state-changing endpoints
- Any page open in the same browser can POST to `localhost:517x/api/admin/*`. Acceptable for a tool that only runs on a developer machine; unacceptable the moment it is exposed on a network (Vite `--host`).

### C7 · P3 — Port collisions
- Vite auto-increments (the review ran on 5176 because 5173–5175 were busy). `split-candidates-*.json` embed `http://localhost:5174/...` URLs, which break when the port moves. Pin the port in `vite.config.ts` and stop writing absolute URLs into candidate files.

---

## D. Missing capabilities the operator needs (from the engine analysis)

| Gap | Why it matters |
|-----|----------------|
| Solo collision flags (59) and cross-pass flags (803) have no page | These are the pipeline's explicit "I could not decide" list; the CLAUDE.md tells the operator to review them, but the only viewer is a text editor |
| Licence-split candidates (78 undecided) not shown | Strongest merge signal available, currently invisible |
| Athlete-anchored team-alias candidates not shown | Ground-truth alias suggestions (athletes seen under two team IDs) |
| No "preview this merge" | An alias rule or assignment cannot be simulated before writing; the operator finds out after the next scrape |
| No audit trail | Override tables have `note` only; no `created_at`, no author, no history of deletions |
| No DB health panel | `db:check` output (ID gaps, orphans, top-3 per slice), link rates, single-letter participant count |
| No "run scrape" / "commit" actions | The two steps every edit requires are outside the tool |
| No event participants view | The parser bug in the engine analysis (single-letter names) would have been visible in one click |
| No results-row lookup by event + bib | Assignment and block forms need it; today the operator opens the public site or the JSON |

---

## E. Code health

### E1 · P2 — Three near-identical add-forms and three near-identical list pages
- `AliasesPage`, `AssignmentsPage`, `BlocksPage` share the search/filter/paged-table/delete shape and the event-combobox form. A generic `OverrideTable` and `OverrideForm` would halve the code.

### E2 · P2 — No tests, no `CLAUDE.md`
- The root `npm test` skips the workspace (no `test` script). There is no fixture for the middleware, and no documentation of the write path or the "scrape after edit" rule inside the workspace.

### E3 · P3 — `SCRAPER_DIR` uses `__dirname` in an ESM config
- Works because Vite bundles the config with a shim, but `server/admin-middleware.ts` is `.ts` imported as `.js`, and `__dirname` is not defined in native ESM. Fragile if the middleware is ever run outside Vite.

### E4 · P3 — `dist/` is committed-looking clutter
- `backoffice/dist` exists in the working tree (gitignored via the root `dist/` rule), built on 1 Aug, and cannot work (C2).

# Granfondo Portugal — Backoffice Analysis (18 Sep 2026)

Read-only review of the `backoffice` workspace: the local admin app used to
manage the manual override tables (athlete aliases, result assignments,
blocks, team aliases) and to inspect raw database rows. 3,315 lines across
20 files, two commits (31 May and 12 Sep 2026), no tests. Nothing was changed.

| Document | What it covers |
|----------|----------------|
| [01-architecture-analysis.md](01-architecture-analysis.md) | How the app works (browser + Vite middleware + CLI shell-out), what each page does, what is good, scorecard |
| [02-issues-found.md](02-issues-found.md) | 26 issues ranked P0–P3 with file references and evidence from the live database |
| [03-improvement-plan.md](03-improvement-plan.md) | Four phases: safety fixes, a real write path, the review queue the engine needs, and operator workflow |
| [04-handoff-guide.md](04-handoff-guide.md) | How to run it, exact pointers per issue, verification steps, what was not exercised |
| [screenshots/](screenshots/) | 14 captures at 1440×900 of every page, including the add-rule form and the empty candidates tab. The raw-athlete detail capture was removed because it showed licence numbers |

## How the evidence was gathered

- Every file under `backoffice/src`, `backoffice/server`, `vite.config.ts`, and the
  `api/src/admin.ts` query module it depends on were read in full, along with
  the CLI it shells out to (`scraper/src/db/manage-db.ts`).
- The dev server was started, every route was loaded in Playwright, and
  screenshots were taken. No write endpoint was called, so `data.db.enc` is
  untouched.
- The override tables were queried in memory (decrypted with the key from
  `scraper/.env`) to test the delete semantics and referential integrity.
- Candidate JSON files were parsed to compare their real keys with what the
  Candidates page expects.

## Headline verdict

The backoffice is a thin, honest tool: it makes the four override tables
visible and editable without touching SQL, and the raw-row pages are exactly
what a data-quality reviewer needs when a merge looks wrong. It is also
explicitly "local dev only" and behaves like a prototype:

1. **Deleting one alias rule deletes every rule with that athlete's name.**
   The UI shows one rule per row, but the server ignores the team and the CLI
   deletes by name. 31 names carry more than one rule today (one has six).
2. **The Team Aliases candidates tab is empty.** The page expects `fromKey`/`toKey`;
   the file has `from`/`to`. 141 candidates render as blank rows with a score.
3. **Every write shells out to `npm run db:manage`**, which decrypts, migrates,
   edits, re-encrypts and writes the 49 MB file, then the browser reloads and
   re-downloads and re-decrypts it. Each edit costs several seconds and there
   is no feedback about what changed.
4. **The Candidates page is read-only.** Decisions are still made by editing
   JSON by hand, and the pipeline's own flags (solo collisions, cross-pass
   merges, licence splits, anchored aliases) have no page at all.
5. **The production build is non-functional**: the admin API exists only as a
   Vite dev-server middleware, so `dist/` has no write path and no candidates.
6. **Nothing tells the operator that a scrape is required** after editing, or
   that the changed `data.db.enc` must be committed.

The plan fixes the two data-integrity items in an hour, then replaces the
shell-out with an in-process write path, and then turns the app into the
review queue that the engine analysis (`docs/engine`) identified as the
biggest observability gap.

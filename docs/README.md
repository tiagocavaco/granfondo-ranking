# Documentation index

Start here if you are picking this project up without prior context. These
documents were written on 18 Sep 2026 from a full read of the codebase, a
Playwright audit of the running site, and metrics computed from the live
database. Nothing in the codebase was changed while producing them.

## I was asked to… start here

| Task | Read | Then |
|------|------|------|
| Fix the start-list parser / distances | `engine/02-issues-found.md` B1, B9, B10 → `engine/04-handoff-guide.md` §3 | `test-plans.md` §1.1, verify with `engine/tools/db-metrics.mjs` |
| Fix the scrape schedules | `engine/02-issues-found.md` A1, A2 → `engine/03-improvement-plan.md` 0.1–0.2 | `test-plans.md` §6 |
| Make the site load fast | `docs/frontend/02-issues-found.md` A1 → `specs/data-artefacts.md` | `engine/03-improvement-plan.md` Phase 4 |
| Add next season's events | `runbook.md` §12 today; `specs/event-registry.md` for the future | |
| Build the review queue | `specs/review-queue.md` → `docs/backoffice/03-improvement-plan.md` Phase 2 | `features/performance-anomalies.md` |
| Add accounts / favourites / share cards | `specs/backend-api.md` → `monetization/03-plan.md` Phase 2 | `docs/frontend/03-improvement-plan.md` Phase 5 |
| Fix a wrong athlete profile or team | `runbook.md` §3–5, `backoffice/CLAUDE.md` | |
| Translate the site | `specs/i18n.md` | do it inside the component split (`code-quality/02-refactors.md` R1) |
| Restyle or add a theme | `specs/design-system.md` → `code-quality/02-refactors.md` R3, R4 | `docs/frontend/03-improvement-plan.md` Phase 3 |
| Publish privacy/terms pages (done — `/privacy` and `/terms` are live) or take money | `legal/`, `monetization/03-plan.md` legal hygiene | |
| Change the ranking formula | `engine/02-issues-found.md` C1–C3, `roadmap.md` open decision 1 | `test-plans.md` §5 |
| Refactor / reduce duplication | `code-quality/02-refactors.md` (pick the next PR in the order table) | `code-quality/metrics.json` before/after |
| Write tests | `test-plans.md` | `engine/metrics.json` → `tests` for current coverage |
| Understand the whole thing in an hour | this file, then the four `README.md`s, then `roadmap.md` | |

## Read in this order

1. **Repo orientation** — the four `CLAUDE.md` files are the authoritative
   descriptions of how things work: [`/CLAUDE.md`](../CLAUDE.md) (monorepo,
   data flow, encryption, git rules), [`scraper/CLAUDE.md`](../scraper/CLAUDE.md)
   (pipeline passes, invariants, CLI), [`api/CLAUDE.md`](../api/CLAUDE.md),
   [`frontend/CLAUDE.md`](../frontend/CLAUDE.md).
2. **[engine/](engine/README.md)** — the scraper, database, utils and api
   packages: what they do, what is wrong, what to build. This is where the
   data comes from and where most engineering hours went.
3. **[frontend/](frontend/README.md)** — the React site: visual review,
   issues, and the plan to reach a 10/10 race-event site.
4. **[backoffice/](backoffice/README.md)** — the local admin app for manual
   overrides and raw-row inspection: how it writes, what is broken, and how
   it should grow into the pipeline's review queue.
5. **[monetization/](monetization/README.md)** — costs of a proper backend,
   realistic audience, revenue options scored on fit and yield, a phased plan,
   and the organiser offer to send.
6. **[roadmap.md](roadmap.md)** — the four plans merged into one sequence
   against the race calendar, with cross-plan dependencies and open decisions.
7. **[code-quality/](code-quality/README.md)** — structure and style review
   with measurements, and twelve refactor recipes (target shape, files,
   order, safety net) for reducing duplication and function length.
8. **[specs/](specs/)** — interface contracts for the structural work:
   data artefacts v2, event registry, review queue, user backend, design
   system, localisation. Written so two agents would build the same thing.
9. **[test-plans.md](test-plans.md)** — concrete cases and fixtures for every
   under-tested area.
10. **[features/](features/)** — cross-cutting feature specs: performance
   anomalies, finish-time estimate, category age-up, series history and
   records, participation dashboards, ranking time travel, rivals, open data,
   and the claimed-profile group (Strava link, photos by bib, season recap,
   podium contest), and project-level additions (override backup, organiser
   upload, artefacts outside git history, error reports, large text,
   content channel, season recognition).
11. **[legal/](legal/)** — draft privacy notice and terms of use (PT and EN),
   to be reviewed by a lawyer before publishing.
12. **[runbook.md](runbook.md)** — fourteen symptoms, each with confirm /
   fix / verify commands.
13. **[engine/04-handoff-guide.md](engine/04-handoff-guide.md)** — glossary,
   key formats, exact file:line pointers for every P0/P1, verification
   commands, and the reproduction steps for every number in these docs.

## The eight things to fix first (all details in the linked issues)

| Priority | What | Where to read |
|----------|------|---------------|
| P1 | Sunday races get one scrape attempt (latent; has not bitten yet); Saturday races never get a participant refresh | [engine A1, A2](engine/02-issues-found.md#a-scheduling-and-automation) |
| P0 | Participant distances stored raw: `GranFondo` at Monção 2026 zeroes the prediction coefficient and mis-orders the tabs; walk and kids distances ingested as races and given Granfondo's distance ID | [engine B10, B9](engine/02-issues-found.md#b-scrapers-and-parsing) |
| P0 | New registrations page layout mis-parsed → single-letter participant names, 16% link rate | [engine B1](engine/02-issues-found.md#b-scrapers-and-parsing) |
| P0 | 49 MB download before first paint | [frontend A1](frontend/02-issues-found.md#a-performance-and-loading), fix in [engine Phase 4](engine/03-improvement-plan.md#phase-4--data-model-and-output-l) |
| P1 | Ranking coefficient is per gender field but documented as per distance | [engine C1](engine/02-issues-found.md#c-scoring-and-ranking-logic) |
| P1 | Unknown routes now show a 404 page (B2 fixed — `NotFoundPage` + `*` catch-all route); ranking pages still lack `h1` (B3); page title still doesn't change (B4) | [frontend B2–B4](frontend/02-issues-found.md#b-functional-bugs) |
| P1 | Manual overrides exist only inside an encrypted blob; a folder backup exists but cannot be diffed, and the key is held by one person | [features §1](features/project-level-additions.md), roadmap 0.11 |
| P0 | Backoffice "Delete" on an alias rule removes every rule with that name (31 names affected); candidates tab renders blank | [backoffice A1, B1](backoffice/02-issues-found.md) |

## Layout of this folder

```
docs/
  README.md                      this file
  roadmap.md                     one sequence for all plans, milestone by milestone
  runbook.md                     symptom → commands
  code-quality/                  findings, refactor recipes, metrics.json, tools/measure.mjs
  features/                      cross-cutting feature specs (10)
  specs/                         interface contracts (data artefacts, registry, review queue, backend API, design system, i18n)
  test-plans.md                  test cases and fixtures per area
  tools/check-refs.mjs           verifies paths and symbols referenced from docs
  tools/planned-paths.txt        allowlist of not-yet-existing paths
  tools/strip-line-refs.py       one-off migration that removed line numbers
  engine/
    README.md                    verdict + how evidence was gathered
    01-architecture-analysis.md  end-to-end flow, pass table, scoring, data model, measured quality, scorecard
    02-issues-found.md           38 issues, P0–P3, with file:line and DB evidence
    03-improvement-plan.md       7 phases, effort-sized, with acceptance criteria
    04-handoff-guide.md          glossary, key formats, pointers, verification and reproduction commands
    metrics.json                 raw numbers (DB, review backlog, tests, git)
    tools/db-metrics.mjs         recompute metrics.json from data.db.enc (in memory)
  backoffice/
    README.md                    verdict + how evidence was gathered
    01-architecture-analysis.md  read/write paths, page table, measured behaviour, scorecard
    02-issues-found.md           26 issues, P0–P3, with file:line and DB evidence
    03-improvement-plan.md       4 phases: safety, write path, review queue, operator workflow
    04-handoff-guide.md          how to run, pointers, candidate-file contract, verification
    screenshots/                 14 captures at 1440×900
  legal/
    privacy-notice.md            draft, PT + EN
    terms.md                     draft, PT + EN
  monetization/
    README.md                    headline: what covers hosting and what to avoid
    01-costs-and-audience.md     backend cost by stack, audience estimate from the DB, revenue target
    02-revenue-options.md        nine options scored on fit / effort / yield / risk
    03-plan.md                   four phases with KPIs, plus legal and tax hygiene
    04-organiser-offer.md        email + one-page offer for organisers and timing companies
    04-organiser-offer.pt.md     the same in Portuguese, ready to send
  frontend/
    README.md                    verdict + coverage statement
    01-project-analysis.md       architecture, strengths, scorecard
    02-issues-found.md           46 issues, P0–P3, with screenshot references
    03-improvement-plan.md       6 phases + feature catalogue
    screenshots/                 32 viewport captures, desktop 1440×900 and iPhone 14
    audit-report.json            raw Playwright metrics per route
    tools/audit.mjs              re-run the Playwright audit
```

## Personal data in this folder

Race results are public, and the screenshots show what the public site
shows. Even so, this folder avoids naming individual riders: issues cite
counts and athlete IDs, sample text in `audit-report.json` is redacted, and
the one backoffice capture that displayed licence numbers was removed. If
you add evidence, follow the same rule: IDs and counts, never names or
licences.

## Conventions used in every document

- Severity: **P0** wrong or missing data reaches users, or a core flow is broken · **P1** will bite within a season · **P2** quality · **P3** hygiene.
- Effort: **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks.
- File references are repo-relative with a line number where it matters, e.g. `scraper/src/pipeline/ranking.ts`. Line numbers are as of commit `ca65da4` on branch `fe-luxury-ux`; use the function name if lines have drifted.
- Numbers come from `engine/metrics.json` and `docs/frontend/audit-report.json`; both are regenerable with the scripts in `tools/`.

A `backoffice/CLAUDE.md` was also added (the workspace had none); it is the
only file outside `docs/` written by this review.

## Working-tree state when these docs were written

Analysis baseline: branch `fe-luxury-ux`, commit `ca65da4` (now merged to `main`). Three commits landed
during the review and were re-checked on 18 Sep 2026:

| Commit | What it changed | Effect on these docs |
|--------|-----------------|----------------------|
| `f38635e` tests: Add playwright tests | Adds `frontend/e2e/*` (10 spec files), `playwright.config.ts`, unit tests for shared components, and an `e2e` job in `ci.yml` that builds the frontend and runs Playwright | Frontend G5 (e2e presence-only tests) is partly addressed; the suite is now committed and runs in CI |
| `65c4805` fix: Fix CI | Adds `query` to the `filtered` memo dependencies in `EventList.tsx`; adjusts e2e specs and adds component tests | Frontend B1 (event search does nothing) is fixed |
| `bfc4f8e` fix: Fix CI | Test-only change | none |

`origin/main` additionally has `7cb67dc` (13 Sep, scheduled scrape that cached
Lousã 2026), which the local branch does not yet include; engine A1 was
downgraded accordingly. Every other issue in the three `02-issues-found.md`
files was verified still present at `bfc4f8e`: both scrape-workflow windows, the registrations parser,
the per-gender ranking coefficient, the missing 404 route and per-page titles,
the backoffice delete-by-name and candidates key mismatch, and `ci.yml` still
running `npm test` without coverage thresholds.

Additional work on `main` after the analysis baseline (not in the original review):

| What changed | Effect on these docs |
|---|---|
| `App.tsx` split into `NavBar.tsx` + `Footer.tsx`; `App.tsx` reduced from 406 to ~150 lines | Code-quality A8 is substantially resolved; `api/CLAUDE.md` `initLookups` call site updated to `NavBar.tsx` |
| `NotFoundPage` added + `<Route path="*">` wired | Frontend B2 fixed |
| Date logic unified: sort + `isEventPast` use string comparison, `isEventDatePast` removed | Frontend B13 fixed |
| `/privacy` and `/terms` legal pages added | `docs/README.md` task row and `docs/legal/` drafts updated |
| ESLint `no-unused-vars` upgraded to error; `id-length` allowlist extended with `q`, `h1`–`h6` | `CLAUDE.md` naming allowlist updated |

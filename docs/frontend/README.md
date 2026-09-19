# Granfondo Portugal — Site Analysis (18 Sep 2026)

Read-only review of the `fe-luxury-ux` branch. No code was changed. The goal is a
10/10 luxury race-event site that is eye-catching on mobile and desktop, carries
every piece of information a rider or fan needs, and has features people come
back for.

| Document | What it covers |
|----------|----------------|
| [01-project-analysis.md](01-project-analysis.md) | Architecture, data flow, what is already strong, and a scorecard per area |
| [02-issues-found.md](02-issues-found.md) | Every defect and weakness found, ranked by severity, with evidence |
| [03-improvement-plan.md](03-improvement-plan.md) | Phased plan to reach 10/10, plus a catalogue of new features |
| [screenshots/](screenshots/) | Viewport captures at 1440×900 and iPhone 14 (390×844) for every route |
| [audit-report.json](audit-report.json) | Raw Playwright metrics: payload sizes, heap, tap-target and small-text counts per page |

## How the evidence was gathered

- Every route was loaded through Playwright (Chromium) at desktop and mobile widths.
- Per page: console errors, horizontal overflow, elements under 36px tall,
  text under 11px, heading structure, document title, and full-page height.
- Network: transfer size and decode time of the encrypted database and the WASM.
- The encrypted DB was decrypted locally (using `scraper/.env`) only to measure
  its compressibility and row counts. The plaintext was deleted afterwards.
- All ~7,000 lines of frontend source were read, along with the API package,
  schema, workflows and the existing `TASKS.md` backlog.

## Headline verdict

The visual design is already at a strong 7.5/10: the dark navy and gold
palette, Barlow Condensed headlines, podium cards and ghost-date watermarks read
as intentional and premium. What keeps it from 10/10 is not styling. It is:

1. A 49 MB download before a single pixel of content renders.
2. A handful of real functional bugs (event search does nothing, blank 404, and others).
3. Missing "race day" information: routes, elevation, start times, weather, live status.
4. No way to share, bookmark, or personalise anything (no URL state, no favourites, no PT language).

The plan in document 03 is sequenced so that the first phase alone moves the
site from "beautiful demo" to "product people rely on at the finish line".

## Coverage statement

Read in full: all 50 files under `frontend/src/` (App shell, every route page,
every shared component, hooks, utils, CSS, Tailwind/Vite/Playwright config,
`index.html`, `public/404.html`), the `@granfondo/api` public surface, the
Drizzle schema, both CI workflows and `TASKS.md`.

Exercised in the browser: every route at two viewports, the mobile Rankings
dropdown, event status filters, event search, ranking row expansion, compare
with two athletes, a missing athlete ID and an unknown route.

Not exercised interactively (read only): team-ranking row expansion, team
profile "show all events/members" and non-qualifying events section, results
distance/category/gender switching, predictions "show more" and gender toggle,
chart tooltips and year selects, athlete search autocomplete. None of these
showed problems in code review beyond items B14–B17.

Out of scope: the `backoffice` workspace (8 admin pages for aliases,
assignments, blocks, candidates and raw record views), the scraper pipeline
internals, and the API query implementations beyond their signatures.

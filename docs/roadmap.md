# Roadmap — one sequence for all four plans

Merges `docs/frontend/03-improvement-plan.md`, `docs/engine/03-improvement-plan.md`, `docs/backoffice/03-improvement-plan.md` and `docs/monetization/03-plan.md` into
a single order, anchored to the race calendar in `scraper/event-schedule.json`.
Written 18 Sep 2026. Item codes refer to the phase numbers in each plan
(E = engine, F = frontend, B = backoffice, M = monetization).

## How to read the milestones

Every item is one of three kinds. If time is short, do all **pressing** items,
then the **safety-net** items, and treat everything else as optional.

| Kind | Meaning | Where it lives |
|------|---------|----------------|
| **Pressing** | Wrong or missing data reaches users, a silent failure mode exists, or human work can be lost | All of Milestone 0; 1.1, 1.3, 1.7 (compression), 1.5 (backoffice validation) |
| **Safety net** | Stops the pressing fixes from regressing; makes failures visible | 1.2, 1.9, 2.11 (golden test) |
| **Owed** | Not broken, but the product is not honest with its audience without it | 2.1 (tiering, the full fix for load time), 2.4 (backoffice write path), 2.7b (localisation) |
| **Enabler** | Code-quality recipes that an owed or upgrade item depends on; done inside that item's PRs, never as a separate "refactor sprint" | see the table below |
| **Upgrade** | Everything else: features, restyling, revenue | 1.4, 1.6, 1.8, the rest of 2.x, all of 3.x and 4.x |

### Where the code-quality recipes land (`docs/code-quality/02-refactors.md`)

| Recipe | Lands with | Why there |
|--------|-----------|-----------|
| R10 logger, R11 compiler flag | 1.3 run summary | The summary needs structured log events; the flag is a one-day change best done before anything else |
| R9 shared boilerplate, scripts under lint | 1.5 backoffice validation, 2.4 write path | The in-process write path *is* R9's `overrides.ts` |
| R7 one category normaliser | 2.11 golden test, then 2.7b localisation | Category labels per locale need one source of truth |
| R8 adapter interface | 2.3 event registry | The registry dispatches by adapter |
| R5 scraper `main` split, R12 writer | 2.1 tiered output | `writeOutput` and `buildLookups` are where tiering changes land |
| R4 tokens | 1.8 | Prerequisite for every visual item |
| R1 page splits, R2 `useQuery`, R3 primitives | 2.6, 2.7, 2.7b | Extract strings and primitives while each page is open |
| R6 pass helpers | 4.3 pipeline gains | Only after the golden test; pure readability |

Rule: a recipe is done in the same PR series as the item it enables, with the
metric in `docs/code-quality/metrics.json` recorded before and after. Item
4.7 covers only what is left once those items ship.

Stopping after Milestone 1 leaves a correct, monitored, fast-enough site.
Stopping after 2.1, 2.4 and 2.7b leaves one that is fast, safe to curate,
and in the audience's language. Everything beyond that is growth.

## The calendar this is built around

| Date | Event | Why it matters for the roadmap |
|------|-------|--------------------------------|
| Sat 19 Sep | Monção e Melgaço (past) | Participant data was wrong (E-B9, E-B10). Fix in next scrape cycle |
| Sun 27 Sep | Tavira | First race after the Phase-0 fixes; uses the registrations source, so it validates E-B1 |
| Sun 4 Oct | Serra d'Ossa | Registrations source; 1,770 registrants, 84% currently unlinked |
| Sun 18 Oct | Ourém-Fátima | Lista source |
| Sun 8 Nov | Portimão | Last race of 2026; registrations source |
| Nov – Feb | Off-season | The only window for structural work without a race every fortnight |
| ~Feb 2027 | Figueira Champions Classic | Season opener; new-season config must exist before discovery runs |

## Milestone 0 — Before Tavira (by 26 Sep) · ~3 days

Correctness only. Every item is small, isolated and testable.

| # | Item | Plan ref | Depends on |
|---|------|----------|-----------|
| 0.1 | Rebase `fe-luxury-ux` onto `main` (take `--theirs` for `data.db.enc`), merge | — | — |
| 0.2 | Registrations parser: drop avatar initial, validate name tokens | E-0.3 | — |
| 0.3 | Participant distance normalisation + drop walk/kids rows | E-0.11 | — |
| 0.4 | Re-run `scrape:participants`; confirm single-letter count is 0 and Monção shows three tabs | E handoff §3 | 0.2, 0.3 |
| 0.5 | Results workflow: nightly cron, window 0–3 days | E-0.1 | — |
| 0.6 | Participants workflow: nightly cron, window −4…−1 | E-0.2 | — |
| 0.7 | Backoffice: delete alias by id; fix candidates key names | B-0.1, B-0.2 | — |
| 0.8 | Frontend: catch-all route (done — `NotFoundPage` + `*`), per-page titles (partial — `usePageTitle` hook added, used on legal/info pages), `h1` on ranking pages, prediction tabs limited to road distances | F-0.2–0.5 | — |
| 0.9 | Ranking coefficient: decide semantics, align info page | E-0.4 | decision by owner |
| 0.10 | Analytics script + `/support` page + privacy notice (partial — `/privacy` and `/terms` are live; analytics and `/support` remain) | M-Phase 0 | — |
| 0.11 | Override export: the four override tables to a committed JSON on every scrape and write (readable diff; the existing folder backup covers file loss); restore command; key and PAT in a shared vault; confirm the folder backup includes `scraper/.env` | `features/project-level-additions.md` §1 | — |

Exit check: Tavira's start list links > 60%; predictions open on Granfondo;
Sunday-night scrape has a Monday retry; a wrong URL shows a 404 page;
`scraper/overrides.json` exists and round-trips.

## Milestone 1 — Through Portimão (Oct – 8 Nov) · ~2 weeks of work

Safety net and first revenue, while races keep coming.

| # | Item | Plan ref | Depends on |
|---|------|----------|-----------|
| 1.1 | Fixture tests for all scraper adapters and the events pipeline | E-1.1 | — |
| 1.2 | Relative sanity checks that fail the job; coverage thresholds in CI | E-1.3, E-1.4 | 1.1 |
| 1.3 | Run-summary artefact + GitHub issue on failure | E-2.1, E-2.3 | — |
| 1.4 | Organiser pilot: send the offer to Cabreira Solutions and BikeService before Serra d'Ossa; deliver favourites images by hand for one race each | M-Phase 1, M-04 | 0.4 |
| 1.5 | Backoffice validation on insert; success messages; `<Link>` navigation; `CLAUDE.md` | B-0.3–0.7 | — |
| 1.9 | "Report an error" link on athlete pages (mailto until the backend exists) | `features/project-level-additions.md` §4 | — |
| 1.6 | Frontend URL state for filters; unified back behaviour | F-2.3, F-0.9 | — |
| 1.7 | Compress-then-encrypt + service worker (no tiering yet) | E-4.2, E-4.3, F-1.2, F-1.4 | — |
| 1.8 | Design tokens only: colours, type scale, spacing, radius as Tailwind theme; codemod hex literals; no visual change intended | `specs/design-system.md` §2, R4 | — |

Exit check: a broken parser fails CI before it reaches `main`; the scrape
run page shows a summary; one organiser has agreed to a trial; cold load is
under 15 MB.

## Milestone 2 — Off-season structural work (Nov – Jan) · ~6 weeks

The only window for changes that touch the data model.

| # | Item | Plan ref | Depends on |
|---|------|----------|-----------|
| 2.1 | Tiered database output (core + per-event) and Web Worker decrypt; artefacts published as release assets or R2, not commits | E-4.1, F-1.1, F-1.5, `features/project-level-additions.md` §3 | 1.7 |
| 2.2 | Strip scraper-only tables from the browser artefact; `team_aliases` table | E-1.3, E-4.4 | 2.1 |
| 2.3 | Declarative event registry (`events.yaml`) replacing the six config maps; discovery proposes a PR | E-3 | — |
| 2.4 | Backoffice in-process write path and server-side reads | B-1.1–1.3 | — |
| 2.5 | Backoffice review queue with approve/reject for all six flag/candidate files | B-2.1, B-2.2 | 1.3, 2.4 |
| 2.6 | Component library (`frontend/src/ui/`), built one primitive at a time as each page is split in R1; backoffice adopts the same primitives | `specs/design-system.md` §3–4, R1, R3 | 1.8 |
| 2.6c | Large-text mode toggle | `features/project-level-additions.md` §5 | 1.8 |
| 2.6b | Light theme and theme toggle; `/styleguide` route rendering every component in both themes | `specs/design-system.md` §5, F-3.3 | 2.6 |
| 2.7 | Mobile navigation (bottom tabs), global search, tap-target and type-size pass | F-2.1, F-2.2, F-2.4–2.6 | 2.6 |
| 2.7b | Localisation: pt-PT default, en toggle, Intl formatting, category labels | `specs/i18n.md`, F-4.7 | 2.6 (extract strings in the same PRs that split pages and introduce primitives) |
| 2.8 | Backend beside Pages: Workers + D1, magic-link auth, favourites, claimed profiles | M-Phase 2 | 2.1 |
| 2.9 | Share cards (also the organiser image generator) | F-5, M-Phase 2 | 2.8 |
| 2.10 | Supporter membership (Stripe) | M-Phase 2 | 2.8, 2.9 |
| 2.11 | Golden-output pipeline test; then category-normaliser consolidation | E-1.2, E-6.1 | 1.1 |

Exit check: cold mobile load under 3 MB; every review flag has a page and a
button; a rider can star an athlete and get a share card; adding 2027 events
is a YAML diff; a Portuguese browser sees a Portuguese site.

## Milestone 3 — Pre-season (Jan – Feb 2027) · ~2 weeks

| # | Item | Plan ref | Depends on |
|---|------|----------|-----------|
| 3.1 | 2027 events into the registry (discovery PR + manual review) | E-3 | 2.3 |
| 3.2 | Historical 2021–2022 events (26 StopAndGo IDs + parameterised scrapers) | E-7, `TASKS.md` | 2.3, 2.11 |
| 3.3 | Event race guides: routes, elevation, start times, weather | F-4.1, E-5 | 2.3 |
| 3.4 | Event history and records pages | F-4.2, F-4.4, E-5 | 3.2 |
| 3.6 | Organiser season packages and widget; sponsor slot; organiser results upload | M-Phase 3, `features/project-level-additions.md` §2 | 2.9, 2.3 |
| 3.8 | Automated content channel: favourites and podium posts per race | `features/project-level-additions.md` §6 | 2.9 |
| 3.9 | Season-end recognition page and champion cards (retroactive 2023–2026) | `features/project-level-additions.md` §7 | 2.9 |
| 3.7 | Health panel and "run scrape / commit" actions in the backoffice | B-2.4, B-2.5 | 2.4 |

Exit check: season opener has a race guide, favourites, and a sponsor line;
the operator has not edited `config.ts` by hand.

## Milestone 4 — Season 2027 (Feb onward) · continuous

| # | Item | Plan ref |
|---|------|----------|
| 4.1 | Live results-day mode, push "results are in" | F-5 |
| 4.2 | Ranking movers, prediction accuracy | F-5 |
| 4.3 | Pipeline gains: licence carry-forward, auto team clustering, review-queue ranking model | E-6.2–6.4 |
| 4.3b | Performance-trajectory anomaly detector → review queue; then public form trend and breakthrough badges | E-6.7, `features/performance-anomalies.md` |
| 4.4 | Team dashboards, posters | M-02 E/F |
| 4.5 | Lighthouse, axe and visual-regression gates | F-6 |
| 4.6 | Cheap-win features from existing data: finish-time estimate, series records, participation dashboards, ranking time travel, rivals, open data, age-up notice | `features/*.md` |
| 4.7 | Remaining refactor recipes not consumed by earlier items (see "Where the code-quality recipes land") | `code-quality/02-refactors.md` |
| 4.8 | Claimed-profile features: Strava link, photos by bib, season recap email, podium prediction contest | `features/claimed-profile-features.md` |

## Longer bets (no date)

| Bet | Why | First step |
|-----|-----|------------|
| Official ranking for a federation or series body | Changes standing and funding; replaces scraping with a data agreement | Monetization plan Phase 3; approach after one full season of organiser packages |
| Second country (Spain) | The pipeline handles Spanish naming already; same timing platforms | One registry file per country; country-scoped rankings; only after the registry (2.3) exists |
| Partnership with the timing provider (StopAndGo) | Removes the largest operational risk (layout changes) | Offer a "results by StopAndGo" credit in exchange for a stable API or export |

## Hygiene items (any milestone, low effort)

| Item | Ref |
|------|-----|
| Renovate or Dependabot; align `drizzle-orm` ranges across workspaces | `code-quality/01-findings.md` F3 |
| CodeQL + secret scanning on the repository | engine B4 |
| Synthetic seed database for contributors and CI without the key | `test-plans.md` §3 |
| Status page from the run-summary artefact | engine 2.1 |
| Contributor guide and issue templates generated from the issue lists | — |
| Scripts back under lint and coverage | `code-quality/02-refactors.md` R9 |

## Dependencies that cross plans (do not reorder these)

- **E-B1/B9/B10 before any organiser outreach.** The predictions deliverable is the pitch; today it is wrong for registrations-sourced events.
- **Compression (1.7) before tiering (2.1).** Compression is a two-file change with immediate 4× win; tiering changes the API layer.
- **Run summary (1.3) before the review queue (2.5).** The queue reads the flags the summary makes available.
- **Backend (2.8) before membership (2.10) before sponsor (3.6).** Sponsors buy measured audience; measurement starts in 0.10.
- **Golden test (2.11) before any pipeline change (4.3).**
- **Registry (2.3) before historical events (3.2).** Otherwise 29 more hand-coded entries.
- **Tokens (1.8) before any visual work, primitives (2.6) before the light theme (2.6b) and before the mobile navigation pass (2.7).** Restyling a page twice is the most common way to waste the off-season.

## Owner decisions still open

1. Ranking coefficient: per gender field (rename and document) or per distance (rescore women's points). Blocks 0.9.
2. Project name for invoices and sponsor decks if "Granfondo Portugal" is not free to use. Blocks 1.4.
3. Whether the backoffice should remain local-only or gain auth for a second reviewer. Affects 2.4.
4. Keep the repository public (free Pages and Actions) with the encrypted-data model, or go private with paid minutes. Affects M-01.

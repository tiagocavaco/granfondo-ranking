# 02 — Issues Found

Severity scale: **P0** blocks the goal or breaks a feature · **P1** clearly hurts
users · **P2** polish · **P3** nice-to-fix. Each item names the file and, where
relevant, the screenshot in `screenshots/`.

---

## A. Performance and loading

### A1 · P0 — 49 MB encrypted database must fully download before anything renders
- Evidence: `audit-report.json` → `timing.desktop.resources` shows `data.db.enc` at 50,913,308 bytes; `00-loading-mobile.jpg` is what the user sees meanwhile.
- The plaintext gzips to 17.7 MB and brotlis to 12.8 MB, but encryption happens before transport so the CDN cannot compress it (`scraper/src/db/write-db.ts`, `database/src/db-writer.ts` contain no compression step).
- Every hard reload re-downloads it. There is no service worker, no `Cache-Control` strategy, no version check.
- Impact: 20–40 s on 4G, several minutes on 3G, and a 273 MB JS heap that will crash older iPhones' Safari tabs.

### A2 · P1 — Duplicate and unnecessary data shipped to the browser
- `results` (74,733 rows) and `athlete_results` (74,610 rows) carry the same race rows twice.
- `participants` (91,902 rows) includes start lists for events that already have results.
- Nine indexes and backoffice-only tables (`athlete_alias_rules`, `result_assignments`, `blocked_results`, `result_licences`, `__drizzle_migrations`) ship to every visitor.

### A3 · P1 — 812 KB JavaScript bundle, single chunk
- Recharts (used on two routes) and every page are in one chunk. No `React.lazy` / route splitting in `App.tsx`.

### A4 · P2 — `EventDetail` loads all events to find one
- `frontend/src/components/events/EventDetail.tsx` calls `api.getEvents()` and `Array.find`s. Same in `frontend/src/components/predictions/PredictionsPage.tsx`. Cheap today but wrong shape; there is no `getEvent(id)` in the API.

### A5 · P2 — No request de-duplication or caching between pages
- Navigating Events → Event → back re-runs `getEvents()` and `getStats()`. The ranking pages re-run `getAggregateRanking()` (a full-table scan and group) on every mount.

---

## B. Functional bugs

### B1 · P0 — Event search does nothing — FIXED in commit 65c4805 (18 Sep 2026)
- `frontend/src/components/events/EventList.tsx`: the `filtered` `useMemo` reads `query` but its dependency array is `[allEvents, season, status]`. Typing in "Search events…" never re-filters until you change another filter.
- Reproduced: typing `zzzzqqq` left 92 event links on the page (`audit-report.json → searchBugRows`).
- Status: `query` was added to the dependency array in commit 65c4805 after this audit. The committed e2e suite (`frontend/e2e/home.spec.ts`) should assert that a non-matching search empties the list; check before closing.

### B2 · P0 — Unknown routes render a blank page — FIXED
- Note: `public/404.html` correctly redirects deep links on GitHub Pages, so this is about the in-app catch-all, not hosting.
- `App.tsx` had no catch-all `<Route path="*">`. Fixed: `NotFoundPage` component added and wired as `<Route path="*">` in `App.tsx`. Unknown paths now render a branded 404 page.

### B3 · P1 — Ranking pages have no `h1` — FIXED in commit `12f43ba`
- `AggregateRankingPage`, `TeamRankingPage`, and `PredictionsPage` headings promoted from `h2` to `h1`.

### B4 · P1 — Document title never changes — FIXED in commit `12f43ba`
- `usePageTitle` hook added and applied to every page: events, athletes, athlete/team profiles, ranking pages, comparison, predictions, legal pages. Title format: `Granfondo Portugal · <Page Name>`.

### B5 · P1 — Filter state is not in the URL
- Ranking season/distance/gender, results distance/category/gender/search, event status filter, athlete year in charts: all component state. You cannot link to "2026 Mediofondo Women" or "Granfondo Paredes 2026 → Masters B". Browser back loses the view.

### B6 · P1 — Inconsistent "Back" behaviour
- `EventDetail` does `navigate("/")` (always home, even if you came from an athlete profile). `BackButton` does `navigate(-1)` (leaves the site if you arrived via a shared link). `PredictionsPage` links to the event. Three behaviours for one affordance.

### B7 · P2 — Prediction tabs include non-race distances — FIXED
- PredictionsPage now builds tabs from `DISTANCES.filter((d) => d in predictions)` only. Unknown keys (Caminhada, KIDS) are no longer appended.

### B8 · P2 — Category strings are raw and inconsistent
- Visible on the same athlete profile as "Master A #9" and "MASTERS B", and "SEM ESCALÃO" in participants. `canonicalizeCategory` in `@granfondo/utils/category` maps known raw strings to canonical form but falls back to `"Unknown"` for unrecognised inputs — not safe for display. A `displayCategory` helper that falls back to the raw value is needed before this can be applied in the UI.

### B9 · P2 — Distance chip falls back to a light-grey style in dark UI
- `frontend/src/utils/distance.ts`: unknown distances get `bg-slate-100 text-slate-600` (a light-mode pill). See the white "Caminhada" pills in `v04-participants-mobile-b.jpg`.

### B10 · P2 — `PerformanceChart` breaks the Rules of Hooks — FIXED
- Early `return null` moved to after `useMemo` and `useState` calls. All hooks now run unconditionally on every render.

### B11 · P2 — Team/athlete unavailable banners can stack permanently
- `App.tsx` shows amber banners for `lookupsFailed` / `teamsUnavailable` with no dismiss and no retry.

### B12 · P3 — `key={i}` on result rows
- `frontend/src/components/events/ResultsTab.tsx`, `ParticipantsTab.tsx` use array index keys; filtering causes full row re-renders and can mis-associate hover/expanded state.

### B13 · P3 — Timezone-sensitive date logic — FIXED
- `new Date(e.date + "T12:00:00")` and `"T00:00:00"` were mixed (`EventList` vs `EventDetail`). Fixed: sort and "isPast" now use date strings directly (no `new Date` construction), avoiding all timezone drift. `isEventDatePast` was removed; `isEventPast(date, hasResults)` is the single function.

### B14 · P2 — "Best" means two different things on two pages
- `AthleteProfile.tsx` computes Best from overall `pos`; `frontend/src/components/comparison/ComparisonHeroCard.tsx` computes it from `genderPos`. The same athlete can show "#1" on the profile and "#2" on the compare card. Pick one (gender position is the ranking basis) and label it.

### B15 · P2 — Head-to-head column headers use first names only
- `frontend/src/components/comparison/SharedEventsTable.tsx` uses `aName.split(" ")[0]`. Two "Pedro"s or two "João"s produce identical column headers; the winner dot column that would disambiguate is hidden below `md`.

### B16 · P3 — Compare hero uses first result's country, profile uses most-recent
- `frontend/src/components/comparison/ComparisonHeroCard.tsx` reads `data.results[0].country`; `AthleteProfile` uses `mostRecentCountry`. Riders who changed licence country show different flags on the two pages.

### B17 · P3 — Team member search collapses the "show all" state
- `frontend/src/components/team-ranking/TeamMemberList.tsx` resets `expanded` on every keystroke; clearing the search snaps back to 10 rows.

---

## C. Mobile UX

### C1 · P1 — Event names truncate with ellipsis on mobile
- `v01-home-mobile-b.jpg`: "GRANFONDO 5 QUINAS SABUG…", "GRANFONDO SERRA DA ESTRE…". `EventRow` uses `truncate` on the title. `TASKS.md` explicitly lists "event/athlete names never truncate awkwardly" as a goal.

### C2 · P1 — Primary navigation is at the top, out of thumb reach
- Sticky top header with three text tabs and a "Rankings ▾" dropdown. On a 390px phone the reachable zone is the bottom third. No bottom tab bar.
- The dropdown's sub-items are labelled "Athletes" and "Teams" (`18-mobile-nav-open-mobile.jpg`) while the top-level tab next to it is also "Athletes". Two different "Athletes" targets within 100px.

### C3 · P1 — Tap targets under 36px
- Audit counts: 198 small targets on `/ranking` mobile, 71 on `/team/7`, 43 on `/teams`. Mostly team-name links (17–20px tall) inside table rows, "← Back" (20px), "How scoring works" (16px), "How it works" (16px), the chart season `<select>` (26px).

### C4 · P1 — Text below 11px is everywhere
- 609 sub-11px text nodes on home, 121 on athlete profile, 65 on mobile athlete profile. Labels like "RACE EVENTS · RANKINGS" (10px), year under date (9px), stat labels (9–10px), coefficient details. Fine as decoration, not fine when it carries information such as "985 registered" or category names.

### C5 · P2 — Low-contrast secondary text
- `text-slate-600` (#475569) on `#0c1628` is roughly 3.1:1; `text-slate-700` (#334155) used for chart ticks and the arrow glyph is under 2:1. Both fail WCAG AA for body text. It is used for team names, dates, locations and "finishers" labels.

### C6 · P2 — Mobile results table hides category, bib and gap
- On mobile the results table shows only Pos / Athlete / Time (`v03-results-mobile-b.jpg`). Category position, gender and bib, the things a rider checks first, require rotating the phone or guessing. No row expand, no "my category" quick filter.

### C7 · P2 — Head-to-head cards are cramped at 390px
- `v12-compare-mobile-a.jpg`: two hero cards side by side wrap names to two lines and stack five stats in a 2-column grid with orphan rows.

### C8 · P2 — Podium animation observed still fading 2 s after load
- `v06-ranking-mobile-a.jpg` shows the 3rd-place card at partial opacity. `.animate-in` starts at `opacity: 0`; any remount (filter change, StrictMode double-invoke) replays the stagger. Low confidence on root cause but worth a check with `prefers-reduced-motion` too, which is not honoured anywhere.

### C9 · P3 — Native `<select>` for season/distance/gender on mobile
- Functional but visually breaks the custom aesthetic (iOS picker wheel), and the "Granfondo (185 finishers)" label variant is a clever hack rather than a designed control.

### C10 · P3 — Sticky header eats 11% of the viewport
- 96px of a 844px screen is permanent chrome. The header does not collapse on scroll.

---

## D. Desktop UX

### D1 · P2 — Athletes page is a 670px column on a 1440px screen
- `v10-athletes-desktop-a.jpg`. Wasted real estate; could show filters, letters index, or team browse beside it.

### D2 · P2 — Chart labels collide
- `v08-athlete-desktop-a.jpg`: "#2#3", "#4#5", x-axis "Mar 24 May 24" overlap. The line also joins Granfondo and Mediofondo positions into a single trend, so a #56 Mediofondo result draws a cliff that says nothing about Granfondo form.

### D3 · P2 — Hover states are subtle to the point of invisibility
- `card-dark:hover` lifts 2px and adds a 6% glow. Event rows tint `bg-white/[0.03]`. Users cannot tell what is clickable (podium cards, whole ranking rows, hero card) without moving the mouse.

### D4 · P3 — Table columns jump between breakpoints
- Results table shows 8 columns at `lg`, 7 at `md`, 3 on mobile, with no user control and no sticky first column when it does overflow.

---

## E. Information gaps (what a race-event site is expected to have)

| Missing | Why it matters |
|---------|----------------|
| Route map, distance in km, elevation gain per distance | The first three things every rider wants; distances are shown only as names ("Granfondo") |
| Start time, start location, registration deadline, price, official registration link | The hero has "Official Page ↗" only; the site cannot answer "when do I need to be there" |
| Event description, organiser, sponsors, photos | Nothing beyond the name |
| Location precision | Several events say only "Portugal" (`v01-home-desktop-a.jpg`, "São Mamede… Portugal") |
| Weather forecast for upcoming events | Trivial via Open-Meteo, high perceived value |
| Category position column in results on mobile | Riders race their category |
| "Where did I finish in my category / gender" for a searched name | Requires manual scanning |
| Season calendar view / ICS export | Events are a list, not a calendar |
| Results-day live status ("results arriving", "provisional") | Only "Results pending" after the fact |
| Historical winners per event across years | Event pages are per-edition; no "this event over time" |
| Records: fastest times per course, biggest fields | Exists in the data, unsurfaced |
| Portuguese language | Audience is Portuguese; UI is English |

---

## F. SEO, sharing, and platform

### F1 · P1 — Nothing is indexable or shareable
- Single `<title>`, no description, no OG/Twitter cards, no `sitemap.xml`, no `robots.txt`, no canonical URLs. A shared athlete link previews as a generic "Granfondo Portugal" with no image.
- Content is behind a 49 MB client-side decrypt, so crawlers see an empty `#root`.

### F2 · P1 — Not installable, not offline-capable
- No web manifest, no service worker, no icons beyond `favicon.svg`. On a finish line with poor signal this is the difference between usable and not.

### F3 · P2 — `lang="en"` with Portuguese content
- Names, team names, categories ("SEM ESCALÃO") are Portuguese; screen readers will mispronounce them.

### F4 · P3 — Three date formats
- "Saturday, 19 September 2026" (hero), "Sunday · 26 JUL 2026" (detail), "2026-02-15" (tables). Pick one per context and use `Intl.DateTimeFormat` with `pt-PT`.

---

## G. Code health

### G1 · P2 — Hard-coded design tokens
- `#0c1628` appears in 30+ places; `text-[10px]`, `text-[9px]`, `bg-white/[0.07]`, `border-white/[0.06]` hundreds of times. The `:root` variables in `index.css` are used by two utility classes only. `tailwind.config.js` defines a `brand` blue that nothing uses.

### G2 · P2 — Duplicated components
- Official Page / Results / Predictions link cluster: 4 copies. Filter bar with label + select: 6 copies. Empty-state SVG + text: 8 copies. `Select` wrapper: defined inside `ParticipantsTab` only. `FilterGroup` in `EventList` duplicates `SegmentedControl`.

### G3 · P2 — Oversized components
- `EventList` 625, `TeamProfile` 562, `PredictionsPage` 494, `TeamRankingPage` 471 lines, each with 4–6 inner components. CLAUDE.md's own guidance says ~50 lines per function.

### G4 · P2 — Every page hand-rolls loading/error/data state
- 12 copies of the same `useState` triple. No shared `useQuery`-style hook, no skeletons, spinner-only loading.

### G5 · P3 — e2e tests check presence, not behaviour
- `nav.spec.ts` asserts a gold border exists; `pages.spec.ts` asserts headings exist. Nothing asserts that search filters, that filters combine, that back navigation preserves state, or that the DB size stays under a budget.

### G6 · P3 — `console.log`/`ErrorBoundary` render raw stack traces to users
- `main.tsx` ErrorBoundary prints `e.message + stack` in red monospace. Should be a branded error screen with a reload action.

---

## H. Data-quality items visible in the UI

- Team spelled three ways in one ranking: "Penacova First Bike Reconco", "Penacova Firstbike Reconco", "Penacova Firstbikereconco", "Penacova|Firstbike| Reconco" (`v06-ranking-desktop-a.jpg`, `v05-predictions`). Alias tooling exists; these need entries.
- Location "Portugal" as a placeholder for several events.
- "Individual" shown as a team in results (rendered as plain text, fine, but a chip like "No team" reads better).
- Category "Master A" vs "MASTERS A" vs "MASTERS A FEM" vs "ELITES M" vs "M ELITES".

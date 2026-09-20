# 03 — Plan to Reach 10/10

Sequenced so each phase ships on its own and the biggest user-facing gain comes
first. Effort is rough: **S** ≤ 1 day, **M** 2–4 days, **L** 1–2 weeks.

---

## Phase 0 — Fix what is broken (S, do first)

| # | Change | Where |
|---|--------|-------|
| ~~0.1~~ | ~~Add `query` to the `filtered` memo dependencies~~ — done (commit `65c4805`) | `frontend/src/components/events/EventList.tsx` |
| ~~0.2~~ | ~~Add a `NotFound` route with a branded page, search box and links to Events / Rankings~~ — done (`NotFoundPage` + `<Route path="*">`) | `App.tsx` |
| 0.3 | Use `h1` on ranking, team ranking and predictions pages | 3 files |
| 0.4 | Per-route `<title>` and `<meta name="description">` via a tiny `usePageMeta` hook | new hook + every page |
| 0.5 | Filter prediction tabs to `ROAD_DISTANCES` only (or a whitelist in `@granfondo/utils/distance`) | `PredictionsPage.tsx` |
| 0.6 | Apply `canonicalizeCategory` in the four components listed in `TASKS.md` | already planned |
| 0.7 | Dark fallback style for unknown distance chips | `frontend/src/utils/distance.ts` |
| 0.8 | Move the early `return null` in `PerformanceChart` below the hooks | `PerformanceChart.tsx` |
| 0.9 | Unify "Back": always `navigate(-1)` when `history.state.idx > 0`, else go to the logical parent | `BackButton.tsx`, `EventDetail.tsx` |
| 0.10 | Add team aliases for the Penacova / Reconco variants surfaced in the ranking | backoffice |

---

## Phase 1 — Make it fast (L, the 10/10 unlock)

Target budget: **≤ 3 MB before first content on a cold mobile load, ≤ 300 KB
for a return visit.**

### 1.1 Split the database into tiers
Ship three encrypted files instead of one:

| File | Contents | Est. size (brotli) |
|------|----------|--------------------|
| `core.db.enc` | events, event_distances, stats, athletes (id, name, team, country), teams, athlete_lookup, aggregate_athletes/results, team_ranking, team_race_* | ~2–3 MB |
| `results-<eventId>.db.enc` or one `results.db.enc` per season | results rows for that event/season | 100–400 KB each |
| `participants-<eventId>.db.enc` | start lists for upcoming events only | ~50 KB each |

sql.js supports `ATTACH` of additional in-memory databases, so `@granfondo/api`
keeps working with an `ensureLoaded("results", eventId)` guard in the three
functions that need it (`getResults`, `getParticipants`, `getAthlete`).
`athlete_results` becomes a view over `results` or is dropped.

### 1.2 Compress before encrypting
Brotli (or gzip, both native in Node and `DecompressionStream` in browsers)
the SQLite bytes, then AES-GCM. Measured: 48.6 MB → 12.8 MB for the whole
DB; the core tier alone will be a fraction of that. Update
`database/src/decrypt.ts` to `decrypt → decompress`.

### 1.3 Strip what the browser never reads
Drop `__drizzle_migrations`, `athlete_alias_rules`, `result_assignments`,
`blocked_results`, `result_licences`, `participants` for finished events, and
every index not used by an `api/` query. `VACUUM` before encrypting.

### 1.4 Cache with a service worker
- Content-hash the DB files (`core.<hash>.db.enc`) and reference the hash from a tiny `manifest.json` fetched with `no-cache`.
- Workbox `CacheFirst` for hashed files, `NetworkFirst` for the manifest.
- Also gives offline mode: a rider on a mountain with no signal still sees the last-synced results.

### 1.5 Move decrypt + sql.js into a Web Worker
Keeps the main thread free during the 1–2 s decrypt/parse; the loading screen
can animate and show real progress (bytes received, "decrypting", "indexing").
Use `Comlink` or a hand-written message bridge; `@granfondo/api` already takes an
injectable `getDb`.

### 1.6 Route-level code splitting
`React.lazy` for every route; Recharts loads only on athlete/compare pages.
Expected main chunk: ~250 KB.

### 1.7 Loading experience
Replace the spinner with a branded progress screen: logo, progress bar tied to
`ReadableStream` byte count, rotating race facts ("74,663 finishers since
2023"). Skeleton rows on every page instead of `<Spinner />`.

---

## Phase 2 — Mobile-first navigation and ergonomics (M)

### 2.1 Bottom tab bar on mobile
Four tabs: **Events · Rankings · Athletes · Search**. Rankings opens a segmented
Athletes/Teams switch inside the page, removing the ambiguous dropdown. Header
collapses to logo + page title on scroll.

### 2.2 Global search (⌘K / search tab)
One box that returns events, athletes and teams with type badges. Backed by the
existing `searchAthletes`, `searchTeams`, `searchEvents` in `api/`.

### 2.3 URL-backed state
Season, distance, gender, category, search and expanded row go into
`useSearchParams`. Every view becomes linkable and back-button-safe. A
`useUrlState(key, default)` helper keeps components small.

### 2.4 Tap-target and type-size pass
- Minimum 44×44 px for anything tappable; team links in tables become full-row taps with a chevron.
- Raise the informational floor to 12px; decorative eyebrows may stay at 10–11px but never carry data.
- Replace `text-slate-600/700` for content with a `--text-muted` token at ≥ 4.5:1.

### 2.5 Names never truncate
Wrap to two lines with `line-clamp-2` and `text-balance`; drop the `uppercase`
on long mobile titles or reduce tracking so more fits.

### 2.6 Results table on mobile
Card rows instead of a 3-column table: rank badge, name + team, time + gap,
and a second line with category chip + category position + gender. Add a
sticky "Find me" search and a one-tap "Only my category" after a name is
selected.

### 2.7 Native controls → designed controls
Bottom-sheet pickers for season/distance/category on mobile; keep native
`<select>` as a fallback for keyboard users on desktop.

---

## Phase 3 — Design system and luxury polish (M)

### 3.1 Tokens
Move every colour, radius, shadow and type scale into `tailwind.config.js`
(`surface.0/1/2`, `line.subtle/strong`, `gold`, `text.primary/secondary/muted`)
and delete the hex literals. This makes 3.3 possible.

### 3.2 Component library (`frontend/src/ui/`)
`PageHeader`, `HeroCard`, `StatStrip`, `FilterBar`, `DataTable` (sticky header,
column visibility, sort), `EmptyState`, `ExternalLinkChip`, `Skeleton`,
`BottomSheet`, `Tabs`. Each page shrinks to ~150 lines of composition.

### 3.3 Light theme + `prefers-color-scheme`
A luxury site is read in bright sun at a finish line. Provide an ivory/charcoal
light theme with the same gold accent; auto-switch, with a manual toggle.

### 3.4 Motion
- Honour `prefers-reduced-motion`.
- Shared-element transition (View Transitions API) from event row → event hero, podium card → athlete hero.
- Podium medal shimmer on first render; count-up on stat numbers.
- Remove per-row stagger on long lists (it delays content); keep it for the top 3.

### 3.5 Hover/pressed affordance on desktop
Clear cursor + border-gold on hover for every card, arrow slide on rows, pressed
scale 0.98.

### 3.6 Charts
- Split the performance trend into one line per distance (small multiples or a toggle).
- Collision-avoid labels (show only podiums and extremes; rest on hover).
- Season sparkline in ranking rows; points-per-race bar in the expanded breakdown.

### 3.7 Event identity
Per-event accent: a colour derived from the event name hash, or a hand-curated
map for the ~25 recurring events, plus a header image (see 4.1). Event pages
stop looking identical.

---

## Phase 4 — Information completeness (L, needs scraper work)

### 4.1 Event pages become race guides
Add to `events` (scraper + manual overrides in backoffice):
`description`, `startTime`, `startLocation` (lat/lng), `registrationUrl`,
`registrationDeadline`, `price`, `heroImageUrl`, `organiser`, `gpxUrl` per
distance, `distanceKm`, `elevationM`. Display:
- Hero image with gradient scrim.
- "Race facts" strip: km / D+ / start time / field size.
- Map (MapLibre + OpenFreeMap tiles, no API key) with start pin and route polyline from GPX.
- Elevation profile (SVG, from GPX).
- Weather for upcoming events (Open-Meteo, free, no key) with a race-morning forecast.
- Countdown with "add to calendar" (.ics download) and "Directions" deep link.

### 4.2 Event history
An `/event-series/:slug` page grouping editions of the same event: winners by
year, field size trend, fastest time ever on the course, "your results here" if a
favourite athlete is set.

### 4.3 Season calendar
`/calendar` month grid + list toggle; ICS feed of the whole season.

### 4.4 Records and stats page
Fastest Granfondo/Mediofondo times, biggest fields, most wins, most podiums,
longest streaks, youngest/oldest category winners. All computable from current data.

### 4.5 Results extras
- Category and gender podiums block at the top of a results page.
- Team classification per event (top-N riders), reusing `team_race_results`.
- Nationality breakdown becomes a clickable filter.
- "Provisional / Official" flag and a `resultsPublishedAt` timestamp.

### 4.6 Athlete profile extras
- Season summary card per year (points, rank, best).
- Category progression timeline.
- "Rivals" (most-shared events, closest average gap) → one-tap compare.
- Head-to-head from any results row (long-press / hover "Compare").

### 4.7 Portuguese localisation
Specified in `docs/specs/i18n.md`; moved earlier in the roadmap (Milestone 2)
because the audience is Portuguese and the string extraction is cheapest
during the component split.

---

## Phase 5 — Engagement features (M–L)

| Feature | Description | Depends on |
|---------|-------------|------------|
| **Favourites** | Star athletes, teams, events (localStorage; sync later). Home gets a "Your riders" strip with their latest result | 2.3 |
| **My profile** | "This is me" claim → personal dashboard: season points, rank movement, next event countdown, predictions for me | Favourites |
| **Share cards** | Generate a 1200×630 PNG (Satori/`@vercel/og` at build or client canvas) for athlete results, podiums and event summaries. Used as OG image and "Share" button | 0.4 |
| **Push / email "results are in"** | Web Push via a tiny worker (Cloudflare) triggered by the scrape workflow when `hasResults` flips | 1.4 |
| **Live results day mode** | Event page polls the manifest every 60 s on race day; banner "Results arriving" → "Official" | 1.4 |
| **Form trend, breakthrough badge, season movers** | Positive-only public features from the trajectory detector in `docs/features/performance-anomalies.md`; badges suppressed while an identity flag is open | engine 6.7, backoffice queue |
| **Ranking movers** | "+3 ▲" since last event in ranking rows; "biggest climbers" widget on home | scraper stores previous snapshot |
| **Prediction accuracy** | After an event, show how the predictions did (hit rate for top-3) — turns predictions into a game | none |
| **Fantasy / pick'em** | Pick 5 riders per event, score by their points. Needs a backend; candidate for Cloudflare Workers + D1 | backend |
| **Team dashboard** | Team manager view: members' upcoming registrations, season points, best category per member | 4.6 |
| **Embeddable widgets** | `<iframe>` ranking top-10 / next-race card for club sites | 2.3 |
| **PWA install prompt** | "Add to home screen" after second visit; app icon; splash screen | 1.4 |

---

## Phase 6 — Quality gates (S, ongoing)

- **Performance budget in CI:** fail the deploy if `core.db.enc` > 3 MB or main JS > 300 KB.
- **Lighthouse CI** on `/`, `/event/:id`, `/athlete-ranking` mobile, threshold 90 performance / 100 accessibility.
- **Playwright behaviour tests:** search filters, filters combine, URL round-trips, back preserves state, 404 renders, no console errors.
- **Visual regression** (Playwright `toHaveScreenshot`) for hero, podium, results row, at both viewports and both themes.
- **axe-core** in e2e for every route.
- ~~Commit the untracked `frontend/e2e/` and `playwright.config.ts`~~ — done (commit `f38635e`).

---

## Suggested order of execution

1. Phase 0 (one day) — ship immediately.
2. Phase 1.2 + 1.3 + 1.4 (compress, strip, cache) — a 4× win with no architecture change, ~2 days.
3. Phase 1.1 + 1.5 (tiered DB, worker) — the real fix, ~1 week.
4. Phase 2 — mobile navigation and URL state.
5. Phase 3.1–3.2 (tokens + components) before any further visual work, then 3.3–3.7.
6. Phase 4.1 event guides (the biggest information win) → 4.7 localisation → the rest of 4.
7. Phase 5 features, prioritised: favourites → share cards → live results day → movers → prediction accuracy.
8. Phase 6 gates from step 2 onward so nothing regresses.

## What "10/10" looks like at the end

- Cold mobile load shows the next-race hero in under 2 seconds on 4G; return visits are instant and work offline.
- A rider opens a shared link, sees a rich preview, lands on their exact result with category position, taps "Compare" against the rider who beat them, and stars both.
- Every event page answers when, where, how far, how high, what weather, who is favourite, who won last year.
- Navigation is thumb-first on phones and keyboard-first on desktop, in Portuguese by default.
- Every view has a URL, a title, and a share card.
- The site looks as good in sunlight (light theme) as it does at night, and every animation respects motion preferences.

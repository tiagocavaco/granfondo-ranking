# 01 — Project Analysis

## 1. What the product is

A static, serverless results-and-rankings site for the Portuguese granfondo
series. It covers 88 events across 2023–2026, 74,733 results, 23,766 unique
athletes, 4,557 teams and 91,902 start-list entries. A scheduled GitHub Action
scrapes StopAndGo, apedalar.pt and a few one-off sources, builds a SQLite file,
encrypts it, and commits it. The browser downloads the whole encrypted file,
decrypts it with Web Crypto, loads it into sql.js and runs every query locally.

Audience, per `TASKS.md`: athletes checking results at the finish line or on
the road. That is a mobile, cellular, impatient, one-handed user.

## 2. Architecture

```
scraper  ──►  database (schema, writer, encrypt)  ──►  frontend/public/data/data.db.enc
                        ▲                                       │
                  utils (scoring)                          browser fetch (49 MB)
                        ▲                                       ▼
                  api (queries, injectable getDb)  ◄──  sql.js in-memory DB
                        ▲
                  frontend (React 18 + Vite + Tailwind + Recharts + react-router 6)
                  backoffice (separate Vite app for manual overrides)
```

Strengths of this architecture:

- **Zero backend cost, zero ops.** GitHub Pages plus Actions is the whole stack.
- **Query logic is shared and testable.** `@granfondo/api` is environment-agnostic; tests exist per module.
- **Data quality tooling exists.** Aliases, result assignments and blocked results live in the DB and have a backoffice.
- **Clear workspace boundaries** and a CLAUDE.md that documents the non-obvious decisions (rebase rules, TeamProfile loading order).

Costs of this architecture, measured on this branch:

| Metric | Value |
|--------|-------|
| `data.db.enc` transfer | 50,913,308 bytes (48.6 MB) |
| WASM transfer | 659,730 bytes |
| Main JS bundle (last `dist/`) | 812 KB (uncompressed) |
| JS heap after load | 273 MB |
| Time to first content on localhost | ~2.5 s (network cost is near zero locally) |
| Same file gzip / brotli if compressed before encryption | 17.7 MB / 12.8 MB |

On a real 4G connection (~10–20 Mbit/s effective) the 49 MB download is 20–40
seconds of a spinner saying "Loading race data…". On 3G it is minutes. This is
the single biggest gap between the current site and a 10/10 experience, and no
amount of visual polish changes it. Section 5 of the plan addresses it.

Contributing factors inside the DB:

- `results` (74,733 rows) and `athlete_results` (74,610 rows) are near-duplicate
  denormalised copies of the same data.
- `participants` holds 91,902 rows. Start lists for finished events are of
  little value once results exist.
- Nine indexes ship to the browser; several exist only for the scraper/backoffice.
- Encryption happens on the raw SQLite pages, so the transport layer cannot
  compress it (GitHub Pages gzip does nothing for random-looking bytes).

## 3. Frontend structure

| Route | Component | Lines | Notes |
|-------|-----------|-------|-------|
| `/` | `EventList` | 625 | Hero, stats strip, filters, year-grouped rows |
| `/event/:id` | `EventDetail` + `ResultsTab` / `ParticipantsTab` | 299 + 397 + 319 | Hero card, one table |
| `/event/:id/predictions` | `PredictionsPage` | 494 | Per-distance tabs, favourites |
| `/athletes` | `AthletesPage` | 182 | Search + most active |
| `/athlete/:id` | `AthleteProfile` + chart + highlights | 323 + 307 + 63 | |
| `/ranking` | `AggregateRankingPage` + podium + table | 233 + 121 + 177 | |
| `/teams` | `TeamRankingPage` | 471 | |
| `/team/:teamId` | `TeamProfile` + `TeamMemberList` | 562 + 136 | |
| `/compare` | `ComparisonPage` + hero + chart + table | 283 + 105 + 307 + 119 | |
| `/ranking-info`, `/teams-info`, `/predictions-info` | Info pages | ~160 each | |

Observations:

- **Design system is implicit.** Colour tokens exist in `index.css` (`--bg-surface`, `--gold`) but components hard-code `#0c1628`, `bg-white/[0.07]`, `text-[10px]` hundreds of times. There are 609 text nodes under 11px on the home page alone. Changing the look later means touching every file.
- **Duplicated UI patterns.** The "Official Page / Official Results / Predictions" button cluster is written out four times (desktop and mobile variants in `EventList` and `EventDetail`, again in `PredictionsPage`). Filter bars, empty states, the `Select` wrapper and the stat strips are each re-implemented per page.
- **Data fetching is ad hoc.** Every page owns its own `useEffect` + `useState` triple and re-queries on mount. `EventDetail` calls `getEvents()` and scans the full array to find one event. No caching layer, no suspense, no loading skeletons.
- **No URL state.** Season, distance, gender, search and expanded rows live in component state. A link to "2026 Granfondo Women" cannot exist. Back navigation loses filters.
- **Charts are hand-rolled on Recharts** with custom dots and labels. They look good on desktop but labels collide (see issues doc).
- **Tests:** unit tests cover utilities and a few components; an e2e suite of ~45 Playwright tests exists on this branch (untracked, not yet committed) and checks presence of elements rather than behaviour.

## 4. What is already strong (keep these)

- Dark navy + gold + white palette with film-grain overlay and radial glow. It reads as premium without being gimmicky.
- Barlow Condensed uppercase display type for names and events. Distinctive and legible.
- The **next race hero** with the giant ghost date, countdown pill and distance chips is the best element on the site.
- **Podium cards** with radial-gradient medals and gold/silver/bronze glow.
- Left-border rank accents and rank badges in tables; the top-10 blue tint is a nice touch.
- The **team profile** results section with per-event contributor chips and the coefficient breakdown is genuinely informative.
- Head-to-head comparison is a feature most result sites do not have.
- Predictions per category with "Mainly Minifondo" cross-distance chips is clever and unique.
- Infinite scroll on long tables, nationality flag summary, `TeamLink` abstraction for solo riders.
- Accessibility basics: focus-visible rings, `aria-pressed` on toggles, `role=tablist`.

## 5. Scorecard (out of 10)

| Area | Score | Why |
|------|-------|-----|
| Visual design / brand | 8 | Coherent, premium, distinctive. Loses points for hard-coded tokens and no light theme |
| Typography | 7 | Great display type; body text too small in many places (10px labels, 9px on mobile) |
| Mobile layout | 7 | No horizontal overflow on any route, tables collapse sensibly. Truncated event names, cramped compare cards, bottom-of-thumb navigation is missing |
| Desktop layout | 8 | Good density; wide screens leave the athletes page as a narrow column |
| Performance | 2 | 49 MB before first paint; 273 MB heap; 812 KB JS |
| Functionality / correctness | 5 | Search bug, blank 404, refetch patterns, no URL state |
| Information completeness | 5 | Results, rankings and predictions are excellent. No routes, elevation, start times, registration, weather, photos, location maps |
| Navigation / wayfinding | 6 | Sticky header, back links. No breadcrumbs, no global search, inconsistent back behaviour, mobile submenu labels confusing |
| Engagement features | 4 | Compare and predictions are strong. No favourites, sharing, notifications, PWA, personal dashboard |
| Accessibility | 6 | Focus rings and ARIA present; small text, low-contrast slate-600 on navy, no `h1` on ranking pages, tables lack captions |
| SEO / shareability | 2 | One title for all pages, no meta description, no OG images, no sitemap, client-only rendering behind a 49 MB blob |
| Localisation | 3 | English-only UI for a Portuguese series; dates in three different formats |
| Code health | 6 | Clean workspaces and tests, but heavy duplication and 500-line components |

**Overall: 6/10 today.** The design ceiling is high; the floor is set by load time and missing information.
